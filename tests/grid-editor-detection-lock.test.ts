import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { renderApp } from '../src/app';
import { mountGridEditor } from '../src/features/grid-editor/gridEditor';

test('an active detection rejects controller and keyboard actions that change the grid', () => {
  const harness = createEditorHarness();
  const requests: RequestInit[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    requests.push(init ?? {});
    return new Promise<Response>(() => undefined);
  }) as typeof fetch;

  try {
    const controller = mountGridEditor(harness.root);
    controller.setImage(TEST_IMAGE);
    const overlay = requiredOverlay(harness.root);
    const moveHandle = overlay.querySelector<SVGElement>('[data-grid-handle="move"]');
    assert.ok(moveHandle);
    assert.equal(requests.length, 1);

    controller.redetect();
    controller.resetSelection();
    assert.equal(controller.adjustDimensions(23, 22), false);
    moveHandle.dispatchEvent(
      new harness.window.KeyboardEvent('keydown', {
        bubbles: true,
        key: 'ArrowRight',
      }),
    );

    assert.equal(requests.length, 1);
    assert.equal(overlay.getAttribute('aria-disabled'), 'true');
    assert.equal(overlay.querySelectorAll('[data-grid-handle][tabindex="0"]').length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    harness.close();
  }
});

test('a failed detection restores grid editing and allows a new recognition', async () => {
  const harness = createEditorHarness();
  const originalFetch = globalThis.fetch;
  let rejectFirst!: (error: unknown) => void;
  const firstRequest = new Promise<Response>((_resolve, reject) => {
    rejectFirst = reject;
  });
  const requests: RequestInit[] = [];
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    requests.push(init ?? {});
    return requests.length === 1 ? firstRequest : new Promise<Response>(() => undefined);
  }) as typeof fetch;
  let resolveUnlocked!: () => void;
  const unlocked = new Promise<void>((resolve) => {
    resolveUnlocked = resolve;
  });

  try {
    const controller = mountGridEditor(harness.root, {
      onDetectionChange(detecting) {
        if (!detecting) {
          resolveUnlocked();
        }
      },
    });
    controller.setImage(TEST_IMAGE);
    assert.equal(requiredOverlay(harness.root).getAttribute('aria-disabled'), 'true');

    rejectFirst(new Error('recognition failed'));
    await unlocked;

    const overlay = requiredOverlay(harness.root);
    assert.equal(overlay.getAttribute('aria-disabled'), 'false');
    assert.ok(overlay.querySelectorAll('[data-grid-handle][tabindex="0"]').length > 0);

    controller.redetect();
    assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    harness.close();
  }
});

test('starting recognition cancels an already captured grid gesture', async () => {
  const harness = createEditorHarness();
  const originalFetch = globalThis.fetch;
  let rejectFirst!: (error: unknown) => void;
  const firstRequest = new Promise<Response>((_resolve, reject) => {
    rejectFirst = reject;
  });
  const requests: RequestInit[] = [];
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    requests.push(init ?? {});
    return requests.length === 1 ? firstRequest : new Promise<Response>(() => undefined);
  }) as typeof fetch;
  let resolveUnlocked!: () => void;
  const unlocked = new Promise<void>((resolve) => {
    resolveUnlocked = resolve;
  });

  try {
    const controller = mountGridEditor(harness.root, {
      onDetectionChange(detecting) {
        if (!detecting) {
          resolveUnlocked();
        }
      },
    });
    controller.setImage(TEST_IMAGE);
    rejectFirst(new Error('recognition failed'));
    await unlocked;

    const overlay = requiredOverlay(harness.root);
    const moveHandle = overlay.querySelector<SVGElement>('[data-grid-handle="move"]');
    assert.ok(moveHandle);
    moveHandle.dispatchEvent(
      new harness.window.PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 0,
        clientY: 0,
        pointerId: 7,
      }),
    );

    controller.redetect();
    const activeSignal = requests[1]?.signal;
    assert.ok(activeSignal);
    overlay.dispatchEvent(
      new harness.window.PointerEvent('pointermove', {
        bubbles: true,
        clientX: 1,
        clientY: 1,
        pointerId: 7,
      }),
    );
    overlay.dispatchEvent(
      new harness.window.PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 7,
      }),
    );

    assert.equal(requests.length, 2);
    assert.equal(activeSignal.aborted, false);
  } finally {
    globalThis.fetch = originalFetch;
    harness.close();
  }
});

const TEST_IMAGE = {
  file: new File(['chart'], 'chart.png', { type: 'image/png' }),
  fileName: 'chart.png',
  objectUrl: 'blob:chart',
  naturalImage: { width: 1440, height: 1819 },
};

interface EditorHarness {
  readonly window: Window;
  readonly root: HTMLElement;
  readonly close: () => void;
}

function createEditorHarness(): EditorHarness {
  const window = new Window();
  const globals = globalThis as unknown as Record<string, unknown>;
  const replacements: Record<string, unknown> = {
    window,
    document: window.document,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLButtonElement: window.HTMLButtonElement,
    HTMLImageElement: window.HTMLImageElement,
    HTMLInputElement: window.HTMLInputElement,
    PointerEvent: window.PointerEvent,
    SVGElement: window.SVGElement,
    SVGSVGElement: window.SVGSVGElement,
    ResizeObserver: window.ResizeObserver,
    DOMException: window.DOMException,
  };
  const previous = new Map(Object.keys(replacements).map((key) => [key, globals[key]] as const));
  Object.assign(globals, replacements);
  window.document.body.innerHTML = renderApp();
  const root = window.document.querySelector<HTMLElement>('[data-chart-workspace]');
  assert.ok(root);

  return {
    window,
    root,
    close() {
      window.close();
      for (const [key, value] of previous) {
        globals[key] = value;
      }
    },
  };
}

function requiredOverlay(root: HTMLElement): SVGSVGElement {
  const overlay = root.querySelector<SVGSVGElement>('[data-editor-overlay]');
  assert.ok(overlay);
  return overlay;
}
