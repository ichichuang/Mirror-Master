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

export interface IntegerGridSelection {
  readonly naturalImage: NaturalImageSize;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly cellSize: number;
  readonly columns: 34;
  readonly rows: 27;
  readonly verticalBoundaries: readonly number[];
  readonly horizontalBoundaries: readonly number[];
}
