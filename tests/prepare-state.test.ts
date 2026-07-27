import assert from 'node:assert/strict';
import test from 'node:test';

import type { ImageRecommendationResult } from '../src/features/customer-flow/imageRecommendation';
import {
  beginRecommendation,
  createImportedPrepareState,
  createPrepareState,
  setModePreference,
  updateRecommendation,
} from '../src/features/customer-flow/prepareState';

function imageRecommendation(
  sourceToken: number,
  recommendation: 'photo' | 'pixelArt',
): ImageRecommendationResult {
  return Object.freeze({
    sourceToken,
    recommendation,
    basis: 'rgbaColorCount',
    reason:
      recommendation === 'photo'
        ? '已自动推荐：自然图片。图片颜色较多。'
        : '已自动推荐：清晰像素。图片颜色较少。',
  });
}

test('new-pattern auto preference resolves a typed recommendation without locking it', () => {
  const recommendation = imageRecommendation(10, 'pixelArt');
  const state = createPrepareState({
    task: 'newPattern',
    preference: 'auto',
    recommendation,
  });

  assert.equal(state.task, 'newPattern');
  assert.strictEqual(state.recommendation, recommendation);
  assert.equal(state.resolvedMode, 'pixelArt');
  assert.equal(state.reason, recommendation.reason);
  assert.equal(state.preference, 'auto');
});

test('an explicit photo preference survives a later recommendation for the same source', () => {
  const initial = createPrepareState({
    task: 'newPattern',
    preference: 'photo',
    recommendation: imageRecommendation(11, 'pixelArt'),
  });

  const next = updateRecommendation(initial, imageRecommendation(11, 'photo'));

  assert.equal(next.resolvedMode, 'photo');
  assert.equal(next.preference, 'photo');
  assert.equal(next.reason, '已手动选择：自然图片。');
  assert.equal(initial.recommendation.recommendation, 'pixelArt');
  assert.notEqual(next, initial);
});

test('manual mode remains reversible back to the automatic recommendation', () => {
  const automatic = createPrepareState({
    task: 'newPattern',
    preference: 'auto',
    recommendation: imageRecommendation(12, 'photo'),
  });

  const explicit = setModePreference(automatic, 'pixelArt');
  const restoredAutomatic = setModePreference(explicit, 'auto');

  assert.equal(explicit.resolvedMode, 'pixelArt');
  assert.equal(explicit.reason, '已手动选择：清晰像素。');
  assert.equal(restoredAutomatic.preference, 'auto');
  assert.equal(restoredAutomatic.resolvedMode, 'photo');
  assert.equal(restoredAutomatic.reason, automatic.recommendation.reason);
});

test('stale recommendation tokens cannot overwrite the current source or manual override', () => {
  const current = setModePreference(
    createPrepareState({
      task: 'newPattern',
      preference: 'auto',
      recommendation: imageRecommendation(22, 'photo'),
    }),
    'pixelArt',
  );

  const afterStaleResult = updateRecommendation(current, imageRecommendation(21, 'photo'));

  assert.strictEqual(afterStaleResult, current);
  assert.equal(afterStaleResult.preference, 'pixelArt');
  assert.equal(afterStaleResult.resolvedMode, 'pixelArt');
  assert.equal(afterStaleResult.recommendation.sourceToken, 22);
});

test('starting a new source rejects the old result and accepts the matching result without losing a manual preference', () => {
  const current = setModePreference(
    createPrepareState({
      task: 'newPattern',
      preference: 'auto',
      recommendation: imageRecommendation(31, 'photo'),
    }),
    'pixelArt',
  );

  const analyzing = beginRecommendation(32, current);

  assert.equal(analyzing.task, 'newPattern');
  assert.equal(analyzing.recommendationStatus, 'analyzing');
  assert.equal(analyzing.sourceToken, 32);
  assert.equal(analyzing.preference, 'pixelArt');
  assert.equal(analyzing.resolvedMode, 'pixelArt');
  assert.equal('recommendation' in analyzing, false);

  const afterOldResult = updateRecommendation(analyzing, imageRecommendation(31, 'photo'));
  assert.strictEqual(afterOldResult, analyzing);

  const ready = updateRecommendation(analyzing, imageRecommendation(32, 'photo'));
  assert.equal(ready.recommendationStatus, 'ready');
  assert.equal(ready.sourceToken, 32);
  assert.equal(ready.preference, 'pixelArt');
  assert.equal(ready.resolvedMode, 'pixelArt');
  assert.equal(ready.recommendation.recommendation, 'photo');
});

test('starting analysis rejects source tokens that cannot identify one current image', () => {
  for (const sourceToken of [-1, 1.5, Number.POSITIVE_INFINITY]) {
    assert.throws(() => beginRecommendation(sourceToken), /图片来源令牌/u);
  }
});

test('mirror state has no irrelevant photo preference or recommendation fields', () => {
  const state = createPrepareState({ task: 'mirrorExistingChart' });

  assert.deepEqual(state, {
    task: 'mirrorExistingChart',
    resolvedMode: 'existingChart',
    reason: '镜像已有图纸会进入网格检测和智能镜像。',
  });
  assert.equal('preference' in state, false);
  assert.equal('recommendation' in state, false);
});

test('an imported project restores its stored mode as an explicit non-automatic choice', () => {
  const photo = createImportedPrepareState('photo');
  const pixelArt = createImportedPrepareState('pixelArt');
  const existingChart = createImportedPrepareState('existingChart');

  assert.equal(photo.task, 'newPattern');
  assert.equal(photo.preference, 'photo');
  assert.equal(photo.resolvedMode, 'photo');
  assert.equal(photo.recommendation.basis, 'storedProject');
  assert.equal(photo.recommendation.sourceToken, null);
  assert.equal(pixelArt.task, 'newPattern');
  assert.equal(pixelArt.preference, 'pixelArt');
  assert.equal(pixelArt.resolvedMode, 'pixelArt');
  assert.equal(pixelArt.recommendation.basis, 'storedProject');
  assert.deepEqual(existingChart, {
    task: 'mirrorExistingChart',
    resolvedMode: 'existingChart',
    reason: '镜像已有图纸会进入网格检测和智能镜像。',
  });
});

test('an imported project honors a manual override and auto restores the saved mode without guessing again', () => {
  const imported = createImportedPrepareState('photo');
  assert.equal(imported.task, 'newPattern');

  const overridden = setModePreference(imported, 'pixelArt');
  assert.equal(overridden.preference, 'pixelArt');
  assert.equal(overridden.resolvedMode, 'pixelArt');
  assert.equal(overridden.reason, '已手动选择：清晰像素。');

  const restored = setModePreference(overridden, 'auto');
  assert.equal(restored.preference, 'auto');
  assert.equal(restored.resolvedMode, 'photo');
  assert.equal(restored.reason, '已按项目保存设置恢复：自然图片。');
});
