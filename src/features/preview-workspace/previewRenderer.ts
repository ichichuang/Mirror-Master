import type { BeadCell } from '../../domain/project';

export interface PreviewCanvasLayout {
  readonly cellSize: number;
  readonly originX: number;
  readonly originY: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

const CHECKER_LIGHT = '#e8ebe9';
const CHECKER_DARK = '#cfd6d2';
const FALLBACK_COLOR = '#b9c2bd';

export function computePreviewCanvasLayout(
  containerWidth: number,
  containerHeight: number,
  columns: number,
  rows: number,
): PreviewCanvasLayout {
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
  const cellSize = Math.max(
    1,
    Math.floor(Math.min(containerWidth / columns, containerHeight / rows)),
  );
  const gridWidth = cellSize * columns;
  const gridHeight = cellSize * rows;
  return Object.freeze({
    cellSize,
    originX: Math.floor((containerWidth - gridWidth) / 2),
    originY: Math.floor((containerHeight - gridHeight) / 2),
    gridWidth,
    gridHeight,
    canvasWidth: Math.floor(containerWidth),
    canvasHeight: Math.floor(containerHeight),
  });
}

export function drawPatternPreview(
  canvas: HTMLCanvasElement,
  cells: readonly (readonly BeadCell[])[],
  colorHexById: ReadonlyMap<string, string>,
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
  const { cellSize, originX, originY } = layout;
  const checkerSize = Math.max(2, Math.floor(cellSize / 2));
  for (let row = 0; row < rows; row += 1) {
    const line = cells[row];
    if (!line) continue;
    for (let column = 0; column < columns; column += 1) {
      const cell = line[column];
      const left = originX + column * cellSize;
      const top = originY + row * cellSize;
      if (!cell || cell.kind === 'empty') {
        drawEmptyCell(context, left, top, cellSize, checkerSize, row, column);
        continue;
      }
      context.fillStyle = colorHexById.get(cell.colorId) ?? FALLBACK_COLOR;
      context.fillRect(left, top, cellSize, cellSize);
    }
  }
  context.restore();
  return true;
}

export function clearPatternPreview(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
}

function drawEmptyCell(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  cellSize: number,
  checkerSize: number,
  row: number,
  column: number,
): void {
  if (cellSize < 6) {
    context.fillStyle = (row + column) % 2 === 0 ? CHECKER_LIGHT : CHECKER_DARK;
    context.fillRect(left, top, cellSize, cellSize);
    return;
  }
  for (let y = 0; y < cellSize; y += checkerSize) {
    for (let x = 0; x < cellSize; x += checkerSize) {
      const alternate = (Math.floor(x / checkerSize) + Math.floor(y / checkerSize)) % 2 === 0;
      context.fillStyle = alternate ? CHECKER_LIGHT : CHECKER_DARK;
      context.fillRect(
        left + x,
        top + y,
        Math.min(checkerSize, cellSize - x),
        Math.min(checkerSize, cellSize - y),
      );
    }
  }
}
