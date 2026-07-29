import {
  candidateContract,
  MirrorMasterApiError,
  type DetectionRectangle,
  type GridDetectionContract,
  type GridDetectionConstraints,
  type GridDetectionResult,
  type GridPoint,
} from '../grid-api/client';
import {
  clamp,
  createFullImageSearchRect,
  createNaturalRect,
  translateNaturalRect,
} from '../grid-selection/geometry';
import type { NaturalImageRect, NaturalImageSize } from '../grid-selection/types';
import { createGridDimensionConstraints } from './confirmationState';
import { createGridDetectionCoordinator } from './gridDetectionCoordinator';

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
  readonly onCandidatesChange?: (index: number, total: number) => void;
}

export interface GridEditorController {
  readonly setImage: (image: GridEditorImage) => void;
  readonly redetect: () => void;
  readonly resetSelection: () => void;
  readonly adjustDimensions: (columns: number, rows: number) => boolean;
  readonly cycleCandidate: (offset: -1 | 1) => boolean;
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
  let detectionResult: GridDetectionResult | null = null;
  let lastValidDetectionResult: GridDetectionResult | null = null;
  let initialDetectionResult: GridDetectionResult | null = null;
  let searchRect: NaturalImageRect | null = null;
  let activePointer: ActivePointer | null = null;
  let resultObjectUrl: string | null = null;
  let view: EditorView = 'original';
  let zoomMode: ZoomMode = 'fit';
  let zoomScale = 1;
  let detectionVersion = 0;
  let detecting = false;
  let pendingResizeFrame: number | null = null;
  const detectionCoordinator = createGridDetectionCoordinator();

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
  elements.originalTab.addEventListener('keydown', handleViewTabKeyDown);
  elements.resultTab.addEventListener('keydown', handleViewTabKeyDown);

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
    detectionResult = null;
    lastValidDetectionResult = null;
    initialDetectionResult = null;
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
    lifecycle.onCandidatesChange?.(0, 0);
    void runDetection('auto');

