import { loadOpenCV, type OpenCV } from '@opencvjs/web';

import {
  createNaturalRect,
  createGridBoundarySelection,
  isValidGridBoundarySelection,
} from '../grid-selection/geometry';
import type { NaturalImageRect, NaturalImageSize } from '../grid-selection/types';
import {
  snapBoundaryRectangle,
  type SnappedBoundaryModel,
  type SupportedGridLine,
} from './userRectangleSnap';
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
  readonly end: number;
  readonly expectedBoundaryCount: number;
  readonly matchedBoundaryCount: number;
  readonly explainedPixelSpan: number;
  readonly explainedSpanRatio: number;
  readonly evidenceCoverage: number;
  readonly clusterCoverage: number;
  readonly startSupport: boolean;
  readonly endSupport: boolean;
  readonly evidenceScore: number;
}

interface BoundaryModel {
  readonly cellSize: number;
  readonly xBoundaries: readonly number[];
  readonly yBoundaries: readonly number[];
}

type BoundaryInferenceFailureReason =
  'insufficient-clusters' | 'no-shared-spacing' | 'insufficient-span' | 'invalid-boundaries';

interface BoundaryInferenceSuccess {
  readonly ok: true;
  readonly model: BoundaryModel;
}

interface BoundaryInferenceFailure {
  readonly ok: false;
  readonly reason: BoundaryInferenceFailureReason;
}

type BoundaryInferenceOutcome = BoundaryInferenceSuccess | BoundaryInferenceFailure;

interface EvaluatedSpacingCandidate {
  readonly candidate: SharedSpacingCandidate;
  readonly xFit: AxisFit;
  readonly yFit: AxisFit;
}

const MIN_CELL_SIZE = 3;
const MIN_CLUSTER_COUNT = 6;
const MIN_EXPLAINED_SPAN_RATIO = 0.65;
const MIN_EVIDENCE_COVERAGE = 0.75;
const MIN_GENERATED_BOUNDARY_EVIDENCE = 0.7;
const MAX_HARMONIC_DIVISOR = 6;
const MAX_AXIS_SPACING_OBSERVATIONS = 64;
const MAX_SHARED_SPACING_CANDIDATES = 72;
const MAX_SPACING_DISAGREEMENT = 2;

let openCvPromise: Promise<OpenCvApi> | null = null;

export async function discoverInitialGrid(
  input: GridDetectionInput,
): Promise<GridDetectionOutcome> {
  if (!isValidSearchRectangle(input.searchRect, input.naturalImage)) {
    return failure('invalid-search-rectangle', '搜索区域无效，请重新调整。');
  }

  let raster: LoadedRaster;

  try {
    raster = await loadRasterFromFile(input.file);
  } catch (error) {
    return failure('decode-failed', '无法读取当前图片。', error);
  }

  try {
    if (raster.width !== input.naturalImage.width || raster.height !== input.naturalImage.height) {
      return failure('image-size-mismatch', '当前图片已变化，请重新选择图片。');
    }

    const imageData = readSearchPixels(raster, input.searchRect);

    if (!imageData) {
      return failure('canvas-unavailable', '当前浏览器无法读取图片像素。');
    }

    let cv: OpenCvApi;

    try {
      cv = await getOpenCv();
    } catch (error) {
      return failure(
        'opencv-loading-failed',
        '网格识别组件加载失败，请重新选择图片后再试。',
        error,
      );
    }

    let inference: BoundaryInferenceOutcome;

    try {
      inference = detectBoundaryModel(cv, imageData);
    } catch (error) {
      return failure('morphology-failed', '网格线提取失败，请调整搜索区域后重试。', error);
    }

    if (!inference.ok) {
      return inferenceFailure(inference.reason);
    }

    const naturalModel = offsetBoundaryModel(inference.model, input.searchRect);
    const selection = createGridBoundarySelection({
      naturalImage: input.naturalImage,
      searchRect: input.searchRect,
      cellSize: naturalModel.cellSize,
      xBoundaries: naturalModel.xBoundaries,
      yBoundaries: naturalModel.yBoundaries,
    });

    if (!selection || !isValidGridBoundarySelection(selection)) {
      return failure('invalid-boundaries', '识别出的网格边界无效，请重新调整搜索区域。');
    }

    return {
      ok: true,
      selection,
    };
  } finally {
    raster.close();
  }
}

