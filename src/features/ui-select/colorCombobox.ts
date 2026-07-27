import { optionDomId, type UiSelectOption } from './state';

export interface ColorComboboxOption extends UiSelectOption {
  readonly meta?: string;
}

export interface ColorComboboxController {
  readonly input: HTMLInputElement;
  readonly listbox: HTMLDivElement;
  readonly status: HTMLParagraphElement;
  selectedId(): string | undefined;
  setValue(selectedId: string): void;
  setOptions(options: readonly ColorComboboxOption[]): void;
  destroy(): void;
}

export interface CreateColorComboboxOptions {
  readonly host: HTMLElement;
  readonly id: string;
  readonly options: readonly ColorComboboxOption[];
  readonly selectedId?: string;
  readonly onChange?: (id: string) => void;
}

export function createColorCombobox({
  host,
  id,
  options: initialOptions,
  selectedId: initialSelectedId,
  onChange,
}: CreateColorComboboxOptions): ColorComboboxController {
  const document = host.ownerDocument;
  const window = document.defaultView;
  const input = document.createElement('input');
  const listbox = document.createElement('div');
  const status = document.createElement('p');
  const optionElements = new Map<string, HTMLButtonElement>();
  let options = [...initialOptions];
  let selectedId = resolveEnabledId(options, initialSelectedId ?? '');
  let activeId = selectedId;
  let composing = false;
  let destroyed = false;

  input.type = 'search';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-label', '搜索颜色');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-controls', `${id}-listbox`);
  input.setAttribute('aria-describedby', `${id}-status`);
  listbox.id = `${id}-listbox`;
  listbox.className = 'color-combobox-listbox';
  listbox.setAttribute('role', 'listbox');
  listbox.setAttribute('aria-label', '颜色结果');
  status.id = `${id}-status`;
  status.className = 'color-combobox-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  host.classList.add('color-combobox');
  input.addEventListener('input', filter);
  input.addEventListener('compositionstart', onCompositionStart);
  input.addEventListener('compositionend', onCompositionEnd);
  input.addEventListener('keydown', onKeydown);
  syncOptionElements();
  updatePresentation();
  host.append(input, listbox, status);

  return {
    input,
    listbox,
    status,
    selectedId() {
      return selectedId;
    },
    setValue,
    setOptions,
    destroy,
  };

  function onCompositionStart(): void {
    composing = true;
  }

  function onCompositionEnd(): void {
    composing = false;
    filter();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (
      (composing || event.isComposing) &&
      ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)
    ) {
      return;
    }
    if (event.key === 'ArrowDown') moveActive(1);
    else if (event.key === 'ArrowUp') moveActive(-1);
    else if (event.key === 'Home') moveToBoundary('home');
    else if (event.key === 'End') moveToBoundary('end');
    else if (event.key === 'Enter' && !composing) selectActive();
    else return;
    event.preventDefault();
  }

  function filter(): void {
    const enabled = enabledVisibleOptions();
    if (!enabled.some((option) => option.id === activeId)) {
      activeId = enabled.find((option) => option.id === selectedId)?.id ?? enabled[0]?.id;
    }
    syncVisibleOptionElements();
    updatePresentation();
  }

  function moveActive(offset: number): void {
    const enabled = enabledVisibleOptions();
    if (enabled.length === 0) return;
    const currentIndex = enabled.findIndex((option) => option.id === activeId);
    const startIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = (startIndex + offset + enabled.length) % enabled.length;
    activeId = enabled[nextIndex]?.id;
    updatePresentation();
    activeElement()?.scrollIntoView({ block: 'nearest' });
  }

  function moveToBoundary(boundary: 'home' | 'end'): void {
    const enabled = enabledVisibleOptions();
    activeId = boundary === 'home' ? enabled[0]?.id : enabled.at(-1)?.id;
    updatePresentation();
    activeElement()?.scrollIntoView({ block: 'nearest' });
  }

  function selectActive(): void {
    if (
      activeId !== undefined &&
      enabledVisibleOptions().some((option) => option.id === activeId)
    ) {
      select(activeId);
    }
  }

  function onOptionClick(event: Event): void {
    const ButtonConstructor = window?.HTMLButtonElement;
    const element = event.currentTarget;
    if (ButtonConstructor === undefined || !(element instanceof ButtonConstructor)) return;
    const optionId = element.dataset.colorOption;
    if (optionId !== undefined) select(optionId);
  }

  function select(idToSelect: string): void {
    const option = options.find((candidate) => candidate.id === idToSelect && !candidate.disabled);
    if (option === undefined) return;
    const previousSelectedId = selectedId;
    selectedId = option.id;
    activeId = option.id;
    updatePresentation();
    if (selectedId !== previousSelectedId) onChange?.(selectedId);
  }

  function setValue(nextSelectedId: string): void {
    if (destroyed) return;
    selectedId = resolveEnabledId(options, nextSelectedId);
    const visible = enabledVisibleOptions();
    activeId = visible.find((option) => option.id === selectedId)?.id ?? visible[0]?.id;
    updatePresentation();
  }

  function setOptions(nextOptions: readonly ColorComboboxOption[]): void {
    if (destroyed) return;
    const previousActiveId = activeId;
    options = [...nextOptions];
    selectedId = resolveEnabledId(options, selectedId ?? '');
    activeId = options.some((option) => option.id === previousActiveId && !option.disabled)
      ? previousActiveId
      : selectedId;
    syncOptionElements();
    filter();
  }

  function syncOptionElements(): void {
    const currentIds = new Set(options.map((option) => option.id));
    for (const [optionId, element] of optionElements) {
      if (currentIds.has(optionId)) continue;
      element.removeEventListener('click', onOptionClick);
      element.remove();
      optionElements.delete(optionId);
    }
    for (const option of options) {
      let element = optionElements.get(option.id);
      if (element === undefined) {
        element = document.createElement('button');
        element.type = 'button';
        element.className = 'color-combobox-option';
        element.dataset.colorOption = option.id;
        element.setAttribute('role', 'option');
        element.tabIndex = -1;
        element.addEventListener('click', onOptionClick);
        optionElements.set(option.id, element);
      }
      element.id = optionDomId(id, option.id);
      element.setAttribute('aria-disabled', String(option.disabled === true));
      element.disabled = option.disabled === true;
      element.textContent =
        option.meta === undefined ? option.label : `${option.meta} ${option.label}`;
    }
    syncVisibleOptionElements();
  }

  function syncVisibleOptionElements(): void {
    listbox.replaceChildren(
      ...visibleOptions().flatMap((option) => {
        const element = optionElements.get(option.id);
        return element === undefined ? [] : [element];
      }),
    );
  }

  function updatePresentation(): void {
    const active = options.find((option) => option.id === activeId && !option.disabled);
    const visible = visibleOptions();
    if (active === undefined || !visible.some((option) => option.id === active.id)) {
      input.removeAttribute('aria-activedescendant');
    } else {
      input.setAttribute('aria-activedescendant', optionDomId(id, active.id));
    }
    status.textContent =
      visible.length === 0 ? '没有符合条件的颜色' : `找到 ${String(visible.length)} 种颜色`;
    for (const option of options) {
      const element = optionElements.get(option.id);
      if (element === undefined) continue;
      element.dataset.active = String(active?.id === option.id);
      element.setAttribute('aria-selected', String(selectedId === option.id));
    }
  }

  function visibleOptions(): readonly ColorComboboxOption[] {
    const query = input.value.trim().toLocaleLowerCase();
    return options.filter((option) =>
      `${option.id} ${option.label} ${option.meta ?? ''}`.toLocaleLowerCase().includes(query),
    );
  }

  function enabledVisibleOptions(): readonly ColorComboboxOption[] {
    return visibleOptions().filter((option) => !option.disabled);
  }

  function activeElement(): HTMLButtonElement | undefined {
    return activeId === undefined ? undefined : optionElements.get(activeId);
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    input.removeEventListener('input', filter);
    input.removeEventListener('compositionstart', onCompositionStart);
    input.removeEventListener('compositionend', onCompositionEnd);
    input.removeEventListener('keydown', onKeydown);
    for (const element of optionElements.values()) {
      element.removeEventListener('click', onOptionClick);
    }
    optionElements.clear();
    input.remove();
    listbox.remove();
    status.remove();
    host.classList.remove('color-combobox');
  }
}

function resolveEnabledId(
  options: readonly ColorComboboxOption[],
  selectedId: string,
): string | undefined {
  return (
    options.find((option) => option.id === selectedId && !option.disabled)?.id ??
    options.find((option) => !option.disabled)?.id
  );
}
