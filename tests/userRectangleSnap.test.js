import assert from 'node:assert/strict';
import test from 'node:test';

import { isDetectionTaskCurrent } from '../src/features/grid-editor/detectionTask.ts';
import { snapBoundaryRectangle } from '../src/features/grid-detection/userRectangleSnap.ts';

function rectangle(left, top, right, bottom) {
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    right,
    bottom,
  };
}

function latticeLines(start, end, spacing, support = 1) {
  return Array.from({ length: Math.round((end - start) / spacing) + 1 }, (_, index) => ({
    position: start + index * spacing,
    support,
  }));
}

function candidate(cellSize, rawX = cellSize, rawY = cellSize) {
  return {
    cellSize,
    rawX,
    rawY,
    evidenceWeight: 1,
  };
}

test('preserves an exact full-span user rectangle', () => {
  const result = snapBoundaryRectangle({
    rectangle: rectangle(40, 101, 1400, 1181),
    candidates: [candidate(40), candidate(80)],
    xLines: latticeLines(40, 1400, 40),
    yLines: latticeLines(101, 1181, 40),
  });

  assert.ok(result);
  assert.deepEqual(
    {
      left: result.left,
      top: result.top,
      right: result.right,
      bottom: result.bottom,
      cellSize: result.cellSize,
      columns: result.columns,
      rows: result.rows,
    },
    {
      left: 40,
      top: 101,
      right: 1400,
      bottom: 1181,
      cellSize: 40,
      columns: 34,
      rows: 27,
    },
  );
  assert.equal(result.xBoundaries.length, 35);
  assert.equal(result.yBoundaries.length, 28);
});

test('snaps all four near edges without changing the complete grid extent', () => {
  const result = snapBoundaryRectangle({
    rectangle: rectangle(38, 99, 1402, 1183),
    candidates: [candidate(40)],
    xLines: latticeLines(40, 1400, 40),
    yLines: latticeLines(101, 1181, 40),
  });

  assert.ok(result);
  assert.deepEqual(
    {
      left: result.left,
      top: result.top,
      right: result.right,
      bottom: result.bottom,
      offsets: result.offsets,
    },
    {
      left: 40,
      top: 101,
      right: 1400,
      bottom: 1181,
      offsets: {
        left: 2,
        top: 2,
        right: -2,
        bottom: -2,
      },
    },
  );
});

test('uses the full rectangle center to resolve two-pixel line bands', () => {
  const xLines = latticeLines(39, 1399, 40).map((line) => ({
    ...line,
    width: 2,
  }));
  const yLines = [
    ...latticeLines(101, 1141, 40).map((line) => ({
      ...line,
      width: 2,
    })),
    {
      position: 1180,
      support: 1,
      width: 2,
    },
  ];
  const result = snapBoundaryRectangle({
    rectangle: rectangle(39, 100, 1401, 1182),
    candidates: [candidate(40)],
    xLines,
    yLines,
  });

  assert.ok(result);
  assert.deepEqual(
    {
      left: result.left,
      top: result.top,
      right: result.right,
      bottom: result.bottom,
      offsets: result.offsets,
    },
    {
      left: 40,
      top: 101,
      right: 1400,
      bottom: 1181,
      offsets: {
        left: 1,
        top: 1,
        right: -1,
        bottom: -1,
      },
    },
  );
});

test('rejects missing outer support instead of shrinking to an internal run', () => {
  const result = snapBoundaryRectangle({
    rectangle: rectangle(40, 101, 1400, 1181),
    candidates: [candidate(40)],
    xLines: latticeLines(80, 1360, 40),
    yLines: latticeLines(141, 1141, 40),
  });

  assert.equal(result, null);
});

test('derives dynamic row and column counts from the complete snapped spans', () => {
  const result = snapBoundaryRectangle({
    rectangle: rectangle(9, 19, 311, 221),
    candidates: [candidate(25)],
    xLines: latticeLines(10, 310, 25),
    yLines: latticeLines(20, 220, 25),
  });

  assert.ok(result);
  assert.equal(result.columns, 12);
  assert.equal(result.rows, 8);
  assert.deepEqual(
    result.xBoundaries,
    latticeLines(10, 310, 25).map((line) => line.position),
  );
  assert.deepEqual(
    result.yBoundaries,
    latticeLines(20, 220, 25).map((line) => line.position),
  );
});

test('rejects stale detection tasks without replacing current state', () => {
  const file = {};
  const replacement = {};

  assert.equal(
    isDetectionTaskCurrent(
      {
        version: 4,
        file,
      },
      5,
      file,
    ),
    false,
  );
  assert.equal(
    isDetectionTaskCurrent(
      {
        version: 5,
        file,
      },
      5,
      replacement,
    ),
    false,
  );
  assert.equal(
    isDetectionTaskCurrent(
      {
        version: 5,
        file,
      },
      5,
      file,
    ),
    true,
  );
});