export async function snapUserRectangle(input: GridDetectionInput): Promise<GridDetectionOutcome> {
  if (!isValidSearchRectangle(input.searchRect, input.naturalImage)) {
    return failure('invalid-search-rectangle', '搜索区域无效，请重新调整。');
  }

  let raster: LoadedRaster;

  try {
    raster = await loadRasterFromFile(input.file);
  } catch (error) {
    return failure('decode-failed', '无法读取当前图片。', error);
  }

  try {
    if (raster.width !== input.naturalImage.width || raster.height !== input.naturalImage.height) {
      return failure('image-size-mismatch', '当前图片已变化，请重新选择图片。');
    }

    const evidenceRect = createSnapEvidenceRectangle(input.searchRect, input.naturalImage);
    const imageData = readSearchPixels(raster, evidenceRect);

    if (!imageData) {
      return failure('canvas-unavailable', '当前浏览器无法读取图片像素。');
    }

    let cv: OpenCvApi;

    try {
      cv = await getOpenCv();
    } catch (error) {
      return failure(
        'opencv-loading-failed',
        '网格识别组件加载失败，请重新选择图片后再试。',
        error,
      );
    }

    let model: SnappedBoundaryModel | null;

    try {
      model = detectUserRectangleModel(cv, imageData, evidenceRect, input.searchRect);
    } catch (error) {
      return failure('morphology-failed', '网格线提取失败，请调整搜索区域后重试。', error);
    }

    if (!model) {
      return failure('snap-failed', '未能吸附完整网格，请继续调整边缘');
    }

    const snappedSearchRect = createNaturalRect(
      input.naturalImage,
      model.left,
      model.top,
      model.right,
      model.bottom,
    );

    if (!snappedSearchRect) {
      return failure('invalid-boundaries', '识别出的网格边界无效，请重新调整搜索区域。');
    }

    const selection = createGridBoundarySelection({
      naturalImage: input.naturalImage,
      searchRect: snappedSearchRect,
      cellSize: model.cellSize,
      xBoundaries: model.xBoundaries,
      yBoundaries: model.yBoundaries,
    });

    if (!selection || !isValidGridBoundarySelection(selection)) {
      return failure('invalid-boundaries', '识别出的网格边界无效，请重新调整搜索区域。');
    }

    logSnapResult(input.searchRect, model);

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

function detectBoundaryModel(cv: OpenCvApi, imageData: ImageData): BoundaryInferenceOutcome {
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

    if (primaryModel.ok) {
      return primaryModel;
    }

    const fallbackEvidence = extractLineEvidence(cv, gray, binary, true);
    const fallbackModel = inferBoundaryModel(fallbackEvidence);

    if (fallbackModel.ok) {
      return fallbackModel;
    }

    return preferInferenceFailure(primaryModel, fallbackModel);
  } finally {
    rgba.delete();
    gray.delete();
    binary.delete();
  }
}

function detectUserRectangleModel(
  cv: OpenCvApi,
  imageData: ImageData,
  evidenceRect: NaturalImageRect,
  userRect: NaturalImageRect,
): SnappedBoundaryModel | null {
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
    const primaryModel = snapEvidenceToUserRectangle(primaryEvidence, evidenceRect, userRect);

    if (primaryModel) {
      return primaryModel;
    }

    const fallbackEvidence = extractLineEvidence(cv, gray, binary, true);
    return snapEvidenceToUserRectangle(fallbackEvidence, evidenceRect, userRect);
  } finally {
    rgba.delete();
    gray.delete();
    binary.delete();
  }
}

