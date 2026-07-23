import { loadOpenCV, type OpenCV } from '@opencvjs/web';

import {
  createGridBoundarySelection,
  isValidGridBoundarySelection,
} from '../grid-selection/geometry';
import type {
  NaturalImageRect,
  NaturalImageSize,
} from '../grid-selection/types';
import type {
  GridDetectionFailure,
  GridDetectionFailureReason,
  GridDetectionInput,
  GridDetectionOutcome,
} from './types';

type OpenCvApi = typeof OpenCV;
type CvMat = ReturnType<OpenCvApi['matFromImageData']>;
type Axis = 'x' | 'y';

interface LoadedRaster {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  readonly close: () => void;
}

interface LineCluster {
  readonly center: number;
  readonly weight: number;
  readonly width: number;
}

interface AxisEvidence {
  readonly profile: Float32Array;
  readonly clusters: readonly LineCluster[];
}

interface LineEvidence {
  readonly x: AxisEvidence;
  readonly y: AxisEvidence;
}

interface SpacingObservation {
  readonly value: number;
  readonly weight: number;
}

interface SharedSpacingCandidate {
  readonly cellSize: number;
  readonly rawX: number;
  readonly rawY: number;
  readonly evidenceWeight: number;
}

interface AxisFit {
  readonly start: number;
  readonly lineCount: number;
  readonly coverage: number;
  readonly score: number;
}

interface BoundaryModel {
  readonly cellSize: number;
  readonly xBoundaries: readonly number[];
  readonly yBoundaries: readonly number[];
}

interface CellStatistics {
  readonly darkRatio: number;
  readonly colorRatio: number;
}

const MIN_CELL_SIZE = 3;
const MIN_BOUNDARY_COUNT = 4;
const MIN_MATCH_COVERAGE = 0.8;
const HARMONIC_SCORE_RETENTION = 0.9;
const MAX_HARMONIC_DIVISOR = 6;
const MAX_AXIS_SPACING_OBSERVATIONS = 64;
const MAX_SHARED_SPACING_CANDIDATES = 72;
const MAX_SPACING_DISAGREEMENT = 2;
const LABEL_BAND_CELL_RATIO = 0.62;

let openCvPromise: Promise<OpenCvApi> | null = null;

export async function detectPixelanimGrid(
  input: GridDetectionInput,
): Promise<GridDetectionOutcome> {
  if (!isValidSearchRectangle(input.searchRect, input.naturalImage)) {
    return failure(
      'invalid-search-rectangle',
      '搜索区域无效，请重新调整。',
    );
  }

  let raster: LoadedRaster;

  try {
    raster = await loadRasterFromFile(input.file);
  } catch {
    return failure('decode-failed', '无法读取当前图片。');
  }

  try {
    if (
      raster.width !== input.naturalImage.width ||
      raster.height !== input.naturalImage.height
    ) {
      return failure(
        'image-size-mismatch',
        '当前图片已变化，请重新选择图片。',
      );
    }

    const imageData = readSearchPixels(raster, input.searchRect);

    if (!imageData) {
      return failure(
        'canvas-unavailable',
        '当前浏览器无法读取图片像素。',
      );
    }

    let cv: OpenCvApi;

    try {
      cv = await getOpenCv();
    } catch {
      return failure(
        'opencv-unavailable',
        '网格识别组件无法初始化。',
      );
    }

    const localModel = detectBoundaryModel(cv, imageData);

    if (!localModel) {
      return failure(
        'no-grid-boundaries',
        '未识别到完整网格，请调整搜索区域。',
      );
    }

    const naturalModel = offsetBoundaryModel(localModel, input.searchRect);
    const trimmedModel = trimLabelBands(
      naturalModel,
      imageData,
      input.searchRect,
    );
    const selection = createGridBoundarySelection({
      naturalImage: input.naturalImage,
      searchRect: input.searchRect,
      cellSize: trimmedModel.cellSize,
      xBoundaries: trimmedModel.xBoundaries,
      yBoundaries: trimmedModel.yBoundaries,
    });

    if (!selection || !isValidGridBoundarySelection(selection)) {
      return failure(
        'no-grid-boundaries',
        '未识别到完整网格，请调整搜索区域。',
      );
    }

    return {
      ok: true,
      selection,
    };
  } finally {
    raster.close();
  }
}

