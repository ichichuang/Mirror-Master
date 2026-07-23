import { PIXELANIM_GRID_COLUMNS, PIXELANIM_GRID_ROWS } from '../grid-selection/constants';
import { clamp } from '../grid-selection/geometry';
import type { GridSelection, GridSelectionSource, NaturalImageSize } from '../grid-selection/types';
import {
  MIN_PRECISION_CELL_SIZE,
  PRECISION_COARSE_CANDIDATE_LIMIT,
  PRECISION_FINAL_CANDIDATE_LIMIT,
} from './constants';
import { EMPTY_PRECISION_EVIDENCE, createPixelGridCalibrationCandidate } from './geometry';
import type {
  PixelGridCalibrationCandidate,
  PixelGridConfirmationProvenance,
  PixelGridEvidenceMetrics,
  PixelGridPrecisionFailure,
  PixelGridPrecisionOutcome,
} from './types';

export interface PixelGridPrecisionWorkspace {
  readonly naturalImage: NaturalImageSize;
  readonly refine: (selection: GridSelection) => PixelGridPrecisionOutcome;
  readonly evaluate: (
    source: GridSelectionSource,
    left: number,
    top: number,
    cellSize: number,
    confirmationProvenance?: PixelGridConfirmationProvenance,
  ) => PixelGridCalibrationCandidate;
}

interface LoadedRaster {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  readonly close: () => void;
}

interface PrecisionAnalysis {
  readonly width: number;
  readonly height: number;
  readonly verticalPrefix: Float32Array;
  readonly horizontalPrefix: Float32Array;
}

interface ScoredCandidate {
  readonly left: number;
  readonly top: number;
  readonly cellSize: number;
  readonly evidence: PixelGridEvidenceMetrics;
}

interface SearchWindow {
  readonly min: number;
  readonly max: number;
}

export async function createPixelGridPrecisionWorkspace(
  file: File,
  expectedNaturalImage: NaturalImageSize,
): Promise<PixelGridPrecisionWorkspace> {
  const raster = await loadRasterFromFile(file);

  try {
    if (
      raster.width !== expectedNaturalImage.width ||
      raster.height !== expectedNaturalImage.height
    ) {
      throw new Error('image-size-mismatch');
    }

    const analysis = createPrecisionAnalysis(raster);

    return {
      naturalImage: Object.freeze({
        width: raster.width,
        height: raster.height,
      }),
      refine(selection) {
        return refineWithAnalysis(analysis, selection);
      },
      evaluate(source, left, top, cellSize, confirmationProvenance) {
        const evidence = scoreManualCandidate(analysis, left, top, cellSize);

        return createPixelGridCalibrationCandidate({
          source,
          ...(confirmationProvenance ? { confirmationProvenance } : {}),
          naturalImage: expectedNaturalImage,
          left,
          top,
          cellSize,
          evidence,
        });
      },
    };
  } finally {
    raster.close();
  }
}

export async function refinePixelGridCalibration(input: {
  readonly file: File;
  readonly selection: GridSelection;
}): Promise<PixelGridPrecisionOutcome> {
  try {
    const workspace = await createPixelGridPrecisionWorkspace(
      input.file,
      input.selection.naturalImage,
    );

    return workspace.refine(input.selection);
  } catch (error) {
    const reason =
      error instanceof Error && error.message === 'image-size-mismatch'
        ? 'image-size-mismatch'
        : error instanceof Error && error.message === 'canvas-unavailable'
          ? 'canvas-unavailable'
          : 'decode-failed';

    return {
      ok: false,
      reason,
      message:
        reason === 'image-size-mismatch'
          ? '原始文件尺寸与当前粗校正图片不一致，精修结果已拒绝。'
          : reason === 'canvas-unavailable'
            ? '当前浏览器无法创建本地 Canvas 2D 精修环境。'
            : '无法从原始本地文件读取自然像素，精修已停止。',
    };
  }
}

