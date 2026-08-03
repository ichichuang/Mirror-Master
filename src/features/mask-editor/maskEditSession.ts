export type MaskBrushMode = 'keep' | 'remove';

export interface MaskStrokePoint {
  readonly x: number;
  readonly y: number;
}

export interface MaskStroke {
  readonly id: number;
  readonly mode: MaskBrushMode;
  readonly radius: number;
  readonly points: readonly MaskStrokePoint[];
}

export interface MaskEditSessionOptions {
  readonly maxUndo: number;
  readonly defaultBrushSize?: number;
}

export interface MaskEditSession<TSnapshot> {
  readonly brushMode: () => MaskBrushMode;
  readonly setBrushMode: (mode: MaskBrushMode) => void;
  readonly brushSize: () => number;
  readonly setBrushSize: (size: number) => void;
  readonly isPainting: () => boolean;
  readonly beginStroke: (x: number, y: number, radiusPx: number) => void;
  readonly extendStroke: (x: number, y: number) => void;
  readonly endStroke: () => MaskStroke | null;
  readonly cancelStroke: () => void;
  readonly pendingStrokes: () => readonly MaskStroke[];
  readonly inFlightStrokes: () => readonly MaskStroke[];
  readonly takePendingForRefine: () => readonly MaskStroke[];
  readonly dropLastPending: () => MaskStroke | undefined;
  readonly acknowledgeRefine: () => void;
  readonly requeueInFlight: () => void;
  readonly pushUndo: (snapshot: TSnapshot) => void;
  readonly popUndo: () => TSnapshot | undefined;
  readonly undoDepth: () => number;
  readonly clear: () => void;
}

export const MASK_EDIT_MAX_UNDO = 6;
export const MASK_EDIT_MIN_BRUSH_SIZE = 1;
export const MASK_EDIT_MAX_BRUSH_SIZE = 100;
export const MASK_EDIT_DEFAULT_BRUSH_SIZE = 20;

export function createMaskEditSession<TSnapshot>(
  options: MaskEditSessionOptions,
): MaskEditSession<TSnapshot> {
  let brushMode: MaskBrushMode = 'remove';
  let brushSize = clampBrushSize(options.defaultBrushSize ?? MASK_EDIT_DEFAULT_BRUSH_SIZE);
  let activeStroke: {
    readonly id: number;
    readonly mode: MaskBrushMode;
    readonly radius: number;
    points: MaskStrokePoint[];
  } | null = null;
  let nextStrokeId = 0;
  let pending: MaskStroke[] = [];
  let inFlight: readonly MaskStroke[] = [];
  const undoStack: TSnapshot[] = [];

  return Object.freeze({
    brushMode: () => brushMode,
    setBrushMode(mode: MaskBrushMode): void {
      brushMode = mode;
    },
    brushSize: () => brushSize,
    setBrushSize(size: number): void {
      brushSize = clampBrushSize(size);
    },
    isPainting: () => activeStroke !== null,
    beginStroke(x: number, y: number, radiusPx: number): void {
      if (activeStroke !== null) return;
      nextStrokeId += 1;
      activeStroke = {
        id: nextStrokeId,
        mode: brushMode,
        radius: Math.max(1, Math.round(radiusPx)),
        points: [{ x, y }],
      };
    },
    extendStroke(x: number, y: number): void {
      if (activeStroke === null) return;
      const last = activeStroke.points[activeStroke.points.length - 1];
      if (last && last.x === x && last.y === y) return;
      activeStroke.points.push({ x, y });
    },
    endStroke(): MaskStroke | null {
      if (activeStroke === null) return null;
      const completed: MaskStroke = Object.freeze({
        id: activeStroke.id,
        mode: activeStroke.mode,
        radius: activeStroke.radius,
        points: Object.freeze([...activeStroke.points]),
      });
      activeStroke = null;
      pending = [...pending, completed];
      return completed;
    },
    cancelStroke(): void {
      activeStroke = null;
    },
    pendingStrokes: () => pending,
    inFlightStrokes: () => inFlight,
    takePendingForRefine(): readonly MaskStroke[] {
      if (pending.length === 0 || inFlight.length > 0) {
        return Object.freeze([]);
      }
      inFlight = pending;
      pending = [];
      return inFlight;
    },
    dropLastPending(): MaskStroke | undefined {
      const dropped = pending[pending.length - 1];
      if (dropped !== undefined) {
        pending = pending.slice(0, -1);
      }
      return dropped;
    },
    acknowledgeRefine(): void {
      inFlight = [];
    },
    requeueInFlight(): void {
      if (inFlight.length === 0) return;
      pending = [...inFlight, ...pending];
      inFlight = [];
    },
    pushUndo(snapshot: TSnapshot): void {
      undoStack.push(snapshot);
      while (undoStack.length > Math.max(1, options.maxUndo)) {
        undoStack.shift();
      }
    },
    popUndo(): TSnapshot | undefined {
      return undoStack.pop();
    },
    undoDepth: () => undoStack.length,
    clear(): void {
      activeStroke = null;
      pending = [];
      inFlight = [];
      undoStack.length = 0;
      brushMode = 'remove';
      brushSize = clampBrushSize(options.defaultBrushSize ?? MASK_EDIT_DEFAULT_BRUSH_SIZE);
    },
  });
}

export function clampBrushSize(size: number): number {
  if (!Number.isFinite(size)) return MASK_EDIT_DEFAULT_BRUSH_SIZE;
  return Math.min(MASK_EDIT_MAX_BRUSH_SIZE, Math.max(MASK_EDIT_MIN_BRUSH_SIZE, Math.round(size)));
}
