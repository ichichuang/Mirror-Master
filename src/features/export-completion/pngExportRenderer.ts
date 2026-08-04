import {
  calculatePhysicalLayout,
  calculateStatistics,
  type BeadProject,
} from '../../domain/project';
import type { PngExportAppearance, PngExportConfiguration } from './pngExportConfiguration';

export const MAX_PNG_EXPORT_CANVAS_EDGE = 8192;
export const MAX_PNG_EXPORT_CANVAS_PIXELS = 40_000_000;
export const MIN_PNG_EXPORT_CODE_CELL_SIZE = 18;

const BASE_CELL_SIZE = 16;
const CODE_CELL_SIZE = 28;
const MIN_CELL_SIZE = 8;
const STATISTICS_HEIGHT = 104;
const SECTION_GAP = 20;
const MATERIALS_HEADING_HEIGHT = 54;
const MATERIALS_ROW_HEIGHT = 38;
const MATERIALS_PADDING = 24;
const MIN_INFORMATION_WIDTH = 640;
const MATERIALS_COLUMN_WIDTH = 210;
const WHITE = '#ffffff';
const INK = '#17241f';
const MUTED_INK = '#5e6d66';
const GRID = '#dce2de';
const GRID_MEDIUM = '#9eaca5';
const GRID_STRONG = '#3f574d';
const FALLBACK_COLOR = '#b9c2bd';

export interface PngExportRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PngExportLayout {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly cellSize: number;
  readonly gridX: number;
  readonly gridY: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly coordinateGutter: number;
  readonly statisticsBox: PngExportRect | null;
  readonly materialsBox: PngExportRect | null;
  readonly materialColumns: number;
}

export interface RenderPngExportInput {
  readonly project: BeadProject;
  readonly configuration: PngExportConfiguration;
  readonly colorHexById: ReadonlyMap<string, string>;
  readonly colorCodeById: ReadonlyMap<string, string>;
}

export class PngExportRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PngExportRenderError';
  }
}

export function pngExportConfigurationSignature(configuration: PngExportConfiguration): string {
  return JSON.stringify([
    configuration.background,
    configuration.appearance,
    configuration.includeGrid,
    configuration.includeCoordinates,
    configuration.includeCellCodes,
    configuration.includeStatistics,
    configuration.includeMaterialCounts,
    configuration.includeColorLegend,
  ]);
}

export function planPngExportLayout(
  project: BeadProject,
  configuration: PngExportConfiguration,
): PngExportLayout {
  const preferredCellSize = configuration.includeCellCodes ? CODE_CELL_SIZE : BASE_CELL_SIZE;
  const minimumCellSize = configuration.includeCellCodes
    ? MIN_PNG_EXPORT_CODE_CELL_SIZE
    : MIN_CELL_SIZE;

  for (let cellSize = preferredCellSize; cellSize >= minimumCellSize; cellSize -= 1) {
    const layout = layoutAtCellSize(project, configuration, cellSize);
    if (
      layout.canvasWidth <= MAX_PNG_EXPORT_CANVAS_EDGE &&
      layout.canvasHeight <= MAX_PNG_EXPORT_CANVAS_EDGE &&
      layout.canvasWidth * layout.canvasHeight <= MAX_PNG_EXPORT_CANVAS_PIXELS
    ) {
      return layout;
    }
  }

  throw new PngExportRenderError(
    configuration.includeCellCodes
      ? '当前图纸过大，无法在保证色号清晰的情况下生成图片。'
      : '当前图纸过大，无法在浏览器安全范围内生成图片。',
  );
}

export function renderPngExportCanvas(
  canvas: HTMLCanvasElement,
  input: RenderPngExportInput,
): PngExportLayout {
  const layout = planPngExportLayout(input.project, input.configuration);
  canvas.width = layout.canvasWidth;
  canvas.height = layout.canvasHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new PngExportRenderError('浏览器无法创建图片画布。');
  }

  context.clearRect(0, 0, layout.canvasWidth, layout.canvasHeight);
  context.save();
  if (input.configuration.background === 'white') {
    context.fillStyle = WHITE;
    context.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight);
  }
  if (layout.statisticsBox) {
    drawStatistics(context, input.project, layout.statisticsBox);
  }
  drawPattern(context, input, layout);
  if (input.configuration.includeGrid) {
    drawGrid(context, input.project, layout);
  }
  if (input.configuration.includeCoordinates) {
    drawCoordinates(context, input.project, layout);
  }
  if (layout.materialsBox) {
    drawMaterials(context, input, layout);
  }
  context.restore();
  return layout;
}

