import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beadDimensionsForPreset,
  dimensionsForLongEdge,
  physicalDimensionsForGrid,
  resolveBeadSizePreset,
  resolveColorCountPreset,
  resolveColorLimit,
  resolvePatternSizePreset,
  resolveProcessingPreset,
  processingSettingsForPreset,
} from '../src/features/customer-flow/presets';

test('pattern-size presets use cropped columns and rows for landscape, portrait, square, and non-full crops', () => {
  assert.deepEqual(dimensionsForLongEdge(29, 400, 100), { columns: 29, rows: 7 });
  assert.deepEqual(dimensionsForLongEdge(48, 100, 400), { columns: 12, rows: 48 });
  assert.deepEqual(dimensionsForLongEdge(72, 150, 150), { columns: 72, rows: 72 });
  assert.deepEqual(dimensionsForLongEdge(48, 120, 80), { columns: 48, rows: 32 });
  assert.throws(() => dimensionsForLongEdge(30 as 29, 400, 100), /图案大小预设/u);
});

test('pattern-size presets derive grid dimensions within 1 to 300 cells', () => {
  assert.deepEqual(dimensionsForLongEdge(29, 1_000, 1), { columns: 29, rows: 1 });
  assert.deepEqual(dimensionsForLongEdge(29, 3, 2), { columns: 29, rows: 19 });
  assert.throws(() => resolvePatternSizePreset({ columns: 0, rows: 29 }, 100, 100), /图案行列/u);
  assert.throws(() => resolvePatternSizePreset({ columns: 301, rows: 29 }, 100, 100), /图案行列/u);
});

test('dimensions that do not exactly match a preset resolve as custom', () => {
  assert.equal(resolvePatternSizePreset({ columns: 29, rows: 7 }, 400, 100), 29);
  assert.equal(resolvePatternSizePreset({ columns: 29, rows: 8 }, 400, 100), 'custom');
  assert.equal(resolvePatternSizePreset({ columns: 30, rows: 8 }, 400, 100), 'custom');
});

test('bead-size presets map to regular, mini, and explicit custom dimensions', () => {
  assert.deepEqual(beadDimensionsForPreset(5), { beadDiameterMm: 5, beadPitchMm: 5 });
  assert.deepEqual(beadDimensionsForPreset(2.6), { beadDiameterMm: 2.6, beadPitchMm: 2.6 });
  assert.deepEqual(beadDimensionsForPreset('custom', { beadDiameterMm: 4, beadPitchMm: 5 }), {
    beadDiameterMm: 4,
    beadPitchMm: 5,
  });
});

test('custom bead dimensions must be finite, in range, and use a pitch no smaller than diameter', () => {
  for (const dimensions of [
    { beadDiameterMm: 0.9, beadPitchMm: 5 },
    { beadDiameterMm: 10.1, beadPitchMm: 10.1 },
    { beadDiameterMm: 5, beadPitchMm: 0.9 },
    { beadDiameterMm: 5, beadPitchMm: 12.1 },
    { beadDiameterMm: 5, beadPitchMm: 4 },
    { beadDiameterMm: Number.NaN, beadPitchMm: 5 },
    { beadDiameterMm: 5, beadPitchMm: Number.POSITIVE_INFINITY },
  ]) {
    assert.throws(() => beadDimensionsForPreset('custom', dimensions), /拼豆尺寸/u);
  }
});

test('bead preset inverse resolves imported non-preset dimensions as custom', () => {
  assert.equal(resolveBeadSizePreset({ beadDiameterMm: 5, beadPitchMm: 5 }), 5);
  assert.equal(resolveBeadSizePreset({ beadDiameterMm: 2.6, beadPitchMm: 2.6 }), 2.6);
  assert.equal(resolveBeadSizePreset({ beadDiameterMm: 5, beadPitchMm: 6 }), 'custom');
});

test('color-count presets respect the available-color ceiling and validate the active palette count', () => {
  assert.equal(resolveColorLimit(12, 30), 12);
  assert.equal(resolveColorLimit(24, 24), 24);
  assert.equal(resolveColorLimit(48, 17), 17);
  assert.throws(() => resolveColorLimit(13 as 12, 30), /颜色细节预设/u);
  assert.throws(() => resolveColorLimit(12, 0), /可用颜色数/u);
  assert.throws(() => resolveColorLimit(12, 1.5), /可用颜色数/u);
});

test('color-count inverse identifies only unambiguous preset mappings', () => {
  assert.equal(resolveColorCountPreset(12, 60), 12);
  assert.equal(resolveColorCountPreset(24, 60), 24);
  assert.equal(resolveColorCountPreset(48, 60), 48);
  assert.equal(resolveColorCountPreset(31, 60), 'custom');
  assert.equal(resolveColorCountPreset(null, 60), 'custom');
  assert.equal(resolveColorCountPreset(24, 24), 'custom');
});

test('processing presets map to and from the approved dithering settings', () => {
  assert.deepEqual(processingSettingsForPreset('easy'), { dithering: 'none' });
  assert.deepEqual(processingSettingsForPreset('gradient'), { dithering: 'floydSteinberg' });
  assert.equal(resolveProcessingPreset('none'), 'easy');
  assert.equal(resolveProcessingPreset('floydSteinberg'), 'gradient');
});

test('physical dimensions are derived from grid and bead dimensions without retained state', () => {
  assert.deepEqual(
    physicalDimensionsForGrid({
      rows: 3,
      columns: 4,
      beadDiameterMm: 5,
      beadPitchMm: 5,
    }),
    { widthMm: 20, heightMm: 15 },
  );
  assert.deepEqual(
    physicalDimensionsForGrid({
      rows: 3,
      columns: 4,
      beadDiameterMm: 2.6,
      beadPitchMm: 2.6,
    }),
    { widthMm: 10.4, heightMm: 7.8 },
  );
});
