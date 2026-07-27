import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDetachedImageRecommendationCanvasFactory,
  ImageRecommendationCancelledError,
  recommendDecodedImageMode,
  type ImageRecommendationCanvas,
  type ImageRecommendationCanvasContextSettings,
  type ImageRecommendationCanvasFactory,
  type ImageRecommendationDocument,
} from '../src/features/customer-flow/imageRecommendation';
import {
  classifyModeRecommendationMime,
  recommendProjectMode,
} from '../src/features/customer-flow/modeRecommendation';

interface TileRead {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface CanvasHarness {
  readonly canvas: ImageRecommendationCanvas;
  readonly factory: ImageRecommendationCanvasFactory;
  readonly reads: TileRead[];
  readonly clears: TileRead[];
  readonly contextRequests: {
    readonly contextId: string;
    readonly settings: ImageRecommendationCanvasContextSettings | undefined;
  }[];
  readonly sizeWrites: { readonly dimension: 'width' | 'height'; readonly value: number }[];
  readonly createCount: () => number;
}

function image(width: number, height: number): HTMLImageElement {
  return { naturalWidth: width, naturalHeight: height } as HTMLImageElement;
}

function canvasHarness(readTile: (tile: TileRead) => Uint8ClampedArray): CanvasHarness {
  const reads: TileRead[] = [];
  const clears: TileRead[] = [];
  const contextRequests: CanvasHarness['contextRequests'] = [];
  const sizeWrites: CanvasHarness['sizeWrites'] = [];
  let pendingTile: TileRead | null = null;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let createCount = 0;
  const canvas: ImageRecommendationCanvas = {
    get width() {
      return canvasWidth;
    },
    set width(value: number) {
      canvasWidth = value;
      sizeWrites.push({ dimension: 'width', value });
    },
    get height() {
      return canvasHeight;
    },
    set height(value: number) {
      canvasHeight = value;
      sizeWrites.push({ dimension: 'height', value });
    },
    getContext(contextId, settings) {
      contextRequests.push({ contextId, settings });
      return {
        clearRect(x, y, width, height) {
          clears.push({ x, y, width, height });
        },
        drawImage(_image, sourceX, sourceY, sourceWidth, sourceHeight) {
          pendingTile = {
            x: sourceX,
            y: sourceY,
            width: sourceWidth,
            height: sourceHeight,
          };
        },
        getImageData(_x, _y, width, height) {
          assert.ok(pendingTile, 'a tile must be drawn before it is read');
          assert.equal(width, pendingTile.width);
          assert.equal(height, pendingTile.height);
          reads.push(pendingTile);
          return { data: readTile(pendingTile) };
        },
      };
    },
  };
  return {
    canvas,
    factory: {
      createCanvas() {
        createCount += 1;
        return canvas;
      },
    },
    reads,
    clears,
    contextRequests,
    sizeWrites,
    createCount: () => createCount,
  };
}

function repeatedPixels(width: number, height: number, rgba: readonly number[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data.set(rgba, index);
  }
  return data;
}

test('detached browser canvas factory creates a real canvas element boundary', () => {
  const harness = canvasHarness((tile) => repeatedPixels(tile.width, tile.height, [1, 2, 3, 255]));
  const createdTags: string[] = [];
  const documentRoot: ImageRecommendationDocument = {
    createElement(tagName) {
      createdTags.push(tagName);
      return harness.canvas;
    },
  };

  const factory = createDetachedImageRecommendationCanvasFactory(documentRoot);

  assert.strictEqual(factory.createCanvas(), harness.canvas);
  assert.deepEqual(createdTags, ['canvas']);
});

test('sync and decoded-image recommendations share one normalized MIME policy', async () => {
  const cases = [
    {
      mimeType: ' IMAGE/JPEG ',
      policy: 'jpeg',
      recommendation: 'photo',
      basis: 'jpeg',
      canvasReads: 0,
    },
    {
      mimeType: 'image/png',
      policy: 'rgbaColorCount',
      recommendation: 'pixelArt',
      basis: 'rgbaColorCount',
      canvasReads: 1,
    },
    {
      mimeType: ' IMAGE/WEBP ',
      policy: 'rgbaColorCount',
      recommendation: 'pixelArt',
      basis: 'rgbaColorCount',
      canvasReads: 1,
    },
    {
      mimeType: 'image/gif',
      policy: 'unsupportedFormat',
      recommendation: 'photo',
      basis: 'unsupportedFormat',
      canvasReads: 0,
    },
  ] as const;

  for (const [index, fixture] of cases.entries()) {
    const harness = canvasHarness((tile) =>
      repeatedPixels(tile.width, tile.height, [1, 2, 3, 255]),
    );

    const decoded = await recommendDecodedImageMode(
      {
        mimeType: fixture.mimeType,
        image: image(1, 1),
        sourceToken: 100 + index,
      },
      {
        maximumDecodedPixels: 25_000_000,
        canvasFactory: harness.factory,
      },
    );

    assert.equal(classifyModeRecommendationMime(fixture.mimeType), fixture.policy);
    assert.equal(recommendProjectMode(fixture.mimeType, [[1, 2, 3, 255]]), fixture.recommendation);
    assert.equal(decoded.recommendation, fixture.recommendation);
    assert.equal(decoded.basis, fixture.basis);
    assert.equal(harness.reads.length, fixture.canvasReads);
  }
});

test('JPEG recommendation performs zero canvas reads', async () => {
  const harness = canvasHarness(() => {
    throw new Error('JPEG must not read canvas tiles');
  });

  const result = await recommendDecodedImageMode(
    { mimeType: 'image/jpeg', image: image(200, 100), sourceToken: 1 },
    {
      maximumDecodedPixels: 25_000_000,
      canvasFactory: harness.factory,
    },
  );

  assert.equal(result.recommendation, 'photo');
  assert.equal(result.sourceToken, 1);
  assert.equal(result.basis, 'jpeg');
  assert.equal(harness.createCount(), 0);
  assert.equal(harness.reads.length, 0);
});

test('PNG recommendation reads bounded tiles through a read-optimized 2D context', async () => {
  const harness = canvasHarness((tile) => repeatedPixels(tile.width, tile.height, [1, 2, 3, 255]));
  let yieldCount = 0;

  const result = await recommendDecodedImageMode(
    { mimeType: 'image/png', image: image(130, 65), sourceToken: 2 },
    {
      maximumDecodedPixels: 25_000_000,
      tileSize: 64,
      tilesPerYield: 2,
      canvasFactory: harness.factory,
      scheduler: {
        async yield() {
          yieldCount += 1;
        },
      },
    },
  );

  assert.equal(result.recommendation, 'pixelArt');
  assert.equal(result.basis, 'rgbaColorCount');
  assert.deepEqual(harness.reads, [
    { x: 0, y: 0, width: 64, height: 64 },
    { x: 64, y: 0, width: 64, height: 64 },
    { x: 128, y: 0, width: 2, height: 64 },
    { x: 0, y: 64, width: 64, height: 1 },
    { x: 64, y: 64, width: 64, height: 1 },
    { x: 128, y: 64, width: 2, height: 1 },
  ]);
  assert.deepEqual(harness.contextRequests, [
    { contextId: '2d', settings: { willReadFrequently: true } },
  ]);
  assert.deepEqual(harness.sizeWrites, [
    { dimension: 'width', value: 64 },
    { dimension: 'height', value: 64 },
  ]);
  assert.equal(harness.clears.length, harness.reads.length);
  assert.equal(yieldCount, 2);
  assert.match(result.reason, /颜色较少/u);
  assert.doesNotMatch(result.reason, /边缘/u);
});

test('PNG tile iteration stops after the 257th unique non-transparent RGBA color', async () => {
  let tileCount = 0;
  const harness = canvasHarness((tile) => {
    tileCount += 1;
    if (tileCount > 1) {
      throw new Error('the image reader must not request a second tile after color 257');
    }
    const data = new Uint8ClampedArray(tile.width * tile.height * 4);
    for (let pixel = 0; pixel < tile.width * tile.height; pixel += 1) {
      data.set([pixel % 256, Math.floor(pixel / 256), 0, 255], pixel * 4);
    }
    return data;
  });

  const result = await recommendDecodedImageMode(
    { mimeType: 'image/webp', image: image(40, 20), sourceToken: 3 },
    {
      maximumDecodedPixels: 25_000_000,
      tileSize: 20,
      canvasFactory: harness.factory,
      scheduler: {
        async yield() {
          throw new Error('threshold completion must not yield');
        },
      },
    },
  );

  assert.equal(result.recommendation, 'photo');
  assert.equal(result.basis, 'rgbaColorCount');
  assert.equal(harness.reads.length, 1);
  assert.match(result.reason, /颜色较多/u);
});

test('decoded-pixel limit is validated before canvas allocation', async () => {
  const harness = canvasHarness(() => {
    throw new Error('oversized images must not read canvas tiles');
  });

  await assert.rejects(
    recommendDecodedImageMode(
      { mimeType: 'image/png', image: image(501, 500), sourceToken: 4 },
      {
        maximumDecodedPixels: 250_000,
        canvasFactory: harness.factory,
      },
    ),
    /超过 250000 像素上限/u,
  );
  assert.equal(harness.createCount(), 0);
});

test('cancellation after a scheduled yield propagates without a fallback recommendation', async () => {
  const controller = new AbortController();
  const harness = canvasHarness((tile) => repeatedPixels(tile.width, tile.height, [1, 2, 3, 255]));

  await assert.rejects(
    recommendDecodedImageMode(
      { mimeType: 'image/png', image: image(130, 65), sourceToken: 41 },
      {
        maximumDecodedPixels: 25_000_000,
        tileSize: 64,
        tilesPerYield: 1,
        signal: controller.signal,
        canvasFactory: harness.factory,
        scheduler: {
          async yield() {
            controller.abort();
          },
        },
      },
    ),
    (error: unknown) =>
      error instanceof ImageRecommendationCancelledError &&
      error.name === 'AbortError' &&
      error.sourceToken === 41,
  );
  assert.equal(harness.reads.length, 1);
});

test('canvas failures safely fall back to photo while preserving the source token', async () => {
  const factory: ImageRecommendationCanvasFactory = {
    createCanvas() {
      throw new Error('canvas unavailable');
    },
  };

  const result = await recommendDecodedImageMode(
    { mimeType: 'image/png', image: image(20, 20), sourceToken: 5 },
    {
      maximumDecodedPixels: 25_000_000,
      canvasFactory: factory,
    },
  );

  assert.deepEqual(result, {
    sourceToken: 5,
    recommendation: 'photo',
    basis: 'analysisUnavailable',
    reason: '无法分析图片颜色，已自动推荐：自然图片；你仍可手动选择。',
  });
});
