import '@vaadin/button';
import '@vaadin/checkbox';
import '@vaadin/confirm-dialog';
import '@vaadin/dialog';
import '@vaadin/radio-group';
import '@vaadin/radio-group/vaadin-radio-button.js';
import '@vaadin/select';
import '@vaadin/text-field';

import type { Select, SelectItem } from '@vaadin/select';

export interface VaadinChoiceOption {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface VaadinSelectController {
  readonly close: () => void;
  readonly destroy: () => void;
  readonly selectedId: () => string;
  readonly setOptions: (options: readonly VaadinChoiceOption[]) => void;
  readonly setValue: (selectedId: string) => void;
}

export interface CreateVaadinSelectControllerOptions {
  readonly element: Select;
  readonly options: readonly VaadinChoiceOption[];
  readonly selectedId: string;
  readonly onChange: (selectedId: string) => void;
}

export function createVaadinSelectController(
  options: CreateVaadinSelectControllerOptions,
): VaadinSelectController {
  const { element, onChange } = options;
  let choices = options.options;
  element.noVerticalOverlap = true;

  const handleChange = (): void => {
    const selectedId = element.value;
    if (choices.some((choice) => choice.id === selectedId && !choice.disabled)) {
      onChange(selectedId);
    }
  };

  element.addEventListener('change', handleChange);
  setOptions(options.options);
  setValue(options.selectedId);

  return Object.freeze({
    close() {
      element.opened = false;
    },
    destroy() {
      element.removeEventListener('change', handleChange);
    },
    selectedId: () => element.value,
    setOptions,
    setValue,
  });

  function setOptions(nextChoices: readonly VaadinChoiceOption[]): void {
    choices = Object.freeze([...nextChoices]);
    element.items = choices.map(
      ({ id, label, disabled }): SelectItem => ({
        value: id,
        label,
        ...(disabled === undefined ? {} : { disabled }),
      }),
    );
    setValue(element.value);
  }

  function setValue(selectedId: string): void {
    const nextValue =
      choices.find((choice) => choice.id === selectedId && !choice.disabled)?.id ??
      choices.find((choice) => !choice.disabled)?.id ??
      '';
    if (element.value !== nextValue) {
      element.value = nextValue;
    }
  }
}

export function requiredVaadinElement<TagName extends keyof HTMLElementTagNameMap>(
  root: ParentNode,
  selector: string,
  tagName: TagName,
): HTMLElementTagNameMap[TagName] {
  const element = root.querySelector(selector);
  if (!element || element.localName !== tagName) {
    throw new Error(`缺少界面元素：${selector}`);
  }
  return element as HTMLElementTagNameMap[TagName];
}
