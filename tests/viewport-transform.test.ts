import assert from 'node:assert/strict';
import test from 'node:test';

import {
  actualViewport,
  fitViewport,
  getVisibleCellRange,
  panViewport,
  pinchViewport,
  screenToCell,
  zoomViewportAt,
  type GridDimensions,
  type ViewportBounds,
  type ViewportConfig,
} from '../src/features/pattern-editor/viewport';

const viewport: ViewportBounds = { width: 400, height: 300 };
const grid: GridDimensions = { rows: 50, columns: 100 };
const config: ViewportConfig = {
  padding: 20,
  minScale: 0.25,
  maxScale: 64,
  actualCellSize: 16,
};

test('fit and 100% use distinct, deterministic scales', () => {
  const fitted = fitViewport(viewport, grid, config);
  const actual = actualViewport(viewport, grid, config);

  assert.deepEqual(fitted, { scale: 3.6, offsetX: 20, offsetY: 60 });
  assert.equal(actual.scale, 16);
  assert.notEqual(actual.scale, fitted.scale);
});

test('zooming at a centroid preserves the content coordinate under it', () => {
  const fitted = fitViewport(viewport, grid, config);
  const centroid = { x: 200, y: 150 };
  const before = screenToCell(centroid, fitted, grid);
  const zoomed = zoomViewportAt(fitted, fitted.scale * 2, centroid, viewport, grid, config);
  const after = screenToCell(centroid, zoomed, grid);

  assert.deepEqual(before, { row: 25, column: 50 });
  assert.deepEqual(after, before);
  assert.deepEqual(zoomed, { scale: 7.2, offsetX: -160, offsetY: -30 });
});

test('pinch zoom and centroid translation clamp only after their combined transform', () => {
  const transformed = pinchViewport(
    { scale: 8, offsetX: 20, offsetY: 20 },
    4,
    { x: 100, y: 100 },
    { x: 60, y: 100 },
    viewport,
    grid,
    config,
  );

  assert.deepEqual(transformed, { scale: 4, offsetX: 20, offsetY: 50 });
});

test('bounded panning exposes every edge without allowing the grid to disappear', () => {
  const transform = { scale: 8, offsetX: -200, offsetY: -50 };
  const positive = panViewport(transform, 10_000, 10_000, viewport, grid, config);
  const negative = panViewport(transform, -10_000, -10_000, viewport, grid, config);

  assert.deepEqual(positive, { scale: 8, offsetX: 20, offsetY: 20 });
  assert.deepEqual(negative, { scale: 8, offsetX: -420, offsetY: -120 });
});

test('visible ranges and hit testing honor pan, bounds, and reverse view', () => {
  const smallViewport = { width: 100, height: 80 };
  const squareGrid = { rows: 20, columns: 20 };
  const transform = { scale: 10, offsetX: -50, offsetY: -20 };

  assert.deepEqual(getVisibleCellRange(transform, smallViewport, squareGrid), {
    startRow: 2,
    endRow: 9,
    startColumn: 5,
    endColumn: 14,
  });
  assert.deepEqual(screenToCell({ x: 0, y: 0 }, transform, squareGrid), {
    row: 2,
    column: 5,
  });
  assert.deepEqual(screenToCell({ x: 0, y: 0 }, transform, squareGrid, true), {
    row: 2,
    column: 14,
  });
  assert.equal(screenToCell({ x: -51, y: 0 }, transform, squareGrid), null);
});
