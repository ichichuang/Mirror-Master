import { clamp } from '../grid-selection/geometry';
import { GRID_MIRROR_STATE_LABELS, GRID_MIRROR_UNCHANGED_SCOPE_TEXT } from './constants';
import { mirrorGridCells } from './processor';
import type {
  GridMirrorReadyInput,
  GridMirrorResult,
  GridMirrorSourceImage,
  GridMirrorProcessingState,
} from './types';

type ZoomMode = 'fit' | 'manual';

interface GridMirrorElements {
  readonly root: HTMLElement;
  readonly message: HTMLElement;
  readonly live: HTMLElement;
  readonly details: HTMLElement;
  readonly sourceSize: HTMLElement;
  readonly resultSize: HTMLElement;
  readonly origin: HTMLElement;
  readonly cellSize: HTMLElement;
  readonly gridSize: HTMLElement;
  readonly scope: HTMLElement;
  readonly generateButton: HTMLButtonElement;
  readonly regenerateButton: HTMLButtonElement;
  readonly returnPrecisionButton: HTMLButtonElement;
  readonly zoomControls: HTMLElement;
  readonly zoomFitButton: HTMLButtonElement;
  readonly zoomOutButton: HTMLButtonElement;
  readonly zoomActualButton: HTMLButtonElement;
  readonly zoomInButton: HTMLButtonElement;
  readonly zoomStatus: HTMLElement;
  readonly comparison: HTMLElement;
  readonly sourceFrame: HTMLElement;
  readonly resultFrame: HTMLElement;
  readonly sourceStage: HTMLElement;
  readonly resultStage: HTMLElement;
  readonly sourceImage: HTMLImageElement;
}

interface GridMirrorUiState {
  readonly status: GridMirrorProcessingState;
  readonly message: string;
  readonly source: GridMirrorSourceImage | null;
  readonly readyInput: GridMirrorReadyInput | null;
  readonly result: GridMirrorResult | null;
}

export interface GridMirrorLifecycle {
  readonly onReturnToPrecisionAdjustment?: () => void;
}

export interface GridMirrorController {
  readonly setImage: (source: GridMirrorSourceImage) => void;
  readonly clearImage: () => void;
  readonly setReady: (input: GridMirrorReadyInput) => void;
  readonly invalidate: (message: string) => void;
}

const MIN_ZOOM = 0.12;
const MAX_ZOOM = 4;

