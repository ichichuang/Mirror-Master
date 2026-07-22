import {
  GRID_CELL_SQUARE_TOLERANCE,
  MIN_GRID_SELECTION_HEIGHT,
  MIN_GRID_SELECTION_WIDTH,
  PIXELANIM_GRID_COLUMNS,
  PIXELANIM_GRID_RATIO,
  PIXELANIM_GRID_ROWS,
} from './constants';
import type {
  GridSelection,
  GridSelectionSource,
  GridSelectionValidation,
  NaturalBoundaryArrays,
  NaturalImageRect,
  NaturalImageSize,
} from './types';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

export function createNaturalRect(
  left: number,
  top: number,
  right: number,
  bottom: number,
): NaturalImageRect {
  const safeLeft = roundCoordinate(Math.min(left, right));
  const safeTop = roundCoordinate(Math.min(top, bottom));
  const safeRight = roundCoordinate(Math.max(left, right));
  const safeBottom = roundCoordinate(Math.max(top, bottom));

  return {
    x: safeLeft,
    y: safeTop,
    width: roundCoordinate(safeRight - safeLeft),
    height: roundCoordinate(safeBottom - safeTop),
    right: safeRight,
    bottom: safeBottom,
  };
}

export function createBoundaryArray(
  start: number,
  end: number,
  segments: number,
): readonly number[] {
  const boundaries: number[] = [];
  const step = (end - start) / segments;

  for (let index = 0; index <= segments; index += 1) {
    if (index === 0) {
      boundaries.push(roundCoordinate(start));
    } else if (index === segments) {
      boundaries.push(roundCoordinate(end));
    } else {
      boundaries.push(roundCoordinate(start + step * index));
    }
  }

  return boundaries;
}

export function isMonotonicInside(
  boundaries: readonly number[],
  min: number,
  max: number,
): boolean {
  let previous = Number.NEGATIVE_INFINITY;

  for (const boundary of boundaries) {
    if (boundary < min || boundary > max || boundary <= previous) {
      return false;
    }

    previous = boundary;
  }

  return true;
}

export function scoreNearRatio(value: number, target: number, tolerance: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return clamp(1 - Math.abs(value / target - 1) / tolerance, 0, 1);
}

export function deriveGridBoundaries(rectangle: NaturalImageRect): NaturalBoundaryArrays {
  return {
    vertical: createBoundaryArray(rectangle.x, rectangle.right, PIXELANIM_GRID_COLUMNS),
    horizontal: createBoundaryArray(rectangle.y, rectangle.bottom, PIXELANIM_GRID_ROWS),
  };
}

export function validateGridSelectionRect(
  rectangle: NaturalImageRect,
  naturalImage: NaturalImageSize,
): GridSelectionValidation {
  const cellSize = {
    width: rectangle.width / PIXELANIM_GRID_COLUMNS,
    height: rectangle.height / PIXELANIM_GRID_ROWS,
  };
  const cellRatio =
    cellSize.height > 0 ? cellSize.width / cellSize.height : Number.POSITIVE_INFINITY;
  const mismatchRatio = Number.isFinite(cellRatio)
    ? Math.abs(cellRatio - 1)
    : Number.POSITIVE_INFINITY;

  if (
    rectangle.x < 0 ||
    rectangle.y < 0 ||
    rectangle.right > naturalImage.width ||
    rectangle.bottom > naturalImage.height
  ) {
    return {
      ok: false,
      reason: 'outside-image',
      cellSize,
      mismatchRatio,
      message: '区域超出图片边界。',
    };
  }

  if (rectangle.width < MIN_GRID_SELECTION_WIDTH || rectangle.height < MIN_GRID_SELECTION_HEIGHT) {
    return {
      ok: false,
      reason: 'too-small',
      cellSize,
      mismatchRatio,
      message: `区域过小，至少需要 ${String(MIN_GRID_SELECTION_WIDTH)} × ${String(
        MIN_GRID_SELECTION_HEIGHT,
      )} 自然像素。`,
    };
  }

  if (mismatchRatio > GRID_CELL_SQUARE_TOLERANCE) {
    return {
      ok: false,
      reason: 'non-square-cells',
      cellSize,
      mismatchRatio,
      message: `34 × 27 单元不接近正方形，偏差 ${formatPercent(
        mismatchRatio,
      )}，需不超过 ${formatPercent(GRID_CELL_SQUARE_TOLERANCE)}。`,
    };
  }

  const boundaries = deriveGridBoundaries(rectangle);

  if (
    !isMonotonicInside(boundaries.vertical, 0, naturalImage.width) ||
    !isMonotonicInside(boundaries.horizontal, 0, naturalImage.height)
  ) {
    return {
      ok: false,
      reason: 'invalid-boundaries',
      cellSize,
      mismatchRatio,
      message: '边界数组无效，无法生成完整的 35 条垂直线和 28 条水平线。',
    };
  }

  return {
    ok: true,
    cellSize,
    mismatchRatio,
    message: `有效：单元近似正方形，偏差 ${formatPercent(
      mismatchRatio,
    )}，容差 ${formatPercent(GRID_CELL_SQUARE_TOLERANCE)}。`,
  };
}

