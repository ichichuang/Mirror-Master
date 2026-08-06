import type { MaskStrokePoint } from './maskEditSession';
import type { MaskEditRect } from './maskEditGeometry';

export interface MaskViewportDimensions {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly imageWidth: number;
  readonly imageHeight: number;
}

export interface MaskViewport extends MaskViewportDimensions {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export function createFittedMaskViewport(input: MaskViewportDimensions): MaskViewport {
  const dimensions = validDimensions(input);
  const scale = fitScale(dimensions);
  return constrainViewport({
    ...dimensions,
    scale,
    offsetX: (dimensions.canvasWidth - dimensions.imageWidth * scale) / 2,
    offsetY: (dimensions.canvasHeight - dimensions.imageHeight * scale) / 2,
  });
}

export function maskViewportScaleLimits(viewport: MaskViewport): {
  readonly min: number;
  readonly max: number;
} {
  const min = fitScale(viewport);
  const max = Math.max(min, Math.min(16, Math.max(8, 1 / min)));
  return { min, max };
}

export function zoomMaskViewportAt(
  viewport: MaskViewport,
  requestedScale: number,
  anchorX: number,
  anchorY: number,
): MaskViewport {
  const limits = maskViewportScaleLimits(viewport);
  const scale = clamp(finiteOr(requestedScale, viewport.scale), limits.min, limits.max);
  const sourceX = (anchorX - viewport.offsetX) / viewport.scale;
  const sourceY = (anchorY - viewport.offsetY) / viewport.scale;
  return constrainViewport({
    ...viewport,
    scale,
    offsetX: anchorX - sourceX * scale,
    offsetY: anchorY - sourceY * scale,
  });
}

export function panMaskViewport(
  viewport: MaskViewport,
  deltaX: number,
  deltaY: number,
): MaskViewport {
  return constrainViewport({
    ...viewport,
    offsetX: viewport.offsetX + finiteOr(deltaX, 0),
    offsetY: viewport.offsetY + finiteOr(deltaY, 0),
  });
}

export function resizeMaskViewport(
  viewport: MaskViewport,
  canvasWidth: number,
  canvasHeight: number,
): MaskViewport {
  const sourceCenterX = (viewport.canvasWidth / 2 - viewport.offsetX) / viewport.scale;
  const sourceCenterY = (viewport.canvasHeight / 2 - viewport.offsetY) / viewport.scale;
  const dimensions = validDimensions({
    ...viewport,
    canvasWidth,
    canvasHeight,
  });
  const limits = maskViewportScaleLimits({ ...viewport, ...dimensions });
  const scale = clamp(viewport.scale, limits.min, limits.max);
  return constrainViewport({
    ...viewport,
    ...dimensions,
    scale,
    offsetX: dimensions.canvasWidth / 2 - sourceCenterX * scale,
    offsetY: dimensions.canvasHeight / 2 - sourceCenterY * scale,
  });
}

export function actualSizeMaskViewport(viewport: MaskViewport): MaskViewport {
  return zoomMaskViewportAt(viewport, 1, viewport.canvasWidth / 2, viewport.canvasHeight / 2);
}

export function maskViewportImageRect(viewport: MaskViewport): MaskEditRect {
  return {
    left: viewport.offsetX,
    top: viewport.offsetY,
    width: viewport.imageWidth * viewport.scale,
    height: viewport.imageHeight * viewport.scale,
  };
}

export function maskViewportPointToImage(
  viewport: MaskViewport,
  x: number,
  y: number,
): MaskStrokePoint | null {
  const rect = maskViewportImageRect(viewport);
  if (x < rect.left || y < rect.top || x > rect.left + rect.width || y > rect.top + rect.height) {
    return null;
  }
  return {
    x: clamp((x - rect.left) / viewport.scale, 0, viewport.imageWidth),
    y: clamp((y - rect.top) / viewport.scale, 0, viewport.imageHeight),
  };
}

function constrainViewport(viewport: MaskViewport): MaskViewport {
  const limits = maskViewportScaleLimits(viewport);
  const scale = clamp(viewport.scale, limits.min, limits.max);
  const displayedWidth = viewport.imageWidth * scale;
  const displayedHeight = viewport.imageHeight * scale;
  return Object.freeze({
    ...viewport,
    scale,
    offsetX:
      displayedWidth <= viewport.canvasWidth
        ? (viewport.canvasWidth - displayedWidth) / 2
        : clamp(viewport.offsetX, viewport.canvasWidth - displayedWidth, 0),
    offsetY:
      displayedHeight <= viewport.canvasHeight
        ? (viewport.canvasHeight - displayedHeight) / 2
        : clamp(viewport.offsetY, viewport.canvasHeight - displayedHeight, 0),
  });
}

function fitScale(dimensions: MaskViewportDimensions): number {
  return Math.min(
    dimensions.canvasWidth / dimensions.imageWidth,
    dimensions.canvasHeight / dimensions.imageHeight,
  );
}

function validDimensions(input: MaskViewportDimensions): MaskViewportDimensions {
  return Object.freeze({
    canvasWidth: positive(input.canvasWidth),
    canvasHeight: positive(input.canvasHeight),
    imageWidth: positive(input.imageWidth),
    imageHeight: positive(input.imageHeight),
  });
}

function positive(value: number): number {
  return Math.max(1, finiteOr(value, 1));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
