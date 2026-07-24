export interface GridPoint {
  readonly row: number;
  readonly column: number;
}

export function rasterizeGridSegment(start: GridPoint, end: GridPoint): readonly GridPoint[] {
  if (comparePoints(start, end) > 0) {
    return Object.freeze([...rasterizeOrderedSegment(end, start)].reverse());
  }
  return rasterizeOrderedSegment(start, end);
}

function rasterizeOrderedSegment(start: GridPoint, end: GridPoint): readonly GridPoint[] {
  const points: GridPoint[] = [];
  let column = start.column;
  let row = start.row;
  const columnDistance = Math.abs(end.column - start.column);
  const rowDistance = Math.abs(end.row - start.row);
  const columnStep = start.column < end.column ? 1 : -1;
  const rowStep = start.row < end.row ? 1 : -1;
  let error = columnDistance - rowDistance;

  for (;;) {
    points.push(Object.freeze({ row, column }));
    if (column === end.column && row === end.row) {
      break;
    }

    const doubledError = error * 2;
    if (doubledError > -rowDistance) {
      error -= rowDistance;
      column += columnStep;
    }
    if (doubledError < columnDistance) {
      error += columnDistance;
      row += rowStep;
    }
  }

  return Object.freeze(points);
}

function comparePoints(left: GridPoint, right: GridPoint): number {
  return left.row === right.row ? left.column - right.column : left.row - right.row;
}
