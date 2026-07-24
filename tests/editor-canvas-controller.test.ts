import assert from 'node:assert/strict';
import test from 'node:test';

import type { MatrixCellChange } from '../src/domain/history';
import type { BeadCell, BeadProject } from '../src/domain/project';
import {
  mountPatternCanvas,
  type PatternCanvasController,
} from '../src/features/pattern-editor/canvasEditor';
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

interface PointerOptions {
  readonly pointerId: number;
  readonly row: number;
  readonly column: number;
  readonly pointerType?: string;
}

interface CommitRecord {
  readonly cells: readonly (readonly BeadCell[])[];
  readonly changes: readonly MatrixCellChange[];
}

function createHarness(
  echoProjectOnCommit = false,
  initialProject = project(),
): {
  readonly canvas: FakeCanvas;
  readonly commits: CommitRecord[];
  readonly statuses: string[];
  readonly pointer: (type: string, options: PointerOptions) => void;
  readonly zoomIn: () => void;
  readonly actualSize: () => void;
  readonly jumpToCell: (row: number, column: number) => void;
  readonly setProject: (project: BeadProject) => void;
  readonly setColor: (colorId: string) => void;
  readonly setReverseView: (reverse: boolean) => void;
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
  });

  return {
    canvas,
    commits,
    statuses,
    pointer(type, options) {
      const cellSize = 20;
      canvas.dispatch(type, {
        pointerId: options.pointerId,
        pointerType: options.pointerType ?? 'mouse',
        button: type === 'pointermove' ? -1 : 0,
        clientX: 20 + (options.column + 0.5) * cellSize,
        clientY: 20 + (options.row + 0.5) * cellSize,
        altKey: false,
        preventDefault() {},
      });
    },
    zoomIn() {
      controller.zoomIn();
    },
    actualSize() {
      controller.actualSize();
    },
    jumpToCell(row, column) {
      controller.jumpToCell(row, column);
    },
    setProject(nextProject) {
      controller.setProject(nextProject);
    },
    setColor(colorId) {
      controller.setColor(colorId);
    },
    setReverseView(reverse) {
      controller.setReverseView(reverse);
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
  focusCount = 0;

  getContext(): CanvasRenderingContext2D {
    return {
      setTransform() {},
      fillRect() {},
      strokeRect: (x: number, y: number, width: number, height: number) => {
        this.strokeRects.push({ x, y, width, height });
      },
      beginPath() {},
      rect() {},
      clip() {},
      save() {},
      restore() {},
      arc() {},
      fill() {},
    } as unknown as CanvasRenderingContext2D;
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
