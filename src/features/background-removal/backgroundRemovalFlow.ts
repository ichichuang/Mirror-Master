import type { SelectedImage, SourceImageSession, SourceImageVariant } from './sourceImageSession';

export interface BackgroundRemovalConfirmation {
  readonly title: string;
  readonly description: string;
  readonly onContinue: () => void;
}

export interface BackgroundRemovalChangeGuardOptions {
  readonly hasEditedCells: boolean;
  readonly openConfirmation: (request: BackgroundRemovalConfirmation) => void;
  readonly apply: () => void;
}

export function guardBackgroundRemovalChange(options: BackgroundRemovalChangeGuardOptions): void {
  if (!options.hasEditedCells) {
    options.apply();
    return;
  }
  options.openConfirmation({
    title: '一键去背景会替换当前编辑',
    description:
      '重新生成预览会替换当前逐格修改和撤销记录。你可以先保存项目，或恢复原图后继续调整。',
    onContinue: options.apply,
  });
}

export interface ActivateBackgroundRemovalVariantOptions {
  readonly session: SourceImageSession;
  readonly variant: SourceImageVariant;
  readonly onActiveImage: (image: SelectedImage, variant: SourceImageVariant) => void;
  readonly regenerate: () => void;
}

export function activateBackgroundRemovalVariant(
  options: ActivateBackgroundRemovalVariantOptions,
): SelectedImage {
  const image = options.session.activate(options.variant);
  options.onActiveImage(image, options.variant);
  options.regenerate();
  return image;
}

export interface BackgroundRemovalActionStateInput {
  readonly capabilityAvailable: boolean;
  readonly hasSource: boolean;
  readonly hasForeground: boolean;
  readonly activeVariant: SourceImageVariant;
  readonly busy: boolean;
}

export interface BackgroundRemovalActionState {
  readonly hidden: boolean;
  readonly disabled: boolean;
  readonly label: '一键去背景' | '正在去背景…' | '恢复原图' | '使用去背景图';
}

export function resolveBackgroundRemovalActionState(
  input: BackgroundRemovalActionStateInput,
): BackgroundRemovalActionState {
  const label = input.busy
    ? '正在去背景…'
    : input.hasForeground
      ? input.activeVariant === 'foreground'
        ? '恢复原图'
        : '使用去背景图'
      : '一键去背景';
  return Object.freeze({
    hidden: !input.capabilityAvailable,
    disabled: !input.capabilityAvailable || !input.hasSource || input.busy,
    label,
  });
}