function getOpenCv(): Promise<OpenCvApi> {
  openCvPromise ??= loadOpenCV();
  return openCvPromise;
}

function detectBoundaryModel(
  cv: OpenCvApi,
  imageData: ImageData,
): BoundaryModel | null {
  const rgba = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const binary = new cv.Mat();

  try {
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    cv.adaptiveThreshold(
      gray,
      binary,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      chooseAdaptiveBlockSize(imageData.width, imageData.height),
      5,
    );

    const primaryEvidence = extractLineEvidence(cv, gray, binary, false);
    const primaryModel = inferBoundaryModel(primaryEvidence);

    if (primaryModel) {
      return primaryModel;
    }

    const fallbackEvidence = extractLineEvidence(cv, gray, binary, true);
    return inferBoundaryModel(fallbackEvidence);
  } finally {
    rgba.delete();
    gray.delete();
    binary.delete();
  }
}

function extractLineEvidence(
  cv: OpenCvApi,
  gray: CvMat,
  binary: CvMat,
  includeHoughFallback: boolean,
): LineEvidence {
  const verticalMask = new cv.Mat();
  const horizontalMask = new cv.Mat();
  const verticalKernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(1, chooseMorphologyLength(binary.rows)),
  );
  const horizontalKernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(chooseMorphologyLength(binary.cols), 1),
  );

  try {
    cv.morphologyEx(binary, verticalMask, cv.MORPH_OPEN, verticalKernel);
    cv.morphologyEx(binary, horizontalMask, cv.MORPH_OPEN, horizontalKernel);

    if (includeHoughFallback) {
      addHoughFallback(cv, gray, verticalMask, horizontalMask);
    }

    const xProfile = projectMask(verticalMask, 'x');
    const yProfile = projectMask(horizontalMask, 'y');

    return {
      x: {
        profile: xProfile,
        clusters: clusterLinePixels(xProfile),
      },
      y: {
        profile: yProfile,
        clusters: clusterLinePixels(yProfile),
      },
    };
  } finally {
    verticalMask.delete();
    horizontalMask.delete();
    verticalKernel.delete();
    horizontalKernel.delete();
  }
}

function addHoughFallback(
  cv: OpenCvApi,
  gray: CvMat,
  verticalMask: CvMat,
  horizontalMask: CvMat,
): void {
  const edges = new cv.Mat();
  const lines = new cv.Mat();
  const houghVertical = new cv.Mat(
    gray.rows,
    gray.cols,
    cv.CV_8UC1,
    cv.Scalar.all(0),
  );
  const houghHorizontal = new cv.Mat(
    gray.rows,
    gray.cols,
    cv.CV_8UC1,
    cv.Scalar.all(0),
  );

  try {
    cv.Canny(gray, edges, 50, 150, 3, false);
    cv.HoughLinesP(
      edges,
      lines,
      1,
      Math.PI / 180,
      Math.max(16, Math.round(Math.min(gray.cols, gray.rows) * 0.025)),
      Math.max(12, Math.round(Math.min(gray.cols, gray.rows) * 0.06)),
      Math.max(4, Math.round(Math.min(gray.cols, gray.rows) * 0.025)),
    );

    const color = cv.Scalar.all(255);

    for (let row = 0; row < lines.rows; row += 1) {
      const offset = row * 4;
      const x1 = lines.data32S[offset];
      const y1 = lines.data32S[offset + 1];
      const x2 = lines.data32S[offset + 2];
      const y2 = lines.data32S[offset + 3];

      if (
        x1 === undefined ||
        y1 === undefined ||
        x2 === undefined ||
        y2 === undefined
      ) {
        continue;
      }

      const deltaX = Math.abs(x2 - x1);
      const deltaY = Math.abs(y2 - y1);

      if (deltaX <= Math.max(2, deltaY * 0.025)) {
        cv.line(
          houghVertical,
          new cv.Point(Math.round((x1 + x2) / 2), y1),
          new cv.Point(Math.round((x1 + x2) / 2), y2),
          color,
          1,
        );
      } else if (deltaY <= Math.max(2, deltaX * 0.025)) {
        cv.line(
          houghHorizontal,
          new cv.Point(x1, Math.round((y1 + y2) / 2)),
          new cv.Point(x2, Math.round((y1 + y2) / 2)),
          color,
          1,
        );
      }
    }

    cv.bitwise_or(verticalMask, houghVertical, verticalMask);
    cv.bitwise_or(horizontalMask, houghHorizontal, horizontalMask);
  } finally {
    edges.delete();
    lines.delete();
    houghVertical.delete();
    houghHorizontal.delete();
  }
}

