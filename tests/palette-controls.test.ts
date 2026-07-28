import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterPaletteColors,
  groupPaletteColorsBySeries,
  paletteFilterStatusText,
  pushRecentColor,
  type PaletteControlColor,
} from '../src/features/palette-controls/paletteControls';

const COLORS: readonly PaletteControlColor[] = [
  {
    id: 'mard:A1',
    paletteId: 'mard',
    series: 'A',
    code: 'A1',
    displayHex: '#FFF8DC',
    name: '奶油白',
  },
  {
    id: 'mard:A2',
    paletteId: 'mard',
    series: 'A',
    code: 'A2',
    displayHex: '#F4D35E',
    name: null,
  },
  {
    id: 'mard:B2',
    paletteId: 'mard',
    series: 'B',
    code: 'B2',
    displayHex: '#20639B',
    name: '海蓝',
  },
  {
    id: 'mard:C1',
    paletteId: 'mard',
    series: 'C',
    code: 'C1',
    displayHex: '#3CAEA3',
    name: null,
  },
];

test('palette filtering applies available-color restrictions before search', () => {
  const filtered = filterPaletteColors(COLORS, {
    availableColorIds: ['mard:A1', 'mard:B2'],
    query: '海蓝',
  });

  assert.deepEqual(
    filtered.map((color) => color.id),
    ['mard:B2'],
  );
});

test('palette filtering supports used and recent scopes', () => {
  const used = filterPaletteColors(COLORS, {
    availableColorIds: COLORS.map((color) => color.id),
    scope: 'used',
    usedColorIds: ['mard:C1', 'mard:A2'],
  });
  const recent = filterPaletteColors(COLORS, {
    availableColorIds: COLORS.map((color) => color.id),
    scope: 'recent',
    recentColorIds: ['mard:B2', 'mard:A1'],
  });

  assert.deepEqual(
    used.map((color) => color.id),
    ['mard:A2', 'mard:C1'],
  );
  assert.deepEqual(
    recent.map((color) => color.id),
    ['mard:B2', 'mard:A1'],
  );
});

test('palette filtering can narrow results to one series', () => {
  const filtered = filterPaletteColors(COLORS, {
    availableColorIds: COLORS.map((color) => color.id),
    series: 'A',
  });

  assert.deepEqual(
    filtered.map((color) => color.id),
    ['mard:A1', 'mard:A2'],
  );
});

test('palette grouping sorts series and preserves color order within each series', () => {
  const groups = groupPaletteColorsBySeries([COLORS[2]!, COLORS[1]!, COLORS[0]!]);

  assert.deepEqual(
    groups.map((group) => ({
      series: group.series,
      colorIds: group.colors.map((color) => color.id),
    })),
    [
      { series: 'A', colorIds: ['mard:A2', 'mard:A1'] },
      { series: 'B', colorIds: ['mard:B2'] },
    ],
  );
});

test('recent colors are deduplicated, newest first, and bounded', () => {
  const recent = pushRecentColor(['mard:A1', 'mard:B2', 'mard:C1'], 'mard:B2', 3);

  assert.deepEqual(recent, ['mard:B2', 'mard:A1', 'mard:C1']);
  assert.deepEqual(pushRecentColor(recent, 'mard:A2', 3), ['mard:A2', 'mard:B2', 'mard:A1']);
});

test('empty scoped palette results explain the active filter instead of looking unresponsive', () => {
  assert.equal(paletteFilterStatusText(0, 221, 'recent'), '暂无最近使用颜色 · 共 221 色');
  assert.equal(
    paletteFilterStatusText(0, 221, 'used'),
    '当前图纸没有使用符合条件的颜色 · 共 221 色',
  );
  assert.equal(paletteFilterStatusText(48, 221, 'used'), '显示 48 / 221 色');
});
