import assert from 'node:assert/strict';
import test from 'node:test';

import type { GridDetectionContract } from '../src/features/grid-api/client';
import {
  createGridDimensionConstraints,
  resolveGridConfirmation,
} from '../src/features/grid-editor/confirmationState';

function contract(review: 'ready' | 'review' = 'ready'): GridDetectionContract {
  const warnings = review === 'review' ? ['GRID_BOUNDARY_UNCERTAIN'] : [];
  return {
    contractVersion: '2.0',
    imageSha256: '0'.repeat(64),
    naturalWidth: 500,
    naturalHeight: 500,
    candidateId: 'component-1234567890abcdef',
    detector: 'component',
    style: 'ring-grid',
    mirrorFrame: review === 'review' ? 'occupied-bounds' : 'explicit-grid',
    sourceQuad: [
      { x: 20, y: 30 },
      { x: 420, y: 30 },
      { x: 420, y: 450 },
      { x: 20, y: 450 },
    ],
    rectifiedWidth: 400,
    rectifiedHeight: 420,
    pitchX: 20,
    pitchY: 20,
    columns: 20,
    rows: 21,
    xBoundaries: Array.from({ length: 21 }, (_, index) => index * 20),
    yBoundaries: Array.from({ length: 22 }, (_, index) => index * 20),
    confidence: review === 'review' ? 0.62 : 0.94,
    review,
    metrics: {
      lineCoverage: 0.9,
      latticeInlierRatio: 0.9,
      normalizedResidual: 0.04,
      periodicityScore: 0.9,
      harmonicMargin: 0.7,
      boundarySupport: 0.9,
      cellConsistency: 0.9,
      hypothesisAgreement: 0.9,
    },
    cellSummary: {
      totalCellCount: 420,
      occupiedCellCount: 390,
      colorClusterCount: 14,
      uncertainCellCount: 3,
      matrixDigest: 'a'.repeat(64),
    },
    warnings,
  };
}

test('a backend-ready candidate is high confidence and submit-ready', () => {
  assert.deepEqual(resolveGridConfirmation(contract(), null), {
    level: 'high',
    dimensions: '检测到 20 列 × 21 行',
    confidenceLabel: '识别状态：可直接镜像（94%）',
    warning: null,
    canSubmit: true,
    requiresWarningAcknowledgement: false,
  });
});

test('a review candidate requires acknowledgement bound to its candidate id', () => {
  const reviewContract = contract('review');
  const pending = resolveGridConfirmation(reviewContract, null);
  const wrongCandidate = resolveGridConfirmation(reviewContract, 'component-other');
  const accepted = resolveGridConfirmation(reviewContract, reviewContract.candidateId);

  assert.equal(pending.level, 'review');
  assert.equal(pending.confidenceLabel, '识别状态：请核对（62%）');
  assert.match(pending.warning ?? '', /外边界/u);
  assert.equal(pending.canSubmit, false);
  assert.equal(wrongCandidate.canSubmit, false);
  assert.equal(accepted.canSubmit, true);
  assert.equal(accepted.requiresWarningAcknowledgement, false);
});

test('no valid contract is insufficient and cannot submit', () => {
  assert.deepEqual(resolveGridConfirmation(null, null), {
    level: 'insufficient',
    dimensions: '暂时没有识别出完整网格',
    confidenceLabel: '识别状态：未完成',
    warning: null,
    canSubmit: false,
    requiresWarningAcknowledgement: false,
  });
});

test('row and column changes create backend constraints instead of a fabricated contract', () => {
  const source = contract();
  assert.deepEqual(createGridDimensionConstraints(source, 24, 23), {
    quad: source.sourceQuad,
    expectedColumns: 24,
    expectedRows: 23,
  });
  assert.equal(createGridDimensionConstraints(source, 301, 20), null);
  assert.equal(createGridDimensionConstraints(source, 20, 0), null);
});

test('unknown warning codes never appear in customer copy', () => {
  const source = {
    ...contract('review'),
    warnings: ['GRID_FUTURE_INTERNAL_DETAIL'],
  };

  const state = resolveGridConfirmation(source, null);

  assert.equal(state.warning, '还有一项识别结果需要复核，请检查网格范围和行列数。');
  assert.doesNotMatch(state.warning ?? '', /GRID_|服务|合同|contract/iu);
});
