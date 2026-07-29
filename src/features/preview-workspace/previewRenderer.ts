import type { BeadCell } from '../../domain/project';
import { DEFAULT_PREVIEW_RENDER_MODE, type PreviewRenderMode } from './previewMode';

export interface PreviewCanvasLayout {
  readonly cellSize: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly originX: number;
  readonly originY: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

export interface PreviewFrameSize {
  readonly width: number;
  readonly height: number;
}

const CHECKER_LIGHT = '#e8ebe9';
const CHECKER_DARK = '#cfd6d2';
const FALLBACK_COLOR = '#b9c2bd';
const PREVIEW_SURFACE = '#f5f7f6';
const MINIMUM_LABEL_CELL_SIZE = 4;

export function computePreviewFrameSize(
  containerWidth: number,
  containerHeight: number,
  columns: number,
  rows: number,
): PreviewFrameSize {
  assertPreviewDimensions(containerWidth, containerHeight, columns, rows);
  const scale = Math.min(containerWidth / columns, containerHeight / rows);
  return Object.freeze({
    width: Math.max(1, Math.floor(columns * scale)),
    height: Math.max(1, Math.floor(rows * scale)),
  });
}

export function computePreviewCanvasLayout(
  containerWidth: number,
  containerHeight: number,
  columns: number,
  rows: number,
): PreviewCanvasLayout {
  assertPreviewDimensions(containerWidth, containerHeight, columns, rows);
  const canvasWidth = Math.max(1, Math.floor(containerWidth));
  const canvasHeight = Math.max(1, Math.floor(containerHeight));
  const cellWidth = canvasWidth / columns;
  const cellHeight = canvasHeight / rows;
  return Object.freeze({
    cellSize: Math.min(cellWidth, cellHeight),
    cellWidth,
    cellHeight,
    originX: 0,
    originY: 0,
    gridWidth: canvasWidth,
    gridHeight: canvasHeight,
    canvasWidth,
    canvasHeight,
  });
}

function assertPreviewDimensions(
  containerWidth: number,
  containerHeight: number,
  columns: number,
  rows: number,
): void {
  if (
    !Number.isFinite(containerWidth) ||
    !Number.isFinite(containerHeight) ||
    containerWidth <= 0 ||
    containerHeight <= 0
  ) {
    throw new Error('预览画布容器尺寸必须是正数。');
  }
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) {
    throw new Error('预览矩阵行列必须是正整数。');
  }
}

export function drawPatternPreview(
  canvas: HTMLCanvasElement,
  cells: readonly (readonly BeadCell[])[],
  colorHexById: ReadonlyMap<string, string>,
  mode: PreviewRenderMode = DEFAULT_PREVIEW_RENDER_MODE,
  colorCodeById: ReadonlyMap<string, string> = new Map(),
): boolean {
  const rows = cells.length;
  const columns = cells[0]?.length ?? 0;
  const context = canvas.getContext('2d');
  if (!context || rows === 0 || columns === 0) {
    return false;
  }
  const host = canvas.parentElement;
  const containerWidth = canvas.clientWidth || host?.clientWidth || columns;
  const containerHeight = canvas.clientHeight || host?.clientHeight || rows;
  const layout = computePreviewCanvasLayout(containerWidth, containerHeight, columns, rows);
  const pixelRatio = Math.max(
    1,
    canvas.ownerDocument.defaultView?.devicePixelRatio || globalThis.devicePixelRatio || 1,
  );
  const backingWidth = Math.max(1, Math.round(layout.canvasWidth * pixelRatio));
  const backingHeight = Math.max(1, Math.round(layout.canvasHeight * pixelRatio));
  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;

  context.save();
  context.scale(pixelRatio, pixelRatio);
  context.clearRect(0, 0, layout.canvasWidth, layout.canvasHeight);
  const { cellSize, cellWidth, cellHeight, originX, originY } = layout;
  const checkerSize = Math.max(2, Math.floor(cellSize / 2));
  if (mode === 'rounded' || mode === 'ring') {
    context.fillStyle = PREVIEW_SURFACE;
    context.fillRect(originX, originY, layout.gridWidth, layout.gridHeight);
  }
  for (let row = 0; row < rows; row += 1) {
    const line = cells[row];
    if (!line) continue;
    for (let column = 0; column < columns; column += 1) {
      const cell = line[column];
      const left = originX + column * cellWidth;
      const top = originY + row * cellHeight;
      if (!cell || cell.kind === 'empty') {
        drawEmptyCell(context, left, top, cellWidth, cellHeight, checkerSize, row, column);
        continue;
      }
      const colorHex = colorHexById.get(cell.colorId) ?? FALLBACK_COLOR;
      drawBeadCell(context, left, top, cellWidth, cellHeight, colorHex, mode);
      const label = resolvePreviewCellLabel(
        colorCodeById.get(cell.colorId) ?? cell.colorId,
        cellSize,
        mode,
      );
      if (label) {
        drawCellLabel(context, left, top, cellWidth, cellHeight, colorHex, label);
      }
    }
  }
  drawPreviewGuides(context, layout, columns, rows, mode);
  context.restore();
  return true;
}

