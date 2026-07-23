import { detectPixelanimGrid } from '../grid-detection/detector';
import {
  clamp,
  createIntegerGridSelection,
  createIntegerSelectionFromRectangle,
  getMaximumCellSize,
  translateIntegerGridSelection,
} from '../grid-selection/geometry';
import type {
  IntegerGridSelection,
  NaturalImageSize,
} from '../grid-selection/types';

type HandleType = 'move' | 'n' | 'e' | 's' | 'w' | 'nw' | 'ne' | 'se' | 'sw';
type ZoomMode = 'fit' | 'manual';
type EditorView = 'original' | 'result';

interface NaturalPoint {
  readonly x: number;
  readonly y: number;
}

interface GridEditorImage {
  readonly file: File;
  readonly fileName: string;
  readonly objectUrl: string;
  readonly naturalImage: NaturalImageSize;
}

interface ActivePointer {
  readonly pointerId: number;
  readonly kind: 'draw' | 'handle';
  readonly handle: HandleType | null;
  readonly startPoint: NaturalPoint;
  readonly startSelection: IntegerGridSelection | null;
  moved: boolean;
}

interface GridEditorElements {
  readonly frame: HTMLElement;
  readonly stage: HTMLElement;
  readonly image: HTMLImageElement;
  readonly overlay: SVGSVGElement;
  readonly hint: HTMLElement;
  readonly live: HTMLElement;
  readonly originalTab: HTMLButtonElement;
  readonly resultTab: HTMLButtonElement;
  readonly returnButton: HTMLButtonElement;
  readonly zoomFitButton: HTMLButtonElement;
  readonly zoomOutButton: HTMLButtonElement;
  readonly zoomActualButton: HTMLButtonElement;
  readonly zoomInButton: HTMLButtonElement;
  readonly zoomStatus: HTMLElement;
}

export interface GridEditorLifecycle {
  readonly onSelectionChange?: (selection: IntegerGridSelection | null) => void;
}

