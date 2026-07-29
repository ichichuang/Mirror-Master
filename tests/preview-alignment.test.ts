import assert from 'node:assert/strict';
import test from 'node:test';

import { computeRotatedCropSourceRect } from '../src/features/preview-workspace/previewCrop';

test('rotated crop geometry converts percentages inside the rotated source dimensions', () => {
  assert.deepEqual(
    computeRotatedCropSourceRect({ width: 1200, height: 800 }, 90, {
      x: 10,
      y: 20,
      width: 50,
      height: 40,
    }),
    {
      rotatedWidth: 800,
      rotatedHeight: 1200,
      x: 80,
      y: 240,
      width: 400,
      height: 480,
    },
  );
});

test('rotated crop geometry preserves zero-degree dimensions and clamps percentage bounds', () => {
  assert.deepEqual(
    computeRotatedCropSourceRect({ width: 640, height: 480 }, 0, {
      x: -5,
      y: 95,
      width: 120,
      height: 20,
    }),
    {
      rotatedWidth: 640,
      rotatedHeight: 480,
      x: 0,
      y: 456,
      width: 640,
      height: 24,
    },
  );
});
