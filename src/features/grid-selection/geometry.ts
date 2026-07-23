import type {
  GridBoundarySelection,
  NaturalImageRect,
  NaturalImageSize,
} from './types';

const MIN_SEARCH_RECT_SIZE = 8;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function createNaturalRect(
  naturalImage: NaturalImageSize,
  left: number,
  top: number,
  right: number,
  bottom: number,
): NaturalImageRect | null {
  if (!isValidNaturalImage(naturalImage)) {
    return null;
  }

  const safeLeft = clamp(Math.round(Math.min(left, right)), 0, naturalImage.width);
  const safeTop = clamp(Math.round(Math.min(top, bottom)), 0, naturalImage.height);
  const safeRight = clamp(Math.round(Math.max(left, right)), 0, naturalImage.width);
  const safeBottom = clamp(Math.round(Math.max(top, bottom)), 0, naturalImage.height);

  if (
    safeRight - safeLeft < MIN_SEARCH_RECT_SIZE ||
    safeBottom - safeTop < MIN_SEARCH_RECT_SIZE
  ) {
    return null;
  }

  return Object.freeze({
    x: safeLeft,
    y: safeTop,
    width: safeRight - safeLeft,
    height: safeBottom - safeTop,
    right: safeRight,
    bottom: safeBottom,
  });
}

export function createFullImageSearchRect(
  naturalImage: NaturalImageSize,
): NaturalImageRect {
  const rectangle = createNaturalRect(
    naturalImage,
    0,
    0,
    naturalImage.width,
    naturalImage.height,
  );

  if (!rectangle) {
    throw new Error('Cannot create a search rectangle for an invalid image.');
  }

  return rectangle;
}

export function translateNaturalRect(
  naturalImage: NaturalImageSize,
  rectangle: NaturalImageRect,
  deltaX: number,
  deltaY: number,
): NaturalImageRect {
  const left = clamp(
    Math.round(rectangle.x + deltaX),
    0,
    naturalImage.width - rectangle.width,
  );
  const top = clamp(
    Math.round(rectangle.y + deltaY),
    0,
    naturalImage.height - rectangle.height,
  );

  return (
    createNaturalRect(
      naturalImage,
      left,
      top,
      left + rectangle.width,
      top + rectangle.height,
    ) ?? rectangle
  );
}

export function createGridBoundarySelection(input: {
  readonly naturalImage: NaturalImageSize;
  readonly searchRect: NaturalImageRect;
  readonly cellSize: number;
  readonly xBoundaries: readonly number[];
  readonly yBoundaries: readonly number[];
}): GridBoundarySelection | null {
  const xBoundaries = Object.freeze([...input.xBoundaries]);
  const yBoundaries = Object.freeze([...input.yBoundaries]);
  const left = xBoundaries[0];
  const top = yBoundaries[0];
  const right = xBoundaries[xBoundaries.length - 1];
  const bottom = yBoundaries[yBoundaries.length - 1];

  if (
    left === undefined ||
    top === undefined ||
    right === undefined ||
    bottom === undefined
  ) {
    return null;
  }

  const selection: GridBoundarySelection = {
    naturalImage: Object.freeze({ ...input.naturalImage }),
    searchRect: Object.freeze({ ...input.searchRect }),
    left,
    top,
    right,
    bottom,
    cellSize: input.cellSize,
    columns: xBoundaries.length - 1,
    rows: yBoundaries.length - 1,
    xBoundaries,
    yBoundaries,
  };

  return isValidGridBoundarySelection(selection)
    ? Object.freeze(selection)
    : null;
}

export function isValidGridBoundarySelection(
  selection: GridBoundarySelection,
): boolean {
  const {
    naturalImage,
    searchRect,
    left,
    top,
    right,
    bottom,
    cellSize,
    columns,
    rows,
    xBoundaries,
    yBoundaries,
  } = selection;

  if (
    !isValidNaturalImage(naturalImage) ||
    !Number.isInteger(cellSize) ||
    cellSize <= 0 ||
    !Number.isInteger(columns) ||
    !Number.isInteger(rows) ||
    columns <= 0 ||
    rows <= 0 ||
    xBoundaries.length !== columns + 1 ||
    yBoundaries.length !== rows + 1 ||
    ![
      searchRect.x,
      searchRect.y,
      searchRect.width,
      searchRect.height,
      searchRect.right,
      searchRect.bottom,
    ].every(Number.isInteger) ||
    searchRect.width < MIN_SEARCH_RECT_SIZE ||
    searchRect.height < MIN_SEARCH_RECT_SIZE ||
    searchRect.right !== searchRect.x + searchRect.width ||
    searchRect.bottom !== searchRect.y + searchRect.height ||
    searchRect.x < 0 ||
    searchRect.y < 0 ||
    searchRect.right > naturalImage.width ||
    searchRect.bottom > naturalImage.height
  ) {
    return false;
  }

  if (
    left !== xBoundaries[0] ||
    right !== xBoundaries[xBoundaries.length - 1] ||
    top !== yBoundaries[0] ||
    bottom !== yBoundaries[yBoundaries.length - 1] ||
    left < 0 ||
    top < 0 ||
    right > naturalImage.width ||
    bottom > naturalImage.height
  ) {
    return false;
  }

  return (
    hasExactIntegerSpacing(xBoundaries, cellSize) &&
    hasExactIntegerSpacing(yBoundaries, cellSize)
  );
}

function isValidNaturalImage(naturalImage: NaturalImageSize): boolean {
  return (
    Number.isInteger(naturalImage.width) &&
    Number.isInteger(naturalImage.height) &&
    naturalImage.width > 0 &&
    naturalImage.height > 0
  );
}

function hasExactIntegerSpacing(
  boundaries: readonly number[],
  cellSize: number,
): boolean {
  if (boundaries.length < 2 || !boundaries.every(Number.isInteger)) {
    return false;
  }

  for (let index = 1; index < boundaries.length; index += 1) {
    const previous = boundaries[index - 1];
    const current = boundaries[index];

    if (
      previous === undefined ||
      current === undefined ||
      current <= previous ||
      current - previous !== cellSize
    ) {
      return false;
    }
  }

  return true;
}
