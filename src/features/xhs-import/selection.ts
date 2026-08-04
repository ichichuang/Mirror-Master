export interface XhsSelectionState {
  readonly selectedCount: number;
  readonly allSelected: boolean;
  readonly canSaveSelected: boolean;
  readonly canUseAsPattern: boolean;
  readonly patternDisabledReason: string;
}

export function deriveXhsSelectionState(
  imageIds: readonly number[],
  selectedIds: ReadonlySet<number>,
): XhsSelectionState {
  const selectedCount = imageIds.filter((imageId) => selectedIds.has(imageId)).length;
  return Object.freeze({
    selectedCount,
    allSelected: imageIds.length > 0 && selectedCount === imageIds.length,
    canSaveSelected: selectedCount > 0,
    canUseAsPattern: selectedCount === 1,
    patternDisabledReason: selectedCount > 1 ? '只能选择 1 张图片' : '',
  });
}
