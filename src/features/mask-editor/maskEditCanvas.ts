export interface HighlightColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha: number;
}

// 与 color.action.primary (#E77B35) 一致；只出现在图片工作表面。
export const MASK_HIGHLIGHT_COLOR: HighlightColor = Object.freeze({
  r: 231,
  g: 123,
  b: 53,
  alpha: 130,
});

export interface HighlightPreset {
  readonly id: string;
  readonly label: string;
  readonly hex: string;
}

export const HIGHLIGHT_PRESETS: readonly HighlightPreset[] = Object.freeze([
  Object.freeze({ id: 'theme', label: '主题橙', hex: '#E77B35' }),
  Object.freeze({ id: 'red', label: '醒目红', hex: '#D92D20' }),
  Object.freeze({ id: 'magenta', label: '品红', hex: '#C11574' }),
  Object.freeze({ id: 'blue', label: '明蓝', hex: '#1570EF' }),
  Object.freeze({ id: 'green', label: '翠绿', hex: '#12B76A' }),
]);

export const HIGHLIGHT_FILL_ALPHA = 130;
export const HIGHLIGHT_OUTLINE_ALPHA = 235;

/** 把 #RRGGBB 解析为高亮填充色；非法输入回退到主题色。 */
export function highlightColorFromHex(
  hex: string,
  alpha: number = HIGHLIGHT_FILL_ALPHA,
): HighlightColor {
  const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu.exec(hex.trim());
  if (!match) {
    return { ...MASK_HIGHLIGHT_COLOR, alpha };
  }
  return {
    r: parseInt(match[1] ?? 'e7', 16),
    g: parseInt(match[2] ?? '7b', 16),
    b: parseInt(match[3] ?? '35', 16),
    alpha,
  };
}

export function highlightColorToHex(color: HighlightColor): string {
  const channel = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

export function highlightColorToCssRgba(color: HighlightColor): string {
  return `rgba(${String(color.r)}, ${String(color.g)}, ${String(color.b)}, ${String(
    Math.round((color.alpha / 255) * 1000) / 1000,
  )})`;
}

/**
 * 把“将去除区域”的高亮写入目标 RGBA 缓冲：蒙版值 < 128 的像素填充半透
 * 高亮色；与保留区相邻的边界像素以更高不透明度描边，让选区轮廓清晰。
 * maskValues 与 target 必须对应同一张 width × height 位图。
 */
export function fillHighlightOverlay(
  maskValues: Uint8ClampedArray,
  target: Uint8ClampedArray,
  width: number,
  height: number,
  color: HighlightColor = MASK_HIGHLIGHT_COLOR,
): void {
  const outlineAlpha = Math.max(color.alpha, HIGHLIGHT_OUTLINE_ALPHA);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const maskValue = maskValues[index] ?? 0;
    if (maskValue >= 128) {
      target[offset] = 0;
      target[offset + 1] = 0;
      target[offset + 2] = 0;
      target[offset + 3] = 0;
      continue;
    }
    target[offset] = color.r;
    target[offset + 1] = color.g;
    target[offset + 2] = color.b;
    target[offset + 3] = isBoundaryPixel(maskValues, width, height, index)
      ? outlineAlpha
      : color.alpha;
  }
}

function isBoundaryPixel(
  maskValues: Uint8ClampedArray,
  width: number,
  height: number,
  index: number,
): boolean {
  const x = index % width;
  const y = Math.floor(index / width);
  const left = x > 0 ? (maskValues[index - 1] ?? 0) : 0;
  const right = x < width - 1 ? (maskValues[index + 1] ?? 0) : 0;
  const up = y > 0 ? (maskValues[index - width] ?? 0) : 0;
  const down = y < height - 1 ? (maskValues[index + width] ?? 0) : 0;
  return left >= 128 || right >= 128 || up >= 128 || down >= 128;
}

/** 从灰度蒙版位图（RGBA 形式，r=g=b=蒙版值）构建高亮覆盖层。 */
export function buildHighlightOverlay(
  maskBitmap: ImageData,
  color: HighlightColor = MASK_HIGHLIGHT_COLOR,
): ImageData {
  const overlay = new ImageData(maskBitmap.width, maskBitmap.height);
  fillHighlightOverlay(
    extractMaskValues(maskBitmap),
    overlay.data,
    maskBitmap.width,
    maskBitmap.height,
    color,
  );
  return overlay;
}

/** 从灰度蒙版位图提取单通道蒙版值数组（取 r 通道）。 */
export function extractMaskValues(maskBitmap: ImageData): Uint8ClampedArray {
  const { width, height, data } = maskBitmap;
  const values = new Uint8ClampedArray(width * height);
  for (let index = 0; index < width * height; index += 1) {
    values[index] = data[index * 4] ?? 0;
  }
  return values;
}