function projectMask(mask: CvMat, axis: Axis): Float32Array {
  const length = axis === 'x' ? mask.cols : mask.rows;
  const crossLength = axis === 'x' ? mask.rows : mask.cols;
  const profile = new Float32Array(length);

  if (axis === 'x') {
    for (let y = 0; y < mask.rows; y += 1) {
      const rowOffset = y * mask.cols;

      for (let x = 0; x < mask.cols; x += 1) {
        if ((mask.data8U[rowOffset + x] ?? 0) > 0) {
          profile[x] = (profile[x] ?? 0) + 1;
        }
      }
    }
  } else {
    for (let y = 0; y < mask.rows; y += 1) {
      const rowOffset = y * mask.cols;
      let count = 0;

      for (let x = 0; x < mask.cols; x += 1) {
        if ((mask.data8U[rowOffset + x] ?? 0) > 0) {
          count += 1;
        }
      }

      profile[y] = count;
    }
  }

  for (let index = 0; index < profile.length; index += 1) {
    profile[index] = (profile[index] ?? 0) / Math.max(1, crossLength);
  }

  return profile;
}

function clusterLinePixels(profile: Float32Array): readonly LineCluster[] {
  const peak = maximum(profile);

  if (peak <= 0) {
    return [];
  }

  const threshold = Math.max(
    0.02,
    peak * 0.12,
    percentile(profile, 0.82) * 0.42,
  );
  const maximumClusterWidth = Math.max(
    7,
    Math.round(profile.length * 0.012),
  );
  const clusters: LineCluster[] = [];
  let start = -1;
  let lastEvidence = -1;
  let weightedPosition = 0;
  let weight = 0;

  const flush = (): void => {
    if (start < 0 || lastEvidence < start || weight <= 0) {
      start = -1;
      lastEvidence = -1;
      weightedPosition = 0;
      weight = 0;
      return;
    }

    const width = lastEvidence - start + 1;

    if (width <= maximumClusterWidth) {
      clusters.push({
        center: Math.round(weightedPosition / weight),
        weight,
        width,
      });
    }

    start = -1;
    lastEvidence = -1;
    weightedPosition = 0;
    weight = 0;
  };

  for (let index = 0; index < profile.length; index += 1) {
    const value = profile[index] ?? 0;

    if (value >= threshold) {
      if (start < 0) {
        start = index;
      } else if (lastEvidence >= 0 && index - lastEvidence > 2) {
        flush();
        start = index;
      }

      lastEvidence = index;
      weightedPosition += index * value;
      weight += value;
    } else if (start >= 0 && lastEvidence >= 0 && index - lastEvidence > 1) {
      flush();
    }
  }

  flush();
  return mergeDuplicateClusters(clusters);
}

function mergeDuplicateClusters(
  clusters: readonly LineCluster[],
): readonly LineCluster[] {
  const ordered = [...clusters].sort(
    (left, right) => left.center - right.center,
  );
  const merged: LineCluster[] = [];

  for (const cluster of ordered) {
    const previous = merged[merged.length - 1];

    if (!previous || cluster.center - previous.center > 2) {
      merged.push(cluster);
      continue;
    }

    const totalWeight = previous.weight + cluster.weight;
    merged[merged.length - 1] = {
      center: Math.round(
        (previous.center * previous.weight +
          cluster.center * cluster.weight) /
          totalWeight,
      ),
      weight: totalWeight,
      width: Math.max(previous.width, cluster.width),
    };
  }

  return merged;
}

