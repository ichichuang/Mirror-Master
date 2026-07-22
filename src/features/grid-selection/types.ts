export interface NaturalImageSize {
  readonly width: number;
  readonly height: number;
}

export interface NaturalImageRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly right: number;
  readonly bottom: number;
}

export interface NaturalBoundaryArrays {
  readonly vertical: readonly number[];
  readonly horizontal: readonly number[];
}

export interface GridCellSize {
  readonly width: number;
  readonly height: number;
}

export type GridSelectionSource = 'automatic' | 'manual';

export interface GridSelection {
  readonly source: GridSelectionSource;
  readonly naturalImage: NaturalImageSize;
  readonly rectangle: NaturalImageRect;
  readonly boundaries: NaturalBoundaryArrays;
  readonly cellSize: GridCellSize;
}

export type GridSelectionValidationReason =
  'outside-image' | 'too-small' | 'non-square-cells' | 'invalid-boundaries';

interface GridSelectionValidationBase {
  readonly cellSize: GridCellSize;
  readonly mismatchRatio: number;
  readonly message: string;
}

export interface ValidGridSelectionValidation extends GridSelectionValidationBase {
  readonly ok: true;
}

export interface InvalidGridSelectionValidation extends GridSelectionValidationBase {
  readonly ok: false;
  readonly reason: GridSelectionValidationReason;
}

export type GridSelectionValidation = ValidGridSelectionValidation | InvalidGridSelectionValidation;
