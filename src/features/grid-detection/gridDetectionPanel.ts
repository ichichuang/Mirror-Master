import { detectPixelanimGrid } from './detector';
import { PIXELANIM_GRID_COLUMNS, PIXELANIM_GRID_ROWS } from './constants';
import type { GridCorrectionController } from '../grid-correction/gridCorrectionEditor';
import type { GridSelection, NaturalImageSize } from '../grid-selection/types';
import type { DetectionMetrics, GridDetectionOutcome, GridDetectionSuccess } from './types';

interface GridDetectionElements {
  readonly root: HTMLElement;
  readonly live: HTMLElement;
  readonly details: HTMLElement;
  readonly gridSize: HTMLElement;
  readonly confidence: HTMLElement;
  readonly rectangle: HTMLElement;
  readonly cellSize: HTMLElement;
  readonly metrics: HTMLElement;
  readonly guidance: HTMLElement;
  readonly actions: HTMLElement;
  readonly useDetectedButton: HTMLButtonElement;
  readonly adjustDetectedButton: HTMLButtonElement;
  readonly manualSelectionButton: HTMLButtonElement;
}

export interface GridDetectionImageReadyPayload {
  readonly file: File;
  readonly fileName: string;
  readonly width: number;
  readonly height: number;
}

export interface GridDetectionController {
  readonly clear: () => void;
  readonly detect: (payload: GridDetectionImageReadyPayload) => void;
  readonly showAppliedSelection: (selection: GridSelection) => void;
}

const IDLE_MESSAGE = '尚未选择图片，网格检测处于空闲状态。';

export function renderGridDetectionPanel(): string {
  return `
    <section class="detection-panel" aria-labelledby="detection-title" data-grid-detection>
      <div class="detection-heading">
        <h3 id="detection-title">34 × 27 网格检测</h3>
        <p>自动检测仍是原型结果；请以叠加层对齐情况为准。</p>
      </div>
      <p
        class="detection-live"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-grid-detection-live
      >
        ${IDLE_MESSAGE}
      </p>
      <dl class="detection-details" data-grid-detection-details hidden>
        <div>
          <dt>网格结构</dt>
          <dd data-grid-detection-size>未检测</dd>
        </div>
        <div>
          <dt>置信度</dt>
          <dd data-grid-detection-confidence>未检测</dd>
        </div>
        <div>
          <dt>自然坐标</dt>
          <dd data-grid-detection-rectangle>未检测</dd>
        </div>
        <div>
          <dt>单元尺寸</dt>
          <dd data-grid-detection-cell-size>未检测</dd>
        </div>
        <div>
          <dt>评分组成</dt>
          <dd data-grid-detection-metrics>未检测</dd>
        </div>
      </dl>
      <p class="detection-guidance" data-grid-detection-guidance hidden>
        请检查叠加层外框和每条分隔线是否贴合原图网格。
      </p>
      <div class="detection-actions" data-grid-detection-actions hidden aria-label="网格检测操作">
        <button class="button button-primary" type="button" data-grid-detection-use>
          使用检测结果
        </button>
        <button class="button button-secondary" type="button" data-grid-detection-adjust>
          调整检测区域
        </button>
        <button class="button button-primary" type="button" data-grid-detection-manual>
          手动选择网格区域
        </button>
      </div>
    </section>
  `;
}