function inferBoundaryModel(
  evidence: LineEvidence,
): BoundaryModel | null {
  if (
    evidence.x.clusters.length < MIN_BOUNDARY_COUNT ||
    evidence.y.clusters.length < MIN_BOUNDARY_COUNT
  ) {
    return null;
  }

  const xSpacing = collectSpacingObservations(evidence.x.clusters);
  const ySpacing = collectSpacingObservations(evidence.y.clusters);
  const sharedCandidates = createSharedSpacingCandidates(xSpacing, ySpacing);
  const evaluated: Array<{
    readonly candidate: SharedSpacingCandidate;
    readonly xFit: AxisFit;
    readonly yFit: AxisFit;
    readonly score: number;
  }> = [];

  for (const candidate of sharedCandidates) {
    const xFit = evaluateAxisSpacing(
      evidence.x,
      candidate.cellSize,
    );
    const yFit = evaluateAxisSpacing(
      evidence.y,
      candidate.cellSize,
    );

    if (
      !xFit ||
      !yFit ||
      xFit.coverage < MIN_MATCH_COVERAGE ||
      yFit.coverage < MIN_MATCH_COVERAGE
    ) {
      continue;
    }

    evaluated.push({
      candidate,
      xFit,
      yFit,
      score: (xFit.score + yFit.score) / 2,
    });
  }

  const bestScore = evaluated.reduce(
    (best, current) => Math.max(best, current.score),
    0,
  );
  const selected = evaluated
    .filter(
      (current) =>
        current.score >= bestScore * HARMONIC_SCORE_RETENTION &&
        Math.abs(current.candidate.rawX - current.candidate.rawY) <=
          MAX_SPACING_DISAGREEMENT,
    )
    .sort(
      (left, right) =>
        left.candidate.cellSize - right.candidate.cellSize ||
        right.score - left.score,
    )[0];

  if (!selected) {
    return null;
  }

  const xBoundaries = refineAxisBoundaries(
    evidence.x.profile,
    selected.xFit,
    selected.candidate.cellSize,
  );
  const yBoundaries = refineAxisBoundaries(
    evidence.y.profile,
    selected.yFit,
    selected.candidate.cellSize,
  );

  if (
    xBoundaries.length < MIN_BOUNDARY_COUNT ||
    yBoundaries.length < MIN_BOUNDARY_COUNT
  ) {
    return null;
  }

  return {
    cellSize: selected.candidate.cellSize,
    xBoundaries,
    yBoundaries,
  };
}

function collectSpacingObservations(
  clusters: readonly LineCluster[],
): readonly SpacingObservation[] {
  const raw: SpacingObservation[] = [];

  for (let leftIndex = 0; leftIndex < clusters.length; leftIndex += 1) {
    const left = clusters[leftIndex];

    if (!left) {
      continue;
    }

    const lastIndex = Math.min(clusters.length, leftIndex + 10);

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < lastIndex;
      rightIndex += 1
    ) {
      const right = clusters[rightIndex];

      if (!right) {
        continue;
      }

      const distance = right.center - left.center;

      for (
        let divisor = 1;
        divisor <= MAX_HARMONIC_DIVISOR;
        divisor += 1
      ) {
        const spacing = distance / divisor;

        if (spacing < MIN_CELL_SIZE) {
          break;
        }

        raw.push({
          value: spacing,
          weight:
            Math.min(left.weight, right.weight) /
            Math.max(1, divisor * 0.75),
        });
      }
    }
  }

  return groupSpacingObservations(raw).slice(
    0,
    MAX_AXIS_SPACING_OBSERVATIONS,
  );
}

