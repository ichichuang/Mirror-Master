import type { DetectionRectangle, GridDetectionContract } from '../grid-api/client';

export type GridConfidenceLevel = 'high' | 'review' | 'insufficient';

export interface GridConfirmationState {
  readonly level: GridConfidenceLevel;
  readonly dimensions: string;
  readonly confidenceLabel: string;
  readonly warning: string | null;
  readonly canSubmit: boolean;
  readonly requiresWarningAcknowledgement: boolean;
}

export function resolveGridConfirmation(
  contract: GridDetectionContract | null,
  warningAcknowledged: boolean,
): GridConfirmationState {
  if (!contract) {
    return Object.freeze({
      level: 'insufficient',
      dimensions: '尚未检测到有效网格',
      confidenceLabel: '网格置信度：不足',
      warning: null,
      canSubmit: false,
      requiresWarningAcknowledgement: false,
    });
  }

  const requiresWarningAcknowledgement = contract.warning !== null && !warningAcknowledged;
  return Object.freeze({
    level: contract.warning === null ? 'high' : 'review',
    dimensions: `检测到 ${String(contract.columns)} 列 × ${String(contract.rows)} 行`,
    confidenceLabel: contract.warning === null ? '网格置信度：高' : '网格置信度：需要确认',
    warning: contract.warning,
    canSubmit: !requiresWarningAcknowledgement,
    requiresWarningAcknowledgement,
  });
}

export function createGridDimensionRectangle(
  contract: GridDetectionContract,
  columns: number,
  rows: number,
): DetectionRectangle | null {
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

  const width = columns * contract.cellSize;
  const height = rows * contract.cellSize;
  if (width > contract.naturalWidth || height > contract.naturalHeight) {
    return null;
  }

  const left = Math.min(contract.left, contract.naturalWidth - width);
  const top = Math.min(contract.top, contract.naturalHeight - height);
  return Object.freeze({
    left,
    top,
    right: left + width,
    bottom: top + height,
  });
}

export function createGridDimensionContract(
  contract: GridDetectionContract,
  columns: number,
  rows: number,
): GridDetectionContract | null {
  const rectangle = createGridDimensionRectangle(contract, columns, rows);
  if (!rectangle) {
    return null;
  }

  return Object.freeze({
    ...contract,
    ...rectangle,
    columns,
    rows,
    xBoundaries: Object.freeze(
      Array.from({ length: columns + 1 }, (_, index) => rectangle.left + index * contract.cellSize),
    ),
    yBoundaries: Object.freeze(
      Array.from({ length: rows + 1 }, (_, index) => rectangle.top + index * contract.cellSize),
    ),
    warning: '已按手动设置的行列数更新，请确认红色网格范围。',
  });
}
