import {
  applyCropKeyboardStep,
  normalizeCropPercent,
  type CropArrowKey,
  type CropPercent,
} from '../crop-controls/cropControls';
import { syncCropNumericInputValues } from '../prepare-workspace/prepareWorkspace';
import type { ImageRotation } from '../../domain/project';

export interface SourceDimensions {
  readonly width: number;
  readonly height: number;
}

export interface RotatedCropSourceRect {
  readonly rotatedWidth: number;
  readonly rotatedHeight: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CropNumericInputs {
  readonly x: HTMLInputElement;
  readonly y: HTMLInputElement;
  readonly width: HTMLInputElement;
  readonly height: HTMLInputElement;
}

export interface MountCropInteractionsOptions {
  readonly root: HTMLElement;
  readonly getCrop: () => CropPercent;
  readonly setCrop: (crop: CropPercent) => void;
  readonly onLiveChange: (editingInput?: HTMLInputElement) => void;
  readonly onGestureEnd: () => void;
  readonly announce: (message: string) => void;
}

export function drawRotatedCropPreview(
  root: HTMLElement,
  image: HTMLImageElement,
  rotation: ImageRotation,
): void {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-crop-canvas]');
  const frame = root.querySelector<HTMLElement>('[data-crop-frame]');
  if (!canvas || !frame) {
    throw new Error('缺少界面元素：裁剪画布。');
  }
  const dimensions =
    rotation === 90 || rotation === 270
      ? { width: image.naturalHeight, height: image.naturalWidth }
      : { width: image.naturalWidth, height: image.naturalHeight };
  const maxDimension = 1400;
  const scale = Math.min(1, maxDimension / Math.max(dimensions.width, dimensions.height));
  canvas.width = Math.max(1, Math.round(dimensions.width * scale));
  canvas.height = Math.max(1, Math.round(dimensions.height * scale));
  frame.style.aspectRatio = `${String(dimensions.width)} / ${String(dimensions.height)}`;
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  if (rotation === 90) {
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(image, 0, 0, canvas.height, canvas.width);
  } else if (rotation === 180) {
    context.translate(canvas.width, canvas.height);
    context.rotate(Math.PI);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } else if (rotation === 270) {
    context.translate(0, canvas.height);
    context.rotate(-Math.PI / 2);
    context.drawImage(image, 0, 0, canvas.height, canvas.width);
  } else {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  }
  context.restore();
}

export function computeRotatedCropSourceRect(
  source: SourceDimensions,
  rotation: ImageRotation,
  crop: CropPercent,
): RotatedCropSourceRect {
  if (
    !Number.isFinite(source.width) ||
    !Number.isFinite(source.height) ||
    source.width <= 0 ||
    source.height <= 0
  ) {
    throw new Error('原图尺寸必须是正数。');
  }
  const rotatedWidth = rotation === 90 || rotation === 270 ? source.height : source.width;
  const rotatedHeight = rotation === 90 || rotation === 270 ? source.width : source.height;
  const xPercent = clamp(crop.x, 0, 100);
  const yPercent = clamp(crop.y, 0, 100);
  const widthPercent = clamp(crop.width, 0, 100 - xPercent);
  const heightPercent = clamp(crop.height, 0, 100 - yPercent);
  return Object.freeze({
    rotatedWidth,
    rotatedHeight,
    x: rotatedWidth * (xPercent / 100),
    y: rotatedHeight * (yPercent / 100),
    width: Math.max(1, rotatedWidth * (widthPercent / 100)),
    height: Math.max(1, rotatedHeight * (heightPercent / 100)),
  });
}

export function drawAlignedOriginalPreview(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  rotation: ImageRotation,
  crop: CropPercent,
): boolean {
  const context = canvas.getContext('2d');
  if (!context || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    return false;
  }
  const host = canvas.parentElement;
  const canvasWidth = Math.max(1, Math.floor(canvas.clientWidth || host?.clientWidth || 1));
  const canvasHeight = Math.max(1, Math.floor(canvas.clientHeight || host?.clientHeight || 1));
  const pixelRatio = Math.max(
    1,
    canvas.ownerDocument.defaultView?.devicePixelRatio || globalThis.devicePixelRatio || 1,
  );
  const backingWidth = Math.max(1, Math.round(canvasWidth * pixelRatio));
  const backingHeight = Math.max(1, Math.round(canvasHeight * pixelRatio));
  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;

  const sourceRect = computeRotatedCropSourceRect(
    { width: image.naturalWidth, height: image.naturalHeight },
    rotation,
    crop,
  );
  context.save();
  context.scale(pixelRatio, pixelRatio);
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.scale(canvasWidth / sourceRect.width, canvasHeight / sourceRect.height);
  context.translate(-sourceRect.x, -sourceRect.y);
  drawRotatedSource(context, image, rotation, sourceRect.rotatedWidth, sourceRect.rotatedHeight);
  context.restore();
  return true;
}

export function renderCropSelectionOverlay(
  root: HTMLElement,
  crop: CropPercent,
  editingInput?: HTMLInputElement,
): void {
  const selection = root.querySelector<HTMLElement>('[data-crop-selection]');
  if (!selection) {
    throw new Error('缺少界面元素：[data-crop-selection]');
  }
  selection.style.left = `${String(crop.x)}%`;
  selection.style.top = `${String(crop.y)}%`;
  selection.style.width = `${String(crop.width)}%`;
  selection.style.height = `${String(crop.height)}%`;
  syncCropNumericInputValues(root, crop, editingInput);
}