function snapEvidenceToUserRectangle(
  evidence: LineEvidence,
  evidenceRect: NaturalImageRect,
  userRect: NaturalImageRect,
): SnappedBoundaryModel | null {
  if (
    evidence.x.clusters.length < MIN_CLUSTER_COUNT ||
    evidence.y.clusters.length < MIN_CLUSTER_COUNT
  ) {
    return null;
  }

  const xSpacing = collectSpacingObservations(evidence.x.clusters);
  const ySpacing = collectSpacingObservations(evidence.y.clusters);
  const candidates = createSharedSpacingCandidates(xSpacing, ySpacing);

  if (candidates.length === 0) {
    return null;
  }

  const xLines = createSupportedGridLines(evidence.x, evidenceRect.x);
  const yLines = createSupportedGridLines(evidence.y, evidenceRect.y);
  logSnapEvidence(userRect, candidates, xLines, yLines);

  return snapBoundaryRectangle({
    rectangle: userRect,
    candidates,
    xLines,
    yLines,
  });
}

function createSupportedGridLines(
  evidence: AxisEvidence,
  offset: number,
): readonly SupportedGridLine[] {
  const peak = maximum(evidence.profile);

  if (peak <= 0) {
    return [];
  }

  return evidence.clusters.map((cluster) => ({
    position: cluster.center + offset,
    support: sampleMeasuredBoundaryEvidence(evidence.profile, cluster.center, 1) / peak,
    width: cluster.width,
  }));
}

