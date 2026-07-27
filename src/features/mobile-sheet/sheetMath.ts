export interface SheetSnapPoints {
  readonly peek: number;
  readonly half: number;
  readonly full: number;
}

export interface SheetDragInput {
  readonly startHeight: number;
  readonly startPointerY: number;
  readonly pointerY: number;
  readonly snapPoints: SheetSnapPoints;
}

export type SheetState = keyof SheetSnapPoints;

export interface SheetSnapResult {
  readonly state: SheetState;
  readonly height: number;
}

export interface SheetSnapLayoutInput {
  readonly viewportHeight: number;
  readonly peekContentHeight: number;
  readonly safeAreaTop?: number;
  readonly safeAreaBottom?: number;
  readonly keyboardHeight?: number;
  readonly topGap?: number;
  readonly halfRatio?: number;
}

export interface SheetMotionState {
  readonly stableState: SheetState;
  readonly height: number;
  readonly snapPoints: SheetSnapPoints;
  readonly dragging: boolean;
}

export type SheetMotionEvent =
  | {
      readonly type: 'drag';
      readonly height: number;
    }
  | {
      readonly type: 'pointerup';
      readonly height: number;
      /** Pointer velocity in CSS pixels per millisecond; positive values move downward. */
      readonly pointerVelocityY: number;
    }
  | {
      readonly type: 'pointercancel';
    }
  | {
      readonly type: 'recalculate';
      readonly snapPoints: SheetSnapPoints;
    };

const RELEASE_PROJECTION_MS = 160;

export function calculateSheetSnapPoints(input: SheetSnapLayoutInput): SheetSnapPoints {
  const safeAreaTop = input.safeAreaTop ?? 0;
  const safeAreaBottom = input.safeAreaBottom ?? 0;
  const keyboardHeight = input.keyboardHeight ?? 0;
  const topGap = input.topGap ?? 8;
  const halfRatio = input.halfRatio ?? 0.48;
  const nonNegativeValues = [
    input.viewportHeight,
    input.peekContentHeight,
    safeAreaTop,
    safeAreaBottom,
    keyboardHeight,
    topGap,
  ];
  if (
    nonNegativeValues.some((value) => !Number.isFinite(value) || value < 0) ||
    input.viewportHeight <= 0 ||
    !Number.isFinite(halfRatio) ||
    halfRatio <= 0 ||
    halfRatio >= 1
  ) {
    throw new Error('控制面板可用高度无效。');
  }

  const full = Math.round(input.viewportHeight - safeAreaTop - keyboardHeight - topGap);
  if (full < 3) {
    throw new Error('控制面板可用高度不足。');
  }
  const peek = clamp(Math.round(input.peekContentHeight + safeAreaBottom), 1, full - 2);
  const half = clamp(Math.round(full * halfRatio), peek + 1, full - 1);
  const snapPoints = Object.freeze({ peek, half, full });
  validateSnapPoints(snapPoints);
  return snapPoints;
}

export function dragSheetHeight(input: SheetDragInput): number {
  validateSnapPoints(input.snapPoints);
  if (
    !Number.isFinite(input.startHeight) ||
    !Number.isFinite(input.startPointerY) ||
    !Number.isFinite(input.pointerY)
  ) {
    throw new Error('控制面板拖拽位置无效。');
  }
  return clamp(
    input.startHeight + input.startPointerY - input.pointerY,
    input.snapPoints.peek,
    input.snapPoints.full,
  );
}

export function snapSheetHeight(height: number, snapPoints: SheetSnapPoints): SheetSnapResult {
  validateSnapPoints(snapPoints);
  if (!Number.isFinite(height)) {
    throw new Error('控制面板高度无效。');
  }
  const states: readonly SheetState[] = ['peek', 'half', 'full'];
  const state = states.reduce((nearest, candidate) =>
    Math.abs(height - snapPoints[candidate]) < Math.abs(height - snapPoints[nearest])
      ? candidate
      : nearest,
  );
  return Object.freeze({ state, height: snapPoints[state] });
}

export function snapSheetWithVelocity(
  height: number,
  /** CSS pixels per millisecond; positive values move downward. */
  pointerVelocityY: number,
  snapPoints: SheetSnapPoints,
): SheetSnapResult {
  if (!Number.isFinite(pointerVelocityY)) {
    throw new Error('控制面板拖拽速度无效。');
  }
  return snapSheetHeight(height - pointerVelocityY * RELEASE_PROJECTION_MS, snapPoints);
}

export function createSheetMotionState(
  stableState: SheetState,
  snapPoints: SheetSnapPoints,
): SheetMotionState {
  validateSnapPoints(snapPoints);
  return Object.freeze({
    stableState,
    height: snapPoints[stableState],
    snapPoints,
    dragging: false,
  });
}

export function reduceSheetMotion(
  state: SheetMotionState,
  event: SheetMotionEvent,
): SheetMotionState {
  validateSnapPoints(state.snapPoints);
  if (event.type === 'drag') {
    if (!Number.isFinite(event.height)) {
      throw new Error('控制面板高度无效。');
    }
    return Object.freeze({
      ...state,
      height: clamp(event.height, state.snapPoints.peek, state.snapPoints.full),
      dragging: true,
    });
  }
  if (event.type === 'pointerup') {
    const result = snapSheetWithVelocity(event.height, event.pointerVelocityY, state.snapPoints);
    return Object.freeze({
      stableState: result.state,
      height: result.height,
      snapPoints: state.snapPoints,
      dragging: false,
    });
  }
  if (event.type === 'pointercancel') {
    return Object.freeze({
      stableState: state.stableState,
      height: state.snapPoints[state.stableState],
      snapPoints: state.snapPoints,
      dragging: false,
    });
  }
  validateSnapPoints(event.snapPoints);
  return Object.freeze({
    stableState: state.stableState,
    height: event.snapPoints[state.stableState],
    snapPoints: event.snapPoints,
    dragging: false,
  });
}

function validateSnapPoints(snapPoints: SheetSnapPoints): void {
  if (
    !Number.isFinite(snapPoints.peek) ||
    !Number.isFinite(snapPoints.half) ||
    !Number.isFinite(snapPoints.full) ||
    snapPoints.peek < 0 ||
    snapPoints.peek >= snapPoints.half ||
    snapPoints.half >= snapPoints.full
  ) {
    throw new Error('控制面板吸附点必须按收起、半屏、全屏递增。');
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
