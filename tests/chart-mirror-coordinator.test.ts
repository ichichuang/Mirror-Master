import assert from 'node:assert/strict';
import test from 'node:test';

import type { GridDetectionContract } from '../src/features/grid-api/client';
import { createChartMirrorCoordinator } from '../src/features/grid-editor/chartMirrorCoordinator';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function contract(): GridDetectionContract {
  return {
    imageSha256: '0'.repeat(64),
    naturalWidth: 40,
    naturalHeight: 40,
    left: 0,
    top: 0,
    right: 40,
    bottom: 40,
    cellSize: 20,
    columns: 2,
    rows: 2,
    xBoundaries: [0, 20, 40],
    yBoundaries: [0, 20, 40],
    confidence: 1,
    warning: null,
  };
}

test('a newer run aborts and suppresses a late older success', async () => {
  const pending: Deferred<Blob>[] = [];
  const signals: AbortSignal[] = [];
  const coordinator = createChartMirrorCoordinator({
    request(_file, _contract, _axis, signal) {
      const task = deferred<Blob>();
      pending.push(task);
      signals.push(signal);
      return task.promise;
    },
  });
  const file = new File(['chart'], 'chart.png', { type: 'image/png' });

  const first = coordinator.run(file, contract(), 'horizontal');
  const second = coordinator.run(file, contract(), 'vertical');
  assert.equal(signals[0]?.aborted, true);
  pending[0]?.resolve(new Blob(['old'], { type: 'image/png' }));
  pending[1]?.resolve(new Blob(['new'], { type: 'image/png' }));

  assert.equal(await first, null);
  assert.equal(await (await second)?.text(), 'new');
  assert.equal(coordinator.isRunning(), false);
});

test('cancel suppresses a late result without converting it to a failure', async () => {
  const task = deferred<Blob>();
  const coordinator = createChartMirrorCoordinator({
    request: () => task.promise,
  });
  const result = coordinator.run(
    new File(['chart'], 'chart.png', { type: 'image/png' }),
    contract(),
    'horizontal',
  );

  coordinator.cancel();
  task.resolve(new Blob(['late'], { type: 'image/png' }));

  assert.equal(await result, null);
  assert.equal(coordinator.isRunning(), false);
});

test('a current genuine failure is rethrown', async () => {
  const coordinator = createChartMirrorCoordinator({
    request: async () => {
      throw new Error('mirror failed');
    },
  });

  await assert.rejects(
    coordinator.run(
      new File(['chart'], 'chart.png', { type: 'image/png' }),
      contract(),
      'horizontal',
    ),
    /mirror failed/u,
  );
  assert.equal(coordinator.isRunning(), false);
});
