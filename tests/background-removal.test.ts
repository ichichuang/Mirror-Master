import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activateBackgroundRemovalVariant,
  guardBackgroundRemovalChange,
  resolveBackgroundRemovalActionState,
} from '../src/features/background-removal/backgroundRemovalFlow';
import {
  ImageTransformApiError,
  removeImageBackground,
} from '../src/features/background-removal/client';
import {
  createBackgroundRemovalCoordinator,
  type BackgroundRemovalCoordinatorEvent,
  type BackgroundRemovalRequest,
} from '../src/features/background-removal/backgroundRemovalCoordinator';
import {
  createSourceImageSession,
  type SelectedImage,
} from '../src/features/background-removal/sourceImageSession';

function fakeImage(marker: string): SelectedImage {
  return {
    file: new File([marker], `${marker}.png`, { type: 'image/png' }),
    objectUrl: `blob:${marker}`,
    width: 12,
    height: 8,
    image: { dataset: { marker } } as unknown as HTMLImageElement,
    mimeType: 'image/png',
  };
}

interface Deferred {
  readonly promise: Promise<SelectedImage>;
  readonly resolve: (image: SelectedImage) => void;
  readonly reject: (error: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: (image: SelectedImage) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<SelectedImage>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

test('source image session switches between one cached foreground and the original', () => {
  const revoked: string[] = [];
  const original = fakeImage('original');
  const firstForeground = fakeImage('foreground-1');
  const replacementForeground = fakeImage('foreground-2');
  const session = createSourceImageSession(original, {
    revokeObjectUrl: (objectUrl) => revoked.push(objectUrl),
  });

  assert.equal(session.active(), original);
  assert.equal(session.activeVariant(), 'original');
  assert.equal(session.hasForeground(), false);

  session.cacheForeground(firstForeground);
  assert.equal(session.hasForeground(), true);
  assert.equal(session.activate('foreground'), firstForeground);
  assert.equal(session.activeVariant(), 'foreground');
  assert.equal(session.activate('original'), original);

  session.cacheForeground(replacementForeground);
  assert.deepEqual(revoked, ['blob:foreground-1']);
  assert.equal(session.activate('foreground'), replacementForeground);
});

test('source image session revokes every owned Object URL exactly once', () => {
  const revoked: string[] = [];
  const session = createSourceImageSession(fakeImage('original'), {
    revokeObjectUrl: (objectUrl) => revoked.push(objectUrl),
  });
  session.cacheForeground(fakeImage('foreground'));

  session.dispose();
  session.dispose();

  assert.deepEqual(revoked.sort(), ['blob:foreground', 'blob:original']);
  assert.throws(() => session.active(), /已释放/u);
});

test('coordinator prevents duplicate requests and reports stable transitions', async () => {
  const events: BackgroundRemovalCoordinatorEvent[] = [];
  const removals: Array<{
    input: BackgroundRemovalRequest;
    signal: AbortSignal;
    deferred: Deferred;
  }> = [];
  let sessionId = 7;
  const coordinator = createBackgroundRemovalCoordinator({
    remove(input, signal) {
      const pending = deferred();
      removals.push({ input, signal, deferred: pending });
      return pending.promise;
    },
    currentSourceSessionId: () => sessionId,
    onDiscard: () => undefined,
    onEvent: (event) => events.push(event),
  });
  const request: BackgroundRemovalRequest = {
    sourceSessionId: sessionId,
    image: fakeImage('original'),
  };

  assert.equal(coordinator.request(request), 1);
  assert.equal(coordinator.request(request), null);
  assert.deepEqual(
    events.map((event) => event.type),
    ['started'],
  );

  removals[0]?.deferred.resolve(fakeImage('foreground'));
  await Promise.resolve();

  assert.deepEqual(
    events.map((event) => event.type),
    ['started', 'succeeded'],
  );
  assert.equal(coordinator.activeRequestId(), null);
});

test('cancel aborts the request and discards a late successful result', async () => {
  const events: BackgroundRemovalCoordinatorEvent[] = [];
  const discarded: SelectedImage[] = [];
  const pending = deferred();
  const coordinator = createBackgroundRemovalCoordinator({
    remove: (_input, signal) => {
      assert.equal(signal.aborted, false);
      return pending.promise;
    },
    currentSourceSessionId: () => 1,
    onDiscard: (image) => discarded.push(image),
    onEvent: (event) => events.push(event),
  });

  coordinator.request({ sourceSessionId: 1, image: fakeImage('original') });
  coordinator.cancel();
  const late = fakeImage('late');
  pending.resolve(late);
  await Promise.resolve();

  assert.deepEqual(
    events.map((event) => event.type),
    ['started'],
  );
  assert.deepEqual(discarded, [late]);
  assert.equal(coordinator.activeRequestId(), null);
});

test('an image replacement rejects a late result even without an explicit cancel', async () => {
  const events: BackgroundRemovalCoordinatorEvent[] = [];
  const discarded: SelectedImage[] = [];
  const pending = deferred();
  let sessionId = 1;
  const coordinator = createBackgroundRemovalCoordinator({
    remove: () => pending.promise,
    currentSourceSessionId: () => sessionId,
    onDiscard: (image) => discarded.push(image),
    onEvent: (event) => events.push(event),
  });

  coordinator.request({ sourceSessionId: 1, image: fakeImage('original') });
  sessionId = 2;
  const late = fakeImage('late');
  pending.resolve(late);
  await Promise.resolve();

  assert.deepEqual(
    events.map((event) => event.type),
    ['started'],
  );
  assert.deepEqual(discarded, [late]);
  assert.equal(coordinator.activeRequestId(), null);
});

test('foreground activation regenerates exactly once and leaves settings unchanged', () => {
  const session = createSourceImageSession(fakeImage('original'), {
    revokeObjectUrl: () => undefined,
  });
  const foreground = fakeImage('foreground');
  session.cacheForeground(foreground);
  const settings = Object.freeze({
    rotation: 90,
    crop: Object.freeze({ x: 5, y: 8, width: 80, height: 70 }),
    rows: 48,
    columns: 44,
    paletteId: 'mard',
    availableColorIds: Object.freeze(['mard:A1', 'mard:B2']),
    beadDiameterMm: 5,
    boardPresetId: 'standardSquare',
  });
  const before = JSON.stringify(settings);
  const active: SelectedImage[] = [];
  let regenerations = 0;

  activateBackgroundRemovalVariant({
    session,
    variant: 'foreground',
    onActiveImage: (image) => active.push(image),
    regenerate: () => {
      regenerations += 1;
    },
  });

  assert.deepEqual(active, [foreground]);
  assert.equal(regenerations, 1);
  assert.equal(JSON.stringify(settings), before);
});

test('original restoration uses the cached source and regenerates exactly once', () => {
  const original = fakeImage('original');
  const session = createSourceImageSession(original, {
    revokeObjectUrl: () => undefined,
  });
  session.cacheForeground(fakeImage('foreground'));
  session.activate('foreground');
  let regenerations = 0;

  const restored = activateBackgroundRemovalVariant({
    session,
    variant: 'original',
    onActiveImage: () => undefined,
    regenerate: () => {
      regenerations += 1;
    },
  });

  assert.equal(restored, original);
  assert.equal(session.activeVariant(), 'original');
  assert.equal(regenerations, 1);
});

test('edited projects use the existing confirmation path before source changes', () => {
  const calls: string[] = [];

  guardBackgroundRemovalChange({
    hasEditedCells: true,
    openConfirmation(request) {
      calls.push(request.title);
      request.onContinue();
    },
    apply: () => calls.push('apply'),
  });

  assert.deepEqual(calls, ['一键去背景会替换当前编辑', 'apply']);
});

test('capability gating keeps background removal visible and explains unavailable states', () => {
  assert.deepEqual(
    resolveBackgroundRemovalActionState({
      capabilityAvailable: false,
      hasSource: true,
      hasForeground: false,
      activeVariant: 'original',
      busy: false,
    }),
    {
      disabled: true,
      label: '去背景暂不可用',
      compactLabel: '不可用',
      unavailableMessage: '去背景服务暂不可用，请稍后重试。',
    },
  );
  assert.deepEqual(
    resolveBackgroundRemovalActionState({
      capabilityAvailable: true,
      hasSource: false,
      hasForeground: false,
      activeVariant: 'original',
      busy: false,
    }),
    {
      disabled: true,
      label: '一键去背景',
      compactLabel: '去背',
      unavailableMessage: null,
    },
  );
  assert.deepEqual(
    resolveBackgroundRemovalActionState({
      capabilityAvailable: true,
      hasSource: true,
      hasForeground: false,
      activeVariant: 'original',
      busy: true,
    }),
    {
      disabled: true,
      label: '正在去背景…',
      compactLabel: '处理中',
      unavailableMessage: null,
    },
  );
  assert.deepEqual(
    resolveBackgroundRemovalActionState({
      capabilityAvailable: true,
      hasSource: true,
      hasForeground: true,
      activeVariant: 'foreground',
      busy: false,
    }),
    {
      disabled: false,
      label: '恢复原图',
      compactLabel: '恢复',
      unavailableMessage: null,
    },
  );
  assert.deepEqual(
    resolveBackgroundRemovalActionState({
      capabilityAvailable: true,
      hasSource: true,
      hasForeground: true,
      activeVariant: 'original',
      busy: false,
    }),
    {
      disabled: false,
      label: '使用去背景图',
      compactLabel: '使用去背图',
      unavailableMessage: null,
    },
  );
});

test('background removal client sends one file and validates the RGBA PNG response contract', async () => {
  const source = fakeImage('original').file;
  const output = new Blob(['png'], { type: 'image/png' });
  const requests: Array<{ input: string; init: RequestInit }> = [];

  const result = await removeImageBackground(source, undefined, async (input, init) => {
    requests.push({ input, init: init ?? {} });
    return new Response(output, {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    });
  });

  assert.equal(result.type, 'image/png');
  assert.equal(result.size, output.size);
  assert.equal(requests[0]?.input, '/api/image/remove-background');
  assert.equal(requests[0]?.init.method, 'POST');
  const body = requests[0]?.init.body;
  assert.ok(body instanceof FormData);
  assert.equal(body.get('file'), source);
});

test('background removal client preserves structured Chinese errors', async () => {
  await assert.rejects(
    removeImageBackground(fakeImage('original').file, undefined, async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 'BACKGROUND_REMOVAL_FAILED',
            message: '无法完成一键去背景。原图和当前图纸已保留，请稍后重试。',
          },
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }),
    (error: unknown) =>
      error instanceof ImageTransformApiError &&
      error.code === 'BACKGROUND_REMOVAL_FAILED' &&
      /原图和当前图纸已保留/u.test(error.message),
  );
});