function refineWithAnalysis(
  analysis: PrecisionAnalysis,
  selection: GridSelection,
): PixelGridPrecisionOutcome {
  if (
    analysis.width !== selection.naturalImage.width ||
    analysis.height !== selection.naturalImage.height
  ) {
    return {
      ok: false,
      reason: 'image-size-mismatch',
      message: '当前图片与粗校正选择的自然尺寸不一致，精修结果已拒绝。',
    };
  }

  const cellSizes = estimateCellSizes(selection, analysis);

  if (cellSizes.length === 0) {
    return {
      ok: false,
      reason: 'rough-selection-invalid',
      message: '粗校正区域无法推出可搜索的整数单元尺寸。',
    };
  }

  const bestCandidates: ScoredCandidate[] = [];

  for (const cellSize of cellSizes) {
    searchCellSize(analysis, selection, cellSize, bestCandidates);
  }

  const ordered = bestCandidates
    .filter((candidate) => candidate.evidence.score > 0)
    .sort((left, right) => right.evidence.score - left.evidence.score);
  const best = ordered[0];

  if (!best) {
    return {
      ok: false,
      reason: 'out-of-bounds',
      message: '没有任何整数网格候选能完整落在自然图片内。',
    };
  }

  const secondDistinct = ordered.find(
    (candidate) =>
      candidate.cellSize !== best.cellSize ||
      Math.abs(candidate.left - best.left) > 1 ||
      Math.abs(candidate.top - best.top) > 1,
  );
  const ambiguityGap = best.evidence.score - (secondDistinct?.evidence.score ?? 0);
  const candidate = createPixelGridCalibrationCandidate({
    source: selection.source,
    naturalImage: selection.naturalImage,
    left: best.left,
    top: best.top,
    cellSize: best.cellSize,
    evidence: {
      ...best.evidence,
      ambiguityGap,
    },
  });

  if (!candidate.validation.ok || !candidate.evidenceAssessment.ok) {
    return rejectCandidate(candidate);
  }

  return {
    ok: true,
    candidate,
  };
}

function rejectCandidate(candidate: PixelGridCalibrationCandidate): PixelGridPrecisionFailure {
  const validation = candidate.validation;

  if (!validation.ok) {
    const reason =
      validation.reason === 'out-of-bounds' ? 'out-of-bounds' : 'rough-selection-invalid';

    return {
      ok: false,
      reason,
      message: validation.message,
      candidate,
    };
  }

  const evidenceAssessment = candidate.evidenceAssessment;

  if (evidenceAssessment.ok) {
    return {
      ok: false,
      reason: 'rough-selection-invalid',
      message: '精修候选状态不一致，结果已拒绝。',
      candidate,
    };
  }

  const reason =
    evidenceAssessment.reason === 'weak-evidence'
      ? 'weak-evidence'
      : evidenceAssessment.reason === 'ambiguous-candidate'
        ? 'ambiguous-candidate'
        : 'non-integer-scale';

  return {
    ok: false,
    reason,
    message: evidenceAssessment.message,
    candidate,
  };
}

function estimateCellSizes(
  selection: GridSelection,
  analysis: PrecisionAnalysis,
): readonly number[] {
  const roughCellWidth = selection.rectangle.width / PIXELANIM_GRID_COLUMNS;
  const roughCellHeight = selection.rectangle.height / PIXELANIM_GRID_ROWS;
  const roughAverage = (roughCellWidth + roughCellHeight) / 2;
  const minSearch = Math.max(
    MIN_PRECISION_CELL_SIZE,
    Math.floor(Math.min(roughCellWidth, roughCellHeight, roughAverage) * 0.78) - 2,
  );
  const maxByImage = Math.floor(
    Math.min(analysis.width / PIXELANIM_GRID_COLUMNS, analysis.height / PIXELANIM_GRID_ROWS),
  );
  const maxSearch = Math.min(
    maxByImage,
    Math.ceil(Math.max(roughCellWidth, roughCellHeight, roughAverage) * 1.22) + 2,
  );
  const weightedCenter = Math.round(roughAverage);
  const cells: number[] = [];

  for (let cellSize = minSearch; cellSize <= maxSearch; cellSize += 1) {
    cells.push(cellSize);
  }

  return cells.sort(
    (left, right) => Math.abs(left - weightedCenter) - Math.abs(right - weightedCenter),
  );
}