export function mountGridMirrorController(
  root: HTMLElement,
  lifecycle: GridMirrorLifecycle = {},
): GridMirrorController {
  const elements = getGridMirrorElements(root);

  let state = createWaitingState(null, '等待确认精确整数像素网格。');
  let processingVersion = 0;
  let zoomMode: ZoomMode = 'fit';
  let zoomScale = 1;
  let pendingResizeFrame: number | null = null;

  const resizeObserver = createResizeObserver(scheduleResizeRender);
  resizeObserver?.observe(elements.sourceFrame);
  resizeObserver?.observe(elements.resultFrame);

  elements.generateButton.addEventListener('click', () => {
    startProcessing();
  });

  elements.regenerateButton.addEventListener('click', () => {
    startProcessing();
  });

  elements.returnPrecisionButton.addEventListener('click', () => {
    lifecycle.onReturnToPrecisionAdjustment?.();
  });

  elements.zoomFitButton.addEventListener('click', () => {
    zoomMode = 'fit';
    updateFitScale();
    render();
    announce('已切换为适合窗口显示。');
  });

  elements.zoomOutButton.addEventListener('click', () => {
    setManualZoom(zoomScale / 1.25);
    announce(`已缩小到 ${formatPercent(zoomScale)}。`);
  });

  elements.zoomActualButton.addEventListener('click', () => {
    setManualZoom(1);
    announce('已切换为 100% 自然像素显示。');
  });

  elements.zoomInButton.addEventListener('click', () => {
    setManualZoom(zoomScale * 1.25);
    announce(`已放大到 ${formatPercent(zoomScale)}。`);
  });

  function setImage(source: GridMirrorSourceImage): void {
    processingVersion += 1;
    cancelPendingResizeRender();
    releaseResult();
    zoomMode = 'fit';
    state = createWaitingState(source, '等待确认精确整数像素网格。');
    elements.sourceImage.src = source.objectUrl;
    elements.sourceImage.alt = `${source.fileName} 的原图对比预览`;
    updateFitScale();
    render();
  }

  function clearImage(): void {
    processingVersion += 1;
    cancelPendingResizeRender();
    releaseResult();
    zoomMode = 'fit';
    zoomScale = 1;
    state = createWaitingState(null, '图片已移除，等待重新选择本地图片。');
    elements.sourceImage.removeAttribute('src');
    elements.sourceImage.alt = '';
    render();
  }

  function setReady(input: GridMirrorReadyInput): void {
    if (!state.source || input.file !== state.source.file) {
      invalidate('已确认校准不属于当前原始本地文件，镜像预览不可生成。');
      return;
    }

    processingVersion += 1;
    releaseResult();
    state = {
      status: 'ready',
      message: '精确整数像素网格已确认；点击“生成镜像预览”后才会处理。',
      source: state.source,
      readyInput: Object.freeze({
        file: input.file,
        calibration: input.calibration,
      }),
      result: null,
    };
    render();
    announce('镜像预览已就绪，等待用户生成。');
  }

  function invalidate(message: string): void {
    processingVersion += 1;
    releaseResult();
    state = {
      status: state.source ? 'invalidated' : 'waiting-for-confirmation',
      message,
      source: state.source,
      readyInput: null,
      result: null,
    };
    render();
    announce(message);
  }

  function startProcessing(): void {
    const readyInput = state.readyInput;

    if (!readyInput || !state.source) {
      invalidate('请先确认 processingReady: true 的精确整数像素网格。');
      return;
    }

    processingVersion += 1;
    const currentVersion = processingVersion;
    const source = state.source;
    releaseResult();
    state = {
      status: 'processing',
      message: '正在本地生成镜像预览；只移动 34 × 27 主网格单元格位置。',
      source,
      readyInput,
      result: null,
    };
    render();
    announce('正在生成镜像预览。');

    void mirrorGridCells(readyInput).then((outcome) => {
      if (currentVersion !== processingVersion || state.source?.file !== readyInput.file) {
        if (outcome.ok) {
          outcome.result.outputCanvas.width = 0;
          outcome.result.outputCanvas.height = 0;
        }

        return;
      }

      if (!outcome.ok) {
        state = {
          status: 'failed',
          message: outcome.message,
          source,
          readyInput,
          result: null,
        };
        render();
        announce(outcome.message);
        return;
      }

      state = {
        status: 'completed',
        message: '镜像预览已完成；只改变网格单元位置，没有翻转任何单元内部像素。',
        source,
        readyInput,
        result: outcome.result,
      };
      zoomMode = 'fit';
      updateFitScale();
      render();
      announce('镜像预览已完成。');
    });
  }

  function releaseResult(): void {
    if (state.result) {
      state.result.outputCanvas.width = 0;
      state.result.outputCanvas.height = 0;
    }

    elements.resultStage.replaceChildren();
  }

  function scheduleResizeRender(): void {
    if (pendingResizeFrame !== null) {
      return;
    }

    pendingResizeFrame = window.requestAnimationFrame(() => {
      pendingResizeFrame = null;

      if (zoomMode === 'fit') {
        updateFitScale();
      } else {
        applyStageScale();
      }

      render();
    });
  }

  function cancelPendingResizeRender(): void {
    if (pendingResizeFrame === null) {
      return;
    }

    window.cancelAnimationFrame(pendingResizeFrame);
    pendingResizeFrame = null;
  }

  function updateFitScale(): void {
    const dimensions = state.result?.resultDimensions ?? state.source?.naturalImage;

    if (!dimensions) {
      zoomScale = 1;
      return;
    }

    const availableWidth = Math.max(
      1,
      Math.min(elements.sourceFrame.clientWidth, elements.resultFrame.clientWidth) - 32,
    );
    const availableHeight = Math.max(
      1,
      Math.min(elements.sourceFrame.clientHeight, elements.resultFrame.clientHeight) - 32,
    );
    zoomScale = clamp(
      Math.min(1, availableWidth / dimensions.width, availableHeight / dimensions.height),
      MIN_ZOOM,
      1,
    );
    applyStageScale();
  }

  function setManualZoom(nextScale: number): void {
    zoomMode = 'manual';
    zoomScale = clamp(nextScale, MIN_ZOOM, MAX_ZOOM);
    applyStageScale();
    render();
  }

  function applyStageScale(): void {
    const dimensions = state.result?.resultDimensions ?? state.source?.naturalImage;

    if (!dimensions) {
      elements.sourceStage.removeAttribute('style');
      elements.resultStage.removeAttribute('style');
      return;
    }

    const width = `${String(Math.round(dimensions.width * zoomScale))}px`;
    const height = `${String(Math.round(dimensions.height * zoomScale))}px`;
    elements.sourceStage.style.width = width;
    elements.sourceStage.style.height = height;
    elements.resultStage.style.width = width;
    elements.resultStage.style.height = height;
  }

  function render(): void {
    elements.root.dataset.state = state.status;
    elements.message.textContent = state.message;
    elements.live.textContent = GRID_MIRROR_STATE_LABELS[state.status];
    elements.generateButton.hidden = state.status === 'completed';
    elements.generateButton.disabled = state.status !== 'ready' && state.status !== 'failed';
    elements.regenerateButton.hidden = state.status !== 'completed';
    elements.regenerateButton.disabled = state.readyInput === null;
    elements.returnPrecisionButton.hidden = state.status === 'waiting-for-confirmation';
    elements.returnPrecisionButton.disabled = state.source === null;
    elements.zoomControls.hidden = state.result === null;
    elements.comparison.hidden = state.result === null;
    elements.zoomStatus.textContent =
      zoomMode === 'fit' ? `适合 ${formatPercent(zoomScale)}` : formatPercent(zoomScale);
    renderDetails();
    renderResultCanvas();
  }

  function renderDetails(): void {
    const sourceDimensions = state.source?.naturalImage ?? state.result?.sourceDimensions;
    const resultDimensions = state.result?.resultDimensions;
    const calibration = state.readyInput?.calibration;

    elements.details.dataset.state = state.status;
    elements.sourceSize.textContent = sourceDimensions
      ? formatDimensions(sourceDimensions.width, sourceDimensions.height)
      : '未就绪';
    elements.resultSize.textContent = resultDimensions
      ? formatDimensions(resultDimensions.width, resultDimensions.height)
      : state.status === 'processing'
        ? '生成中'
        : '未生成';
    elements.origin.textContent = calibration
      ? `x=${String(calibration.left)}，y=${String(calibration.top)}`
      : '未确认';
    elements.cellSize.textContent = calibration ? `${String(calibration.cellSize)} px` : '未确认';
    elements.gridSize.textContent = '34 列 × 27 行，共 918 个单元格';
    elements.scope.textContent = state.result
      ? GRID_MIRROR_UNCHANGED_SCOPE_TEXT
      : calibration
        ? '已确认精确网格；镜像预览仍需手动生成。'
        : '仅等待精确确认；不会提前生成镜像。';
  }

  function renderResultCanvas(): void {
    if (!state.result || elements.resultStage.firstElementChild === state.result.outputCanvas) {
      return;
    }

    const canvas = state.result.outputCanvas;
    canvas.className = 'mirror-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '镜像结果预览，仅移动 34 × 27 网格单元格位置。');
    elements.resultStage.replaceChildren(canvas);
  }

  function announce(message: string): void {
    elements.live.textContent = message;
  }

  render();

  return {
    setImage,
    clearImage,
    setReady,
    invalidate,
  };
}

