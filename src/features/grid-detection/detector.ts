import {
  AXIS_CANDIDATE_LIMIT,
  MAX_ANALYSIS_LONG_EDGE,
  MAX_BOUNDARY_SEARCH_PIXELS,
  MIN_ANALYSIS_CELL_SIZE,
  PIXELANIM_GRID_COLUMNS,
  PIXELANIM_GRID_RATIO,
  PIXELANIM_GRID_ROWS,
} from './constants';
import {
  clamp,
  createBoundaryArray,
  createNaturalRect,
  isMonotonicInside,
  scoreNearRatio,
} from './geometry';
import {
  CONFIDENCE_LABELS,
  type ConfidenceGrade,
  type DetectionConfidence,
  type DetectionMetrics,
  type GridDetectionFailure,
  type GridDetectionFailureReason,
  type GridDetectionOutcome,
  type GridDetectionSuccess,
  type NaturalImageSize,
} from './types';

interface GridDetectionInput {
  readonly file: File;
  readonly naturalImage: NaturalImageSize;
}

interface LoadedRaster {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  readonly close: () => void;
}

interface AnalysisImage {
  readonly luminance: Float32Array;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

interface AxisCandidate {
  readonly start: number;
  readonly end: number;
  readonly span: number;
  readonly step: number;
  readonly lineStrength: number;
  readonly baselineStrength: number;
  readonly periodicity: number;
  readonly score: number;
}

interface BoundaryAggregate {
  readonly line: number;
  readonly baseline: number;
  readonly coverage: number;
  readonly baselineCoverage: number;
}

interface RectCandidate {
  readonly vertical: AxisCandidate;
  readonly horizontal: AxisCandidate;
  readonly metrics: DetectionMetrics;
}

interface RefinedRectangle {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const HIGH_CONFIDENCE_MIN = 0.78;
const MEDIUM_CONFIDENCE_MIN = 0.58;
const MIN_ACCEPTED_BOUNDARY_STRENGTH = 0.24;
const MIN_ACCEPTED_CONTRAST = 0.2;
const CONTINUOUS_LINE_EVIDENCE_MIN = 0.026;

export async function detectPixelanimGrid(
  input: GridDetectionInput,
): Promise<GridDetectionOutcome> {
  let raster: LoadedRaster;

  try {
    raster = await loadRasterFromFile(input.file);
  } catch {
    return failure('decode-failed', '无法读取图片像素，网格检测已停止。', input.naturalImage);
  }

  try {
    const naturalImage = {
      width: raster.width,
      height: raster.height,
    };

    if (
      naturalImage.width < PIXELANIM_GRID_COLUMNS * 6 ||
      naturalImage.height < PIXELANIM_GRID_ROWS * 6
    ) {
      return failure('image-too-small', '图片尺寸过小，无法可靠检测 34 × 27 网格。', naturalImage);
    }

    const analysis = createAnalysisImage(raster);

    if (!analysis) {
      return failure(
        'canvas-unavailable',
        '当前浏览器无法创建本地 Canvas 分析环境。',
        naturalImage,
      );
    }

    const candidate = selectBestGridCandidate(analysis);

    if (!candidate) {
      return failure('no-periodic-grid', '未找到足够稳定的 34 × 27 周期性网格结构。', naturalImage);
    }

    if (candidate.metrics.geometry < 0.62) {
      return failure(
        'geometry-inconsistent',
        '候选区域的比例或单元近似正方形约束不稳定。',
        naturalImage,
        candidate.metrics,
      );
    }

    if (
      candidate.metrics.boundaryStrength < MIN_ACCEPTED_BOUNDARY_STRENGTH ||
      candidate.metrics.contrast < MIN_ACCEPTED_CONTRAST
    ) {
      return failure(
        'weak-boundary-evidence',
        '候选网格线相对单元中心的边界证据不足。',
        naturalImage,
        candidate.metrics,
      );
    }

    const refined = refineOuterRectangle(raster, analysis, candidate);
    const success = createSuccessResult(naturalImage, refined, candidate.metrics);

    if (success.confidence.grade === 'low') {
      return failure(
        'low-confidence',
        '检测置信度较低，暂不显示网格叠加层。',
        naturalImage,
        success.metrics,
        success.confidence,
      );
    }

    return success;
  } finally {
    raster.close();
  }
}

function selectBestGridCandidate(analysis: AnalysisImage): RectCandidate | null {
  const verticalProfile = createAxisProfile(analysis, 'vertical');
  const horizontalProfile = createAxisProfile(analysis, 'horizontal');
  const verticalCandidates = findAxisCandidates(
    verticalProfile,
    analysis.width,
    PIXELANIM_GRID_COLUMNS,
  );
  const horizontalCandidates = findAxisCandidates(
    horizontalProfile,
    analysis.height,
    PIXELANIM_GRID_ROWS,
  );

  let bestCandidate: RectCandidate | null = null;

  for (const vertical of verticalCandidates) {
    for (const horizontal of horizontalCandidates) {
      const geometry = scoreCandidateGeometry(vertical, horizontal);

      if (geometry < 0.45) {
        continue;
      }

      const verticalAggregate = scoreVerticalBoundariesInRect(analysis, vertical, horizontal);
      const horizontalAggregate = scoreHorizontalBoundariesInRect(analysis, vertical, horizontal);
      const boundaryLine = (verticalAggregate.line + horizontalAggregate.line) / 2;
      const baseline = (verticalAggregate.baseline + horizontalAggregate.baseline) / 2;
      const coverage = (verticalAggregate.coverage + horizontalAggregate.coverage) / 2;
      const baselineCoverage =
        (verticalAggregate.baselineCoverage + horizontalAggregate.baselineCoverage) / 2;
      const rawContrast = Math.max(0, boundaryLine - baseline);
      const boundaryStrength = clamp((boundaryLine - 0.012) / 0.1, 0, 1) * 0.55 + coverage * 0.45;
      const contrast = clamp(
        (rawContrast / (boundaryLine + baseline + 0.001)) * 0.72 +
          Math.max(0, coverage - baselineCoverage) * 0.28,
        0,
        1,
      );
      const periodicity = clamp((vertical.periodicity + horizontal.periodicity) / 2, 0, 1);
      const metrics = createMetrics(geometry, periodicity, boundaryStrength, contrast);
      const rectCandidate: RectCandidate = {
        vertical,
        horizontal,
        metrics,
      };

      if (!bestCandidate || rectCandidate.metrics.score > bestCandidate.metrics.score) {
        bestCandidate = rectCandidate;
      }
    }
  }

  return bestCandidate;
}

function createSuccessResult(
  naturalImage: NaturalImageSize,
  refined: RefinedRectangle,
  metrics: DetectionMetrics,
): GridDetectionSuccess {
  const rectangle = createNaturalRect(refined.left, refined.top, refined.right, refined.bottom);
  const vertical = createBoundaryArray(rectangle.x, rectangle.right, PIXELANIM_GRID_COLUMNS);
  const horizontal = createBoundaryArray(rectangle.y, rectangle.bottom, PIXELANIM_GRID_ROWS);
  const cellSize = {
    width: rectangle.width / PIXELANIM_GRID_COLUMNS,
    height: rectangle.height / PIXELANIM_GRID_ROWS,
  };

  if (
    !isMonotonicInside(vertical, 0, naturalImage.width) ||
    !isMonotonicInside(horizontal, 0, naturalImage.height)
  ) {
    return {
      ok: true,
      columns: PIXELANIM_GRID_COLUMNS,
      rows: PIXELANIM_GRID_ROWS,
      naturalImage,
      rectangle,
      boundaries: {
        vertical: createBoundaryArray(0, 0, PIXELANIM_GRID_COLUMNS),
        horizontal: createBoundaryArray(0, 0, PIXELANIM_GRID_ROWS),
      },
      cellSize,
      metrics: createMetrics(0, 0, 0, 0),
      confidence: createConfidence(0),
    };
  }

  return {
    ok: true,
    columns: PIXELANIM_GRID_COLUMNS,
    rows: PIXELANIM_GRID_ROWS,
    naturalImage,
    rectangle,
    boundaries: {
      vertical,
      horizontal,
    },
    cellSize,
    metrics,
    confidence: createConfidence(metrics.score),
  };
}

function createMetrics(
  geometry: number,
  periodicity: number,
  boundaryStrength: number,
  contrast: number,
): DetectionMetrics {
  const boundedGeometry = clamp(geometry, 0, 1);
  const boundedPeriodicity = clamp(periodicity, 0, 1);
  const boundedBoundaryStrength = clamp(boundaryStrength, 0, 1);
  const boundedContrast = clamp(contrast, 0, 1);

  return {
    geometry: boundedGeometry,
    periodicity: boundedPeriodicity,
    boundaryStrength: boundedBoundaryStrength,
    contrast: boundedContrast,
    score: clamp(
      boundedGeometry * 0.25 +
        boundedPeriodicity * 0.25 +
        boundedBoundaryStrength * 0.3 +
        boundedContrast * 0.2,
      0,
      1,
    ),
  };
}

function createConfidence(score: number): DetectionConfidence {
  const grade: ConfidenceGrade =
    score >= HIGH_CONFIDENCE_MIN ? 'high' : score >= MEDIUM_CONFIDENCE_MIN ? 'medium' : 'low';

  return {
    grade,
    label: CONFIDENCE_LABELS[grade],
    score,
  };
}

function scoreCandidateGeometry(vertical: AxisCandidate, horizontal: AxisCandidate): number {
  const cellRatio = vertical.step / horizontal.step;
  const rectangleRatio = vertical.span / horizontal.span;
  const squareScore = scoreNearRatio(cellRatio, 1, 0.2);
  const ratioScore = scoreNearRatio(rectangleRatio, PIXELANIM_GRID_RATIO, 0.16);

  return squareScore * 0.68 + ratioScore * 0.32;
}

function createAxisProfile(analysis: AnalysisImage, axis: 'vertical' | 'horizontal'): Float32Array {
  const length = axis === 'vertical' ? analysis.width : analysis.height;
  const crossLength = axis === 'vertical' ? analysis.height : analysis.width;
  const profile = new Float32Array(length);
  const crossStride = Math.max(1, Math.floor(crossLength / 700));

  for (let position = 1; position < length - 1; position += 1) {
    let evidence = 0;
    let samples = 0;

    for (let cross = 1; cross < crossLength - 1; cross += crossStride) {
      evidence +=
        axis === 'vertical'
          ? verticalEvidenceAt(analysis.luminance, analysis.width, analysis.height, position, cross)
          : horizontalEvidenceAt(
              analysis.luminance,
              analysis.width,
              analysis.height,
              cross,
              position,
            );
      samples += 1;
    }

    profile[position] = samples > 0 ? evidence / samples : 0;
  }

  return profile;
}

function findAxisCandidates(
  profile: Float32Array,
  axisLength: number,
  segments: number,
): readonly AxisCandidate[] {
  const minSpan = Math.ceil(segments * MIN_ANALYSIS_CELL_SIZE);
  const candidates: AxisCandidate[] = [];

  if (minSpan >= axisLength) {
    return candidates;
  }

  for (let span = minSpan; span <= axisLength - 2; span += 1) {
    const step = span / segments;
    const windowRadius = Math.max(1, Math.round(step * 0.08));

    for (let start = 1; start <= axisLength - span - 1; start += 1) {
      const axisCandidate = scoreAxisCandidate(profile, start, span, segments, windowRadius);

      if (axisCandidate.score <= 0) {
        continue;
      }

      offerAxisCandidate(candidates, axisCandidate);
    }
  }

  return dedupeAxisCandidates(candidates);
}

function scoreAxisCandidate(
  profile: Float32Array,
  start: number,
  span: number,
  segments: number,
  windowRadius: number,
): AxisCandidate {
  const step = span / segments;
  let lineTotal = 0;
  let lineSquaredTotal = 0;
  let baselineTotal = 0;

  for (let index = 0; index <= segments; index += 1) {
    const boundary = start + step * index;
    const boundaryStrength = localProfileMax(profile, boundary, windowRadius);
    lineTotal += boundaryStrength;
    lineSquaredTotal += boundaryStrength * boundaryStrength;
  }

  for (let index = 0; index < segments; index += 1) {
    const center = start + step * (index + 0.5);
    baselineTotal += localProfileMax(profile, center, Math.max(1, Math.floor(windowRadius / 2)));
  }

  const boundaryCount = segments + 1;
  const lineStrength = lineTotal / boundaryCount;
  const baselineStrength = baselineTotal / segments;
  const variance = Math.max(0, lineSquaredTotal / boundaryCount - lineStrength * lineStrength);
  const relativeContrast = clamp(
    (lineStrength - baselineStrength) / (lineStrength + baselineStrength + 0.001),
    0,
    1,
  );
  const consistency = clamp(1 - Math.sqrt(variance) / (lineStrength + 0.001), 0, 1);
  const score = lineStrength * 0.45 + relativeContrast * 0.4 + consistency * 0.15;

  return {
    start,
    end: start + span,
    span,
    step,
    lineStrength,
    baselineStrength,
    periodicity: consistency * 0.35 + relativeContrast * 0.65,
    score,
  };
}

function offerAxisCandidate(candidates: AxisCandidate[], candidate: AxisCandidate): void {
  if (candidates.length < AXIS_CANDIDATE_LIMIT * 3) {
    candidates.push(candidate);
    return;
  }

  let lowestScore = Number.POSITIVE_INFINITY;
  let lowestIndex = -1;

  for (let index = 0; index < candidates.length; index += 1) {
    const current = candidates[index];

    if (current && current.score < lowestScore) {
      lowestScore = current.score;
      lowestIndex = index;
    }
  }

  if (lowestIndex >= 0 && candidate.score > lowestScore) {
    candidates[lowestIndex] = candidate;
  }
}

function dedupeAxisCandidates(candidates: readonly AxisCandidate[]): readonly AxisCandidate[] {
  const ordered = [...candidates].sort((left, right) => right.score - left.score);
  const deduped: AxisCandidate[] = [];

  for (const candidate of ordered) {
    const overlapsExisting = deduped.some(
      (existing) =>
        Math.abs(existing.start - candidate.start) < 3 &&
        Math.abs(existing.span - candidate.span) < 4,
    );

    if (!overlapsExisting) {
      deduped.push(candidate);
    }

    if (deduped.length >= AXIS_CANDIDATE_LIMIT) {
      break;
    }
  }

  return deduped;
}

function localProfileMax(profile: Float32Array, position: number, radius: number): number {
  const center = Math.round(position);
  const start = Math.max(0, center - radius);
  const end = Math.min(profile.length - 1, center + radius);
  let maxValue = 0;

  for (let index = start; index <= end; index += 1) {
    maxValue = Math.max(maxValue, profile[index] ?? 0);
  }

  return maxValue;
}

function scoreVerticalBoundariesInRect(
  analysis: AnalysisImage,
  vertical: AxisCandidate,
  horizontal: AxisCandidate,
): BoundaryAggregate {
  return scoreBoundariesInRect(
    analysis,
    'vertical',
    vertical.start,
    vertical.step,
    PIXELANIM_GRID_COLUMNS,
    horizontal.start,
    horizontal.end,
  );
}

function scoreHorizontalBoundariesInRect(
  analysis: AnalysisImage,
  vertical: AxisCandidate,
  horizontal: AxisCandidate,
): BoundaryAggregate {
  return scoreBoundariesInRect(
    analysis,
    'horizontal',
    horizontal.start,
    horizontal.step,
    PIXELANIM_GRID_ROWS,
    vertical.start,
    vertical.end,
  );
}

function scoreBoundariesInRect(
  analysis: AnalysisImage,
  axis: 'vertical' | 'horizontal',
  start: number,
  step: number,
  segments: number,
  crossStart: number,
  crossEnd: number,
): BoundaryAggregate {
  const crossMin = Math.max(1, Math.round(crossStart));
  const crossMax = Math.min(
    (axis === 'vertical' ? analysis.height : analysis.width) - 2,
    Math.round(crossEnd),
  );
  const crossStride = Math.max(1, Math.floor((crossMax - crossMin) / 520));
  const windowRadius = Math.max(1, Math.round(step * 0.06));
  let lineTotal = 0;
  let lineSamples = 0;
  let lineCoverageTotal = 0;
  let baselineTotal = 0;
  let baselineSamples = 0;
  let baselineCoverageTotal = 0;

  for (let index = 0; index <= segments; index += 1) {
    const position = start + step * index;
    const stats = aggregateLineEvidenceStats(
      analysis,
      axis,
      position,
      crossMin,
      crossMax,
      crossStride,
      windowRadius,
    );
    lineTotal += stats.strength;
    lineCoverageTotal += stats.coverage;
    lineSamples += 1;
  }

  for (let index = 0; index < segments; index += 1) {
    const position = start + step * (index + 0.5);
    const stats = aggregateLineEvidenceStats(
      analysis,
      axis,
      position,
      crossMin,
      crossMax,
      crossStride,
      Math.max(1, Math.floor(windowRadius / 2)),
    );
    baselineTotal += stats.strength;
    baselineCoverageTotal += stats.coverage;
    baselineSamples += 1;
  }

  return {
    line: lineSamples > 0 ? lineTotal / lineSamples : 0,
    baseline: baselineSamples > 0 ? baselineTotal / baselineSamples : 0,
    coverage: lineSamples > 0 ? lineCoverageTotal / lineSamples : 0,
    baselineCoverage: baselineSamples > 0 ? baselineCoverageTotal / baselineSamples : 0,
  };
}

interface LineEvidenceStats {
  readonly strength: number;
  readonly coverage: number;
}

function aggregateLineEvidence(
  analysis: AnalysisImage,
  axis: 'vertical' | 'horizontal',
  position: number,
  crossMin: number,
  crossMax: number,
  crossStride: number,
  windowRadius: number,
): number {
  return aggregateLineEvidenceStats(
    analysis,
    axis,
    position,
    crossMin,
    crossMax,
    crossStride,
    windowRadius,
  ).strength;
}

function aggregateLineEvidenceStats(
  analysis: AnalysisImage,
  axis: 'vertical' | 'horizontal',
  position: number,
  crossMin: number,
  crossMax: number,
  crossStride: number,
  windowRadius: number,
): LineEvidenceStats {
  const center = Math.round(position);
  let total = 0;
  let samples = 0;
  let coveredSamples = 0;

  for (let cross = crossMin; cross <= crossMax; cross += crossStride) {
    let best = 0;

    for (let offset = -windowRadius; offset <= windowRadius; offset += 1) {
      const current = center + offset;

      if (axis === 'vertical') {
        if (current <= 0 || current >= analysis.width - 1) {
          continue;
        }

        best = Math.max(
          best,
          verticalEvidenceAt(analysis.luminance, analysis.width, analysis.height, current, cross),
        );
      } else {
        if (current <= 0 || current >= analysis.height - 1) {
          continue;
        }

        best = Math.max(
          best,
          horizontalEvidenceAt(analysis.luminance, analysis.width, analysis.height, cross, current),
        );
      }
    }

    total += best;
    if (best >= CONTINUOUS_LINE_EVIDENCE_MIN) {
      coveredSamples += 1;
    }
    samples += 1;
  }

  return {
    strength: samples > 0 ? total / samples : 0,
    coverage: samples > 0 ? coveredSamples / samples : 0,
  };
}

function refineOuterRectangle(
  raster: LoadedRaster,
  analysis: AnalysisImage,
  candidate: RectCandidate,
): RefinedRectangle {
  const inverseScale = 1 / analysis.scale;
  const estimatedLeft = candidate.vertical.start * inverseScale;
  const estimatedRight = candidate.vertical.end * inverseScale;
  const estimatedTop = candidate.horizontal.start * inverseScale;
  const estimatedBottom = candidate.horizontal.end * inverseScale;
  const estimatedCell = Math.min(
    (estimatedRight - estimatedLeft) / PIXELANIM_GRID_COLUMNS,
    (estimatedBottom - estimatedTop) / PIXELANIM_GRID_ROWS,
  );
  const searchRadius = Math.round(clamp(estimatedCell * 0.24, 4, MAX_BOUNDARY_SEARCH_PIXELS));
  const cropLeft = Math.max(0, Math.floor(estimatedLeft - searchRadius - 2));
  const cropTop = Math.max(0, Math.floor(estimatedTop - searchRadius - 2));
  const cropRight = Math.min(raster.width, Math.ceil(estimatedRight + searchRadius + 2));
  const cropBottom = Math.min(raster.height, Math.ceil(estimatedBottom + searchRadius + 2));
  const cropWidth = Math.max(1, cropRight - cropLeft);
  const cropHeight = Math.max(1, cropBottom - cropTop);
  const canvas = document.createElement('canvas');
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    return {
      left: estimatedLeft,
      top: estimatedTop,
      right: estimatedRight,
      bottom: estimatedBottom,
    };
  }

