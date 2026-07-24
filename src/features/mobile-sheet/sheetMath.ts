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
