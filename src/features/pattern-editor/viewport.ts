export interface ViewportBounds {
  readonly width: number;
  readonly height: number;
}

export interface GridDimensions {
  readonly rows: number;
  readonly columns: number;
}

export interface ViewportPoint {
  readonly x: number;
  readonly y: number;
}

export interface ViewportTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface ViewportConfig {
  readonly padding: number;
  readonly minScale: number;
  readonly maxScale: number;
  readonly actualCellSize: number;
}

export interface VisibleCellRange {
  readonly startRow: number;
  readonly endRow: number;
  readonly startColumn: number;
  readonly endColumn: number;
}

export interface ViewportCell {
  readonly row: number;
  readonly column: number;
}

export function fitViewport(
  viewport: ViewportBounds,
  grid: GridDimensions,
  config: ViewportConfig,
): ViewportTransform {
  const availableWidth = Math.max(1, viewport.width - config.padding * 2);
  const availableHeight = Math.max(1, viewport.height - config.padding * 2);
  const scale = clamp(
    Math.min(availableWidth / Math.max(1, grid.columns), availableHeight / Math.max(1, grid.rows)),
    config.minScale,
    config.maxScale,
  );

  return clampViewport(
    {
      scale,
      offsetX: (viewport.width - grid.columns * scale) / 2,
      offsetY: (viewport.height - grid.rows * scale) / 2,
    },
    viewport,
    grid,
    config,
  );
}

export function actualViewport(
  viewport: ViewportBounds,
  grid: GridDimensions,
  config: ViewportConfig,
): ViewportTransform {
  const scale = clamp(config.actualCellSize, config.minScale, config.maxScale);
  return clampViewport(
    {
      scale,
      offsetX: (viewport.width - grid.columns * scale) / 2,
      offsetY: (viewport.height - grid.rows * scale) / 2,
    },
    viewport,
    grid,
    config,
  );
}

export function zoomViewportAt(
  transform: ViewportTransform,
  requestedScale: number,
  anchor: ViewportPoint,
  viewport: ViewportBounds,
  grid: GridDimensions,
  config: ViewportConfig,
): ViewportTransform {
  const scale = clamp(requestedScale, config.minScale, config.maxScale);
  const contentX = (anchor.x - transform.offsetX) / transform.scale;
  const contentY = (anchor.y - transform.offsetY) / transform.scale;

  return clampViewport(
    {
      scale,
      offsetX: anchor.x - contentX * scale,
      offsetY: anchor.y - contentY * scale,
    },
    viewport,
    grid,
    config,
  );
}

export function pinchViewport(
  transform: ViewportTransform,
  requestedScale: number,
  baselineCentroid: ViewportPoint,
  currentCentroid: ViewportPoint,
  viewport: ViewportBounds,
  grid: GridDimensions,
  config: ViewportConfig,
): ViewportTransform {
  const scale = clamp(requestedScale, config.minScale, config.maxScale);
  const contentX = (baselineCentroid.x - transform.offsetX) / transform.scale;
  const contentY = (baselineCentroid.y - transform.offsetY) / transform.scale;

  return clampViewport(
    {
      scale,
      offsetX: currentCentroid.x - contentX * scale,
      offsetY: currentCentroid.y - contentY * scale,
    },
    viewport,
    grid,
    config,
  );
}

export function panViewport(
  transform: ViewportTransform,
  deltaX: number,
  deltaY: number,
  viewport: ViewportBounds,
  grid: GridDimensions,
  config: ViewportConfig,
): ViewportTransform {
  return clampViewport(
    {
      ...transform,
      offsetX: transform.offsetX + deltaX,
      offsetY: transform.offsetY + deltaY,
    },
    viewport,
    grid,
    config,
  );
}

export function clampViewport(
  transform: ViewportTransform,
  viewport: ViewportBounds,
  grid: GridDimensions,
  config: ViewportConfig,
): ViewportTransform {
  const scale = clamp(transform.scale, config.minScale, config.maxScale);
  const contentWidth = grid.columns * scale;
  const contentHeight = grid.rows * scale;

  return Object.freeze({
    scale,
    offsetX: clampAxis(transform.offsetX, contentWidth, viewport.width, config.padding),
    offsetY: clampAxis(transform.offsetY, contentHeight, viewport.height, config.padding),
  });
}

export function getVisibleCellRange(
  transform: ViewportTransform,
  viewport: ViewportBounds,
  grid: GridDimensions,
): VisibleCellRange | null {
  const startColumn = Math.max(0, Math.floor(-transform.offsetX / transform.scale));
  const endColumn = Math.min(
    grid.columns - 1,
    Math.ceil((viewport.width - transform.offsetX) / transform.scale) - 1,
  );
  const startRow = Math.max(0, Math.floor(-transform.offsetY / transform.scale));
  const endRow = Math.min(
    grid.rows - 1,
    Math.ceil((viewport.height - transform.offsetY) / transform.scale) - 1,
  );

  if (startColumn > endColumn || startRow > endRow) {
    return null;
  }

  return Object.freeze({ startRow, endRow, startColumn, endColumn });
}

export function screenToCell(
  point: ViewportPoint,
  transform: ViewportTransform,
  grid: GridDimensions,
  reverseColumns = false,
): ViewportCell | null {
  const visibleColumn = Math.floor((point.x - transform.offsetX) / transform.scale);
  const row = Math.floor((point.y - transform.offsetY) / transform.scale);
  if (row < 0 || row >= grid.rows || visibleColumn < 0 || visibleColumn >= grid.columns) {
    return null;
  }

  return Object.freeze({
    row,
    column: reverseColumns ? grid.columns - 1 - visibleColumn : visibleColumn,
  });
}

function clampAxis(
  offset: number,
  contentSize: number,
  viewportSize: number,
  padding: number,
): number {
  if (contentSize + padding * 2 <= viewportSize) {
    return (viewportSize - contentSize) / 2;
  }

  return clamp(offset, viewportSize - padding - contentSize, padding);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