export interface GridEditorController {
  readonly setImage: (image: GridEditorImage) => void;
  readonly redetect: () => void;
  readonly resetSelection: () => void;
  readonly clearResult: () => void;
  readonly showResult: (canvas: HTMLCanvasElement) => void;
  readonly showOriginal: () => void;
  readonly setMessage: (message: string) => void;
  readonly getSelection: () => IntegerGridSelection | null;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;
const HANDLE_TARGET_CSS_SIZE = 44;
const HANDLE_VISUAL_CSS_SIZE = 12;

const HANDLE_LABELS: Record<HandleType, string> = {
  move: '移动整个网格选区',
  n: '调整网格上边缘',
  e: '调整网格右边缘',
  s: '调整网格下边缘',
  w: '调整网格左边缘',
  nw: '调整网格左上角',
  ne: '调整网格右上角',
  se: '调整网格右下角',
  sw: '调整网格左下角',
};

export function mountGridEditor(
  root: HTMLElement,
  lifecycle: GridEditorLifecycle = {},
): GridEditorController {
  const elements = getElements(root);
  let currentImage: GridEditorImage | null = null;
  let selection: IntegerGridSelection | null = null;
  let detectedSeed: IntegerGridSelection | null = null;
  let activePointer: ActivePointer | null = null;
  let resultCanvas: HTMLCanvasElement | null = null;
  let view: EditorView = 'original';
  let zoomMode: ZoomMode = 'fit';
  let zoomScale = 1;
  let detectionVersion = 0;
  let pendingResizeFrame: number | null = null;

  const resizeObserver =
    'ResizeObserver' in window
      ? new ResizeObserver(() => {
          if (pendingResizeFrame !== null) {
            return;
          }

          pendingResizeFrame = window.requestAnimationFrame(() => {
            pendingResizeFrame = null;

            if (zoomMode === 'fit') {
              updateFitScale();
              renderStage();
            }
          });
        })
      : null;

  resizeObserver?.observe(elements.frame);

  elements.zoomFitButton.addEventListener('click', () => {
    zoomMode = 'fit';
    updateFitScale();
    renderStage();
    announce('已适合窗口显示。');
  });

  elements.zoomOutButton.addEventListener('click', () => {
    setManualZoom(zoomScale / 1.25);
  });

  elements.zoomActualButton.addEventListener('click', () => {
    setManualZoom(1);
  });

  elements.zoomInButton.addEventListener('click', () => {
    setManualZoom(zoomScale * 1.25);
  });

  elements.originalTab.addEventListener('click', showOriginal);
  elements.returnButton.addEventListener('click', showOriginal);
  elements.resultTab.addEventListener('click', () => {
    if (resultCanvas) {
      setView('result');
    }
  });

  elements.overlay.addEventListener('pointerdown', handlePointerDown);
  elements.overlay.addEventListener('pointermove', handlePointerMove);
  elements.overlay.addEventListener('pointerup', finishPointer);
  elements.overlay.addEventListener('pointercancel', finishPointer);
  elements.overlay.addEventListener('keydown', handleOverlayKeyDown);

  function setImage(image: GridEditorImage): void {
    detectionVersion += 1;
    activePointer = null;
    currentImage = image;
    selection = null;
    detectedSeed = null;
    zoomMode = 'fit';
    view = 'original';
    clearResult();
    elements.image.src = image.objectUrl;
    elements.image.alt = `${image.fileName} 的原图`;
    elements.overlay.setAttribute(
      'viewBox',
      `0 0 ${String(image.naturalImage.width)} ${String(image.naturalImage.height)}`,
    );
    elements.overlay.hidden = false;
    elements.overlay.tabIndex = 0;
    elements.overlay.setAttribute('aria-label', '34 × 27 网格选区编辑区');
    updateFitScale();
    renderStage();
    lifecycle.onSelectionChange?.(null);
    void runDetection();
    window.requestAnimationFrame(() => {
      if (zoomMode === 'fit') {
        updateFitScale();
        renderStage();
      }
    });
  }

  function redetect(): void {
    if (!currentImage) {
      return;
    }

    selection = null;
    detectedSeed = null;
    lifecycle.onSelectionChange?.(null);
    renderOverlay();
    void runDetection();
  }

  function resetSelection(): void {
    if (!currentImage) {
      return;
    }

    selection = detectedSeed
      ? createIntegerGridSelection(
          detectedSeed.naturalImage,
          detectedSeed.left,
          detectedSeed.top,
          detectedSeed.cellSize,
        )
      : null;
    renderOverlay();
    lifecycle.onSelectionChange?.(selection);

    if (selection) {
      setHint('网格已识别；可直接生成镜像，也可拖动调整。');
    } else {
      setHint('请在图片上拖出网格区域。');
    }
  }

  async function runDetection(): Promise<void> {
    const image = currentImage;

    if (!image) {
      return;
    }

    detectionVersion += 1;
    const currentVersion = detectionVersion;
    setHint('正在识别 34 × 27 网格…');

    try {
      const outcome = await detectPixelanimGrid({
        file: image.file,
        naturalImage: image.naturalImage,
      });

      if (currentVersion !== detectionVersion || currentImage?.file !== image.file) {
        return;
      }

      if (outcome.ok) {
        const nextSelection = createIntegerSelectionFromRectangle(
          image.naturalImage,
          outcome.rectangle,
        );

        if (nextSelection) {
          selection = nextSelection;
          detectedSeed = nextSelection;
          renderOverlay();
          lifecycle.onSelectionChange?.(selection);
          setHint('网格已识别；可直接生成镜像，也可拖动调整。');
          return;
        }
      }

      enterManualDrawMode();
    } catch {
      if (currentVersion === detectionVersion && currentImage?.file === image.file) {
        enterManualDrawMode();
      }
    }
  }

  function enterManualDrawMode(): void {
    selection = null;
    detectedSeed = null;
    renderOverlay();
    lifecycle.onSelectionChange?.(null);

    if (currentImage && getMaximumCellSize(currentImage.naturalImage) < 1) {
      setHint('图片尺寸不足，无法容纳 34 × 27 网格。');
      return;
    }

    setHint('未识别到网格，请直接在图片上拖出网格区域。');
  }

  function handlePointerDown(event: PointerEvent): void {
    if (!currentImage || view !== 'original' || event.button !== 0) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const handle = parseHandle(target?.getAttribute('data-grid-handle'));

    if (!selection && !handle) {
      activePointer = {
        pointerId: event.pointerId,
        kind: 'draw',
        handle: null,
        startPoint: toNaturalPoint(event),
        startSelection: null,
        moved: false,
      };
    } else if (selection && handle) {
      activePointer = {
        pointerId: event.pointerId,
        kind: 'handle',
        handle,
        startPoint: toNaturalPoint(event),
        startSelection: selection,
        moved: false,
      };
    } else {
      return;
    }

    elements.overlay.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!activePointer || activePointer.pointerId !== event.pointerId || !currentImage) {
      return;
    }

    const point = toNaturalPoint(event);
    const movement =
      Math.abs(point.x - activePointer.startPoint.x) +
      Math.abs(point.y - activePointer.startPoint.y);

    if (movement < 0.5) {
      return;
    }

    activePointer.moved = true;

    if (activePointer.kind === 'draw') {
      selection = createDrawnSelection(
        currentImage.naturalImage,
        activePointer.startPoint,
        point,
      );
    } else if (activePointer.handle && activePointer.startSelection) {
      selection =
        activePointer.handle === 'move'
          ? translateIntegerGridSelection(
              activePointer.startSelection,
              point.x - activePointer.startPoint.x,
              point.y - activePointer.startPoint.y,
            )
          : resizeSelectionFromPointer(
              activePointer.startSelection,
              activePointer.handle,
              activePointer.startPoint,
              point,
            );
    }

    renderOverlay();
    lifecycle.onSelectionChange?.(selection);

    if (selection) {
      setHint('网格已调整，可以生成镜像。');
    }

    event.preventDefault();
  }

