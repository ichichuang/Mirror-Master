import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectGrid,
  mirrorGrid,
  MirrorMasterApiError,
  type GridDetectionContract,
  type GridDetectionResult,
} from '../src/features/grid-api/client';

const VALID_V2_RESPONSE = {
  contractVersion: '2.0',
  imageSha256: 'a'.repeat(64),
  naturalWidth: 640,
  naturalHeight: 480,
  selectedCandidateId: 'ring-12x9',
  candidates: [
    {
      candidateId: 'ring-12x9',
      detector: 'component',
      style: 'ring-grid',
      mirrorFrame: 'occupied-bounds',
      sourceQuad: [
        { x: 40, y: 30 },
        { x: 328, y: 30 },
        { x: 328, y: 210 },
        { x: 40, y: 210 },
      ],
      rectifiedWidth: 288,
      rectifiedHeight: 180,
      pitchX: 24,
      pitchY: 20,
      columns: 12,
      rows: 9,
      xBoundaries: [0, 24, 48, 72, 96, 120, 144, 168, 192, 216, 240, 264, 288],
      yBoundaries: [0, 20, 40, 60, 80, 100, 120, 140, 160, 180],
      confidence: 0.86,
      review: 'review',
      metrics: {
        lineCoverage: 0.12,
        latticeInlierRatio: 0.93,
        normalizedResidual: 0.04,
        periodicityScore: 0.91,
        harmonicMargin: 0.34,
        boundarySupport: 0.61,
        cellConsistency: 0.88,
        hypothesisAgreement: 0.79,
      },
      cellSummary: {
        totalCellCount: 108,
        occupiedCellCount: 91,
        colorClusterCount: 14,
        uncertainCellCount: 5,
        matrixDigest: 'b'.repeat(64),
      },
      warnings: ['GRID_BOUNDARY_UNCERTAIN'],
    },
    {
      candidateId: 'projective-13x8',
      detector: 'rectified',
      style: 'line-grid',
      mirrorFrame: 'explicit-grid',
      sourceQuad: [
        { x: 360.5, y: 70.25 },
        { x: 590.75, y: 52 },
        { x: 605.5, y: 302.75 },
        { x: 342.25, y: 320.5 },
      ],
      rectifiedWidth: 137,
      rectifiedHeight: 138,
      pitchX: 10.538461538461538,
      pitchY: 17.25,
      columns: 13,
      rows: 8,
      xBoundaries: [0, 11, 21, 32, 42, 53, 63, 74, 84, 95, 105, 116, 126, 137],
      yBoundaries: [0, 17, 34, 52, 69, 86, 104, 121, 138],
      confidence: 0.77,
      review: 'review',
      metrics: {
        lineCoverage: 0.89,
        latticeInlierRatio: 0.84,
        normalizedResidual: 0.08,
        periodicityScore: 0.74,
        harmonicMargin: 0.28,
        boundarySupport: 0.9,
        cellConsistency: 0.82,
        hypothesisAgreement: 0.73,
      },
      cellSummary: {
        totalCellCount: 104,
        occupiedCellCount: 99,
        colorClusterCount: 11,
        uncertainCellCount: 7,
        matrixDigest: 'c'.repeat(64),
      },
      warnings: ['GRID_PERSPECTIVE_REVIEW_REQUIRED'],
    },
  ],
} as const;

interface FetchObservation {
  init: RequestInit | undefined;
}

async function withJsonFetch<Result>(
  payload: unknown,
  operation: (observation: FetchObservation) => Promise<Result>,
): Promise<Result> {
  const originalFetch = globalThis.fetch;
  const observation: FetchObservation = { init: undefined };
  globalThis.fetch = async (_input, init) => {
    observation.init = init;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    return await operation(observation);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('parses ranked V2 candidates with independent pitches, quad meshes, review, and metrics', async () => {
  await withJsonFetch(VALID_V2_RESPONSE, async () => {
    const result: GridDetectionResult = await detectGrid(
      new File(['chart'], 'chart.png', { type: 'image/png' }),
      'auto',
    );

    assert.deepEqual(result, VALID_V2_RESPONSE);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.candidates), true);
    assert.equal(Object.isFrozen(result.candidates[0]), true);
    assert.equal(Object.isFrozen(result.candidates[0]?.sourceQuad), true);
    assert.equal(Object.isFrozen(result.candidates[0]?.xBoundaries), true);
    assert.equal(Object.isFrozen(result.candidates[0]?.metrics), true);
    assert.equal(Object.isFrozen(result.candidates[0]?.cellSummary), true);
    assert.equal(Object.isFrozen(result.candidates[0]?.warnings), true);
  });
});

