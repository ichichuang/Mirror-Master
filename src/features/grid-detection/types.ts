import type { PIXELANIM_GRID_COLUMNS, PIXELANIM_GRID_ROWS } from './constants';
import type {
  GridCellSize,
  NaturalBoundaryArrays,
  NaturalImageRect,
  NaturalImageSize,
} from '../grid-selection/types';

export type {
  GridCellSize,
  NaturalBoundaryArrays,
  NaturalImageRect,
  NaturalImageSize,
} from '../grid-selection/types';

export interface DetectionMetrics {
  readonly geometry: number;
  readonly periodicity: number;
  readonly boundaryStrength: number;
  readonly contrast: number;
  readonly score: number;
}

export type ConfidenceGrade = 'high' | 'medium' | 'low';

export const CONFIDENCE_LABELS: Record<ConfidenceGrade, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

export interface DetectionConfidence {
  readonly grade: ConfidenceGrade;
  readonly label: string;
  readonly score: number;
}

export type GridDetectionFailureReason =
  | 'canvas-unavailable'
  | 'decode-failed'
  | 'image-too-small'
  | 'no-periodic-grid'
  | 'geometry-inconsistent'
  | 'weak-boundary-evidence'
  | 'low-confidence';

export interface GridDetectionSuccess {
  readonly ok: true;
  readonly columns: typeof PIXELANIM_GRID_COLUMNS;
  readonly rows: typeof PIXELANIM_GRID_ROWS;
  readonly naturalImage: NaturalImageSize;
  readonly rectangle: NaturalImageRect;
  readonly boundaries: NaturalBoundaryArrays;
  readonly cellSize: GridCellSize;
  readonly metrics: DetectionMetrics;
  readonly confidence: DetectionConfidence;
}

export interface GridDetectionFailure {
  readonly ok: false;
  readonly reason: GridDetectionFailureReason;
  readonly message: string;
  readonly naturalImage?: NaturalImageSize;
  readonly metrics?: DetectionMetrics;
  readonly confidence?: DetectionConfidence;
}

export type GridDetectionOutcome = GridDetectionSuccess | GridDetectionFailure;