  function finishPointer(event: PointerEvent): void {
    if (!activePointer || activePointer.pointerId !== event.pointerId) {
      return;
    }

    const moved = activePointer.moved;
    activePointer = null;

    if (elements.overlay.hasPointerCapture(event.pointerId)) {
      elements.overlay.releasePointerCapture(event.pointerId);
    }

    if (!moved && !selection) {
      setHint('请拖动以绘制网格区域。');
    } else if (selection) {
      announce('网格选区已更新。');
    }
  }

  function handleOverlayKeyDown(event: KeyboardEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const handle = parseHandle(target?.getAttribute('data-grid-handle'));

    if (!selection || !handle || !event.key.startsWith('Arrow')) {
      return;
    }

    const amount = event.shiftKey ? 10 : 1;

    if (handle === 'move') {
      const delta = getMoveKeyDelta(event.key, amount);
      selection = translateIntegerGridSelection(selection, delta.x, delta.y);
    } else {
      const direction = getResizeKeyDirection(handle, event.key);

      if (direction === 0) {
        return;
      }

      selection = placeResizedSelection(
        selection,
        handle,
        selection.cellSize + direction * amount,
      );
    }

    renderOverlay();
    lifecycle.onSelectionChange?.(selection);
    setHint('网格已调整，可以生成镜像。');
    announce('网格选区已更新。');
    event.preventDefault();
  }

  function showResult(canvas: HTMLCanvasElement): void {
    clearResult();
    resultCanvas = canvas;
    resultCanvas.className = 'result-canvas';
    resultCanvas.setAttribute('aria-label', '网格单元镜像结果');
    elements.stage.append(resultCanvas);
    elements.resultTab.disabled = false;
    setView('result');
  }

  function clearResult(): void {
    if (resultCanvas) {
      resultCanvas.remove();
      resultCanvas.width = 0;
      resultCanvas.height = 0;
      resultCanvas = null;
    }

    elements.resultTab.disabled = true;

    if (view === 'result') {
      setView('original');
    } else {
      renderView();
    }
  }

