import type { GridDetectionConstraints, GridDetectionContract } from '../grid-api/client';

export type GridConfidenceLevel = 'high' | 'review' | 'insufficient';

export interface GridConfirmationState {
  readonly level: GridConfidenceLevel;
  readonly dimensions: string;
  readonly confidenceLabel: string;
  readonly warning: string | null;
  readonly canSubmit: boolean;
  readonly requiresWarningAcknowledgement: boolean;
}

const WARNING_COPY: Readonly<Record<string, string>> = Object.freeze({
  GRID_BOUNDARY_UNCERTAIN: '外边界由已占用豆位推断，请确认是否遗漏整行或整列空白格。',
  GRID_HARMONIC_AMBIGUOUS: '行列数可能少算或多算，请核对当前结果。',
  GRID_LOW_CONFIDENCE: '这张图的网格线较浅，请放大核对红框和行列数。',
  GRID_PERIODIC_ONLY: '这张图的网格线较浅，请确认红框覆盖完整网格，并核对行列数。',
  GRID_MANUAL_GEOMETRY_REVIEW_REQUIRED: '已按手动范围和行列数重建网格，请核对四角。',
  GRID_PERSPECTIVE_REVIEW_REQUIRED: '图纸存在旋转或透视，结果会先校正再按完整格位镜像。',
});

export function resolveGridConfirmation(
  contract: GridDetectionContract | null,
  acknowledgedCandidateId: string | null,
): GridConfirmationState {
  if (!contract) {
    return Object.freeze({
      level: 'insufficient',
      dimensions: '暂时没有识别出完整网格',
      confidenceLabel: '识别状态：未完成',
      warning: null,
      canSubmit: false,
      requiresWarningAcknowledgement: false,
    });
  }

  const warning = describeWarnings(contract.warnings);
  const requiresWarningAcknowledgement =
    contract.review === 'review' && acknowledgedCandidateId !== contract.candidateId;
  return Object.freeze({
    level: contract.review === 'ready' ? 'high' : 'review',
    dimensions: `检测到 ${String(contract.columns)} 列 × ${String(contract.rows)} 行`,
    confidenceLabel:
      contract.review === 'ready'
        ? `识别状态：可直接镜像（${formatPercent(contract.confidence)}）`
        : `识别状态：请核对（${formatPercent(contract.confidence)}）`,
    warning,
    canSubmit: !requiresWarningAcknowledgement,
    requiresWarningAcknowledgement,
  });
}

export function createGridDimensionConstraints(
  contract: GridDetectionContract,
  columns: number,
  rows: number,
): GridDetectionConstraints | null {
  if (
    !Number.isInteger(columns) ||
    !Number.isInteger(rows) ||
    columns < 2 ||
    columns > 300 ||
    rows < 2 ||
    rows > 300
  ) {
    return null;
  }
  return Object.freeze({
    quad: contract.sourceQuad,
    expectedColumns: columns,
    expectedRows: rows,
  });
}

function describeWarnings(warnings: readonly string[]): string | null {
  if (warnings.length === 0) {
    return null;
  }
  return warnings
    .map((warning) => WARNING_COPY[warning] ?? '还有一项识别结果需要复核，请检查网格范围和行列数。')
    .join(' ');
}

function formatPercent(confidence: number): string {
  return `${String(Math.round(confidence * 100))}%`;
}