function searchCellSize(
  analysis: PrecisionAnalysis,
  selection: GridSelection,
  cellSize: number,
  bestCandidates: ScoredCandidate[],
): void {
  const gridWidth = PIXELANIM_GRID_COLUMNS * cellSize;
  const gridHeight = PIXELANIM_GRID_ROWS * cellSize;

  if (gridWidth > analysis.width || gridHeight > analysis.height) {
    return;
  }

  const rough = selection.rectangle;
  const leftFromCenter = Math.round(rough.x + rough.width / 2 - gridWidth / 2);
  const leftFromEdge = Math.round(rough.x);
  const topFromCenter = Math.round(rough.y + rough.height / 2 - gridHeight / 2);
  const topFromEdge = Math.round(rough.y);
  const leftWindow = createSearchWindow(
    [leftFromCenter, leftFromEdge],
    computeSearchRadius(cellSize, rough.width, gridWidth),
    0,
    analysis.width - gridWidth,
  );
  const topWindow = createSearchWindow(
    [topFromCenter, topFromEdge],
    computeSearchRadius(cellSize, rough.height, gridHeight),
    0,
    analysis.height - gridHeight,
  );

  if (leftWindow.max < leftWindow.min || topWindow.max < topWindow.min) {
    return;
  }

  const coarseStep = Math.max(1, Math.floor(cellSize / 5));
  const coarseCandidates: ScoredCandidate[] = [];

  for (let left = leftWindow.min; left <= leftWindow.max; left += coarseStep) {
    for (let top = topWindow.min; top <= topWindow.max; top += coarseStep) {
      offerCandidate(
        coarseCandidates,
        {
          left,
          top,
          cellSize,
          evidence: scoreCandidate(analysis, left, top, cellSize),
        },
        PRECISION_COARSE_CANDIDATE_LIMIT,
      );
    }
  }

  for (const coarse of coarseCandidates) {
    const fineLeftMin = Math.max(leftWindow.min, coarse.left - coarseStep);
    const fineLeftMax = Math.min(leftWindow.max, coarse.left + coarseStep);
    const fineTopMin = Math.max(topWindow.min, coarse.top - coarseStep);
    const fineTopMax = Math.min(topWindow.max, coarse.top + coarseStep);

    for (let left = fineLeftMin; left <= fineLeftMax; left += 1) {
      for (let top = fineTopMin; top <= fineTopMax; top += 1) {
        offerCandidate(
          bestCandidates,
          {
            left,
            top,
            cellSize,
            evidence: scoreCandidate(analysis, left, top, cellSize),
          },
          PRECISION_FINAL_CANDIDATE_LIMIT,
        );
      }
    }
  }
}

function computeSearchRadius(cellSize: number, roughSpan: number, exactSpan: number): number {
  return Math.ceil(Math.max(18, cellSize * 0.68, Math.abs(roughSpan - exactSpan) / 2 + 10));
}

function createSearchWindow(
  estimates: readonly number[],
  radius: number,
  min: number,
  max: number,
): SearchWindow {
  const estimateMin = Math.min(...estimates);
  const estimateMax = Math.max(...estimates);

  return {
    min: clamp(estimateMin - radius, min, max),
    max: clamp(estimateMax + radius, min, max),
  };
}

function offerCandidate(
  candidates: ScoredCandidate[],
  candidate: ScoredCandidate,
  limit: number,
): void {
  const existing = candidates.find(
    (current) =>
      current.left === candidate.left &&
      current.top === candidate.top &&
      current.cellSize === candidate.cellSize,
  );

  if (existing) {
    return;
  }

  if (candidates.length < limit * 3) {
    candidates.push(candidate);
    return;
  }

  let lowestScore = Number.POSITIVE_INFINITY;
  let lowestIndex = -1;

  for (let index = 0; index < candidates.length; index += 1) {
    const current = candidates[index];

    if (current && current.evidence.score < lowestScore) {
      lowestScore = current.evidence.score;
      lowestIndex = index;
    }
  }

  if (lowestIndex >= 0 && candidate.evidence.score > lowestScore) {
    candidates[lowestIndex] = candidate;
  }

  candidates.sort((left, right) => right.evidence.score - left.evidence.score);
  candidates.length = Math.min(candidates.length, limit);
}

