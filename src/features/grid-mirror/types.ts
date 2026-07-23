import type {
  GridBoundarySelection,
  NaturalImageSize,
} from '../grid-selection/types';

export interface GridMirrorInput {
  readonly file: File;
  readonly selection: GridBoundarySelection;
}

export interface GridMirrorResult {
  readonly sourceDimensions: NaturalImageSize;
  readonly resultDimensions: NaturalImageSize;
  readonly gridOrigin: {
    readonly left: number;
    readonly top: number;
  };
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
  readonly outputCanvas: HTMLCanvasElement;
}

export type GridMirrorFailureReason =
  | 'image-size-mismatch'
  | 'invalid-boundaries'
  | 'canvas-unavailable'
  | 'decode-failed';

export interface GridMirrorProcessingSuccess {
  readonly ok: true;
  readonly result: GridMirrorResult;
}

export interface GridMirrorProcessingFailure {
  readonly ok: false;
  readonly reason: GridMirrorFailureReason;
  readonly message: string;
}

export type GridMirrorProcessingOutcome =
  | GridMirrorProcessingSuccess
  | GridMirrorProcessingFailure;
