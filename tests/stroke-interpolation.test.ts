import assert from 'node:assert/strict';
import test from 'node:test';

import { rasterizeGridSegment } from '../src/features/pattern-editor/stroke';

test('horizontal strokes include every cell and both endpoints', () => {
  assert.deepEqual(rasterizeGridSegment({ row: 0, column: 0 }, { row: 0, column: 5 }), [
    { row: 0, column: 0 },
    { row: 0, column: 1 },
    { row: 0, column: 2 },
    { row: 0, column: 3 },
    { row: 0, column: 4 },
    { row: 0, column: 5 },
  ]);
});

test('steep strokes never leave a gap between consecutive cells', () => {
  const points = rasterizeGridSegment({ row: 0, column: 0 }, { row: 5, column: 2 });

  assert.deepEqual(points[0], { row: 0, column: 0 });
  assert.deepEqual(points.at(-1), { row: 5, column: 2 });
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    assert.ok(previous);
    assert.ok(current);
    assert.ok(Math.abs(current.row - previous.row) <= 1);
    assert.ok(Math.abs(current.column - previous.column) <= 1);
  }
});

test('reversing a stroke reverses the same interpolated cells', () => {
  const forward = rasterizeGridSegment({ row: 1, column: 2 }, { row: 7, column: 5 });
  const reverse = rasterizeGridSegment({ row: 7, column: 5 }, { row: 1, column: 2 });

  assert.deepEqual(reverse, [...forward].reverse());
});