  context.drawImage(raster.source, 0, 0, raster.width, raster.height);
  const crop = context.getImageData(cropLeft, cropTop, cropWidth, cropHeight);
  const luminance = createLuminance(crop.data, cropWidth, cropHeight);
  const cropAnalysis: AnalysisImage = {
    luminance,
    width: cropWidth,
    height: cropHeight,
    scale: 1,
  };
  const localLeft = estimatedLeft - cropLeft;
  const localRight = estimatedRight - cropLeft;
  const localTop = estimatedTop - cropTop;
  const localBottom = estimatedBottom - cropTop;
  const localYStart = clamp(Math.round(localTop), 1, cropHeight - 2);
  const localYEnd = clamp(Math.round(localBottom), 1, cropHeight - 2);
  const localXStart = clamp(Math.round(localLeft), 1, cropWidth - 2);
  const localXEnd = clamp(Math.round(localRight), 1, cropWidth - 2);
  const left =
    cropLeft +
    refineSingleBoundary(cropAnalysis, 'vertical', localLeft, localYStart, localYEnd, searchRadius);
  const right =
    cropLeft +
    refineSingleBoundary(
      cropAnalysis,
      'vertical',
      localRight,
      localYStart,
      localYEnd,
      searchRadius,
    );
  const top =
    cropTop +
    refineSingleBoundary(
      cropAnalysis,
      'horizontal',
      localTop,
      localXStart,
      localXEnd,
      searchRadius,
    );
  const bottom =
    cropTop +
    refineSingleBoundary(
      cropAnalysis,
      'horizontal',
      localBottom,
      localXStart,
      localXEnd,
      searchRadius,
    );

