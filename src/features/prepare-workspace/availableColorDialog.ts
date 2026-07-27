import type { Button } from '@vaadin/button';
import type { Dialog } from '@vaadin/dialog';
import type { Select } from '@vaadin/select';
import type { TextField } from '@vaadin/text-field';

import { requiredVaadinElement } from '../vaadin-controls/vaadinControls';

export interface AvailableColorDialogController {
  readonly content: HTMLElement;
  readonly search: TextField;
  readonly series: Select;
  readonly grid: HTMLElement;
  readonly status: HTMLElement;
  readonly selectAll: Button;
  readonly clearAll: Button;
  readonly open: () => void;
  readonly close: () => void;
  readonly destroy: () => void;
}

export interface CreateAvailableColorDialogOptions {
  readonly dialog: Dialog;
  readonly template: HTMLTemplateElement;
  readonly trigger: Button;
}

export function createAvailableColorDialog(
  options: CreateAvailableColorDialogOptions,
): AvailableColorDialogController {
  const { dialog, template, trigger } = options;
  const fragment = template.content.cloneNode(true);
  if (!(fragment instanceof DocumentFragment)) {
    throw new Error('可用颜色面板初始化失败。');
  }
  const content = fragment.querySelector<HTMLElement>('[data-available-color-filter]');
  if (!content) {
    throw new Error('缺少界面元素：[data-available-color-filter]');
  }
  const search = requiredVaadinElement(
    content,
    '[data-available-color-search]',
    'vaadin-text-field',
  );
  const series = requiredVaadinElement(
    content,
    '[data-available-color-series]',
    'vaadin-select',
  );
  const selectAll = requiredVaadinElement(
    content,
    '[data-select-all-colors]',
    'vaadin-button',
  );
  const clearAll = requiredVaadinElement(
    content,
    '[data-clear-all-colors]',
    'vaadin-button',
  );
  const closeButton = requiredVaadinElement(
    content,
    '[data-close-available-colors]',
    'vaadin-button',
  );
  const grid = requiredElement(content, '[data-available-color-grid]');
  const status = requiredElement(content, '[data-available-color-filter-status]');

  dialog.headerTitle = '选择手边有的颜色';
  dialog.renderer = (root) => {
    if (!root.contains(content)) {
      root.append(content);
    }
  };

  trigger.addEventListener('click', open);
  closeButton.addEventListener('click', close);

  return Object.freeze({
    content,
    search,
    series,
    grid,
    status,
    selectAll,
    clearAll,
    open,
    close,
    destroy() {
      trigger.removeEventListener('click', open);
      closeButton.removeEventListener('click', close);
      dialog.opened = false;
      dialog.renderer = null;
    },
  });

  function open(): void {
    dialog.opened = true;
  }

  function close(): void {
    dialog.opened = false;
  }
}

function requiredElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`缺少界面元素：${selector}`);
  }
  return element;
}
