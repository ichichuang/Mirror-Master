import {
  PIXELANIM_GRID_COLUMNS,
  PIXELANIM_GRID_ROWS,
  PIXELANIM_HORIZONTAL_BOUNDARY_COUNT,
  PIXELANIM_VERTICAL_BOUNDARY_COUNT,
} from '../grid-selection/constants';
import { clamp } from '../grid-selection/geometry';
import type { GridSelectionSource, NaturalImageSize } from '../grid-selection/types';
import {
  MIN_PRECISION_CELL_SIZE,
  PRECISION_MIN_AMBIGUITY_GAP,
  PRECISION_MIN_BOUNDARY_STRENGTH,
  PRECISION_MIN_CENTER_CONTRAST,
  PRECISION_MIN_OUTER_EDGE_SUPPORT,
  PRECISION_MIN_PERIODIC_CONSISTENCY,
  PRECISION_MIN_SCORE,
} from './constants';
import type {
  PixelGridCalibration,
  PixelGridCalibrationCandidate,
  PixelGridCandidateValidation,
  PixelGridEvidenceMetrics,
} from './types';

export interface PixelGridCandidateSeed {
  readonly source: GridSelectionSource;
  readonly naturalImage: NaturalImageSize;
  readonly left: number;
  readonly top: number;
  readonly cellSize: number;
  readonly evidence: PixelGridEvidenceMetrics;
  readonly ambiguityGap?: number;
}

export const EMPTY_PRECISION_EVIDENCE: PixelGridEvidenceMetrics = Object.freeze({
  boundaryStrength: 0,
  centerContrast: 0,
  periodicConsistency: 0,
  outerEdgeSupport: 0,
  score: 0,
  ambiguityGap: 0,
});

export function createPixelGridCalibrationCandidate(
  seed: PixelGridCandidateSeed,
): PixelGridCalibrationCandidate {
  const left = seed.left;
  const top = seed.top;
  const cellSize = seed.cellSize;
  const right = left + PIXELANIM_GRID_COLUMNS * cellSize;
  const bottom = top + PIXELANIM_GRID_ROWS * cellSize;
  const verticalBoundaries = createIntegerBoundaryArray(left, cellSize, PIXELANIM_GRID_COLUMNS);
  const horizontalBoundaries = createIntegerBoundaryArray(top, cellSize, PIXELANIM_GRID_ROWS);
  const evidence = Object.freeze({
    ...seed.evidence,
    ambiguityGap: seed.ambiguityGap ?? seed.evidence.ambiguityGap,
  });
  const validation = validatePixelGridCandidate({
    naturalImage: seed.naturalImage,
    left,
    top,
    right,
    bottom,
    cellSize,
    verticalBoundaries,
    horizontalBoundaries,
    evidence,
  });

  return Object.freeze({
    source: seed.source,
    naturalImage: Object.freeze({ ...seed.naturalImage }),
    left,
    top,
    right,
    bottom,
    cellSize,
    columns: PIXELANIM_GRID_COLUMNS,
    rows: PIXELANIM_GRID_ROWS,
    verticalBoundaries: Object.freeze([...verticalBoundaries]),
    horizontalBoundaries: Object.freeze([...horizontalBoundaries]),
    evidence,
    validation,
    processingReady: false,
  });
}

export function createPixelGridCalibration(
  candidate: PixelGridCalibrationCandidate,
): PixelGridCalibration | null {
  if (!candidate.validation.ok) {
    return null;
  }

  return Object.freeze({
    source: candidate.source,
    naturalImage: Object.freeze({ ...candidate.naturalImage }),
    left: candidate.left,
    top: candidate.top,
    right: candidate.right,
    bottom: candidate.bottom,
    cellSize: candidate.cellSize,
    columns: PIXELANIM_GRID_COLUMNS,
    rows: PIXELANIM_GRID_ROWS,
    verticalBoundaries: Object.freeze([...candidate.verticalBoundaries]),
    horizontalBoundaries: Object.freeze([...candidate.horizontalBoundaries]),
    evidence: Object.freeze({ ...candidate.evidence }),
    processingReady: true,
  });
}

export function createIntegerBoundaryArray(
  start: number,
  cellSize: number,
  segments: number,
): readonly number[] {
  const boundaries: number[] = [];

  for (let index = 0; index <= segments; index += 1) {
    boundaries.push(start + index * cellSize);
  }

  return boundaries;
}

export function clampPrecisionSeed(
  left: number,
  top: number,
  cellSize: number,
  naturalImage: NaturalImageSize,
): { readonly left: number; readonly top: number; readonly cellSize: number } {
  const safeCellSize = clamp(
    Math.round(cellSize),
    MIN_PRECISION_CELL_SIZE,
    Math.floor(
      Math.min(
        naturalImage.width / PIXELANIM_GRID_COLUMNS,
        naturalImage.height / PIXELANIM_GRID_ROWS,
      ),
    ),
  );
  const gridWidth = PIXELANIM_GRID_COLUMNS * safeCellSize;
  const gridHeight = PIXELANIM_GRID_ROWS * safeCellSize;

  return {
    left: clamp(Math.round(left), 0, naturalImage.width - gridWidth),
    top: clamp(Math.round(top), 0, naturalImage.height - gridHeight),
    cellSize: safeCellSize,
  };
}

