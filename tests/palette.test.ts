import assert from 'node:assert/strict';
import test from 'node:test';

import { PALETTE_COLORS, PALETTES, PALETTE_SOURCE_VERSION } from '../src/generated/palettes';

test('owner palette assets contain exactly 39 default and 221 MARD colors', () => {
  const counts = Object.fromEntries(
    PALETTES.map((palette) => [palette.id, palette.colorIds.length]),
  );

  assert.deepEqual(counts, { default: 39, mard: 221 });
  assert.equal(PALETTE_COLORS.length, 260);
  assert.equal(new Set(PALETTE_COLORS.map((color) => color.id)).size, 260);
});

test('palette IDs are namespaced without normalizing owner codes', () => {
  const ids = new Set(PALETTE_COLORS.map((color) => color.id));
  const defaultA01 = PALETTE_COLORS.find((color) => color.id === 'default:A01');
  const mardA1 = PALETTE_COLORS.find((color) => color.id === 'mard:A1');

  assert.ok(ids.has('default:A01'));
  assert.ok(ids.has('mard:A1'));
  assert.notEqual(defaultA01?.id, mardA1?.id);
  assert.equal(defaultA01?.code, 'A01');
  assert.equal(mardA1?.code, 'A1');
});

test('every palette record carries source, version, series, code and display HEX', () => {
  for (const color of PALETTE_COLORS) {
    assert.equal(color.source, 'owner-seed');
    assert.equal(color.version, PALETTE_SOURCE_VERSION);
    assert.equal(color.series, color.code[0]);
    assert.match(color.displayHex, /^#[0-9A-F]{6}$/u);
  }
});
