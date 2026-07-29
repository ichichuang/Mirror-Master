import assert from 'node:assert/strict';
import test from 'node:test';

import {
  configurationForPngExportPreset,
  configurationForPreviewMode,
  describePngExportConfiguration,
  resolvePngExportPreset,
  updatePngExportConfiguration,
} from '../src/features/export-completion/pngExportConfiguration';

test('five presets map to the approved independent PNG configuration', () => {
  assert.deepEqual(configurationForPngExportPreset('pure'), {
    background: 'transparent',
    appearance: 'bead',
    includeGrid: false,
    includeCoordinates: false,
    includeCellCodes: false,
    includeStatistics: false,
    includeMaterialCounts: false,
    includeColorLegend: false,
  });
  assert.deepEqual(configurationForPngExportPreset('annotated'), {
    background: 'white',
    appearance: 'bead',
    includeGrid: true,
    includeCoordinates: true,
    includeCellCodes: false,
    includeStatistics: true,
    includeMaterialCounts: true,
    includeColorLegend: true,
  });
  assert.deepEqual(configurationForPngExportPreset('numbered'), {
    background: 'white',
    appearance: 'solidSquare',
    includeGrid: true,
    includeCoordinates: true,
    includeCellCodes: true,
    includeStatistics: true,
    includeMaterialCounts: true,
    includeColorLegend: true,
  });
  assert.deepEqual(configurationForPngExportPreset('rounded'), {
    background: 'white',
    appearance: 'roundedSquare',
    includeGrid: false,
    includeCoordinates: false,
    includeCellCodes: false,
    includeStatistics: false,
    includeMaterialCounts: false,
    includeColorLegend: false,
  });
  assert.deepEqual(configurationForPngExportPreset('ring'), {
    background: 'white',
    appearance: 'ring',
    includeGrid: false,
    includeCoordinates: false,
    includeCellCodes: false,
    includeStatistics: false,
    includeMaterialCounts: false,
    includeColorLegend: false,
  });
});

test('a changed preset becomes custom and matching the preset again restores its name', () => {
  const pure = configurationForPngExportPreset('pure');
  const custom = updatePngExportConfiguration(pure, { includeGrid: true });

  assert.equal(resolvePngExportPreset(custom), 'custom');
  assert.equal(
    resolvePngExportPreset(updatePngExportConfiguration(custom, { includeGrid: false })),
    'pure',
  );
});

test('every preview mode resolves to an exportable PNG preset', () => {
  for (const mode of ['pure', 'annotated', 'numbered', 'rounded', 'ring'] as const) {
    assert.deepEqual(configurationForPreviewMode(mode), configurationForPngExportPreset(mode));
  }
});

test('configuration descriptions name the selected visual and optional content', () => {
  assert.equal(
    describePngExportConfiguration({
      ...configurationForPngExportPreset('ring'),
      background: 'transparent',
      includeCoordinates: true,
      includeStatistics: true,
    }),
    '透明背景 · 圆环豆粒 · 行列坐标 · 图纸统计',
  );
});
