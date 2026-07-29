import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { calculateStatistics, type BeadProject } from '../src/domain/project';
import { renderApp } from '../src/app';
import { createPreviewView } from '../src/features/preview-workspace/previewView';

test('preview mode changes redraw the visible pattern once and defer hidden pattern work', () => {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = renderApp();
  const root = document.querySelector<HTMLElement>('[data-preview-workspace]');
  const slot = document.querySelector<HTMLElement>('[data-preview-canvas-slot]');
  const patternCanvas = document.querySelector<HTMLCanvasElement>('[data-preview-canvas]');
  const originalCanvas = document.querySelector<HTMLCanvasElement>(
    '[data-preview-original-canvas]',
  );
  assert.ok(root);
  assert.ok(slot);
  assert.ok(patternCanvas);
  assert.ok(originalCanvas);

  defineClientSize(slot, 562, 320);
  defineClientSize(patternCanvas, 562, 320);
  defineClientSize(originalCanvas, 562, 320);
  let patternDrawCount = 0;
  Object.defineProperty(patternCanvas, 'getContext', {
    configurable: true,
    value: () =>
      recordingContext(() => {
        patternDrawCount += 1;
      }),
  });

  const view = createPreviewView({
    root,
    colorHexById: new Map([['mard:A14', '#445566']]),
    colorCodeById: new Map([['mard:A14', 'A14']]),
    onShowOriginal() {},
  });
  view.drawPreview(projectFixture());
  assert.equal(patternDrawCount, 1);

  view.setRenderMode('numbered');
  view.applyCompareView('pattern');
  assert.equal(patternDrawCount, 2);

  view.applyCompareView('original');
  view.setRenderMode('rounded');
  assert.equal(patternDrawCount, 2);
  view.applyCompareView('pattern');
  assert.equal(patternDrawCount, 3);

  window.close();
});

test('completed preview results measure the canvas after the status row leaves the layout', () => {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = renderApp();
  const root = document.querySelector<HTMLElement>('[data-preview-workspace]');
  const slot = document.querySelector<HTMLElement>('[data-preview-canvas-slot]');
  const stack = document.querySelector<HTMLElement>('[data-preview-canvas-stack]');
  const status = document.querySelector<HTMLElement>('[data-preview-status]');
  const patternCanvas = document.querySelector<HTMLCanvasElement>('[data-preview-canvas]');
  assert.ok(root);
  assert.ok(slot);
  assert.ok(stack);
  assert.ok(status);
  assert.ok(patternCanvas);

  Object.defineProperties(slot, {
    clientWidth: { configurable: true, value: 928 },
    clientHeight: {
      configurable: true,
      get: () => (status.dataset.state === 'done' ? 355 : 323),
    },
  });
  defineClientSize(patternCanvas, 928, 355);
  Object.defineProperty(patternCanvas, 'getContext', {
    configurable: true,
    value: () => recordingContext(() => {}),
  });

  const project = projectFixture();
  const view = createPreviewView({
    root,
    colorHexById: new Map([['mard:A14', '#445566']]),
    colorCodeById: new Map([['mard:A14', 'A14']]),
    onShowOriginal() {},
  });
  view.setStatusText('已更新图纸', { hasResult: true, showBadge: false });
  assert.equal(status.dataset.state, 'message');

  view.syncResult({
    project,
    statistics: calculateStatistics(project.cells),
    canReturnToEditor: false,
    generationActive: false,
  });

  assert.equal(status.dataset.state, 'done');
  assert.equal(stack.style.blockSize, '355px');
  window.close();
});

function defineClientSize(element: Element, width: number, height: number): void {
  Object.defineProperties(element, {
    clientWidth: { configurable: true, value: width },
    clientHeight: { configurable: true, value: height },
  });
}

function recordingContext(onClear: () => void): CanvasRenderingContext2D {
  return {
    save() {},
    restore() {},
    scale() {},
    clearRect() {
      onClear();
    },
    fillRect() {},
    beginPath() {},
    arc() {},
    fill() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    quadraticCurveTo() {},
    closePath() {},
    fillText() {},
  } as unknown as CanvasRenderingContext2D;
}

function projectFixture(): BeadProject {
  const rows = 41;
  const columns = 72;
  return {
    schemaVersion: '1.0',
    id: 'preview-view-fixture',
    createdAt: '2026-07-28T00:00:00.000Z',
    updatedAt: '2026-07-28T00:00:00.000Z',
    mode: 'photo',
    source: {
      fileName: 'motorcycle.png',
      mimeType: 'image/png',
      naturalWidth: 1440,
      naturalHeight: 820,
      sha256: '3'.repeat(64),
      crop: { x: 0, y: 0, width: 1440, height: 820 },
      rotation: 0,
    },
    grid: {
      rows,
      columns,
      aspectLocked: true,
      beadDiameterMm: 5,
      beadPitchMm: 5,
      boardPresetId: 'standardSquare',
      boardRows: 29,
      boardColumns: 29,
    },
    palette: {
      paletteId: 'mard',
      paletteVersion: '2026-07-24',
      availableColorIds: ['mard:A14'],
      maximumColors: 12,
    },
    generation: {
      sampling: 'average',
      colorDistance: 'ciede2000',
      dithering: 'none',
      alphaEmptyThreshold: 0.1,
    },
    cells: Array.from({ length: rows }, () =>
      Array.from({ length: columns }, () => ({
        kind: 'bead' as const,
        colorId: 'mard:A14',
      })),
    ),
    revision: 1,
  };
}
