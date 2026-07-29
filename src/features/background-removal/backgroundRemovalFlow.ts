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
  readonly disabled: boolean;
  readonly label: '一键去背景' | '去背景暂不可用' | '正在去背景…' | '恢复原图' | '使用去背景图';
  readonly compactLabel: '去背' | '不可用' | '处理中' | '恢复' | '使用去背图';
  readonly unavailableMessage: string | null;
}

export function resolveBackgroundRemovalActionState(
  input: BackgroundRemovalActionStateInput,
): BackgroundRemovalActionState {
  const { label, compactLabel } = !input.capabilityAvailable
    ? ({ label: '去背景暂不可用', compactLabel: '不可用' } as const)
    : input.busy
      ? ({ label: '正在去背景…', compactLabel: '处理中' } as const)
      : input.hasForeground
        ? input.activeVariant === 'foreground'
          ? ({ label: '恢复原图', compactLabel: '恢复' } as const)
          : ({ label: '使用去背景图', compactLabel: '使用去背图' } as const)
        : ({ label: '一键去背景', compactLabel: '去背' } as const);
  return Object.freeze({
    disabled: !input.capabilityAvailable || !input.hasSource || input.busy,
    label,
    compactLabel,
    unavailableMessage: input.capabilityAvailable ? null : '去背景服务暂不可用，请稍后重试。',
  });
}
