export type PatternSizePreset = 29 | 48 | 72 | 'custom';
export type ColorCountPreset = 12 | 24 | 48 | 'custom';
export type BeadSizePreset = 5 | 2.6 | 'custom';
export type ProcessingPreset = 'easy' | 'gradient';

export interface PatternDimensions {
  readonly columns: number;
  readonly rows: number;
}

export interface BeadDimensions {
  readonly beadDiameterMm: number;
  readonly beadPitchMm: number;
}

export interface PhysicalDimensionsInput extends BeadDimensions {
  readonly rows: number;
  readonly columns: number;
}

const PATTERN_SIZE_PRESETS = [29, 48, 72] as const;
const COLOR_COUNT_PRESETS = [12, 24, 48] as const;

export function dimensionsForLongEdge(
  preset: Exclude<PatternSizePreset, 'custom'>,
  croppedColumns: number,
  croppedRows: number,
): PatternDimensions {
  if (!PATTERN_SIZE_PRESETS.includes(preset)) {
    throw new Error('图案大小预设必须是 29、48 或 72。');
  }
  assertPositiveCropDimensions(croppedColumns, croppedRows);

  if (croppedColumns >= croppedRows) {
    return Object.freeze({
      columns: preset,
      rows: proportionalEdge(preset, croppedRows, croppedColumns),
    });
  }
  return Object.freeze({
    columns: proportionalEdge(preset, croppedColumns, croppedRows),
    rows: preset,
  });
}

export function resolvePatternSizePreset(
  dimensions: PatternDimensions,
  croppedColumns: number,
  croppedRows: number,
): PatternSizePreset {
  assertGridDimensions(dimensions);
  for (const preset of PATTERN_SIZE_PRESETS) {
    const expected = dimensionsForLongEdge(preset, croppedColumns, croppedRows);
    if (expected.columns === dimensions.columns && expected.rows === dimensions.rows) {
      return preset;
    }
  }
  return 'custom';
}

export function beadDimensionsForPreset(
  preset: BeadSizePreset,
  customDimensions?: BeadDimensions,
): BeadDimensions {
  if (preset === 'custom') {
    if (!customDimensions) {
      throw new Error('自定义拼豆尺寸不能为空。');
    }
    assertCustomBeadDimensions(customDimensions);
    return Object.freeze({ ...customDimensions });
  }
  return Object.freeze({ beadDiameterMm: preset, beadPitchMm: preset });
}

export function resolveBeadSizePreset(dimensions: BeadDimensions): BeadSizePreset {
  if (dimensions.beadDiameterMm === 5 && dimensions.beadPitchMm === 5) {
    return 5;
  }
  if (dimensions.beadDiameterMm === 2.6 && dimensions.beadPitchMm === 2.6) {
    return 2.6;
  }
  return 'custom';
}

export function resolveColorLimit(
  requested: Exclude<ColorCountPreset, 'custom'>,
  availableColorCount: number,
): number {
  if (!COLOR_COUNT_PRESETS.includes(requested)) {
    throw new Error('颜色细节预设必须是 12、24 或 48。');
  }
  assertAvailableColorCount(availableColorCount);
  return Math.min(requested, availableColorCount);
}

export function resolveColorCountPreset(
  maximumColors: number | null,
  availableColorCount: number,
): ColorCountPreset {
  assertAvailableColorCount(availableColorCount);
  if (!Number.isInteger(maximumColors)) {
    return 'custom';
  }
  const matchingPresets = COLOR_COUNT_PRESETS.filter(
    (preset) => resolveColorLimit(preset, availableColorCount) === maximumColors,
  );
  return matchingPresets.length === 1 ? (matchingPresets[0] ?? 'custom') : 'custom';
}

export function processingSettingsForPreset(preset: ProcessingPreset): {
  readonly dithering: 'none' | 'floydSteinberg';
} {
  return Object.freeze({ dithering: preset === 'easy' ? 'none' : 'floydSteinberg' });
}

export function resolveProcessingPreset(dithering: 'none' | 'floydSteinberg'): ProcessingPreset {
  return dithering === 'none' ? 'easy' : 'gradient';
}

export function physicalDimensionsForGrid(input: PhysicalDimensionsInput): {
  readonly widthMm: number;
  readonly heightMm: number;
} {
  return Object.freeze({
    widthMm: normalizeMillimeters((input.columns - 1) * input.beadPitchMm + input.beadDiameterMm),
    heightMm: normalizeMillimeters((input.rows - 1) * input.beadPitchMm + input.beadDiameterMm),
  });
}

function proportionalEdge(
  longEdge: number,
  shortSourceEdge: number,
  longSourceEdge: number,
): number {
  return Math.max(1, Math.round((longEdge * shortSourceEdge) / longSourceEdge));
}

function assertPositiveCropDimensions(croppedColumns: number, croppedRows: number): void {
  if (
    !Number.isFinite(croppedColumns) ||
    !Number.isFinite(croppedRows) ||
    croppedColumns <= 0 ||
    croppedRows <= 0
  ) {
    throw new Error('裁剪尺寸必须为正数。');
  }
}

function assertGridDimensions(dimensions: PatternDimensions): void {
  if (
    !Number.isInteger(dimensions.columns) ||
    !Number.isInteger(dimensions.rows) ||
    dimensions.columns < 1 ||
    dimensions.columns > 300 ||
    dimensions.rows < 1 ||
    dimensions.rows > 300
  ) {
    throw new Error('图案行列必须在 1 到 300 之间。');
  }
}

function assertCustomBeadDimensions(dimensions: BeadDimensions): void {
  if (
    !Number.isFinite(dimensions.beadDiameterMm) ||
    !Number.isFinite(dimensions.beadPitchMm) ||
    dimensions.beadDiameterMm < 1 ||
    dimensions.beadDiameterMm > 10 ||
    dimensions.beadPitchMm < 1 ||
    dimensions.beadPitchMm > 12 ||
    dimensions.beadPitchMm < dimensions.beadDiameterMm
  ) {
    throw new Error('自定义拼豆尺寸无效。');
  }
}

function assertAvailableColorCount(availableColorCount: number): void {
  if (!Number.isInteger(availableColorCount) || availableColorCount < 1) {
    throw new Error('可用颜色数必须是正整数。');
  }
}

function normalizeMillimeters(value: number): number {
  return Number(value.toFixed(10));
}
