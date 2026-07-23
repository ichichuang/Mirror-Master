export interface SupportedGridLine {
  readonly position: number;
  readonly support: number;
  readonly width?: number;
}

export interface SnapCellCandidate {
  readonly cellSize: number;
  readonly rawX: number;
  readonly rawY: number;
  readonly evidenceWeight: number;
}

export interface SnapRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly right: number;
  readonly bottom: number;
}

export interface SnappedBoundaryModel {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
  readonly xBoundaries: readonly number[];
  readonly yBoundaries: readonly number[];
  readonly offsets: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  };
}

interface SupportedEdge {
  readonly position: number;
  readonly support: number;
  readonly offset: number;
}

interface EvaluatedSnap {
  readonly model: SnappedBoundaryModel;
  readonly minimumEdgeSupport: number;
  readonly totalEdgeSupport: number;
  readonly fullSpanCoverage: number;
  readonly boundaryEvidence: number;
  readonly squareAgreement: number;
  readonly candidateEvidence: number;
  readonly centerOffset: number;
  readonly totalOffset: number;
}

const MIN_FULL_SPAN_COVERAGE = 0.7;
const MAX_SQUARE_DISAGREEMENT = 2;

export function snapBoundaryRectangle(input: {
  readonly rectangle: SnapRectangle;
  readonly candidates: readonly SnapCellCandidate[];
  readonly xLines: readonly SupportedGridLine[];
  readonly yLines: readonly SupportedGridLine[];
}): SnappedBoundaryModel | null {
  const evaluated: EvaluatedSnap[] = [];

  for (const candidate of input.candidates) {
    const cellSize = candidate.cellSize;

    if (
      !Number.isInteger(cellSize) ||
      cellSize <= 0 ||
      Math.abs(candidate.rawX - candidate.rawY) > MAX_SQUARE_DISAGREEMENT
    ) {
      continue;
    }

    const tolerance = Math.max(3, Math.round(cellSize * 0.2));
    const leftEdges = findSupportedEdges(input.xLines, input.rectangle.x, tolerance);
    const rightEdges = findSupportedEdges(input.xLines, input.rectangle.right, tolerance);
    const topEdges = findSupportedEdges(input.yLines, input.rectangle.y, tolerance);
    const bottomEdges = findSupportedEdges(input.yLines, input.rectangle.bottom, tolerance);

    if (
      leftEdges.length === 0 ||
      rightEdges.length === 0 ||
      topEdges.length === 0 ||
      bottomEdges.length === 0
    ) {
      continue;
    }

    for (const left of leftEdges) {
      for (const right of rightEdges) {
        const width = right.position - left.position;
        const columns = Math.round(width / cellSize);

        if (columns <= 0 || columns * cellSize !== width) {
          continue;
        }

        const xBoundaries = createBoundaries(left.position, columns, cellSize);
        const xEvidence = evaluateBoundaryEvidence(input.xLines, xBoundaries, tolerance);

        for (const top of topEdges) {
          for (const bottom of bottomEdges) {
            const height = bottom.position - top.position;
            const rows = Math.round(height / cellSize);

            if (rows <= 0 || rows * cellSize !== height) {
              continue;
            }

            const yBoundaries = createBoundaries(top.position, rows, cellSize);
            const yEvidence = evaluateBoundaryEvidence(input.yLines, yBoundaries, tolerance);
            const fullSpanCoverage =
              (xEvidence.matched + yEvidence.matched) / (xBoundaries.length + yBoundaries.length);

            if (fullSpanCoverage < MIN_FULL_SPAN_COVERAGE) {
              continue;
            }

            const edgeSupports = [left.support, top.support, right.support, bottom.support];
            const offsets = {
              left: left.offset,
              top: top.offset,
              right: right.offset,
              bottom: bottom.offset,
            };
            const model: SnappedBoundaryModel = Object.freeze({
              left: left.position,
              top: top.position,
              right: right.position,
              bottom: bottom.position,
              cellSize,
              columns,
              rows,
              xBoundaries,
              yBoundaries,
              offsets: Object.freeze(offsets),
            });

            evaluated.push({
              model,
              minimumEdgeSupport: Math.min(...edgeSupports),
              totalEdgeSupport: edgeSupports.reduce((sum, support) => sum + support, 0),
              fullSpanCoverage,
              boundaryEvidence:
                (xEvidence.support + yEvidence.support) / (xBoundaries.length + yBoundaries.length),
              squareAgreement: Math.abs(candidate.rawX - candidate.rawY),
              candidateEvidence: candidate.evidenceWeight,
              centerOffset:
                Math.abs(offsets.left + offsets.right) + Math.abs(offsets.top + offsets.bottom),
              totalOffset:
                Math.abs(offsets.left) +
                Math.abs(offsets.top) +
                Math.abs(offsets.right) +
                Math.abs(offsets.bottom),
            });
          }
        }
      }
    }
  }

  return [...evaluated].sort(compareEvaluatedSnaps)[0]?.model ?? null;
}

function findSupportedEdges(
  lines: readonly SupportedGridLine[],
  edge: number,
  tolerance: number,
): readonly SupportedEdge[] {
  const byPosition = new Map<number, SupportedEdge>();

  for (const line of lines) {
    if (!Number.isInteger(line.position) || !Number.isFinite(line.support) || line.support <= 0) {
      continue;
    }

    const width = Math.max(1, Math.min(tolerance + 1, Math.round(line.width ?? 1)));

    for (let bandOffset = 0; bandOffset < width; bandOffset += 1) {
      const position = line.position + bandOffset;
      const offset = position - edge;

      if (Math.abs(offset) > tolerance) {
        continue;
      }

      const existing = byPosition.get(position);

      if (!existing || line.support > existing.support) {
        byPosition.set(position, {
          position,
          support: line.support,
          offset,
        });
      }
    }
  }

  return [...byPosition.values()]
    .sort(
      (left, right) =>
        Math.abs(left.offset) - Math.abs(right.offset) ||
        right.support - left.support ||
        left.position - right.position,
    )
    .slice(0, 8);
}

function createBoundaries(start: number, count: number, cellSize: number): readonly number[] {
  return Object.freeze(Array.from({ length: count + 1 }, (_, index) => start + index * cellSize));
}

function evaluateBoundaryEvidence(
  lines: readonly SupportedGridLine[],
  boundaries: readonly number[],
  tolerance: number,
): {
  readonly matched: number;
  readonly support: number;
} {
  let matched = 0;
  let support = 0;

  for (const boundary of boundaries) {
    const line = findSupportedEdges(lines, boundary, tolerance)[0];

    if (line) {
      matched += 1;
      support += line.support;
    }
  }

  return {
    matched,
    support,
  };
}

function compareEvaluatedSnaps(left: EvaluatedSnap, right: EvaluatedSnap): number {
  return (
    right.minimumEdgeSupport - left.minimumEdgeSupport ||
    right.totalEdgeSupport - left.totalEdgeSupport ||
    right.fullSpanCoverage - left.fullSpanCoverage ||
    right.boundaryEvidence - left.boundaryEvidence ||
    left.squareAgreement - right.squareAgreement ||
    right.candidateEvidence - left.candidateEvidence ||
    left.centerOffset - right.centerOffset ||
    left.totalOffset - right.totalOffset
  );
}
