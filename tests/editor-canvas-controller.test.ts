import assert from 'node:assert/strict';
import test from 'node:test';

import type { MatrixCellChange } from '../src/domain/history';
import type { BeadCell, BeadProject } from '../src/domain/project';
import {
  mountPatternCanvas,
  type CellSelection,
  type PatternCanvasController,
  type SelectionTransferMode,
  type SelectionViewportRect,
} from '../src/features/pattern-editor/canvasEditor';
import type { FirstUseGesture } from '../src/features/pattern-editor/firstUseHint';
import type { EditorPerformanceSnapshot } from '../src/features/pattern-editor/renderState';

const EMPTY: BeadCell = Object.freeze({ kind: 'empty' });

test('one interpolated pointer stroke emits one merged diff transaction', () => {
  const harness = createHarness();

  harness.pointer('pointerdown', { pointerId: 1, row: 0, column: 0 });
  harness.pointer('pointermove', { pointerId: 1, row: 0, column: 3 });
  harness.pointer('pointerup', { pointerId: 1, row: 0, column: 3 });

  assert.equal(harness.commits.length, 1);
  assert.deepEqual(
    harness.commits[0]?.changes.map(({ row, column }) => ({ row, column })),
    [
      { row: 0, column: 0 },
      { row: 0, column: 1 },
      { row: 0, column: 2 },
      { row: 0, column: 3 },
    ],
  );
  harness.destroy();
});

test('pointer cancellation rolls a draft back and releases capture without committing', () => {
  const harness = createHarness();

  harness.pointer('pointerdown', { pointerId: 2, row: 1, column: 0, pointerType: 'touch' });
  harness.pointer('pointermove', { pointerId: 2, row: 1, column: 3, pointerType: 'touch' });
  harness.pointer('pointercancel', {
    pointerId: 2,
    row: 1,
    column: 3,
    pointerType: 'touch',
  });

  assert.equal(harness.commits.length, 0);
  assert.equal(harness.canvas.hasPointerCapture(2), false);

  harness.pointer('pointerdown', { pointerId: 3, row: 1, column: 0 });
  harness.pointer('pointerup', { pointerId: 3, row: 1, column: 0 });
  assert.deepEqual(harness.commits[0]?.changes, [
    {
      row: 1,
      column: 0,
      before: EMPTY,
      after: { kind: 'bead', colorId: 'default:A01' },
    },
  ]);
  harness.destroy();
});

test('a second touch rolls back a pending tool draft and owns the gesture as a pinch', () => {
  const harness = createHarness();

  harness.pointer('pointerdown', { pointerId: 4, row: 2, column: 0, pointerType: 'touch' });
  harness.pointer('pointermove', { pointerId: 4, row: 2, column: 2, pointerType: 'touch' });
  harness.pointer('pointerdown', { pointerId: 5, row: 3, column: 3, pointerType: 'touch' });
  harness.pointer('pointerup', { pointerId: 5, row: 3, column: 3, pointerType: 'touch' });

  assert.equal(harness.commits.length, 0);
  assert.equal(harness.canvas.hasPointerCapture(4), false);
  assert.equal(harness.canvas.hasPointerCapture(5), false);
  harness.destroy();
});

test('successful pointer drawing and two-finger movement expose first-use gesture events', () => {
  const drawHarness = createHarness();
  drawHarness.pointer('pointerdown', { pointerId: 40, row: 0, column: 0 });
  assert.deepEqual(drawHarness.successfulGestures, []);
  drawHarness.pointer('pointerup', { pointerId: 40, row: 0, column: 0 });
  assert.deepEqual(drawHarness.successfulGestures, ['draw']);
  drawHarness.destroy();

  const pinchHarness = createHarness();
  pinchHarness.pointer('pointerdown', {
    pointerId: 41,
    row: 0,
    column: 0,
    pointerType: 'touch',
  });
  pinchHarness.pointer('pointerdown', {
    pointerId: 42,
    row: 1,
    column: 1,
    pointerType: 'touch',
  });
  pinchHarness.pointer('pointermove', {
    pointerId: 42,
    row: 2,
    column: 2,
    pointerType: 'touch',
  });
  pinchHarness.pointer('pointermove', {
    pointerId: 42,
    row: 3,
    column: 3,
    pointerType: 'touch',
  });

  assert.deepEqual(pinchHarness.successfulGestures, []);
  pinchHarness.pointer('pointerup', {
    pointerId: 42,
    row: 3,
    column: 3,
    pointerType: 'touch',
  });
  assert.deepEqual(pinchHarness.successfulGestures, ['pinch']);
  pinchHarness.destroy();
});

