import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyCropKeyboardStep,
  normalizeCropPercent,
} from '../src/features/crop-controls/cropControls';

test('crop normalization enforces minimum size and image bounds', () => {
  assert.deepEqual(normalizeCropPercent({ x: 95, y: -4, width: 2, height: 120 }), {
    x: 92,
    y: 0,
    width: 8,
    height: 100,
  });
});

test('crop keyboard arrows move by one percent or five with Shift', () => {
  const crop = { x: 10, y: 10, width: 40, height: 40 };

  assert.deepEqual(applyCropKeyboardStep(crop, 'ArrowRight'), {
    x: 11,
    y: 10,
    width: 40,
    height: 40,
  });
  assert.deepEqual(applyCropKeyboardStep(crop, 'ArrowDown', { shiftKey: true }), {
    x: 10,
    y: 15,
    width: 40,
    height: 40,
  });
});

test('crop keyboard resize changes the trailing edge without leaving bounds', () => {
  const crop = { x: 60, y: 60, width: 40, height: 40 };

  assert.deepEqual(applyCropKeyboardStep(crop, 'ArrowLeft', { resize: true }), {
    x: 60,
    y: 60,
    width: 39,
    height: 40,
  });
  assert.deepEqual(
    applyCropKeyboardStep(crop, 'ArrowRight', { resize: true, shiftKey: true }),
    crop,
  );
});
