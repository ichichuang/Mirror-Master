import type { PixelGridCalibration } from '../grid-precision/types';
import type { NaturalImageSize } from '../grid-selection/types';

export type GridMirrorProcessingState =
  | 'waiting-for-confirmation'
  | 'ready'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'invalidated';

export interface GridMirrorSourceImage {
  readonly file: File;
  readonly fileName: string;
  readonly objectUrl: string;
  readonly naturalImage: NaturalImageSize;
}

export interface GridMirrorReadyInput {
  readonly file: File;
  readonly calibration: PixelGridCalibration;
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
  | 'not-processing-ready'
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