  return {
    left: clamp(left, 0, raster.width),
    top: clamp(top, 0, raster.height),
    right: clamp(right, 0, raster.width),
    bottom: clamp(bottom, 0, raster.height),
  };
}

function refineSingleBoundary(
  analysis: AnalysisImage,
  axis: 'vertical' | 'horizontal',
  estimatedPosition: number,
  crossStart: number,
  crossEnd: number,
  searchRadius: number,
): number {
  const center = Math.round(estimatedPosition);
  const minPosition = Math.max(1, center - searchRadius);
  const maxPosition = Math.min(
    (axis === 'vertical' ? analysis.width : analysis.height) - 2,
    center + searchRadius,
  );
  const crossMin = Math.max(1, Math.min(crossStart, crossEnd));
  const crossMax = Math.min(
    (axis === 'vertical' ? analysis.height : analysis.width) - 2,
    Math.max(crossStart, crossEnd),
  );
  const crossStride = Math.max(1, Math.floor((crossMax - crossMin) / 800));
  let bestPosition = clamp(center, minPosition, maxPosition);
  let bestEvidence = Number.NEGATIVE_INFINITY;

  for (let position = minPosition; position <= maxPosition; position += 1) {
    const evidence = aggregateLineEvidence(
      analysis,
      axis,
      position,
      crossMin,
      crossMax,
      crossStride,
      1,
    );

    if (evidence > bestEvidence) {
      bestEvidence = evidence;
      bestPosition = position;
    }
  }

  return bestPosition;
}

function createAnalysisImage(raster: LoadedRaster): AnalysisImage | null {
  const scale = Math.min(1, MAX_ANALYSIS_LONG_EDGE / Math.max(raster.width, raster.height));
  const width = Math.max(1, Math.round(raster.width * scale));
  const height = Math.max(1, Math.round(raster.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    return null;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(raster.source, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);

  return {
    luminance: createLuminance(imageData.data, width, height),
    width,
    height,
    scale,
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

function verticalEvidenceAt(
  luminance: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  if (x <= 0 || x >= width - 1 || y < 0 || y >= height) {
    return 0;
  }

  const index = y * width + x;
  const left = luminance[index - 1] ?? 0;
  const center = luminance[index] ?? 0;
  const right = luminance[index + 1] ?? 0;
  const gradient = Math.abs(right - left);
  const ridge = Math.abs(center - (left + right) / 2);

  return gradient * 0.56 + ridge * 0.82;
}

function horizontalEvidenceAt(
  luminance: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  if (x < 0 || x >= width || y <= 0 || y >= height - 1) {
    return 0;
  }

  const index = y * width + x;
  const top = luminance[index - width] ?? 0;
  const center = luminance[index] ?? 0;
  const bottom = luminance[index + width] ?? 0;
  const gradient = Math.abs(bottom - top);
  const ridge = Math.abs(center - (top + bottom) / 2);

  return gradient * 0.56 + ridge * 0.82;
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

function failure(
  reason: GridDetectionFailureReason,
  message: string,
  naturalImage?: NaturalImageSize,
  metrics?: DetectionMetrics,
  confidence?: DetectionConfidence,
): GridDetectionFailure {
  const result: GridDetectionFailure = {
    ok: false,
    reason,
    message,
  };

  if (naturalImage && metrics && confidence) {
    return {
      ...result,
      naturalImage,
      metrics,
      confidence,
    };
  }

  if (naturalImage && metrics) {
    return {
      ...result,
      naturalImage,
      metrics,
    };
  }

  if (naturalImage) {
    return {
      ...result,
      naturalImage,
    };
  }

  if (metrics && confidence) {
    return {
      ...result,
      metrics,
      confidence,
    };
  }

  if (metrics) {
    return {
      ...result,
      metrics,
    };
  }

  if (confidence) {
    return {
      ...result,
      confidence,
    };
  }

  return result;
}
