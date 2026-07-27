export interface PopoverRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface PopoverViewport {
  readonly width: number;
  readonly height: number;
  readonly margin: number;
  readonly left?: number;
  readonly top?: number;
}

export interface PopoverPosition {
  readonly left: number;
  readonly top: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly placement: 'top' | 'bottom';
}

export function positionPopover(
  anchor: PopoverRect,
  popover: Pick<PopoverRect, 'width' | 'height'>,
  viewport: PopoverViewport,
): PopoverPosition {
  const viewportLeft = viewport.left ?? 0;
  const viewportTop = viewport.top ?? 0;
  const safeLeft = viewportLeft + viewport.margin;
  const safeTop = viewportTop + viewport.margin;
  const safeRight = viewportLeft + viewport.width - viewport.margin;
  const safeBottom = viewportTop + viewport.height - viewport.margin;
  const maxWidth = Math.max(0, safeRight - safeLeft);
  const maxHeight = Math.max(0, safeBottom - safeTop);
  const width = Math.min(maxWidth, Math.max(anchor.width, popover.width));
  const height = Math.min(maxHeight, popover.height);
  const maxLeft = Math.max(safeLeft, safeRight - width);
  const left = clamp(anchor.left, safeLeft, maxLeft);
  const bottomTop = anchor.top + anchor.height + viewport.margin;
  const topTop = anchor.top - height - viewport.margin;
  const fitsBelow = bottomTop + height <= safeBottom;
  const fitsAbove = topTop >= safeTop;
  const spaceBelow = safeBottom - bottomTop;
  const spaceAbove = anchor.top - viewport.margin - safeTop;
  const below = fitsBelow || (!fitsAbove && spaceBelow >= spaceAbove);
  const unclampedTop = below
    ? anchor.top + anchor.height + viewport.margin
    : anchor.top - height - viewport.margin;
  const maxTop = Math.max(safeTop, safeBottom - height);

  return {
    left,
    top: clamp(unclampedTop, safeTop, maxTop),
    minWidth: Math.min(anchor.width, maxWidth),
    maxWidth,
    maxHeight,
    placement: below ? 'bottom' : 'top',
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
