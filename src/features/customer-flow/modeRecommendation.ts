export type CustomerTask = 'newPattern' | 'mirrorExistingChart';
export type NewPatternMode = 'photo' | 'pixelArt';
export type ModePreference = 'auto' | NewPatternMode;
export type RgbaChunk = ArrayLike<number>;
export type RgbaScanProgress = 'continue' | 'photo';
export type ModeRecommendationMimePolicy = 'jpeg' | 'rgbaColorCount' | 'unsupportedFormat';

export interface RgbaModeScanner {
  readonly scan: (chunk: RgbaChunk) => RgbaScanProgress;
  readonly finish: () => NewPatternMode;
}

const MAX_PIXEL_ART_COLORS = 256;
const SUPPORTED_PIXEL_ART_MIME_TYPES = new Set(['image/png', 'image/webp']);

export function recommendProjectMode(
  mimeType: string,
  rgbaChunks: Iterable<RgbaChunk>,
): NewPatternMode {
  if (classifyModeRecommendationMime(mimeType) !== 'rgbaColorCount') {
    return 'photo';
  }

  const scanner = createRgbaModeScanner();
  for (const chunk of rgbaChunks) {
    if (scanner.scan(chunk) === 'photo') {
      return 'photo';
    }
  }

  return scanner.finish();
}

export function classifyModeRecommendationMime(mimeType: string): ModeRecommendationMimePolicy {
  const normalizedMimeType = mimeType.trim().toLowerCase();
  if (normalizedMimeType === 'image/jpeg') {
    return 'jpeg';
  }
  return SUPPORTED_PIXEL_ART_MIME_TYPES.has(normalizedMimeType)
    ? 'rgbaColorCount'
    : 'unsupportedFormat';
}

export function createRgbaModeScanner(): RgbaModeScanner {
  const colors = new Set<number>();
  let recommendation: NewPatternMode = 'pixelArt';

  return Object.freeze({
    scan(chunk: RgbaChunk): RgbaScanProgress {
      if (recommendation === 'photo') {
        return 'photo';
      }
      assertAlignedRgbaChunk(chunk);
      for (let index = 0; index < chunk.length; index += 4) {
        const red = byteAt(chunk, index);
        const green = byteAt(chunk, index + 1);
        const blue = byteAt(chunk, index + 2);
        const alpha = byteAt(chunk, index + 3);
        if (alpha === 0) {
          continue;
        }
        colors.add(rgbaColorKey(red, green, blue, alpha));
        if (colors.size > MAX_PIXEL_ART_COLORS) {
          recommendation = 'photo';
          return 'photo';
        }
      }
      return 'continue';
    },
    finish(): NewPatternMode {
      return recommendation;
    },
  });
}

export function resolveProjectMode(
  task: CustomerTask,
  preference: ModePreference,
  recommendation: NewPatternMode,
): NewPatternMode | 'existingChart' {
  if (task === 'mirrorExistingChart') {
    return 'existingChart';
  }
  return preference === 'auto' ? recommendation : preference;
}

function assertAlignedRgbaChunk(chunk: RgbaChunk): void {
  if (!Number.isSafeInteger(chunk.length) || chunk.length < 0 || chunk.length % 4 !== 0) {
    throw new Error('RGBA 数据块必须按四个通道对齐。');
  }
}

function byteAt(chunk: RgbaChunk, index: number): number {
  const value = chunk[index];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error('RGBA 数据必须是有限整数 byte。');
  }
  return value;
}

function rgbaColorKey(red: number, green: number, blue: number, alpha: number): number {
  return ((red * 256 + green) * 256 + blue) * 256 + alpha;
}
