import type { GridDetectionSuccess } from '../grid-detection/types';
import { MIN_GRID_SELECTION_HEIGHT, MIN_GRID_SELECTION_WIDTH } from '../grid-selection/constants';
import {
  clamp,
  clampRectInsideImage,
  correctRectToGridRatio,
  createGridSelection,
  createNaturalRect,
  deriveGridBoundaries,
  translateRectInsideImage,
  validateGridSelectionRect,
} from '../grid-selection/geometry';
import type { GridSelection, NaturalImageRect, NaturalImageSize } from '../grid-selection/types';
import {
  HANDLE_LABELS,
  HANDLE_TARGET_CSS_SIZE,
  HANDLE_VISUAL_CSS_SIZE,
  type HandleType,
} from './gridCorrectionHandles';

type EditorMode =
  'empty' | 'image-ready' | 'detected-preview' | 'manual-draw' | 'editing' | 'applied';

type ZoomMode = 'fit' | 'manual';

interface NaturalPoint {
  readonly x: number;
  readonly y: number;
}

interface ActivePointerBase {
  readonly pointerId: number;
  readonly startPoint: NaturalPoint;
}

interface DrawPointer extends ActivePointerBase {
  readonly kind: 'draw';
}

interface HandlePointer extends ActivePointerBase {
  readonly kind: 'handle';
  readonly handle: HandleType;
  readonly startRectangle: NaturalImageRect;
}

type ActivePointer = DrawPointer | HandlePointer;

interface GridCorrectionElements {
  readonly root: HTMLElement;
  readonly frame: HTMLElement;
  readonly stage: HTMLElement;
  readonly image: HTMLImageElement;
  readonly overlay: SVGSVGElement;
  readonly zoomControls: HTMLElement;
  readonly zoomFitButton: HTMLButtonElement;
  readonly zoomInButton: HTMLButtonElement;
  readonly zoomOutButton: HTMLButtonElement;
  readonly zoomActualButton: HTMLButtonElement;
  readonly zoomStatus: HTMLElement;
  readonly controls: HTMLElement;
  readonly applyButton: HTMLButtonElement;
  readonly cancelButton: HTMLButtonElement;
  readonly startOverButton: HTMLButtonElement;
  readonly resetDetectedButton: HTMLButtonElement;
  readonly ratioButton: HTMLButtonElement;
  readonly editButton: HTMLButtonElement;
  readonly readout: HTMLElement;
  readonly coordinates: HTMLElement;
  readonly cellSize: HTMLElement;
  readonly validation: HTMLElement;
  readonly live: HTMLElement;
}

export interface GridCorrectionLifecycle {
  readonly onSelectionApplied?: (selection: GridSelection) => void;
  readonly onSelectionCleared?: () => void;
}

