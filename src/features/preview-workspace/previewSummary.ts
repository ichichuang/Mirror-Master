import {
  calculatePhysicalLayout,
  type BeadProject,
  type ProjectStatistics,
} from '../../domain/project';

export function formatPreviewSummary(project: BeadProject, statistics: ProjectStatistics): string {
  const layout = calculatePhysicalLayout(project);
  return (
    `${String(project.grid.columns)} × ${String(project.grid.rows)} 颗 · ` +
    `${String(statistics.usedColorCount)} 色 · ` +
    `约 ${formatCentimeters(layout.widthMm)} × ${formatCentimeters(layout.heightMm)} cm · ` +
    `${String(layout.boardCount)} 块拼板 · ` +
    `共 ${statistics.nonEmptyBeadCount.toLocaleString('zh-CN')} 颗`
  );
}

export function formatPreviewDoneStatus(columns: number, rows: number, usedColors: number): string {
  return `已更新：${String(columns)} × ${String(rows)} 颗，${String(usedColors)} 色`;
}

function formatCentimeters(millimeters: number): string {
  return String(Number((millimeters / 10).toFixed(1)));
}
