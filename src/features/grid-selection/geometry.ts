import {
  PIXELANIM_GRID_COLUMNS,
  PIXELANIM_GRID_ROWS,
} from './constants';
import type {
  IntegerGridSelection,
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

export function getMaximumCellSize(naturalImage: NaturalImageSize): number {
  return Math.floor(
    Math.min(
      naturalImage.width / PIXELANIM_GRID_COLUMNS,
      naturalImage.height / PIXELANIM_GRID_ROWS,
    ),
  );
}

export function createIntegerGridSelection(
  naturalImage: NaturalImageSize,
  left: number,
  top: number,
  cellSize: number,
): IntegerGridSelection | null {
  const maximumCellSize = getMaximumCellSize(naturalImage);

  if (
    !Number.isInteger(naturalImage.width) ||
    !Number.isInteger(naturalImage.height) ||
    naturalImage.width <= 0 ||
    naturalImage.height <= 0 ||
    maximumCellSize < 1
  ) {
    return null;
  }

  const safeCellSize = clamp(Math.round(cellSize), 1, maximumCellSize);
  const width = PIXELANIM_GRID_COLUMNS * safeCellSize;
  const height = PIXELANIM_GRID_ROWS * safeCellSize;
  const safeLeft = clamp(Math.round(left), 0, naturalImage.width - width);
  const safeTop = clamp(Math.round(top), 0, naturalImage.height - height);
  const right = safeLeft + width;
  const bottom = safeTop + height;

  const selection: IntegerGridSelection = {
    naturalImage: Object.freeze({
      width: naturalImage.width,
      height: naturalImage.height,
    }),
    left: safeLeft,
    top: safeTop,
    right,
    bottom,
    cellSize: safeCellSize,
    columns: PIXELANIM_GRID_COLUMNS,
    rows: PIXELANIM_GRID_ROWS,
    verticalBoundaries: Object.freeze(
      Array.from(
        { length: PIXELANIM_GRID_COLUMNS + 1 },
        (_, index) => safeLeft + index * safeCellSize,
      ),
    ),
    horizontalBoundaries: Object.freeze(
      Array.from(
        { length: PIXELANIM_GRID_ROWS + 1 },
        (_, index) => safeTop + index * safeCellSize,
      ),
    ),
  };

  return isValidIntegerGridSelection(selection) ? Object.freeze(selection) : null;
}

export function createIntegerSelectionFromRectangle(
  naturalImage: NaturalImageSize,
  rectangle: NaturalImageRect,
): IntegerGridSelection | null {
  const cellSize = Math.round(
    Math.min(
      rectangle.width / PIXELANIM_GRID_COLUMNS,
      rectangle.height / PIXELANIM_GRID_ROWS,
    ),
  );
  const width = PIXELANIM_GRID_COLUMNS * cellSize;
  const height = PIXELANIM_GRID_ROWS * cellSize;
  const centerX = rectangle.x + rectangle.width / 2;
  const centerY = rectangle.y + rectangle.height / 2;

  return createIntegerGridSelection(
    naturalImage,
    centerX - width / 2,
    centerY - height / 2,
    cellSize,
  );
}

export function translateIntegerGridSelection(
  selection: IntegerGridSelection,
  deltaX: number,
  deltaY: number,
): IntegerGridSelection {
  return (
    createIntegerGridSelection(
      selection.naturalImage,
      selection.left + deltaX,
      selection.top + deltaY,
      selection.cellSize,
    ) ?? selection
  );
}

export function isValidIntegerGridSelection(selection: IntegerGridSelection): boolean {
  const {
    naturalImage,
    left,
    top,
    right,
    bottom,
    cellSize,
    columns,
    rows,
    verticalBoundaries,
    horizontalBoundaries,
  } = selection;

  if (
    !allIntegers([
      naturalImage.width,
      naturalImage.height,
      left,
      top,
      right,
      bottom,
      cellSize,
      ...verticalBoundaries,
      ...horizontalBoundaries,
    ]) ||
    naturalImage.width <= 0 ||
    naturalImage.height <= 0 ||
    cellSize <= 0
  ) {
    return false;
  }

  if (
    columns !== PIXELANIM_GRID_COLUMNS ||
    rows !== PIXELANIM_GRID_ROWS ||
    right !== left + PIXELANIM_GRID_COLUMNS * cellSize ||
    bottom !== top + PIXELANIM_GRID_ROWS * cellSize ||
    verticalBoundaries.length !== PIXELANIM_GRID_COLUMNS + 1 ||
    horizontalBoundaries.length !== PIXELANIM_GRID_ROWS + 1
  ) {
    return false;
  }

  if (
    left < 0 ||
    top < 0 ||
    right > naturalImage.width ||
    bottom > naturalImage.height
  ) {
    return false;
  }

  return (
    hasExactSpacing(verticalBoundaries, left, right, cellSize) &&
    hasExactSpacing(horizontalBoundaries, top, bottom, cellSize)
  );
}

function hasExactSpacing(
  boundaries: readonly number[],
  expectedStart: number,
  expectedEnd: number,
  cellSize: number,
): boolean {
  if (boundaries[0] !== expectedStart || boundaries[boundaries.length - 1] !== expectedEnd) {
    return false;
  }

  for (let index = 1; index < boundaries.length; index += 1) {
    const previous = boundaries[index - 1];
    const current = boundaries[index];

    if (previous === undefined || current === undefined || current - previous !== cellSize) {
      return false;
    }
  }

  return true;
}

function allIntegers(values: readonly number[]): boolean {
  return values.every((value) => Number.isInteger(value));
}
