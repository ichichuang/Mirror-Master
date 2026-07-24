import { PALETTE_COLORS } from '../../generated/palettes';
import {
  cloneCells,
  fillCells,
  replaceCell,
  type BeadCell,
  type BeadProject,
} from '../../domain/project';

export type EditorTool = 'paint' | 'erase' | 'eyedropper' | 'fill' | 'select';

export interface CanvasEditorCallbacks {
  readonly onCommit: (cells: readonly (readonly BeadCell[])[], message: string) => void;
  readonly onColorPick: (colorId: string) => void;
  readonly onStatus: (message: string) => void;
  readonly onSelectionChange?: (selection: CellSelection | null) => void;
}

export interface CellSelection {
  readonly startRow: number;
  readonly startColumn: number;
  readonly endRow: number;
  readonly endColumn: number;
}

export interface PatternCanvasController {
  readonly setProject: (project: BeadProject) => void;
  readonly setTool: (tool: EditorTool) => void;
  readonly setColor: (colorId: string) => void;
  readonly setReverseView: (reverse: boolean) => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly fit: () => void;
  readonly clearSelection: () => void;
  readonly destroy: () => void;
}

interface CellPoint {
  readonly row: number;
  readonly column: number;
}

interface ActiveGesture {
  readonly pointerId: number;
  readonly start: CellPoint;
  last: CellPoint;
  changed: boolean;
}