  function showOriginal(): void {
    setView('original');
  }

  function setView(nextView: EditorView): void {
    view = nextView;
    renderView();
    announce(nextView === 'original' ? '已返回原图调整。' : '正在查看镜像结果。');
  }

  function setManualZoom(scale: number): void {
    zoomMode = 'manual';
    zoomScale = clamp(scale, MIN_ZOOM, MAX_ZOOM);
    renderStage();
    announce(`缩放比例 ${formatPercent(zoomScale)}。`);
  }

  function updateFitScale(): void {
    if (!currentImage) {
      zoomScale = 1;
      return;
    }

    const availableWidth = Math.max(1, elements.frame.clientWidth - 32);
    const availableHeight = Math.max(1, elements.frame.clientHeight - 32);
    zoomScale = clamp(
      Math.min(
        availableWidth / currentImage.naturalImage.width,
        availableHeight / currentImage.naturalImage.height,
      ),
      MIN_ZOOM,
      1,
    );
  }

  function renderStage(): void {
    if (!currentImage) {
      elements.stage.style.removeProperty('width');
      elements.stage.style.removeProperty('height');
      elements.zoomStatus.textContent = '适合';
      return;
    }

    elements.stage.style.width = `${String(
      currentImage.naturalImage.width * zoomScale,
    )}px`;
    elements.stage.style.height = `${String(
      currentImage.naturalImage.height * zoomScale,
    )}px`;
    elements.zoomStatus.textContent =
      zoomMode === 'fit' ? `适合 · ${formatPercent(zoomScale)}` : formatPercent(zoomScale);
    renderOverlay();
    renderView();
  }

  function renderView(): void {
    const showingResult = view === 'result' && resultCanvas !== null;
    elements.image.hidden = showingResult;
    elements.overlay.hidden = showingResult || !currentImage;

    if (resultCanvas) {
      resultCanvas.hidden = !showingResult;
    }

    elements.originalTab.ariaSelected = showingResult ? 'false' : 'true';
    elements.originalTab.tabIndex = showingResult ? -1 : 0;
    elements.resultTab.ariaSelected = showingResult ? 'true' : 'false';
    elements.resultTab.tabIndex = showingResult ? 0 : -1;
    elements.returnButton.hidden = !showingResult;
  }

  function renderOverlay(): void {
    elements.overlay.replaceChildren();

    if (!currentImage || !selection) {
      return;
    }

    const targetSize = HANDLE_TARGET_CSS_SIZE / zoomScale;
    const visualSize = HANDLE_VISUAL_CSS_SIZE / zoomScale;
    const width = selection.right - selection.left;
    const height = selection.bottom - selection.top;
    const centerX = selection.left + width / 2;
    const centerY = selection.top + height / 2;

    elements.overlay.append(
      createInteractiveRect(
        selection.left,
        selection.top,
        width,
        height,
        'move',
        'grid-move-area',
      ),
    );

    for (let index = 0; index < selection.verticalBoundaries.length; index += 1) {
      const x = selection.verticalBoundaries[index];

      if (x === undefined) {
        continue;
      }

      elements.overlay.append(
        createLine(
          x,
          selection.top,
          x,
          selection.bottom,
          index === 0 || index === selection.verticalBoundaries.length - 1,
        ),
      );
    }

    for (let index = 0; index < selection.horizontalBoundaries.length; index += 1) {
      const y = selection.horizontalBoundaries[index];

      if (y === undefined) {
        continue;
      }

      elements.overlay.append(
        createLine(
          selection.left,
          y,
          selection.right,
          y,
          index === 0 || index === selection.horizontalBoundaries.length - 1,
        ),
      );
    }

    elements.overlay.append(
      createEdgeHandle(centerX, selection.top, visualSize, targetSize, 'n'),
      createEdgeHandle(selection.right, centerY, visualSize, targetSize, 'e'),
      createEdgeHandle(centerX, selection.bottom, visualSize, targetSize, 's'),
      createEdgeHandle(selection.left, centerY, visualSize, targetSize, 'w'),
      createCornerHandle(selection.left, selection.top, visualSize, targetSize, 'nw'),
      createCornerHandle(selection.right, selection.top, visualSize, targetSize, 'ne'),
      createCornerHandle(selection.right, selection.bottom, visualSize, targetSize, 'se'),
      createCornerHandle(selection.left, selection.bottom, visualSize, targetSize, 'sw'),
    );
  }

