import { detectPixelanimGrid } from '../grid-detection/detector';
import {
  clamp,
  createFullImageSearchRect,
  createNaturalRect,
  translateNaturalRect,
} from '../grid-selection/geometry';
import type {
  GridBoundarySelection,
  NaturalImageRect,
  NaturalImageSize,
} from '../grid-selection/types';

type HandleType =
  | 'move'
  | 'n'
  | 'e'
  | 's'
  | 'w'
  | 'nw'
  | 'ne'
  | 'se'
  | 'sw';
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
  readonly startRect: NaturalImageRect | null;
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
  readonly onSelectionChange?: (
    selection: GridBoundarySelection | null,
  ) => void;
  readonly onDetectionChange?: (isDetecting: boolean) => void;
}

export interface GridEditorController {
  readonly setImage: (image: GridEditorImage) => void;
  readonly redetect: () => void;
  readonly resetSelection: () => void;
  readonly clearResult: () => void;
  readonly showResult: (canvas: HTMLCanvasElement) => void;
  readonly showOriginal: () => void;
  readonly setMessage: (message: string) => void;
  readonly getSelection: () => GridBoundarySelection | null;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;
const MIN_SEARCH_RECT_SIZE = 8;
const HANDLE_TARGET_CSS_SIZE = 44;
const HANDLE_VISUAL_CSS_SIZE = 12;

const HANDLE_LABELS: Record<HandleType, string> = {
  move: '移动搜索区域',
  n: '调整搜索区域上边缘',
  e: '调整搜索区域右边缘',
  s: '调整搜索区域下边缘',
  w: '调整搜索区域左边缘',
  nw: '调整搜索区域左上角',
  ne: '调整搜索区域右上角',
  se: '调整搜索区域右下角',
  sw: '调整搜索区域左下角',
};

export function mountGridEditor(
  root: HTMLElement,
  lifecycle: GridEditorLifecycle = {},
): GridEditorController {
  const elements = getElements(root);
  let currentImage: GridEditorImage | null = null;
  let selection: GridBoundarySelection | null = null;
  let searchRect: NaturalImageRect | null = null;
  let initialSearchRect: NaturalImageRect | null = null;
  let activePointer: ActivePointer | null = null;
  let resultCanvas: HTMLCanvasElement | null = null;
  let view: EditorView = 'original';
  let zoomMode: ZoomMode = 'fit';
  let zoomScale = 1;
  let detectionVersion = 0;
  let detecting = false;
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
    cancelDetection();
    activePointer = null;
    currentImage = image;
    selection = null;
    initialSearchRect = createFullImageSearchRect(image.naturalImage);
    searchRect = initialSearchRect;
    zoomMode = 'fit';
    view = 'original';
    clearResult();
    elements.image.src = image.objectUrl;
    elements.image.alt = `${image.fileName} 的原图`;
    elements.overlay.setAttribute(
      'viewBox',
      `0 0 ${String(image.naturalImage.width)} ${String(
        image.naturalImage.height,
      )}`,
    );
    elements.overlay.hidden = false;
    elements.overlay.tabIndex = 0;
    elements.overlay.setAttribute('aria-label', '网格搜索区域编辑区');
    updateFitScale();
    renderStage();
    lifecycle.onSelectionChange?.(null);
    void runDetection(initialSearchRect);

    window.requestAnimationFrame(() => {
      if (zoomMode === 'fit') {
        updateFitScale();
        renderStage();
      }
    });
  }

  function redetect(): void {
    const rectangle = getVisibleRect();

    if (rectangle) {
      void runDetection(rectangle);
    }
  }

  function resetSelection(): void {
    if (initialSearchRect) {
      void runDetection(initialSearchRect);
    }
  }

