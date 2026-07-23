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

export interface GridBoundarySelection {
  readonly naturalImage: NaturalImageSize;
  readonly searchRect: NaturalImageRect;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
  readonly xBoundaries: readonly number[];
  readonly yBoundaries: readonly number[];
}
