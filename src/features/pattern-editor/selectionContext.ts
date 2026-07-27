import { normalizeSelection, type CellSelection } from './selection';

export interface ViewportRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface SafeAreaInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface SelectionContextDescription {
  readonly width: number;
  readonly height: number;
  readonly label: string;
}

export type SelectionContextPlacement = 'above' | 'below' | 'left' | 'right';

export interface SelectionContextPosition {
  readonly left: number;
  readonly top: number;
  readonly placement: SelectionContextPlacement;
}

export interface SelectionContextPositionInput {
  readonly viewport: ViewportRect;
  readonly selection: ViewportRect;
  readonly bar: ViewportSize;
  readonly safeArea: SafeAreaInsets;
  readonly occlusions: readonly ViewportRect[];
  readonly gap?: number;
}

export function describeSelection(selection: CellSelection): SelectionContextDescription {
  const normalized = normalizeSelection(selection);
  const width = normalized.endColumn - normalized.startColumn + 1;
  const height = normalized.endRow - normalized.startRow + 1;
  return Object.freeze({
    width,
    height,
    label: `已选 ${String(width)} × ${String(height)}`,
  });
}

export function positionSelectionContextBar(
  input: SelectionContextPositionInput,
): SelectionContextPosition {
  validateRect(input.viewport, '视口');
  validateRect(input.selection, '选区');
  validateSize(input.bar);
  validateInsets(input.safeArea);
  for (const occlusion of input.occlusions) {
    validateRect(occlusion, '遮挡区域');
  }
  const gap = input.gap ?? 8;
  if (!Number.isFinite(gap) || gap < 0) {
    throw new Error('选择操作栏间距无效。');
  }

  const minimumLeft = input.viewport.left + input.safeArea.left;
  const maximumLeft =
    input.viewport.left + input.viewport.width - input.safeArea.right - input.bar.width;
  const minimumTop = input.viewport.top + input.safeArea.top;
  const maximumTop =
    input.viewport.top + input.viewport.height - input.safeArea.bottom - input.bar.height;
  if (maximumLeft < minimumLeft || maximumTop < minimumTop) {
    throw new Error('选择操作栏无法放入当前可用视口。');
  }

  const centeredLeft = input.selection.left + (input.selection.width - input.bar.width) / 2;
  const centeredTop = input.selection.top + (input.selection.height - input.bar.height) / 2;
  const ideals: Record<SelectionContextPlacement, SelectionContextPosition> = {
    above: {
      left: centeredLeft,
      top: input.selection.top - input.bar.height - gap,
      placement: 'above',
    },
    below: {
      left: centeredLeft,
      top: input.selection.top + input.selection.height + gap,
      placement: 'below',
    },
    left: {
      left: input.selection.left - input.bar.width - gap,
      top: centeredTop,
      placement: 'left',
    },
    right: {
      left: input.selection.left + input.selection.width + gap,
      top: centeredTop,
      placement: 'right',
    },
  };
  const occupiedRects = [input.selection, ...input.occlusions];
  const leftValues = uniqueClampedValues(
    [
      minimumLeft,
      maximumLeft,
      ...Object.values(ideals).map((candidate) => candidate.left),
      ...occupiedRects.flatMap((occupied) => [
        occupied.left - input.bar.width,
        occupied.left - input.bar.width - gap,
        occupied.left + occupied.width,
        occupied.left + occupied.width + gap,
      ]),
    ],
    minimumLeft,
    maximumLeft,
  );
  const topValues = uniqueClampedValues(
    [
      minimumTop,
      maximumTop,
      ...Object.values(ideals).map((candidate) => candidate.top),
      ...occupiedRects.flatMap((occupied) => [
        occupied.top - input.bar.height,
        occupied.top - input.bar.height - gap,
        occupied.top + occupied.height,
        occupied.top + occupied.height + gap,
      ]),
    ],
    minimumTop,
    maximumTop,
  );
  const candidates: Array<
    SelectionContextPosition & {
      readonly rank: number;
      readonly gapViolations: number;
      readonly distance: number;
    }
  > = [];
  for (const left of leftValues) {
    for (const top of topValues) {
      const rect = { left, top, width: input.bar.width, height: input.bar.height };
      if (occupiedRects.some((occupied) => intersectionArea(rect, occupied) > 0)) {
        continue;
      }
      for (const placement of placementsForRect(rect, input.selection)) {
        const ideal = ideals[placement];
        candidates.push({
          left,
          top,
          placement,
          rank: placementRank(placement),
          gapViolations: occupiedRects.filter(
            (occupied) =>
              intersectionArea(
                {
                  left: rect.left - gap,
                  top: rect.top - gap,
                  width: rect.width + gap * 2,
                  height: rect.height + gap * 2,
                },
                occupied,
              ) > 0,
          ).length,
          distance: Math.abs(left - ideal.left) + Math.abs(top - ideal.top),
        });
      }
    }
  }
  candidates.sort(
    (left, right) =>
      left.rank - right.rank ||
      left.gapViolations - right.gapViolations ||
      left.distance - right.distance ||
      left.top - right.top ||
      left.left - right.left,
  );
  const best = candidates[0];
  if (!best) {
    throw new Error('无法在不遮挡选区或控制面的区域放置选择操作栏。');
  }
  return Object.freeze({
    left: best.left,
    top: best.top,
    placement: best.placement,
  });
}

function uniqueClampedValues(
  values: readonly number[],
  minimum: number,
  maximum: number,
): readonly number[] {
  return [...new Set(values.map((value) => clamp(value, minimum, maximum)))];
}

function placementsForRect(
  rect: ViewportRect,
  selection: ViewportRect,
): readonly SelectionContextPlacement[] {
  const placements: SelectionContextPlacement[] = [];
  if (rect.top + rect.height <= selection.top) {
    placements.push('above');
  }
  if (rect.top >= selection.top + selection.height) {
    placements.push('below');
  }
  if (rect.left + rect.width <= selection.left) {
    placements.push('left');
  }
  if (rect.left >= selection.left + selection.width) {
    placements.push('right');
  }
  return placements;
}

function placementRank(placement: SelectionContextPlacement): number {
  return ['above', 'below', 'left', 'right'].indexOf(placement);
}

function intersectionArea(left: ViewportRect, right: ViewportRect): number {
  const width = Math.max(
    0,
    Math.min(left.left + left.width, right.left + right.width) - Math.max(left.left, right.left),
  );
  const height = Math.max(
    0,
    Math.min(left.top + left.height, right.top + right.height) - Math.max(left.top, right.top),
  );
  return width * height;
}

function validateRect(rect: ViewportRect, label: string): void {
  if (
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width < 0 ||
    rect.height < 0
  ) {
    throw new Error(`${label}尺寸无效。`);
  }
}

function validateSize(size: ViewportSize): void {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new Error('选择操作栏尺寸无效。');
  }
}

function validateInsets(insets: SafeAreaInsets): void {
  if (
    !Number.isFinite(insets.top) ||
    !Number.isFinite(insets.right) ||
    !Number.isFinite(insets.bottom) ||
    !Number.isFinite(insets.left) ||
    insets.top < 0 ||
    insets.right < 0 ||
    insets.bottom < 0 ||
    insets.left < 0
  ) {
    throw new Error('安全区尺寸无效。');
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