export function mountCropInteractions(options: MountCropInteractionsOptions): void {
  const { root } = options;
  const cropFrame = root.querySelector<HTMLElement>('[data-crop-frame]');
  const cropSelection = root.querySelector<HTMLElement>('[data-crop-selection]');
  if (!cropFrame || !cropSelection) {
    throw new Error('缺少界面元素：裁剪交互区域。');
  }
  const cropInputs: CropNumericInputs = {
    x: requiredInput(root, '[data-crop-x]'),
    y: requiredInput(root, '[data-crop-y]'),
    width: requiredInput(root, '[data-crop-width]'),
    height: requiredInput(root, '[data-crop-height]'),
  };
  let cropGesture: {
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly initial: CropPercent;
    readonly handle: 'move' | 'nw' | 'ne' | 'sw' | 'se';
  } | null = null;

  cropSelection.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const handle = target.classList.contains('crop-handle-nw')
      ? 'nw'
      : target.classList.contains('crop-handle-ne')
        ? 'ne'
        : target.classList.contains('crop-handle-sw')
          ? 'sw'
          : target.classList.contains('crop-handle-se')
            ? 'se'
            : 'move';
    event.preventDefault();
    cropSelection.setPointerCapture(event.pointerId);
    cropGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initial: options.getCrop(),
      handle,
    };
  });
  cropSelection.addEventListener('pointermove', (event) => {
    if (!cropGesture || cropGesture.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const frameRect = cropFrame.getBoundingClientRect();
    const deltaX = ((event.clientX - cropGesture.startX) / frameRect.width) * 100;
    const deltaY = ((event.clientY - cropGesture.startY) / frameRect.height) * 100;
    options.setCrop(resizeCrop(cropGesture.initial, cropGesture.handle, deltaX, deltaY));
    options.onLiveChange();
  });
  const endCropGesture = (event: PointerEvent): void => {
    if (!cropGesture || cropGesture.pointerId !== event.pointerId) {
      return;
    }
    cropGesture = null;
    if (cropSelection.hasPointerCapture(event.pointerId)) {
      cropSelection.releasePointerCapture(event.pointerId);
    }
    options.announce('裁剪范围已更新。');
    options.onGestureEnd();
  };
  cropSelection.addEventListener('pointerup', endCropGesture);
  cropSelection.addEventListener('pointercancel', (event) => {
    if (!cropGesture || cropGesture.pointerId !== event.pointerId) {
      return;
    }
    options.setCrop(cropGesture.initial);
    cropGesture = null;
    options.onLiveChange();
    options.announce('本次裁剪调整已取消。');
  });
  cropSelection.addEventListener('lostpointercapture', (event) => {
    if (cropGesture?.pointerId === event.pointerId) {
      options.setCrop(cropGesture.initial);
      cropGesture = null;
      options.onLiveChange();
    }
  });
  cropSelection.addEventListener('keydown', (event) => {
    if (!isCropArrowKey(event.key)) {
      return;
    }
    event.preventDefault();
    options.setCrop(
      applyCropKeyboardStep(options.getCrop(), event.key, {
        resize: event.altKey,
        shiftKey: event.shiftKey,
      }),
    );
    options.onLiveChange();
    options.announce(event.altKey ? '裁剪大小已更新。' : '裁剪位置已更新。');
    options.onGestureEnd();
  });
  for (const input of [cropInputs.x, cropInputs.y, cropInputs.width, cropInputs.height]) {
    input.addEventListener('input', () => {
      options.setCrop(
        normalizeCropPercent({
          x: Number(cropInputs.x.value),
          y: Number(cropInputs.y.value),
          width: Number(cropInputs.width.value),
          height: Number(cropInputs.height.value),
        }),
      );
      options.onLiveChange(input);
    });
    input.addEventListener('change', () => {
      options.onGestureEnd();
    });
  }
}

export function resizeCrop(
  initial: CropPercent,
  handle: 'move' | 'nw' | 'ne' | 'sw' | 'se',
  deltaX: number,
  deltaY: number,
): CropPercent {
  const minimum = 8;
  if (handle === 'move') {
    return {
      ...initial,
      x: clamp(initial.x + deltaX, 0, 100 - initial.width),
      y: clamp(initial.y + deltaY, 0, 100 - initial.height),
    };
  }
  let left = initial.x;
  let top = initial.y;
  let right = initial.x + initial.width;
  let bottom = initial.y + initial.height;
  if (handle.includes('w')) {
    left = clamp(initial.x + deltaX, 0, right - minimum);
  }
  if (handle.includes('e')) {
    right = clamp(initial.x + initial.width + deltaX, left + minimum, 100);
  }
  if (handle.includes('n')) {
    top = clamp(initial.y + deltaY, 0, bottom - minimum);
  }
  if (handle.includes('s')) {
    bottom = clamp(initial.y + initial.height + deltaY, top + minimum, 100);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function requiredInput(root: ParentNode, selector: string): HTMLInputElement {
  const input = root.querySelector(selector);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`缺少界面元素：${selector}`);
  }
  return input;
}

function isCropArrowKey(value: string): value is CropArrowKey {
  return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(value);
}

function drawRotatedSource(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rotation: ImageRotation,
  rotatedWidth: number,
  rotatedHeight: number,
): void {
  if (rotation === 90) {
    context.translate(rotatedWidth, 0);
    context.rotate(Math.PI / 2);
  } else if (rotation === 180) {
    context.translate(rotatedWidth, rotatedHeight);
    context.rotate(Math.PI);
  } else if (rotation === 270) {
    context.translate(0, rotatedHeight);
    context.rotate(-Math.PI / 2);
  }
  context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight);
}

function clamp(value: number, minimum: number, maximum: number): number {
  const finite = Number.isFinite(value) ? value : minimum;
  return Math.min(maximum, Math.max(minimum, finite));
}
