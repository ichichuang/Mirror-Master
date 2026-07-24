import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_PROJECT_JSON_BYTES,
  ProjectImportError,
  parseProjectJsonText,
} from '../src/features/project-import/projectImport';
import { PALETTE_SOURCE_VERSION } from '../src/generated/palettes';

function projectJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: '1.0',
    id: 'project-import-0001',
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    mode: 'pixelArt',
    source: {
      fileName: 'pixel.png',
      mimeType: 'image/png',
      naturalWidth: 1,
      naturalHeight: 1,
      sha256: '1'.repeat(64),
      crop: { x: 0, y: 0, width: 1, height: 1 },
      rotation: 0,
    },
    grid: {
      rows: 1,
      columns: 1,
      aspectLocked: true,
      beadDiameterMm: 5,
      beadPitchMm: 5,
      boardPresetId: 'custom',
      boardRows: 1,
      boardColumns: 1,
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
    cells: [[{ kind: 'bead', colorId: 'default:A01' }]],
    revision: 4,
    ...overrides,
  });
}

test('valid project JSON resumes the exact editable revision', () => {
  const project = parseProjectJsonText(projectJson());

  assert.equal(project.id, 'project-import-0001');
  assert.equal(project.revision, 4);
  assert.deepEqual(project.cells, [[{ kind: 'bead', colorId: 'default:A01' }]]);
});

test('project JSON import reports stable syntax, version, schema, and size errors', () => {
  const cases: Array<readonly [string, string, string]> = [
    ['syntax', '{"schemaVersion":', 'PROJECT_JSON_INVALID'],
    ['version', projectJson({ schemaVersion: '9.9' }), 'PROJECT_VERSION_UNSUPPORTED'],
    [
      'schema',
      projectJson({
        palette: {
          paletteId: 'default',
          paletteVersion: PALETTE_SOURCE_VERSION,
          availableColorIds: ['mard:A1'],
          maximumColors: 1,
        },
      }),
      'PROJECT_SCHEMA_INVALID',
    ],
    ['size', ' '.repeat(MAX_PROJECT_JSON_BYTES + 1), 'PROJECT_FILE_TOO_LARGE'],
  ];

  for (const [name, input, code] of cases) {
    assert.throws(
      () => parseProjectJsonText(input),
      (error: unknown) => error instanceof ProjectImportError && error.code === code,
      name,
    );
  }
});
