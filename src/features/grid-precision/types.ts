import type { PIXELANIM_GRID_COLUMNS, PIXELANIM_GRID_ROWS } from '../grid-selection/constants';
import type { GridSelectionSource, NaturalImageSize } from '../grid-selection/types';

export type PixelGridPrecisionState =
  'idle' | 'refining' | 'candidate' | 'confirmed-ready' | 'rejected';

export interface PixelGridEvidenceMetrics {
  readonly boundaryStrength: number;
  readonly centerContrast: number;
  readonly periodicConsistency: number;
  readonly outerEdgeSupport: number;
  readonly score: number;
  readonly ambiguityGap: number;
}

export type PixelGridCandidateValidationReason =
  | 'non-integer'
  | 'non-positive-cell'
  | 'out-of-bounds'
  | 'wrong-grid-size'
  | 'invalid-boundaries'
  | 'weak-evidence'
  | 'ambiguous-candidate'
  | 'non-integer-scale';

export interface ValidPixelGridCandidateValidation {
  readonly ok: true;
  readonly message: string;
}

export interface InvalidPixelGridCandidateValidation {
  readonly ok: false;
  readonly reason: PixelGridCandidateValidationReason;
  readonly message: string;
}

export type PixelGridCandidateValidation =
  ValidPixelGridCandidateValidation | InvalidPixelGridCandidateValidation;

export interface PixelGridCalibrationCandidate {
  readonly source: GridSelectionSource;
  readonly naturalImage: NaturalImageSize;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly cellSize: number;
  readonly columns: typeof PIXELANIM_GRID_COLUMNS;
  readonly rows: typeof PIXELANIM_GRID_ROWS;
  readonly verticalBoundaries: readonly number[];
  readonly horizontalBoundaries: readonly number[];
  readonly evidence: PixelGridEvidenceMetrics;
  readonly validation: PixelGridCandidateValidation;
  readonly processingReady: false;
}

export interface PixelGridCalibration {
  readonly source: GridSelectionSource;
  readonly naturalImage: NaturalImageSize;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly cellSize: number;
  readonly columns: typeof PIXELANIM_GRID_COLUMNS;
  readonly rows: typeof PIXELANIM_GRID_ROWS;
  readonly verticalBoundaries: readonly number[];
  readonly horizontalBoundaries: readonly number[];
  readonly evidence: PixelGridEvidenceMetrics;
  readonly processingReady: true;
}

export type PixelGridPrecisionFailureReason =
  | 'canvas-unavailable'
  | 'decode-failed'
  | 'image-size-mismatch'
  | 'rough-selection-invalid'
  | 'out-of-bounds'
  | 'weak-evidence'
  | 'ambiguous-candidate'
  | 'non-integer-scale';

export interface PixelGridPrecisionSuccess {
  readonly ok: true;
  readonly candidate: PixelGridCalibrationCandidate;
}

export interface PixelGridPrecisionFailure {
  readonly ok: false;
  readonly reason: PixelGridPrecisionFailureReason;
  readonly message: string;
  readonly candidate?: PixelGridCalibrationCandidate;
}

export type PixelGridPrecisionOutcome = PixelGridPrecisionSuccess | PixelGridPrecisionFailure;