test('rejects an unknown grid detection contract version', async () => {
  await withJsonFetch({ ...VALID_V2_RESPONSE, contractVersion: '3.0' }, async () => {
    await assert.rejects(
      detectGrid(new File(['chart'], 'chart.png', { type: 'image/png' }), 'auto'),
      (error: unknown) => {
        assert.ok(error instanceof MirrorMasterApiError);
        assert.equal(error.status, 502);
        assert.equal(error.code, 'GRID_CONTRACT_INVALID');
        assert.equal(
          error.message,
          '识别结果暂时无法使用。请点击“重新识别”，或填写正确的列数和行数。',
        );
        assert.doesNotMatch(error.message, /服务|合同|contract|GRID_/iu);
        return true;
      },
    );
  });
});

test('rejects a legacy detection response without exposing implementation terms', async () => {
  const legacyResponse = {
    imageSha256: 'a'.repeat(64),
    naturalWidth: 1440,
    naturalHeight: 1819,
    left: 118,
    top: 133,
    right: 1324,
    bottom: 1339,
    cellSize: 201,
    columns: 6,
    rows: 6,
    xBoundaries: [118, 319, 520, 721, 922, 1123, 1324],
    yBoundaries: [133, 334, 535, 736, 937, 1138, 1339],
    confidence: 0.3508,
    warning: 'legacy response',
  };

  await withJsonFetch(legacyResponse, async () => {
    await assert.rejects(
      detectGrid(new File(['chart'], 'chart.jpg', { type: 'image/jpeg' }), 'auto'),
      (error: unknown) => {
        assert.ok(error instanceof MirrorMasterApiError);
        assert.equal(error.code, 'GRID_CONTRACT_INVALID');
        assert.doesNotMatch(error.message, /服务|合同|contract|GRID_|502/iu);
        assert.match(error.message, /重新识别|列数|行数/u);
        return true;
      },
    );
  });
});

