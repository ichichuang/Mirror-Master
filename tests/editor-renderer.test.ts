import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EditorPerformanceTracker,
  RenderInvalidation,
} from '../src/features/pattern-editor/renderState';

test('render invalidation coalesces duplicate dirty cells', () => {
  const invalidation = new RenderInvalidation();
  invalidation.markCell(2, 3);
  invalidation.markCell(2, 3);
  invalidation.markCell(4, 5);

  assert.deepEqual(invalidation.consume(), {
    full: false,
    overlay: false,
    cells: [
      { row: 2, column: 3 },
      { row: 4, column: 5 },
    ],
  });
  assert.deepEqual(invalidation.consume(), { full: false, overlay: false, cells: [] });
});

test('a full invalidation dominates accumulated cell damage', () => {
  const invalidation = new RenderInvalidation();
  invalidation.markCell(2, 3);
  invalidation.markOverlay();
  invalidation.markFull();

  assert.deepEqual(invalidation.consume(), { full: true, overlay: true, cells: [] });
});

test('performance instrumentation reports frame and transaction costs', () => {
  const tracker = new EditorPerformanceTracker();
  tracker.recordFrame('dirty', 4.5, 3);
  tracker.recordFrame('full', 12, 10_000);
  tracker.recordTransaction(18);

  assert.deepEqual(tracker.snapshot, {
    frameCount: 2,
    fullFrameCount: 1,
    dirtyFrameCount: 1,
    visitedCellCount: 10_003,
    lastFrameDurationMs: 12,
    maxFrameDurationMs: 12,
    transactionCount: 1,
    lastTransactionDurationMs: 18,
    maxTransactionDurationMs: 18,
  });
});