  function toNaturalPoint(event: PointerEvent): NaturalPoint {
    if (!currentImage) {
      return { x: 0, y: 0 };
    }

    const bounds = elements.stage.getBoundingClientRect();
    const scaleX = currentImage.naturalImage.width / Math.max(bounds.width, 1);
    const scaleY = currentImage.naturalImage.height / Math.max(bounds.height, 1);

    return {
      x: clamp(
        (event.clientX - bounds.left) * scaleX,
        0,
        currentImage.naturalImage.width,
      ),
      y: clamp(
        (event.clientY - bounds.top) * scaleY,
        0,
        currentImage.naturalImage.height,
      ),
    };
  }

  function setHint(message: string): void {
    elements.hint.textContent = message;
    elements.live.textContent = message;
  }

  function announce(message: string): void {
    elements.live.textContent = message;
  }

  renderStage();
  renderView();

  return {
    setImage,
    redetect,
    resetSelection,
    clearResult,
    showResult,
    showOriginal,
    setMessage: setHint,
    getSelection: () => selection,
  };
}

function createDrawnSelection(
  naturalImage: NaturalImageSize,
  start: NaturalPoint,
  point: NaturalPoint,
): IntegerGridSelection | null {
  const cellSize = Math.round(
    Math.max(Math.abs(point.x - start.x) / 34, Math.abs(point.y - start.y) / 27),
  );

  if (cellSize < 1) {
    return null;
  }

  const width = 34 * cellSize;
  const height = 27 * cellSize;
  const left = point.x < start.x ? start.x - width : start.x;
  const top = point.y < start.y ? start.y - height : start.y;

  return createIntegerGridSelection(naturalImage, left, top, cellSize);
}

function resizeSelectionFromPointer(
  selection: IntegerGridSelection,
  handle: Exclude<HandleType, 'move'>,
  startPoint: NaturalPoint,
  point: NaturalPoint,
): IntegerGridSelection {
  const horizontalCell =
    handle.includes('w')
      ? (selection.right - point.x) / 34
      : (point.x - selection.left) / 34;
  const verticalCell =
    handle.includes('n')
      ? (selection.bottom - point.y) / 27
      : (point.y - selection.top) / 27;
  let desiredCell: number;

  if (handle.length === 1) {
    desiredCell = handle === 'e' || handle === 'w' ? horizontalCell : verticalCell;
  } else {
    desiredCell =
      Math.abs(point.x - startPoint.x) >= Math.abs(point.y - startPoint.y)
        ? horizontalCell
        : verticalCell;
  }

  return placeResizedSelection(selection, handle, desiredCell);
}

function placeResizedSelection(
  selection: IntegerGridSelection,
  handle: Exclude<HandleType, 'move'>,
  desiredCell: number,
): IntegerGridSelection {
  const maximumCell = getMaximumCellForHandle(selection, handle);
  const cellSize = clamp(Math.round(desiredCell), 1, maximumCell);
  const width = 34 * cellSize;
  const height = 27 * cellSize;
  const oldWidth = selection.right - selection.left;
  const oldHeight = selection.bottom - selection.top;
  let left = selection.left;
  let top = selection.top;

  if (handle.includes('w')) {
    left = selection.right - width;
  } else if (handle === 'n' || handle === 's') {
    left = selection.left + (oldWidth - width) / 2;
  }

  if (handle.includes('n')) {
    top = selection.bottom - height;
  } else if (handle === 'e' || handle === 'w') {
    top = selection.top + (oldHeight - height) / 2;
  }

  return (
    createIntegerGridSelection(
      selection.naturalImage,
      left,
      top,
      cellSize,
    ) ?? selection
  );
}

