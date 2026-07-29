import assert from 'node:assert/strict';
import test from 'node:test';

import { type BeadCell, type BeadProject } from '../src/domain/project';
import {
  computePreviewCanvasLayout,
  computePreviewFrameSize,
  previewGuideWeight,
  resolvePreviewCellLabel,
} from '../src/features/preview-workspace/previewRenderer';
import {
  formatPreviewDoneStatus,
  formatPreviewSummary,
} from '../src/features/preview-workspace/previewSummary';

function summaryFixtureProject(): BeadProject {
  const colorIds = Array.from({ length: 18 }, (_, index) => `mard:C${String(index + 1)}`);
  const cells: BeadCell[][] = Array.from({ length: 63 }, (_, row) =>
    Array.from({ length: 48 }, (_, column) => ({
      kind: 'bead' as const,
      colorId: colorIds[(row + column) % colorIds.length] ?? 'mard:C1',
    })),
  );
  return {
    schemaVersion: '1.0',
    id: 'preview-summary-fixture',
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
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
      rows: 63,
      columns: 48,
      aspectLocked: true,
      beadDiameterMm: 5,
      beadPitchMm: 5,
      boardPresetId: 'standardSquare',
      boardRows: 29,
      boardColumns: 29,
    },
    palette: {
      paletteId: 'mard',
      paletteVersion: '2026-07-24',
      availableColorIds: colorIds,
      maximumColors: 24,
    },
    generation: {
      sampling: 'average',
      colorDistance: 'ciede2000',
      dithering: 'none',
      alphaEmptyThreshold: 0.1,
    },
    cells,
    revision: 1,
  };
}

test('preview summary derives every figure from the authoritative matrix and layout', () => {
  const project = summaryFixtureProject();
  assert.equal(
    formatPreviewSummary(project),
    '48 × 63 颗 · 18 色 · 约 24 × 31.5 cm · 6 块拼板 · 共 3,024 颗',
  );
});

test('preview summary formats fractional centimeters and thousands in customer language', () => {
  const project = summaryFixtureProject();
  project.grid.beadDiameterMm = 2.6;
  project.grid.beadPitchMm = 2.6;
  assert.equal(
    formatPreviewSummary(project),
    '48 × 63 颗 · 18 色 · 约 12.5 × 16.4 cm · 6 块拼板 · 共 3,024 颗',
  );
  assert.doesNotMatch(formatPreviewSummary(project), /revision|schema|alpha/iu);
});

test('preview done status uses the fixed customer text', () => {
  assert.equal(formatPreviewDoneStatus(48, 63, 18), '已更新：48 × 63 颗，18 色');
});

test('preview canvas layout fits an integer cell grid into the container and centers it', () => {
  assert.deepEqual(computePreviewCanvasLayout(200, 100, 48, 24), {
    cellSize: 4,
    originX: 4,
    originY: 2,
    gridWidth: 192,
    gridHeight: 96,
    canvasWidth: 200,
    canvasHeight: 100,
  });
  const tight = computePreviewCanvasLayout(10, 10, 300, 300);
  assert.equal(tight.cellSize, 1);
  assert.equal(tight.gridWidth, 300);
  assert.throws(() => computePreviewCanvasLayout(0, 100, 48, 24), /容器尺寸/u);
  assert.throws(() => computePreviewCanvasLayout(100, 100, 0, 24), /行列/u);
});

test('preview frame preserves the project aspect ratio inside portrait and landscape slots', () => {
  assert.deepEqual(computePreviewFrameSize(674, 900, 48, 31), {
    width: 674,
    height: 435,
  });
  assert.deepEqual(computePreviewFrameSize(900, 320, 48, 31), {
    width: 495,
    height: 320,
  });
  assert.deepEqual(computePreviewFrameSize(420, 700, 31, 48), {
    width: 420,
    height: 650,
  });
  assert.throws(() => computePreviewFrameSize(0, 100, 48, 31), /容器尺寸/u);
});

test('numbered preview only exposes a concise color code when the cell can hold it', () => {
  assert.equal(resolvePreviewCellLabel('MARD A14', 18, 'numbered'), 'A14');
  assert.equal(resolvePreviewCellLabel('MARD A14', 13, 'numbered'), 'A14');
  assert.equal(resolvePreviewCellLabel('mard:A14', 18, 'numbered'), 'A14');
  assert.equal(resolvePreviewCellLabel('MARD A14', 7, 'numbered'), null);
  assert.equal(resolvePreviewCellLabel('MARD A14', 18, 'pure'), null);
});

test('annotated and numbered previews use stronger five and ten cell guides', () => {
  assert.equal(previewGuideWeight(10, 'annotated'), 3);
  assert.equal(previewGuideWeight(5, 'annotated'), 2);
  assert.equal(previewGuideWeight(3, 'annotated'), 1);
  assert.equal(previewGuideWeight(10, 'numbered'), 3);
  assert.equal(previewGuideWeight(3, 'pure'), 0);
});
