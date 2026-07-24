import assert from 'node:assert/strict';
import test from 'node:test';

import { exportProjectCsv, exportProjectJson } from '../src/domain/export';
import { MatrixHistory } from '../src/domain/history';
import {
  assertValidProject,
  calculatePhysicalLayout,
  calculateStatistics,
  mirrorCells,
  parseBeadProject,
  replaceCell,
  type BeadProject,
} from '../src/domain/project';
import { PALETTE_SOURCE_VERSION } from '../src/generated/palettes';

function createProject(): BeadProject {
  return {
    schemaVersion: '1.0',
    id: 'project-test-0001',
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    mode: 'photo',
    source: {
      fileName: 'sample.png',
      mimeType: 'image/png',
      naturalWidth: 2,
      naturalHeight: 2,
      sha256: '0'.repeat(64),
      crop: { x: 0, y: 0, width: 2, height: 2 },
      rotation: 0,
    },
    grid: {
      rows: 2,
      columns: 3,
      aspectLocked: true,
      beadDiameterMm: 5,
      beadPitchMm: 5,
      boardPresetId: 'standardSquare',
    },
    palette: {
      paletteId: 'default',
      paletteVersion: PALETTE_SOURCE_VERSION,
      availableColorIds: ['default:A01', 'default:A06', 'default:B01'],
      maximumColors: 3,
    },
    generation: {
      sampling: 'nearest',
      colorDistance: 'ciede2000',
      dithering: 'none',
      alphaEmptyThreshold: 0.1,
    },
    cells: [
      [
        { kind: 'bead', colorId: 'default:A01' },
        { kind: 'empty' },
        { kind: 'bead', colorId: 'default:A06' },
      ],
      [
        { kind: 'bead', colorId: 'default:B01' },
        { kind: 'bead', colorId: 'default:B01' },
        { kind: 'empty' },
      ],
    ],
    revision: 0,
  };
}

test('project schema validates matrix dimensions and known color IDs', () => {
  const project = createProject();

  assert.doesNotThrow(() => assertValidProject(project));
  assert.equal(parseBeadProject(project), project);
  assert.throws(
    () =>
      parseBeadProject({
        ...project,
        cells: [[{ kind: 'bead', colorId: 'unknown:A1' }]],
      }),
    /矩阵尺寸|无效颜色/u,
  );
});

test('statistics and physical dimensions obey product invariants', () => {
  const project = createProject();
  const statistics = calculateStatistics(project.cells);
  const layout = calculatePhysicalLayout(project);

  assert.equal(statistics.nonEmptyBeadCount, 4);
  assert.equal(statistics.blankCount, 2);
  assert.equal(
    Object.values(statistics.perColorCounts).reduce((sum, count) => sum + count, 0),
    statistics.nonEmptyBeadCount,
  );
  assert.equal(layout.widthMm, 15);
  assert.equal(layout.heightMm, 10);
  assert.equal(layout.boardCount, 1);
});

test('two identical horizontal or vertical mirrors restore the original matrix', () => {
  const original = createProject().cells;

  assert.deepEqual(mirrorCells(mirrorCells(original, 'horizontal'), 'horizontal'), original);
  assert.deepEqual(mirrorCells(mirrorCells(original, 'vertical'), 'vertical'), original);
});

test('history restores edits through undo and redo', () => {
  const original = createProject().cells;
  const edited = replaceCell(original, 0, 1, {
    kind: 'bead',
    colorId: 'default:B01',
  });
  const history = new MatrixHistory(original, 100, 7);

  const committed = history.commit(edited);
  assert.equal(committed.canUndo, true);
  assert.equal(committed.revision, 8);
  const undone = history.undo();
  assert.deepEqual(undone.cells, original);
  assert.equal(undone.revision, 7);
  const redone = history.redo();
  assert.deepEqual(redone.cells, edited);
  assert.equal(redone.revision, 8);
});

test('CSV and project JSON exports reference the same matrix and material count', () => {
  const project = createProject();
  const statistics = calculateStatistics(project.cells);
  const json = JSON.parse(exportProjectJson(project)) as BeadProject;
  const csv = exportProjectCsv(project);

  assert.deepEqual(json.cells, project.cells);
  assert.match(csv, new RegExp(`拼豆总数,${String(statistics.nonEmptyBeadCount)}`, 'u'));
  for (const [colorId, count] of Object.entries(statistics.perColorCounts)) {
    assert.match(csv, new RegExp(`${colorId}[^\\r\\n]*,${String(count)}`, 'u'));
  }
});