function createSnapEvidenceRectangle(
  userRect: NaturalImageRect,
  naturalImage: NaturalImageSize,
): NaturalImageRect {
  const padding = Math.max(12, Math.round(Math.min(userRect.width, userRect.height) * 0.08));

  return (
    createNaturalRect(
      naturalImage,
      userRect.x - padding,
      userRect.y - padding,
      userRect.right + padding,
      userRect.bottom + padding,
    ) ?? userRect
  );
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
  const houghVertical = new cv.Mat(gray.rows, gray.cols, cv.CV_8UC1, new cv.Scalar(0, 0, 0, 0));
  const houghHorizontal = new cv.Mat(gray.rows, gray.cols, cv.CV_8UC1, new cv.Scalar(0, 0, 0, 0));

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

    const color = new cv.Scalar(255, 255, 255, 255);

    for (let row = 0; row < lines.rows; row += 1) {
      const offset = row * 4;
      const x1 = lines.data32S[offset];
      const y1 = lines.data32S[offset + 1];
      const x2 = lines.data32S[offset + 2];
      const y2 = lines.data32S[offset + 3];

      if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
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
  const runtimeData8U: unknown = Reflect.get(mask, 'data8U');
  const maskData = runtimeData8U instanceof Uint8Array ? runtimeData8U : mask.data;

  if (axis === 'x') {
    for (let y = 0; y < mask.rows; y += 1) {
      const rowOffset = y * mask.cols;

      for (let x = 0; x < mask.cols; x += 1) {
        if ((maskData[rowOffset + x] ?? 0) > 0) {
          profile[x] = (profile[x] ?? 0) + 1;
        }
      }
    }
  } else {
    for (let y = 0; y < mask.rows; y += 1) {
      const rowOffset = y * mask.cols;
      let count = 0;

      for (let x = 0; x < mask.cols; x += 1) {
        if ((maskData[rowOffset + x] ?? 0) > 0) {
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

  const threshold = Math.max(0.02, peak * 0.12, percentile(profile, 0.82) * 0.42);
  const maximumClusterWidth = Math.max(7, Math.round(profile.length * 0.012));
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

function mergeDuplicateClusters(clusters: readonly LineCluster[]): readonly LineCluster[] {
  const ordered = [...clusters].sort((left, right) => left.center - right.center);
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
        (previous.center * previous.weight + cluster.center * cluster.weight) / totalWeight,
      ),
      weight: totalWeight,
      width: Math.max(previous.width, cluster.width),
    };
  }

  return merged;
}

function inferBoundaryModel(evidence: LineEvidence): BoundaryInferenceOutcome {
  if (
    evidence.x.clusters.length < MIN_CLUSTER_COUNT ||
    evidence.y.clusters.length < MIN_CLUSTER_COUNT
  ) {
    return {
      ok: false,
      reason: 'insufficient-clusters',
    };
  }

  const xSpacing = collectSpacingObservations(evidence.x.clusters);
  const ySpacing = collectSpacingObservations(evidence.y.clusters);
  const sharedCandidates = createSharedSpacingCandidates(xSpacing, ySpacing);

  if (sharedCandidates.length === 0) {
    return {
      ok: false,
      reason: 'no-shared-spacing',
    };
  }

  const evaluated: EvaluatedSpacingCandidate[] = [];

  for (const candidate of sharedCandidates) {
    const xFit = evaluateAxisSpacing(evidence.x, candidate.cellSize);
    const yFit = evaluateAxisSpacing(evidence.y, candidate.cellSize);

    if (!xFit || !yFit) {
      continue;
    }

    evaluated.push({
      candidate,
      xFit,
      yFit,
    });
  }

  const ranked = [...evaluated].sort(compareEvaluatedCandidates);
  const mostComplete = ranked[0];

  if (!mostComplete) {
    logCandidateComparison(sharedCandidates, evaluated, null);
    return {
      ok: false,
      reason: 'insufficient-span',
    };
  }

  const selected = preferSupportedFundamental(mostComplete, ranked);
  logCandidateComparison(sharedCandidates, evaluated, selected);
  const xBoundaries = createAxisBoundaries(selected.xFit, selected.candidate.cellSize);
  const yBoundaries = createAxisBoundaries(selected.yFit, selected.candidate.cellSize);

  if (
    xBoundaries.length < MIN_CLUSTER_COUNT ||
    yBoundaries.length < MIN_CLUSTER_COUNT ||
    !areValidAxisBoundaries(xBoundaries, selected.candidate.cellSize) ||
    !areValidAxisBoundaries(yBoundaries, selected.candidate.cellSize)
  ) {
    return {
      ok: false,
      reason: 'invalid-boundaries',
    };
  }

  return {
    ok: true,
    model: {
      cellSize: selected.candidate.cellSize,
      xBoundaries,
      yBoundaries,
    },
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

    for (let rightIndex = leftIndex + 1; rightIndex < lastIndex; rightIndex += 1) {
      const right = clusters[rightIndex];

      if (!right) {
        continue;
      }

      const distance = right.center - left.center;

      for (let divisor = 1; divisor <= MAX_HARMONIC_DIVISOR; divisor += 1) {
        const spacing = distance / divisor;

        if (spacing < MIN_CELL_SIZE) {
          break;
        }

        raw.push({
          value: spacing,
          weight: Math.min(left.weight, right.weight) / Math.max(1, divisor * 0.75),
        });
      }
    }
  }

  return groupSpacingObservations(raw).slice(0, MAX_AXIS_SPACING_OBSERVATIONS);
}

function groupSpacingObservations(
  observations: readonly SpacingObservation[],
): readonly SpacingObservation[] {
  const ordered = [...observations].sort((left, right) => left.value - right.value);
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
      if (Math.abs(xObservation.value - yObservation.value) > MAX_SPACING_DISAGREEMENT) {
        continue;
      }

      const rawX = xObservation.value;
      const rawY = yObservation.value;
      const cellSize = Math.round((rawX + rawY) / 2);

      if (cellSize < MIN_CELL_SIZE || Math.abs(rawX - rawY) > MAX_SPACING_DISAGREEMENT) {
        continue;
      }

      const existing = byCellSize.get(cellSize);
      const next: SharedSpacingCandidate = {
        cellSize,
        rawX,
        rawY,
        evidenceWeight: Math.sqrt(xObservation.weight * yObservation.weight),
      };

      if (
        !existing ||
        next.evidenceWeight > existing.evidenceWeight ||
        (next.evidenceWeight === existing.evidenceWeight &&
          Math.abs(rawX - rawY) < Math.abs(existing.rawX - existing.rawY))
      ) {
        byCellSize.set(cellSize, next);
      }
    }
  }

  return [...byCellSize.values()]
    .sort(
      (left, right) => right.evidenceWeight - left.evidenceWeight || left.cellSize - right.cellSize,
    )
    .slice(0, MAX_SHARED_SPACING_CANDIDATES);
}

function evaluateAxisSpacing(evidence: AxisEvidence, cellSize: number): AxisFit | null {
  const axisLength = evidence.profile.length;
  const maximumEdgeInset = Math.max(
    2,
    Math.min(Math.round(cellSize * 0.6), Math.round(axisLength * 0.18)),
  );
  const candidateStarts = collectCandidateStarts(evidence.clusters, cellSize, maximumEdgeInset);
  const peak = maximum(evidence.profile);
  const matchThreshold = Math.max(0.018, peak * 0.1);
  const matchRadius = Math.max(1, Math.min(4, Math.round(cellSize * 0.1)));
  let best: AxisFit | null = null;

  for (const start of candidateStarts) {
    const maximumCellCount = Math.floor((axisLength - start) / cellSize);
    const minimumCellCount = Math.max(
      MIN_CLUSTER_COUNT - 1,
      Math.floor((axisLength * MIN_EXPLAINED_SPAN_RATIO) / cellSize),
    );
    const candidateCellCounts = new Set([maximumCellCount, maximumCellCount - 1]);

    for (const cellCount of candidateCellCounts) {
      if (cellCount < minimumCellCount) {
        continue;
      }

      const end = start + cellCount * cellSize;
      const endInset = axisLength - end;

      if (endInset < 0 || endInset > maximumEdgeInset) {
        continue;
      }

      const expectedBoundaryCount = cellCount + 1;
      const positions = Array.from(
        { length: expectedBoundaryCount },
        (_, index) => start + index * cellSize,
      );
      const lineEvidence = positions.map((position) =>
        sampleMeasuredBoundaryEvidence(evidence.profile, position, matchRadius),
      );
      const phaseEvidence = positions.map((position) =>
        sampleMeasuredBoundaryEvidence(evidence.profile, position, 1),
      );
      const matchedBoundaryCount = lineEvidence.reduce(
        (count, value) => count + (value >= matchThreshold ? 1 : 0),
        0,
      );
      const requiredMatches = Math.max(
        MIN_CLUSTER_COUNT,
        Math.ceil(expectedBoundaryCount * MIN_EXPLAINED_SPAN_RATIO),
      );
      const evidenceCoverage = matchedBoundaryCount / expectedBoundaryCount;
      const explainedPixelSpan = end - start;
      const explainedSpanRatio = explainedPixelSpan / axisLength;

      if (
        explainedSpanRatio < MIN_EXPLAINED_SPAN_RATIO ||
        matchedBoundaryCount < requiredMatches ||
        evidenceCoverage < MIN_EVIDENCE_COVERAGE ||
        evidenceCoverage < MIN_GENERATED_BOUNDARY_EVIDENCE
      ) {
        continue;
      }

      const clusterCoverage = calculateClusterCoverage(
        evidence.clusters,
        start,
        end,
        cellSize,
        matchRadius,
      );
      const evidenceScore =
        phaseEvidence.reduce((sum, value) => sum + value / Math.max(peak, 0.000_001), 0) /
        expectedBoundaryCount;
      const fit: AxisFit = {
        start,
        end,
        expectedBoundaryCount,
        matchedBoundaryCount,
        explainedPixelSpan,
        explainedSpanRatio,
        evidenceCoverage,
        clusterCoverage,
        startSupport: (phaseEvidence[0] ?? 0) >= matchThreshold,
        endSupport: (phaseEvidence[phaseEvidence.length - 1] ?? 0) >= matchThreshold,
        evidenceScore,
      };

      if (!best || compareAxisFits(fit, best) < 0) {
        best = fit;
      }
    }
  }

  return best;
}

function createAxisBoundaries(fit: AxisFit, cellSize: number): readonly number[] {
  return Object.freeze(
    Array.from({ length: fit.expectedBoundaryCount }, (_, index) => fit.start + index * cellSize),
  );
}

function collectCandidateStarts(
  clusters: readonly LineCluster[],
  cellSize: number,
  maximumEdgeInset: number,
): readonly number[] {
  const starts = new Set<number>();

  for (let start = 0; start <= maximumEdgeInset; start += 1) {
    starts.add(start);
  }

  for (const cluster of clusters) {
    const phase = positiveModulo(cluster.center, cellSize);

    if (phase <= maximumEdgeInset) {
      starts.add(phase);
    }
  }

  return [...starts].sort((left, right) => left - right);
}

function calculateClusterCoverage(
  clusters: readonly LineCluster[],
  start: number,
  end: number,
  cellSize: number,
  matchRadius: number,
): number {
  let coveredWeight = 0;
  let totalWeight = 0;

  for (const cluster of clusters) {
    totalWeight += cluster.weight;

    if (cluster.center < start - matchRadius || cluster.center > end + matchRadius) {
      continue;
    }

    const nearestIndex = Math.round((cluster.center - start) / cellSize);
    const nearestBoundary = start + nearestIndex * cellSize;

    if (Math.abs(cluster.center - nearestBoundary) <= matchRadius) {
      coveredWeight += cluster.weight;
    }
  }

  return totalWeight > 0 ? coveredWeight / totalWeight : 0;
}

function compareAxisFits(left: AxisFit, right: AxisFit): number {
  return (
    right.explainedSpanRatio - left.explainedSpanRatio ||
    right.matchedBoundaryCount - left.matchedBoundaryCount ||
    right.evidenceCoverage - left.evidenceCoverage ||
    right.clusterCoverage - left.clusterCoverage ||
    right.evidenceScore - left.evidenceScore ||
    Number(right.startSupport) - Number(left.startSupport) ||
    Number(right.endSupport) - Number(left.endSupport) ||
    left.start - right.start
  );
}

function compareEvaluatedCandidates(
  left: EvaluatedSpacingCandidate,
  right: EvaluatedSpacingCandidate,
): number {
  const leftMinimumSpan = Math.min(left.xFit.explainedSpanRatio, left.yFit.explainedSpanRatio);
  const rightMinimumSpan = Math.min(right.xFit.explainedSpanRatio, right.yFit.explainedSpanRatio);
  const leftTotalSpan = left.xFit.explainedSpanRatio + left.yFit.explainedSpanRatio;
  const rightTotalSpan = right.xFit.explainedSpanRatio + right.yFit.explainedSpanRatio;
  const leftMatched = left.xFit.matchedBoundaryCount + left.yFit.matchedBoundaryCount;
  const rightMatched = right.xFit.matchedBoundaryCount + right.yFit.matchedBoundaryCount;
  const leftCoverage = Math.min(left.xFit.evidenceCoverage, left.yFit.evidenceCoverage);
  const rightCoverage = Math.min(right.xFit.evidenceCoverage, right.yFit.evidenceCoverage);
  const leftClusterCoverage = Math.min(left.xFit.clusterCoverage, left.yFit.clusterCoverage);
  const rightClusterCoverage = Math.min(right.xFit.clusterCoverage, right.yFit.clusterCoverage);
  const leftEvidence = left.xFit.evidenceScore + left.yFit.evidenceScore;
  const rightEvidence = right.xFit.evidenceScore + right.yFit.evidenceScore;

  return (
    rightMinimumSpan - leftMinimumSpan ||
    rightTotalSpan - leftTotalSpan ||
    rightMatched - leftMatched ||
    rightCoverage - leftCoverage ||
    rightClusterCoverage - leftClusterCoverage ||
    rightEvidence - leftEvidence ||
    right.candidate.evidenceWeight - left.candidate.evidenceWeight
  );
}

function preferSupportedFundamental(
  mostComplete: EvaluatedSpacingCandidate,
  ranked: readonly EvaluatedSpacingCandidate[],
): EvaluatedSpacingCandidate {
  let selected = mostComplete;

  for (const candidate of ranked) {
    if (
      candidate.candidate.cellSize >= selected.candidate.cellSize ||
      !isHarmonicPair(candidate.candidate.cellSize, selected.candidate.cellSize)
    ) {
      continue;
    }

    if (
      candidate.xFit.explainedPixelSpan < selected.xFit.explainedPixelSpan * 0.9 ||
      candidate.yFit.explainedPixelSpan < selected.yFit.explainedPixelSpan * 0.9 ||
      candidate.xFit.matchedBoundaryCount < selected.xFit.matchedBoundaryCount ||
      candidate.yFit.matchedBoundaryCount < selected.yFit.matchedBoundaryCount
    ) {
      continue;
    }

    selected = candidate;
  }

  return selected;
}

function isHarmonicPair(smallerCellSize: number, largerCellSize: number): boolean {
  for (let divisor = 2; divisor <= MAX_HARMONIC_DIVISOR; divisor += 1) {
    if (Math.abs(largerCellSize - smallerCellSize * divisor) <= MAX_SPACING_DISAGREEMENT) {
      return true;
    }
  }

  return false;
}

function areValidAxisBoundaries(boundaries: readonly number[], cellSize: number): boolean {
  return boundaries.every(
    (boundary, index) =>
      Number.isInteger(boundary) &&
      boundary >= 0 &&
      (index === 0 || boundary - (boundaries[index - 1] ?? boundary) === cellSize),
  );
}

function logCandidateComparison(
  sharedCandidates: readonly SharedSpacingCandidate[],
  evaluated: readonly EvaluatedSpacingCandidate[],
  selected: EvaluatedSpacingCandidate | null,
): void {
  if (!import.meta.env.DEV) {
    return;
  }

  const acceptedCellSizes = new Set(evaluated.map((entry) => entry.candidate.cellSize));
  const comparison = sharedCandidates.slice(0, 16).map((candidate) => {
    const entry = evaluated.find((current) => current.candidate.cellSize === candidate.cellSize);

    return entry
      ? {
          cellSize: candidate.cellSize,
          accepted: true,
          xSpan: roundMetric(entry.xFit.explainedSpanRatio),
          ySpan: roundMetric(entry.yFit.explainedSpanRatio),
          matched: entry.xFit.matchedBoundaryCount + entry.yFit.matchedBoundaryCount,
          expected: entry.xFit.expectedBoundaryCount + entry.yFit.expectedBoundaryCount,
          coverage: roundMetric(Math.min(entry.xFit.evidenceCoverage, entry.yFit.evidenceCoverage)),
        }
      : {
          cellSize: candidate.cellSize,
          accepted: acceptedCellSizes.has(candidate.cellSize),
        };
  });

  console.debug(
    `[grid-detection:candidates] ${JSON.stringify({
      selectedCellSize: selected?.candidate.cellSize ?? null,
      comparison,
    })}`,
  );
}

function logSnapResult(userRect: NaturalImageRect, model: SnappedBoundaryModel): void {
  if (!import.meta.env.DEV) {
    return;
  }

  console.debug(
    `[grid-detection:user-snap] ${JSON.stringify({
      userRect: {
        left: userRect.x,
        top: userRect.y,
        right: userRect.right,
        bottom: userRect.bottom,
      },
      snappedRect: {
        left: model.left,
        top: model.top,
        right: model.right,
        bottom: model.bottom,
      },
      offsets: model.offsets,
      cellSize: model.cellSize,
      columns: model.columns,
      rows: model.rows,
    })}`,
  );
}

function logSnapEvidence(
  userRect: NaturalImageRect,
  candidates: readonly SharedSpacingCandidate[],
  xLines: readonly SupportedGridLine[],
  yLines: readonly SupportedGridLine[],
): void {
  if (!import.meta.env.DEV) {
    return;
  }

  const nearby = (
    lines: readonly SupportedGridLine[],
    edges: readonly number[],
  ): readonly SupportedGridLine[] =>
    lines.filter((line) => edges.some((edge) => Math.abs(line.position - edge) <= 12));

  console.debug(
    `[grid-detection:snap-evidence] ${JSON.stringify({
      candidates: candidates.slice(0, 16).map((candidate) => candidate.cellSize),
      xEdges: nearby(xLines, [userRect.x, userRect.right]),
      yEdges: nearby(yLines, [userRect.y, userRect.bottom]),
    })}`,
  );
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function offsetBoundaryModel(model: BoundaryModel, searchRect: NaturalImageRect): BoundaryModel {
  return {
    cellSize: model.cellSize,
    xBoundaries: Object.freeze(model.xBoundaries.map((boundary) => boundary + searchRect.x)),
    yBoundaries: Object.freeze(model.yBoundaries.map((boundary) => boundary + searchRect.y)),
  };
}

function readSearchPixels(raster: LoadedRaster, searchRect: NaturalImageRect): ImageData | null {
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

function localProfileMax(profile: Float32Array, position: number, radius: number): number {
  const center = Math.round(position);
  const start = Math.max(0, center - radius);
  const end = Math.min(profile.length - 1, center + radius);
  let result = 0;

  for (let index = start; index <= end; index += 1) {
    result = Math.max(result, profile[index] ?? 0);
  }

  return result;
}

function sampleMeasuredBoundaryEvidence(
  profile: Float32Array,
  position: number,
  radius: number,
): number {
  return localProfileMax(profile, position, radius);
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
  const index = Math.min(ordered.length - 1, Math.max(0, Math.round((ordered.length - 1) * ratio)));
  return ordered[index] ?? 0;
}

function failure(
  reason: GridDetectionFailureReason,
  message: string,
  internalCause?: unknown,
): GridDetectionFailure {
  logDetectionFailure(reason, internalCause);

  return {
    ok: false,
    reason,
    message,
  };
}

function inferenceFailure(reason: BoundaryInferenceFailureReason): GridDetectionFailure {
  switch (reason) {
    case 'insufficient-clusters':
      return failure(reason, '搜索区域内可用网格线不足，请让搜索区域覆盖完整网格。');
    case 'no-shared-spacing':
      return failure(reason, '横纵网格间距不一致，请重新调整搜索区域。');
    case 'insufficient-span':
      return failure(reason, '识别到的网格未覆盖完整搜索区域，请扩大或对齐搜索区域。');
    case 'invalid-boundaries':
      return failure(reason, '识别出的网格边界无效，请重新调整搜索区域。');
  }
}

function preferInferenceFailure(
  primary: BoundaryInferenceFailure,
  fallback: BoundaryInferenceFailure,
): BoundaryInferenceFailure {
  const priority: Record<BoundaryInferenceFailureReason, number> = {
    'invalid-boundaries': 4,
    'insufficient-span': 3,
    'no-shared-spacing': 2,
    'insufficient-clusters': 1,
  };

  return priority[fallback.reason] >= priority[primary.reason] ? fallback : primary;
}

function logDetectionFailure(reason: GridDetectionFailureReason, internalCause?: unknown): void {
  if (!import.meta.env.DEV) {
    return;
  }

  const detail =
    internalCause instanceof Error
      ? (internalCause.stack ?? `${internalCause.name}: ${internalCause.message}`)
      : internalCause === undefined
        ? ''
        : typeof internalCause === 'string'
          ? internalCause
          : '未知内部错误';
  console.warn(`[grid-detection:${reason}]${detail ? ` ${detail}` : ''}`);
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