function groupSpacingObservations(
  observations: readonly SpacingObservation[],
): readonly SpacingObservation[] {
  const ordered = [...observations].sort(
    (left, right) => left.value - right.value,
  );
  const groups: Array<{
    weightedValue: number;
    weight: number;
  }> = [];

  for (const observation of ordered) {
    const previous = groups[groups.length - 1];
    const previousValue = previous
      ? previous.weightedValue / previous.weight
      : Number.NEGATIVE_INFINITY;

    if (!previous || Math.abs(observation.value - previousValue) > 1.25) {
      groups.push({
        weightedValue: observation.value * observation.weight,
        weight: observation.weight,
      });
      continue;
    }

    previous.weightedValue += observation.value * observation.weight;
    previous.weight += observation.weight;
  }

  return groups
    .map((group) => ({
      value: group.weightedValue / group.weight,
      weight: group.weight,
    }))
    .sort((left, right) => right.weight - left.weight);
}

function createSharedSpacingCandidates(
  xObservations: readonly SpacingObservation[],
  yObservations: readonly SpacingObservation[],
): readonly SharedSpacingCandidate[] {
  const byCellSize = new Map<number, SharedSpacingCandidate>();

  for (const xObservation of xObservations) {
    for (const yObservation of yObservations) {
      if (
        Math.abs(xObservation.value - yObservation.value) >
        MAX_SPACING_DISAGREEMENT
      ) {
        continue;
      }

      for (
        let divisor = 1;
        divisor <= MAX_HARMONIC_DIVISOR;
        divisor += 1
      ) {
        const rawX = xObservation.value / divisor;
        const rawY = yObservation.value / divisor;
        const cellSize = Math.round((rawX + rawY) / 2);

        if (
          cellSize < MIN_CELL_SIZE ||
          Math.abs(rawX - rawY) > MAX_SPACING_DISAGREEMENT
        ) {
          continue;
        }

        const existing = byCellSize.get(cellSize);
        const next: SharedSpacingCandidate = {
          cellSize,
          rawX,
          rawY,
          evidenceWeight:
            Math.sqrt(xObservation.weight * yObservation.weight) /
            divisor,
        };

        if (
          !existing ||
          next.evidenceWeight > existing.evidenceWeight ||
          (next.evidenceWeight === existing.evidenceWeight &&
            Math.abs(rawX - rawY) <
              Math.abs(existing.rawX - existing.rawY))
        ) {
          byCellSize.set(cellSize, next);
        }
      }
    }
  }

  return [...byCellSize.values()]
    .sort(
      (left, right) =>
        right.evidenceWeight - left.evidenceWeight ||
        left.cellSize - right.cellSize,
    )
    .slice(0, MAX_SHARED_SPACING_CANDIDATES);
}

function evaluateAxisSpacing(
  evidence: AxisEvidence,
  cellSize: number,
): AxisFit | null {
  const phases = new Set<number>();

  for (const cluster of evidence.clusters) {
    phases.add(positiveModulo(cluster.center, cellSize));
  }

  const peak = maximum(evidence.profile);
  const matchThreshold = Math.max(0.018, peak * 0.1);
  const matchRadius = Math.max(
    1,
    Math.min(4, Math.round(cellSize * 0.1)),
  );
  let best: AxisFit | null = null;

  for (const phase of phases) {
    const positions: number[] = [];

    for (
      let position = phase;
      position <= evidence.profile.length;
      position += cellSize
    ) {
      positions.push(position);
    }

    if (positions.length < MIN_BOUNDARY_COUNT) {
      continue;
    }

    const evidencePrefix = [0];
    const matchPrefix = [0];

    for (const position of positions) {
      const lineEvidence = sampleBoundaryEvidence(
        evidence.profile,
        position,
        matchRadius,
        peak,
      );
      evidencePrefix.push(
        (evidencePrefix[evidencePrefix.length - 1] ?? 0) + lineEvidence,
      );
      matchPrefix.push(
        (matchPrefix[matchPrefix.length - 1] ?? 0) +
          (lineEvidence >= matchThreshold ? 1 : 0),
      );
    }

    for (
      let startIndex = 0;
      startIndex <= positions.length - MIN_BOUNDARY_COUNT;
      startIndex += 1
    ) {
      for (
        let endIndex = startIndex + MIN_BOUNDARY_COUNT;
        endIndex <= positions.length;
        endIndex += 1
      ) {
        const lineCount = endIndex - startIndex;
        const matches =
          (matchPrefix[endIndex] ?? 0) -
          (matchPrefix[startIndex] ?? 0);
        const coverage = matches / lineCount;

        if (coverage < MIN_MATCH_COVERAGE) {
          continue;
        }

        const evidenceAverage =
          ((evidencePrefix[endIndex] ?? 0) -
            (evidencePrefix[startIndex] ?? 0)) /
          lineCount;
        const lengthEvidence = Math.min(
          1,
          (lineCount - 1) / 24,
        );
        const score =
          evidenceAverage * 0.45 +
          coverage * 0.35 +
          lengthEvidence * 0.2;
        const start = positions[startIndex];

        if (
          start !== undefined &&
          (!best ||
            score > best.score ||
            (score === best.score && lineCount > best.lineCount))
        ) {
          best = {
            start,
            lineCount,
            coverage,
            score,
          };
        }
      }
    }
  }

  return best;
}