function createWaitingState(
  source: GridMirrorSourceImage | null,
  message: string,
): GridMirrorUiState {
  return {
    status: 'waiting-for-confirmation',
    message,
    source,
    readyInput: null,
    result: null,
  };
}

function createResizeObserver(callback: () => void): ResizeObserver | null {
  if (!('ResizeObserver' in window)) {
    return null;
  }

  return new ResizeObserver(callback);
}

function formatDimensions(width: number, height: number): string {
  return `${String(width)} × ${String(height)} px`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100).toString()}%`;
}

function getGridMirrorElements(root: HTMLElement): GridMirrorElements {
  return {
    root,
    message: getRequiredElement(root, '[data-grid-mirror-message]', HTMLElement),
    live: getRequiredElement(root, '[data-grid-mirror-live]', HTMLElement),
    details: getRequiredElement(root, '[data-grid-mirror-details]', HTMLElement),
    sourceSize: getRequiredElement(root, '[data-grid-mirror-source-size]', HTMLElement),
    resultSize: getRequiredElement(root, '[data-grid-mirror-result-size]', HTMLElement),
    origin: getRequiredElement(root, '[data-grid-mirror-origin]', HTMLElement),
    cellSize: getRequiredElement(root, '[data-grid-mirror-cell-size]', HTMLElement),
    gridSize: getRequiredElement(root, '[data-grid-mirror-grid-size]', HTMLElement),
    scope: getRequiredElement(root, '[data-grid-mirror-scope]', HTMLElement),
    generateButton: getRequiredElement(root, '[data-grid-mirror-generate]', HTMLButtonElement),
    regenerateButton: getRequiredElement(root, '[data-grid-mirror-regenerate]', HTMLButtonElement),
    returnPrecisionButton: getRequiredElement(
      root,
      '[data-grid-mirror-return-precision]',
      HTMLButtonElement,
    ),
    zoomControls: getRequiredElement(root, '[data-grid-mirror-zoom-controls]', HTMLElement),
    zoomFitButton: getRequiredElement(root, '[data-grid-mirror-zoom-fit]', HTMLButtonElement),
    zoomOutButton: getRequiredElement(root, '[data-grid-mirror-zoom-out]', HTMLButtonElement),
    zoomActualButton: getRequiredElement(root, '[data-grid-mirror-zoom-actual]', HTMLButtonElement),
    zoomInButton: getRequiredElement(root, '[data-grid-mirror-zoom-in]', HTMLButtonElement),
    zoomStatus: getRequiredElement(root, '[data-grid-mirror-zoom-status]', HTMLElement),
    comparison: getRequiredElement(root, '[data-grid-mirror-comparison]', HTMLElement),
    sourceFrame: getRequiredElement(root, '[data-grid-mirror-source-frame]', HTMLElement),
    resultFrame: getRequiredElement(root, '[data-grid-mirror-result-frame]', HTMLElement),
    sourceStage: getRequiredElement(root, '[data-grid-mirror-source-stage]', HTMLElement),
    resultStage: getRequiredElement(root, '[data-grid-mirror-result-stage]', HTMLElement),
    sourceImage: getRequiredElement(root, '[data-grid-mirror-source-image]', HTMLImageElement),
  };
}

function getRequiredElement<ElementType extends HTMLElement>(
  root: ParentNode,
  selector: string,
  elementType: {
    new (): ElementType;
  },
): ElementType {
  const element = root.querySelector(selector);

  if (!(element instanceof elementType)) {
    throw new Error(`Missing expected grid mirror element: ${selector}`);
  }

  return element;
}
