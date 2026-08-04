import type { SheetState } from '../mobile-sheet/sheetMath';

export interface PreviewSettingsIntroductionInput {
  readonly mobile: boolean;
  readonly sheetState: SheetState;
  readonly completionStatus: string;
}

export interface PreviewSettingsIntroductionResult {
  readonly expandToHalf: boolean;
  readonly announcement: string;
}

export interface PreviewSettingsIntroductionSession {
  readonly recordUserInteraction: () => void;
  readonly onPreviewSucceeded: (
    input: PreviewSettingsIntroductionInput,
  ) => PreviewSettingsIntroductionResult;
}

const SETTINGS_GUIDANCE = '设置已展开，可调整图案大小、颜色、效果和品牌。';

export function createPreviewSettingsIntroductionSession(): PreviewSettingsIntroductionSession {
  let completed = false;

  return Object.freeze({
    recordUserInteraction() {
      completed = true;
    },
    onPreviewSucceeded({ mobile, sheetState, completionStatus }: PreviewSettingsIntroductionInput) {
      if (!mobile || completed) {
        return unchangedResult(completionStatus);
      }
      completed = true;
      if (sheetState !== 'peek') {
        return unchangedResult(completionStatus);
      }
      return Object.freeze({
        expandToHalf: true,
        announcement: `${completionStatus}。${SETTINGS_GUIDANCE}`,
      });
    },
  });
}

function unchangedResult(completionStatus: string): PreviewSettingsIntroductionResult {
  return Object.freeze({ expandToHalf: false, announcement: completionStatus });
}