function refineAxisBoundaries(
  profile: Float32Array,
  fit: AxisFit,
  cellSize: number,
): readonly number[] {
  const searchRadius = Math.max(
    3,
    Math.min(10, Math.round(cellSize * 0.25)),
  );
  let bestStart = fit.start;
  let bestScore = Number.NEGATIVE_INFINITY;
  const peak = maximum(profile);

  for (
    let start = fit.start - searchRadius;
    start <= fit.start + searchRadius;
    start += 1
  ) {
    const end = start + (fit.lineCount - 1) * cellSize;

    if (start < 0 || end > profile.length) {
      continue;
    }

    let score = 0;

    for (let index = 0; index < fit.lineCount; index += 1) {
      score += sampleBoundaryEvidence(
        profile,
        start + index * cellSize,
        1,
        peak,
      );
    }

    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }

  return Object.freeze(
    Array.from(
      { length: fit.lineCount },
      (_, index) => bestStart + index * cellSize,
    ),
  );
}

function offsetBoundaryModel(
  model: BoundaryModel,
  searchRect: NaturalImageRect,
): BoundaryModel {
  return {
    cellSize: model.cellSize,
    xBoundaries: Object.freeze(
      model.xBoundaries.map((boundary) => boundary + searchRect.x),
    ),
    yBoundaries: Object.freeze(
      model.yBoundaries.map((boundary) => boundary + searchRect.y),
    ),
  };
}

function trimLabelBands(
  model: BoundaryModel,
  imageData: ImageData,
  searchRect: NaturalImageRect,
): BoundaryModel {
  let xBoundaries = [...model.xBoundaries];
  let yBoundaries = [...model.yBoundaries];

  if (xBoundaries.length >= 6 && yBoundaries.length >= 6) {
    const topScore = scoreHorizontalLabelBand(
      imageData,
      searchRect,
      xBoundaries,
      yBoundaries[0],
      yBoundaries[1],
    );
    const bottomScore = scoreHorizontalLabelBand(
      imageData,
      searchRect,
      xBoundaries,
      yBoundaries[yBoundaries.length - 2],
      yBoundaries[yBoundaries.length - 1],
    );
    const trimTop = topScore >= LABEL_BAND_CELL_RATIO;
    const trimBottom = bottomScore >= LABEL_BAND_CELL_RATIO;

    yBoundaries = yBoundaries.slice(
      trimTop ? 1 : 0,
      trimBottom ? -1 : undefined,
    );
  }

  if (xBoundaries.length >= 6 && yBoundaries.length >= 6) {
    const leftScore = scoreVerticalLabelBand(
      imageData,
      searchRect,
      xBoundaries[0],
      xBoundaries[1],
      yBoundaries,
    );
    const rightScore = scoreVerticalLabelBand(
      imageData,
      searchRect,
      xBoundaries[xBoundaries.length - 2],
      xBoundaries[xBoundaries.length - 1],
      yBoundaries,
    );
    const trimLeft = leftScore >= LABEL_BAND_CELL_RATIO;
    const trimRight = rightScore >= LABEL_BAND_CELL_RATIO;

    xBoundaries = xBoundaries.slice(
      trimLeft ? 1 : 0,
      trimRight ? -1 : undefined,
    );
  }

  return {
    cellSize: model.cellSize,
    xBoundaries: Object.freeze(xBoundaries),
    yBoundaries: Object.freeze(yBoundaries),
  };
}

