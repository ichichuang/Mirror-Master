import type {
  IntegerGridSelection,
  NaturalImageSize,
} from '../grid-selection/types';

export interface GridMirrorInput {
  readonly file: File;
  readonly selection: IntegerGridSelection;
}

export interface GridMirrorResult {
  readonly sourceDimensions: NaturalImageSize;
  readonly resultDimensions: NaturalImageSize;
  readonly gridOrigin: {
    readonly left: number;
    readonly top: number;
  };
  readonly cellSize: number;
  readonly columns: 34;
  readonly rows: 27;
  readonly outputCanvas: HTMLCanvasElement;
}

export type GridMirrorFailureReason =
  | 'not-confirmed-by-interaction'
  | 'image-size-mismatch'
  | 'non-integer-geometry'
  | 'invalid-boundaries'
  | 'unequal-spacing'
  | 'out-of-image'
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
