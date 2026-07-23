import {
  PIXELANIM_GRID_COLUMNS,
  PIXELANIM_GRID_ROWS,
  PIXELANIM_HORIZONTAL_BOUNDARY_COUNT,
  PIXELANIM_VERTICAL_BOUNDARY_COUNT,
} from '../grid-selection/constants';
import type {
  IntegerGridSelection,
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
  const selectionValidation = validateSelection(input.selection);

  if (selectionValidation) {
    return selectionValidation;
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

function validateSelection(selection: IntegerGridSelection): GridMirrorProcessingFailure | null {
  if (!selection.confirmedByInteraction) {
    return failure('not-confirmed-by-interaction', '请先在原图上移动或调整网格选区。');
  }

  if (
    selection.columns !== PIXELANIM_GRID_COLUMNS ||
    selection.rows !== PIXELANIM_GRID_ROWS ||
    selection.verticalBoundaries.length !== PIXELANIM_VERTICAL_BOUNDARY_COUNT ||
    selection.horizontalBoundaries.length !== PIXELANIM_HORIZONTAL_BOUNDARY_COUNT
  ) {
    return failure('invalid-boundaries', '当前网格选区无效，请返回原图重新调整。');
  }

  if (
    !allIntegers([
      selection.naturalImage.width,
      selection.naturalImage.height,
      selection.left,
      selection.top,
      selection.right,
      selection.bottom,
      selection.cellSize,
      ...selection.verticalBoundaries,
      ...selection.horizontalBoundaries,
    ])
  ) {
    return failure('non-integer-geometry', '当前网格选区无效，请返回原图重新调整。');
  }

  if (
    selection.cellSize <= 0 ||
    selection.right !== selection.left + PIXELANIM_GRID_COLUMNS * selection.cellSize ||
    selection.bottom !== selection.top + PIXELANIM_GRID_ROWS * selection.cellSize
  ) {
    return failure('invalid-boundaries', '当前网格选区无效，请返回原图重新调整。');
  }

  if (
    selection.left < 0 ||
    selection.top < 0 ||
    selection.right > selection.naturalImage.width ||
    selection.bottom > selection.naturalImage.height
  ) {
    return failure('out-of-image', '当前网格选区超出图片，请返回原图重新调整。');
  }

  if (
    !hasExactSpacing(
      selection.verticalBoundaries,
      selection.left,
      selection.right,
      selection.cellSize,
    ) ||
    !hasExactSpacing(
      selection.horizontalBoundaries,
      selection.top,
      selection.bottom,
      selection.cellSize,
    )
  ) {
    return failure('unequal-spacing', '当前网格选区无效，请返回原图重新调整。');
  }

  return null;
}

function moveGridCells(
  sourceCanvas: HTMLCanvasElement,
  outputContext: CanvasRenderingContext2D,
  selection: IntegerGridSelection,
): void {
  const { left, top, cellSize } = selection;

  for (let row = 0; row < PIXELANIM_GRID_ROWS; row += 1) {
    const sourceY = top + row * cellSize;

    for (let sourceColumn = 0; sourceColumn < PIXELANIM_GRID_COLUMNS; sourceColumn += 1) {
      const targetColumn = 33 - sourceColumn;
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