function validatePixelGridCandidate(input: {
  readonly naturalImage: NaturalImageSize;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly cellSize: number;
  readonly verticalBoundaries: readonly number[];
  readonly horizontalBoundaries: readonly number[];
  readonly evidence: PixelGridEvidenceMetrics;
}): PixelGridCandidateValidation {
  if (
    !Number.isInteger(input.naturalImage.width) ||
    !Number.isInteger(input.naturalImage.height) ||
    !Number.isInteger(input.left) ||
    !Number.isInteger(input.top) ||
    !Number.isInteger(input.right) ||
    !Number.isInteger(input.bottom) ||
    !Number.isInteger(input.cellSize) ||
    input.verticalBoundaries.some((boundary) => !Number.isInteger(boundary)) ||
    input.horizontalBoundaries.some((boundary) => !Number.isInteger(boundary))
  ) {
    return {
      ok: false,
      reason: 'non-integer',
      message: '精确校准只接受自然像素中的整数坐标、整数边界和整数单元尺寸。',
    };
  }

  if (input.cellSize < MIN_PRECISION_CELL_SIZE) {
    return {
      ok: false,
      reason: 'non-positive-cell',
      message: `精确单元尺寸必须是至少 ${String(MIN_PRECISION_CELL_SIZE)} px 的正整数。`,
    };
  }

  if (
    input.right !== input.left + PIXELANIM_GRID_COLUMNS * input.cellSize ||
    input.bottom !== input.top + PIXELANIM_GRID_ROWS * input.cellSize
  ) {
    return {
      ok: false,
      reason: 'wrong-grid-size',
      message: '右边界和下边界必须由 34 × 单元尺寸、27 × 单元尺寸精确推出。',
    };
  }

  if (
    input.left < 0 ||
    input.top < 0 ||
    input.right > input.naturalImage.width ||
    input.bottom > input.naturalImage.height
  ) {
    return {
      ok: false,
      reason: 'out-of-bounds',
      message: '精确网格超出自然图片边界。',
    };
  }

  if (
    input.verticalBoundaries.length !== PIXELANIM_VERTICAL_BOUNDARY_COUNT ||
    input.horizontalBoundaries.length !== PIXELANIM_HORIZONTAL_BOUNDARY_COUNT
  ) {
    return {
      ok: false,
      reason: 'invalid-boundaries',
      message: '边界数量必须固定为 35 条垂直线和 28 条水平线。',
    };
  }

  if (
    !hasExactSpacing(input.verticalBoundaries, input.cellSize) ||
    !hasExactSpacing(input.horizontalBoundaries, input.cellSize) ||
    input.verticalBoundaries[0] !== input.left ||
    input.horizontalBoundaries[0] !== input.top ||
    input.verticalBoundaries[input.verticalBoundaries.length - 1] !== input.right ||
    input.horizontalBoundaries[input.horizontalBoundaries.length - 1] !== input.bottom
  ) {
    return {
      ok: false,
      reason: 'invalid-boundaries',
      message: '边界数组必须单调、位于图片内，并以单元尺寸精确等距排列。',
    };
  }

  if (
    input.evidence.score < PRECISION_MIN_SCORE ||
    input.evidence.boundaryStrength < PRECISION_MIN_BOUNDARY_STRENGTH ||
    input.evidence.centerContrast < PRECISION_MIN_CENTER_CONTRAST
  ) {
    return {
      ok: false,
      reason: 'weak-evidence',
      message: '边界证据或边界相对单元中心的对比不足。',
    };
  }

  if (
    input.evidence.periodicConsistency < PRECISION_MIN_PERIODIC_CONSISTENCY ||
    input.evidence.outerEdgeSupport < PRECISION_MIN_OUTER_EDGE_SUPPORT
  ) {
    return {
      ok: false,
      reason: 'non-integer-scale',
      message: '整数单元周期不稳定，可能是非整数缩放、缺线或图片不一致。',
    };
  }

  if (input.evidence.ambiguityGap < PRECISION_MIN_AMBIGUITY_GAP) {
    return {
      ok: false,
      reason: 'ambiguous-candidate',
      message: '最佳整数候选和邻近候选差距过小，需要重新粗校正或换图。',
    };
  }

  return {
    ok: true,
    message: '精确整数像素校准有效；仍需点击确认才会进入 processingReady。',
  };
}

function hasExactSpacing(boundaries: readonly number[], cellSize: number): boolean {
  let previous = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < boundaries.length; index += 1) {
    const boundary = boundaries[index];

    if (boundary === undefined || boundary <= previous) {
      return false;
    }

    if (index > 0 && boundary - previous !== cellSize) {
      return false;
    }

    previous = boundary;
  }

  return true;
}