export function clearPatternPreview(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
}

export function resolvePreviewCellLabel(
  colorCode: string,
  cellSize: number,
  mode: PreviewRenderMode,
): string | null {
  if (mode !== 'numbered' || cellSize < MINIMUM_LABEL_CELL_SIZE) {
    return null;
  }
  const conciseCode =
    colorCode
      .trim()
      .split(/[:\s]+/u)
      .at(-1)
      ?.toUpperCase() ?? '';
  return conciseCode.length > 0 && conciseCode.length <= 5 ? conciseCode : null;
}

export function previewGuideWeight(index: number, mode: PreviewRenderMode): 0 | 1 | 2 | 3 {
  if (mode !== 'annotated' && mode !== 'numbered') {
    return 0;
  }
  if (index % 10 === 0) {
    return 3;
  }
  if (index % 5 === 0) {
    return 2;
  }
  return 1;
}

function drawBeadCell(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  cellWidth: number,
  cellHeight: number,
  colorHex: string,
  mode: PreviewRenderMode,
): void {
  const cellSize = Math.min(cellWidth, cellHeight);
  context.fillStyle = colorHex;
  if (mode === 'rounded') {
    const inset = Math.max(0.75, cellSize * 0.08);
    const width = Math.max(0, cellWidth - inset * 2);
    const height = Math.max(0, cellHeight - inset * 2);
    roundedRect(context, left + inset, top + inset, width, height, Math.max(1, cellSize * 0.18));
    context.fill();
    return;
  }
  if (mode === 'ring') {
    const centerX = left + cellWidth / 2;
    const centerY = top + cellHeight / 2;
    const radius = Math.max(0.5, cellSize * 0.44);
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();
    if (cellSize >= 5) {
      context.fillStyle = PREVIEW_SURFACE;
      context.beginPath();
      context.arc(centerX, centerY, Math.max(0.7, cellSize * 0.13), 0, Math.PI * 2);
      context.fill();
    }
    return;
  }
  context.fillRect(left, top, cellWidth, cellHeight);
}

function drawCellLabel(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  cellWidth: number,
  cellHeight: number,
  colorHex: string,
  label: string,
): void {
  const cellSize = Math.min(cellWidth, cellHeight);
  const fontSize = Math.max(3, Math.min(12, Math.floor(cellSize * 0.72)));
  context.fillStyle = readableTextColor(colorHex);
  context.font = `700 ${String(fontSize)}px ui-sans-serif, system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, left + cellWidth / 2, top + cellHeight / 2, Math.max(1, cellWidth - 1));
}

function drawPreviewGuides(
  context: CanvasRenderingContext2D,
  layout: PreviewCanvasLayout,
  columns: number,
  rows: number,
  mode: PreviewRenderMode,
): void {
  if (mode !== 'annotated' && mode !== 'numbered') {
    return;
  }
  const maximumWeight = 3;
  for (let weight = 1; weight <= maximumWeight; weight += 1) {
    context.beginPath();
    for (let column = 0; column <= columns; column += 1) {
      if (previewGuideWeight(column, mode) !== weight) continue;
      const x = layout.originX + column * layout.cellWidth;
      context.moveTo(x, layout.originY);
      context.lineTo(x, layout.originY + layout.gridHeight);
    }
    for (let row = 0; row <= rows; row += 1) {
      if (previewGuideWeight(row, mode) !== weight) continue;
      const y = layout.originY + row * layout.cellHeight;
      context.moveTo(layout.originX, y);
      context.lineTo(layout.originX + layout.gridWidth, y);
    }
    context.strokeStyle =
      weight === 3
        ? 'rgb(22 45 36 / 72%)'
        : weight === 2
          ? 'rgb(22 45 36 / 42%)'
          : 'rgb(22 45 36 / 20%)';
    context.lineWidth = weight === 3 ? 1.8 : weight === 2 ? 1.15 : 0.6;
    context.stroke();
  }
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function readableTextColor(colorHex: string): '#ffffff' | '#13241d' {
  const normalized = colorHex.match(/^#([\da-f]{6})$/iu)?.[1];
  if (!normalized) {
    return '#13241d';
  }
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance < 142 ? '#ffffff' : '#13241d';
}

function drawEmptyCell(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  cellWidth: number,
  cellHeight: number,
  checkerSize: number,
  row: number,
  column: number,
): void {
  const cellSize = Math.min(cellWidth, cellHeight);
  if (cellSize < 6) {
    context.fillStyle = (row + column) % 2 === 0 ? CHECKER_LIGHT : CHECKER_DARK;
    context.fillRect(left, top, cellWidth, cellHeight);
    return;
  }
  for (let y = 0; y < cellHeight; y += checkerSize) {
    for (let x = 0; x < cellWidth; x += checkerSize) {
      const alternate = (Math.floor(x / checkerSize) + Math.floor(y / checkerSize)) % 2 === 0;
      context.fillStyle = alternate ? CHECKER_LIGHT : CHECKER_DARK;
      context.fillRect(
        left + x,
        top + y,
        Math.min(checkerSize, cellWidth - x),
        Math.min(checkerSize, cellHeight - y),
      );
    }
  }
}