export function encodeCanvasAsPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob || blob.type !== 'image/png') {
          reject(new PngExportRenderError('浏览器无法生成 PNG 图片。'));
          return;
        }
        resolve(blob);
      }, 'image/png');
    } catch {
      reject(new PngExportRenderError('浏览器无法生成 PNG 图片。'));
    }
  });
}

function layoutAtCellSize(
  project: BeadProject,
  configuration: PngExportConfiguration,
  cellSize: number,
): PngExportLayout {
  const coordinateGutter = configuration.includeCoordinates ? Math.max(30, cellSize * 2) : 0;
  const gridWidth = project.grid.columns * cellSize;
  const gridHeight = project.grid.rows * cellSize;
  const hasMaterials = configuration.includeMaterialCounts || configuration.includeColorLegend;
  const minimumInformationWidth =
    configuration.includeStatistics || hasMaterials ? MIN_INFORMATION_WIDTH : 0;
  const canvasWidth = Math.max(gridWidth + coordinateGutter * 2, minimumInformationWidth);
  const statisticsBox = configuration.includeStatistics
    ? Object.freeze({ x: 0, y: 0, width: canvasWidth, height: STATISTICS_HEIGHT })
    : null;
  const gridX = Math.floor((canvasWidth - gridWidth) / 2);
  const gridY = (statisticsBox?.height ?? 0) + coordinateGutter;
  const statistics = calculateStatistics(project.cells);
  const materialColumns = hasMaterials
    ? Math.max(
        1,
        Math.min(statistics.usedColorCount || 1, Math.floor(canvasWidth / MATERIALS_COLUMN_WIDTH)),
      )
    : 0;
  const materialRows =
    hasMaterials && statistics.usedColorCount > 0
      ? Math.ceil(statistics.usedColorCount / materialColumns)
      : 0;
  const materialsHeight = hasMaterials
    ? MATERIALS_PADDING * 2 +
      MATERIALS_HEADING_HEIGHT +
      Math.max(1, materialRows) * MATERIALS_ROW_HEIGHT
    : 0;
  const materialsY = gridY + gridHeight + coordinateGutter + (hasMaterials ? SECTION_GAP : 0);
  const materialsBox = hasMaterials
    ? Object.freeze({ x: 0, y: materialsY, width: canvasWidth, height: materialsHeight })
    : null;
  const canvasHeight = materialsBox
    ? materialsBox.y + materialsBox.height
    : gridY + gridHeight + coordinateGutter;

  return Object.freeze({
    canvasWidth,
    canvasHeight,
    cellSize,
    gridX,
    gridY,
    gridWidth,
    gridHeight,
    coordinateGutter,
    statisticsBox,
    materialsBox,
    materialColumns,
  });
}

function drawStatistics(
  context: CanvasRenderingContext2D,
  project: BeadProject,
  box: PngExportRect,
): void {
  const statistics = calculateStatistics(project.cells);
  const physical = calculatePhysicalLayout(project);
  context.fillStyle = INK;
  context.font = '700 24px ui-sans-serif, system-ui, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.fillText('图纸统计', box.x + 24, box.y + 18);
  context.fillStyle = MUTED_INK;
  context.font = '500 15px ui-sans-serif, system-ui, sans-serif';
  context.fillText(
    `${String(project.grid.columns)} × ${String(project.grid.rows)} 格 · ` +
      `${String(statistics.nonEmptyBeadCount)} 颗拼豆 · ` +
      `${String(statistics.usedColorCount)} 种颜色`,
    box.x + 24,
    box.y + 54,
  );
  context.fillText(
    `成品约 ${formatCentimeters(physical.widthMm)} × ${formatCentimeters(physical.heightMm)} cm`,
    box.x + 24,
    box.y + 78,
  );
}

