import type {
  GridBoundarySelection,
  NaturalImageRect,
  NaturalImageSize,
} from '../grid-selection/types';

export interface GridDetectionInput {
  readonly file: File;
  readonly naturalImage: NaturalImageSize;
  readonly searchRect: NaturalImageRect;
}

export type GridDetectionFailureReason =
  | 'opencv-unavailable'
  | 'canvas-unavailable'
  | 'decode-failed'
  | 'image-size-mismatch'
  | 'invalid-search-rectangle'
  | 'no-grid-boundaries';

export interface GridDetectionSuccess {
  readonly ok: true;
  readonly selection: GridBoundarySelection;
}

export interface GridDetectionFailure {
  readonly ok: false;
  readonly reason: GridDetectionFailureReason;
  readonly message: string;
}

export type GridDetectionOutcome =
  | GridDetectionSuccess
  | GridDetectionFailure;
