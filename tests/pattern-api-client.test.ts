import assert from 'node:assert/strict';
import test from 'node:test';

import type { BeadProject } from '../src/domain/project';
import { exportPattern } from '../src/features/pattern-api/client';
import { PALETTE_SOURCE_VERSION } from '../src/generated/palettes';

function projectFixture(): BeadProject {
  return {
    schemaVersion: '1.0',
    id: 'project-api-client-0001',
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    mode: 'photo',
    source: {
      fileName: 'sample.png',
      mimeType: 'image/png',
      naturalWidth: 1,
      naturalHeight: 1,
      sha256: '2'.repeat(64),
      crop: { x: 0, y: 0, width: 1, height: 1 },
      rotation: 0,
    },
    grid: {
      rows: 1,
      columns: 1,
      aspectLocked: true,
      beadDiameterMm: 5,
      beadPitchMm: 5,
      boardPresetId: 'standardSquare',
      boardRows: 29,
      boardColumns: 29,
    },
    palette: {
      paletteId: 'default',
      paletteVersion: PALETTE_SOURCE_VERSION,
      availableColorIds: ['default:A01'],
      maximumColors: 1,
    },
    generation: {
      sampling: 'nearest',
      colorDistance: 'ciede2000',
      dithering: 'none',
      alphaEmptyThreshold: 0,
    },
    cells: [[{ kind: 'empty' }]],
    revision: 6,
  };
}

test('pattern export sends an explicit pure or annotated template with the captured revision', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: unknown;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(new Blob(['ok']), {
      status: 200,
      headers: { 'X-Project-Revision': '6' },
    });
  };

  try {
    await exportPattern(projectFixture(), 'png', 'pure');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestBody, {
    project: projectFixture(),
    format: 'png',
    template: 'pure',
  });
});

test('pattern export rejects a response from a different matrix revision', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(new Blob(['stale']), {
      status: 200,
      headers: { 'X-Project-Revision': '5' },
    });

  try {
    await assert.rejects(
      exportPattern(projectFixture(), 'png', 'annotated'),
      (error: unknown) =>
        error instanceof Error &&
        error.message === '图纸已更新，请重新导出' &&
        'code' in error &&
        error.code === 'EXPORT_REVISION_MISMATCH',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
