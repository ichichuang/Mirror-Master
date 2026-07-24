import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dragSheetHeight,
  snapSheetHeight,
  type SheetSnapPoints,
} from '../src/features/mobile-sheet/sheetMath';

const SNAP_POINTS: SheetSnapPoints = {
  peek: 112,
  half: 400,
  full: 760,
};

test('sheet drag height follows pointer movement and stays within snap bounds', () => {
  assert.equal(
    dragSheetHeight({
      startHeight: 400,
      startPointerY: 500,
      pointerY: 350,
      snapPoints: SNAP_POINTS,
    }),
    550,
  );
  assert.equal(
    dragSheetHeight({
      startHeight: 400,
      startPointerY: 500,
      pointerY: 0,
      snapPoints: SNAP_POINTS,
    }),
    760,
  );
});

test('sheet snap chooses the nearest named state', () => {
  assert.deepEqual(snapSheetHeight(520, SNAP_POINTS), { state: 'half', height: 400 });
  assert.deepEqual(snapSheetHeight(650, SNAP_POINTS), { state: 'full', height: 760 });
  assert.deepEqual(snapSheetHeight(150, SNAP_POINTS), { state: 'peek', height: 112 });
});

test('sheet math rejects unordered snap points', () => {
  assert.throws(() => snapSheetHeight(300, { peek: 400, half: 300, full: 700 }), /吸附点/u);
});