  async function runDetection(rectangle: NaturalImageRect): Promise<void> {
    const image = currentImage;

    if (!image) {
      return;
    }

    detectionVersion += 1;
    const currentVersion = detectionVersion;
    detecting = true;
    selection = null;
    searchRect = rectangle;
    clearResult();
    renderOverlay();
    lifecycle.onSelectionChange?.(null);
    lifecycle.onDetectionChange?.(true);
    setHint('正在识别网格…');

    try {
      const outcome = await detectPixelanimGrid({
        file: image.file,
        naturalImage: image.naturalImage,
        searchRect: rectangle,
      });

      if (
        currentVersion !== detectionVersion ||
        currentImage?.file !== image.file
      ) {
        return;
      }

      detecting = false;
      lifecycle.onDetectionChange?.(false);

      if (outcome.ok) {
        selection = outcome.selection;
        searchRect =
          createNaturalRect(
            image.naturalImage,
            selection.left,
            selection.top,
            selection.right,
            selection.bottom,
          ) ?? rectangle;
        renderOverlay();
        lifecycle.onSelectionChange?.(selection);
        setHint(formatSelectionStatus(selection));
        return;
      }

      renderOverlay();
      lifecycle.onSelectionChange?.(null);
      setHint(outcome.message);
    } catch {
      if (
        currentVersion === detectionVersion &&
        currentImage?.file === image.file
      ) {
        detecting = false;
        lifecycle.onDetectionChange?.(false);
        selection = null;
        renderOverlay();
        lifecycle.onSelectionChange?.(null);
        setHint('未识别到完整网格，请调整搜索区域。');
      }
    }
  }

  function cancelDetection(): void {
    detectionVersion += 1;

    if (detecting) {
      detecting = false;
      lifecycle.onDetectionChange?.(false);
    }
  }

  function handlePointerDown(event: PointerEvent): void {
    if (!currentImage || view !== 'original' || event.button !== 0) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const handle = parseHandle(target?.getAttribute('data-grid-handle'));
    const visibleRect = getVisibleRect();

    if (handle && visibleRect) {
      activePointer = {
        pointerId: event.pointerId,
        kind: 'handle',
        handle,
        startPoint: toNaturalPoint(event),
        startRect: visibleRect,
        moved: false,
      };
    } else if (!handle) {
      activePointer = {
        pointerId: event.pointerId,
        kind: 'draw',
        handle: null,
        startPoint: toNaturalPoint(event),
        startRect: null,
        moved: false,
      };
    } else {
      return;
    }

    elements.overlay.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent): void {
    if (
      !activePointer ||
      activePointer.pointerId !== event.pointerId ||
      !currentImage
    ) {
      return;
    }

    const point = toNaturalPoint(event);
    const movement =
      Math.abs(point.x - activePointer.startPoint.x) +
      Math.abs(point.y - activePointer.startPoint.y);

    if (movement < 0.5) {
      return;
    }

    const nextRect =
      activePointer.kind === 'draw'
        ? createNaturalRect(
            currentImage.naturalImage,
            activePointer.startPoint.x,
            activePointer.startPoint.y,
            point.x,
            point.y,
          )
        : activePointer.handle && activePointer.startRect
          ? updateSearchRectFromPointer(
              currentImage.naturalImage,
              activePointer.startRect,
              activePointer.handle,
              activePointer.startPoint,
              point,
            )
          : null;

    if (!nextRect) {
      return;
    }

    if (!activePointer.moved) {
      cancelDetection();
      selection = null;
      clearResult();
      lifecycle.onSelectionChange?.(null);
    }

    activePointer.moved = true;
    searchRect = nextRect;
    selection = null;
    renderOverlay();
    setHint('调整搜索区域后松开以重新识别。');
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

    if (moved && searchRect) {
      void runDetection(searchRect);
    } else if (!selection) {
      setHint('拖动搜索区域或边缘后重新识别。');
    }
  }