test('a cancelled pinch does not report a successful first-use gesture', () => {
  const harness = createHarness();
  harness.pointer('pointerdown', {
    pointerId: 43,
    row: 0,
    column: 0,
    pointerType: 'touch',
  });
  harness.pointer('pointerdown', {
    pointerId: 44,
    row: 1,
    column: 1,
    pointerType: 'touch',
  });
  harness.pointer('pointermove', {
    pointerId: 44,
    row: 3,
    column: 3,
    pointerType: 'touch',
  });
  harness.pointer('pointercancel', {
    pointerId: 44,
    row: 3,
    column: 3,
    pointerType: 'touch',
  });

  assert.deepEqual(harness.successfulGestures, []);
  harness.destroy();
});

test('a zero-motion pinch completion does not report a successful first-use gesture', () => {
  const harness = createHarness();
  harness.pointer('pointerdown', {
    pointerId: 48,
    row: 0,
    column: 0,
    pointerType: 'touch',
  });
  harness.pointer('pointerdown', {
    pointerId: 49,
    row: 1,
    column: 1,
    pointerType: 'touch',
  });
  harness.pointer('pointermove', {
    pointerId: 49,
    row: 1,
    column: 1,
    pointerType: 'touch',
  });
  harness.pointer('pointerup', {
    pointerId: 49,
    row: 1,
    column: 1,
    pointerType: 'touch',
  });

  assert.deepEqual(harness.successfulGestures, []);
  harness.destroy();
});

test('an explicit viewport change rolls back an active stroke before zooming', () => {
  const harness = createHarness();

  harness.pointer('pointerdown', { pointerId: 6, row: 3, column: 0 });
  harness.pointer('pointermove', { pointerId: 6, row: 3, column: 3 });
  harness.zoomIn();
  harness.pointer('pointerup', { pointerId: 6, row: 3, column: 3 });

  assert.equal(harness.commits.length, 0);
  assert.equal(harness.canvas.hasPointerCapture(6), false);
  harness.destroy();
});

test('project palette changes replace an unavailable active color before the next edit', () => {
  const harness = createHarness();

  harness.setProject(project('default:A06'));
  harness.setColor('default:A01');
  harness.pointer('pointerdown', { pointerId: 7, row: 0, column: 0 });
  harness.pointer('pointerup', { pointerId: 7, row: 0, column: 0 });

  assert.deepEqual(harness.commits[0]?.changes[0]?.after, {
    kind: 'bead',
    colorId: 'default:A06',
  });
  harness.destroy();
});

test('a synchronous project echo preserves dirty-cell rendering for an ordinary stroke', () => {
  const harness = createHarness(true);
  harness.flushFrame();
  harness.resetPerformanceMetrics();

  harness.pointer('pointerdown', { pointerId: 8, row: 0, column: 0 });
  harness.pointer('pointermove', { pointerId: 8, row: 0, column: 3 });
  harness.pointer('pointerup', { pointerId: 8, row: 0, column: 3 });
  harness.flushFrame();

  const snapshot = harness.performanceSnapshot();
  assert.equal(snapshot.frameCount, 1);
  assert.equal(snapshot.fullFrameCount, 0);
  assert.equal(snapshot.dirtyFrameCount, 1);
  assert.equal(snapshot.visitedCellCount, 4);
  assert.equal(snapshot.transactionCount, 1);
  assert.ok(assertFiniteNumber(snapshot.lastFrameDurationMs));
  assert.ok(assertFiniteNumber(snapshot.maxFrameDurationMs));
  assert.ok(assertFiniteNumber(snapshot.lastTransactionDurationMs));
  assert.ok(assertFiniteNumber(snapshot.maxTransactionDurationMs));
  harness.destroy();
});

test('an accepted pointerdown restores keyboard focus to the canvas', () => {
  const harness = createHarness();

  harness.pointer('pointerdown', { pointerId: 9, row: 0, column: 0 });

  assert.equal(harness.canvas.focusCount, 1);
  harness.destroy();
});

