import assert from 'node:assert/strict';
import test from 'node:test';

import { MatrixHistory } from '../src/domain/history';
import { MatrixDraft } from '../src/features/pattern-editor/matrixTransaction';
import type { BeadCell } from '../src/domain/project';

const EMPTY: BeadCell = Object.freeze({ kind: 'empty' });

function bead(colorId: string): BeadCell {
  return Object.freeze({ kind: 'bead', colorId });
}

test('a draft merges repeated writes into one first-before/final-after diff', () => {
  const original = Object.freeze([Object.freeze([EMPTY])]);
  const draft = new MatrixDraft(original);

  draft.setCell(0, 0, bead('default:A01'));
  draft.setCell(0, 0, bead('default:A06'));
  const result = draft.finish();

  assert.equal(result.changes.length, 1);
  assert.deepEqual(result.changes[0], {
    row: 0,
    column: 0,
    before: EMPTY,
    after: bead('default:A06'),
  });
});

test('a draft clones each touched row once and preserves untouched row identity', () => {
  const firstRow = Object.freeze([EMPTY, EMPTY]);
  const secondRow = Object.freeze([EMPTY, EMPTY]);
  const original = Object.freeze([firstRow, secondRow]);
  const draft = new MatrixDraft(original);

  draft.setCell(0, 0, bead('default:A01'));
  draft.setCell(0, 1, bead('default:A06'));
  const result = draft.finish();

  assert.notEqual(result.cells[0], firstRow);
  assert.equal(result.cells[1], secondRow);
  assert.equal(result.changes.length, 2);
});

test('diff history restores cells and revisions and clears redo after a new edit', () => {
  const original = Object.freeze([Object.freeze([EMPTY, EMPTY])]);
  const history = new MatrixHistory(original, 100, 7, 64 * 1024);
  const firstDraft = new MatrixDraft(original);
  firstDraft.setCell(0, 0, bead('default:A01'));
  const first = firstDraft.finish();

  history.commitChanges(first.cells, first.changes, 8);
  assert.equal(history.snapshot.revision, 8);
  assert.equal(history.snapshot.canUndo, true);
  assert.deepEqual(history.undo().cells, original);
  assert.equal(history.snapshot.revision, 7);
  assert.deepEqual(history.redo().cells, first.cells);

  history.undo();
  const secondDraft = new MatrixDraft(original);
  secondDraft.setCell(0, 1, bead('default:A06'));
  const second = secondDraft.finish();
  const snapshot = history.commitChanges(second.cells, second.changes, 9);

  assert.equal(snapshot.canRedo, false);
  assert.equal(snapshot.revision, 9);
});

test('100 single-cell edits retain 100 diffs rather than 100 full 300x300 matrices', () => {
  const row = Object.freeze(Array<BeadCell>(300).fill(EMPTY));
  let cells: readonly (readonly BeadCell[])[] = Object.freeze(
    Array<readonly BeadCell[]>(300).fill(row),
  );
  const history = new MatrixHistory(cells, 100, 0, 64 * 1024);

  for (let index = 0; index < 110; index += 1) {
    const draft = new MatrixDraft(cells);
    draft.setCell(Math.floor(index / 300), index % 300, bead('default:A01'));
    const result = draft.finish();
    cells = result.cells;
    history.commitChanges(result.cells, result.changes);
  }

  const snapshot = history.snapshot;
  assert.equal(snapshot.retainedTransactionCount, 100);
  assert.equal(snapshot.retainedChangeCount, 100);
  assert.ok(snapshot.memoryEstimateBytes > 0);
  assert.ok(snapshot.memoryEstimateBytes < 64 * 1024);
});

test('history evicts the oldest transactions when its byte budget is exceeded', () => {
  let cells: readonly (readonly BeadCell[])[] = Object.freeze([Object.freeze([EMPTY])]);
  const history = new MatrixHistory(cells, 100, 0, 256);

  for (let index = 0; index < 12; index += 1) {
    const draft = new MatrixDraft(cells);
    draft.setCell(0, 0, index % 2 === 0 ? bead(`default:A${String(index)}`) : EMPTY);
    const result = draft.finish();
    cells = result.cells;
    history.commitChanges(result.cells, result.changes);
  }

  assert.ok(history.snapshot.memoryEstimateBytes <= 256);
  assert.ok(history.snapshot.retainedTransactionCount < 12);
});

test('history rejects incomplete diff lists and matrix shape changes', () => {
  const original = Object.freeze([Object.freeze([EMPTY, EMPTY])]);
  const history = new MatrixHistory(original);
  const first = bead('default:A01');
  const second = bead('default:A06');
  const incomplete = Object.freeze([Object.freeze([first, second])]);

  assert.throws(
    () =>
      history.commitChanges(incomplete, [
        {
          row: 0,
          column: 0,
          before: EMPTY,
          after: first,
        },
      ]),
    /历史差异/u,
  );
  assert.throws(
    () =>
      history.commitChanges(Object.freeze([Object.freeze([first, EMPTY, second])]), [
        {
          row: 0,
          column: 0,
          before: EMPTY,
          after: first,
        },
      ]),
    /矩阵尺寸/u,
  );
  assert.equal(history.snapshot.canUndo, false);
});
