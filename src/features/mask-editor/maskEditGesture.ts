export type MaskGestureMode = 'idle' | 'paint' | 'pan' | 'pinch';

export interface MaskGesturePointer {
  readonly id: number;
  readonly pointerType: 'mouse' | 'touch' | 'pen';
  readonly x: number;
  readonly y: number;
  readonly button: number;
  readonly insideImage: boolean;
}

export interface MaskGestureState {
  readonly mode: MaskGestureMode;
  readonly pointers: ReadonlyMap<number, MaskGesturePointer>;
  readonly primaryPointerId: number | null;
  readonly spacePressed: boolean;
}

export type MaskGestureEvent =
  | { readonly type: 'space'; readonly pressed: boolean }
  | { readonly type: 'pointerDown'; readonly pointer: MaskGesturePointer }
  | { readonly type: 'pointerMove'; readonly pointer: MaskGesturePointer }
  | { readonly type: 'pointerUp'; readonly pointerId: number }
  | { readonly type: 'pointerCancel'; readonly pointerId: number };

export type MaskGestureIntent =
  | { readonly type: 'none' | 'paintEnd' | 'paintCancel' }
  | { readonly type: 'paintStart' | 'paintMove'; readonly x: number; readonly y: number }
  | { readonly type: 'pan'; readonly deltaX: number; readonly deltaY: number }
  | {
      readonly type: 'pinch';
      readonly centerX: number;
      readonly centerY: number;
      readonly scale: number;
      readonly deltaX: number;
      readonly deltaY: number;
    };

export interface MaskGestureTransition {
  readonly state: MaskGestureState;
  readonly intent: MaskGestureIntent;
}

const NONE: MaskGestureIntent = Object.freeze({ type: 'none' });

export function createMaskGestureState(): MaskGestureState {
  return freezeState('idle', new Map(), null, false);
}

export function reduceMaskGesture(
  state: MaskGestureState,
  event: MaskGestureEvent,
): MaskGestureTransition {
  if (event.type === 'space') {
    return transition(
      freezeState(state.mode, state.pointers, state.primaryPointerId, event.pressed),
      NONE,
    );
  }
  if (event.type === 'pointerDown') {
    const pointers = new Map(state.pointers);
    pointers.set(event.pointer.id, event.pointer);
    const touchCount = [...pointers.values()].filter(
      ({ pointerType }) => pointerType === 'touch',
    ).length;
    if (touchCount >= 2) {
      return transition(
        freezeState('pinch', pointers, null, state.spacePressed),
        state.mode === 'paint' ? { type: 'paintCancel' } : NONE,
      );
    }
    if (
      event.pointer.pointerType === 'mouse' &&
      (event.pointer.button === 1 || (event.pointer.button === 0 && state.spacePressed))
    ) {
      return transition(freezeState('pan', pointers, event.pointer.id, state.spacePressed), NONE);
    }
    if (state.mode === 'idle' && event.pointer.button === 0 && event.pointer.insideImage) {
      return transition(freezeState('paint', pointers, event.pointer.id, state.spacePressed), {
        type: 'paintStart',
        x: event.pointer.x,
        y: event.pointer.y,
      });
    }
    pointers.delete(event.pointer.id);
    return transition(
      freezeState(state.mode, pointers, state.primaryPointerId, state.spacePressed),
      NONE,
    );
  }
  if (event.type === 'pointerMove') {
    const previous = state.pointers.get(event.pointer.id);
    if (!previous) return transition(state, NONE);
    const pointers = new Map(state.pointers);
    pointers.set(event.pointer.id, event.pointer);
    const nextState = freezeState(state.mode, pointers, state.primaryPointerId, state.spacePressed);
    if (state.mode === 'paint' && state.primaryPointerId === event.pointer.id) {
      return transition(
        nextState,
        event.pointer.insideImage
          ? { type: 'paintMove', x: event.pointer.x, y: event.pointer.y }
          : NONE,
      );
    }
    if (state.mode === 'pan' && state.primaryPointerId === event.pointer.id) {
      return transition(nextState, {
        type: 'pan',
        deltaX: event.pointer.x - previous.x,
        deltaY: event.pointer.y - previous.y,
      });
    }
    if (state.mode === 'pinch') {
      const before = touchPair(state.pointers);
      const after = touchPair(pointers);
      if (!before || !after) return transition(nextState, NONE);
      const beforeCenter = center(before);
      const afterCenter = center(after);
      const beforeDistance = distance(before);
      return transition(nextState, {
        type: 'pinch',
        centerX: afterCenter.x,
        centerY: afterCenter.y,
        scale: beforeDistance > 0 ? distance(after) / beforeDistance : 1,
        deltaX: afterCenter.x - beforeCenter.x,
        deltaY: afterCenter.y - beforeCenter.y,
      });
    }
    return transition(nextState, NONE);
  }

  const pointers = new Map(state.pointers);
  pointers.delete(event.pointerId);
  const endedPrimary = state.primaryPointerId === event.pointerId;
  const intent: MaskGestureIntent =
    endedPrimary && state.mode === 'paint'
      ? { type: event.type === 'pointerCancel' ? 'paintCancel' : 'paintEnd' }
      : NONE;
  const remainPinching = state.mode === 'pinch' && touchPair(pointers) !== null;
  return transition(
    freezeState(remainPinching ? 'pinch' : 'idle', pointers, null, state.spacePressed),
    intent,
  );
}

function transition(state: MaskGestureState, intent: MaskGestureIntent): MaskGestureTransition {
  return Object.freeze({ state, intent });
}

function freezeState(
  mode: MaskGestureMode,
  pointers: ReadonlyMap<number, MaskGesturePointer>,
  primaryPointerId: number | null,
  spacePressed: boolean,
): MaskGestureState {
  return Object.freeze({ mode, pointers: new Map(pointers), primaryPointerId, spacePressed });
}

function touchPair(
  pointers: ReadonlyMap<number, MaskGesturePointer>,
): readonly [MaskGesturePointer, MaskGesturePointer] | null {
  const touches = [...pointers.values()].filter(({ pointerType }) => pointerType === 'touch');
  return touches.length >= 2 && touches[0] && touches[1] ? [touches[0], touches[1]] : null;
}

function center(pair: readonly [MaskGesturePointer, MaskGesturePointer]): { x: number; y: number } {
  return { x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 };
}

function distance(pair: readonly [MaskGesturePointer, MaskGesturePointer]): number {
  return Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y);
}
