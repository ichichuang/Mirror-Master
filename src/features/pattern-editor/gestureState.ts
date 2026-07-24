export type EditorGestureMode = 'idle' | 'tool' | 'pan' | 'pinch';
export type PointerIntent = 'tool' | 'pan';

export interface TrackedPointer {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly pointerType: string;
  readonly button: number;
}

export interface PinchMetrics {
  readonly centroid: {
    readonly x: number;
    readonly y: number;
  };
  readonly distance: number;
}

export interface EditorGestureSnapshot {
  readonly mode: EditorGestureMode;
  readonly pointerCount: number;
  readonly pinch: PinchMetrics | null;
}

export class EditorGestureState {
  readonly #pointers = new Map<number, TrackedPointer>();
  #mode: EditorGestureMode = 'idle';

  get snapshot(): EditorGestureSnapshot {
    const pointers = [...this.#pointers.values()];
    return Object.freeze({
      mode: this.#mode,
      pointerCount: this.#pointers.size,
      pinch:
        this.#mode === 'pinch'
          ? calculatePinch(pointers.filter((pointer) => pointer.pointerType === 'touch'))
          : null,
    });
  }

  get pointerIds(): readonly number[] {
    return Object.freeze([...this.#pointers.keys()]);
  }

  getPointer(pointerId: number): TrackedPointer | null {
    return this.#pointers.get(pointerId) ?? null;
  }

  begin(pointer: TrackedPointer, intent: PointerIntent): EditorGestureSnapshot {
    this.#pointers.set(pointer.id, Object.freeze({ ...pointer }));
    const touchCount = [...this.#pointers.values()].filter(
      (candidate) => candidate.pointerType === 'touch',
    ).length;
    this.#mode = touchCount >= 2 ? 'pinch' : intent;
    return this.snapshot;
  }

  update(pointer: TrackedPointer): EditorGestureSnapshot {
    if (this.#pointers.has(pointer.id)) {
      this.#pointers.set(pointer.id, Object.freeze({ ...pointer }));
    }
    return this.snapshot;
  }

  end(pointerId: number): EditorGestureSnapshot {
    if (this.#mode === 'pinch') {
      this.cancelAll();
      return this.snapshot;
    }

    this.#pointers.delete(pointerId);
    if (this.#pointers.size === 0) {
      this.#mode = 'idle';
    }
    return this.snapshot;
  }

  cancelAll(): void {
    this.#pointers.clear();
    this.#mode = 'idle';
  }
}

export function resolvePointerIntent(
  pointerType: string,
  button: number,
  spacePressed: boolean,
): PointerIntent {
  return pointerType === 'mouse' && (button === 1 || (button === 0 && spacePressed))
    ? 'pan'
    : 'tool';
}

function calculatePinch(pointers: readonly TrackedPointer[]): PinchMetrics | null {
  const first = pointers[0];
  const second = pointers[1];
  if (!first || !second) {
    return null;
  }

  return Object.freeze({
    centroid: Object.freeze({
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    }),
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  });
}