    window.requestAnimationFrame(() => {
      if (zoomMode === 'fit') {
        updateFitScale();
        renderStage();
      }
    });
  }

  function redetect(): void {
    if (detecting) {
      return;
    }
    if (currentImage) {
      void runDetection('auto');
    }
  }

  function resetSelection(): void {
    if (detecting) {
      return;
    }
    if (initialContract && initialDetectionResult && currentImage) {
      cancelDetection();
      contract = initialContract;
      lastValidContract = initialContract;
      detectionResult = initialDetectionResult;
      lastValidDetectionResult = initialDetectionResult;
      searchRect = rectangleFromContract(initialContract, currentImage.naturalImage);
      clearResult();
      renderOverlay();
      lifecycle.onContractChange?.(contract, currentImage.file);
      notifyCandidatePosition();
      setHint(formatContractStatus(initialContract));
      return;
    }

    redetect();
  }

  function adjustDimensions(columns: number, rows: number): boolean {
    if (detecting) {
      return false;
    }
    if (!currentImage) {
      setHint('请先选择一张图纸。');
      return false;
    }

    const constraints = contract
      ? createGridDimensionConstraints(contract, columns, rows)
      : validGridDimensions(columns, rows) && searchRect
        ? {
            rectangle: toDetectionRectangle(searchRect),
            expectedColumns: columns,
            expectedRows: rows,
          }
        : null;
    if (!constraints) {
      setHint('行列数必须是 2 到 300 的整数。');
      return false;
    }
    void runDetection('manual', constraints);
    return true;
  }

  function cycleCandidate(offset: -1 | 1): boolean {
    if (detecting || !detectionResult || !currentImage || detectionResult.candidates.length < 2) {
      return false;
    }
    const currentIndex = detectionResult.candidates.findIndex(
      (candidate) => candidate.candidateId === contract?.candidateId,
    );
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex =
      (baseIndex + offset + detectionResult.candidates.length) % detectionResult.candidates.length;
    const nextCandidate = detectionResult.candidates[nextIndex];
    if (!nextCandidate) {
      return false;
    }
    contract = candidateContract(detectionResult, nextCandidate.candidateId);
    lastValidContract = contract;
    searchRect = rectangleFromContract(contract, currentImage.naturalImage);
    clearResult();
    renderOverlay();
    lifecycle.onContractChange?.(contract, currentImage.file);
    notifyCandidatePosition();
    setHint(formatContractStatus(contract));
    return true;
  }

  async function runDetection(
    mode: 'auto' | 'manual',
    constraints?: GridDetectionConstraints,
    rectangle?: NaturalImageRect,
  ): Promise<void> {
    const image = currentImage;

    if (!image) {
      return;
    }

    cancelActivePointerInteraction();
    cancelDetection();
    detectionVersion += 1;
    const taskVersion = detectionVersion;
    detecting = true;
    if (rectangle) {
      searchRect = rectangle;
    }
    renderOverlay();
    lifecycle.onDetectionChange?.(true);
    setHint('正在识别拼豆网格，请稍候…');

    try {
      const nextResult = await detectionCoordinator.run(image.file, mode, constraints);

      if (!nextResult || taskVersion !== detectionVersion || currentImage?.file !== image.file) {
        return;
      }

      detecting = false;
      lifecycle.onDetectionChange?.(false);
      applyDetectionResult(nextResult, image, mode);
    } catch (error) {
      if (taskVersion !== detectionVersion || currentImage?.file !== image.file) {
        return;
      }

      detecting = false;
      lifecycle.onDetectionChange?.(false);
      contract = lastValidContract;
      detectionResult = lastValidDetectionResult;
      searchRect = contract
        ? rectangleFromContract(contract, currentImage.naturalImage)
        : (rectangle ?? searchRect);
      renderOverlay();
      notifyCandidatePosition();
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      const message =
        error instanceof MirrorMasterApiError ? error.message : '网格识别失败，请重新调整选区。';
      setHint(contract ? `${message} 上次有效网格已保留。` : message);
    }
  }

  function applyDetectionResult(
    nextResult: GridDetectionResult,
    image: GridEditorImage,
    mode: 'auto' | 'manual',
  ): void {
    const nextContract = candidateContract(nextResult);
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
    detectionResult = nextResult;
    lastValidDetectionResult = nextResult;
    if (mode === 'auto') {
      initialContract = nextContract;
      initialDetectionResult = nextResult;
    }
    searchRect = rectangleFromContract(nextContract, {
      width: nextContract.naturalWidth,
      height: nextContract.naturalHeight,
    });
    renderStage();
    lifecycle.onContractChange?.(nextContract, image.file);
    notifyCandidatePosition();
    setHint(formatContractStatus(nextContract));
  }

  function cancelDetection(): void {
    detectionCoordinator.cancel();
    detectionVersion += 1;

    if (detecting) {
      detecting = false;
      lifecycle.onDetectionChange?.(false);
    }
  }

  function cancelActivePointerInteraction(): void {
    const pointer = activePointer;
    activePointer = null;
    if (pointer && elements.overlay.hasPointerCapture(pointer.pointerId)) {
      elements.overlay.releasePointerCapture(pointer.pointerId);
    }
  }

  function notifyCandidatePosition(): void {
    if (!detectionResult || !contract) {
      lifecycle.onCandidatesChange?.(0, 0);
      return;
    }
    const index = detectionResult.candidates.findIndex(
      (candidate) => candidate.candidateId === contract?.candidateId,
    );
    lifecycle.onCandidatesChange?.(index >= 0 ? index + 1 : 1, detectionResult.candidates.length);
  }

  function handlePointerDown(event: PointerEvent): void {
    if (detecting || !currentImage || view !== 'original' || event.button !== 0) {
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
      void runDetection(
        'manual',
        manualRectangleConstraints(searchRect, lastValidContract),
        searchRect,
      );
    } else if (!contract) {
      setHint('拖动选区或边缘后重新识别。');
    }
  }

  function handleOverlayKeyDown(event: KeyboardEvent): void {
    if (detecting || !currentImage || !event.key.startsWith('Arrow')) {
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
    renderOverlay();
    void runDetection('manual', manualRectangleConstraints(nextRect, lastValidContract), nextRect);
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

  function handleViewTabKeyDown(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const showResult =
      resultObjectUrl !== null && (event.key === 'ArrowRight' || event.key === 'End');
    if (showResult) {
      setView('result');
      elements.resultTab.focus();
    } else {
      setView('original');
      elements.originalTab.focus();
    }
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
    elements.frame.setAttribute(
      'aria-labelledby',
      showingResult ? elements.resultTab.id : elements.originalTab.id,
    );
    elements.returnButton.hidden = !showingResult;
  }

  function renderOverlay(): void {
    elements.overlay.replaceChildren();
    elements.overlay.toggleAttribute('data-detection-locked', detecting);
    elements.overlay.setAttribute('aria-disabled', String(detecting));
    elements.overlay.tabIndex = currentImage && !detecting ? 0 : -1;

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
      elements.overlay.append(...createProjectedGridPaths(contract));
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

    for (const handle of elements.overlay.querySelectorAll<SVGElement>('[data-grid-handle]')) {
      handle.setAttribute('tabindex', detecting ? '-1' : '0');
      handle.setAttribute('aria-disabled', String(detecting));
    }
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
    adjustDimensions,
    cycleCandidate,
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
  const xCoordinates = contract.sourceQuad.map((point) => point.x);
  const yCoordinates = contract.sourceQuad.map((point) => point.y);
  const rectangle = createNaturalRect(
    naturalImage,
    Math.min(...xCoordinates),
    Math.min(...yCoordinates),
    Math.max(...xCoordinates),
    Math.max(...yCoordinates),
  );

  if (!rectangle) {
    throw new Error('Backend grid contract contains an invalid rectangle.');
  }

  return rectangle;
}

function manualRectangleConstraints(
  rectangle: NaturalImageRect,
  baseContract: GridDetectionContract | null,
): GridDetectionConstraints {
  return {
    rectangle: toDetectionRectangle(rectangle),
    ...(baseContract
      ? {
          expectedColumns: baseContract.columns,
          expectedRows: baseContract.rows,
        }
      : {}),
  };
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

function createProjectedGridPaths(contract: GridDetectionContract): SVGPathElement[] {
  const innerCommands: string[] = [];
  for (const boundary of contract.xBoundaries.slice(1, -1)) {
    const top = projectCanonicalPoint(contract, boundary, 0);
    const bottom = projectCanonicalPoint(contract, boundary, contract.rectifiedHeight);
    innerCommands.push(
      `M ${String(top.x)} ${String(top.y)} L ${String(bottom.x)} ${String(bottom.y)}`,
    );
  }
  for (const boundary of contract.yBoundaries.slice(1, -1)) {
    const left = projectCanonicalPoint(contract, 0, boundary);
    const right = projectCanonicalPoint(contract, contract.rectifiedWidth, boundary);
    innerCommands.push(
      `M ${String(left.x)} ${String(left.y)} L ${String(right.x)} ${String(right.y)}`,
    );
  }

  const inner = document.createElementNS(SVG_NAMESPACE, 'path');
  inner.setAttribute('d', innerCommands.join(' '));
  inner.setAttribute('class', 'grid-boundary');
  inner.setAttribute('fill', 'none');
  inner.setAttribute('vector-effect', 'non-scaling-stroke');
  inner.setAttribute('pointer-events', 'none');

  const [topLeft, topRight, bottomRight, bottomLeft] = contract.sourceQuad;
  const outer = document.createElementNS(SVG_NAMESPACE, 'path');
  outer.setAttribute(
    'd',
    `M ${String(topLeft.x)} ${String(topLeft.y)} L ${String(topRight.x)} ${String(
      topRight.y,
    )} L ${String(bottomRight.x)} ${String(bottomRight.y)} L ${String(
      bottomLeft.x,
    )} ${String(bottomLeft.y)} Z`,
  );
  outer.setAttribute('class', 'grid-boundary grid-boundary-outer');
  outer.setAttribute('fill', 'none');
  outer.setAttribute('vector-effect', 'non-scaling-stroke');
  outer.setAttribute('pointer-events', 'none');
  return [inner, outer];
}

function projectCanonicalPoint(contract: GridDetectionContract, x: number, y: number): GridPoint {
  const u = x / contract.rectifiedWidth;
  const v = y / contract.rectifiedHeight;
  const [topLeft, topRight, bottomRight, bottomLeft] = contract.sourceQuad;
  const dx1 = topRight.x - bottomRight.x;
  const dx2 = bottomLeft.x - bottomRight.x;
  const sx = topLeft.x - topRight.x + bottomRight.x - bottomLeft.x;
  const dy1 = topRight.y - bottomRight.y;
  const dy2 = bottomLeft.y - bottomRight.y;
  const sy = topLeft.y - topRight.y + bottomRight.y - bottomLeft.y;
  const denominator = dx1 * dy2 - dx2 * dy1;

  let g = 0;
  let h = 0;
  if (Math.abs(denominator) > 1e-9) {
    g = (sx * dy2 - dx2 * sy) / denominator;
    h = (dx1 * sy - sx * dy1) / denominator;
  }
  const a = topRight.x - topLeft.x + g * topRight.x;
  const b = bottomLeft.x - topLeft.x + h * bottomLeft.x;
  const c = topLeft.x;
  const d = topRight.y - topLeft.y + g * topRight.y;
  const e = bottomLeft.y - topLeft.y + h * bottomLeft.y;
  const f = topLeft.y;
  const scale = g * u + h * v + 1;
  return {
    x: (a * u + b * v + c) / scale,
    y: (d * u + e * v + f) / scale,
  };
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
  )} 行，横向格距 ${formatPitch(contract.pitchX)} px，纵向格距 ${formatPitch(contract.pitchY)} px`;
  return contract.review === 'review' ? `${grid}。此候选需要复核。` : grid;
}

function formatPitch(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function validGridDimensions(columns: number, rows: number): boolean {
  return (
    Number.isInteger(columns) &&
    Number.isInteger(rows) &&
    columns >= 2 &&
    columns <= 300 &&
    rows >= 2 &&
    rows <= 300
  );
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