function scoreCandidate(
  analysis: PrecisionAnalysis,
  left: number,
  top: number,
  cellSize: number,
): PixelGridEvidenceMetrics {
  const right = left + PIXELANIM_GRID_COLUMNS * cellSize;
  const bottom = top + PIXELANIM_GRID_ROWS * cellSize;

  if (
    !Number.isInteger(left) ||
    !Number.isInteger(top) ||
    !Number.isInteger(cellSize) ||
    cellSize < MIN_PRECISION_CELL_SIZE ||
    left < 0 ||
    top < 0 ||
    right > analysis.width ||
    bottom > analysis.height
  ) {
    return EMPTY_PRECISION_EVIDENCE;
  }

  const verticalLines: number[] = [];
  const horizontalLines: number[] = [];
  const verticalCenters: number[] = [];
  const horizontalCenters: number[] = [];

  for (let index = 0; index <= PIXELANIM_GRID_COLUMNS; index += 1) {
    verticalLines.push(verticalLineAverage(analysis, left + index * cellSize, top, bottom));
  }

  for (let index = 0; index <= PIXELANIM_GRID_ROWS; index += 1) {
    horizontalLines.push(horizontalLineAverage(analysis, top + index * cellSize, left, right));
  }

  for (let index = 0; index < PIXELANIM_GRID_COLUMNS; index += 1) {
    verticalCenters.push(
      verticalLineAverage(
        analysis,
        left + index * cellSize + Math.floor(cellSize / 2),
        top,
        bottom,
      ),
    );
  }

  for (let index = 0; index < PIXELANIM_GRID_ROWS; index += 1) {
    horizontalCenters.push(
      horizontalLineAverage(
        analysis,
        top + index * cellSize + Math.floor(cellSize / 2),
        left,
        right,
      ),
    );
  }

  const lineMean = mean([...verticalLines, ...horizontalLines]);
  const centerMean = mean([...verticalCenters, ...horizontalCenters]);
  const rawContrast = Math.max(0, lineMean - centerMean);
  const centerContrast = clamp(rawContrast / (lineMean + centerMean + 0.001), 0, 1);
  const verticalConsistency = consistencyScore(verticalLines);
  const horizontalConsistency = consistencyScore(horizontalLines);
  const periodicConsistency = (verticalConsistency + horizontalConsistency) / 2;
  const outerMean = mean([
    verticalLines[0] ?? 0,
    verticalLines[verticalLines.length - 1] ?? 0,
    horizontalLines[0] ?? 0,
    horizontalLines[horizontalLines.length - 1] ?? 0,
  ]);
  const outerEdgeSupport = clamp((outerMean - centerMean) / (outerMean + centerMean + 0.001), 0, 1);
  const coverageThreshold = Math.max(0.018, lineMean * 0.42);
  const coverage =
    [...verticalLines, ...horizontalLines].filter((value) => value >= coverageThreshold).length /
    (verticalLines.length + horizontalLines.length);
  const boundaryStrength = clamp((lineMean - 0.018) / 0.2, 0, 1) * 0.68 + coverage * 0.32;
  const score = clamp(
    boundaryStrength * 0.32 +
      centerContrast * 0.3 +
      periodicConsistency * 0.23 +
      outerEdgeSupport * 0.15,
    0,
    1,
  );

  return {
    boundaryStrength,
    centerContrast,
    periodicConsistency,
    outerEdgeSupport,
    score,
    ambiguityGap: 0,
  };
}

function scoreManualCandidate(
  analysis: PrecisionAnalysis,
  left: number,
  top: number,
  cellSize: number,
): PixelGridEvidenceMetrics {
  const evidence = scoreCandidate(analysis, left, top, cellSize);
  let bestNeighborScore = 0;

  for (let cellDelta = -1; cellDelta <= 1; cellDelta += 1) {
    const neighborCellSize = cellSize + cellDelta;

    for (let leftDelta = -1; leftDelta <= 1; leftDelta += 1) {
      for (let topDelta = -1; topDelta <= 1; topDelta += 1) {
        if (cellDelta === 0 && leftDelta === 0 && topDelta === 0) {
          continue;
        }

        bestNeighborScore = Math.max(
          bestNeighborScore,
          scoreCandidate(analysis, left + leftDelta, top + topDelta, neighborCellSize).score,
        );
      }
    }
  }

  return {
    ...evidence,
    ambiguityGap: evidence.score - bestNeighborScore,
  };
}

function verticalLineAverage(
  analysis: PrecisionAnalysis,
  x: number,
  top: number,
  bottom: number,
): number {
  if (x <= 0 || x >= analysis.width - 1) {
    return 0;
  }

  const yStart = Math.round(clamp(top, 0, analysis.height - 1));
  const yEnd = Math.round(clamp(bottom + 1, yStart + 1, analysis.height));
  const sum =
    (analysis.verticalPrefix[yEnd * analysis.width + x] ?? 0) -
    (analysis.verticalPrefix[yStart * analysis.width + x] ?? 0);

  return sum / (yEnd - yStart);
}

