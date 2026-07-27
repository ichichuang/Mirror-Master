import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeSelection,
  positionSelectionContextBar,
} from '../src/features/pattern-editor/selectionContext';

test('selection context describes normalized width before height', () => {
  assert.deepEqual(
    describeSelection({
      startRow: 4,
      startColumn: 7,
      endRow: 3,
      endColumn: 5,
    }),
    {
      width: 3,
      height: 2,
      label: '已选 3 × 2',
    },
  );
});

test('selection context bar prefers a centered position above the selection', () => {
  assert.deepEqual(
    positionSelectionContextBar({
      viewport: { left: 0, top: 0, width: 390, height: 844 },
      selection: { left: 120, top: 300, width: 150, height: 100 },
      bar: { width: 200, height: 48 },
      safeArea: { top: 47, right: 16, bottom: 34, left: 16 },
      occlusions: [{ left: 0, top: 660, width: 390, height: 184 }],
      gap: 8,
    }),
    {
      left: 95,
      top: 244,
      placement: 'above',
    },
  );
});

test('selection context bar moves beside the selection when top and bottom are obstructed', () => {
  assert.deepEqual(
    positionSelectionContextBar({
      viewport: { left: 0, top: 0, width: 390, height: 600 },
      selection: { left: 150, top: 30, width: 80, height: 160 },
      bar: { width: 120, height: 48 },
      safeArea: { top: 16, right: 16, bottom: 16, left: 16 },
      occlusions: [
        { left: 0, top: 190, width: 390, height: 210 },
        { left: 0, top: 400, width: 390, height: 200 },
      ],
      gap: 8,
    }),
    {
      left: 22,
      top: 86,
      placement: 'left',
    },
  );
});

test('selection context bar clamps its full bounds inside viewport safe areas', () => {
  assert.deepEqual(
    positionSelectionContextBar({
      viewport: { left: 0, top: 0, width: 320, height: 640 },
      selection: { left: 270, top: 300, width: 40, height: 40 },
      bar: { width: 180, height: 48 },
      safeArea: { top: 16, right: 16, bottom: 20, left: 16 },
      occlusions: [],
      gap: 8,
    }),
    {
      left: 124,
      top: 244,
      placement: 'above',
    },
  );
});

test('selection context bar searches a shifted slot on the preferred side', () => {
  assert.deepEqual(
    positionSelectionContextBar({
      viewport: { left: 0, top: 0, width: 400, height: 300 },
      selection: { left: 150, top: 160, width: 100, height: 60 },
      bar: { width: 120, height: 40 },
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      occlusions: [{ left: 130, top: 0, width: 140, height: 152 }],
      gap: 8,
    }),
    {
      left: 2,
      top: 112,
      placement: 'above',
    },
  );
});

test('selection context bar reports an impossible placement instead of returning overlap', () => {
  assert.throws(
    () =>
      positionSelectionContextBar({
        viewport: { left: 0, top: 0, width: 200, height: 120 },
        selection: { left: 0, top: 0, width: 200, height: 120 },
        bar: { width: 80, height: 40 },
        safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
        occlusions: [],
        gap: 8,
      }),
    /无法在不遮挡选区或控制面的区域放置/u,
  );
});

test('selection context bar uses an exact edge-aligned free slot when gaps cannot fit', () => {
  assert.deepEqual(
    positionSelectionContextBar({
      viewport: { left: 0, top: 0, width: 200, height: 100 },
      selection: { left: 0, top: 0, width: 60, height: 100 },
      bar: { width: 80, height: 40 },
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      occlusions: [{ left: 140, top: 0, width: 60, height: 100 }],
      gap: 8,
    }),
    {
      left: 60,
      top: 30,
      placement: 'right',
    },
  );
});
