import '@vaadin/button';
import '@vaadin/checkbox';
import '@vaadin/confirm-dialog';
import '@vaadin/dialog';
import '@vaadin/radio-group';
import '@vaadin/radio-group/vaadin-radio-button.js';
import '@vaadin/select';
import '@vaadin/text-field';

import type { RadioButton } from '@vaadin/radio-group/vaadin-radio-button.js';
import type { RadioGroup } from '@vaadin/radio-group';
import type { RadioGroupValueChangedEvent } from '@vaadin/radio-group/src/vaadin-radio-group-mixin.js';
import type { Select, SelectItem } from '@vaadin/select';

export interface VaadinChoiceOption {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export type VaadinRadioGroupValueChangedListener = (
  value: string,
  event: RadioGroupValueChangedEvent,
) => void;

export interface VaadinRadioGroupController {
  readonly destroy: () => void;
  readonly selectedValue: () => string;
  readonly setValue: (value: string) => string;
  readonly subscribe: (listener: VaadinRadioGroupValueChangedListener) => () => void;
}

export interface CreateVaadinRadioGroupControllerOptions {
  readonly element: RadioGroup;
  readonly initialValue?: string;
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

interface UpdateCompleteElement {
  readonly updateComplete: Promise<unknown>;
}

export async function createVaadinRadioGroupController(
  options: CreateVaadinRadioGroupControllerOptions,
): Promise<VaadinRadioGroupController> {
  const { element } = options;
  const radioButtons = await readyRadioButtons(element);
  const subscriptions = new Map<
    VaadinRadioGroupValueChangedListener,
    (event: RadioGroupValueChangedEvent) => void
  >();
  let destroyed = false;

  const controller: VaadinRadioGroupController = Object.freeze({
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const subscription of subscriptions.values()) {
        element.removeEventListener('value-changed', subscription);
      }
      subscriptions.clear();
    },
    selectedValue: () => element.value ?? '',
    setValue,
    subscribe(listener: VaadinRadioGroupValueChangedListener) {
      if (destroyed) {
        return () => {};
      }
      const subscription = (event: RadioGroupValueChangedEvent): void => {
        const value = event.detail.value;
        if (value !== '' && !directEnabledButton(radioButtons, value)) {
          return;
        }
        listener(value, event);
      };
      subscriptions.set(listener, subscription);
      element.addEventListener('value-changed', subscription);
      return () => {
        const current = subscriptions.get(listener);
        if (!current) return;
        element.removeEventListener('value-changed', current);
        subscriptions.delete(listener);
      };
    },
  });

  if (options.initialValue !== undefined) {
    setValue(options.initialValue);
  } else {
    confirmCheckedRadioButton(element, radioButtons, element.value ?? '');
  }

  return controller;

  function setValue(requestedValue: string): string {
    if (destroyed) {
      return element.value ?? '';
    }
    if (requestedValue === '') {
      if (element.value !== '') {
        element.value = '';
      }
      confirmCheckedRadioButton(element, radioButtons, '');
      return '';
    }

    const requestedButton = directEnabledButton(radioButtons, requestedValue);
    const currentButton = directEnabledButton(radioButtons, element.value ?? '');
    const checkedButton = radioButtons.find((button) => button.checked && !button.disabled);
    const target =
      requestedButton ?? currentButton ?? checkedButton ?? firstEnabledButton(radioButtons);
    if (!target) {
      if (element.value !== '') {
        element.value = '';
      }
      confirmCheckedRadioButton(element, radioButtons, '');
      return '';
    }

    if (element.value !== target.value) {
      element.value = target.value;
    }
    if (!hasExactlyOneCheckedButton(radioButtons, target)) {
      element.value = '';
      element.value = target.value;
    }
    confirmCheckedRadioButton(element, radioButtons, target.value);
    return target.value;
  }
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
    element.items = choices.map(({ id, label, disabled }): SelectItem => ({
      value: id,
      label,
      ...(disabled === undefined ? {} : { disabled }),
    }));
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

async function readyRadioButtons(element: RadioGroup): Promise<readonly RadioButton[]> {
  await Promise.all([
    customElements.whenDefined('vaadin-radio-group'),
    customElements.whenDefined('vaadin-radio-button'),
  ]);
  await updateComplete(element);
  const radioButtons = directRadioButtons(element);
  await Promise.all(radioButtons.map(updateComplete));

  // Vaadin registers light-DOM children through a slot observer queued in a
  // microtask. Waiting through the next task lets that public child lifecycle
  // settle without reaching into the component's private shadow tree.
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    const ownerWindow = element.ownerDocument.defaultView;
    if (ownerWindow) {
      ownerWindow.setTimeout(resolve, 0);
    } else {
      setTimeout(resolve, 0);
    }
  });
  await updateComplete(element);
  await Promise.all(radioButtons.map(updateComplete));

  if (radioButtons.some((button) => button.name === '')) {
    throw new Error('Vaadin 单选组的选项尚未完成注册。');
  }
  return Object.freeze(radioButtons);
}

function updateComplete(element: HTMLElement): Promise<unknown> {
  return (element as HTMLElement & UpdateCompleteElement).updateComplete;
}

function directRadioButtons(element: RadioGroup): RadioButton[] {
  return [...element.children].filter(
    (child): child is RadioButton => child.localName === 'vaadin-radio-button',
  );
}

function directEnabledButton(
  radioButtons: readonly RadioButton[],
  value: string,
): RadioButton | undefined {
  return radioButtons.find((button) => !button.disabled && button.value === value);
}

function firstEnabledButton(radioButtons: readonly RadioButton[]): RadioButton | undefined {
  return radioButtons.find((button) => !button.disabled);
}

function hasExactlyOneCheckedButton(
  radioButtons: readonly RadioButton[],
  expected: RadioButton,
): boolean {
  const checked = radioButtons.filter((button) => button.checked);
  return checked.length === 1 && checked[0] === expected && !expected.disabled;
}

function confirmCheckedRadioButton(
  element: RadioGroup,
  radioButtons: readonly RadioButton[],
  value: string,
): void {
  const checked = radioButtons.filter((button) => button.checked);
  if (value === '') {
    if (checked.length !== 0) {
      throw new Error('Vaadin 单选组清空后仍有选项被选中。');
    }
    return;
  }
  const expected = directEnabledButton(radioButtons, value);
  if (!expected || checked.length !== 1 || checked[0] !== expected) {
    throw new Error(`Vaadin 单选组未能唯一选中值“${value}”。`);
  }
  if (element.value !== value) {
    throw new Error(`Vaadin 单选组值未同步为“${value}”。`);
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
