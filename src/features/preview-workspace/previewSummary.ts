import { calculatePhysicalLayout, type BeadProject } from '../../domain/project';
import { createPatternTrustSummary } from '../pattern-trust/patternTrust';

export function formatPreviewSummary(project: BeadProject): string {
  const layout = calculatePhysicalLayout(project);
  const trust = createPatternTrustSummary(project);
  return (
    `${String(project.grid.columns)} × ${String(project.grid.rows)} 颗 · ` +
    `${String(trust.usedColorCount)} 色 · ` +
    `约 ${formatCentimeters(layout.widthMm)} × ${formatCentimeters(layout.heightMm)} cm · ` +
    `${String(layout.boardCount)} 块拼板 · ` +
    `共 ${trust.nonEmptyBeadCount.toLocaleString('zh-CN')} 颗`
  );
}

export function formatPreviewDoneStatus(columns: number, rows: number, usedColors: number): string {
  return `已更新：${String(columns)} × ${String(rows)} 颗，${String(usedColors)} 色`;
}

function formatCentimeters(millimeters: number): string {
  return String(Number((millimeters / 10).toFixed(1)));
}
