/* global console, process */

import { cpus, platform, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';

import { MatrixHistory } from '../src/domain/history.ts';
import { MatrixDraft } from '../src/features/pattern-editor/matrixTransaction.ts';
import { RenderInvalidation } from '../src/features/pattern-editor/renderState.ts';
import { rasterizeGridSegment } from '../src/features/pattern-editor/stroke.ts';
import { fitViewport, getVisibleCellRange } from '../src/features/pattern-editor/viewport.ts';

const TRANSACTION_COUNT = 100;
const STROKE_LENGTH = 48;
const FRAME_SAMPLE_COUNT = 30;
const EMPTY_CELL = Object.freeze({ kind: 'empty' });
const COLORS = Object.freeze([
  Object.freeze({ kind: 'bead', colorId: 'default:A01' }),
  Object.freeze({ kind: 'bead', colorId: 'default:A06' }),
]);
const VIEWPORT = Object.freeze({ width: 1200, height: 800 });
const VIEWPORT_CONFIG = Object.freeze({
  padding: 20,
  minScale: 0.25,
  maxScale: 64,
  actualCellSize: 16,
});

const results = [100, 300].map((size) => benchmarkMatrix(size));
const cpu = cpus()[0];

console.log(
  JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      command: 'pnpm exec tsx scripts/benchmark-editor.mts',
      environment: {
        platform: `${platform()} ${release()}`,
        architecture: process.arch,
        cpu: cpu?.model ?? 'unknown',
        logicalCpuCount: cpus().length,
        memoryGiB: round(totalmem() / 1024 ** 3),
        runtime: `Node.js ${process.version}`,
        browser:
          process.env.BENCHMARK_BROWSER ??
          'not measured by this logic benchmark; use PatternCanvasController.getPerformanceSnapshot() for a browser Canvas run',
      },
      methodology: {
        transactions: TRANSACTION_COUNT,
        cellsRequestedPerTransaction: STROKE_LENGTH,
        frameSamples: FRAME_SAMPLE_COUNT,
        frameTiming:
          'visible-range matrix traversal plus dirty-plan processing; browser Canvas frame timing is exposed separately by the editor controller',
      },
      results,
    },
    null,
    2,
  ),
);

function benchmarkMatrix(size) {
  let cells = createEmptyMatrix(size);
  const history = new MatrixHistory(cells);
  const transactionDurations = [];
  const dirtyFrameDurations = [];
  const visibleFrameDurations = [];
  let committedCellChanges = 0;

  for (let transaction = 0; transaction < TRANSACTION_COUNT; transaction += 1) {
    const row = (transaction * 37) % size;
    const availableColumns = Math.max(1, size - STROKE_LENGTH + 1);
    const startColumn = (transaction * 19) % availableColumns;
    const endColumn = Math.min(size - 1, startColumn + STROKE_LENGTH - 1);
    const points = rasterizeGridSegment({ row, column: startColumn }, { row, column: endColumn });
    const startedAt = performance.now();
    const draft = new MatrixDraft(cells);
    const nextCell = COLORS[transaction % COLORS.length];
    for (const point of points) {
      draft.setCell(point.row, point.column, nextCell);
    }
    const result = draft.finish();
    history.commitChanges(result.cells, result.changes);
    transactionDurations.push(performance.now() - startedAt);
    committedCellChanges += result.changes.length;
    cells = result.cells;

    const invalidation = new RenderInvalidation();
    invalidation.markCells(result.changes);
    const frameStartedAt = performance.now();
    const plan = invalidation.consume();
    let dirtyBeadCount = 0;
    for (const cell of plan.cells) {
      if (cells[cell.row]?.[cell.column]?.kind === 'bead') {
        dirtyBeadCount += 1;
      }
    }
    if (dirtyBeadCount < 0) {
      throw new Error('unreachable benchmark guard');
    }
    dirtyFrameDurations.push(performance.now() - frameStartedAt);
  }

  const transform = fitViewport(VIEWPORT, { rows: size, columns: size }, VIEWPORT_CONFIG);
  const visibleRange = getVisibleCellRange(transform, VIEWPORT, { rows: size, columns: size });
  for (let sample = 0; sample < FRAME_SAMPLE_COUNT; sample += 1) {
    const frameStartedAt = performance.now();
    let beadCount = 0;
    if (visibleRange) {
      for (let row = visibleRange.startRow; row <= visibleRange.endRow; row += 1) {
        for (let column = visibleRange.startColumn; column <= visibleRange.endColumn; column += 1) {
          if (cells[row]?.[column]?.kind === 'bead') {
            beadCount += 1;
          }
        }
      }
    }
    if (beadCount < 0) {
      throw new Error('unreachable benchmark guard');
    }
    visibleFrameDurations.push(performance.now() - frameStartedAt);
  }

  return {
    matrix: `${String(size)}x${String(size)}`,
    transactions: TRANSACTION_COUNT,
    committedCellChanges,
    meanCellChangesPerTransaction: round(committedCellChanges / TRANSACTION_COUNT),
    transactionDurationMs: summarize(transactionDurations),
    dirtyPlanFrameDurationMs: summarize(dirtyFrameDurations),
    visibleMatrixTraversalFrameDurationMs: summarize(visibleFrameDurations),
    visibleCellCount: visibleRange
      ? (visibleRange.endRow - visibleRange.startRow + 1) *
        (visibleRange.endColumn - visibleRange.startColumn + 1)
      : 0,
    history: {
      retainedTransactions: history.snapshot.retainedTransactionCount,
      retainedChanges: history.snapshot.retainedChangeCount,
      memoryEstimateBytes: history.snapshot.memoryEstimateBytes,
    },
  };
}

function createEmptyMatrix(size) {
  return Object.freeze(
    Array.from({ length: size }, () =>
      Object.freeze(Array.from({ length: size }, () => EMPTY_CELL)),
    ),
  );
}

function summarize(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    mean: round(total / Math.max(1, sorted.length)),
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    maximum: round(sorted.at(-1) ?? 0),
  };
}

function percentile(sorted, ratio) {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