export function mountGridDetection(
  root: HTMLElement,
  correction: GridCorrectionController,
): GridDetectionController {
  const elements = getGridDetectionElements(root);
  let detectionVersion = 0;
  let pendingDetectionTimer: number | null = null;
  let latestDetectedResult: GridDetectionSuccess | null = null;
  let latestFailureImage: NaturalImageSize | null = null;

  const clear = (): void => {
    detectionVersion += 1;
    clearPendingDetectionTimer();
    latestDetectedResult = null;
    latestFailureImage = null;
    correction.clearTransientResult();
    renderIdle(elements);
  };

  const detect = (payload: GridDetectionImageReadyPayload): void => {
    detectionVersion += 1;
    clearPendingDetectionTimer();
    latestDetectedResult = null;
    latestFailureImage = null;
    correction.clearTransientResult();
    const currentVersion = detectionVersion;
    renderDetecting(elements, payload);

    pendingDetectionTimer = window.setTimeout(() => {
      pendingDetectionTimer = null;

      void detectPixelanimGrid({
        file: payload.file,
        naturalImage: {
          width: payload.width,
          height: payload.height,
        },
      })
        .then((outcome) => {
          if (currentSelectionIsStale(currentVersion)) {
            return;
          }

          renderOutcome(elements, outcome, correction, setLatestResult);
        })
        .catch(() => {
          if (currentSelectionIsStale(currentVersion)) {
            return;
          }

          const naturalImage = {
            width: payload.width,
            height: payload.height,
          };
          latestDetectedResult = null;
          latestFailureImage = naturalImage;
          correction.showDetectionFailure(naturalImage);
          renderFailed(
            elements,
            '检测过程意外中断，请重新选择图片后再试。',
            undefined,
            naturalImage,
          );
        });
    }, 30);
  };

  const showAppliedSelection = (selection: GridSelection): void => {
    renderAppliedSelection(elements, selection);
  };

  const clearPendingDetectionTimer = (): void => {
    if (pendingDetectionTimer === null) {
      return;
    }

    window.clearTimeout(pendingDetectionTimer);
    pendingDetectionTimer = null;
  };

  const currentSelectionIsStale = (version: number): boolean => version !== detectionVersion;

  const setLatestResult = (
    detectedResult: GridDetectionSuccess | null,
    failureImage: NaturalImageSize | null,
  ): void => {
    latestDetectedResult = detectedResult;
    latestFailureImage = failureImage;
  };

  elements.useDetectedButton.addEventListener('click', () => {
    if (!latestDetectedResult || latestDetectedResult.confidence.grade === 'low') {
      return;
    }

    const selection = correction.acceptDetectedResult(latestDetectedResult);

    if (selection) {
      renderAppliedSelection(elements, selection);
    }
  });

  elements.adjustDetectedButton.addEventListener('click', () => {
    if (!latestDetectedResult || latestDetectedResult.confidence.grade === 'low') {
      return;
    }

    correction.startDetectedAdjustment(latestDetectedResult);
    elements.live.textContent = '正在调整检测到的网格区域；请使用预览图上的手柄。';
    elements.guidance.textContent = '校正完成后在预览图下方点击“应用”。';
    elements.guidance.hidden = false;
  });

  elements.manualSelectionButton.addEventListener('click', () => {
    if (!latestFailureImage) {
      return;
    }

    correction.startManualSelection(latestFailureImage);
    elements.live.textContent = '请在预览图上拖出完整 34 × 27 外框的近似区域。';
    elements.guidance.textContent = '拖出近似区域后会出现八个边角手柄和整框移动区域。';
    elements.guidance.hidden = false;
  });

  renderIdle(elements);

  return {
    clear,
    detect,
    showAppliedSelection,
  };
}

function renderIdle(elements: GridDetectionElements): void {
  elements.root.dataset.state = 'idle';
  elements.live.textContent = IDLE_MESSAGE;
  elements.details.hidden = true;
  elements.guidance.hidden = true;
  hideActions(elements);
}

function renderDetecting(
  elements: GridDetectionElements,
  payload: GridDetectionImageReadyPayload,
): void {
  elements.root.dataset.state = 'detecting';
  elements.live.textContent = `正在本地检测 ${payload.fileName} 的 34 × 27 网格...`;
  elements.details.hidden = true;
  elements.guidance.hidden = true;
  hideActions(elements);
}

function renderOutcome(
  elements: GridDetectionElements,
  outcome: GridDetectionOutcome,
  correction: GridCorrectionController,
  setLatestResult: (
    detectedResult: GridDetectionSuccess | null,
    failureImage: NaturalImageSize | null,
  ) => void,
): void {
  if (outcome.ok) {
    if (outcome.confidence.grade === 'low') {
      setLatestResult(null, outcome.naturalImage);
      correction.showDetectionFailure(outcome.naturalImage);
      renderFailed(
        elements,
        '检测置信度较低，不能直接接受；请手动选择完整网格区域。',
        outcome.metrics,
        outcome.naturalImage,
      );
      return;
    }

    setLatestResult(outcome, null);
    correction.showDetectedResult(outcome);
    renderDetected(elements, outcome);
    return;
  }

  setLatestResult(null, outcome.naturalImage ?? null);
  correction.showDetectionFailure(outcome.naturalImage ?? null);
  renderFailed(elements, outcome.message, outcome.metrics, outcome.naturalImage);
}

function renderDetected(elements: GridDetectionElements, result: GridDetectionSuccess): void {
  elements.root.dataset.state = 'detected';
  elements.live.textContent = `已检测到 ${String(result.columns)} × ${String(
    result.rows,
  )} 网格，置信度${result.confidence.label}。请选择使用或调整检测结果。`;
  elements.gridSize.textContent = `${String(result.columns)} 列 × ${String(result.rows)} 行`;
  elements.confidence.textContent = `${result.confidence.label}（${formatPercent(
    result.confidence.score,
  )}）`;
  elements.rectangle.textContent = `x=${formatCoordinate(result.rectangle.x)}, y=${formatCoordinate(
    result.rectangle.y,
  )}, w=${formatCoordinate(result.rectangle.width)}, h=${formatCoordinate(result.rectangle.height)}`;
  elements.cellSize.textContent = `约 ${formatCoordinate(result.cellSize.width)} × ${formatCoordinate(
    result.cellSize.height,
  )} px`;
  elements.metrics.textContent = formatMetrics(result.metrics);
  elements.details.hidden = false;
  elements.guidance.hidden = false;
  elements.guidance.textContent = '高或中置信度只代表可接受候选；应用前仍可调整外框。';
  elements.actions.hidden = false;
  elements.useDetectedButton.hidden = false;
  elements.adjustDetectedButton.hidden = false;
  elements.manualSelectionButton.hidden = true;
}

