import {
  calculateStatistics,
  mirrorCells,
  type BeadCell,
  type BeadProject,
  type MirrorAxis,
} from '../../domain/project';
import { createPatternTrustSummary, type PatternTrustSummary } from '../pattern-trust/patternTrust';

export type MatrixMirrorAxis = MirrorAxis;

export interface VerifiedMatrixMirror {
  readonly cells: readonly (readonly BeadCell[])[];
  readonly before: PatternTrustSummary;
  readonly after: PatternTrustSummary;
}

export function createVerifiedMatrixMirror(
  project: BeadProject,
  axis: MatrixMirrorAxis,
): VerifiedMatrixMirror {
  const before = createPatternTrustSummary(project);
  const beforeCounts = calculateStatistics(project.cells).perColorCounts;
  const cells = mirrorCells(project.cells, axis);
  const candidate = Object.freeze({ ...project, cells });
  const after = createPatternTrustSummary(candidate);
  const afterCounts = calculateStatistics(cells).perColorCounts;

  if (
    before.rows !== after.rows ||
    before.columns !== after.columns ||
    before.totalCellCount !== after.totalCellCount ||
    before.nonEmptyBeadCount !== after.nonEmptyBeadCount ||
    before.blankCount !== after.blankCount ||
    before.usedColorCount !== after.usedColorCount ||
    !countsEqual(beforeCounts, afterCounts)
  ) {
    throw new Error('图案翻转后的材料统计与原图不一致。');
  }

  return Object.freeze({ cells, before, after });
}

function countsEqual(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([colorId, count]) => right[colorId] === count)
  );
}