const COLOR_BY_ID = new Map(PALETTE_COLORS.map((color) => [color.id, color]));
const EMPTY_CELL: BeadCell = Object.freeze({ kind: 'empty' });

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
  let workingCells = cloneCells(project.cells);
  let tool: EditorTool = 'paint';
  let selectedColorId =
    project.palette.availableColorIds[0] ?? PALETTE_COLORS[0]?.id ?? 'default:A01';
  let reverseView = false;
  let zoom = 1;
  let gesture: ActiveGesture | null = null;
  let selection: CellSelection | null = null;
  let pendingRender = 0;
  let keyboardPoint: CellPoint = { row: 0, column: 0 };

  const resizeObserver =
    'ResizeObserver' in window
      ? new ResizeObserver(() => {
          scheduleRender();
        })
      : null;
  resizeObserver?.observe(canvas);

  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', finishPointer);
  canvas.addEventListener('pointercancel', cancelPointer);
  canvas.addEventListener('keydown', handleKeyDown);
  canvas.addEventListener('contextmenu', preventContextMenu);

  scheduleRender();

  const controller: PatternCanvasController = Object.freeze({
    setProject(nextProject: BeadProject) {
      project = nextProject;
      workingCells = cloneCells(nextProject.cells);
      selection = null;
      gesture = null;
      scheduleRender();
    },
    setTool(nextTool: EditorTool) {
      tool = nextTool;
      callbacks.onStatus(toolLabel(nextTool));
    },
    setColor(colorId: string) {
      if (COLOR_BY_ID.has(colorId)) {
        selectedColorId = colorId;
        callbacks.onStatus(`已选择色号 ${formatColorCode(colorId)}。`);
      }
    },
    setReverseView(nextReverse: boolean) {
      reverseView = nextReverse;
      scheduleRender();
      callbacks.onStatus(nextReverse ? '正在查看反面。' : '正在查看正面。');
    },
    zoomIn() {
      zoom = Math.min(4, zoom * 1.2);
      scheduleRender();
    },
    zoomOut() {
      zoom = Math.max(0.5, zoom / 1.2);
      scheduleRender();
    },
    fit() {
      zoom = 1;
      scheduleRender();
    },
    clearSelection() {
      if (!selection) {
        callbacks.onStatus('请先选择要清空的区域。');
        return;
      }
      const normalized = normalizeSelection(selection);
      let nextCells = workingCells;
      for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
        for (let column = normalized.startColumn; column <= normalized.endColumn; column += 1) {
          nextCells = replaceCell(nextCells, row, column, EMPTY_CELL);
        }
      }
      selection = null;
      commit(nextCells, '已清空选中区域。');
    },
    destroy() {
      resizeObserver?.disconnect();
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', finishPointer);
      canvas.removeEventListener('pointercancel', cancelPointer);
      canvas.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('contextmenu', preventContextMenu);
      if (pendingRender) {
        window.cancelAnimationFrame(pendingRender);
      }
    },
  });

  return controller;

  function handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.pointerType === 'mouse') {
      return;
    }
    const point = pointFromPointer(event);
    if (!point) {
      return;
    }
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    gesture = {
      pointerId: event.pointerId,
      start: point,
      last: point,
      changed: false,
    };
    keyboardPoint = point;
    if (tool === 'select') {
      selection = {
        startRow: point.row,
        startColumn: point.column,
        endRow: point.row,
        endColumn: point.column,
      };
      callbacks.onSelectionChange?.(selection);
      scheduleRender();
      return;
    }
    applyTool(point);
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    const point = pointFromPointer(event);
    if (!point || (point.row === gesture.last.row && point.column === gesture.last.column)) {
      return;
    }
    event.preventDefault();
    gesture.last = point;
    keyboardPoint = point;
    if (tool === 'select') {
      selection = {
        startRow: gesture.start.row,
        startColumn: gesture.start.column,
        endRow: point.row,
        endColumn: point.column,
      };
      callbacks.onSelectionChange?.(selection);
      scheduleRender();
      return;
    }
    if (tool === 'paint' || tool === 'erase') {
      applyTool(point);
    }
  }

  function finishPointer(event: PointerEvent): void {
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    const completedGesture = gesture;
    gesture = null;
    if (completedGesture.changed) {
      callbacks.onCommit(
        cloneCells(workingCells),
        tool === 'erase' ? '已擦除拼豆。' : '已更新图案。',
      );
    }
  }

  function cancelPointer(event: PointerEvent): void {
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    workingCells = cloneCells(project.cells);
    gesture = null;
    scheduleRender();
    callbacks.onStatus('本次编辑已取消。');
  }

  function applyTool(point: CellPoint): void {
    const current = workingCells[point.row]?.[point.column];
    if (!current) {
      return;
    }
    if (tool === 'eyedropper') {
      if (current.kind === 'bead') {
        selectedColorId = current.colorId;
        callbacks.onColorPick(current.colorId);
        callbacks.onStatus(`已吸取色号 ${formatColorCode(current.colorId)}。`);
      } else {
        callbacks.onStatus('这个格子是空的，请选择有拼豆的格子。');
      }
      return;
    }
    const nextCell: BeadCell =
      tool === 'erase' ? EMPTY_CELL : Object.freeze({ kind: 'bead', colorId: selectedColorId });
    if (tool === 'fill') {
      const nextCells = fillCells(workingCells, point.row, point.column, nextCell);
      if (nextCells !== workingCells) {
        workingCells = nextCells;
        commit(nextCells, '已填充相邻区域。');
      }
      gesture = null;
      return;
    }
    if (tool !== 'paint' && tool !== 'erase') {
      return;
    }
    if (
      current.kind === nextCell.kind &&
      (current.kind === 'empty' ||
        (nextCell.kind === 'bead' && current.colorId === nextCell.colorId))
    ) {
      return;
    }
    workingCells = replaceCell(workingCells, point.row, point.column, nextCell);
    if (gesture) {
      gesture.changed = true;
    }
    scheduleRender();
  }

  function commit(nextCells: readonly (readonly BeadCell[])[], message: string): void {
    workingCells = cloneCells(nextCells);
    callbacks.onCommit(cloneCells(nextCells), message);
    scheduleRender();
  }

  function handleKeyDown(event: KeyboardEvent): void {
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
        column: Math.max(0, keyboardPoint.column - 1),
      };
    } else if (event.key === 'ArrowRight') {
      keyboardPoint = {
        ...keyboardPoint,
        column: Math.min(project.grid.columns - 1, keyboardPoint.column + 1),
      };
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      gesture = {
        pointerId: -1,
        start: keyboardPoint,
        last: keyboardPoint,
        changed: false,
      };
      const keyboardGesture = gesture;
      applyTool(keyboardPoint);
      if (keyboardGesture.changed) {
        callbacks.onCommit(cloneCells(workingCells), '已用键盘更新图案。');
      }
      gesture = null;
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && selection) {
      event.preventDefault();
      const normalized = normalizeSelection(selection);
      let nextCells = workingCells;
      for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
        for (let column = normalized.startColumn; column <= normalized.endColumn; column += 1) {
          nextCells = replaceCell(nextCells, row, column, EMPTY_CELL);
        }
      }
      selection = null;
      commit(nextCells, '已清空选中区域。');
    } else {
      return;
    }
    event.preventDefault();
    scheduleRender();
    callbacks.onStatus(
      `当前格子：第 ${String(keyboardPoint.row + 1)} 行，第 ${String(
        keyboardPoint.column + 1,
      )} 列。`,
    );
  }

  function pointFromPointer(event: PointerEvent): CellPoint | null {
    const metrics = getRenderMetrics();
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    const visibleColumn = Math.floor((x - metrics.left) / metrics.cellSize);
    const row = Math.floor((y - metrics.top) / metrics.cellSize);
    if (
      row < 0 ||
      row >= project.grid.rows ||
      visibleColumn < 0 ||
      visibleColumn >= project.grid.columns
    ) {
      return null;
    }
    return {
      row,
      column: reverseView ? project.grid.columns - 1 - visibleColumn : visibleColumn,
    };
  }

  function scheduleRender(): void {
    if (pendingRender) {
      return;
    }
    pendingRender = window.requestAnimationFrame(() => {
      pendingRender = 0;
      render();
    });
  }

  function render(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const metrics = getRenderMetrics();
    context.fillStyle = '#E7E3DA';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#FBFAF6';
    context.fillRect(
      metrics.left,
      metrics.top,
      metrics.cellSize * project.grid.columns,
      metrics.cellSize * project.grid.rows,
    );

    for (let row = 0; row < project.grid.rows; row += 1) {
      for (let visibleColumn = 0; visibleColumn < project.grid.columns; visibleColumn += 1) {
        const column = reverseView ? project.grid.columns - 1 - visibleColumn : visibleColumn;
        const cell = workingCells[row]?.[column];
        if (!cell) {
          continue;
        }
        const left = metrics.left + visibleColumn * metrics.cellSize;
        const top = metrics.top + row * metrics.cellSize;
        if (metrics.cellSize >= 7) {
          context.strokeStyle = '#D7D2C8';
          context.lineWidth = Math.max(1, dpr * 0.6);
          context.strokeRect(left, top, metrics.cellSize, metrics.cellSize);
        }
        if (cell.kind === 'bead') {
          const color = COLOR_BY_ID.get(cell.colorId);
          if (color) {
            const radius = Math.max(1.4, metrics.cellSize * 0.39);
            const centerX = left + metrics.cellSize / 2;
            const centerY = top + metrics.cellSize / 2;
            context.beginPath();
            context.arc(centerX, centerY, radius, 0, Math.PI * 2);
            context.fillStyle = color.displayHex;
            context.fill();
            if (metrics.cellSize >= 9) {
              context.beginPath();
              context.arc(centerX, centerY, Math.max(1, radius * 0.25), 0, Math.PI * 2);
              context.fillStyle = '#FBFAF6';
              context.fill();
            }
          }
        }
      }
    }

    if (selection) {
      const normalized = normalizeSelection(selection);
      const leftColumn = reverseView
        ? project.grid.columns - 1 - normalized.endColumn
        : normalized.startColumn;
      const rightColumn = reverseView
        ? project.grid.columns - 1 - normalized.startColumn
        : normalized.endColumn;
      context.fillStyle = 'rgb(13 121 104 / 14%)';
      context.strokeStyle = '#0D7968';
      context.lineWidth = Math.max(2, dpr);
      context.fillRect(
        metrics.left + leftColumn * metrics.cellSize,
        metrics.top + normalized.startRow * metrics.cellSize,
        (rightColumn - leftColumn + 1) * metrics.cellSize,
        (normalized.endRow - normalized.startRow + 1) * metrics.cellSize,
      );
      context.strokeRect(
        metrics.left + leftColumn * metrics.cellSize,
        metrics.top + normalized.startRow * metrics.cellSize,
        (rightColumn - leftColumn + 1) * metrics.cellSize,
        (normalized.endRow - normalized.startRow + 1) * metrics.cellSize,
      );
    }

    const keyboardVisibleColumn = reverseView
      ? project.grid.columns - 1 - keyboardPoint.column
      : keyboardPoint.column;
    context.strokeStyle = '#1D2523';
    context.lineWidth = Math.max(1, dpr);
    context.strokeRect(
      metrics.left + keyboardVisibleColumn * metrics.cellSize + 1,
      metrics.top + keyboardPoint.row * metrics.cellSize + 1,
      Math.max(0, metrics.cellSize - 2),
      Math.max(0, metrics.cellSize - 2),
    );
  }

  function getRenderMetrics(): {
    readonly cellSize: number;
    readonly left: number;
    readonly top: number;
  } {
    const padding = 20 * Math.min(window.devicePixelRatio || 1, 2);
    const availableWidth = Math.max(1, canvas.width - padding * 2);
    const availableHeight = Math.max(1, canvas.height - padding * 2);
    const fitted = Math.min(
      availableWidth / project.grid.columns,
      availableHeight / project.grid.rows,
    );
    const cellSize = fitted * zoom;
    return {
      cellSize,
      left: (canvas.width - cellSize * project.grid.columns) / 2,
      top: (canvas.height - cellSize * project.grid.rows) / 2,
    };
  }
}

function normalizeSelection(selection: CellSelection): CellSelection {
  return Object.freeze({
    startRow: Math.min(selection.startRow, selection.endRow),
    startColumn: Math.min(selection.startColumn, selection.endColumn),
    endRow: Math.max(selection.startRow, selection.endRow),
    endColumn: Math.max(selection.startColumn, selection.endColumn),
  });
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