test('page visibility cancellation clears a lost Space-pan key latch', () => {
  const harness = createHarness();

  harness.keyDown(' ');
  harness.hideDocument();
  harness.pointer('pointerdown', { pointerId: 10, row: 0, column: 0 });
  harness.pointer('pointerup', { pointerId: 10, row: 0, column: 0 });

  assert.equal(harness.commits.length, 1);
  harness.destroy();
});

test('canvas focus loss clears a Space-pan keyup that another control will receive', () => {
  const harness = createHarness();

  harness.keyDown(' ');
  harness.blurCanvas();
  harness.pointer('pointerdown', { pointerId: 11, row: 0, column: 0 });
  harness.pointer('pointerup', { pointerId: 11, row: 0, column: 0 });

  assert.equal(harness.commits.length, 1);
  harness.destroy();
});

test('horizontal keyboard movement follows screen direction in reverse view', () => {
  const harness = createHarness();

  harness.setReverseView(true);
  harness.keyDown('ArrowLeft');
  harness.keyDown('Enter');

  assert.deepEqual(
    harness.commits[0]?.changes.map(({ row, column }) => ({ row, column })),
    [{ row: 0, column: 1 }],
  );
  harness.destroy();
});

test('row and column jump clamps, reveals, focuses, and announces the target cell', () => {
  const harness = createHarness(false, sizedProject(30, 30));
  harness.actualSize();
  harness.flushFrame();
  harness.canvas.strokeRects.length = 0;

  harness.jumpToCell(999, -10);
  harness.flushFrame();

  assert.equal(harness.canvas.focusCount, 1);
  assert.equal(harness.statuses.at(-1), '当前格子：第 30 行，第 1 列。');
  const targetOutline = harness.canvas.strokeRects.at(-1);
  assert.ok(targetOutline);
  assert.ok(targetOutline.x >= 0);
  assert.ok(targetOutline.y >= 0);
  assert.ok(targetOutline.x + targetOutline.width <= harness.canvas.clientWidth);
  assert.ok(targetOutline.y + targetOutline.height <= harness.canvas.clientHeight);

  harness.keyDown('Enter');
  assert.deepEqual(
    harness.commits[0]?.changes.map(({ row, column }) => ({ row, column })),
    [{ row: 29, column: 0 }],
  );
  harness.destroy();
});

