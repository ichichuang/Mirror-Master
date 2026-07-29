import assert from 'node:assert/strict';
import test from 'node:test';

import type { GridDetectionContract } from '../src/features/grid-api/client';
import {
  createGridDimensionContract,
  createGridDimensionRectangle,
  resolveGridConfirmation,
} from '../src/features/grid-editor/confirmationState';

function contract(warning: string | null = null): GridDetectionContract {
  return {
    imageSha256: '0'.repeat(64),
    naturalWidth: 500,
    naturalHeight: 500,
    left: 20,
    top: 30,
    right: 420,
    bottom: 450,
    cellSize: 20,
    columns: 20,
    rows: 21,
    xBoundaries: Array.from({ length: 21 }, (_, index) => 20 + index * 20),
    yBoundaries: Array.from({ length: 22 }, (_, index) => 30 + index * 20),
    confidence: warning ? 0.62 : 0.94,
    warning,
  };
}

test('a clean contract is high confidence and submit-ready', () => {
  assert.deepEqual(resolveGridConfirmation(contract(), false), {
    level: 'high',
    dimensions: '检测到 20 列 × 21 行',
    confidenceLabel: '网格置信度：高',
    warning: null,
    canSubmit: true,
    requiresWarningAcknowledgement: false,
  });
});

test('a warning requires one explicit acknowledgement', () => {
  const warningContract = contract('识别置信度较低，请调整选区后复核。');
  const pending = resolveGridConfirmation(warningContract, false);
  const accepted = resolveGridConfirmation(warningContract, true);

  assert.equal(pending.level, 'review');
  assert.equal(pending.confidenceLabel, '网格置信度：需要确认');
  assert.equal(pending.canSubmit, false);
  assert.equal(pending.requiresWarningAcknowledgement, true);
  assert.equal(accepted.canSubmit, true);
  assert.equal(accepted.requiresWarningAcknowledgement, false);
});

test('no valid contract is insufficient and cannot submit', () => {
  assert.deepEqual(resolveGridConfirmation(null, false), {
    level: 'insufficient',
    dimensions: '尚未检测到有效网格',
    confidenceLabel: '网格置信度：不足',
    warning: null,
    canSubmit: false,
    requiresWarningAcknowledgement: false,
  });
});

test('row and column changes produce one in-bounds manual-detection rectangle', () => {
  assert.deepEqual(createGridDimensionRectangle(contract(), 22, 23), {
    left: 20,
    top: 30,
    right: 460,
    bottom: 490,
  });
  assert.deepEqual(createGridDimensionRectangle(contract(), 24, 24), {
    left: 20,
    top: 20,
    right: 500,
    bottom: 500,
  });
  assert.equal(createGridDimensionRectangle(contract(), 26, 20), null);
  assert.equal(createGridDimensionRectangle(contract(), 20, 0), null);
});

test('manual row and column changes produce the exact confirmed grid contract', () => {
  const adjusted = createGridDimensionContract(contract(), 24, 24);

  assert.ok(adjusted);
  assert.equal(adjusted.columns, 24);
  assert.equal(adjusted.rows, 24);
  assert.equal(adjusted.left, 20);
  assert.equal(adjusted.top, 20);
  assert.equal(adjusted.right, 500);
  assert.equal(adjusted.bottom, 500);
  assert.deepEqual(
    adjusted.xBoundaries,
    Array.from({ length: 25 }, (_, index) => 20 + index * 20),
  );
  assert.deepEqual(
    adjusted.yBoundaries,
    Array.from({ length: 25 }, (_, index) => 20 + index * 20),
  );
  assert.match(adjusted.warning ?? '', /手动设置/u);
  assert.equal(createGridDimensionContract(contract(), 26, 20), null);
});
