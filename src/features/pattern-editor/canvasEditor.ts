import { DESIGN_TOKENS } from '../../design/generated/tokens';
import type { MatrixCellChange } from '../../domain/history';
import type { BeadCell, BeadProject } from '../../domain/project';
import { PALETTE_COLORS } from '../../generated/palettes';
import type { FirstUseGesture } from './firstUseHint';
import { EditorGestureState, resolvePointerIntent, type TrackedPointer } from './gestureState';
import { MatrixDraft, type MatrixTransactionResult } from './matrixTransaction';
import {
  EditorPerformanceTracker,
  RenderInvalidation,
  type EditorPerformanceSnapshot,
  type RenderCell,
  type RenderPlan,
} from './renderState';
import {
  boundSelectionTranslation,
  clearSelectedCells,
  copySelectedCells,
  createSelectionCellSnapshot,
  getSelectionTransferPreviewCell,
  moveSelectedCells,
  normalizeSelection,
  selectionContains,
  type CellSelection,
  type SelectionCellSnapshot,
  type SelectionOperationResult,
} from './selection';
import { rasterizeGridSegment } from './stroke';
import {
  actualViewport,
  clampViewport,
  fitViewport,
  getVisibleCellRange,
  panViewport,
  pinchViewport,
  screenToCell,
  zoomViewportAt,
  type GridDimensions,
  type ViewportBounds,
  type ViewportConfig,
  type ViewportPoint,
  type ViewportTransform,
} from './viewport';

export type { CellSelection } from './selection';

export type EditorTool = 'paint' | 'erase' | 'eyedropper' | 'fill' | 'select';
export type SelectionTransferMode = 'copy' | 'move' | null;

export interface SelectionViewportRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface CanvasEditorCallbacks {
  readonly onCommit: (
    cells: readonly (readonly BeadCell[])[],
    message: string,
    changes: readonly MatrixCellChange[],
  ) => void;
  readonly onColorPick: (colorId: string) => void;
  readonly onStatus: (message: string) => void;
  readonly onSelectionChange?: (selection: CellSelection | null) => void;
  readonly onSelectionViewportRectChange?: (rect: SelectionViewportRect | null) => void;
  /** Mirrors the temporary placement override while the externally selected tool remains unchanged. */
  readonly onSelectionTransferModeChange?: (mode: SelectionTransferMode) => void;
  readonly onSuccessfulGesture?: (gesture: FirstUseGesture) => void;
}

export interface PatternCanvasController {
  readonly setProject: (project: BeadProject) => void;
  readonly setTool: (tool: EditorTool) => void;
  readonly setColor: (colorId: string) => void;
  readonly setReverseView: (reverse: boolean) => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly fit: () => void;
  readonly actualSize: () => void;
  readonly panBy: (deltaX: number, deltaY: number) => void;
  readonly jumpToCell: (row: number, column: number) => void;
  readonly clearSelection: () => void;
  readonly cancelSelection: () => void;
  /** Arms one placement gesture without changing the externally selected editor tool. */
  readonly beginSelectionTransfer: (mode: Exclude<SelectionTransferMode, null>) => void;
  readonly copySelection: (deltaRow: number, deltaColumn: number) => void;
  readonly moveSelection: (deltaRow: number, deltaColumn: number) => void;
  readonly getSelectionViewportRect: () => SelectionViewportRect | null;
  readonly getPerformanceSnapshot: () => EditorPerformanceSnapshot;
  readonly resetPerformanceMetrics: () => void;
  readonly destroy: () => void;
}

interface CellPoint {
  readonly row: number;
  readonly column: number;
}

interface ActiveToolGesture {
  readonly pointerId: number;
  readonly kind: 'paint' | 'single' | 'select-new' | 'select-move';
  readonly start: CellPoint;
  last: CellPoint;
  readonly draft: MatrixDraft | null;
  readonly selectionBefore: CellSelection | null;
  readonly selectionSnapshot: SelectionCellSnapshot | null;
  readonly transferMode: SelectionTransferMode;
  copySelection: boolean;
}

interface ActivePanGesture {
  readonly pointerId: number;
  lastPoint: ViewportPoint;
}

interface PinchBaseline {
  readonly transform: ViewportTransform;
  readonly viewportMode: ViewportMode;
  readonly centroid: ViewportPoint;
  readonly distance: number;
}

type ViewportMode = 'fit' | 'actual' | 'manual';

const COLOR_BY_ID = new Map(PALETTE_COLORS.map((color) => [color.id, color]));
const EMPTY_CELL: BeadCell = Object.freeze({ kind: 'empty' });
const VIEWPORT_CONFIG: ViewportConfig = Object.freeze({
  padding: 20,
  minScale: 0.25,
  maxScale: 64,
  actualCellSize: 16,
});
const MAX_DIRTY_CELLS_PER_FRAME = 512;
const CHROME_COLORS = Object.freeze({
  well: designToken('canvas.background'),
  surface: designToken('color.background.panel'),
  grid: designToken('grid.minorLine'),
  primary: designToken('color.action.primary'),
  text: designToken('color.text.primary'),
});

