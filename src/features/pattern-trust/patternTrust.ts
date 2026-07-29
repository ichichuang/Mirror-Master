import { calculateStatistics, type BeadProject } from '../../domain/project';

export interface PatternTrustSummary {
  readonly rows: number;
  readonly columns: number;
  readonly totalCellCount: number;
  readonly nonEmptyBeadCount: number;
  readonly blankCount: number;
  readonly usedColorCount: number;
  readonly perColorCountSum: number;
  readonly isValid: true;
}

export interface PatternTrustCopy {
  readonly primary: string;
  readonly verification: '图纸统计校验通过';
}

export function createPatternTrustSummary(project: BeadProject): PatternTrustSummary {
  const rows = project.grid.rows;
  const columns = project.grid.columns;
  const totalCellCount = rows * columns;

  if (project.cells.length !== rows || project.cells.some((row) => row.length !== columns)) {
    throw new Error('图纸矩阵尺寸与当前行列不一致。');
  }

  const statistics = calculateStatistics(project.cells);
  const perColorCountSum = Object.values(statistics.perColorCounts).reduce(
    (total, count) => total + count,
    0,
  );

  if (
    statistics.totalCellCount !== totalCellCount ||
    perColorCountSum !== statistics.nonEmptyBeadCount ||
    statistics.nonEmptyBeadCount + statistics.blankCount !== totalCellCount
  ) {
    throw new Error('图纸统计与当前矩阵不一致。');
  }

  return Object.freeze({
    rows,
    columns,
    totalCellCount,
    nonEmptyBeadCount: statistics.nonEmptyBeadCount,
    blankCount: statistics.blankCount,
    usedColorCount: statistics.usedColorCount,
    perColorCountSum,
    isValid: true,
  });
}

export function formatPatternTrustSummary(summary: PatternTrustSummary): PatternTrustCopy {
  const primary =
    summary.blankCount === 0
      ? `${formatCount(summary.columns)} × ${formatCount(summary.rows)} 格 · ${formatCount(
          summary.nonEmptyBeadCount,
        )} 颗豆 · ${formatCount(summary.usedColorCount)} 种颜色`
      : `总格数 ${formatCount(summary.totalCellCount)} · 实际用豆 ${formatCount(
          summary.nonEmptyBeadCount,
        )} · 空白 ${formatCount(summary.blankCount)} · ${formatCount(
          summary.usedColorCount,
        )} 种颜色`;

  return Object.freeze({
    primary,
    verification: '图纸统计校验通过',
  });
}

function formatCount(value: number): string {
  return value.toLocaleString('zh-CN');
}
