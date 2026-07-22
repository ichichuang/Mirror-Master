import { detectPixelanimGrid } from './detector';
import {
  PIXELANIM_GRID_COLUMNS,
  PIXELANIM_GRID_ROWS,
  PIXELANIM_HORIZONTAL_BOUNDARY_COUNT,
  PIXELANIM_VERTICAL_BOUNDARY_COUNT,
} from './constants';
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
  readonly overlay: SVGSVGElement;
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
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const IDLE_MESSAGE = '尚未选择图片，网格检测处于空闲状态。';

export function renderGridDetectionOverlay(): string {
  return '<svg class="grid-overlay" data-grid-overlay hidden aria-hidden="true"></svg>';
}

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
    </section>
  `;
}

export function mountGridDetection(
  root: HTMLElement,
  overlay: SVGSVGElement,
): GridDetectionController {
  const elements = getGridDetectionElements(root, overlay);
  let detectionVersion = 0;
  let pendingDetectionTimer: number | null = null;

  const clear = (): void => {
    detectionVersion += 1;
    clearPendingDetectionTimer();
    renderIdle(elements);
  };

  const detect = (payload: GridDetectionImageReadyPayload): void => {
    detectionVersion += 1;
    clearPendingDetectionTimer();
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

          renderOutcome(elements, outcome);
        })
        .catch(() => {
          if (currentSelectionIsStale(currentVersion)) {
            return;
          }

          renderFailed(elements, '检测过程意外中断，请重新选择图片后再试。');
        });
    }, 30);
  };

  const clearPendingDetectionTimer = (): void => {
    if (pendingDetectionTimer === null) {
      return;
    }

    window.clearTimeout(pendingDetectionTimer);
    pendingDetectionTimer = null;
  };

  const currentSelectionIsStale = (version: number): boolean => version !== detectionVersion;

  renderIdle(elements);

  return {
    clear,
    detect,
  };
}

function renderIdle(elements: GridDetectionElements): void {
  elements.root.dataset.state = 'idle';
  elements.live.textContent = IDLE_MESSAGE;
  elements.details.hidden = true;
  elements.guidance.hidden = true;
  clearOverlay(elements.overlay);
}

function renderDetecting(
  elements: GridDetectionElements,
  payload: GridDetectionImageReadyPayload,
): void {
  elements.root.dataset.state = 'detecting';
  elements.live.textContent = `正在本地检测 ${payload.fileName} 的 34 × 27 网格...`;
  elements.details.hidden = true;
  elements.guidance.hidden = true;
  clearOverlay(elements.overlay);
}

function renderOutcome(elements: GridDetectionElements, outcome: GridDetectionOutcome): void {
  if (outcome.ok) {
    renderDetected(elements, outcome);
    return;
  }

  renderFailed(elements, outcome.message, outcome.metrics);
}

function renderDetected(elements: GridDetectionElements, result: GridDetectionSuccess): void {
  elements.root.dataset.state = 'detected';
  elements.live.textContent = `已检测到 ${String(result.columns)} × ${String(
    result.rows,
  )} 网格，置信度${result.confidence.label}。`;
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
  renderOverlay(elements.overlay, result);
}

function renderFailed(
  elements: GridDetectionElements,
  message: string,
  metrics?: DetectionMetrics,
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
  elements.guidance.hidden = true;
  clearOverlay(elements.overlay);
}

function renderOverlay(overlay: SVGSVGElement, result: GridDetectionSuccess): void {
  clearOverlay(overlay);
  overlay.removeAttribute('hidden');
  overlay.setAttribute(
    'viewBox',
    `0 0 ${String(result.naturalImage.width)} ${String(result.naturalImage.height)}`,
  );
  overlay.setAttribute('preserveAspectRatio', 'none');
  overlay.dataset.confidence = result.confidence.grade;

  const group = document.createElementNS(SVG_NAMESPACE, 'g');
  group.setAttribute('class', 'grid-overlay-lines');

  for (const boundary of result.boundaries.vertical) {
    const line = document.createElementNS(SVG_NAMESPACE, 'line');
    line.setAttribute('x1', String(boundary));
    line.setAttribute('x2', String(boundary));
    line.setAttribute('y1', String(result.rectangle.y));
    line.setAttribute('y2', String(result.rectangle.bottom));
    group.append(line);
  }

  for (const boundary of result.boundaries.horizontal) {
    const line = document.createElementNS(SVG_NAMESPACE, 'line');
    line.setAttribute('x1', String(result.rectangle.x));
    line.setAttribute('x2', String(result.rectangle.right));
    line.setAttribute('y1', String(boundary));
    line.setAttribute('y2', String(boundary));
    group.append(line);
  }

  const outerRectangle = document.createElementNS(SVG_NAMESPACE, 'rect');
  outerRectangle.setAttribute('class', 'grid-overlay-outer');
  outerRectangle.setAttribute('x', String(result.rectangle.x));
  outerRectangle.setAttribute('y', String(result.rectangle.y));
  outerRectangle.setAttribute('width', String(result.rectangle.width));
  outerRectangle.setAttribute('height', String(result.rectangle.height));

  overlay.append(group, outerRectangle);
  overlay.dataset.boundaries = `${String(PIXELANIM_VERTICAL_BOUNDARY_COUNT)}v-${String(
    PIXELANIM_HORIZONTAL_BOUNDARY_COUNT,
  )}h`;
}

function clearOverlay(overlay: SVGSVGElement): void {
  overlay.replaceChildren();
  overlay.setAttribute('hidden', '');
  delete overlay.dataset.confidence;
  delete overlay.dataset.boundaries;
  overlay.removeAttribute('viewBox');
}

function getGridDetectionElements(
  root: HTMLElement,
  overlay: SVGSVGElement,
): GridDetectionElements {
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
    overlay,
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

function formatMetrics(metrics: DetectionMetrics): string {
  return `几何 ${formatPercent(metrics.geometry)}，周期 ${formatPercent(
    metrics.periodicity,
  )}，边界 ${formatPercent(metrics.boundaryStrength)}，对比 ${formatPercent(metrics.contrast)}`;
}