export function mountPatternCanvas(
  canvas: HTMLCanvasElement,
  initialProject: BeadProject,
  callbacks: CanvasEditorCallbacks,
): PatternCanvasController {
  const contextResult = canvas.getContext('2d', { alpha: false });
  if (!contextResult) {
    throw new Error('当前浏览器无法创建图案画布。');
  }
  const context: CanvasRenderingContext2D = contextResult;

  let project = initialProject;
  let cells = initialProject.cells;
  let tool: EditorTool = 'paint';
  let selectedColorId =
    project.palette.availableColorIds[0] ?? PALETTE_COLORS[0]?.id ?? 'default:A01';
  let reverseView = false;
  let selection: CellSelection | null = null;
  let selectionTransferMode: SelectionTransferMode = null;
  let lastSelectionViewportRectKey: string | null | undefined;
  let keyboardPoint: CellPoint = Object.freeze({ row: 0, column: 0 });
  let toolGesture: ActiveToolGesture | null = null;
  let panGesture: ActivePanGesture | null = null;
  let pinchBaseline: PinchBaseline | null = null;
  let viewportMode: ViewportMode = 'fit';
  let viewportTransform = fitViewport(getViewportBounds(), getGridDimensions(), VIEWPORT_CONFIG);
  let pendingRender = 0;
  let destroyed = false;
  let spacePressed = false;
  let spaceUsedForPan = false;

  const gestures = new EditorGestureState();
  const invalidation = new RenderInvalidation();
  const performanceTracker = new EditorPerformanceTracker();
  const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(handleCanvasResize) : null;

  resizeObserver?.observe(canvas);
  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', finishPointer);
  canvas.addEventListener('pointercancel', cancelPointer);
  canvas.addEventListener('lostpointercapture', handleLostPointerCapture);
  canvas.addEventListener('keydown', handleKeyDown);
  canvas.addEventListener('keyup', handleKeyUp);
  canvas.addEventListener('blur', handleWindowBlur);
  canvas.addEventListener('wheel', handleWheel, { passive: false });
  canvas.addEventListener('contextmenu', preventContextMenu);
  window.addEventListener('blur', handleWindowBlur);
  window.addEventListener('orientationchange', handleCanvasResize);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  scheduleFullRender();

  return Object.freeze({
    setProject(nextProject: BeadProject) {
      const sameCells = nextProject.cells === cells;
      const previousGrid = getGridDimensions();
      cancelAllGestures(false);
      const preservedSelection = selection;
      project = nextProject;
      cells = nextProject.cells;
      if (!project.palette.availableColorIds.includes(selectedColorId)) {
        const nextColorId = project.palette.availableColorIds[0];
        if (nextColorId) {
          selectedColorId = nextColorId;
          callbacks.onColorPick(nextColorId);
        }
      }
      keyboardPoint = Object.freeze({
        row: Math.min(keyboardPoint.row, nextProject.grid.rows - 1),
        column: Math.min(keyboardPoint.column, nextProject.grid.columns - 1),
      });
      if (!sameCells) {
        setSelection(clipSelectionToGrid(preservedSelection));
      }
      const gridChanged =
        previousGrid.rows !== nextProject.grid.rows ||
        previousGrid.columns !== nextProject.grid.columns;
      if (gridChanged || (!sameCells && viewportMode === 'fit')) {
        viewportMode = 'fit';
        viewportTransform = fitViewport(getViewportBounds(), getGridDimensions(), VIEWPORT_CONFIG);
      } else if (!sameCells) {
        viewportTransform = clampViewport(
          viewportTransform,
          getViewportBounds(),
          getGridDimensions(),
          VIEWPORT_CONFIG,
        );
      }
      if (!sameCells || gridChanged) {
        scheduleFullRender();
      }
    },
    setTool(nextTool: EditorTool) {
      if (tool !== nextTool) {
        cancelAllGestures(false);
      }
      tool = nextTool;
      callbacks.onStatus(toolLabel(nextTool));
    },
    setColor(colorId: string) {
      if (COLOR_BY_ID.has(colorId) && project.palette.availableColorIds.includes(colorId)) {
        selectedColorId = colorId;
        callbacks.onStatus(`已选择色号 ${formatColorCode(colorId)}。`);
      }
    },
    setReverseView(nextReverse: boolean) {
      cancelAllGestures(false);
      reverseView = nextReverse;
      scheduleFullRender();
      callbacks.onStatus(nextReverse ? '正在查看反面。' : '正在查看正面。');
    },
    zoomIn() {
      cancelAllGestures(false);
      zoomAtCenter(viewportTransform.scale * 1.2);
    },
    zoomOut() {
      cancelAllGestures(false);
      zoomAtCenter(viewportTransform.scale / 1.2);
    },
    fit() {
      cancelAllGestures(false);
      viewportMode = 'fit';
      viewportTransform = fitViewport(getViewportBounds(), getGridDimensions(), VIEWPORT_CONFIG);
      scheduleFullRender();
    },
    actualSize() {
      cancelAllGestures(false);
      viewportMode = 'actual';
      viewportTransform = actualViewport(getViewportBounds(), getGridDimensions(), VIEWPORT_CONFIG);
      scheduleFullRender();
    },
    panBy(deltaX: number, deltaY: number) {
      cancelAllGestures(false);
      viewportMode = 'manual';
      viewportTransform = panViewport(
        viewportTransform,
        deltaX,
        deltaY,
        getViewportBounds(),
        getGridDimensions(),
        VIEWPORT_CONFIG,
      );
      scheduleFullRender();
    },
    jumpToCell(row: number, column: number) {
      cancelAllGestures(false);
      const previousPoint = keyboardPoint;
      keyboardPoint = Object.freeze({
        row: Math.min(
          project.grid.rows - 1,
          Math.max(0, Math.round(Number.isFinite(row) ? row : 0)),
        ),
        column: Math.min(
          project.grid.columns - 1,
          Math.max(0, Math.round(Number.isFinite(column) ? column : 0)),
        ),
      });
      const viewport = getViewportBounds();
      const targetRect = cellRect(keyboardPoint.row, keyboardPoint.column);
      const nextTransform = panViewport(
        viewportTransform,
        viewport.width / 2 - (targetRect.x + targetRect.size / 2),
        viewport.height / 2 - (targetRect.y + targetRect.size / 2),
        viewport,
        getGridDimensions(),
        VIEWPORT_CONFIG,
      );
      if (
        nextTransform.offsetX !== viewportTransform.offsetX ||
        nextTransform.offsetY !== viewportTransform.offsetY
      ) {
        viewportMode = 'manual';
      }
      viewportTransform = nextTransform;
      invalidation.markCell(previousPoint.row, previousPoint.column);
      invalidation.markCell(keyboardPoint.row, keyboardPoint.column);
      scheduleFullRender();
      canvas.focus({ preventScroll: true });
      announceKeyboardPoint();
    },
    clearSelection,
    cancelSelection,
    beginSelectionTransfer,
    copySelection(deltaRow: number, deltaColumn: number) {
      translateSelection('copy', deltaRow, deltaColumn);
    },
    moveSelection(deltaRow: number, deltaColumn: number) {
      translateSelection('move', deltaRow, deltaColumn);
    },
    getSelectionViewportRect,
    getPerformanceSnapshot: () => performanceTracker.snapshot,
    resetPerformanceMetrics() {
      performanceTracker.reset();
    },
    destroy,
  });

  function handlePointerDown(event: PointerEvent): void {
    if (
      destroyed ||
      (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) ||
      (event.pointerType !== 'mouse' && event.button !== 0)
    ) {
      return;
    }

    const pointer = pointerFromEvent(event);
    const trackedPointers = gestures.pointerIds
      .map((pointerId) => gestures.getPointer(pointerId))
      .filter((trackedPointer): trackedPointer is TrackedPointer => trackedPointer !== null);
    const canJoinTouchPinch =
      pointer.pointerType === 'touch' &&
      trackedPointers.length === 1 &&
      trackedPointers[0]?.pointerType === 'touch';
    if (gestures.getPointer(pointer.id) || (trackedPointers.length > 0 && !canJoinTouchPinch)) {
      event.preventDefault();
      return;
    }
    const previousMode = gestures.snapshot.mode;
    const intent = resolvePointerIntent(event.pointerType, event.button, spacePressed);
    const snapshot = gestures.begin(pointer, intent);
    if (!capturePointer(event.pointerId)) {
      event.preventDefault();
      return;
    }
    canvas.focus({ preventScroll: true });
    event.preventDefault();

    if (snapshot.mode === 'pinch') {
      if (previousMode !== 'pinch') {
        rollbackToolGesture();
        setSelectionTransferMode(null);
        panGesture = null;
        const pinch = snapshot.pinch;
        if (pinch) {
          pinchBaseline = Object.freeze({
            transform: viewportTransform,
            viewportMode,
            centroid: pinch.centroid,
            distance: Math.max(1, pinch.distance),
          });
        }
      }
      viewportMode = 'manual';
      return;
    }

    const viewportPoint = viewportPointFromEvent(event);
    if (snapshot.mode === 'pan') {
      panGesture = {
        pointerId: event.pointerId,
        lastPoint: viewportPoint,
      };
      if (spacePressed) {
        spaceUsedForPan = true;
      }
      viewportMode = 'manual';
      return;
    }

    const point = pointFromViewport(viewportPoint);
    if (!point) {
      gestures.end(event.pointerId);
      releasePointer(event.pointerId);
      return;
    }
    keyboardPoint = point;
    startToolGesture(event, point);
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!gestures.getPointer(event.pointerId)) {
      return;
    }
    gestures.update(pointerFromEvent(event));
    const mode = gestures.snapshot.mode;
    if (mode === 'pinch') {
      updatePinch();
      event.preventDefault();
      return;
    }

    const viewportPoint = viewportPointFromEvent(event);
    if (mode === 'pan' && panGesture?.pointerId === event.pointerId) {
      viewportTransform = panViewport(
        viewportTransform,
        viewportPoint.x - panGesture.lastPoint.x,
        viewportPoint.y - panGesture.lastPoint.y,
        getViewportBounds(),
        getGridDimensions(),
        VIEWPORT_CONFIG,
      );
      panGesture.lastPoint = viewportPoint;
      scheduleFullRender();
      event.preventDefault();
      return;
    }

    if (mode !== 'tool' || toolGesture?.pointerId !== event.pointerId) {
      return;
    }
    const point = pointFromViewport(viewportPoint);
    if (!point) {
      return;
    }
    updateToolGesture(point, event.altKey);
    event.preventDefault();
  }

  function finishPointer(event: PointerEvent): void {
    const mode = gestures.snapshot.mode;
    if (!gestures.getPointer(event.pointerId)) {
      return;
    }

    if (mode === 'pinch') {
      const pointerIds = gestures.pointerIds;
      const completedPinch =
        pinchBaseline !== null &&
        !viewportTransformsEqual(viewportTransform, pinchBaseline.transform);
      gestures.end(event.pointerId);
      releasePointers(pointerIds);
      pinchBaseline = null;
      panGesture = null;
      if (completedPinch) {
        callbacks.onSuccessfulGesture?.('pinch');
      }
      event.preventDefault();
      return;
    }

    if (mode === 'pan') {
      gestures.end(event.pointerId);
      panGesture = null;
      releasePointer(event.pointerId);
      event.preventDefault();
      return;
    }

    const completedGesture = toolGesture;
    if (!completedGesture || completedGesture.pointerId !== event.pointerId) {
      gestures.end(event.pointerId);
      releasePointer(event.pointerId);
      return;
    }

    const finalPoint = pointFromViewport(viewportPointFromEvent(event));
    if (finalPoint) {
      updateToolGesture(finalPoint, event.altKey);
    }
    toolGesture = null;
    gestures.end(event.pointerId);
    releasePointer(event.pointerId);
    completeToolGesture(completedGesture, finalPoint);
    event.preventDefault();
  }

  function cancelPointer(event: PointerEvent): void {
    if (gestures.getPointer(event.pointerId)) {
      cancelAllGestures(true);
      event.preventDefault();
    }
  }

  function handleLostPointerCapture(event: PointerEvent): void {
    if (gestures.getPointer(event.pointerId)) {
      cancelAllGestures(true);
    }
  }

  function startToolGesture(event: PointerEvent, point: CellPoint): void {
    const selectionBefore = selection;
    if (selectionTransferMode) {
      if (!selectionBefore || !selectionContains(selectionBefore, point.row, point.column)) {
        callbacks.onStatus('请从选中区域内开始拖动。');
        return;
      }
      toolGesture = {
        pointerId: event.pointerId,
        kind: 'select-move',
        start: point,
        last: point,
        draft: null,
        selectionBefore,
        selectionSnapshot: createSelectionCellSnapshot(cells, selectionBefore),
        transferMode: selectionTransferMode,
        copySelection: selectionTransferMode === 'copy',
      };
      return;
    }

    if (tool === 'paint' || tool === 'erase') {
      const draft = new MatrixDraft(cells);
      toolGesture = {
        pointerId: event.pointerId,
        kind: 'paint',
        start: point,
        last: point,
        draft,
        selectionBefore,
        selectionSnapshot: null,
        transferMode: null,
        copySelection: false,
      };
      applyPaintPoint(draft, point);
      return;
    }

    if (tool === 'select') {
      const movingSelection = selection && selectionContains(selection, point.row, point.column);
      toolGesture = {
        pointerId: event.pointerId,
        kind: movingSelection ? 'select-move' : 'select-new',
        start: point,
        last: point,
        draft: null,
        selectionBefore,
        selectionSnapshot:
          movingSelection && selectionBefore
            ? createSelectionCellSnapshot(cells, selectionBefore)
            : null,
        transferMode: null,
        copySelection: event.altKey,
      };
      if (!movingSelection) {
        setSelection({
          startRow: point.row,
          startColumn: point.column,
          endRow: point.row,
          endColumn: point.column,
        });
      }
      return;
    }

    toolGesture = {
      pointerId: event.pointerId,
      kind: 'single',
      start: point,
      last: point,
      draft: null,
      selectionBefore,
      selectionSnapshot: null,
      transferMode: null,
      copySelection: false,
    };
  }

  function updateToolGesture(point: CellPoint, copySelectionModifier: boolean): void {
    const active = toolGesture;
    if (!active) {
      return;
    }
    keyboardPoint = point;
    if (active.kind === 'paint' && active.draft) {
      for (const interpolated of rasterizeGridSegment(active.last, point)) {
        applyPaintPoint(active.draft, interpolated);
      }
    } else if (active.kind === 'select-new') {
      setSelection({
        startRow: active.start.row,
        startColumn: active.start.column,
        endRow: point.row,
        endColumn: point.column,
      });
    } else if (active.kind === 'select-move') {
      active.copySelection =
        active.transferMode === 'copy' || (active.transferMode === null && copySelectionModifier);
      const source = active.selectionBefore;
      if (source) {
        const bounded = boundSelectionTranslation(
          cells,
          source,
          point.row - active.start.row,
          point.column - active.start.column,
        );
        setSelection(translateSelectionRect(source, bounded.deltaRow, bounded.deltaColumn));
      }
    }
    active.last = point;
  }

  function completeToolGesture(active: ActiveToolGesture, finalPoint: CellPoint | null): void {
    if (active.kind === 'paint' && active.draft) {
      const transactionStartedAt = now();
      const result = active.draft.finish();
      commitResult(
        result,
        tool === 'erase' ? '已擦除拼豆。' : '已更新图案。',
        transactionStartedAt,
      );
      if (result.changes.length > 0) {
        callbacks.onSuccessfulGesture?.('draw');
      }
      return;
    }
    if (active.kind === 'single' && finalPoint) {
      applySinglePointTool(finalPoint);
      return;
    }
    if (active.kind === 'select-move' && active.selectionBefore) {
      const transactionStartedAt = now();
      const deltaRow = active.last.row - active.start.row;
      const deltaColumn = active.last.column - active.start.column;
      const bounded = boundSelectionTranslation(
        cells,
        active.selectionBefore,
        deltaRow,
        deltaColumn,
      );
      const result = active.copySelection
        ? copySelectedCells(cells, active.selectionBefore, bounded.deltaRow, bounded.deltaColumn)
        : moveSelectedCells(cells, active.selectionBefore, bounded.deltaRow, bounded.deltaColumn);
      setSelectionTransferMode(null);
      applySelectionResult(
        result,
        bounded.wasBounded
          ? '已放到画布边缘，选中内容完整保留。'
          : active.copySelection
            ? '已复制选中区域。'
            : '已移动选中区域。',
        transactionStartedAt,
      );
    }
  }

  function applyPaintPoint(draft: MatrixDraft, point: CellPoint): void {
    const nextCell =
      tool === 'erase'
        ? EMPTY_CELL
        : Object.freeze({ kind: 'bead' as const, colorId: selectedColorId });
    if (draft.setCell(point.row, point.column, nextCell)) {
      invalidation.markCell(point.row, point.column);
      scheduleRender();
    }
  }

  function applySinglePointTool(point: CellPoint): void {
    const current = cells[point.row]?.[point.column];
    if (!current) {
      return;
    }
    if (tool === 'eyedropper') {
      if (current.kind === 'bead' && project.palette.availableColorIds.includes(current.colorId)) {
        selectedColorId = current.colorId;
        callbacks.onColorPick(current.colorId);
        callbacks.onStatus(`已吸取色号 ${formatColorCode(current.colorId)}。`);
      } else {
        callbacks.onStatus('这个格子是空的，或颜色不在当前项目可用色中。');
      }
      return;
    }
    if (tool === 'fill') {
      const transactionStartedAt = now();
      const result = fillAt(point);
      commitResult(result, '已填充相邻区域。', transactionStartedAt);
    }
  }

  function fillAt(start: CellPoint): MatrixTransactionResult {
    const target = cells[start.row]?.[start.column];
    const nextCell = Object.freeze({ kind: 'bead' as const, colorId: selectedColorId });
    if (!target || cellsEqual(target, nextCell)) {
      return Object.freeze({ cells, changes: Object.freeze([]) });
    }

    const draft = new MatrixDraft(cells);
    const queue: CellPoint[] = [start];
    const visited = new Set<string>();
    let queueIndex = 0;
    while (queueIndex < queue.length) {
      const point = queue[queueIndex];
      queueIndex += 1;
      if (!point) {
        continue;
      }
      const key = `${String(point.row)}:${String(point.column)}`;
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      const current = cells[point.row]?.[point.column];
      if (!current || !cellsEqual(current, target)) {
        continue;
      }
      draft.setCell(point.row, point.column, nextCell);
      queue.push(
        { row: point.row - 1, column: point.column },
        { row: point.row + 1, column: point.column },
        { row: point.row, column: point.column - 1 },
        { row: point.row, column: point.column + 1 },
      );
    }
    return draft.finish();
  }

  function clearSelection(): void {
    cancelAllGestures(false);
    if (!selection) {
      callbacks.onStatus('请先选择要清空的区域。');
      return;
    }
    const transactionStartedAt = now();
    applySelectionResult(
      clearSelectedCells(cells, selection),
      '已清空选中区域。',
      transactionStartedAt,
    );
  }

  function cancelSelection(): void {
    cancelAllGestures(false);
    if (!selection) {
      return;
    }
    setSelection(null);
    callbacks.onStatus('已取消选区。');
  }

  function beginSelectionTransfer(mode: Exclude<SelectionTransferMode, null>): void {
    cancelAllGestures(false);
    if (!selection) {
      callbacks.onStatus('请先选择要处理的区域。');
      return;
    }
    setSelectionTransferMode(mode);
    callbacks.onStatus(
      mode === 'copy' ? '拖动选中区域，松手后放置副本。' : '拖动选中区域，松手后完成移动。',
    );
  }

  function translateSelection(
    operation: 'copy' | 'move',
    deltaRow: number,
    deltaColumn: number,
  ): void {
    cancelAllGestures(false);
    if (!selection) {
      callbacks.onStatus('请先选择要处理的区域。');
      return;
    }
    const transactionStartedAt = now();
    const bounded = boundSelectionTranslation(cells, selection, deltaRow, deltaColumn);
    const result =
      operation === 'copy'
        ? copySelectedCells(cells, selection, bounded.deltaRow, bounded.deltaColumn)
        : moveSelectedCells(cells, selection, bounded.deltaRow, bounded.deltaColumn);
    applySelectionResult(
      result,
      bounded.wasBounded
        ? '已放到画布边缘，选中内容完整保留。'
        : operation === 'copy'
          ? '已复制选中区域。'
          : '已移动选中区域。',
      transactionStartedAt,
    );
  }

  function applySelectionResult(
    result: SelectionOperationResult,
    message: string,
    transactionStartedAt: number,
  ): void {
    setSelection(result.selection);
    commitResult(result, message, transactionStartedAt);
  }

  function commitResult(
    result: MatrixTransactionResult,
    message: string,
    transactionStartedAt: number,
  ): void {
    if (result.changes.length === 0) {
      scheduleFullRender();
      return;
    }
    cells = result.cells;
    if (result.changes.length > MAX_DIRTY_CELLS_PER_FRAME) {
      scheduleFullRender();
    } else {
      invalidation.markCells(result.changes);
      scheduleRender();
    }
    callbacks.onCommit(result.cells, message, result.changes);
    performanceTracker.recordTransaction(now() - transactionStartedAt);
  }

  function rollbackToolGesture(): void {
    const active = toolGesture;
    if (!active) {
      return;
    }
    if (active.draft) {
      invalidation.markCells(active.draft.finish().changes);
    }
    toolGesture = null;
    setSelection(active.selectionBefore);
    scheduleRender();
  }

  function cancelAllGestures(announce: boolean): void {
    const pointerIds = gestures.pointerIds;
    const cancelledPinchTransform =
      gestures.snapshot.mode === 'pinch' ? pinchBaseline?.transform : null;
    const cancelledPinchMode =
      gestures.snapshot.mode === 'pinch' ? pinchBaseline?.viewportMode : null;
    const hadGesture =
      gestures.snapshot.mode !== 'idle' || toolGesture !== null || selectionTransferMode !== null;
    rollbackToolGesture();
    setSelectionTransferMode(null);
    gestures.cancelAll();
    releasePointers(pointerIds);
    panGesture = null;
    pinchBaseline = null;
    if (cancelledPinchTransform) {
      viewportTransform = cancelledPinchTransform;
      if (cancelledPinchMode) {
        viewportMode = cancelledPinchMode;
      }
      scheduleFullRender();
    }
    spacePressed = false;
    spaceUsedForPan = false;
    if (hadGesture && announce) {
      callbacks.onStatus('本次编辑已取消。');
    }
  }

  function updatePinch(): void {
    const current = gestures.snapshot.pinch;
    const baseline = pinchBaseline;
    if (!current || !baseline) {
      return;
    }
    viewportTransform = pinchViewport(
      baseline.transform,
      baseline.transform.scale * (current.distance / baseline.distance),
      baseline.centroid,
      current.centroid,
      getViewportBounds(),
      getGridDimensions(),
      VIEWPORT_CONFIG,
    );
    scheduleFullRender();
  }

  function handleWheel(event: WheelEvent): void {
    if (gestures.snapshot.mode !== 'idle' && selectionTransferMode === null) {
      return;
    }
    if (selectionTransferMode !== null) {
      cancelAllGestures(false);
    }
    event.preventDefault();
    viewportMode = 'manual';
    viewportTransform = zoomViewportAt(
      viewportTransform,
      viewportTransform.scale * Math.exp(-event.deltaY * 0.0015),
      viewportPointFromEvent(event),
      getViewportBounds(),
      getGridDimensions(),
      VIEWPORT_CONFIG,
    );
    scheduleFullRender();
  }

  function zoomAtCenter(scale: number): void {
    const viewport = getViewportBounds();
    viewportMode = 'manual';
    viewportTransform = zoomViewportAt(
      viewportTransform,
      scale,
      { x: viewport.width / 2, y: viewport.height / 2 },
      viewport,
      getGridDimensions(),
      VIEWPORT_CONFIG,
    );
    scheduleFullRender();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (gestures.snapshot.mode !== 'idle' || toolGesture || selectionTransferMode !== null) {
        event.preventDefault();
        cancelAllGestures(true);
      }
      return;
    }
    if (event.key === ' ') {
      spacePressed = true;
      if (!event.repeat) {
        spaceUsedForPan = gestures.snapshot.mode !== 'idle' || toolGesture !== null;
      }
      event.preventDefault();
      return;
    }
    if (gestures.snapshot.mode !== 'idle' || toolGesture) {
      return;
    }

    const previousPoint = keyboardPoint;
    if (event.key === 'ArrowUp') {
      keyboardPoint = { ...keyboardPoint, row: Math.max(0, keyboardPoint.row - 1) };
    } else if (event.key === 'ArrowDown') {
      keyboardPoint = {
        ...keyboardPoint,
        row: Math.min(project.grid.rows - 1, keyboardPoint.row + 1),
      };
    } else if (event.key === 'ArrowLeft') {
      keyboardPoint = {
        ...keyboardPoint,
        column: reverseView
          ? Math.min(project.grid.columns - 1, keyboardPoint.column + 1)
          : Math.max(0, keyboardPoint.column - 1),
      };
    } else if (event.key === 'ArrowRight') {
      keyboardPoint = {
        ...keyboardPoint,
        column: reverseView
          ? Math.max(0, keyboardPoint.column - 1)
          : Math.min(project.grid.columns - 1, keyboardPoint.column + 1),
      };
    } else if (event.key === 'Enter') {
      event.preventDefault();
      applyKeyboardTool();
      return;
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && selection) {
      event.preventDefault();
      clearSelection();
      return;
    } else {
      return;
    }

    event.preventDefault();
    invalidation.markCell(previousPoint.row, previousPoint.column);
    invalidation.markCell(keyboardPoint.row, keyboardPoint.column);
    scheduleRender();
    announceKeyboardPoint();
  }

  function handleKeyUp(event: KeyboardEvent): void {
    if (event.key !== ' ') {
      return;
    }
    event.preventDefault();
    const shouldApplyTool = spacePressed && !spaceUsedForPan && gestures.snapshot.mode === 'idle';
    spacePressed = false;
    spaceUsedForPan = false;
    if (shouldApplyTool) {
      applyKeyboardTool();
    }
  }

  function applyKeyboardTool(): void {
    if (tool === 'select') {
      setSelection({
        startRow: keyboardPoint.row,
        startColumn: keyboardPoint.column,
        endRow: keyboardPoint.row,
        endColumn: keyboardPoint.column,
      });
      return;
    }
    if (tool === 'eyedropper' || tool === 'fill') {
      applySinglePointTool(keyboardPoint);
      return;
    }
    const transactionStartedAt = now();
    const draft = new MatrixDraft(cells);
    const nextCell =
      tool === 'erase'
        ? EMPTY_CELL
        : Object.freeze({ kind: 'bead' as const, colorId: selectedColorId });
    draft.setCell(keyboardPoint.row, keyboardPoint.column, nextCell);
    commitResult(draft.finish(), '已用键盘更新图案。', transactionStartedAt);
  }

  function announceKeyboardPoint(): void {
    callbacks.onStatus(
      `当前格子：第 ${String(keyboardPoint.row + 1)} 行，第 ${String(
        keyboardPoint.column + 1,
      )} 列。`,
    );
  }

  function setSelection(nextSelection: CellSelection | null): void {
    selection = nextSelection ? normalizeSelection(nextSelection) : null;
    callbacks.onSelectionChange?.(selection);
    emitSelectionViewportRect();
    scheduleFullRender();
  }

  function setSelectionTransferMode(nextMode: SelectionTransferMode): void {
    if (selectionTransferMode === nextMode) {
      return;
    }
    selectionTransferMode = nextMode;
    callbacks.onSelectionTransferModeChange?.(nextMode);
  }

  function getSelectionViewportRect(): SelectionViewportRect | null {
    if (!selection) {
      return null;
    }
    const normalized = normalizeSelection(selection);
    const leftColumn = reverseView
      ? project.grid.columns - 1 - normalized.endColumn
      : normalized.startColumn;
    const rightColumn = reverseView
      ? project.grid.columns - 1 - normalized.startColumn
      : normalized.endColumn;
    return Object.freeze({
      left: viewportTransform.offsetX + leftColumn * viewportTransform.scale,
      top: viewportTransform.offsetY + normalized.startRow * viewportTransform.scale,
      width: (rightColumn - leftColumn + 1) * viewportTransform.scale,
      height: (normalized.endRow - normalized.startRow + 1) * viewportTransform.scale,
    });
  }

  function emitSelectionViewportRect(): void {
    const rect = getSelectionViewportRect();
    const key = rect
      ? `${String(rect.left)}:${String(rect.top)}:${String(rect.width)}:${String(rect.height)}`
      : null;
    if (key === lastSelectionViewportRectKey) {
      return;
    }
    lastSelectionViewportRectKey = key;
    callbacks.onSelectionViewportRectChange?.(rect);
  }

  function clipSelectionToGrid(source: CellSelection | null): CellSelection | null {
    if (!source || project.grid.rows <= 0 || project.grid.columns <= 0) {
      return null;
    }
    const normalized = normalizeSelection(source);
    const startRow = Math.max(0, normalized.startRow);
    const startColumn = Math.max(0, normalized.startColumn);
    const endRow = Math.min(project.grid.rows - 1, normalized.endRow);
    const endColumn = Math.min(project.grid.columns - 1, normalized.endColumn);
    return startRow <= endRow && startColumn <= endColumn
      ? Object.freeze({ startRow, startColumn, endRow, endColumn })
      : null;
  }

  function translateSelectionRect(
    source: CellSelection,
    deltaRow: number,
    deltaColumn: number,
  ): CellSelection | null {
    const normalized = normalizeSelection(source);
    const startRow = Math.max(0, normalized.startRow + deltaRow);
    const startColumn = Math.max(0, normalized.startColumn + deltaColumn);
    const endRow = Math.min(project.grid.rows - 1, normalized.endRow + deltaRow);
    const endColumn = Math.min(project.grid.columns - 1, normalized.endColumn + deltaColumn);
    return startRow <= endRow && startColumn <= endColumn
      ? Object.freeze({ startRow, startColumn, endRow, endColumn })
      : null;
  }

  function handleCanvasResize(): void {
    if (destroyed) {
      return;
    }
    cancelAllGestures(false);
    viewportTransform =
      viewportMode === 'fit'
        ? fitViewport(getViewportBounds(), getGridDimensions(), VIEWPORT_CONFIG)
        : viewportMode === 'actual'
          ? actualViewport(getViewportBounds(), getGridDimensions(), VIEWPORT_CONFIG)
          : clampViewport(
              viewportTransform,
              getViewportBounds(),
              getGridDimensions(),
              VIEWPORT_CONFIG,
            );
    scheduleFullRender();
  }

  function handleWindowBlur(): void {
    cancelAllGestures(true);
  }

  function handleVisibilityChange(): void {
    if (document.hidden) {
      cancelAllGestures(true);
    }
  }

  function pointFromViewport(point: ViewportPoint): CellPoint | null {
    return screenToCell(point, viewportTransform, getGridDimensions(), reverseView);
  }

  function viewportPointFromEvent(event: MouseEvent | PointerEvent | WheelEvent): ViewportPoint {
    const bounds = canvas.getBoundingClientRect();
    return Object.freeze({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
  }

  function pointerFromEvent(event: PointerEvent): TrackedPointer {
    const point = viewportPointFromEvent(event);
    return Object.freeze({
      id: event.pointerId,
      x: point.x,
      y: point.y,
      pointerType: event.pointerType,
      button: event.button,
    });
  }

  function getGridDimensions(): GridDimensions {
    return Object.freeze({ rows: project.grid.rows, columns: project.grid.columns });
  }

  function getViewportBounds(): ViewportBounds {
    return Object.freeze({
      width: Math.max(1, canvas.clientWidth),
      height: Math.max(1, canvas.clientHeight),
    });
  }

  function scheduleFullRender(): void {
    emitSelectionViewportRect();
    invalidation.markFull();
    scheduleRender();
  }

  function scheduleRender(): void {
    if (pendingRender || destroyed) {
      return;
    }
    pendingRender = window.requestAnimationFrame(render);
  }

  function render(): void {
    pendingRender = 0;
    const startedAt = now();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = getViewportBounds();
    const width = Math.max(1, Math.floor(viewport.width * dpr));
    const height = Math.max(1, Math.floor(viewport.height * dpr));
    const resized = canvas.width !== width || canvas.height !== height;
    if (resized) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const plan = invalidation.consume();
    const fullRender = resized || plan.full || plan.overlay;
    const visitedCells = fullRender ? drawFull(viewport) : drawDirty(plan);
    performanceTracker.recordFrame(fullRender ? 'full' : 'dirty', now() - startedAt, visitedCells);
  }

  function drawFull(viewport: ViewportBounds): number {
    context.fillStyle = CHROME_COLORS.well;
    context.fillRect(0, 0, viewport.width, viewport.height);
    context.fillStyle = CHROME_COLORS.surface;
    context.fillRect(
      viewportTransform.offsetX,
      viewportTransform.offsetY,
      viewportTransform.scale * project.grid.columns,
      viewportTransform.scale * project.grid.rows,
    );

    const range = getVisibleCellRange(viewportTransform, viewport, getGridDimensions());
    let visitedCells = 0;
    if (range) {
      for (let row = range.startRow; row <= range.endRow; row += 1) {
        for (
          let visibleColumn = range.startColumn;
          visibleColumn <= range.endColumn;
          visibleColumn += 1
        ) {
          drawCell(row, logicalColumn(visibleColumn));
          visitedCells += 1;
        }
      }
    }
    drawOverlays();
    return visitedCells;
  }

  function drawDirty(plan: RenderPlan): number {
    let visitedCells = 0;
    for (const cell of plan.cells) {
      if (!isCellVisible(cell)) {
        continue;
      }
      const rect = cellRect(cell.row, cell.column);
      context.save();
      context.beginPath();
      context.rect(rect.x, rect.y, rect.size, rect.size);
      context.clip();
      drawCell(cell.row, cell.column);
      drawOverlays();
      context.restore();
      visitedCells += 1;
    }
    return visitedCells;
  }

  function drawCell(row: number, column: number): void {
    const active = toolGesture;
    const bounded =
      active?.kind === 'select-move' && active.selectionBefore
        ? boundSelectionTranslation(
            cells,
            active.selectionBefore,
            active.last.row - active.start.row,
            active.last.column - active.start.column,
          )
        : null;
    const cell =
      active?.draft?.getCell(row, column) ??
      (active?.kind === 'select-move' && active.selectionSnapshot
        ? getSelectionTransferPreviewCell(
            cells,
            active.selectionSnapshot,
            active.copySelection ? 'copy' : 'move',
            bounded?.deltaRow ?? 0,
            bounded?.deltaColumn ?? 0,
            row,
            column,
          )
        : cells[row]?.[column]);
    if (!cell) {
      return;
    }
    const rect = cellRect(row, column);
    context.fillStyle = CHROME_COLORS.surface;
    context.fillRect(rect.x, rect.y, rect.size, rect.size);
    if (rect.size >= 7) {
      context.strokeStyle = CHROME_COLORS.grid;
      context.lineWidth = 0.6;
      context.strokeRect(rect.x, rect.y, rect.size, rect.size);
    }
    if (cell.kind !== 'bead') {
      return;
    }
    const color = COLOR_BY_ID.get(cell.colorId);
    if (!color) {
      return;
    }
    const radius = Math.max(0.2, rect.size * 0.39);
    const centerX = rect.x + rect.size / 2;
    const centerY = rect.y + rect.size / 2;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fillStyle = color.displayHex;
    context.fill();
    if (rect.size >= 9) {
      context.beginPath();
      context.arc(centerX, centerY, Math.max(1, radius * 0.25), 0, Math.PI * 2);
      context.fillStyle = CHROME_COLORS.surface;
      context.fill();
    }
  }

  function drawOverlays(): void {
    if (selection) {
      const normalized = normalizeSelection(selection);
      const leftColumn = reverseView
        ? project.grid.columns - 1 - normalized.endColumn
        : normalized.startColumn;
      const rightColumn = reverseView
        ? project.grid.columns - 1 - normalized.startColumn
        : normalized.endColumn;
      const x = viewportTransform.offsetX + leftColumn * viewportTransform.scale;
      const y = viewportTransform.offsetY + normalized.startRow * viewportTransform.scale;
      const width = (rightColumn - leftColumn + 1) * viewportTransform.scale;
      const height = (normalized.endRow - normalized.startRow + 1) * viewportTransform.scale;
      context.save();
      context.globalAlpha = 0.14;
      context.fillStyle = CHROME_COLORS.primary;
      context.fillRect(x, y, width, height);
      context.restore();
      context.strokeStyle = CHROME_COLORS.primary;
      context.lineWidth = 2;
      context.strokeRect(x, y, width, height);
    }

    const rect = cellRect(keyboardPoint.row, keyboardPoint.column);
    context.strokeStyle = CHROME_COLORS.text;
    context.lineWidth = 1;
    context.strokeRect(
      rect.x + 1,
      rect.y + 1,
      Math.max(0, rect.size - 2),
      Math.max(0, rect.size - 2),
    );
  }

  function isCellVisible(cell: RenderCell): boolean {
    const rect = cellRect(cell.row, cell.column);
    const viewport = getViewportBounds();
    return (
      rect.x + rect.size >= 0 &&
      rect.y + rect.size >= 0 &&
      rect.x <= viewport.width &&
      rect.y <= viewport.height
    );
  }

  function cellRect(
    row: number,
    column: number,
  ): { readonly x: number; readonly y: number; readonly size: number } {
    const visibleColumn = reverseView ? project.grid.columns - 1 - column : column;
    return Object.freeze({
      x: viewportTransform.offsetX + visibleColumn * viewportTransform.scale,
      y: viewportTransform.offsetY + row * viewportTransform.scale,
      size: viewportTransform.scale,
    });
  }

  function logicalColumn(visibleColumn: number): number {
    return reverseView ? project.grid.columns - 1 - visibleColumn : visibleColumn;
  }

  function capturePointer(pointerId: number): boolean {
    try {
      canvas.setPointerCapture(pointerId);
      return true;
    } catch {
      cancelAllGestures(false);
      return false;
    }
  }

  function releasePointer(pointerId: number): void {
    try {
      if (canvas.hasPointerCapture(pointerId)) {
        canvas.releasePointerCapture(pointerId);
      }
    } catch {
      // The browser may already have released capture during teardown.
    }
  }

  function releasePointers(pointerIds: readonly number[]): void {
    for (const pointerId of pointerIds) {
      releasePointer(pointerId);
    }
  }

  function destroy(): void {
    if (destroyed) {
      return;
    }
    cancelAllGestures(false);
    destroyed = true;
    resizeObserver?.disconnect();
    canvas.removeEventListener('pointerdown', handlePointerDown);
    canvas.removeEventListener('pointermove', handlePointerMove);
    canvas.removeEventListener('pointerup', finishPointer);
    canvas.removeEventListener('pointercancel', cancelPointer);
    canvas.removeEventListener('lostpointercapture', handleLostPointerCapture);
    canvas.removeEventListener('keydown', handleKeyDown);
    canvas.removeEventListener('keyup', handleKeyUp);
    canvas.removeEventListener('blur', handleWindowBlur);
    canvas.removeEventListener('wheel', handleWheel);
    canvas.removeEventListener('contextmenu', preventContextMenu);
    window.removeEventListener('blur', handleWindowBlur);
    window.removeEventListener('orientationchange', handleCanvasResize);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (pendingRender) {
      window.cancelAnimationFrame(pendingRender);
      pendingRender = 0;
    }
  }
}

function cellsEqual(left: BeadCell, right: BeadCell): boolean {
  return (
    left.kind === right.kind &&
    (left.kind === 'empty' || (right.kind === 'bead' && left.colorId === right.colorId))
  );
}

function viewportTransformsEqual(left: ViewportTransform, right: ViewportTransform): boolean {
  const epsilon = 0.000001;
  return (
    Math.abs(left.scale - right.scale) <= epsilon &&
    Math.abs(left.offsetX - right.offsetX) <= epsilon &&
    Math.abs(left.offsetY - right.offsetY) <= epsilon
  );
}

function toolLabel(tool: EditorTool): string {
  const labels: Record<EditorTool, string> = {
    paint: '画笔已启用。',
    erase: '橡皮已启用。',
    eyedropper: '吸管已启用，点选一个拼豆颜色。',
    fill: '填充已启用，点选一个相邻区域。',
    select: '选择已启用，拖动选择一块区域。',
  };
  return labels[tool];
}

function formatColorCode(colorId: string): string {
  const color = COLOR_BY_ID.get(colorId);
  return color ? `${color.paletteId.toUpperCase()} ${color.code}` : colorId;
}

function preventContextMenu(event: Event): void {
  event.preventDefault();
}

function now(): number {
  return performance.now();
}

function designToken(key: string): string {
  const value = DESIGN_TOKENS[key];
  if (!value) {
    throw new Error(`缺少画布设计令牌：${key}`);
  }
  return value;
}
