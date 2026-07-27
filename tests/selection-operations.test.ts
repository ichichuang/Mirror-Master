import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearSelectedCells,
  copySelectedCells,
  createSelectionCellSnapshot,
  getSelectionTransferPreviewCell,
  moveSelectedCells,
  type CellSelection,
} from '../src/features/pattern-editor/selection';
import type { BeadCell } from '../src/domain/project';

const EMPTY: BeadCell = Object.freeze({ kind: 'empty' });

function bead(colorId: string): BeadCell {
  return Object.freeze({ kind: 'bead', colorId });
}

function matrix(rows: BeadCell[][]): readonly (readonly BeadCell[])[] {
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

test('clearing a selection creates one diff per changed cell', () => {
  const cells = matrix([
    [bead('A'), EMPTY],
    [bead('B'), bead('C')],
  ]);
  const selection: CellSelection = {
    startRow: 0,
    startColumn: 0,
    endRow: 1,
    endColumn: 0,
  };
  const result = clearSelectedCells(cells, selection);

  assert.deepEqual(
    result.cells,
    matrix([
      [EMPTY, EMPTY],
      [EMPTY, bead('C')],
    ]),
  );
  assert.equal(result.changes.length, 2);
  assert.equal(result.selection, null);
});

test('copy keeps the source and writes a clipped destination snapshot', () => {
  const cells = matrix([
    [bead('A'), bead('B'), EMPTY],
    [EMPTY, EMPTY, EMPTY],
  ]);
  const selection: CellSelection = {
    startRow: 0,
    startColumn: 0,
    endRow: 0,
    endColumn: 1,
  };
  const result = copySelectedCells(cells, selection, 1, 1);

  assert.deepEqual(
    result.cells,
    matrix([
      [bead('A'), bead('B'), EMPTY],
      [EMPTY, bead('A'), bead('B')],
    ]),
  );
  assert.deepEqual(result.selection, {
    startRow: 1,
    startColumn: 1,
    endRow: 1,
    endColumn: 2,
  });
});

test('move snapshots the source before deterministic overlapping writes', () => {
  const cells = matrix([[bead('A'), bead('B'), bead('C'), EMPTY]]);
  const selection: CellSelection = {
    startRow: 0,
    startColumn: 0,
    endRow: 0,
    endColumn: 2,
  };
  const result = moveSelectedCells(cells, selection, 0, 1);

  assert.deepEqual(result.cells, matrix([[EMPTY, bead('A'), bead('B'), bead('C')]]));
  assert.deepEqual(result.selection, {
    startRow: 0,
    startColumn: 1,
    endRow: 0,
    endColumn: 3,
  });
});

test('copy clips cells and the resulting selection at the matrix boundary', () => {
  const cells = matrix([[EMPTY, bead('A'), bead('B'), EMPTY]]);
  const selection: CellSelection = {
    startRow: 0,
    startColumn: 1,
    endRow: 0,
    endColumn: 2,
  };
  const result = copySelectedCells(cells, selection, 0, 2);

  assert.deepEqual(result.cells, matrix([[EMPTY, bead('A'), bead('B'), bead('A')]]));
  assert.deepEqual(result.selection, {
    startRow: 0,
    startColumn: 3,
    endRow: 0,
    endColumn: 3,
  });
});

test('a partially out-of-bounds move clears the full source and keeps only valid targets', () => {
  const cells = matrix([
    [bead('A'), bead('B'), EMPTY],
    [bead('C'), bead('D'), EMPTY],
  ]);
  const selection: CellSelection = {
    startRow: 0,
    startColumn: 0,
    endRow: 1,
    endColumn: 1,
  };

  const result = moveSelectedCells(cells, selection, 0, 2);

  assert.deepEqual(
    result.cells,
    matrix([
      [EMPTY, EMPTY, bead('A')],
      [EMPTY, EMPTY, bead('C')],
    ]),
  );
  assert.deepEqual(result.selection, {
    startRow: 0,
    startColumn: 2,
    endRow: 1,
    endColumn: 2,
  });
  assert.equal(result.changes.length, 6);
});

test('a fully out-of-bounds copy is a stable no-op that keeps the source selected', () => {
  const cells = matrix([[bead('A'), bead('B')]]);
  const selection: CellSelection = {
    startRow: 0,
    startColumn: 1,
    endRow: 0,
    endColumn: 0,
  };

  const result = copySelectedCells(cells, selection, 5, 0);

  assert.equal(result.cells, cells);
  assert.deepEqual(result.changes, []);
  assert.deepEqual(result.selection, {
    startRow: 0,
    startColumn: 0,
    endRow: 0,
    endColumn: 1,
  });
});

test('a fully out-of-bounds move does not clear the source or create history changes', () => {
  const cells = matrix([[bead('A'), bead('B')]]);
  const selection: CellSelection = {
    startRow: 0,
    startColumn: 0,
    endRow: 0,
    endColumn: 1,
  };

  const result = moveSelectedCells(cells, selection, 0, -4);

  assert.equal(result.cells, cells);
  assert.deepEqual(result.changes, []);
  assert.deepEqual(result.selection, selection);
});

test('move preview resolves overlap from a frozen source snapshot without changing the matrix', () => {
  const cells = matrix([[bead('A'), bead('B'), bead('C'), EMPTY]]);
  const snapshot = createSelectionCellSnapshot(cells, {
    startRow: 0,
    startColumn: 0,
    endRow: 0,
    endColumn: 2,
  });
  assert.ok(snapshot);

  assert.deepEqual(getSelectionTransferPreviewCell(cells, snapshot, 'move', 0, 1, 0, 0), EMPTY);
  assert.deepEqual(getSelectionTransferPreviewCell(cells, snapshot, 'move', 0, 1, 0, 1), bead('A'));
  assert.deepEqual(getSelectionTransferPreviewCell(cells, snapshot, 'move', 0, 1, 0, 2), bead('B'));
  assert.deepEqual(getSelectionTransferPreviewCell(cells, snapshot, 'move', 0, 1, 0, 3), bead('C'));
  assert.deepEqual(cells, matrix([[bead('A'), bead('B'), bead('C'), EMPTY]]));
});

test('copy preview keeps source cells while exposing destination snapshot content', () => {
  const cells = matrix([[bead('A'), bead('B'), EMPTY, EMPTY]]);
  const snapshot = createSelectionCellSnapshot(cells, {
    startRow: 0,
    startColumn: 0,
    endRow: 0,
    endColumn: 1,
  });
  assert.ok(snapshot);

  assert.deepEqual(getSelectionTransferPreviewCell(cells, snapshot, 'copy', 0, 2, 0, 0), bead('A'));
  assert.deepEqual(getSelectionTransferPreviewCell(cells, snapshot, 'copy', 0, 2, 0, 2), bead('A'));
  assert.deepEqual(getSelectionTransferPreviewCell(cells, snapshot, 'copy', 0, 2, 0, 3), bead('B'));
});

test('a full 300x300 selection computes destination bounds without argument spreading', () => {
  const row = Object.freeze(Array<BeadCell>(300).fill(EMPTY));
  const cells = Object.freeze(Array<readonly BeadCell[]>(300).fill(row));
  const result = copySelectedCells(
    cells,
    {
      startRow: 0,
      startColumn: 0,
      endRow: 299,
      endColumn: 299,
    },
    0,
    0,
  );

  assert.equal(result.cells, cells);
  assert.deepEqual(result.selection, {
    startRow: 0,
    startColumn: 0,
    endRow: 299,
    endColumn: 299,
  });
});