function scoreHorizontalLabelBand(
  imageData: ImageData,
  searchRect: NaturalImageRect,
  xBoundaries: readonly number[],
  top: number | undefined,
  bottom: number | undefined,
): number {
  if (top === undefined || bottom === undefined) {
    return 0;
  }

  let labelCells = 0;
  let cellCount = 0;

  for (let index = 1; index < xBoundaries.length; index += 1) {
    const left = xBoundaries[index - 1];
    const right = xBoundaries[index];

    if (left === undefined || right === undefined) {
      continue;
    }

    if (
      isLabelCell(
        readCellStatistics(
          imageData,
          searchRect,
          left,
          top,
          right,
          bottom,
        ),
      )
    ) {
      labelCells += 1;
    }

    cellCount += 1;
  }

  return cellCount > 0 ? labelCells / cellCount : 0;
}

function scoreVerticalLabelBand(
  imageData: ImageData,
  searchRect: NaturalImageRect,
  left: number | undefined,
  right: number | undefined,
  yBoundaries: readonly number[],
): number {
  if (left === undefined || right === undefined) {
    return 0;
  }

  let labelCells = 0;
  let cellCount = 0;

  for (let index = 1; index < yBoundaries.length; index += 1) {
    const top = yBoundaries[index - 1];
    const bottom = yBoundaries[index];

    if (top === undefined || bottom === undefined) {
      continue;
    }

    if (
      isLabelCell(
        readCellStatistics(
          imageData,
          searchRect,
          left,
          top,
          right,
          bottom,
        ),
      )
    ) {
      labelCells += 1;
    }

    cellCount += 1;
  }

  return cellCount > 0 ? labelCells / cellCount : 0;
}

function readCellStatistics(
  imageData: ImageData,
  searchRect: NaturalImageRect,
  naturalLeft: number,
  naturalTop: number,
  naturalRight: number,
  naturalBottom: number,
): CellStatistics {
  const insetX = Math.max(1, Math.round((naturalRight - naturalLeft) * 0.18));
  const insetY = Math.max(1, Math.round((naturalBottom - naturalTop) * 0.18));
  const left = Math.max(
    0,
    Math.round(naturalLeft - searchRect.x + insetX),
  );
  const right = Math.min(
    imageData.width,
    Math.round(naturalRight - searchRect.x - insetX),
  );
  const top = Math.max(
    0,
    Math.round(naturalTop - searchRect.y + insetY),
  );
  const bottom = Math.min(
    imageData.height,
    Math.round(naturalBottom - searchRect.y - insetY),
  );
  const stride = Math.max(
    1,
    Math.floor(Math.min(right - left, bottom - top) / 18),
  );
  let samples = 0;
  let darkPixels = 0;
  let colorPixels = 0;

  for (let y = top; y < bottom; y += stride) {
    for (let x = left; x < right; x += stride) {
      const offset = (y * imageData.width + x) * 4;
      const red = imageData.data[offset] ?? 255;
      const green = imageData.data[offset + 1] ?? 255;
      const blue = imageData.data[offset + 2] ?? 255;
      const maximumChannel = Math.max(red, green, blue);
      const minimumChannel = Math.min(red, green, blue);
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;

      if (luminance < 190) {
        darkPixels += 1;
      }

      if (maximumChannel - minimumChannel > 28 && luminance < 240) {
        colorPixels += 1;
      }

      samples += 1;
    }
  }

  return {
    darkRatio: samples > 0 ? darkPixels / samples : 0,
    colorRatio: samples > 0 ? colorPixels / samples : 0,
  };
}