function renderFailed(
  elements: GridDetectionElements,
  message: string,
  metrics?: DetectionMetrics,
  naturalImage?: NaturalImageSize,
): void {
  elements.root.dataset.state = 'failed';
  elements.live.textContent = message;
  elements.gridSize.textContent = `${String(PIXELANIM_GRID_COLUMNS)} 列 × ${String(
    PIXELANIM_GRID_ROWS,
  )} 行`;
  elements.confidence.textContent = '低或无有效候选';
  elements.rectangle.textContent = '未显示叠加层';
  elements.cellSize.textContent = '未检测';
  elements.metrics.textContent = metrics ? formatMetrics(metrics) : '没有足够稳定的评分组成。';
  elements.details.hidden = false;
  elements.guidance.textContent = naturalImage
    ? '自动检测未产生可接受结果；请手动拖出完整 34 × 27 外框。'
    : '自动检测未产生可接受结果。';
  elements.guidance.hidden = false;
  elements.actions.hidden = naturalImage === undefined;
  elements.useDetectedButton.hidden = true;
  elements.adjustDetectedButton.hidden = true;
  elements.manualSelectionButton.hidden = naturalImage === undefined;
}

function renderAppliedSelection(elements: GridDetectionElements, selection: GridSelection): void {
  elements.root.dataset.state = 'applied';
  elements.live.textContent = `已应用${formatSelectionSource(selection.source)}网格选择。`;
  elements.gridSize.textContent = `${String(PIXELANIM_GRID_COLUMNS)} 列 × ${String(
    PIXELANIM_GRID_ROWS,
  )} 行`;
  elements.confidence.textContent = formatSelectionSource(selection.source);
  elements.rectangle.textContent = `x=${formatCoordinate(selection.rectangle.x)}, y=${formatCoordinate(
    selection.rectangle.y,
  )}, w=${formatCoordinate(selection.rectangle.width)}, h=${formatCoordinate(
    selection.rectangle.height,
  )}`;
  elements.cellSize.textContent = `${formatCoordinate(selection.cellSize.width)} × ${formatCoordinate(
    selection.cellSize.height,
  )} px`;
  elements.metrics.textContent = '已创建浏览器内存中的网格选择；未上传、未导出。';
  elements.details.hidden = false;
  elements.guidance.textContent = '如需继续微调，请在预览图下方点击“编辑已应用区域”。';
  elements.guidance.hidden = false;
  hideActions(elements);
}

function hideActions(elements: GridDetectionElements): void {
  elements.actions.hidden = true;
  elements.useDetectedButton.hidden = true;
  elements.adjustDetectedButton.hidden = true;
  elements.manualSelectionButton.hidden = true;
}

function getGridDetectionElements(root: HTMLElement): GridDetectionElements {
  return {
    root,
    live: getRequiredElement(root, '[data-grid-detection-live]', HTMLElement),
    details: getRequiredElement(root, '[data-grid-detection-details]', HTMLElement),
    gridSize: getRequiredElement(root, '[data-grid-detection-size]', HTMLElement),
    confidence: getRequiredElement(root, '[data-grid-detection-confidence]', HTMLElement),
    rectangle: getRequiredElement(root, '[data-grid-detection-rectangle]', HTMLElement),
    cellSize: getRequiredElement(root, '[data-grid-detection-cell-size]', HTMLElement),
    metrics: getRequiredElement(root, '[data-grid-detection-metrics]', HTMLElement),
    guidance: getRequiredElement(root, '[data-grid-detection-guidance]', HTMLElement),
    actions: getRequiredElement(root, '[data-grid-detection-actions]', HTMLElement),
    useDetectedButton: getRequiredElement(root, '[data-grid-detection-use]', HTMLButtonElement),
    adjustDetectedButton: getRequiredElement(
      root,
      '[data-grid-detection-adjust]',
      HTMLButtonElement,
    ),
    manualSelectionButton: getRequiredElement(
      root,
      '[data-grid-detection-manual]',
      HTMLButtonElement,
    ),
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
    throw new Error(`Missing expected grid detection element: ${selector}`);
  }

  return element;
}

function formatCoordinate(value: number): string {
  return value.toFixed(2).replace(/\.00$/, '');
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100).toString()}%`;
}

function formatSelectionSource(source: GridSelection['source']): string {
  return source === 'automatic' ? '自动检测' : '手动校正';
}

function formatMetrics(metrics: DetectionMetrics): string {
  return `几何 ${formatPercent(metrics.geometry)}，周期 ${formatPercent(
    metrics.periodicity,
  )}，边界 ${formatPercent(metrics.boundaryStrength)}，对比 ${formatPercent(metrics.contrast)}`;
}
