import assert from 'node:assert/strict';
import test from 'node:test';

import type { GridDetectionResult } from '../src/features/grid-api/client';
import { createGridDetectionCoordinator } from '../src/features/grid-editor/gridDetectionCoordinator';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function result(id: string): GridDetectionResult {
  return {
    contractVersion: '2.0',
    imageSha256: '0'.repeat(64),
    naturalWidth: 40,
    naturalHeight: 40,
    selectedCandidateId: id,
    candidates: [],
  };
}

test('a newer detection aborts and suppresses the older completion', async () => {
  const pending: Deferred<GridDetectionResult>[] = [];
  const signals: AbortSignal[] = [];
  const coordinator = createGridDetectionCoordinator({
    request(_file, _mode, _constraints, signal) {
      signals.push(signal);
      const task = deferred<GridDetectionResult>();
      pending.push(task);
      return task.promise;
    },
  });
  const file = new File(['chart'], 'chart.png', { type: 'image/png' });

  const first = coordinator.run(file, 'auto');
  const second = coordinator.run(file, 'auto');
  assert.equal(signals[0]?.aborted, true);
  pending[0]?.resolve(result('line-old'));
  pending[1]?.resolve(result('line-new'));

  assert.equal(await first, null);
  assert.equal((await second)?.selectedCandidateId, 'line-new');
  assert.equal(coordinator.isRunning(), false);
});

test('cancel aborts the actual signal and turns a late result into null', async () => {
  const task = deferred<GridDetectionResult>();
  let signal: AbortSignal | null = null;
  const coordinator = createGridDetectionCoordinator({
    request(_file, _mode, _constraints, nextSignal) {
      signal = nextSignal;
      return task.promise;
    },
  });
  const run = coordinator.run(new File(['chart'], 'chart.png', { type: 'image/png' }), 'auto');

  coordinator.cancel();
  assert.equal(signal?.aborted, true);
  task.resolve(result('line-late'));
  assert.equal(await run, null);
});