export function createGridSelection(
  source: GridSelectionSource,
  naturalImage: NaturalImageSize,
  rectangle: NaturalImageRect,
): GridSelection | null {
  const validation = validateGridSelectionRect(rectangle, naturalImage);

  if (!validation.ok) {
    return null;
  }

  return {
    source,
    naturalImage,
    rectangle,
    boundaries: deriveGridBoundaries(rectangle),
    cellSize: validation.cellSize,
  };
}

export function clampRectInsideImage(
  rectangle: NaturalImageRect,
  naturalImage: NaturalImageSize,
): NaturalImageRect {
  const width = clamp(rectangle.width, MIN_GRID_SELECTION_WIDTH, naturalImage.width);
  const height = clamp(rectangle.height, MIN_GRID_SELECTION_HEIGHT, naturalImage.height);
  const centerX = clamp(
    rectangle.x + rectangle.width / 2,
    width / 2,
    naturalImage.width - width / 2,
  );
  const centerY = clamp(
    rectangle.y + rectangle.height / 2,
    height / 2,
    naturalImage.height - height / 2,
  );

  return createNaturalRect(
    centerX - width / 2,
    centerY - height / 2,
    centerX + width / 2,
    centerY + height / 2,
  );
}

export function translateRectInsideImage(
  rectangle: NaturalImageRect,
  deltaX: number,
  deltaY: number,
  naturalImage: NaturalImageSize,
): NaturalImageRect {
  const nextX = clamp(rectangle.x + deltaX, 0, naturalImage.width - rectangle.width);
  const nextY = clamp(rectangle.y + deltaY, 0, naturalImage.height - rectangle.height);

  return createNaturalRect(nextX, nextY, nextX + rectangle.width, nextY + rectangle.height);
}

export function correctRectToGridRatio(
  rectangle: NaturalImageRect,
  naturalImage: NaturalImageSize,
): NaturalImageRect | null {
  const centerX = rectangle.x + rectangle.width / 2;
  const centerY = rectangle.y + rectangle.height / 2;
  const maxWidthAroundCenter = 2 * Math.min(centerX, naturalImage.width - centerX);
  const maxHeightAroundCenter = 2 * Math.min(centerY, naturalImage.height - centerY);

  const candidates = [
    createExactRatioCandidate(rectangle.width, maxWidthAroundCenter, maxHeightAroundCenter),
    createExactRatioCandidate(
      rectangle.height * PIXELANIM_GRID_RATIO,
      maxWidthAroundCenter,
      maxHeightAroundCenter,
    ),
    createExactRatioCandidate(
      Math.min(maxWidthAroundCenter, maxHeightAroundCenter * PIXELANIM_GRID_RATIO),
      maxWidthAroundCenter,
      maxHeightAroundCenter,
    ),
  ].filter(
    (candidate): candidate is { readonly width: number; readonly height: number } =>
      candidate !== null,
  );

  const candidate = candidates[0];

  if (!candidate) {
    return null;
  }

  return createNaturalRect(
    centerX - candidate.width / 2,
    centerY - candidate.height / 2,
    centerX + candidate.width / 2,
    centerY + candidate.height / 2,
  );
}

function createExactRatioCandidate(
  preferredWidth: number,
  maxWidth: number,
  maxHeight: number,
): { readonly width: number; readonly height: number } | null {
  const width = clamp(preferredWidth, MIN_GRID_SELECTION_WIDTH, maxWidth);
  const height = width / PIXELANIM_GRID_RATIO;

  if (
    width < MIN_GRID_SELECTION_WIDTH ||
    height < MIN_GRID_SELECTION_HEIGHT ||
    width > maxWidth ||
    height > maxHeight
  ) {
    return null;
  }

  return {
    width,
    height,
  };
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100).toString()}%`;
}
