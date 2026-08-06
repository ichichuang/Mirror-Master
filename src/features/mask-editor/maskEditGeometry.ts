export interface MaskFrameSize {
  readonly width: number;
  readonly height: number;
}

export interface MaskEditRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** 在可用区域内按图片宽高比居中适配，返回显示框 CSS 尺寸。 */
export function fitMaskFrame(
  slotWidth: number,
  slotHeight: number,
  imageWidth: number,
  imageHeight: number,
): MaskFrameSize {
  if (slotWidth <= 0 || slotHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(slotWidth / imageWidth, slotHeight / imageHeight);
  return {
    width: Math.max(1, Math.floor(imageWidth * scale)),
    height: Math.max(1, Math.floor(imageHeight * scale)),
  };
}

/** 把显示框内的客户端坐标换算为图片像素坐标（裁剪到图片范围）。 */
export function clientPointToImagePoint(
  clientX: number,
  clientY: number,
  frame: MaskEditRect,
  imageWidth: number,
  imageHeight: number,
): { readonly x: number; readonly y: number } | null {
  if (frame.width <= 0 || frame.height <= 0) {
    return null;
  }
  if (
    clientX < frame.left ||
    clientY < frame.top ||
    clientX > frame.left + frame.width ||
    clientY > frame.top + frame.height
  ) {
    return null;
  }
  const x = ((clientX - frame.left) / frame.width) * imageWidth;
  const y = ((clientY - frame.top) / frame.height) * imageHeight;
  return {
    x: Math.min(Math.max(x, 0), imageWidth),
    y: Math.min(Math.max(y, 0), imageHeight),
  };
}

/** 笔刷滑杆（1–100）映射为图片像素半径：短边的 0.4%–20%。 */
export function brushSizeToImageRadius(
  brushSize: number,
  imageWidth: number,
  imageHeight: number,
  maximumRadiusPx: number,
): number {
  const shortestEdge = Math.max(1, Math.min(imageWidth, imageHeight));
  const radius = (brushSize / 100) * shortestEdge * 0.2;
  return Math.min(Math.max(2, Math.round(radius)), Math.max(2, maximumRadiusPx));
}

/** 图片像素半径换算为屏幕显示半径。 */
export function imageRadiusToScreen(
  radiusPx: number,
  frame: MaskEditRect,
  imageWidth: number,
): number {
  if (imageWidth <= 0) return radiusPx;
  return (radiusPx / imageWidth) * frame.width;
}
