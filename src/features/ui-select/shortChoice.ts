import type { UiSelectOption } from './state';

export interface ShortChoiceController {
  readonly selectedId: () => string | undefined;
  readonly setOptions: (options: readonly UiSelectOption[]) => void;
  readonly setValue: (selectedId: string) => void;
  readonly destroy: () => void;
}

export interface CreateShortChoiceControllerOptions {
  readonly root: HTMLFieldSetElement;
  readonly options: readonly UiSelectOption[];
  readonly selectedId: string;
  readonly onChange?: (selectedId: string) => void;
}

export function createShortChoiceController({
  root,
  options: initialOptions,
  selectedId: initialSelectedId,
  onChange,
}: CreateShortChoiceControllerOptions): ShortChoiceController {
  let options = [...initialOptions];
  let selectedId = resolveEnabledId(options, initialSelectedId);
  let destroyed = false;

  root.addEventListener('change', onInputChange);
  sync();

  return Object.freeze({
    selectedId: () => selectedId,
    setOptions(nextOptions: readonly UiSelectOption[]) {
      if (destroyed) return;
      options = [...nextOptions];
      selectedId = resolveEnabledId(options, selectedId ?? '');
      sync();
    },
    setValue(nextSelectedId: string) {
      if (destroyed) return;
      selectedId = resolveEnabledId(options, nextSelectedId);
      sync();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      root.removeEventListener('change', onInputChange);
    },
  });

  function onInputChange(event: Event): void {
    const InputConstructor = root.ownerDocument.defaultView?.HTMLInputElement;
    const target = event.target;
    if (
      destroyed ||
      InputConstructor === undefined ||
      !(target instanceof InputConstructor) ||
      !target.matches('[data-short-choice-option]') ||
      !target.checked ||
      target.disabled
    ) {
      return;
    }
    const nextSelectedId = target.value;
    if (!options.some((option) => option.id === nextSelectedId && !option.disabled)) return;
    const previousSelectedId = selectedId;
    selectedId = nextSelectedId;
    sync();
    if (selectedId !== previousSelectedId) onChange?.(selectedId);
  }

  function sync(): void {
    if (selectedId === undefined) {
      root.removeAttribute('data-value');
    } else {
      root.dataset.value = selectedId;
    }
    const optionById = new Map(options.map((option) => [option.id, option]));
    for (const input of root.querySelectorAll<HTMLInputElement>('[data-short-choice-option]')) {
      const option = optionById.get(input.value);
      input.disabled = option === undefined || option.disabled === true;
      input.checked = option !== undefined && option.id === selectedId;
      const label = input.closest('label');
      if (label) {
        label.dataset.disabled = String(input.disabled);
        label.setAttribute('aria-disabled', String(input.disabled));
      }
    }
  }
}

function resolveEnabledId(
  options: readonly UiSelectOption[],
  selectedId: string,
): string | undefined {
  return (
    options.find((option) => option.id === selectedId && !option.disabled)?.id ??
    options.find((option) => !option.disabled)?.id
  );
}
