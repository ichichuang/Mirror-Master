import assert from 'node:assert/strict';
import test from 'node:test';

import { captureProjectRevision, exportProjectJson } from '../src/domain/export';
import { calculatePhysicalLayout, parseBeadProject } from '../src/domain/project';
import { PALETTE_SOURCE_VERSION } from '../src/generated/palettes';

function projectFixture(): Record<string, unknown> {
  return {
    schemaVersion: '1.0',
    id: 'project-contract-0001',
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    mode: 'photo',
    source: {
      fileName: 'sample.png',
      mimeType: 'image/png',
      naturalWidth: 48,
      naturalHeight: 48,
      sha256: '0'.repeat(64),
      crop: { x: 0, y: 0, width: 48, height: 48 },
      rotation: 0,
    },
    grid: {
      rows: 48,
      columns: 48,
      aspectLocked: true,
      beadDiameterMm: 5,
      beadPitchMm: 5,
      boardPresetId: 'custom',
      boardRows: 16,
      boardColumns: 16,
    },
    palette: {
      paletteId: 'default',
      paletteVersion: PALETTE_SOURCE_VERSION,
      availableColorIds: ['default:A01', 'default:A06'],
      maximumColors: 2,
    },
    generation: {
      sampling: 'nearest',
      colorDistance: 'ciede2000',
      dithering: 'none',
      alphaEmptyThreshold: 0,
    },
    cells: Array.from({ length: 48 }, (_, row) =>
      Array.from({ length: 48 }, (_, column) =>
        row === 0 && column === 0 ? { kind: 'bead', colorId: 'default:A01' } : { kind: 'empty' },
      ),
    ),
    revision: 3,
  };
}

test('custom board dimensions drive physical board layout and survive JSON round-trip', () => {
  const project = parseBeadProject(projectFixture());
  const layout = calculatePhysicalLayout(project);

  assert.equal(layout.boardColumns, 3);
  assert.equal(layout.boardRows, 3);
  assert.equal(layout.boardCount, 9);
  assert.deepEqual(parseBeadProject(JSON.parse(exportProjectJson(project))), project);
});

test('strict project parsing rejects palette and matrix contract violations', () => {
  const cases: Array<readonly [string, (fixture: Record<string, unknown>) => void]> = [
    [
      '重复可用颜色',
      (fixture) => {
        const palette = fixture.palette as Record<string, unknown>;
        palette.availableColorIds = ['default:A01', 'default:A01'];
      },
    ],
    [
      '跨色板可用颜色',
      (fixture) => {
        const palette = fixture.palette as Record<string, unknown>;
        palette.availableColorIds = ['mard:A1'];
        palette.maximumColors = 1;
      },
    ],
    [
      '最多颜色超过可用颜色',
      (fixture) => {
        const palette = fixture.palette as Record<string, unknown>;
        palette.maximumColors = 3;
      },
    ],
    [
      '矩阵颜色不在可用颜色中',
      (fixture) => {
        const cells = fixture.cells as Array<Array<Record<string, unknown>>>;
        cells[0]![0] = { kind: 'bead', colorId: 'default:B01' };
      },
    ],
    [
      '固定拼板尺寸被篡改',
      (fixture) => {
        const grid = fixture.grid as Record<string, unknown>;
        grid.boardPresetId = 'standardSquare';
        grid.boardRows = 16;
        grid.boardColumns = 16;
      },
    ],
  ];

  for (const [name, mutate] of cases) {
    const fixture = projectFixture();
    mutate(fixture);
    assert.throws(() => parseBeadProject(fixture), undefined, name);
  }
});

test('strict project parsing rejects unknown fields instead of silently trusting JSON', () => {
  const topLevel = projectFixture();
  topLevel.untrusted = true;
  assert.throws(() => parseBeadProject(topLevel));

  const nested = projectFixture();
  const source = nested.source as Record<string, unknown>;
  source.untrusted = true;
  assert.throws(() => parseBeadProject(nested));
});

test('export capture deep-freezes one immutable project revision', () => {
  const mutable = projectFixture();
  const snapshot = captureProjectRevision(mutable);
  const cells = mutable.cells as Array<Array<Record<string, unknown>>>;
  cells[0]![0] = { kind: 'empty' };
  (mutable.grid as Record<string, unknown>).rows = 1;

  assert.equal(snapshot.revision, 3);
  assert.equal(snapshot.grid.rows, 48);
  assert.deepEqual(snapshot.cells[0]![0], { kind: 'bead', colorId: 'default:A01' });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.cells), true);
  assert.equal(Object.isFrozen(snapshot.cells[0]), true);
  assert.equal(Object.isFrozen(snapshot.cells[0]![0]), true);
});