function getMaximumCellForHandle(
  selection: IntegerGridSelection,
  handle: Exclude<HandleType, 'move'>,
): number {
  const image = selection.naturalImage;
  const centerX = (selection.left + selection.right) / 2;
  const centerY = (selection.top + selection.bottom) / 2;
  let maxWidth: number;
  let maxHeight: number;

  if (handle.includes('w')) {
    maxWidth = selection.right;
  } else if (handle.includes('e')) {
    maxWidth = image.width - selection.left;
  } else {
    maxWidth = 2 * Math.min(centerX, image.width - centerX);
  }

  if (handle.includes('n')) {
    maxHeight = selection.bottom;
  } else if (handle.includes('s')) {
    maxHeight = image.height - selection.top;
  } else {
    maxHeight = 2 * Math.min(centerY, image.height - centerY);
  }

  return Math.max(1, Math.floor(Math.min(maxWidth / 34, maxHeight / 27)));
}

function getMoveKeyDelta(
  key: string,
  amount: number,
): { readonly x: number; readonly y: number } {
  switch (key) {
    case 'ArrowLeft':
      return { x: -amount, y: 0 };
    case 'ArrowRight':
      return { x: amount, y: 0 };
    case 'ArrowUp':
      return { x: 0, y: -amount };
    case 'ArrowDown':
      return { x: 0, y: amount };
    default:
      return { x: 0, y: 0 };
  }
}

function getResizeKeyDirection(
  handle: Exclude<HandleType, 'move'>,
  key: string,
): -1 | 0 | 1 {
  if (key === 'ArrowRight') {
    return handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
  }

  if (key === 'ArrowLeft') {
    return handle.includes('w') ? 1 : handle.includes('e') ? -1 : 0;
  }

  if (key === 'ArrowDown') {
    return handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
  }

  if (key === 'ArrowUp') {
    return handle.includes('n') ? 1 : handle.includes('s') ? -1 : 0;
  }

  return 0;
}

function createLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  outer: boolean,
): SVGLineElement {
  const line = document.createElementNS(SVG_NAMESPACE, 'line');
  line.setAttribute('x1', String(x1));
  line.setAttribute('y1', String(y1));
  line.setAttribute('x2', String(x2));
  line.setAttribute('y2', String(y2));
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  line.setAttribute('class', outer ? 'grid-boundary grid-boundary-outer' : 'grid-boundary');
  return line;
}

function createInteractiveRect(
  x: number,
  y: number,
  width: number,
  height: number,
  handle: HandleType,
  className: string,
): SVGRectElement {
  const rect = document.createElementNS(SVG_NAMESPACE, 'rect');
  rect.setAttribute('x', String(x));
  rect.setAttribute('y', String(y));
  rect.setAttribute('width', String(width));
  rect.setAttribute('height', String(height));
  rect.setAttribute('class', className);
  decorateHandle(rect, handle);
  return rect;
}

function createCornerHandle(
  x: number,
  y: number,
  visualSize: number,
  targetSize: number,
  handle: Exclude<HandleType, 'move' | 'n' | 'e' | 's' | 'w'>,
): SVGGElement {
  const group = document.createElementNS(SVG_NAMESPACE, 'g');
  const target = document.createElementNS(SVG_NAMESPACE, 'circle');
  const visual = document.createElementNS(SVG_NAMESPACE, 'rect');
  target.setAttribute('cx', String(x));
  target.setAttribute('cy', String(y));
  target.setAttribute('r', String(targetSize / 2));
  target.setAttribute('class', 'grid-corner-target');
  decorateHandle(target, handle);
  visual.setAttribute('x', String(x - visualSize / 2));
  visual.setAttribute('y', String(y - visualSize / 2));
  visual.setAttribute('width', String(visualSize));
  visual.setAttribute('height', String(visualSize));
  visual.setAttribute('rx', String(visualSize * 0.18));
  visual.setAttribute('class', 'grid-corner-visual');
  visual.setAttribute('pointer-events', 'none');
  group.append(target, visual);
  return group;
}

