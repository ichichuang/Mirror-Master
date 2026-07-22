import type { NaturalImageRect } from './types';

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