function horizontalLineAverage(
  analysis: PrecisionAnalysis,
  y: number,
  left: number,
  right: number,
): number {
  if (y <= 0 || y >= analysis.height - 1) {
    return 0;
  }

  const rowWidth = analysis.width + 1;
  const xStart = Math.round(clamp(left, 0, analysis.width - 1));
  const xEnd = Math.round(clamp(right + 1, xStart + 1, analysis.width));
  const rowOffset = y * rowWidth;
  const sum =
    (analysis.horizontalPrefix[rowOffset + xEnd] ?? 0) -
    (analysis.horizontalPrefix[rowOffset + xStart] ?? 0);

  return sum / (xEnd - xStart);
}

function consistencyScore(values: readonly number[]): number {
  const average = mean(values);

  if (average <= 0) {
    return 0;
  }

  const variance = mean(values.map((value) => (value - average) ** 2));

  return clamp(1 - Math.sqrt(variance) / (average + 0.001), 0, 1);
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function createPrecisionAnalysis(raster: LoadedRaster): PrecisionAnalysis {
  const canvas = document.createElement('canvas');
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new Error('canvas-unavailable');
  }

  context.imageSmoothingEnabled = false;
  context.drawImage(raster.source, 0, 0, raster.width, raster.height);

  const imageData = context.getImageData(0, 0, raster.width, raster.height);
  const luminance = createLuminance(imageData.data, raster.width, raster.height);
  const verticalEvidence = createVerticalEvidence(luminance, raster.width, raster.height);
  const horizontalEvidence = createHorizontalEvidence(luminance, raster.width, raster.height);

  return {
    width: raster.width,
    height: raster.height,
    verticalPrefix: createVerticalPrefix(verticalEvidence, raster.width, raster.height),
    horizontalPrefix: createHorizontalPrefix(horizontalEvidence, raster.width, raster.height),
  };
}

function createLuminance(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const luminance = new Float32Array(width * height);
  let outputIndex = 0;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    luminance[outputIndex] = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    outputIndex += 1;
  }

  return luminance;
}

function createVerticalEvidence(
  luminance: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const evidence = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      evidence[y * width + x] = lineEvidenceAt(luminance, width, height, x, y, 'vertical');
    }
  }

  return evidence;
}

function createHorizontalEvidence(
  luminance: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const evidence = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      evidence[y * width + x] = lineEvidenceAt(luminance, width, height, x, y, 'horizontal');
    }
  }

  return evidence;
}

function createVerticalPrefix(evidence: Float32Array, width: number, height: number): Float32Array {
  const prefix = new Float32Array((height + 1) * width);

  for (let y = 0; y < height; y += 1) {
    const currentRow = y * width;
    const nextRow = (y + 1) * width;

    for (let x = 0; x < width; x += 1) {
      prefix[nextRow + x] = (prefix[currentRow + x] ?? 0) + (evidence[currentRow + x] ?? 0);
    }
  }

  return prefix;
}

function createHorizontalPrefix(
  evidence: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const rowWidth = width + 1;
  const prefix = new Float32Array(height * rowWidth);

  for (let y = 0; y < height; y += 1) {
    const sourceRow = y * width;
    const prefixRow = y * rowWidth;

    for (let x = 0; x < width; x += 1) {
      prefix[prefixRow + x + 1] = (prefix[prefixRow + x] ?? 0) + (evidence[sourceRow + x] ?? 0);
    }
  }

  return prefix;
}

function lineEvidenceAt(
  luminance: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  axis: 'vertical' | 'horizontal',
): number {
  const previous =
    axis === 'vertical'
      ? luminanceAt(luminance, width, height, x - 1, y)
      : luminanceAt(luminance, width, height, x, y - 1);
  const next =
    axis === 'vertical'
      ? luminanceAt(luminance, width, height, x + 1, y)
      : luminanceAt(luminance, width, height, x, y + 1);
  const farPrevious =
    axis === 'vertical'
      ? luminanceAt(luminance, width, height, x - 2, y)
      : luminanceAt(luminance, width, height, x, y - 2);
  const farNext =
    axis === 'vertical'
      ? luminanceAt(luminance, width, height, x + 2, y)
      : luminanceAt(luminance, width, height, x, y + 2);
  const center = luminanceAt(luminance, width, height, x, y);
  const nearAverage = (previous + next) / 2;
  const farAverage = (farPrevious + farNext) / 2;
  const ridge = Math.abs(center - nearAverage);
  const farContrast = Math.abs(center - farAverage);
  const gradient = Math.abs(next - previous);

  return ridge * 0.58 + farContrast * 0.3 + gradient * 0.12;
}

function luminanceAt(
  luminance: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return 0;
  }

  return luminance[y * width + x] ?? 0;
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
