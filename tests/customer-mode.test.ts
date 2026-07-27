import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRgbaModeScanner,
  recommendProjectMode,
  resolveProjectMode,
} from '../src/features/customer-flow/modeRecommendation';

test('JPEG MIME normalizes case and recommends photo mode without reading RGBA chunks', () => {
  const chunks: Iterable<ArrayLike<number>> = {
    *[Symbol.iterator]() {
      throw new Error('JPEG inputs must not be scanned');
    },
  };

  assert.equal(recommendProjectMode('IMAGE/JPEG', chunks), 'photo');
});

test('unsupported MIME types fail safe to photo mode without reading RGBA chunks', () => {
  const chunks: Iterable<ArrayLike<number>> = {
    *[Symbol.iterator]() {
      throw new Error('unsupported inputs must not be scanned');
    },
  };

  assert.equal(recommendProjectMode('image/gif', chunks), 'photo');
});

test('PNG and WebP recommend pixel art when they contain at most 256 unique opaque RGBA colors', () => {
  const colors = Array.from({ length: 256 }, (_, index) => [index, 0, 0, 255]);

  assert.equal(recommendProjectMode('image/png', colors), 'pixelArt');
  assert.equal(recommendProjectMode('image/webp', colors), 'pixelArt');
});

test('RGBA scanning stops at the 257th opaque color and recommends photo mode', () => {
  let scannedChunks = 0;
  const chunks: Iterable<ArrayLike<number>> = {
    *[Symbol.iterator]() {
      for (let index = 0; index < 300; index += 1) {
        scannedChunks += 1;
        yield [index % 256, Math.floor(index / 256), 0, 255];
      }
    },
  };

  assert.equal(recommendProjectMode('image/png', chunks), 'photo');
  assert.equal(scannedChunks, 257);
});

test('fully transparent RGBA pixels do not contribute to the recommendation color count', () => {
  const transparentColors = Array.from({ length: 300 }, (_, index) => [
    index % 256,
    Math.floor(index / 256),
    0,
    0,
  ]);
  const chunks = [...transparentColors, [1, 2, 3, 255]];

  assert.equal(recommendProjectMode('image/png', chunks), 'pixelArt');
});

test('duplicate colors across chunks count once while every alpha value above zero counts', () => {
  const chunks = [
    [4, 5, 6, 1, 4, 5, 6, 1],
    [4, 5, 6, 1, 4, 5, 6, 255],
  ];

  assert.equal(recommendProjectMode('image/png', chunks), 'pixelArt');
});

test('RGBA recommendation preserves alpha as part of a unique color key', () => {
  const sharedRgbWithDifferentAlpha = [
    ...Array.from({ length: 256 }, (_, index) => [index, 0, 0, 255]),
    [0, 0, 0, 1],
  ];

  assert.equal(recommendProjectMode('image/webp', sharedRgbWithDifferentAlpha), 'photo');
});

test('RGBA chunks must contain aligned finite integer byte values', () => {
  for (const invalidChunk of [
    [1, 2, 3],
    [1, 2, 3, 256],
    [1, 2, Number.NaN, 255],
    [1, 2, 3, 1.5],
  ]) {
    assert.throws(() => recommendProjectMode('image/png', [invalidChunk]), /RGBA 数据/u);
  }
});

test('a packed RGBA chunk stops reading immediately at the 257th opaque color', () => {
  const packedChunk = new Proxy(
    { length: 1_200 },
    {
      get(_target, property) {
        if (property === 'length') {
          return 1_200;
        }
        const index = Number(property);
        if (!Number.isInteger(index)) {
          return undefined;
        }
        if (index >= 1_028) {
          throw new Error('scanner read beyond the 257th color');
        }
        const pixel = Math.floor(index / 4);
        return [pixel % 256, Math.floor(pixel / 256), 0, 255][index % 4];
      },
    },
  ) as unknown as ArrayLike<number>;

  assert.equal(recommendProjectMode('image/png', [packedChunk]), 'photo');
});

test('incremental RGBA scanner preserves unique colors across tiles and remains stopped', () => {
  const scanner = createRgbaModeScanner();
  const firstTile = Array.from({ length: 256 }, (_, index) => [index, 0, 0, 255]).flat();

  assert.equal(scanner.scan(firstTile), 'continue');
  assert.equal(scanner.finish(), 'pixelArt');
  assert.equal(scanner.scan([0, 0, 0, 1]), 'photo');

  const unreadableChunk = new Proxy(
    { length: 4 },
    {
      get(_target, property) {
        if (property === 'length') {
          throw new Error('a stopped scanner must not inspect another chunk');
        }
        return undefined;
      },
    },
  ) as unknown as ArrayLike<number>;

  assert.equal(scanner.scan(unreadableChunk), 'photo');
  assert.equal(scanner.finish(), 'photo');
});

test('auto preference resolves the recommendation without replacing the preference', () => {
  const preference = 'auto' as const;

  assert.equal(resolveProjectMode('newPattern', preference, 'pixelArt'), 'pixelArt');
  assert.equal(preference, 'auto');
});

test('explicit photo and pixel art preferences override the recommendation', () => {
  assert.equal(resolveProjectMode('newPattern', 'photo', 'pixelArt'), 'photo');
  assert.equal(resolveProjectMode('newPattern', 'pixelArt', 'photo'), 'pixelArt');
});

test('mirror-existing-chart task always resolves to existingChart mode', () => {
  assert.equal(resolveProjectMode('mirrorExistingChart', 'auto', 'photo'), 'existingChart');
  assert.equal(resolveProjectMode('mirrorExistingChart', 'pixelArt', 'photo'), 'existingChart');
});