function createEdgeHandle(
  x: number,
  y: number,
  visualSize: number,
  targetSize: number,
  handle: 'n' | 'e' | 's' | 'w',
): SVGGElement {
  const group = document.createElementNS(SVG_NAMESPACE, 'g');
  const target = document.createElementNS(SVG_NAMESPACE, 'rect');
  const visual = document.createElementNS(SVG_NAMESPACE, 'rect');
  const horizontal = handle === 'n' || handle === 's';
  const visualWidth = horizontal ? visualSize * 1.8 : visualSize * 0.55;
  const visualHeight = horizontal ? visualSize * 0.55 : visualSize * 1.8;
  target.setAttribute('x', String(x - targetSize / 2));
  target.setAttribute('y', String(y - targetSize / 2));
  target.setAttribute('width', String(targetSize));
  target.setAttribute('height', String(targetSize));
  target.setAttribute('class', 'grid-edge-handle');
  decorateHandle(target, handle);
  visual.setAttribute('x', String(x - visualWidth / 2));
  visual.setAttribute('y', String(y - visualHeight / 2));
  visual.setAttribute('width', String(visualWidth));
  visual.setAttribute('height', String(visualHeight));
  visual.setAttribute('rx', String(Math.min(visualWidth, visualHeight) / 2));
  visual.setAttribute('class', 'grid-edge-visual');
  visual.setAttribute('pointer-events', 'none');
  group.append(target, visual);
  return group;
}

function decorateHandle(element: SVGElement, handle: HandleType): void {
  element.setAttribute('data-grid-handle', handle);
  element.setAttribute('role', 'button');
  element.setAttribute('tabindex', '0');
  element.setAttribute('aria-label', HANDLE_LABELS[handle]);
}

function parseHandle(value: string | null | undefined): HandleType | null {
  if (
    value === 'move' ||
    value === 'n' ||
    value === 'e' ||
    value === 's' ||
    value === 'w' ||
    value === 'nw' ||
    value === 'ne' ||
    value === 'se' ||
    value === 'sw'
  ) {
    return value;
  }

  return null;
}

function formatPercent(scale: number): string {
  return `${String(Math.round(scale * 100))}%`;
}

function getElements(root: HTMLElement): GridEditorElements {
  return {
    frame: getRequiredElement(root, '[data-editor-frame]', HTMLElement),
    stage: getRequiredElement(root, '[data-editor-stage]', HTMLElement),
    image: getRequiredElement(root, '[data-editor-image]', HTMLImageElement),
    overlay: getRequiredElement(root, '[data-editor-overlay]', SVGSVGElement),
    hint: getRequiredElement(root, '[data-editor-hint]', HTMLElement),
    live: getRequiredElement(root, '[data-editor-live]', HTMLElement),
    originalTab: getRequiredElement(root, '[data-view-original]', HTMLButtonElement),
    resultTab: getRequiredElement(root, '[data-view-result]', HTMLButtonElement),
    returnButton: getRequiredElement(root, '[data-return-adjust]', HTMLButtonElement),
    zoomFitButton: getRequiredElement(root, '[data-zoom-fit]', HTMLButtonElement),
    zoomOutButton: getRequiredElement(root, '[data-zoom-out]', HTMLButtonElement),
    zoomActualButton: getRequiredElement(root, '[data-zoom-actual]', HTMLButtonElement),
    zoomInButton: getRequiredElement(root, '[data-zoom-in]', HTMLButtonElement),
    zoomStatus: getRequiredElement(root, '[data-zoom-status]', HTMLElement),
  };
}

function getRequiredElement<ElementType extends Element>(
  root: ParentNode,
  selector: string,
  elementType: { new (): ElementType },
): ElementType {
  const element = root.querySelector(selector);

  if (!(element instanceof elementType)) {
    throw new Error(`Missing expected element: ${selector}`);
  }

  return element;
}
