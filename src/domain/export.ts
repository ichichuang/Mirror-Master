import { brandConfig } from '../brand/brand.config';
import { PALETTE_COLORS } from '../generated/palettes';
import {
  assertValidProject,
  calculateStatistics,
  type BeadProject,
  type ProjectStatistics,
} from './project';

const COLOR_BY_ID = new Map(PALETTE_COLORS.map((color) => [color.id, color]));

export function exportProjectJson(project: BeadProject): string {
  assertValidProject(project);
  return `${JSON.stringify(project, null, 2)}\n`;
}

export function exportProjectCsv(project: BeadProject): string {
  assertValidProject(project);
  const statistics = calculateStatistics(project.cells);
  const rows: string[][] = [
    [`${brandConfig.productName}项目`, project.id],
    ['项目版本', project.schemaVersion],
    ['矩阵版本', String(project.revision)],
    ['行', String(project.grid.rows)],
    ['列', String(project.grid.columns)],
    ['拼豆总数', String(statistics.nonEmptyBeadCount)],
    ['空格数', String(statistics.blankCount)],
    [],
    ['材料清单'],
    ['颜色 ID', '色板', '系列', '色号', '显示 HEX', '名称', '数量'],
  ];

  for (const [colorId, count] of Object.entries(statistics.perColorCounts)) {
    const color = COLOR_BY_ID.get(colorId);
    if (!color) {
      throw new Error(`项目包含未知颜色：${colorId}`);
    }
    rows.push([
      color.id,
      color.paletteId,
      color.series,
      color.code,
      color.displayHex,
      color.name ?? '',
      String(count),
    ]);
  }

  rows.push([], ['逐格明细'], ['行', '列', '类型', '颜色 ID', '色板', '系列', '色号']);
  project.cells.forEach((matrixRow, rowIndex) => {
    matrixRow.forEach((cell, columnIndex) => {
      if (cell.kind === 'empty') {
        rows.push([String(rowIndex + 1), String(columnIndex + 1), '空', '', '', '', '']);
        return;
      }
      const color = COLOR_BY_ID.get(cell.colorId);
      if (!color) {
        throw new Error(`项目包含未知颜色：${cell.colorId}`);
      }
      rows.push([
        String(rowIndex + 1),
        String(columnIndex + 1),
        '拼豆',
        color.id,
        color.paletteId,
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
