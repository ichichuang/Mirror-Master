import type {
  IntegerGridSelection,
  NaturalImageRect,
  NaturalImageSize,
} from './types';

export type GridAlignment = 'start' | 'center' | 'end';

export interface GridFitOptions {
  readonly preferredCellSize?: number;
  readonly columns?: number;
  readonly rows?: number;
  readonly horizontalAlignment?: GridAlignment;
  readonly verticalAlignment?: GridAlignment;
}

const DEFAULT_SHORT_AXIS_CELLS = 12;

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

export function createIntegerGridSelection(
  naturalImage: NaturalImageSize,
  left: number,
  top: number,
  columns: number,
  rows: number,
  cellSize: number,
): IntegerGridSelection | null {
  if (
    !isValidNaturalImage(naturalImage) ||
    !Number.isFinite(left) ||
    !Number.isFinite(top) ||
    !Number.isFinite(columns) ||
    !Number.isFinite(rows) ||
    !Number.isFinite(cellSize)
  ) {
    return null;
  }

  const safeColumns = Math.max(1, Math.round(columns));
  const safeRows = Math.max(1, Math.round(rows));
  const maximumCellSize = Math.floor(
    Math.min(naturalImage.width / safeColumns, naturalImage.height / safeRows),
  );

  if (maximumCellSize < 1) {
    return null;
  }

  const safeCellSize = clamp(Math.round(cellSize), 1, maximumCellSize);
  const width = safeColumns * safeCellSize;
  const height = safeRows * safeCellSize;
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
    columns: safeColumns,
    rows: safeRows,
    verticalBoundaries: Object.freeze(
      Array.from(
        { length: safeColumns + 1 },
        (_, index) => safeLeft + index * safeCellSize,
      ),
    ),
    horizontalBoundaries: Object.freeze(
      Array.from(
        { length: safeRows + 1 },
        (_, index) => safeTop + index * safeCellSize,
      ),
    ),
  };

  return isValidIntegerGridSelection(selection) ? Object.freeze(selection) : null;
}

export function createIntegerSelectionFromRectangle(
  naturalImage: NaturalImageSize,
  rectangle: NaturalImageRect,
  options: GridFitOptions = {},
): IntegerGridSelection | null {
  if (!isValidNaturalImage(naturalImage)) {
    return null;
  }

  const bounded = clampRectangleToImage(naturalImage, rectangle);
  const availableWidth = bounded.right - bounded.x;
  const availableHeight = bounded.bottom - bounded.y;

  if (availableWidth < 1 || availableHeight < 1) {
    return null;
  }

  const exactColumns = normalizeOptionalCount(options.columns);
  const exactRows = normalizeOptionalCount(options.rows);
  let columns: number;
  let rows: number;
  let cellSize: number;

  if (exactColumns !== null && exactRows !== null) {
    columns = exactColumns;
    rows = exactRows;
    cellSize = Math.floor(Math.min(availableWidth / columns, availableHeight / rows));
  } else {
    const defaultCellSize = Math.max(
      1,
      Math.round(Math.min(availableWidth, availableHeight) / DEFAULT_SHORT_AXIS_CELLS),
    );
    const preferredCellSize = clamp(
      Math.round(options.preferredCellSize ?? defaultCellSize),
      1,
      Math.floor(Math.min(availableWidth, availableHeight)),
    );
    columns = Math.max(1, Math.floor(availableWidth / preferredCellSize));
    rows = Math.max(1, Math.floor(availableHeight / preferredCellSize));
    cellSize = Math.floor(Math.min(availableWidth / columns, availableHeight / rows));
  }

  if (cellSize < 1) {
    return null;
  }

  const width = columns * cellSize;
  const height = rows * cellSize;
  const left = alignInside(
    bounded.x,
    bounded.right,
    width,
    options.horizontalAlignment ?? 'center',
  );
  const top = alignInside(
    bounded.y,
    bounded.bottom,
    height,
    options.verticalAlignment ?? 'center',
  );

  return createIntegerGridSelection(
    naturalImage,
    left,
    top,
    columns,
    rows,
    cellSize,
  );
}

export function cloneIntegerGridSelection(
  selection: IntegerGridSelection,
): IntegerGridSelection | null {
  return createIntegerGridSelection(
    selection.naturalImage,
    selection.left,
    selection.top,
    selection.columns,
    selection.rows,
    selection.cellSize,
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
      selection.columns,
      selection.rows,
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
    !isValidNaturalImage(naturalImage) ||
    !allIntegers([
      left,
      top,
      right,
      bottom,
      cellSize,
      columns,
      rows,
      ...verticalBoundaries,
      ...horizontalBoundaries,
    ]) ||
    cellSize <= 0 ||
    columns <= 0 ||
    rows <= 0
  ) {
    return false;
  }

  if (
    right !== left + columns * cellSize ||
    bottom !== top + rows * cellSize ||
    verticalBoundaries.length !== columns + 1 ||
    horizontalBoundaries.length !== rows + 1
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

function clampRectangleToImage(
  naturalImage: NaturalImageSize,
  rectangle: NaturalImageRect,
): NaturalImageRect {
  const left = clamp(Math.round(rectangle.x), 0, naturalImage.width);
  const top = clamp(Math.round(rectangle.y), 0, naturalImage.height);
  const right = clamp(Math.round(rectangle.right), left, naturalImage.width);
  const bottom = clamp(Math.round(rectangle.bottom), top, naturalImage.height);
  return createNaturalRect(left, top, right, bottom);
}

function alignInside(
  start: number,
  end: number,
  size: number,
  alignment: GridAlignment,
): number {
  if (alignment === 'start') {
    return start;
  }

  if (alignment === 'end') {
    return end - size;
  }

  return start + Math.floor((end - start - size) / 2);
}

function normalizeOptionalCount(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value) || value < 1) {
    return null;
  }

  return Math.round(value);
}

function isValidNaturalImage(naturalImage: NaturalImageSize): boolean {
  return (
    Number.isInteger(naturalImage.width) &&
    Number.isInteger(naturalImage.height) &&
    naturalImage.width > 0 &&
    naturalImage.height > 0
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