export interface GridCorrectionController {
  readonly clearImage: () => void;
  readonly setImage: (naturalImage: NaturalImageSize) => void;
  readonly clearTransientResult: () => void;
  readonly showDetectedResult: (result: GridDetectionSuccess) => void;
  readonly showDetectionFailure: (naturalImage: NaturalImageSize | null) => void;
  readonly acceptDetectedResult: (result: GridDetectionSuccess) => GridSelection | null;
  readonly startDetectedAdjustment: (result: GridDetectionSuccess) => void;
  readonly startManualSelection: (naturalImage: NaturalImageSize) => void;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 4;

export function mountGridCorrectionEditor(
  root: HTMLElement,
  lifecycle: GridCorrectionLifecycle = {},
): GridCorrectionController {
  const elements = getGridCorrectionElements(root);

  let mode: EditorMode = 'empty';
  let naturalImage: NaturalImageSize | null = null;
  let detectedResult: GridDetectionSuccess | null = null;
  let appliedSelection: GridSelection | null = null;
  let draftRectangle: NaturalImageRect | null = null;
  let activePointer: ActivePointer | null = null;
  let zoomMode: ZoomMode = 'fit';
  let zoomScale = 1;
  let pendingResizeFrame: number | null = null;

  const resizeObserver = createResizeObserver(scheduleResizeRender);

  resizeObserver?.observe(elements.frame);

  elements.zoomFitButton.addEventListener('click', () => {
    zoomMode = 'fit';
    updateFitScale();
    renderAll();
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

  elements.applyButton.addEventListener('click', () => {
    applyDraftSelection();
  });

  elements.cancelButton.addEventListener('click', () => {
    cancelEditing();
  });

  elements.startOverButton.addEventListener('click', () => {
    startOver();
  });

  elements.resetDetectedButton.addEventListener('click', () => {
    resetToDetectedResult();
  });

  elements.ratioButton.addEventListener('click', () => {
    correctDraftRatio();
  });

  elements.editButton.addEventListener('click', () => {
    editAppliedSelection();
  });

  elements.overlay.addEventListener('pointerdown', handlePointerDown);
  elements.overlay.addEventListener('pointermove', handlePointerMove);
  elements.overlay.addEventListener('pointerup', handlePointerUp);
  elements.overlay.addEventListener('pointercancel', handlePointerCancel);
  elements.overlay.addEventListener('keydown', handleHandleKeyDown);

  const setImage = (nextNaturalImage: NaturalImageSize): void => {
    clearSelectionState(false);
    naturalImage = nextNaturalImage;
    mode = 'image-ready';
    zoomMode = 'fit';
    detectedResult = null;
    draftRectangle = null;
    activePointer = null;
    updateFitScale();
    renderAll();
  };

  const clearImage = (): void => {
    clearSelectionState(true);
    cancelPendingResizeRender();
    naturalImage = null;
    detectedResult = null;
    draftRectangle = null;
    activePointer = null;
    mode = 'empty';
    elements.stage.removeAttribute('style');
    renderAll();
  };

  const clearTransientResult = (): void => {
    detectedResult = null;

    if (mode === 'detected-preview') {
      mode = naturalImage ? 'image-ready' : 'empty';
    }

    if (mode === 'image-ready') {
      draftRectangle = null;
    }

    renderAll();
  };

  const showDetectedResult = (result: GridDetectionSuccess): void => {
    if (!sameImage(result.naturalImage)) {
      return;
    }

    detectedResult = result;

    if (mode !== 'editing' && mode !== 'manual-draw' && mode !== 'applied') {
      mode = 'detected-preview';
      draftRectangle = null;
    }

    renderAll();
  };

  const showDetectionFailure = (failedNaturalImage: NaturalImageSize | null): void => {
    if (!failedNaturalImage || !sameImage(failedNaturalImage)) {
      clearTransientResult();
      return;
    }

    detectedResult = null;

    if (mode !== 'editing' && mode !== 'manual-draw' && mode !== 'applied') {
      mode = 'image-ready';
      draftRectangle = null;
    }

    renderAll();
  };

  const acceptDetectedResult = (result: GridDetectionSuccess): GridSelection | null => {
    if (result.confidence.grade === 'low' || !sameImage(result.naturalImage)) {
      announce('低置信度或过期检测结果不能应用。');
      return null;
    }

    detectedResult = result;
    const selection = createGridSelection('automatic', result.naturalImage, result.rectangle);

    if (!selection) {
      announce('检测区域未通过 34 × 27 近似正方形校验，请改为手动调整。');
      return null;
    }

    appliedSelection = selection;
    draftRectangle = null;
    mode = 'applied';
    renderAll();
    announceApplied(selection);
    lifecycle.onSelectionApplied?.(selection);

    return selection;
  };

  const startDetectedAdjustment = (result: GridDetectionSuccess): void => {
    if (result.confidence.grade === 'low' || !sameImage(result.naturalImage)) {
      announce('低置信度或过期检测结果不能作为校正起点。');
      return;
    }

    detectedResult = result;
    draftRectangle = clampRectInsideImage(result.rectangle, result.naturalImage);
    mode = 'editing';
    renderAll();
    announce('已用检测到的自然坐标区域作为校正起点。');
  };

  const startManualSelection = (manualNaturalImage: NaturalImageSize): void => {
    if (!sameImage(manualNaturalImage)) {
      return;
    }

    detectedResult = null;
    draftRectangle = null;
    activePointer = null;
    mode = 'manual-draw';
    renderAll();
    announce('请在图片上拖出完整 34 × 27 外框的近似区域。');
  };

  function clearSelectionState(emit: boolean): void {
    const hadSelection = appliedSelection !== null;
    appliedSelection = null;

    if (emit && hadSelection) {
      lifecycle.onSelectionCleared?.();
    }
  }

  function sameImage(candidate: NaturalImageSize): boolean {
    return naturalImage?.width === candidate.width && naturalImage.height === candidate.height;
  }

  function applyDraftSelection(): void {
    if (!naturalImage || !draftRectangle) {
      announce('没有可应用的网格区域。');
      return;
    }

    const selection = createGridSelection('manual', naturalImage, draftRectangle);

    if (!selection) {
      const validation = validateGridSelectionRect(draftRectangle, naturalImage);
      announce(`无法应用：${validation.message}`);
      renderAll();
      return;
    }

    appliedSelection = selection;
    draftRectangle = null;
    mode = 'applied';
    renderAll();
    announceApplied(selection);
    lifecycle.onSelectionApplied?.(selection);
  }

  function cancelEditing(): void {
    activePointer = null;
    draftRectangle = null;

    if (appliedSelection) {
      mode = 'applied';
      renderAll();
      announce('已取消编辑，保留已应用的网格区域。');
      return;
    }

    if (detectedResult) {
      mode = 'detected-preview';
      renderAll();
      announce('已取消编辑，返回自动检测结果预览。');
      return;
    }

    mode = naturalImage ? 'image-ready' : 'empty';
    renderAll();
    announce('已取消手动选择。');
  }

  function startOver(): void {
    if (!naturalImage) {
      return;
    }

    activePointer = null;
    draftRectangle = null;
    mode = 'manual-draw';
    renderAll();
    announce('已重新开始，请拖出一个新的完整网格外框。');
  }

  function resetToDetectedResult(): void {
    if (!detectedResult || !sameImage(detectedResult.naturalImage)) {
      announce('没有可重置的自动检测结果。');
      return;
    }

    draftRectangle = clampRectInsideImage(detectedResult.rectangle, detectedResult.naturalImage);
    mode = 'editing';
    renderAll();
    announce('已重置为自动检测到的网格区域。');
  }

  function correctDraftRatio(): void {
    if (!naturalImage || !draftRectangle) {
      announce('请先选择一个网格区域。');
      return;
    }

    const corrected = correctRectToGridRatio(draftRectangle, naturalImage);

    if (!corrected) {
      announce('图片边界内没有足够空间校正到 34:27。');
      return;
    }

    draftRectangle = corrected;
    mode = 'editing';
    renderAll();
    announce('已围绕中心校正到精确 34:27，并保持在图片边界内。');
  }

  function editAppliedSelection(): void {
    if (!appliedSelection) {
      announce('当前没有已应用的网格区域可编辑。');
      return;
    }

    draftRectangle = appliedSelection.rectangle;
    mode = 'editing';
    renderAll();
    announce('正在编辑已应用区域；应用前原选择仍保留。');
  }

  function announceApplied(selection: GridSelection): void {
    announce(
      `已应用${selection.source === 'automatic' ? '自动检测' : '手动校正'}网格区域，` +
        `自然坐标 x=${formatCoordinate(selection.rectangle.x)}，y=${formatCoordinate(
          selection.rectangle.y,
        )}。`,
    );
  }

  function setManualZoom(nextScale: number): void {
    zoomMode = 'manual';
    zoomScale = clamp(nextScale, MIN_ZOOM, MAX_ZOOM);
    applyStageScale();
    renderAll();
  }

  function scheduleResizeRender(): void {
    if (pendingResizeFrame !== null) {
      return;
    }

    pendingResizeFrame = window.requestAnimationFrame(() => {
      pendingResizeFrame = null;

      if (!naturalImage) {
        return;
      }

      if (zoomMode === 'fit') {
        updateFitScale();
      } else {
        applyStageScale();
      }

      renderAll();
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
    if (!naturalImage) {
      zoomScale = 1;
      return;
    }

    const availableWidth = Math.max(1, elements.frame.clientWidth - 32);
    const availableHeight = Math.max(1, elements.frame.clientHeight - 32);
    zoomScale = clamp(
      Math.min(1, availableWidth / naturalImage.width, availableHeight / naturalImage.height),
      MIN_ZOOM,
      1,
    );
    applyStageScale();
  }

  function applyStageScale(): void {
    if (!naturalImage) {
      return;
    }

    elements.stage.style.width = `${String(Math.round(naturalImage.width * zoomScale))}px`;
    elements.stage.style.height = `${String(Math.round(naturalImage.height * zoomScale))}px`;
  }

  function handlePointerDown(event: PointerEvent): void {
    if (!naturalImage || event.button !== 0) {
      return;
    }

    const handle = getEventHandle(event);
    const point = clientToNaturalPoint(event);

    if (mode === 'manual-draw' && !handle) {
      event.preventDefault();
      activePointer = {
        kind: 'draw',
        pointerId: event.pointerId,
        startPoint: point,
      };
      draftRectangle = null;
      elements.overlay.setPointerCapture(event.pointerId);
      renderAll();
      return;
    }

    if (mode === 'editing' && handle && draftRectangle) {
      event.preventDefault();
      activePointer = {
        kind: 'handle',
        pointerId: event.pointerId,
        startPoint: point,
        handle,
        startRectangle: draftRectangle,
      };
      elements.overlay.setPointerCapture(event.pointerId);
    }
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!naturalImage || !activePointer || event.pointerId !== activePointer.pointerId) {
      return;
    }

    event.preventDefault();
    const point = clientToNaturalPoint(event);

    if (activePointer.kind === 'draw') {
      draftRectangle = createNaturalRect(
        activePointer.startPoint.x,
        activePointer.startPoint.y,
        point.x,
        point.y,
      );
      renderAll();
      return;
    }

    const deltaX = point.x - activePointer.startPoint.x;
    const deltaY = point.y - activePointer.startPoint.y;
    draftRectangle = applyHandleDelta(
      activePointer.handle,
      activePointer.startRectangle,
      deltaX,
      deltaY,
      naturalImage,
    );
    renderAll();
  }

  function handlePointerUp(event: PointerEvent): void {
    if (!naturalImage || !activePointer || event.pointerId !== activePointer.pointerId) {
      return;
    }

    event.preventDefault();
    releasePointer(event.pointerId);

    if (activePointer.kind === 'draw') {
      activePointer = null;

      if (!draftRectangle) {
        renderAll();
        return;
      }

      const rawValidation = validateGridSelectionRect(draftRectangle, naturalImage);

      if (!rawValidation.ok && rawValidation.reason === 'too-small') {
        draftRectangle = null;
        mode = 'manual-draw';
        renderAll();
        announce(`框选区域太小。${rawValidation.message} 请重新拖出近似外框。`);
        return;
      }

      const normalized = clampRectInsideImage(draftRectangle, naturalImage);
      const validation = validateGridSelectionRect(normalized, naturalImage);
      draftRectangle = normalized;
      mode = 'editing';
      renderAll();
      announce(`已创建手动外框。${validation.message}`);
      return;
    }

    activePointer = null;
    renderAll();
    announceCurrentDraft();
  }

  function handlePointerCancel(event: PointerEvent): void {
    if (!activePointer || event.pointerId !== activePointer.pointerId) {
      return;
    }

    releasePointer(event.pointerId);

    if (activePointer.kind === 'draw') {
      draftRectangle = null;
      mode = 'manual-draw';
    }

    activePointer = null;
    renderAll();
    announce('指针操作已取消。');
  }

  function handleHandleKeyDown(event: KeyboardEvent): void {
    if (!naturalImage || mode !== 'editing' || !draftRectangle) {
      return;
    }

    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'ArrowDown'
    ) {
      return;
    }

    const handle = getEventHandle(event);

    if (!handle) {
      return;
    }

    const step = event.shiftKey ? 10 : 1;
    const nextRectangle =
      handle === 'move'
        ? applyKeyboardMove(draftRectangle, event.key, step, naturalImage)
        : applyKeyboardHandle(draftRectangle, handle, event.key, step, naturalImage);

    if (!nextRectangle) {
      return;
    }

    event.preventDefault();
    draftRectangle = nextRectangle;
    renderAll();
    announceCurrentDraft();
  }

  function announceCurrentDraft(): void {
    if (!naturalImage || !draftRectangle) {
      return;
    }

    const validation = validateGridSelectionRect(draftRectangle, naturalImage);
    announce(validation.message);
  }

  function releasePointer(pointerId: number): void {
    if (elements.overlay.hasPointerCapture(pointerId)) {
      elements.overlay.releasePointerCapture(pointerId);
    }
  }

  function clientToNaturalPoint(event: PointerEvent): NaturalPoint {
    if (!naturalImage) {
      return {
        x: 0,
        y: 0,
      };
    }

    const bounds = elements.overlay.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * naturalImage.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * naturalImage.height;

    return {
      x: clamp(x, 0, naturalImage.width),
      y: clamp(y, 0, naturalImage.height),
    };
  }

  function renderAll(): void {
    renderZoomControls();
    renderCorrectionControls();
    renderReadout();
    renderSvg();
  }

  function renderZoomControls(): void {
    const hasImage = naturalImage !== null;
    elements.zoomControls.hidden = !hasImage;

    if (!hasImage) {
      elements.zoomStatus.textContent = '未选择';
      return;
    }

    elements.zoomStatus.textContent =
      zoomMode === 'fit' ? `适合 ${formatPercent(zoomScale)}` : formatPercent(zoomScale);
  }

  function renderCorrectionControls(): void {
    const isEditing = mode === 'editing' || mode === 'manual-draw';
    const isApplied = mode === 'applied';
    elements.controls.hidden = !isEditing && !isApplied;
    elements.applyButton.hidden = !isEditing;
    elements.cancelButton.hidden = !isEditing;
    elements.startOverButton.hidden = !isEditing;
    elements.resetDetectedButton.hidden = !isEditing || detectedResult === null;
    elements.ratioButton.hidden = !isEditing;
    elements.editButton.hidden = !isApplied;

    const validation =
      naturalImage && draftRectangle
        ? validateGridSelectionRect(draftRectangle, naturalImage)
        : null;
    elements.applyButton.disabled = !validation?.ok;
    elements.ratioButton.disabled = draftRectangle === null;
  }

  function renderReadout(): void {
    const visibleRectangle = getVisibleRectangle();
    elements.readout.hidden = visibleRectangle === null;

    if (!visibleRectangle || !naturalImage) {
      elements.coordinates.textContent = '自然坐标：未选择';
      elements.cellSize.textContent = '单元尺寸：未选择';
      elements.validation.textContent = '校验状态：未选择';
      elements.validation.dataset.state = 'idle';
      return;
    }

    const validation = validateGridSelectionRect(visibleRectangle, naturalImage);
    elements.coordinates.textContent = `自然坐标：x=${formatCoordinate(
      visibleRectangle.x,
    )}，y=${formatCoordinate(visibleRectangle.y)}，w=${formatCoordinate(
      visibleRectangle.width,
    )}，h=${formatCoordinate(visibleRectangle.height)}`;
    elements.cellSize.textContent = `单元尺寸：${formatCoordinate(
      validation.cellSize.width,
    )} × ${formatCoordinate(validation.cellSize.height)} px`;
    elements.validation.textContent = validation.ok
      ? `校验状态：${validation.message}`
      : `不匹配：${validation.message} 可使用“校正为 34:27”。`;
    elements.validation.dataset.state = validation.ok ? 'valid' : 'invalid';
  }

  function renderSvg(): void {
    elements.overlay.replaceChildren();

    if (!naturalImage) {
      elements.overlay.setAttribute('hidden', '');
      elements.overlay.setAttribute('aria-hidden', 'true');
      elements.overlay.removeAttribute('viewBox');
      delete elements.overlay.dataset.interactive;
      delete elements.overlay.dataset.mode;
      return;
    }

    const visibleRectangle = getVisibleRectangle();
    const shouldShow = mode === 'manual-draw' || visibleRectangle !== null;

    if (!shouldShow) {
      elements.overlay.setAttribute('hidden', '');
      elements.overlay.setAttribute('aria-hidden', 'true');
      delete elements.overlay.dataset.interactive;
      delete elements.overlay.dataset.mode;
      return;
    }

    elements.overlay.removeAttribute('hidden');
    elements.overlay.setAttribute(
      'viewBox',
      `0 0 ${String(naturalImage.width)} ${String(naturalImage.height)}`,
    );
    elements.overlay.setAttribute('preserveAspectRatio', 'none');
    elements.overlay.setAttribute(
      'aria-hidden',
      mode === 'editing' || mode === 'manual-draw' ? 'false' : 'true',
    );
    elements.overlay.dataset.interactive =
      mode === 'editing' || mode === 'manual-draw' ? 'true' : 'false';
    elements.overlay.dataset.mode = mode;

    if (!visibleRectangle) {
      return;
    }

    if (mode === 'manual-draw') {
      renderDraftRectangle(visibleRectangle);
      return;
    }

    renderGrid(visibleRectangle);

    if (mode === 'editing') {
      renderHandles(visibleRectangle);
    }
  }

  function renderDraftRectangle(rectangle: NaturalImageRect): void {
    const rect = document.createElementNS(SVG_NAMESPACE, 'rect');
    rect.setAttribute('class', 'grid-correction-draft');
    rect.setAttribute('x', String(rectangle.x));
    rect.setAttribute('y', String(rectangle.y));
    rect.setAttribute('width', String(rectangle.width));
    rect.setAttribute('height', String(rectangle.height));
    elements.overlay.append(rect);
  }

  function renderGrid(rectangle: NaturalImageRect): void {
    const boundaries = deriveGridBoundaries(rectangle);
    const lineGroup = document.createElementNS(SVG_NAMESPACE, 'g');
    lineGroup.setAttribute('class', 'grid-overlay-lines');

    for (const boundary of boundaries.vertical) {
      const line = document.createElementNS(SVG_NAMESPACE, 'line');
      line.setAttribute('x1', String(boundary));
      line.setAttribute('x2', String(boundary));
      line.setAttribute('y1', String(rectangle.y));
      line.setAttribute('y2', String(rectangle.bottom));
      lineGroup.append(line);
    }

    for (const boundary of boundaries.horizontal) {
      const line = document.createElementNS(SVG_NAMESPACE, 'line');
      line.setAttribute('x1', String(rectangle.x));
      line.setAttribute('x2', String(rectangle.right));
      line.setAttribute('y1', String(boundary));
      line.setAttribute('y2', String(boundary));
      lineGroup.append(line);
    }

    const outerRectangle = document.createElementNS(SVG_NAMESPACE, 'rect');
    outerRectangle.setAttribute('class', 'grid-overlay-outer');
    outerRectangle.setAttribute('x', String(rectangle.x));
    outerRectangle.setAttribute('y', String(rectangle.y));
    outerRectangle.setAttribute('width', String(rectangle.width));
    outerRectangle.setAttribute('height', String(rectangle.height));

    elements.overlay.append(lineGroup, outerRectangle);
  }

  function renderHandles(rectangle: NaturalImageRect): void {
    renderMoveTarget(rectangle);

    const handles: ReadonlyArray<readonly [HandleType, number, number]> = [
      ['nw', rectangle.x, rectangle.y],
      ['n', rectangle.x + rectangle.width / 2, rectangle.y],
      ['ne', rectangle.right, rectangle.y],
      ['e', rectangle.right, rectangle.y + rectangle.height / 2],
      ['se', rectangle.right, rectangle.bottom],
      ['s', rectangle.x + rectangle.width / 2, rectangle.bottom],
      ['sw', rectangle.x, rectangle.bottom],
      ['w', rectangle.x, rectangle.y + rectangle.height / 2],
    ];

    for (const [handle, x, y] of handles) {
      renderHandle(handle, x, y);
    }
  }

  function renderMoveTarget(rectangle: NaturalImageRect): void {
    const moveTarget = document.createElementNS(SVG_NAMESPACE, 'rect');
    moveTarget.setAttribute('class', 'grid-correction-move-target');
    moveTarget.setAttribute('x', String(rectangle.x));
    moveTarget.setAttribute('y', String(rectangle.y));
    moveTarget.setAttribute('width', String(rectangle.width));
    moveTarget.setAttribute('height', String(rectangle.height));
    moveTarget.setAttribute('tabindex', '0');
    moveTarget.setAttribute('role', 'button');
    moveTarget.setAttribute('aria-label', HANDLE_LABELS.move);
    moveTarget.dataset.correctionHandle = 'move';
    elements.overlay.append(moveTarget);
  }

  function renderHandle(handle: HandleType, x: number, y: number): void {
    const targetSize = HANDLE_TARGET_CSS_SIZE / zoomScale;
    const visualSize = HANDLE_VISUAL_CSS_SIZE / zoomScale;
    const target = document.createElementNS(SVG_NAMESPACE, 'rect');
    target.setAttribute('class', 'grid-correction-handle');
    target.setAttribute('x', String(x - targetSize / 2));
    target.setAttribute('y', String(y - targetSize / 2));
    target.setAttribute('width', String(targetSize));
    target.setAttribute('height', String(targetSize));
    target.setAttribute('tabindex', '0');
    target.setAttribute('role', 'button');
    target.setAttribute('aria-label', HANDLE_LABELS[handle]);
    target.dataset.correctionHandle = handle;

    const visual = document.createElementNS(SVG_NAMESPACE, 'rect');
    visual.setAttribute('class', 'grid-correction-handle-visual');
    visual.setAttribute('x', String(x - visualSize / 2));
    visual.setAttribute('y', String(y - visualSize / 2));
    visual.setAttribute('width', String(visualSize));
    visual.setAttribute('height', String(visualSize));
    visual.setAttribute('aria-hidden', 'true');

    elements.overlay.append(target, visual);
  }

  function getVisibleRectangle(): NaturalImageRect | null {
    if (draftRectangle) {
      return draftRectangle;
    }

    if (mode === 'applied' && appliedSelection) {
      return appliedSelection.rectangle;
    }

    if (mode === 'detected-preview' && detectedResult) {
      return detectedResult.rectangle;
    }

    return null;
  }

  function announce(message: string): void {
    elements.live.hidden = false;
    elements.live.textContent = message;
  }

  renderAll();

  return {
    clearImage,
    setImage,
    clearTransientResult,
    showDetectedResult,
    showDetectionFailure,
    acceptDetectedResult,
    startDetectedAdjustment,
    startManualSelection,
  };
}

function applyHandleDelta(
  handle: HandleType,
  startRectangle: NaturalImageRect,
  deltaX: number,
  deltaY: number,
  naturalImage: NaturalImageSize,
): NaturalImageRect {
  if (handle === 'move') {
    return translateRectInsideImage(startRectangle, deltaX, deltaY, naturalImage);
  }

  return resizeRectangle(
    startRectangle,
    {
      left: handle.includes('w') ? deltaX : 0,
      right: handle.includes('e') ? deltaX : 0,
      top: handle.includes('n') ? deltaY : 0,
      bottom: handle.includes('s') ? deltaY : 0,
    },
    naturalImage,
  );
}

function applyKeyboardMove(
  rectangle: NaturalImageRect,
  key: string,
  step: number,
  naturalImage: NaturalImageSize,
): NaturalImageRect {
  const deltaX = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
  const deltaY = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;

  return translateRectInsideImage(rectangle, deltaX, deltaY, naturalImage);
}

function applyKeyboardHandle(
  rectangle: NaturalImageRect,
  handle: HandleType,
  key: string,
  step: number,
  naturalImage: NaturalImageSize,
): NaturalImageRect | null {
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  const vertical = key === 'ArrowUp' || key === 'ArrowDown';
  const sign = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
  const delta = sign * step;

  if (horizontal && handle.includes('w')) {
    return resizeRectangle(rectangle, { left: delta, right: 0, top: 0, bottom: 0 }, naturalImage);
  }

  if (horizontal && handle.includes('e')) {
    return resizeRectangle(rectangle, { left: 0, right: delta, top: 0, bottom: 0 }, naturalImage);
  }

  if (vertical && handle.includes('n')) {
    return resizeRectangle(rectangle, { left: 0, right: 0, top: delta, bottom: 0 }, naturalImage);
  }

  if (vertical && handle.includes('s')) {
    return resizeRectangle(rectangle, { left: 0, right: 0, top: 0, bottom: delta }, naturalImage);
  }

  return null;
}

function resizeRectangle(
  rectangle: NaturalImageRect,
  delta: {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
  },
  naturalImage: NaturalImageSize,
): NaturalImageRect {
  const left = clamp(rectangle.x + delta.left, 0, rectangle.right - MIN_GRID_SELECTION_WIDTH);
  const right = clamp(
    rectangle.right + delta.right,
    left + MIN_GRID_SELECTION_WIDTH,
    naturalImage.width,
  );
  const top = clamp(rectangle.y + delta.top, 0, rectangle.bottom - MIN_GRID_SELECTION_HEIGHT);
  const bottom = clamp(
    rectangle.bottom + delta.bottom,
    top + MIN_GRID_SELECTION_HEIGHT,
    naturalImage.height,
  );

  return createNaturalRect(left, top, right, bottom);
}

function getEventHandle(event: Event): HandleType | null {
  const target = event.target;

  if (!(target instanceof SVGElement)) {
    return null;
  }

  const handle = target.dataset.correctionHandle;

  if (
    handle === 'move' ||
    handle === 'n' ||
    handle === 'e' ||
    handle === 's' ||
    handle === 'w' ||
    handle === 'nw' ||
    handle === 'ne' ||
    handle === 'se' ||
    handle === 'sw'
  ) {
    return handle;
  }

  return null;
}

function createResizeObserver(callback: () => void): ResizeObserver | null {
  if (!('ResizeObserver' in window)) {
    return null;
  }

  return new ResizeObserver(callback);
}

function formatCoordinate(value: number): string {
  return value.toFixed(2).replace(/\.00$/, '');
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100).toString()}%`;
}

function getGridCorrectionElements(root: HTMLElement): GridCorrectionElements {
  return {
    root,
    frame: getRequiredElement(root, '[data-preview-frame]', HTMLElement),
    stage: getRequiredElement(root, '[data-preview-stage]', HTMLElement),
    image: getRequiredElement(root, '[data-preview-image]', HTMLImageElement),
    overlay: getRequiredElement(root, '[data-grid-overlay]', SVGSVGElement),
    zoomControls: getRequiredElement(root, '[data-grid-zoom-controls]', HTMLElement),
    zoomFitButton: getRequiredElement(root, '[data-grid-zoom-fit]', HTMLButtonElement),
    zoomInButton: getRequiredElement(root, '[data-grid-zoom-in]', HTMLButtonElement),
    zoomOutButton: getRequiredElement(root, '[data-grid-zoom-out]', HTMLButtonElement),
    zoomActualButton: getRequiredElement(root, '[data-grid-zoom-actual]', HTMLButtonElement),
    zoomStatus: getRequiredElement(root, '[data-grid-zoom-status]', HTMLElement),
    controls: getRequiredElement(root, '[data-grid-correction-controls]', HTMLElement),
    applyButton: getRequiredElement(root, '[data-grid-correction-apply]', HTMLButtonElement),
    cancelButton: getRequiredElement(root, '[data-grid-correction-cancel]', HTMLButtonElement),
    startOverButton: getRequiredElement(
      root,
      '[data-grid-correction-start-over]',
      HTMLButtonElement,
    ),
    resetDetectedButton: getRequiredElement(
      root,
      '[data-grid-correction-reset-detected]',
      HTMLButtonElement,
    ),
    ratioButton: getRequiredElement(root, '[data-grid-correction-ratio]', HTMLButtonElement),
    editButton: getRequiredElement(root, '[data-grid-correction-edit]', HTMLButtonElement),
    readout: getRequiredElement(root, '[data-grid-correction-readout]', HTMLElement),
    coordinates: getRequiredElement(root, '[data-grid-correction-coordinates]', HTMLElement),
    cellSize: getRequiredElement(root, '[data-grid-correction-cell-size]', HTMLElement),
    validation: getRequiredElement(root, '[data-grid-correction-validation]', HTMLElement),
    live: getRequiredElement(root, '[data-grid-correction-live]', HTMLElement),
  };
}

function getRequiredElement<ElementType extends HTMLElement | SVGSVGElement>(
  root: ParentNode,
  selector: string,
  elementType: {
    new (): ElementType;
  },
): ElementType {
  const element = root.querySelector(selector);

  if (!(element instanceof elementType)) {
    throw new Error(`Missing expected grid correction element: ${selector}`);
  }

  return element;
}
