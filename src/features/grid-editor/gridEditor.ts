import {
  detectGrid,
  MirrorMasterApiError,
  type DetectionRectangle,
  type GridDetectionContract,
} from '../grid-api/client';
import {
  clamp,
  createFullImageSearchRect,
  createNaturalRect,
  translateNaturalRect,
} from '../grid-selection/geometry';
import type { NaturalImageRect, NaturalImageSize } from '../grid-selection/types';

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
  readonly startRect: NaturalImageRect | null;
  moved: boolean;
}

interface GridEditorElements {
  readonly frame: HTMLElement;
  readonly stage: HTMLElement;
  readonly image: HTMLImageElement;
  readonly resultImage: HTMLImageElement;
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
  readonly onContractChange?: (contract: GridDetectionContract | null, file: File | null) => void;
  readonly onDetectionChange?: (isDetecting: boolean) => void;
}

export interface GridEditorController {
  readonly setImage: (image: GridEditorImage) => void;
  readonly redetect: () => void;
  readonly resetSelection: () => void;
  readonly clearResult: () => void;
  readonly showResult: (objectUrl: string) => void;
  readonly showOriginal: () => void;
  readonly setMessage: (message: string) => void;
  readonly getContract: () => GridDetectionContract | null;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;
const MIN_SEARCH_RECT_SIZE = 8;
const HANDLE_TARGET_CSS_SIZE = 44;
const HANDLE_VISUAL_CSS_SIZE = 12;

const HANDLE_LABELS: Record<HandleType, string> = {
  move: '移动网格选区',
  n: '调整网格选区上边缘',
  e: '调整网格选区右边缘',
  s: '调整网格选区下边缘',
  w: '调整网格选区左边缘',
  nw: '调整网格选区左上角',
  ne: '调整网格选区右上角',
  se: '调整网格选区右下角',
  sw: '调整网格选区左下角',
};

export function mountGridEditor(
  root: HTMLElement,
  lifecycle: GridEditorLifecycle = {},
): GridEditorController {
  const elements = getElements(root);
  let currentImage: GridEditorImage | null = null;
  let contract: GridDetectionContract | null = null;
  let lastValidContract: GridDetectionContract | null = null;
  let initialContract: GridDetectionContract | null = null;
  let searchRect: NaturalImageRect | null = null;
  let activePointer: ActivePointer | null = null;
  let resultObjectUrl: string | null = null;
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
    if (resultObjectUrl) {
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
    contract = null;
    lastValidContract = null;
    initialContract = null;
    searchRect = createFullImageSearchRect(image.naturalImage);
    zoomMode = 'fit';
    view = 'original';
    clearResult();
    elements.image.src = image.objectUrl;
    elements.image.alt = `${image.fileName} 的原图`;
    setOverlayViewBox(image.naturalImage);
    elements.overlay.removeAttribute('hidden');
    elements.overlay.tabIndex = 0;
    elements.overlay.setAttribute('aria-label', '网格选区编辑区');
    updateFitScale();
    renderStage();
    lifecycle.onContractChange?.(null, image.file);
    void runDetection('auto');

    window.requestAnimationFrame(() => {
      if (zoomMode === 'fit') {
        updateFitScale();
        renderStage();
      }
    });
  }

  function redetect(): void {
    if (currentImage) {
      void runDetection('auto');
    }
  }

  function resetSelection(): void {
    if (initialContract && currentImage) {
      cancelDetection();
      contract = initialContract;
      lastValidContract = initialContract;
      searchRect = rectangleFromContract(initialContract, currentImage.naturalImage);
      clearResult();
      renderOverlay();
      lifecycle.onContractChange?.(contract, currentImage.file);
      setHint(formatContractStatus(initialContract));
      return;
    }

    redetect();
  }

  async function runDetection(
    mode: 'auto' | 'manual',
    rectangle?: NaturalImageRect,
  ): Promise<void> {
    const image = currentImage;

    if (!image) {
      return;
    }

    detectionVersion += 1;
    const taskVersion = detectionVersion;
    detecting = true;
    contract = null;
    if (rectangle) {
      searchRect = rectangle;
    }
    clearResult();
    renderOverlay();
    lifecycle.onContractChange?.(null, image.file);
    lifecycle.onDetectionChange?.(true);
    setHint(mode === 'auto' ? '正在自动识别网格…' : '正在按选区识别网格…');

    try {
      const nextContract =
        mode === 'manual' && rectangle
          ? await detectGrid(image.file, 'manual', toDetectionRectangle(rectangle))
          : await detectGrid(image.file, 'auto');

      if (taskVersion !== detectionVersion || currentImage?.file !== image.file) {
        return;
      }

      detecting = false;
      lifecycle.onDetectionChange?.(false);
      applyContract(nextContract, image, mode);
    } catch (error) {
      if (taskVersion !== detectionVersion || currentImage?.file !== image.file) {
        return;
      }

      detecting = false;
      lifecycle.onDetectionChange?.(false);
      contract = lastValidContract;
      searchRect = contract
        ? rectangleFromContract(contract, currentImage.naturalImage)
        : (rectangle ?? searchRect);
      renderOverlay();
      lifecycle.onContractChange?.(contract, image.file);
      const message =
        error instanceof MirrorMasterApiError ? error.message : '网格识别失败，请重新调整选区。';
      setHint(contract ? `${message} 上次有效网格已保留。` : message);
    }
  }

  function applyContract(
    nextContract: GridDetectionContract,
    image: GridEditorImage,
    mode: 'auto' | 'manual',
  ): void {
    if (
      image.naturalImage.width !== nextContract.naturalWidth ||
      image.naturalImage.height !== nextContract.naturalHeight
    ) {
      currentImage = {
        ...image,
        naturalImage: {
          width: nextContract.naturalWidth,
          height: nextContract.naturalHeight,
        },
      };
      setOverlayViewBox(currentImage.naturalImage);
      updateFitScale();
    }

    contract = nextContract;
    lastValidContract = nextContract;
    if (mode === 'auto') {
      initialContract = nextContract;
    }
    searchRect = rectangleFromContract(nextContract, {
      width: nextContract.naturalWidth,
      height: nextContract.naturalHeight,
    });
    renderStage();
    lifecycle.onContractChange?.(nextContract, image.file);
    setHint(formatContractStatus(nextContract));
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
      contract = null;
      clearResult();
      lifecycle.onContractChange?.(null, currentImage.file);
    }

    activePointer.moved = true;
    searchRect = nextRect;
    contract = null;
    renderOverlay();
    setHint('松开后将按当前完整选区重新识别。');
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
      void runDetection('manual', searchRect);
    } else if (!contract) {
      setHint('拖动选区或边缘后重新识别。');
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
        ? translateNaturalRect(currentImage.naturalImage, rectangle, delta.x, delta.y)
        : resizeNaturalRectWithDelta(currentImage.naturalImage, rectangle, handle, delta);

    cancelDetection();
    searchRect = nextRect;
    contract = null;
    clearResult();
    lifecycle.onContractChange?.(null, currentImage.file);
    renderOverlay();
    void runDetection('manual', nextRect);
    event.preventDefault();
  }