function isLabelCell(statistics: CellStatistics): boolean {
  return (
    statistics.darkRatio >= 0.025 &&
    statistics.darkRatio <= 0.32 &&
    statistics.colorRatio <= 0.1
  );
}

function readSearchPixels(
  raster: LoadedRaster,
  searchRect: NaturalImageRect,
): ImageData | null {
  const canvas = document.createElement('canvas');
  canvas.width = searchRect.width;
  canvas.height = searchRect.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    return null;
  }

  context.imageSmoothingEnabled = false;
  context.drawImage(
    raster.source,
    searchRect.x,
    searchRect.y,
    searchRect.width,
    searchRect.height,
    0,
    0,
    searchRect.width,
    searchRect.height,
  );
  return context.getImageData(0, 0, searchRect.width, searchRect.height);
}

function chooseAdaptiveBlockSize(width: number, height: number): number {
  const target = Math.round(Math.min(width, height) / 24);
  const clamped = Math.min(81, Math.max(15, target));
  return clamped % 2 === 0 ? clamped + 1 : clamped;
}

function chooseMorphologyLength(crossLength: number): number {
  return Math.max(7, Math.round(crossLength * 0.045));
}

function isValidSearchRectangle(
  rectangle: NaturalImageRect,
  naturalImage: NaturalImageSize,
): boolean {
  return (
    Number.isInteger(rectangle.x) &&
    Number.isInteger(rectangle.y) &&
    Number.isInteger(rectangle.width) &&
    Number.isInteger(rectangle.height) &&
    rectangle.width >= 8 &&
    rectangle.height >= 8 &&
    rectangle.right === rectangle.x + rectangle.width &&
    rectangle.bottom === rectangle.y + rectangle.height &&
    rectangle.x >= 0 &&
    rectangle.y >= 0 &&
    rectangle.right <= naturalImage.width &&
    rectangle.bottom <= naturalImage.height
  );
}

function positiveModulo(value: number, divisor: number): number {
  return ((Math.round(value) % divisor) + divisor) % divisor;
}

function localProfileMax(
  profile: Float32Array,
  position: number,
  radius: number,
): number {
  const center = Math.round(position);
  const start = Math.max(0, center - radius);
  const end = Math.min(profile.length - 1, center + radius);
  let result = 0;

  for (let index = start; index <= end; index += 1) {
    result = Math.max(result, profile[index] ?? 0);
  }

  return result;
}

function sampleBoundaryEvidence(
  profile: Float32Array,
  position: number,
  radius: number,
  peak: number,
): number {
  const measured = localProfileMax(profile, position, radius);
  const roundedPosition = Math.round(position);

  if (
    roundedPosition === 0 ||
    roundedPosition === profile.length
  ) {
    return Math.max(measured, peak * 0.5);
  }

  return measured;
}

function maximum(values: Float32Array): number {
  let result = 0;

  for (const value of values) {
    result = Math.max(result, value);
  }

  return result;
}

function percentile(values: Float32Array, ratio: number): number {
  const ordered = Array.from(values).sort((left, right) => left - right);
  const index = Math.min(
    ordered.length - 1,
    Math.max(0, Math.round((ordered.length - 1) * ratio)),
  );
  return ordered[index] ?? 0;
}

function failure(
  reason: GridDetectionFailureReason,
  message: string,
): GridDetectionFailure {
  return {
    ok: false,
    reason,
    message,
  };
}

async function loadRasterFromFile(file: File): Promise<LoadedRaster> {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file);

    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => {
        bitmap.close();
      },
    };
  }

  return loadRasterWithImageElement(file);
}

function loadRasterWithImageElement(file: File): Promise<LoadedRaster> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    const cleanup = (): void => {
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(objectUrl);
    };

    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      cleanup();

      if (width <= 0 || height <= 0) {
        reject(new Error('Image did not report valid dimensions.'));
        return;
      }

      resolve({
        source: image,
        width,
        height,
        close: () => undefined,
      });
    };

    image.onerror = () => {
      cleanup();
      reject(new Error('Image element failed to decode the selected file.'));
    };

    image.decoding = 'async';
    image.src = objectUrl;
  });
}
