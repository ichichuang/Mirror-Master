import {
  classifyModeRecommendationMime,
  createRgbaModeScanner,
  type ModeRecommendationMimePolicy,
  type NewPatternMode,
} from './modeRecommendation';

export interface DecodedImageRecommendationInput {
  readonly mimeType: string;
  readonly image: HTMLImageElement;
  readonly sourceToken: number;
}

export type ImageRecommendationBasis = ModeRecommendationMimePolicy | 'analysisUnavailable';

export interface ImageRecommendationResult {
  readonly sourceToken: number;
  readonly recommendation: NewPatternMode;
  readonly basis: ImageRecommendationBasis;
  readonly reason: string;
}

export interface ImageRecommendationImageData {
  readonly data: Uint8ClampedArray;
}

export type ImageRecommendationCanvasContextSettings = CanvasRenderingContext2DSettings;

export interface ImageRecommendationCanvasContext {
  clearRect(sourceX: number, sourceY: number, sourceWidth: number, sourceHeight: number): void;
  drawImage(
    image: HTMLImageElement,
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
    destinationX: number,
    destinationY: number,
    destinationWidth: number,
    destinationHeight: number,
  ): void;
  getImageData(
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
  ): ImageRecommendationImageData;
}

export interface ImageRecommendationCanvas {
  width: number;
  height: number;
  getContext(
    contextId: '2d',
    settings?: ImageRecommendationCanvasContextSettings,
  ): ImageRecommendationCanvasContext | null;
}

export interface ImageRecommendationCanvasFactory {
  createCanvas(): ImageRecommendationCanvas;
}

export interface ImageRecommendationDocument {
  createElement(tagName: 'canvas'): ImageRecommendationCanvas;
}

export interface ImageRecommendationScheduler {
  yield(): Promise<void>;
}

export interface ImageRecommendationOptions {
  readonly maximumDecodedPixels: number;
  readonly tileSize?: number;
  readonly tilesPerYield?: number;
  readonly signal?: AbortSignal;
  readonly canvasFactory?: ImageRecommendationCanvasFactory;
  readonly scheduler?: ImageRecommendationScheduler;
}

export class ImageRecommendationCancelledError extends Error {
  readonly sourceToken: number;

  constructor(sourceToken: number) {
    super('图片分析已取消。');
    this.name = 'AbortError';
    this.sourceToken = sourceToken;
  }
}

const DEFAULT_TILE_SIZE = 128;
const MAX_TILE_SIZE = 128;
const DEFAULT_TILES_PER_YIELD = 8;

const BROWSER_DOCUMENT_ADAPTER: ImageRecommendationDocument = Object.freeze({
  createElement(): ImageRecommendationCanvas {
    const canvas = document.createElement('canvas');
    return {
      get width() {
        return canvas.width;
      },
      set width(value: number) {
        canvas.width = value;
      },
      get height() {
        return canvas.height;
      },
      set height(value: number) {
        canvas.height = value;
      },
      getContext(contextId, settings) {
        return canvas.getContext(contextId, settings);
      },
    };
  },
});