test('explicit copy placement previews without writing and commits one source-preserving transaction', () => {
  const harness = createHarness(
    false,
    patternProject([
      [bead('default:A01'), bead('default:A02'), EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
    ]),
  );
  harness.setTool('select');
  harness.pointer('pointerdown', { pointerId: 20, row: 0, column: 0 });
  harness.pointer('pointermove', { pointerId: 20, row: 0, column: 1 });
  harness.pointer('pointerup', { pointerId: 20, row: 0, column: 1 });

  harness.beginSelectionTransfer('copy');
  harness.pointer('pointerdown', { pointerId: 21, row: 0, column: 0 });
  harness.pointer('pointermove', { pointerId: 21, row: 1, column: 1 });

  assert.equal(harness.commits.length, 0);
  assert.deepEqual(harness.selections.at(-1), {
    startRow: 1,
    startColumn: 1,
    endRow: 1,
    endColumn: 2,
  });

  harness.pointer('pointerup', { pointerId: 21, row: 1, column: 1 });

  assert.equal(harness.commits.length, 1);
  assert.deepEqual(
    harness.commits[0]?.cells,
    matrix([
      [bead('default:A01'), bead('default:A02'), EMPTY, EMPTY],
      [EMPTY, bead('default:A01'), bead('default:A02'), EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
    ]),
  );
  assert.deepEqual(
    harness.commits[0]?.changes.map(({ row, column }) => ({ row, column })),
    [
      { row: 1, column: 1 },
      { row: 1, column: 2 },
    ],
  );
  assert.equal(harness.transferModes.at(-1), null);
  harness.destroy();
});

test('an armed transfer overrides paint for one placement gesture and then restores paint', () => {
  const harness = createHarness(
    false,
    patternProject([
      [bead('default:A01'), bead('default:A02'), EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
    ]),
  );
  harness.setTool('select');
  harness.pointer('pointerdown', { pointerId: 24, row: 0, column: 0 });
  harness.pointer('pointermove', { pointerId: 24, row: 0, column: 1 });
  harness.pointer('pointerup', { pointerId: 24, row: 0, column: 1 });
  harness.setTool('paint');

  harness.beginSelectionTransfer('copy');
  harness.pointer('pointerdown', { pointerId: 25, row: 0, column: 0 });
  harness.pointer('pointermove', { pointerId: 25, row: 1, column: 1 });
  assert.equal(harness.commits.length, 0);
  harness.pointer('pointerup', { pointerId: 25, row: 1, column: 1 });

  assert.deepEqual(
    harness.commits[0]?.cells,
    matrix([
      [bead('default:A01'), bead('default:A02'), EMPTY, EMPTY],
      [EMPTY, bead('default:A01'), bead('default:A02'), EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
    ]),
  );
  assert.equal(harness.transferModes.at(-1), null);

  harness.pointer('pointerdown', { pointerId: 26, row: 3, column: 3 });
  harness.pointer('pointerup', { pointerId: 26, row: 3, column: 3 });
  assert.deepEqual(
    harness.commits[1]?.changes.map(({ row, column }) => ({ row, column })),
    [{ row: 3, column: 3 }],
  );
  harness.destroy();
});

test('wheel zoom cancels an armed transfer without changing the selected matrix', () => {
  const harness = createHarness();
  harness.setTool('select');
  harness.pointer('pointerdown', { pointerId: 27, row: 0, column: 0 });
  harness.pointer('pointermove', { pointerId: 27, row: 0, column: 1 });
  harness.pointer('pointerup', { pointerId: 27, row: 0, column: 1 });
  harness.beginSelectionTransfer('copy');

  harness.wheel(-120);

  assert.equal(harness.transferModes.at(-1), null);
  assert.equal(harness.commits.length, 0);
  assert.deepEqual(harness.selections.at(-1), {
    startRow: 0,
    startColumn: 0,
    endRow: 0,
    endColumn: 1,
  });
  harness.destroy();
});

test('a second touch cancels an active transfer preview before taking over as pinch', () => {
  const harness = createHarness();
  harness.setTool('select');
  harness.pointer('pointerdown', { pointerId: 28, row: 0, column: 0 });
  harness.pointer('pointermove', { pointerId: 28, row: 0, column: 1 });
  harness.pointer('pointerup', { pointerId: 28, row: 0, column: 1 });
  harness.beginSelectionTransfer('copy');
  harness.pointer('pointerdown', {
    pointerId: 29,
    row: 0,
    column: 0,
    pointerType: 'touch',
  });
  harness.pointer('pointermove', {
    pointerId: 29,
    row: 1,
    column: 1,
    pointerType: 'touch',
  });

  harness.pointer('pointerdown', {
    pointerId: 30,
    row: 3,
    column: 3,
    pointerType: 'touch',
  });

  assert.equal(harness.transferModes.at(-1), null);
  assert.equal(harness.commits.length, 0);
  assert.deepEqual(harness.selections.at(-1), {
    startRow: 0,
    startColumn: 0,
    endRow: 0,
    endColumn: 1,
  });
  harness.pointer('pointerup', {
    pointerId: 30,
    row: 3,
    column: 3,
    pointerType: 'touch',
  });
  harness.destroy();
});

test('move placement renders snapshot destinations and cleared sources before commit', () => {
  const harness = createHarness(
    false,
    patternProject([
      [bead('default:A01'), bead('default:A02'), EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
    ]),
  );
  harness.flushFrame();
  const firstColor = harness.canvas.beadColorAt(30, 30);
  const secondColor = harness.canvas.beadColorAt(50, 30);
  assert.ok(firstColor);
  assert.ok(secondColor);
  harness.canvas.clearArcFills();

  harness.setTool('select');
  harness.pointer('pointerdown', { pointerId: 45, row: 0, column: 0 });
  harness.pointer('pointermove', { pointerId: 45, row: 0, column: 1 });
  harness.pointer('pointerup', { pointerId: 45, row: 0, column: 1 });
  harness.beginSelectionTransfer('move');
  harness.pointer('pointerdown', { pointerId: 46, row: 0, column: 0 });
  harness.pointer('pointermove', { pointerId: 46, row: 1, column: 1 });
  harness.flushFrame();

  assert.equal(harness.commits.length, 0);
  assert.equal(harness.canvas.beadColorAt(30, 30), null);
  assert.equal(harness.canvas.beadColorAt(50, 30), null);
  assert.equal(harness.canvas.beadColorAt(50, 50), firstColor);
  assert.equal(harness.canvas.beadColorAt(70, 50), secondColor);
  harness.destroy();
});

test('explicit move placement crops a partial out-of-bounds target at commit', () => {
  const harness = createHarness(
    false,
    patternProject([
      [bead('default:A01'), bead('default:A02'), EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
    ]),
  );
  harness.setTool('select');
  harness.pointer('pointerdown', { pointerId: 22, row: 0, column: 0 });
  harness.pointer('pointermove', { pointerId: 22, row: 0, column: 1 });
  harness.pointer('pointerup', { pointerId: 22, row: 0, column: 1 });

  harness.beginSelectionTransfer('move');
  harness.pointer('pointerdown', { pointerId: 23, row: 0, column: 0 });
  harness.pointer('pointermove', { pointerId: 23, row: 0, column: 3 });
  assert.equal(harness.commits.length, 0);
  harness.pointer('pointerup', { pointerId: 23, row: 0, column: 3 });

  assert.equal(harness.commits.length, 1);
  assert.deepEqual(
    harness.commits[0]?.cells,
    matrix([
      [EMPTY, EMPTY, EMPTY, bead('default:A01')],
      [EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
    ]),
  );
  assert.deepEqual(harness.selections.at(-1), {
    startRow: 0,
    startColumn: 3,
    endRow: 0,
    endColumn: 3,
  });
  harness.destroy();
});

test('project shrink removes an old selection with no remaining grid intersection', () => {
  const harness = createHarness();
  harness.setTool('select');
  harness.pointer('pointerdown', { pointerId: 47, row: 2, column: 2 });
  harness.pointer('pointermove', { pointerId: 47, row: 3, column: 3 });
  harness.pointer('pointerup', { pointerId: 47, row: 3, column: 3 });

  harness.setProject(sizedProject(1, 1));

  assert.equal(harness.selections.at(-1), null);
  assert.equal(harness.selectionRect(), null);
  harness.destroy();
});

test('transfer cancellation paths restore the original selection without a matrix commit', () => {
  const cancellationCases: ReadonlyArray<{
    readonly name: string;
    readonly cancel: (harness: ReturnType<typeof createHarness>) => void;
  }> = [
    {
      name: 'pointercancel',
      cancel: (harness) => harness.pointer('pointercancel', { pointerId: 31, row: 1, column: 1 }),
    },
    {
      name: 'lost pointer capture',
      cancel: (harness) => harness.lostPointerCapture(31),
    },
    {
      name: 'Escape',
      cancel: (harness) => harness.keyDown('Escape'),
    },
    {
      name: 'tool change',
      cancel: (harness) => harness.setTool('paint'),
    },
    {
      name: 'project change',
      cancel: (harness) =>
        harness.setProject(
          patternProject([
            [bead('default:A01'), bead('default:A02'), EMPTY, EMPTY],
            [EMPTY, EMPTY, EMPTY, EMPTY],
            [EMPTY, EMPTY, EMPTY, EMPTY],
            [EMPTY, EMPTY, EMPTY, EMPTY],
          ]),
        ),
    },
    {
      name: 'reverse view',
      cancel: (harness) => harness.setReverseView(true),
    },
    {
      name: 'viewport reset',
      cancel: (harness) => harness.fit(),
    },
  ];

  for (const cancellationCase of cancellationCases) {
    const harness = createSelectedTransferHarness(31);
    cancellationCase.cancel(harness);

    assert.equal(harness.commits.length, 0, cancellationCase.name);
    assert.deepEqual(
      harness.selections.at(-1),
      {
        startRow: 0,
        startColumn: 0,
        endRow: 0,
        endColumn: 1,
      },
      cancellationCase.name,
    );
    assert.equal(harness.transferModes.at(-1), null, cancellationCase.name);
    harness.destroy();
  }
});

test('destroy rolls back a transfer preview without committing matrix changes', () => {
  const harness = createSelectedTransferHarness(32);

  harness.destroy();

  assert.equal(harness.commits.length, 0);
  assert.deepEqual(harness.selections.at(-1), {
    startRow: 0,
    startColumn: 0,
    endRow: 0,
    endColumn: 1,
  });
  assert.equal(harness.transferModes.at(-1), null);
});

test('cancel selection is non-destructive while clear selection remains a transaction', () => {
  const cancelHarness = createSelectedTransferHarness(33);
  cancelHarness.cancelSelection();

  assert.equal(cancelHarness.commits.length, 0);
  assert.equal(cancelHarness.selections.at(-1), null);
  cancelHarness.destroy();

  const clearHarness = createSelectedTransferHarness(34);
  clearHarness.clearSelection();

  assert.equal(clearHarness.commits.length, 1);
  assert.equal(clearHarness.selections.at(-1), null);
  assert.deepEqual(
    clearHarness.commits[0]?.changes.map(({ row, column }) => ({ row, column })),
    [
      { row: 0, column: 0 },
      { row: 0, column: 1 },
    ],
  );
  clearHarness.destroy();
});

test('selection viewport callback exposes the current CSS-pixel rectangle', () => {
  const harness = createHarness();
  harness.setTool('select');
  harness.pointer('pointerdown', { pointerId: 35, row: 0, column: 0 });
  harness.pointer('pointermove', { pointerId: 35, row: 0, column: 1 });
  harness.pointer('pointerup', { pointerId: 35, row: 0, column: 1 });

  assert.deepEqual(harness.selectionRects.at(-1), {
    left: 20,
    top: 20,
    width: 40,
    height: 20,
  });
  assert.deepEqual(harness.selectionRect(), {
    left: 20,
    top: 20,
    width: 40,
    height: 20,
  });
  harness.destroy();
});

test('selection viewport callback follows a visual reverse without changing logical selection', () => {
  const harness = createHarness();
  harness.setTool('select');
  harness.pointer('pointerdown', { pointerId: 36, row: 0, column: 0 });
  harness.pointer('pointermove', { pointerId: 36, row: 0, column: 1 });
  harness.pointer('pointerup', { pointerId: 36, row: 0, column: 1 });

  harness.setReverseView(true);

  assert.deepEqual(harness.selectionRects.at(-1), {
    left: 60,
    top: 20,
    width: 40,
    height: 20,
  });
  assert.deepEqual(harness.selections.at(-1), {
    startRow: 0,
    startColumn: 0,
    endRow: 0,
    endColumn: 1,
  });
  harness.destroy();
});

interface PointerOptions {
  readonly pointerId: number;
  readonly row: number;
  readonly column: number;
  readonly pointerType?: string;
  readonly altKey?: boolean;
}

interface CommitRecord {
  readonly cells: readonly (readonly BeadCell[])[];
  readonly changes: readonly MatrixCellChange[];
}

function createSelectedTransferHarness(pointerId: number): ReturnType<typeof createHarness> {
  const harness = createHarness(
    false,
    patternProject([
      [bead('default:A01'), bead('default:A02'), EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
    ]),
  );
  harness.setTool('select');
  harness.pointer('pointerdown', { pointerId: pointerId + 100, row: 0, column: 0 });
  harness.pointer('pointermove', { pointerId: pointerId + 100, row: 0, column: 1 });
  harness.pointer('pointerup', { pointerId: pointerId + 100, row: 0, column: 1 });
  harness.beginSelectionTransfer('copy');
  harness.pointer('pointerdown', { pointerId, row: 0, column: 0 });
  harness.pointer('pointermove', { pointerId, row: 1, column: 1 });
  return harness;
}

function createHarness(
  echoProjectOnCommit = false,
  initialProject = project(),
): {
  readonly canvas: FakeCanvas;
  readonly commits: CommitRecord[];
  readonly statuses: string[];
  readonly successfulGestures: FirstUseGesture[];
  readonly selections: Array<CellSelection | null>;
  readonly selectionRects: Array<SelectionViewportRect | null>;
  readonly transferModes: SelectionTransferMode[];
  readonly pointer: (type: string, options: PointerOptions) => void;
  readonly wheel: (deltaY: number) => void;
  readonly lostPointerCapture: (pointerId: number) => void;
  readonly zoomIn: () => void;
  readonly actualSize: () => void;
  readonly fit: () => void;
  readonly jumpToCell: (row: number, column: number) => void;
  readonly setProject: (project: BeadProject) => void;
  readonly setTool: (tool: 'paint' | 'erase' | 'eyedropper' | 'fill' | 'select') => void;
  readonly setColor: (colorId: string) => void;
  readonly setReverseView: (reverse: boolean) => void;
  readonly beginSelectionTransfer: (mode: Exclude<SelectionTransferMode, null>) => void;
  readonly cancelSelection: () => void;
  readonly clearSelection: () => void;
  readonly selectionRect: () => SelectionViewportRect | null;
  readonly keyDown: (key: string) => void;
  readonly hideDocument: () => void;
  readonly blurCanvas: () => void;
  readonly flushFrame: () => void;
  readonly resetPerformanceMetrics: () => void;
  readonly performanceSnapshot: () => EditorPerformanceSnapshot;
  readonly destroy: () => void;
} {
  const fakeWindow = new FakeWindow();
  const fakeDocument = new FakeEventTarget() as FakeEventTarget & { hidden: boolean };
  fakeDocument.hidden = false;
  Object.defineProperty(globalThis, 'window', {
    value: fakeWindow,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'document', {
    value: fakeDocument,
    configurable: true,
    writable: true,
  });

  const canvas = new FakeCanvas();
  const commits: CommitRecord[] = [];
  const statuses: string[] = [];
  const successfulGestures: FirstUseGesture[] = [];
  const selections: Array<CellSelection | null> = [];
  const selectionRects: Array<SelectionViewportRect | null> = [];
  const transferModes: SelectionTransferMode[] = [];
  let currentProject = initialProject;
  let controller: PatternCanvasController | null = null;
  controller = mountPatternCanvas(canvas as unknown as HTMLCanvasElement, currentProject, {
    onCommit(cells, _message, changes) {
      commits.push({ cells, changes });
      if (echoProjectOnCommit) {
        currentProject = { ...currentProject, cells } as BeadProject;
        controller?.setProject(currentProject);
      }
    },
    onColorPick() {},
    onStatus(message) {
      statuses.push(message);
    },
    onSelectionChange(selection) {
      selections.push(selection);
    },
    onSelectionViewportRectChange(rect) {
      selectionRects.push(rect);
    },
    onSelectionTransferModeChange(mode) {
      transferModes.push(mode);
    },
    onSuccessfulGesture(gesture) {
      successfulGestures.push(gesture);
    },
  });

  return {
    canvas,
    commits,
    statuses,
    successfulGestures,
    selections,
    selectionRects,
    transferModes,
    pointer(type, options) {
      const cellSize = 20;
      canvas.dispatch(type, {
        pointerId: options.pointerId,
        pointerType: options.pointerType ?? 'mouse',
        button: type === 'pointermove' ? -1 : 0,
        clientX: 20 + (options.column + 0.5) * cellSize,
        clientY: 20 + (options.row + 0.5) * cellSize,
        altKey: options.altKey ?? false,
        preventDefault() {},
      });
    },
    wheel(deltaY) {
      canvas.dispatch('wheel', {
        deltaY,
        clientX: 60,
        clientY: 60,
        preventDefault() {},
      });
    },
    lostPointerCapture(pointerId) {
      canvas.dispatch('lostpointercapture', {
        pointerId,
        preventDefault() {},
      });
    },
    zoomIn() {
      controller.zoomIn();
    },
    actualSize() {
      controller.actualSize();
    },
    fit() {
      controller.fit();
    },
    jumpToCell(row, column) {
      controller.jumpToCell(row, column);
    },
    setProject(nextProject) {
      controller.setProject(nextProject);
    },
    setTool(tool) {
      controller.setTool(tool);
    },
    setColor(colorId) {
      controller.setColor(colorId);
    },
    setReverseView(reverse) {
      controller.setReverseView(reverse);
    },
    beginSelectionTransfer(mode) {
      controller.beginSelectionTransfer(mode);
    },
    cancelSelection() {
      controller.cancelSelection();
    },
    clearSelection() {
      controller.clearSelection();
    },
    selectionRect() {
      return controller.getSelectionViewportRect();
    },
    keyDown(key) {
      canvas.dispatch('keydown', {
        key,
        repeat: false,
        preventDefault() {},
      });
    },
    hideDocument() {
      fakeDocument.hidden = true;
      fakeDocument.dispatch('visibilitychange', {});
      fakeDocument.hidden = false;
    },
    blurCanvas() {
      canvas.dispatch('blur', {});
    },
    flushFrame() {
      fakeWindow.flushAnimationFrames();
    },
    resetPerformanceMetrics() {
      controller.resetPerformanceMetrics();
    },
    performanceSnapshot() {
      return controller.getPerformanceSnapshot();
    },
    destroy() {
      controller.destroy();
      Reflect.deleteProperty(globalThis, 'window');
      Reflect.deleteProperty(globalThis, 'document');
    },
  };
}

function project(colorId = 'default:A01'): BeadProject {
  return sizedProject(4, 4, colorId);
}

function bead(colorId: string): BeadCell {
  return Object.freeze({ kind: 'bead', colorId });
}

function matrix(rows: readonly (readonly BeadCell[])[]): readonly (readonly BeadCell[])[] {
  return Object.freeze(rows.map((row) => Object.freeze([...row])));
}

function patternProject(rows: readonly (readonly BeadCell[])[]): BeadProject {
  const cells = matrix(rows);
  const colorIds = [
    ...new Set(
      cells.flatMap((row) => row.flatMap((cell) => (cell.kind === 'bead' ? [cell.colorId] : []))),
    ),
  ];
  return {
    grid: {
      rows: cells.length,
      columns: cells[0]?.length ?? 0,
    },
    palette: {
      availableColorIds: colorIds.length > 0 ? colorIds : ['default:A01'],
    },
    cells,
  } as BeadProject;
}

function sizedProject(rows: number, columns: number, colorId = 'default:A01'): BeadProject {
  return {
    grid: {
      rows,
      columns,
    },
    palette: {
      availableColorIds: [colorId],
    },
    cells: Object.freeze(
      Array.from({ length: rows }, () => Object.freeze(Array<BeadCell>(columns).fill(EMPTY))),
    ),
  } as BeadProject;
}

class FakeEventTarget {
  readonly #listeners = new Map<string, Set<(event: never) => void>>();

  addEventListener(type: string, listener: (event: never) => void): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: never) => void): void {
    this.#listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: object): void {
    for (const listener of this.#listeners.get(type) ?? []) {
      listener(event as never);
    }
  }
}

class FakeWindow extends FakeEventTarget {
  readonly devicePixelRatio = 1;
  #nextFrame = 1;
  readonly #frames = new Map<number, FrameRequestCallback>();

  requestAnimationFrame(callback: FrameRequestCallback): number {
    const frame = this.#nextFrame;
    this.#nextFrame += 1;
    this.#frames.set(frame, callback);
    return frame;
  }

  cancelAnimationFrame(frame: number): void {
    this.#frames.delete(frame);
  }

  flushAnimationFrames(): void {
    const frames = [...this.#frames.values()];
    this.#frames.clear();
    for (const frame of frames) {
      frame(performance.now());
    }
  }
}

class FakeCanvas extends FakeEventTarget {
  readonly clientWidth = 120;
  readonly clientHeight = 120;
  width = 120;
  height = 120;
  readonly #captures = new Set<number>();
  readonly strokeRects: Array<{
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }> = [];
  readonly arcFills: Array<{
    readonly x: number;
    readonly y: number;
    readonly color: string;
  }> = [];
  focusCount = 0;

  getContext(): CanvasRenderingContext2D {
    let fillStyle = '';
    let currentArc: { readonly x: number; readonly y: number } | null = null;
    return {
      get fillStyle() {
        return fillStyle;
      },
      set fillStyle(value: string | CanvasGradient | CanvasPattern) {
        fillStyle = String(value);
      },
      setTransform() {},
      fillRect() {},
      strokeRect: (x: number, y: number, width: number, height: number) => {
        this.strokeRects.push({ x, y, width, height });
      },
      beginPath() {
        currentArc = null;
      },
      rect() {},
      clip() {},
      save() {},
      restore() {},
      arc(x: number, y: number) {
        currentArc = { x, y };
      },
      fill: () => {
        if (currentArc) {
          this.arcFills.push({ ...currentArc, color: fillStyle });
        }
      },
    } as unknown as CanvasRenderingContext2D;
  }

  clearArcFills(): void {
    this.arcFills.length = 0;
  }

  beadColorAt(x: number, y: number): string | null {
    return this.arcFills.find((fill) => fill.x === x && fill.y === y)?.color ?? null;
  }

  getBoundingClientRect(): DOMRect {
    return {
      left: 0,
      top: 0,
      width: this.clientWidth,
      height: this.clientHeight,
    } as DOMRect;
  }

  setPointerCapture(pointerId: number): void {
    this.#captures.add(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.#captures.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.#captures.delete(pointerId);
  }

  focus(): void {
    this.focusCount += 1;
  }
}

function assertFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
