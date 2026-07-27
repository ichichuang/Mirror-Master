import { brandConfig } from '../brand/brand.config';
import { PALETTE_COLORS, PALETTES } from '../generated/palettes';
import {
  assertValidProject,
  calculatePhysicalLayout,
  calculateStatistics,
  parseBeadProject,
  type BeadProject,
  type ProjectStatistics,
} from './project';

const COLOR_BY_ID = new Map(PALETTE_COLORS.map((color) => [color.id, color]));
const PALETTE_LABEL_BY_ID = new Map(PALETTES.map((palette) => [palette.id, palette.label]));

export function captureProjectRevision(project: unknown): BeadProject {
  return parseBeadProject(structuredClone(project));
}

export function exportProjectJson(project: BeadProject): string {
  assertValidProject(project);
  return `${JSON.stringify(project, null, 2)}\n`;
}

export function exportProjectCsv(project: BeadProject): string {
  assertValidProject(project);
  const statistics = calculateStatistics(project.cells);
  const layout = calculatePhysicalLayout(project);
  const rows: string[][] = [
    ['项目摘要'],
    ['产品', brandConfig.productName],
    ['行数', String(project.grid.rows)],
    ['列数', String(project.grid.columns)],
    ['拼豆总数', String(statistics.nonEmptyBeadCount)],
    ['空格数', String(statistics.blankCount)],
    ['使用颜色数', String(statistics.usedColorCount)],
    ['预计宽度（毫米）', formatMillimeters(layout.widthMm)],
    ['预计高度（毫米）', formatMillimeters(layout.heightMm)],
    ['拼豆直径（毫米）', formatMillimeters(project.grid.beadDiameterMm)],
    ['拼豆间距（毫米）', formatMillimeters(project.grid.beadPitchMm)],
    ['拼板规格', `${String(project.grid.boardRows)} 行 × ${String(project.grid.boardColumns)} 列`],
    ['拼板布局', `${String(layout.boardRows)} 行 × ${String(layout.boardColumns)} 列`],
    ['拼板总数', String(layout.boardCount)],
    [],
    ['材料清单'],
    ['颜色标识', '色板', '系列', '色号', '显示色值', '名称', '数量'],
  ];

  for (const [colorId, count] of Object.entries(statistics.perColorCounts)) {
    const color = COLOR_BY_ID.get(colorId);
    if (!color) {
      throw new Error(`项目包含未知颜色：${colorId}`);
    }
    const paletteLabel = PALETTE_LABEL_BY_ID.get(color.paletteId);
    if (!paletteLabel) {
      throw new Error(`项目包含未知色板：${color.paletteId}`);
    }
    rows.push([
      color.id,
      paletteLabel,
      color.series,
      color.code,
      color.displayHex,
      color.name ?? '',
      String(count),
    ]);
  }

  rows.push([], ['逐格明细'], ['行', '列', '类型', '颜色标识', '色板', '系列', '色号']);
  project.cells.forEach((matrixRow, rowIndex) => {
    matrixRow.forEach((cell, columnIndex) => {
      if (cell.kind === 'empty') {
        rows.push([String(rowIndex + 1), String(columnIndex + 1), '空格', '', '', '', '']);
        return;
      }
      const color = COLOR_BY_ID.get(cell.colorId);
      if (!color) {
        throw new Error(`项目包含未知颜色：${cell.colorId}`);
      }
      const paletteLabel = PALETTE_LABEL_BY_ID.get(color.paletteId);
      if (!paletteLabel) {
        throw new Error(`项目包含未知色板：${color.paletteId}`);
      }
      rows.push([
        String(rowIndex + 1),
        String(columnIndex + 1),
        '拼豆',
        color.id,
        paletteLabel,
        color.series,
        color.code,
      ]);
    });
  });

  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`;
}

export function assertExportStatistics(
  statistics: ProjectStatistics,
  expectedBeadCount: number,
): void {
  const sum = Object.values(statistics.perColorCounts).reduce((total, count) => total + count, 0);
  if (sum !== statistics.nonEmptyBeadCount || sum !== expectedBeadCount) {
    throw new Error('导出材料数量与项目矩阵不一致。');
  }
}

export function safeDownloadBaseName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/u, '');
  const withoutControlCharacters = Array.from(withoutExtension)
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint < 32 ? '-' : character;
    })
    .join('');
  const sanitized = withoutControlCharacters
    .replaceAll(/[<>:"/\\|?*]/gu, '-')
    .replaceAll(/\s+/gu, ' ')
    .trim()
    .slice(0, 80);
  return sanitized || 'mirror-master-project';
}

function escapeCsvCell(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function formatMillimeters(value: number): string {
  const tenths = Math.floor(value * 10 + 0.5 + 1e-9);
  return `${String(Math.floor(tenths / 10))}.${String(tenths % 10)}`;
}