  function showResult(objectUrl: string): void {
    clearResult();
    resultObjectUrl = objectUrl;
    elements.resultImage.src = objectUrl;
    elements.resultImage.alt = '网格单元镜像结果';
    elements.resultTab.disabled = false;
    setView('result');
  }

  function clearResult(): void {
    resultObjectUrl = null;
    elements.resultImage.removeAttribute('src');
    elements.resultImage.hidden = true;
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

    elements.stage.style.width = `${String(currentImage.naturalImage.width * zoomScale)}px`;
    elements.stage.style.height = `${String(currentImage.naturalImage.height * zoomScale)}px`;
    elements.zoomStatus.textContent =
      zoomMode === 'fit' ? `适合 · ${formatPercent(zoomScale)}` : formatPercent(zoomScale);
    renderOverlay();
    renderView();
  }

  function renderView(): void {
    const showingResult = view === 'result' && resultObjectUrl !== null;
    elements.image.hidden = showingResult;
    elements.overlay.toggleAttribute('hidden', showingResult || !currentImage);
    elements.resultImage.hidden = !showingResult;
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
        contract ? 'grid-move-area' : 'grid-move-area grid-search-area',
      ),
    );

    if (contract) {
      for (let index = 0; index < contract.xBoundaries.length; index += 1) {
        const x = contract.xBoundaries[index];

        if (x !== undefined) {
          elements.overlay.append(
            createLine(
              x,
              contract.top,
              x,
              contract.bottom,
              index === 0 || index === contract.xBoundaries.length - 1,
            ),
          );
        }
      }

      for (let index = 0; index < contract.yBoundaries.length; index += 1) {
        const y = contract.yBoundaries[index];

        if (y !== undefined) {
          elements.overlay.append(
            createLine(
              contract.left,
              y,
              contract.right,
              y,
              index === 0 || index === contract.yBoundaries.length - 1,
            ),
          );
        }
      }
    } else {
      elements.overlay.append(
        createOutlineRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height),
      );
    }

    elements.overlay.append(
      createEdgeHandle(centerX, rectangle.y, visualSize, targetSize, 'n'),
      createEdgeHandle(rectangle.right, centerY, visualSize, targetSize, 'e'),
      createEdgeHandle(centerX, rectangle.bottom, visualSize, targetSize, 's'),
      createEdgeHandle(rectangle.x, centerY, visualSize, targetSize, 'w'),
      createCornerHandle(rectangle.x, rectangle.y, visualSize, targetSize, 'nw'),
      createCornerHandle(rectangle.right, rectangle.y, visualSize, targetSize, 'ne'),
      createCornerHandle(rectangle.right, rectangle.bottom, visualSize, targetSize, 'se'),
      createCornerHandle(rectangle.x, rectangle.bottom, visualSize, targetSize, 'sw'),
    );
  }

  function getVisibleRect(): NaturalImageRect | null {
    if (contract && currentImage) {
      return rectangleFromContract(contract, currentImage.naturalImage);
    }

    return searchRect;
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

  function setOverlayViewBox(naturalImage: NaturalImageSize): void {
    elements.overlay.setAttribute(
      'viewBox',
      `0 0 ${String(naturalImage.width)} ${String(naturalImage.height)}`,
    );
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
    getContract: () => contract,
  };
}