test('maps a technical detection failure to actionable customer copy', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          code: 'GRID_CONTRACT_INVALID',
          message: '服务返回的网格合同无效。',
        },
      }),
      {
        status: 422,
        headers: { 'content-type': 'application/json' },
      },
    );

  try {
    await assert.rejects(
      detectGrid(new File(['chart'], 'chart.jpg', { type: 'image/jpeg' }), 'auto'),
      (error: unknown) => {
        assert.ok(error instanceof MirrorMasterApiError);
        assert.equal(error.code, 'GRID_CONTRACT_INVALID');
        assert.equal(error.message, '当前识别结果已失效，请重新识别后再试。');
        assert.doesNotMatch(error.message, /服务|合同|contract|GRID_|422/iu);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects a V2 candidate whose source quad does not contain four ordered points', async () => {
  const malformed = {
    ...VALID_V2_RESPONSE,
    candidates: [
      {
        ...VALID_V2_RESPONSE.candidates[0],
        sourceQuad: [
          { x: 40, y: 30 },
          { x: 328, y: 30 },
          { x: 328, y: 210 },
        ],
      },
    ],
  };

  await withJsonFetch(malformed, async () => {
    await assert.rejects(
      detectGrid(new File(['chart'], 'chart.png', { type: 'image/png' }), 'auto'),
      (error: unknown) =>
        error instanceof MirrorMasterApiError && error.code === 'GRID_CONTRACT_INVALID',
    );
  });
});

test('rejects a V2 candidate whose rectified mesh does not match its dimensions', async () => {
  const malformed = {
    ...VALID_V2_RESPONSE,
    candidates: [
      {
        ...VALID_V2_RESPONSE.candidates[0],
        xBoundaries: [0, 24, 48, 72],
      },
    ],
  };

  await withJsonFetch(malformed, async () => {
    await assert.rejects(
      detectGrid(new File(['chart'], 'chart.png', { type: 'image/png' }), 'auto'),
      (error: unknown) =>
        error instanceof MirrorMasterApiError && error.code === 'GRID_CONTRACT_INVALID',
    );
  });
});

test('mirror requests serialize only the backend-authoritative V2 contract fields', async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    requestInit = init;
    return new Response(new Blob(['png'], { type: 'image/png' }), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    });
  };

  const contractWithDisplayFields = {
    contractVersion: '2.0',
    imageSha256: 'a'.repeat(64),
    naturalWidth: 640,
    naturalHeight: 480,
    candidateId: 'ring-12x9',
    mirrorFrame: 'occupied-bounds',
    sourceQuad: [
      { x: 40, y: 30 },
      { x: 328, y: 30 },
      { x: 328, y: 210 },
      { x: 40, y: 210 },
    ],
    rectifiedWidth: 288,
    rectifiedHeight: 180,
    pitchX: 24,
    pitchY: 20,
    columns: 12,
    rows: 9,
    xBoundaries: [0, 24, 48, 72, 96, 120, 144, 168, 192, 216, 240, 264, 288],
    yBoundaries: [0, 20, 40, 60, 80, 100, 120, 140, 160, 180],
    cellSummary: {
      totalCellCount: 108,
      occupiedCellCount: 91,
      colorClusterCount: 14,
      uncertainCellCount: 5,
      matrixDigest: 'b'.repeat(64),
    },
    detector: 'component',
    style: 'ring-grid',
    confidence: 0.86,
    review: 'review',
    metrics: VALID_V2_RESPONSE.candidates[0].metrics,
    warnings: ['GRID_BOUNDARY_UNCERTAIN'],
    displayOnlyLabel: '候选 1 / 2',
  };

  try {
    await mirrorGrid(
      new File(['chart'], 'chart.png', { type: 'image/png' }),
      contractWithDisplayFields as unknown as GridDetectionContract,
      'vertical',
      controller.signal,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestInit?.signal, controller.signal);
  assert.ok(requestInit?.body instanceof FormData);
  const serialized = requestInit.body.get('contract');
  assert.equal(typeof serialized, 'string');
  assert.deepEqual(JSON.parse(serialized), {
    contractVersion: '2.0',
    imageSha256: 'a'.repeat(64),
    naturalWidth: 640,
    naturalHeight: 480,
    candidateId: 'ring-12x9',
    sourceQuad: [
      { x: 40, y: 30 },
      { x: 328, y: 30 },
      { x: 328, y: 210 },
      { x: 40, y: 210 },
    ],
    rectifiedWidth: 288,
    rectifiedHeight: 180,
    pitchX: 24,
    pitchY: 20,
    columns: 12,
    rows: 9,
    xBoundaries: [0, 24, 48, 72, 96, 120, 144, 168, 192, 216, 240, 264, 288],
    yBoundaries: [0, 20, 40, 60, 80, 100, 120, 140, 160, 180],
    matrixDigest: 'b'.repeat(64),
    confirmed: true,
    axis: 'vertical',
  });
});

test('detect requests forward the caller AbortSignal to fetch', async () => {
  const controller = new AbortController();

  await withJsonFetch(VALID_V2_RESPONSE, async (observation) => {
    await detectGrid(
      new File(['chart'], 'chart.png', { type: 'image/png' }),
      'auto',
      undefined,
      controller.signal,
    ).catch(() => undefined);

    assert.equal(observation.init?.signal, controller.signal);
  });
});

test('invalid mirror image responses use plain customer language', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ result: 'not an image' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  try {
    await assert.rejects(
      mirrorGrid(new File(['chart'], 'chart.png', { type: 'image/png' }), {
        contractVersion: '2.0',
        imageSha256: 'a'.repeat(64),
        naturalWidth: 640,
        naturalHeight: 480,
        ...VALID_V2_RESPONSE.candidates[0],
      }),
      (error: unknown) => {
        assert.ok(error instanceof MirrorMasterApiError);
        assert.equal(error.code, 'RESULT_NOT_PNG');
        assert.equal(error.message, '镜像结果无法打开，请重试。');
        assert.doesNotMatch(error.message, /服务|合同|contract|GRID_|502/iu);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
