import {
  PIXELANIM_GRID_COLUMNS,
  PIXELANIM_GRID_ROWS,
  PIXELANIM_HORIZONTAL_BOUNDARY_COUNT,
  PIXELANIM_VERTICAL_BOUNDARY_COUNT,
} from '../grid-selection/constants';
import type { NaturalImageSize } from '../grid-selection/types';
import type { GridMirrorProcessingFailure, GridMirrorProcessingOutcome } from './types';
import type { PixelGridCalibration } from '../grid-precision/types';

interface LoadedRaster {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  readonly close: () => void;
}

export async function mirrorGridCells(input: {
  readonly file: File;
  readonly calibration: PixelGridCalibration;
}): Promise<GridMirrorProcessingOutcome> {
  const calibrationValidation = validateCalibration(input.calibration);

  if (calibrationValidation) {
    return calibrationValidation;
  }

  let raster: LoadedRaster;

  try {
    raster = await loadRasterFromFile(input.file);
  } catch {
    return failure('decode-failed', '无法从当前原始本地文件读取自然像素，镜像预览已停止。');
  }

  try {
    if (
      raster.width !== input.calibration.naturalImage.width ||
      raster.height !== input.calibration.naturalImage.height
    ) {
      return failure('image-size-mismatch', '原始文件尺寸与已确认精确校准不一致，镜像预览已拒绝。');
    }

    const sourceCanvas = createNaturalCanvas(raster.width, raster.height);
    const outputCanvas = createNaturalCanvas(raster.width, raster.height);
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    const outputContext = outputCanvas.getContext('2d');

    if (!sourceContext || !outputContext) {
      return failure('canvas-unavailable', '当前浏览器无法创建本地 Canvas 2D 镜像环境。');
    }

    sourceContext.imageSmoothingEnabled = false;
    outputContext.imageSmoothingEnabled = false;
    sourceContext.drawImage(raster.source, 0, 0);
    outputContext.putImageData(sourceContext.getImageData(0, 0, raster.width, raster.height), 0, 0);
    moveGridCells(sourceCanvas, outputContext, input.calibration);

    return {
      ok: true,
      result: Object.freeze({
        sourceDimensions: freezeSize(input.calibration.naturalImage),
        resultDimensions: freezeSize(input.calibration.naturalImage),
        gridOrigin: Object.freeze({
          left: input.calibration.left,
          top: input.calibration.top,
        }),
        cellSize: input.calibration.cellSize,
        columns: PIXELANIM_GRID_COLUMNS,
        rows: PIXELANIM_GRID_ROWS,
        outputCanvas,
      }),
    };
  } catch {
    return failure('canvas-unavailable', '镜像预览生成时无法读取或写入本地 Canvas 像素。');
  } finally {
    raster.close();
  }
}

function validateCalibration(calibration: PixelGridCalibration): GridMirrorProcessingFailure | null {
  if (calibration.processingReady !== true) {
    return failure('not-processing-ready', '只有显式确认且 processingReady: true 的精确校准才能生成镜像预览。');
  }

  if (
    calibration.columns !== PIXELANIM_GRID_COLUMNS ||
    calibration.rows !== PIXELANIM_GRID_ROWS ||
    calibration.verticalBoundaries.length !== PIXELANIM_VERTICAL_BOUNDARY_COUNT ||
    calibration.horizontalBoundaries.length !== PIXELANIM_HORIZONTAL_BOUNDARY_COUNT
  ) {
    return failure('invalid-boundaries', '精确校准必须固定为 34 × 27，并包含 35 条垂直边界和 28 条水平边界。');
  }

  if (
    !allIntegers([
      calibration.naturalImage.width,
      calibration.naturalImage.height,
      calibration.left,
      calibration.top,
      calibration.right,
      calibration.bottom,
      calibration.cellSize,
      ...calibration.verticalBoundaries,
      ...calibration.horizontalBoundaries,
    ])
  ) {
    return failure('non-integer-geometry', '镜像预览只接受自然像素中的整数坐标、整数边界和整数单元尺寸。');
  }

  if (
    calibration.cellSize <= 0 ||
    calibration.right !== calibration.left + PIXELANIM_GRID_COLUMNS * calibration.cellSize ||
    calibration.bottom !== calibration.top + PIXELANIM_GRID_ROWS * calibration.cellSize
  ) {
    return failure('invalid-boundaries', '精确校准的右边界、下边界和单元尺寸无法推出完整 34 × 27 网格。');
  }

  if (
    calibration.left < 0 ||
    calibration.top < 0 ||
    calibration.right > calibration.naturalImage.width ||
    calibration.bottom > calibration.naturalImage.height
  ) {
    return failure('out-of-image', '已确认网格超出自然图片边界，镜像预览已拒绝。');
  }

  if (
    !hasExactSpacing(calibration.verticalBoundaries, calibration.left, calibration.right, calibration.cellSize) ||
    !hasExactSpacing(calibration.horizontalBoundaries, calibration.top, calibration.bottom, calibration.cellSize)
  ) {
    return failure('unequal-spacing', '精确校准边界必须以单元尺寸严格等距排列。');
  }

  return null;
}

function moveGridCells(
  sourceCanvas: HTMLCanvasElement,
  outputContext: CanvasRenderingContext2D,
  calibration: PixelGridCalibration,
): void {
  const { left, top, cellSize } = calibration;

  for (let row = 0; row < PIXELANIM_GRID_ROWS; row += 1) {
    const sourceY = top + row * cellSize;

    for (let sourceColumn = 0; sourceColumn < PIXELANIM_GRID_COLUMNS; sourceColumn += 1) {
      const targetColumn = PIXELANIM_GRID_COLUMNS - 1 - sourceColumn;
      const sourceX = left + sourceColumn * cellSize;
      const targetX = left + targetColumn * cellSize;

      outputContext.drawImage(
        sourceCanvas,
        sourceX,
        sourceY,
        cellSize,
        cellSize,
        targetX,
        sourceY,
        cellSize,
        cellSize,
      );
    }
  }
}

function hasExactSpacing(
  boundaries: readonly number[],
  expectedStart: number,
  expectedEnd: number,
  cellSize: number,
): boolean {
  if (boundaries[0] !== expectedStart || boundaries[boundaries.length - 1] !== expectedEnd) {
    return false;
  }

  for (let index = 1; index < boundaries.length; index += 1) {
    const previous = boundaries[index - 1];
    const current = boundaries[index];

    if (previous === undefined || current === undefined || current - previous !== cellSize) {
      return false;
    }
  }

  return true;
}

function createNaturalCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function freezeSize(size: NaturalImageSize): NaturalImageSize {
  return Object.freeze({
    width: size.width,
    height: size.height,
  });
}

function allIntegers(values: readonly number[]): boolean {
  return values.every((value) => Number.isInteger(value));
}

function failure(
  reason: GridMirrorProcessingFailure['reason'],
  message: string,
): GridMirrorProcessingFailure {
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
