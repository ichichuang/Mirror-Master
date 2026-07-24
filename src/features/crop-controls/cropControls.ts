export interface CropPercent {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type CropArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

export interface CropKeyboardOptions {
  readonly resize?: boolean;
  readonly shiftKey?: boolean;
  readonly minimumSize?: number;
}

export function normalizeCropPercent(crop: CropPercent, minimumSize = 8): CropPercent {
  const minimum = clamp(finiteOr(minimumSize, 8), 0.1, 100);
  const width = clamp(finiteOr(crop.width, 100), minimum, 100);
  const height = clamp(finiteOr(crop.height, 100), minimum, 100);
  const x = clamp(finiteOr(crop.x, 0), 0, 100 - width);
  const y = clamp(finiteOr(crop.y, 0), 0, 100 - height);
  return Object.freeze({ x, y, width, height });
}

export function applyCropKeyboardStep(
  crop: CropPercent,
  key: CropArrowKey,
  options: CropKeyboardOptions = {},
): CropPercent {
  const minimumSize = options.minimumSize ?? 8;
  const normalized = normalizeCropPercent(crop, minimumSize);
  const step = options.shiftKey ? 5 : 1;

  if (options.resize) {
    const width =
      key === 'ArrowLeft'
        ? Math.max(minimumSize, normalized.width - step)
        : key === 'ArrowRight'
          ? Math.min(100 - normalized.x, normalized.width + step)
          : normalized.width;
    const height =
      key === 'ArrowUp'
        ? Math.max(minimumSize, normalized.height - step)
        : key === 'ArrowDown'
          ? Math.min(100 - normalized.y, normalized.height + step)
          : normalized.height;
    return normalizeCropPercent({ ...normalized, width, height }, minimumSize);
  }

  const x =
    key === 'ArrowLeft'
      ? normalized.x - step
      : key === 'ArrowRight'
        ? normalized.x + step
        : normalized.x;
  const y =
    key === 'ArrowUp'
      ? normalized.y - step
      : key === 'ArrowDown'
        ? normalized.y + step
        : normalized.y;
  return normalizeCropPercent({ ...normalized, x, y }, minimumSize);
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
