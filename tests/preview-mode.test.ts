import assert from 'node:assert/strict';
import test from 'node:test';

import * as previewModeModule from '../src/features/preview-workspace/previewMode';

const { DEFAULT_PREVIEW_RENDER_MODE, PREVIEW_RENDER_MODES, parsePreviewRenderMode } =
  previewModeModule;

test('preview modes expose the five customer-facing render choices in stable order', () => {
  assert.deepEqual(
    PREVIEW_RENDER_MODES.map(({ id, label }) => [id, label]),
    [
      ['pure', '纯图案'],
      ['annotated', '带标注'],
      ['numbered', '色号图纸'],
      ['rounded', '圆角方格'],
      ['ring', '圆环豆粒'],
    ],
  );
  assert.equal(DEFAULT_PREVIEW_RENDER_MODE, 'ring');
  assert.deepEqual(
    PREVIEW_RENDER_MODES.map(({ id, exportTemplate }) => [id, exportTemplate]),
    [
      ['pure', 'pure'],
      ['annotated', 'annotated'],
      ['numbered', 'numbered'],
      ['rounded', 'rounded'],
      ['ring', 'ring'],
    ],
  );
});

test('preview mode parser falls back to the ring preview without accepting arbitrary values', () => {
  assert.equal(parsePreviewRenderMode('pure'), 'pure');
  assert.equal(parsePreviewRenderMode('numbered'), 'numbered');
  assert.equal(parsePreviewRenderMode('unexpected'), 'ring');
  assert.equal(parsePreviewRenderMode(null), 'ring');
});

test('preview mode selection always reveals the pattern and announces the resolved choice', () => {
  const createPreviewModeSelection = (
    previewModeModule as typeof previewModeModule & {
      createPreviewModeSelection?: (value: unknown) => unknown;
    }
  ).createPreviewModeSelection;
  assert.equal(typeof createPreviewModeSelection, 'function');
  if (!createPreviewModeSelection) return;
  assert.deepEqual(createPreviewModeSelection('numbered'), {
    mode: 'numbered',
    compareView: 'pattern',
    announcement: '已切换为色号图纸预览。',
  });
  assert.deepEqual(createPreviewModeSelection('unexpected'), {
    mode: 'ring',
    compareView: 'pattern',
    announcement: '已切换为圆环豆粒预览。',
  });
});
