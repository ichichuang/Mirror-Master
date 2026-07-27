import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateSheetSnapPoints,
  createSheetMotionState,
  dragSheetHeight,
  reduceSheetMotion,
  snapSheetHeight,
  snapSheetWithVelocity,
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

test('sheet snap points account for safe areas and the visible keyboard', () => {
  assert.deepEqual(
    calculateSheetSnapPoints({
      viewportHeight: 844,
      peekContentHeight: 78,
      safeAreaTop: 47,
      safeAreaBottom: 34,
      keyboardHeight: 300,
      topGap: 8,
    }),
    {
      peek: 112,
      half: 235,
      full: 489,
    },
  );
});

test('release snap combines pointer position with upward and downward velocity', () => {
  assert.deepEqual(snapSheetWithVelocity(500, -1.2, SNAP_POINTS), {
    state: 'full',
    height: 760,
  });
  assert.deepEqual(snapSheetWithVelocity(650, 1.5, SNAP_POINTS), {
    state: 'half',
    height: 400,
  });
});

test('pointer cancellation restores the most recent stable named sheet state', () => {
  const stable = createSheetMotionState('half', SNAP_POINTS);
  const dragging = reduceSheetMotion(stable, { type: 'drag', height: 620 });
  const cancelled = reduceSheetMotion(dragging, { type: 'pointercancel' });

  assert.deepEqual(cancelled, {
    stableState: 'half',
    height: 400,
    snapPoints: SNAP_POINTS,
    dragging: false,
  });
});

test('orientation recalculation preserves the named state at new snap points', () => {
  const portrait = createSheetMotionState('full', SNAP_POINTS);
  const landscapePoints: SheetSnapPoints = {
    peek: 99,
    half: 183,
    full: 382,
  };

  assert.deepEqual(
    reduceSheetMotion(portrait, {
      type: 'recalculate',
      snapPoints: landscapePoints,
    }),
    {
      stableState: 'full',
      height: 382,
      snapPoints: landscapePoints,
      dragging: false,
    },
  );
});

test('orientation recalculation cancels an active drag into the equivalent stable state', () => {
  const portrait = createSheetMotionState('half', SNAP_POINTS);
  const dragging = reduceSheetMotion(portrait, { type: 'drag', height: 620 });
  const landscapePoints: SheetSnapPoints = {
    peek: 99,
    half: 183,
    full: 382,
  };

  assert.deepEqual(
    reduceSheetMotion(dragging, {
      type: 'recalculate',
      snapPoints: landscapePoints,
    }),
    {
      stableState: 'half',
      height: 183,
      snapPoints: landscapePoints,
      dragging: false,
    },
  );
});

test('pointer release updates the stable state selected by motion', () => {
  const stable = createSheetMotionState('peek', SNAP_POINTS);
  const dragging = reduceSheetMotion(stable, { type: 'drag', height: 650 });

  assert.deepEqual(
    reduceSheetMotion(dragging, {
      type: 'pointerup',
      height: 650,
      pointerVelocityY: 1.5,
    }),
    {
      stableState: 'half',
      height: 400,
      snapPoints: SNAP_POINTS,
      dragging: false,
    },
  );
});
