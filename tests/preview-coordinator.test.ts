import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  PatternGenerationResult,
  PatternGenerationSettings,
} from '../src/features/pattern-api/client';
import {
  createPreviewCoordinator,
  type PreviewCoordinatorEvent,
  type PreviewGenerationRequest,
} from '../src/features/preview-workspace/previewCoordinator';

function fakeSettings(): PatternGenerationSettings {
  return {
    mode: 'photo',
    crop: { x: 0, y: 0, width: 1, height: 1 },
    rotation: 0,
    rows: 1,
    columns: 1,
    aspectLocked: true,
    beadDiameterMm: 5,
    beadPitchMm: 5,
    boardPresetId: 'standardSquare',
    boardRows: 29,
    boardColumns: 29,
    paletteId: 'mard',
    availableColorIds: ['mard:A1'],
    maximumColors: 24,
    sampling: 'average',
    dithering: 'none',
    alphaEmptyThreshold: 0.1,
    colorBoost: 'none',
  };
}

function fakeResult(marker: string): PatternGenerationResult {
  return { project: { id: marker }, statistics: {} } as unknown as PatternGenerationResult;
}

interface Deferred {
  readonly promise: Promise<PatternGenerationResult>;
  readonly resolve: (result: PatternGenerationResult) => void;
  readonly reject: (error: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: (result: PatternGenerationResult) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<PatternGenerationResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeFile(): File {
  return new File(['x'], 'preview.png', { type: 'image/png' });
}

function createHarness() {
  const events: PreviewCoordinatorEvent[] = [];
  const generations: {
    request: PreviewGenerationRequest;
    signal: AbortSignal;
    settle: Deferred;
  }[] = [];
  const coordinator = createPreviewCoordinator({
    generate(request, signal) {
      const settle = deferred();
      generations.push({ request, signal, settle });
      return settle.promise;
    },
    onEvent(event) {
      events.push(event);
    },
  });
  return { coordinator, events, generations };
}

test('a new request aborts the superseded one and drops its late result', async () => {
  const { coordinator, events, generations } = createHarness();
  const firstId = coordinator.request({ file: fakeFile(), settings: fakeSettings() });
  const secondId = coordinator.request({ file: fakeFile(), settings: fakeSettings() });

  assert.equal(firstId, 1);
  assert.equal(secondId, 2);
  assert.equal(generations[0]?.signal.aborted, true);
  assert.equal(generations[1]?.signal.aborted, false);
  assert.deepEqual(
    events.map((event) => event.type),
    ['started', 'started'],
  );

  generations[0]?.settle.resolve(fakeResult('stale'));
  await Promise.resolve();
  assert.equal(
    events.some((event) => event.type === 'succeeded'),
    false,
  );

  generations[1]?.settle.resolve(fakeResult('fresh'));
  await Promise.resolve();
  const succeeded = events.filter((event) => event.type === 'succeeded');
  assert.equal(succeeded.length, 1);
  assert.equal(succeeded[0]?.requestId, secondId);
  assert.equal(coordinator.activeRequestId(), null);
  coordinator.destroy();
});

test('a late failure from a superseded request is dropped without error events', async () => {
  const { coordinator, events, generations } = createHarness();
  coordinator.request({ file: fakeFile(), settings: fakeSettings() });
  const secondId = coordinator.request({ file: fakeFile(), settings: fakeSettings() });

  generations[0]?.settle.reject(new Error('stale failure'));
  await Promise.resolve();
  assert.equal(
    events.some((event) => event.type === 'failed'),
    false,
  );

  generations[1]?.settle.resolve(fakeResult('fresh'));
  await Promise.resolve();
  assert.equal(events.at(-1)?.type, 'succeeded');
  assert.equal(events.at(-1)?.requestId, secondId);
  coordinator.destroy();
});

test('cancel aborts silently: no failure event and late completions stay dropped', async () => {
  const { coordinator, events, generations } = createHarness();
  coordinator.request({ file: fakeFile(), settings: fakeSettings() });
  coordinator.cancel();

  assert.equal(generations[0]?.signal.aborted, true);
  assert.equal(coordinator.activeRequestId(), null);

  generations[0]?.settle.reject(new DOMException('请求已取消。', 'AbortError'));
  await Promise.resolve();
  generations[0]?.settle.resolve(fakeResult('stale'));
  await Promise.resolve();
  assert.deepEqual(
    events.map((event) => event.type),
    ['started'],
  );
  coordinator.destroy();
});

test('a genuine failure is reported once so the caller can keep the previous preview', async () => {
  const { coordinator, events, generations } = createHarness();
  const requestId = coordinator.request({ file: fakeFile(), settings: fakeSettings() });
  const failure = new Error('服务暂时不可用');

  generations[0]?.settle.reject(failure);
  await Promise.resolve();
  assert.deepEqual(
    events.map((event) => event.type),
    ['started', 'failed'],
  );
  const failed = events[1];
  assert.equal(failed?.type, 'failed');
  if (failed?.type === 'failed') {
    assert.equal(failed.error, failure);
    assert.equal(failed.requestId, requestId);
  }
  assert.equal(coordinator.activeRequestId(), null);
  coordinator.destroy();
});

test('destroy aborts in-flight work and silences every late settlement', async () => {
  const { coordinator, events, generations } = createHarness();
  coordinator.request({ file: fakeFile(), settings: fakeSettings() });
  coordinator.destroy();

  assert.equal(generations[0]?.signal.aborted, true);
  generations[0]?.settle.resolve(fakeResult('stale'));
  await Promise.resolve();
  assert.deepEqual(
    events.map((event) => event.type),
    ['started'],
  );
  assert.throws(
    () => coordinator.request({ file: fakeFile(), settings: fakeSettings() }),
    /预览协调器已销毁/u,
  );
});
