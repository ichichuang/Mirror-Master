import { isValidGridBoundarySelection } from '../grid-selection/geometry';
import type {
  GridBoundarySelection,
  NaturalImageSize,
} from '../grid-selection/types';
import type {
  GridMirrorInput,
  GridMirrorProcessingFailure,
  GridMirrorProcessingOutcome,
} from './types';

interface LoadedRaster {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  readonly close: () => void;
}

export async function mirrorGridCells(input: GridMirrorInput): Promise<GridMirrorProcessingOutcome> {
  if (
    !isValidGridBoundarySelection(input.selection) ||
    !hasIdenticalSquareCells(input.selection)
  ) {
    return failure('invalid-boundaries', '当前网格选区无效，请返回原图重新调整。');
  }

  let raster: LoadedRaster;

  try {
    raster = await loadRasterFromFile(input.file);
  } catch {
    return failure('decode-failed', '无法从当前原始本地文件读取自然像素，镜像预览已停止。');
  }

  try {
    if (
      raster.width !== input.selection.naturalImage.width ||
      raster.height !== input.selection.naturalImage.height
    ) {
      return failure('image-size-mismatch', '当前图片已变化，请重新调整网格后再生成镜像。');
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
    moveGridCells(sourceCanvas, outputContext, input.selection);

    return {
      ok: true,
      result: Object.freeze({
        sourceDimensions: freezeSize(input.selection.naturalImage),
        resultDimensions: freezeSize(input.selection.naturalImage),
        gridOrigin: Object.freeze({
          left: input.selection.left,
          top: input.selection.top,
        }),
        cellSize: input.selection.cellSize,
        columns: input.selection.columns,
        rows: input.selection.rows,
        outputCanvas,
      }),
    };
  } catch {
    return failure('canvas-unavailable', '镜像预览生成时无法读取或写入本地 Canvas 像素。');
  } finally {
    raster.close();
  }
}

function moveGridCells(
  sourceCanvas: HTMLCanvasElement,
  outputContext: CanvasRenderingContext2D,
  selection: GridBoundarySelection,
): void {
  const {
    columns,
    rows,
    xBoundaries,
    yBoundaries,
  } = selection;

  for (let row = 0; row < rows; row += 1) {
    const sourceTop = yBoundaries[row];
    const sourceBottom = yBoundaries[row + 1];

    if (sourceTop === undefined || sourceBottom === undefined) {
      throw new Error('Missing row boundaries.');
    }

    for (let sourceColumn = 0; sourceColumn < columns; sourceColumn += 1) {
      const targetColumn = columns - 1 - sourceColumn;
      const sourceLeft = xBoundaries[sourceColumn];
      const sourceRight = xBoundaries[sourceColumn + 1];
      const targetLeft = xBoundaries[targetColumn];
      const targetRight = xBoundaries[targetColumn + 1];

      if (
        sourceLeft === undefined ||
        sourceRight === undefined ||
        targetLeft === undefined ||
        targetRight === undefined
      ) {
        throw new Error('Missing column boundaries.');
      }

      outputContext.drawImage(
        sourceCanvas,
        sourceLeft,
        sourceTop,
        sourceRight - sourceLeft,
        sourceBottom - sourceTop,
        targetLeft,
        sourceTop,
        targetRight - targetLeft,
        sourceBottom - sourceTop,
      );
    }
  }
}

function hasIdenticalSquareCells(
  selection: GridBoundarySelection,
): boolean {
  const { cellSize, columns, rows, xBoundaries, yBoundaries } = selection;

  for (let column = 0; column < columns; column += 1) {
    const left = xBoundaries[column];
    const right = xBoundaries[column + 1];
    const targetColumn = columns - 1 - column;
    const targetLeft = xBoundaries[targetColumn];
    const targetRight = xBoundaries[targetColumn + 1];

    if (
      left === undefined ||
      right === undefined ||
      targetLeft === undefined ||
      targetRight === undefined ||
      right - left !== cellSize ||
      targetRight - targetLeft !== cellSize
    ) {
      return false;
    }
  }

  for (let row = 0; row < rows; row += 1) {
    const top = yBoundaries[row];
    const bottom = yBoundaries[row + 1];

    if (
      top === undefined ||
      bottom === undefined ||
      bottom - top !== cellSize
    ) {
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
