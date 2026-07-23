import type { NaturalImageRect, NaturalImageSize } from './types';

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

  if (safeRight - safeLeft < MIN_SEARCH_RECT_SIZE || safeBottom - safeTop < MIN_SEARCH_RECT_SIZE) {
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

export function createFullImageSearchRect(naturalImage: NaturalImageSize): NaturalImageRect {
  const rectangle = createNaturalRect(naturalImage, 0, 0, naturalImage.width, naturalImage.height);

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
  const left = clamp(Math.round(rectangle.x + deltaX), 0, naturalImage.width - rectangle.width);
  const top = clamp(Math.round(rectangle.y + deltaY), 0, naturalImage.height - rectangle.height);

  return (
    createNaturalRect(naturalImage, left, top, left + rectangle.width, top + rectangle.height) ??
    rectangle
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