  function handleOverlayKeyDown(event: KeyboardEvent): void {
    if (!currentImage || !event.key.startsWith('Arrow')) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const handle = parseHandle(target?.getAttribute('data-grid-handle'));
    const rectangle = getVisibleRect();

    if (!handle || !rectangle) {
      return;
    }

    const amount = event.shiftKey ? 10 : 1;
    const delta = getMoveKeyDelta(event.key, amount);
    const nextRect =
      handle === 'move'
        ? translateNaturalRect(
            currentImage.naturalImage,
            rectangle,
            delta.x,
            delta.y,
          )
        : resizeNaturalRectWithDelta(
            currentImage.naturalImage,
            rectangle,
            handle,
            delta,
          );

    searchRect = nextRect;
    selection = null;
    clearResult();
    lifecycle.onSelectionChange?.(null);
    renderOverlay();
    void runDetection(nextRect);
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
    announce(
      nextView === 'original'
        ? '已返回原图调整。'
        : '正在查看镜像结果。',
    );
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
      zoomMode === 'fit'
        ? `适合 · ${formatPercent(zoomScale)}`
        : formatPercent(zoomScale);
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

    if (!currentImage) {
      return;
    }

    const rectangle = getVisibleRect();

    if (!rectangle) {
      return;
    }

    const targetSize = HANDLE_TARGET_CSS_SIZE / zoomScale;
    const visualSize = HANDLE_VISUAL_CSS_SIZE / zoomScale;
    const centerX = rectangle.x + rectangle.width / 2;
    const centerY = rectangle.y + rectangle.height / 2;

    elements.overlay.append(
      createInteractiveRect(
        rectangle.x,
        rectangle.y,
        rectangle.width,
        rectangle.height,
        'move',
        selection ? 'grid-move-area' : 'grid-move-area grid-search-area',
      ),
    );

    if (selection) {
      for (let index = 0; index < selection.xBoundaries.length; index += 1) {
        const x = selection.xBoundaries[index];

        if (x !== undefined) {
          elements.overlay.append(
            createLine(
              x,
              selection.top,
              x,
              selection.bottom,
              index === 0 || index === selection.xBoundaries.length - 1,
            ),
          );
        }
      }

      for (let index = 0; index < selection.yBoundaries.length; index += 1) {
        const y = selection.yBoundaries[index];

        if (y !== undefined) {
          elements.overlay.append(
            createLine(
              selection.left,
              y,
              selection.right,
              y,
              index === 0 || index === selection.yBoundaries.length - 1,
            ),
          );
        }
      }
    } else {
      elements.overlay.append(
        createOutlineRect(
          rectangle.x,
          rectangle.y,
          rectangle.width,
          rectangle.height,
        ),
      );
    }

    elements.overlay.append(
      createEdgeHandle(centerX, rectangle.y, visualSize, targetSize, 'n'),
      createEdgeHandle(
        rectangle.right,
        centerY,
        visualSize,
        targetSize,
        'e',
      ),
      createEdgeHandle(
        centerX,
        rectangle.bottom,
        visualSize,
        targetSize,
        's',
      ),
      createEdgeHandle(rectangle.x, centerY, visualSize, targetSize, 'w'),
      createCornerHandle(
        rectangle.x,
        rectangle.y,
        visualSize,
        targetSize,
        'nw',
      ),
      createCornerHandle(
        rectangle.right,
        rectangle.y,
        visualSize,
        targetSize,
        'ne',
      ),
      createCornerHandle(
        rectangle.right,
        rectangle.bottom,
        visualSize,
        targetSize,
        'se',
      ),
      createCornerHandle(
        rectangle.x,
        rectangle.bottom,
        visualSize,
        targetSize,
        'sw',
      ),
    );
  }

  function getVisibleRect(): NaturalImageRect | null {
    if (selection && currentImage) {
      return createNaturalRect(
        currentImage.naturalImage,
        selection.left,
        selection.top,
        selection.right,
        selection.bottom,
      );
    }

    return searchRect;
  }

