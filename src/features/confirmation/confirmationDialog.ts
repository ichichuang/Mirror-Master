import type { ConfirmDialog } from '@vaadin/confirm-dialog';

export interface ConfirmationDialogContent {
  readonly title: string;
  readonly description: string;
}

export interface ConfirmationDialogController {
  readonly open: (content: ConfirmationDialogContent) => void;
  readonly reopenWithError: (message: string) => void;
  readonly close: () => void;
  readonly destroy: () => void;
}

export interface CreateConfirmationDialogOptions {
  readonly dialog: ConfirmDialog;
  readonly onConfirm: () => void;
  readonly onReject: () => void;
  readonly onCancel: () => void;
}

export function createConfirmationDialog(
  options: CreateConfirmationDialogOptions,
): ConfirmationDialogController {
  const { dialog } = options;
  let content: ConfirmationDialogContent | null = null;

  dialog.confirmText = '先保存项目';
  dialog.confirmTheme = 'primary';
  dialog.rejectButtonVisible = true;
  dialog.rejectText = '放弃修改并继续';
  dialog.rejectTheme = 'error tertiary';
  dialog.cancelButtonVisible = true;
  dialog.cancelText = '取消';

  dialog.addEventListener('confirm', options.onConfirm);
  dialog.addEventListener('reject', options.onReject);
  dialog.addEventListener('cancel', options.onCancel);

  return Object.freeze({
    open(nextContent: ConfirmationDialogContent) {
      content = nextContent;
      applyContent(dialog, nextContent);
      dialog.opened = true;
    },
    reopenWithError(message: string) {
      if (!content) return;
      dialog.header = content.title;
      dialog.message = `${content.description}\n\n${message}`;
      dialog.opened = true;
    },
    close() {
      dialog.opened = false;
    },
    destroy() {
      dialog.removeEventListener('confirm', options.onConfirm);
      dialog.removeEventListener('reject', options.onReject);
      dialog.removeEventListener('cancel', options.onCancel);
      dialog.opened = false;
      content = null;
    },
  });
}

function applyContent(dialog: ConfirmDialog, content: ConfirmationDialogContent): void {
  dialog.header = content.title;
  dialog.message = content.description;
}