const DEFAULT_SCHEDULER: ImageRecommendationScheduler = Object.freeze({
  async yield(): Promise<void> {
    const scheduler = (
      globalThis as unknown as {
        readonly scheduler?: { readonly yield?: () => Promise<void> };
      }
    ).scheduler;
    if (scheduler?.yield) {
      await scheduler.yield();
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  },
});

export function createDetachedImageRecommendationCanvasFactory(
  documentRoot: ImageRecommendationDocument = BROWSER_DOCUMENT_ADAPTER,
): ImageRecommendationCanvasFactory {
  return Object.freeze({
    createCanvas: () => documentRoot.createElement('canvas'),
  });
}

export async function recommendDecodedImageMode(
  input: DecodedImageRecommendationInput,
  options: ImageRecommendationOptions,
): Promise<ImageRecommendationResult> {
  assertSourceToken(input.sourceToken);
  throwIfCancelled(options.signal, input.sourceToken);
  const dimensions = validatedDimensions(input.image, options.maximumDecodedPixels);
  const size = tileSize(options);
  const yieldInterval = tilesPerYield(options);
  const mimePolicy = classifyModeRecommendationMime(input.mimeType);

  if (mimePolicy === 'jpeg') {
    return recommendationResult(input.sourceToken, 'photo', 'jpeg');
  }
  if (mimePolicy === 'unsupportedFormat') {
    return recommendationResult(input.sourceToken, 'photo', 'unsupportedFormat');
  }

  const canvasFactory = options.canvasFactory ?? createDetachedImageRecommendationCanvasFactory();
  const scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
  let canvas: ImageRecommendationCanvas;
  let context: ImageRecommendationCanvasContext | null;
  try {
    canvas = canvasFactory.createCanvas();
    canvas.width = Math.min(size, dimensions.width);
    canvas.height = Math.min(size, dimensions.height);
    context = canvas.getContext('2d', { willReadFrequently: true });
  } catch {
    throwIfCancelled(options.signal, input.sourceToken);
    return recommendationResult(input.sourceToken, 'photo', 'analysisUnavailable');
  }
  if (!context) {
    return recommendationResult(input.sourceToken, 'photo', 'analysisUnavailable');
  }

  const scanner = createRgbaModeScanner();
  const totalPixels = dimensions.width * dimensions.height;
  let processedPixels = 0;
  let processedTiles = 0;

  for (let top = 0; top < dimensions.height; top += size) {
    const currentTileHeight = Math.min(size, dimensions.height - top);
    for (let left = 0; left < dimensions.width; left += size) {
      throwIfCancelled(options.signal, input.sourceToken);
      const currentTileWidth = Math.min(size, dimensions.width - left);
      let scanProgress: ReturnType<typeof scanner.scan>;
      try {
        context.clearRect(0, 0, currentTileWidth, currentTileHeight);
        context.drawImage(
          input.image,
          left,
          top,
          currentTileWidth,
          currentTileHeight,
          0,
          0,
          currentTileWidth,
          currentTileHeight,
        );
        const data = context.getImageData(0, 0, currentTileWidth, currentTileHeight).data;
        if (data.length !== currentTileWidth * currentTileHeight * 4) {
          throw new Error('图片像素数据不完整。');
        }
        scanProgress = scanner.scan(data);
      } catch {
        throwIfCancelled(options.signal, input.sourceToken);
        return recommendationResult(input.sourceToken, 'photo', 'analysisUnavailable');
      }
      if (scanProgress === 'photo') {
        return recommendationResult(input.sourceToken, 'photo', 'rgbaColorCount');
      }

      processedTiles += 1;
      processedPixels += currentTileWidth * currentTileHeight;
      if (processedPixels < totalPixels && processedTiles % yieldInterval === 0) {
        await scheduler.yield();
        throwIfCancelled(options.signal, input.sourceToken);
      }
    }
  }

  return recommendationResult(input.sourceToken, scanner.finish(), 'rgbaColorCount');
}

function validatedDimensions(
  image: HTMLImageElement,
  maximumDecodedPixels: number,
): { readonly width: number; readonly height: number } {
  if (!Number.isSafeInteger(maximumDecodedPixels) || maximumDecodedPixels < 1) {
    throw new Error('图片像素上限必须是正整数。');
  }
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error('图片尺寸无效。');
  }
  const pixelCount = width * height;
  if (!Number.isSafeInteger(pixelCount) || pixelCount > maximumDecodedPixels) {
    throw new Error(
      `图片解码后共有 ${String(pixelCount)} 像素，超过 ${String(maximumDecodedPixels)} 像素上限。`,
    );
  }
  return Object.freeze({ width, height });
}

function tileSize(options: ImageRecommendationOptions): number {
  const size = options.tileSize ?? DEFAULT_TILE_SIZE;
  if (!Number.isInteger(size) || size < 1 || size > MAX_TILE_SIZE) {
    throw new Error(`图片分析分块必须是 1 到 ${String(MAX_TILE_SIZE)} 的整数。`);
  }
  return size;
}

function tilesPerYield(options: ImageRecommendationOptions): number {
  const value = options.tilesPerYield ?? DEFAULT_TILES_PER_YIELD;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('图片分析让出间隔必须是正整数。');
  }
  return value;
}

function assertSourceToken(sourceToken: number): void {
  if (!Number.isSafeInteger(sourceToken) || sourceToken < 0) {
    throw new Error('图片来源令牌必须是非负整数。');
  }
}

function throwIfCancelled(signal: AbortSignal | undefined, sourceToken: number): void {
  if (signal?.aborted) {
    throw new ImageRecommendationCancelledError(sourceToken);
  }
}

function recommendationResult(
  sourceToken: number,
  recommendation: NewPatternMode,
  basis: ImageRecommendationBasis,
): ImageRecommendationResult {
  if (recommendation === 'pixelArt') {
    return Object.freeze({
      sourceToken,
      recommendation,
      basis,
      reason: '已自动推荐：清晰像素。图片颜色较少：PNG 或 WebP 的非透明颜色不超过 256 种。',
    });
  }
  if (basis === 'rgbaColorCount') {
    return Object.freeze({
      sourceToken,
      recommendation,
      basis,
      reason: '已自动推荐：自然图片。图片颜色较多：非透明颜色超过 256 种，适合平滑取色。',
    });
  }
  if (basis === 'analysisUnavailable') {
    return Object.freeze({
      sourceToken,
      recommendation,
      basis,
      reason: '无法分析图片颜色，已自动推荐：自然图片；你仍可手动选择。',
    });
  }
  return Object.freeze({
    sourceToken,
    recommendation,
    basis,
    reason:
      basis === 'jpeg'
        ? '已自动推荐：自然图片。JPEG 使用自然图片处理。'
        : '已自动推荐：自然图片。此格式不使用像素颜色分析。',
  });
}