  function toNaturalPoint(event: PointerEvent): NaturalPoint {
    if (!currentImage) {
      return { x: 0, y: 0 };
    }

    const bounds = elements.stage.getBoundingClientRect();
    const scaleX =
      currentImage.naturalImage.width / Math.max(bounds.width, 1);
    const scaleY =
      currentImage.naturalImage.height / Math.max(bounds.height, 1);

    return {
      x: clamp(
        Math.round((event.clientX - bounds.left) * scaleX),
        0,
        currentImage.naturalImage.width,
      ),
      y: clamp(
        Math.round((event.clientY - bounds.top) * scaleY),
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

function updateSearchRectFromPointer(
  naturalImage: NaturalImageSize,
  rectangle: NaturalImageRect,
  handle: HandleType,
  startPoint: NaturalPoint,
  point: NaturalPoint,
): NaturalImageRect {
  if (handle === 'move') {
    return translateNaturalRect(
      naturalImage,
      rectangle,
      point.x - startPoint.x,
      point.y - startPoint.y,
    );
  }

  let left = rectangle.x;
  let top = rectangle.y;
  let right = rectangle.right;
  let bottom = rectangle.bottom;

  if (handle.includes('w')) {
    left = clamp(
      point.x,
      0,
      rectangle.right - MIN_SEARCH_RECT_SIZE,
    );
  }

  if (handle.includes('e')) {
    right = clamp(
      point.x,
      rectangle.x + MIN_SEARCH_RECT_SIZE,
      naturalImage.width,
    );
  }

  if (handle.includes('n')) {
    top = clamp(
      point.y,
      0,
      rectangle.bottom - MIN_SEARCH_RECT_SIZE,
    );
  }

  if (handle.includes('s')) {
    bottom = clamp(
      point.y,
      rectangle.y + MIN_SEARCH_RECT_SIZE,
      naturalImage.height,
    );
  }

  return (
    createNaturalRect(naturalImage, left, top, right, bottom) ?? rectangle
  );
}

function resizeNaturalRectWithDelta(
  naturalImage: NaturalImageSize,
  rectangle: NaturalImageRect,
  handle: Exclude<HandleType, 'move'>,
  delta: NaturalPoint,
): NaturalImageRect {
  const point = {
    x: handle.includes('w')
      ? rectangle.x + delta.x
      : handle.includes('e')
        ? rectangle.right + delta.x
        : rectangle.x,
    y: handle.includes('n')
      ? rectangle.y + delta.y
      : handle.includes('s')
        ? rectangle.bottom + delta.y
        : rectangle.y,
  };

  return updateSearchRectFromPointer(
    naturalImage,
    rectangle,
    handle,
    { x: rectangle.x, y: rectangle.y },
    point,
  );
}

function getMoveKeyDelta(
  key: string,
  amount: number,
): NaturalPoint {
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
  line.setAttribute(
    'class',
    outer
      ? 'grid-boundary grid-boundary-outer'
      : 'grid-boundary',
  );
  return line;
}

function createOutlineRect(
  x: number,
  y: number,
  width: number,
  height: number,
): SVGRectElement {
  const rectangle = document.createElementNS(SVG_NAMESPACE, 'rect');
  rectangle.setAttribute('x', String(x));
  rectangle.setAttribute('y', String(y));
  rectangle.setAttribute('width', String(width));
  rectangle.setAttribute('height', String(height));
  rectangle.setAttribute('class', 'grid-search-outline');
  rectangle.setAttribute('vector-effect', 'non-scaling-stroke');
  rectangle.setAttribute('pointer-events', 'none');
  return rectangle;
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
  visual.setAttribute(
    'rx',
    String(Math.min(visualWidth, visualHeight) / 2),
  );
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

function formatSelectionStatus(
  selection: GridBoundarySelection,
): string {
  return `识别到 ${String(selection.columns)} 列 × ${String(
    selection.rows,
  )} 行，单元 ${String(selection.cellSize)} px`;
}

function getElements(root: HTMLElement): GridEditorElements {
  return {
    frame: getRequiredElement(root, '[data-editor-frame]', HTMLElement),
    stage: getRequiredElement(root, '[data-editor-stage]', HTMLElement),
    image: getRequiredElement(
      root,
      '[data-editor-image]',
      HTMLImageElement,
    ),
    overlay: getRequiredElement(
      root,
      '[data-editor-overlay]',
      SVGSVGElement,
    ),
    hint: getRequiredElement(root, '[data-editor-hint]', HTMLElement),
    live: getRequiredElement(root, '[data-editor-live]', HTMLElement),
    originalTab: getRequiredElement(
      root,
      '[data-view-original]',
      HTMLButtonElement,
    ),
    resultTab: getRequiredElement(
      root,
      '[data-view-result]',
      HTMLButtonElement,
    ),
    returnButton: getRequiredElement(
      root,
      '[data-return-adjust]',
      HTMLButtonElement,
    ),
    zoomFitButton: getRequiredElement(
      root,
      '[data-zoom-fit]',
      HTMLButtonElement,
    ),
    zoomOutButton: getRequiredElement(
      root,
      '[data-zoom-out]',
      HTMLButtonElement,
    ),
    zoomActualButton: getRequiredElement(
      root,
      '[data-zoom-actual]',
      HTMLButtonElement,
    ),
    zoomInButton: getRequiredElement(
      root,
      '[data-zoom-in]',
      HTMLButtonElement,
    ),
    zoomStatus: getRequiredElement(
      root,
      '[data-zoom-status]',
      HTMLElement,
    ),
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
