import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EditorGestureState,
  resolvePointerIntent,
} from '../src/features/pattern-editor/gestureState';

test('a second touch transitions a single-finger tool gesture into pinch mode', () => {
  const gestures = new EditorGestureState();

  gestures.begin({ id: 1, x: 10, y: 20, pointerType: 'touch', button: 0 }, 'tool');
  assert.equal(gestures.snapshot.mode, 'tool');

  gestures.begin({ id: 2, x: 30, y: 20, pointerType: 'touch', button: 0 }, 'tool');
  assert.equal(gestures.snapshot.mode, 'pinch');
  assert.equal(gestures.snapshot.pointerCount, 2);
  assert.deepEqual(gestures.snapshot.pinch, {
    centroid: { x: 20, y: 20 },
    distance: 20,
  });
});

test('pinch metrics update from the tracked pointer map', () => {
  const gestures = new EditorGestureState();
  gestures.begin({ id: 1, x: 0, y: 0, pointerType: 'touch', button: 0 }, 'tool');
  gestures.begin({ id: 2, x: 10, y: 0, pointerType: 'touch', button: 0 }, 'tool');

  gestures.update({ id: 2, x: 20, y: 10, pointerType: 'touch', button: 0 });

  assert.deepEqual(gestures.snapshot.pinch?.centroid, { x: 10, y: 5 });
  assert.equal(gestures.snapshot.pinch?.distance, Math.hypot(20, 10));
});

test('pinch metrics use the two touch pointers when another pointer is tracked', () => {
  const gestures = new EditorGestureState();
  gestures.begin({ id: 9, x: 500, y: 500, pointerType: 'mouse', button: 0 }, 'tool');
  gestures.begin({ id: 1, x: 0, y: 0, pointerType: 'touch', button: 0 }, 'tool');
  gestures.begin({ id: 2, x: 20, y: 10, pointerType: 'touch', button: 0 }, 'tool');

  assert.equal(gestures.snapshot.mode, 'pinch');
  assert.deepEqual(gestures.snapshot.pinch, {
    centroid: { x: 10, y: 5 },
    distance: Math.hypot(20, 10),
  });
});

test('ending either pointer ends a pinch rather than resuming a tool gesture', () => {
  const gestures = new EditorGestureState();
  gestures.begin({ id: 1, x: 0, y: 0, pointerType: 'touch', button: 0 }, 'tool');
  gestures.begin({ id: 2, x: 10, y: 0, pointerType: 'touch', button: 0 }, 'tool');

  gestures.end(2);

  assert.equal(gestures.snapshot.mode, 'idle');
  assert.equal(gestures.snapshot.pointerCount, 0);
});

test('mouse middle button or held space resolves to pan while primary input remains a tool', () => {
  assert.equal(resolvePointerIntent('mouse', 1, false), 'pan');
  assert.equal(resolvePointerIntent('mouse', 0, true), 'pan');
  assert.equal(resolvePointerIntent('mouse', 0, false), 'tool');
  assert.equal(resolvePointerIntent('touch', 0, true), 'tool');
});

test('cancelling clears all pointers and returns to idle', () => {
  const gestures = new EditorGestureState();
  gestures.begin({ id: 1, x: 0, y: 0, pointerType: 'pen', button: 0 }, 'tool');

  gestures.cancelAll();

  assert.equal(gestures.snapshot.mode, 'idle');
  assert.equal(gestures.snapshot.pointerCount, 0);
});
