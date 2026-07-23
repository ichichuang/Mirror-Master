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

export interface IntegerGridModel {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
  readonly verticalBoundaries: readonly number[];
  readonly horizontalBoundaries: readonly number[];
}

export interface IntegerGridSelection extends IntegerGridModel {
  readonly naturalImage: NaturalImageSize;
}