function rectangleFromContract(
  contract: GridDetectionContract,
  naturalImage: NaturalImageSize,
): NaturalImageRect {
  const rectangle = createNaturalRect(
    naturalImage,
    contract.left,
    contract.top,
    contract.right,
    contract.bottom,
  );

  if (!rectangle) {
    throw new Error('Backend grid contract contains an invalid rectangle.');
  }

  return rectangle;
}

function toDetectionRectangle(rectangle: NaturalImageRect): DetectionRectangle {
  return {
    left: rectangle.x,
    top: rectangle.y,
    right: rectangle.right,
    bottom: rectangle.bottom,
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
    left = clamp(point.x, 0, rectangle.right - MIN_SEARCH_RECT_SIZE);
  }
  if (handle.includes('e')) {
    right = clamp(point.x, rectangle.x + MIN_SEARCH_RECT_SIZE, naturalImage.width);
  }
  if (handle.includes('n')) {
    top = clamp(point.y, 0, rectangle.bottom - MIN_SEARCH_RECT_SIZE);
  }
  if (handle.includes('s')) {
    bottom = clamp(point.y, rectangle.y + MIN_SEARCH_RECT_SIZE, naturalImage.height);
  }

  return createNaturalRect(naturalImage, left, top, right, bottom) ?? rectangle;
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

function getMoveKeyDelta(key: string, amount: number): NaturalPoint {
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
  line.setAttribute('class', outer ? 'grid-boundary grid-boundary-outer' : 'grid-boundary');
  return line;
}

function createOutlineRect(x: number, y: number, width: number, height: number): SVGRectElement {
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
  const rectangle = document.createElementNS(SVG_NAMESPACE, 'rect');
  rectangle.setAttribute('x', String(x));
  rectangle.setAttribute('y', String(y));
  rectangle.setAttribute('width', String(width));
  rectangle.setAttribute('height', String(height));
  rectangle.setAttribute('class', className);
  decorateHandle(rectangle, handle);
  return rectangle;
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

function formatContractStatus(contract: GridDetectionContract): string {
  const grid = `识别到 ${String(contract.columns)} 列 × ${String(
    contract.rows,
  )} 行，单元 ${String(contract.cellSize)} px`;
  return contract.warning ? `${grid}。${contract.warning}` : grid;
}

function getElements(root: HTMLElement): GridEditorElements {
  return {
    frame: getRequiredElement(root, '[data-editor-frame]', HTMLElement),
    stage: getRequiredElement(root, '[data-editor-stage]', HTMLElement),
    image: getRequiredElement(root, '[data-editor-image]', HTMLImageElement),
    resultImage: getRequiredElement(root, '[data-editor-result]', HTMLImageElement),
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