function drawPattern(
  context: CanvasRenderingContext2D,
  input: RenderPngExportInput,
  layout: PngExportLayout,
): void {
  const { project, configuration } = input;
  for (let row = 0; row < project.grid.rows; row += 1) {
    const cells = project.cells[row];
    if (!cells) continue;
    for (let column = 0; column < project.grid.columns; column += 1) {
      const cell = cells[column];
      if (!cell || cell.kind === 'empty') continue;
      const left = layout.gridX + column * layout.cellSize;
      const top = layout.gridY + row * layout.cellSize;
      const color = input.colorHexById.get(cell.colorId) ?? FALLBACK_COLOR;
      drawCellAppearance(
        context,
        left,
        top,
        layout.cellSize,
        color,
        configuration.appearance,
        configuration.background,
      );
      if (configuration.includeCellCodes) {
        drawCellCode(
          context,
          left,
          top,
          layout.cellSize,
          color,
          input.colorCodeById.get(cell.colorId) ?? conciseColorCode(cell.colorId),
        );
      }
    }
  }
}

function drawCellAppearance(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  size: number,
  color: string,
  appearance: PngExportAppearance,
  background: PngExportConfiguration['background'],
): void {
  context.fillStyle = color;
  if (appearance === 'solidSquare') {
    context.fillRect(left, top, size, size);
    return;
  }
  if (appearance === 'roundedSquare') {
    const inset = Math.max(1, Math.round(size * 0.08));
    roundedRect(
      context,
      left + inset,
      top + inset,
      size - inset * 2,
      size - inset * 2,
      Math.max(2, size * 0.18),
    );
    context.fill();
    return;
  }

  const centerX = left + size / 2;
  const centerY = top + size / 2;
  context.beginPath();
  context.arc(centerX, centerY, size * 0.43, 0, Math.PI * 2);
  context.fill();
  const holeRadius = size * 0.09;
  context.save();
  if (background === 'transparent') {
    context.globalCompositeOperation = 'destination-out';
    context.fillStyle = '#000000';
  } else {
    context.fillStyle = WHITE;
  }
  context.beginPath();
  context.arc(centerX, centerY, holeRadius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawCellCode(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  size: number,
  color: string,
  code: string,
): void {
  context.fillStyle = readableTextColor(color);
  context.font = `700 ${String(Math.max(9, Math.floor(size * 0.34)))}px ui-sans-serif, system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(code, left + size / 2, top + size / 2, size - 2);
}

function drawGrid(
  context: CanvasRenderingContext2D,
  project: BeadProject,
  layout: PngExportLayout,
): void {
  for (let column = 0; column <= project.grid.columns; column += 1) {
    const x = layout.gridX + column * layout.cellSize;
    drawGuideLine(
      context,
      x,
      layout.gridY,
      x,
      layout.gridY + layout.gridHeight,
      guideWeight(column),
    );
  }
  for (let row = 0; row <= project.grid.rows; row += 1) {
    const y = layout.gridY + row * layout.cellSize;
    drawGuideLine(context, layout.gridX, y, layout.gridX + layout.gridWidth, y, guideWeight(row));
  }
}

function drawGuideLine(
  context: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  weight: 1 | 2 | 3,
): void {
  context.beginPath();
  context.moveTo(fromX, fromY);
  context.lineTo(toX, toY);
  context.strokeStyle = weight === 3 ? GRID_STRONG : weight === 2 ? GRID_MEDIUM : GRID;
  context.lineWidth = weight;
  context.stroke();
}

function drawCoordinates(
  context: CanvasRenderingContext2D,
  project: BeadProject,
  layout: PngExportLayout,
): void {
  context.fillStyle = MUTED_INK;
  context.font = `600 ${String(Math.max(10, Math.floor(layout.cellSize * 0.42)))}px ui-sans-serif, system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (let column = 0; column < project.grid.columns; column += 1) {
    if (!shouldLabelCoordinate(column, project.grid.columns)) continue;
    const x = layout.gridX + column * layout.cellSize + layout.cellSize / 2;
    const label = String(column + 1);
    context.fillText(label, x, layout.gridY - layout.coordinateGutter / 2);
    context.fillText(label, x, layout.gridY + layout.gridHeight + layout.coordinateGutter / 2);
  }
  for (let row = 0; row < project.grid.rows; row += 1) {
    if (!shouldLabelCoordinate(row, project.grid.rows)) continue;
    const y = layout.gridY + row * layout.cellSize + layout.cellSize / 2;
    const label = String(row + 1);
    context.fillText(label, layout.gridX - layout.coordinateGutter / 2, y);
    context.fillText(label, layout.gridX + layout.gridWidth + layout.coordinateGutter / 2, y);
  }
}

function drawMaterials(
  context: CanvasRenderingContext2D,
  input: RenderPngExportInput,
  layout: PngExportLayout,
): void {
  const box = layout.materialsBox;
  if (!box) return;
  const counts = Object.entries(calculateStatistics(input.project.cells).perColorCounts);
  context.strokeStyle = GRID_MEDIUM;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(box.x + MATERIALS_PADDING, box.y);
  context.lineTo(box.x + box.width - MATERIALS_PADDING, box.y);
  context.stroke();
  context.fillStyle = INK;
  context.font = '700 22px ui-sans-serif, system-ui, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.fillText('材料与颜色', box.x + MATERIALS_PADDING, box.y + MATERIALS_PADDING);
  if (counts.length === 0) {
    context.fillStyle = MUTED_INK;
    context.font = '500 14px ui-sans-serif, system-ui, sans-serif';
    context.fillText(
      '当前图纸没有拼豆颜色',
      box.x + MATERIALS_PADDING,
      box.y + MATERIALS_PADDING + 34,
    );
    return;
  }

  const rows = Math.ceil(counts.length / layout.materialColumns);
  const columnWidth = (box.width - MATERIALS_PADDING * 2) / layout.materialColumns;
  context.font = '600 14px ui-sans-serif, system-ui, sans-serif';
  for (const [index, [colorId, count]] of counts.entries()) {
    const column = Math.floor(index / rows);
    const row = index % rows;
    const left = box.x + MATERIALS_PADDING + column * columnWidth;
    const top = box.y + MATERIALS_PADDING + MATERIALS_HEADING_HEIGHT + row * MATERIALS_ROW_HEIGHT;
    const color = input.colorHexById.get(colorId) ?? FALLBACK_COLOR;
    const code = input.colorCodeById.get(colorId) ?? conciseColorCode(colorId);
    let textLeft = left;
    if (input.configuration.includeColorLegend) {
      context.fillStyle = color;
      context.fillRect(left, top, 24, 24);
      context.strokeStyle = GRID_MEDIUM;
      context.lineWidth = 1;
      context.strokeRect(left, top, 24, 24);
      textLeft += 34;
    }
    const label = input.configuration.includeMaterialCounts
      ? `${code} · ${String(count)} 颗`
      : code;
    context.fillStyle = INK;
    context.fillText(label, textLeft, top + 3, Math.max(1, columnWidth - (textLeft - left) - 8));
  }
}

function guideWeight(index: number): 1 | 2 | 3 {
  if (index % 10 === 0) return 3;
  if (index % 5 === 0) return 2;
  return 1;
}

function shouldLabelCoordinate(index: number, total: number): boolean {
  return index === 0 || index === total - 1 || (index + 1) % 5 === 0;
}

function conciseColorCode(value: string): string {
  return (
    value
      .trim()
      .split(/[:\s]+/u)
      .at(-1)
      ?.toUpperCase() ?? value
  );
}

function readableTextColor(colorHex: string): '#ffffff' | '#17241f' {
  const normalized = colorHex.match(/^#([\da-f]{6})$/iu)?.[1];
  if (!normalized) return INK;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 < 142 ? WHITE : INK;
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

function formatCentimeters(millimeters: number): string {
  const centimeters = millimeters / 10;
  return Number.isInteger(centimeters)
    ? String(centimeters)
    : centimeters.toFixed(1).replace(/\.0$/u, '');
}
