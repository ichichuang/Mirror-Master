import { optionDomId, type UiSelectMovement, type UiSelectOption } from './state';

export interface MobileSingleSelectSurfaceController {
  readonly element: HTMLElement;
  readonly focus: () => void;
  readonly selectedId: () => string | undefined;
  readonly setOptions: (options: readonly UiSelectOption[]) => void;
  readonly setValue: (selectedId: string) => void;
  readonly destroy: () => void;
}

export interface CreateMobileSingleSelectSurfaceOptions {
  readonly document: Document;
  readonly id: string;
  readonly title: string;
  readonly options: readonly UiSelectOption[];
  readonly selectedId: string;
  readonly searchThreshold?: number;
  readonly onSelect: (selectedId: string) => void;
  readonly onCancel: () => void;
}

export function createMobileSingleSelectSurface({
  document,
  id,
  title,
  options: initialOptions,
  selectedId: initialSelectedId,
  searchThreshold = 8,
  onSelect,
  onCancel,
}: CreateMobileSingleSelectSurfaceOptions): MobileSingleSelectSurfaceController {
  const window = document.defaultView;
  const root = document.createElement('section');
  const heading = document.createElement('header');
  const titleElement = document.createElement('h2');
  const backButton = document.createElement('button');
  const search = document.createElement('input');
  const listbox = document.createElement('div');
  const status = document.createElement('p');
  const optionElements = new Map<string, HTMLButtonElement>();
  let options = [...initialOptions];
  let selectedId = resolveEnabledId(options, initialSelectedId);
  let activeId = selectedId;
  let composing = false;
  let destroyed = false;

  root.className = 'mobile-single-select';
  root.dataset.mobileSingleSelect = '';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-labelledby', `${id}-title`);
  heading.className = 'mobile-selection-heading';
  titleElement.id = `${id}-title`;
  titleElement.textContent = title;
  backButton.type = 'button';
  backButton.className = 'text-button mobile-selection-back';
  backButton.textContent = '返回';
  search.type = 'search';
  search.className = 'mobile-selection-search';
  search.dataset.mobileSelectionSearch = '';
  search.autocomplete = 'off';
  search.placeholder = `搜索${title}`;
  search.setAttribute('role', 'combobox');
  search.setAttribute('aria-label', `搜索${title}`);
  search.setAttribute('aria-autocomplete', 'list');
  search.setAttribute('aria-expanded', 'true');
  search.setAttribute('aria-controls', `${id}-listbox`);
  search.setAttribute('aria-describedby', `${id}-status`);
  listbox.id = `${id}-listbox`;
  listbox.className = 'mobile-selection-listbox';
  listbox.setAttribute('role', 'listbox');
  listbox.setAttribute('aria-label', `${title}选项`);
  status.id = `${id}-status`;
  status.className = 'visually-hidden';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  heading.append(titleElement, backButton);
  root.append(heading, search, listbox, status);

  backButton.addEventListener('click', onCancel);
  search.addEventListener('input', onSearchInput);
  search.addEventListener('keydown', onSearchKeydown);
  search.addEventListener('compositionstart', onCompositionStart);
  search.addEventListener('compositionend', onCompositionEnd);
  root.addEventListener('keydown', onRootKeydown);
  sync();

  return Object.freeze({
    element: root,
    focus() {
      if (destroyed) return;
      if (!search.hidden) search.focus({ preventScroll: true });
      else activeOptionElement()?.focus({ preventScroll: true });
    },
    selectedId: () => selectedId,
    setOptions(nextOptions: readonly UiSelectOption[]) {
      if (destroyed) return;
      const previousActiveId = activeId;
      options = [...nextOptions];
      selectedId = resolveEnabledId(options, selectedId ?? '');
      activeId = options.some((option) => option.id === previousActiveId && !option.disabled)
        ? previousActiveId
        : selectedId;
      sync();
    },
    setValue(nextSelectedId: string) {
      if (destroyed) return;
      selectedId = resolveEnabledId(options, nextSelectedId);
      activeId = selectedId;
      sync();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      backButton.removeEventListener('click', onCancel);
      search.removeEventListener('input', onSearchInput);
      search.removeEventListener('keydown', onSearchKeydown);
      search.removeEventListener('compositionstart', onCompositionStart);
      search.removeEventListener('compositionend', onCompositionEnd);
      root.removeEventListener('keydown', onRootKeydown);
      for (const element of optionElements.values()) {
        element.removeEventListener('click', onOptionClick);
        element.removeEventListener('keydown', onOptionKeydown);
      }
      optionElements.clear();
      root.remove();
    },
  });

  function onCompositionStart(): void {
    composing = true;
  }

  function onCompositionEnd(): void {
    composing = false;
    sync();
  }

  function onSearchInput(): void {
    if (!composing) sync();
  }

  function onSearchKeydown(event: KeyboardEvent): void {
    if (composing || event.isComposing) return;
    if (event.key === 'ArrowDown') moveActive('next', false);
    else if (event.key === 'ArrowUp') moveActive('previous', false);
    else if (event.key === 'Home') moveActive('home', false);
    else if (event.key === 'End') moveActive('end', false);
    else if (event.key === 'Enter') commitActive();
    else return;
    event.preventDefault();
  }

  function onOptionKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') moveActive('next', true);
    else if (event.key === 'ArrowUp') moveActive('previous', true);
    else if (event.key === 'Home') moveActive('home', true);
    else if (event.key === 'End') moveActive('end', true);
    else if (event.key === 'Enter' || event.key === ' ') commitActive();
    else return;
    event.preventDefault();
  }

  function onRootKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...root.querySelectorAll<HTMLElement>('input:not([hidden]), button:not([disabled])'),
    ].filter((element) => !element.hidden);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onOptionClick(event: Event): void {
    const ButtonConstructor = window?.HTMLButtonElement;
    const target = event.currentTarget;
    if (ButtonConstructor === undefined || !(target instanceof ButtonConstructor)) return;
    const optionId = target.dataset.mobileSelectionOption;
    if (optionId === undefined) return;
    activeId = optionId;
    commitActive();
  }

  function moveActive(movement: UiSelectMovement, focusOption: boolean): void {
    const visible = visibleEnabledOptions();
    if (visible.length === 0) return;
    const currentIndex = Math.max(
      0,
      visible.findIndex((option) => option.id === activeId),
    );
    const nextIndex =
      movement === 'home'
        ? 0
        : movement === 'end'
          ? visible.length - 1
          : movement === 'next'
            ? (currentIndex + 1) % visible.length
            : (currentIndex - 1 + visible.length) % visible.length;
    activeId = visible[nextIndex]?.id;
    updatePresentation();
    const activeElement = activeOptionElement();
    activeElement?.scrollIntoView({ block: 'nearest' });
    if (focusOption) activeElement?.focus({ preventScroll: true });
  }

  function commitActive(): void {
    const option = visibleEnabledOptions().find((candidate) => candidate.id === activeId);
    if (option === undefined) return;
    selectedId = option.id;
    updatePresentation();
    onSelect(option.id);
  }

  function sync(): void {
    search.hidden = options.length < searchThreshold;
    if (search.hidden && search.value !== '') search.value = '';
    const visible = visibleOptions();
    if (!visible.some((option) => option.id === activeId && !option.disabled)) {
      activeId =
        visible.find((option) => option.id === selectedId && !option.disabled)?.id ??
        visible.find((option) => !option.disabled)?.id;
    }
    const currentIds = new Set(options.map((option) => option.id));
    for (const [optionId, element] of optionElements) {
      if (currentIds.has(optionId)) continue;
      element.removeEventListener('click', onOptionClick);
      element.removeEventListener('keydown', onOptionKeydown);
      element.remove();
      optionElements.delete(optionId);
    }
    for (const option of options) {
      let element = optionElements.get(option.id);
      if (element === undefined) {
        element = document.createElement('button');
        element.type = 'button';
        element.className = 'mobile-selection-option';
        element.dataset.mobileSelectionOption = option.id;
        element.setAttribute('role', 'option');
        element.addEventListener('click', onOptionClick);
        element.addEventListener('keydown', onOptionKeydown);
        optionElements.set(option.id, element);
      }
      element.id = optionDomId(id, option.id);
      element.textContent = option.label;
      element.disabled = option.disabled === true;
      element.setAttribute('aria-disabled', String(option.disabled === true));
    }
    listbox.replaceChildren(
      ...visible.flatMap((option) => {
        const element = optionElements.get(option.id);
        return element === undefined ? [] : [element];
      }),
    );
    status.textContent =
      visible.length === 0 ? '没有符合条件的选项' : `显示 ${String(visible.length)} 个选项`;
    updatePresentation();
  }

  function updatePresentation(): void {
    const active = options.find((option) => option.id === activeId && !option.disabled);
    if (!search.hidden && active !== undefined) {
      search.setAttribute('aria-activedescendant', optionDomId(id, active.id));
    } else {
      search.removeAttribute('aria-activedescendant');
    }
    for (const option of options) {
      const element = optionElements.get(option.id);
      if (element === undefined) continue;
      element.setAttribute('aria-selected', String(option.id === selectedId));
      element.dataset.active = String(option.id === active?.id);
      element.tabIndex = option.id === active?.id ? 0 : -1;
    }
  }

  function visibleOptions(): readonly UiSelectOption[] {
    const query = search.hidden ? '' : search.value.trim().toLocaleLowerCase();
    return options.filter((option) =>
      `${option.id} ${option.label}`.toLocaleLowerCase().includes(query),
    );
  }

  function visibleEnabledOptions(): readonly UiSelectOption[] {
    return visibleOptions().filter((option) => !option.disabled);
  }

  function activeOptionElement(): HTMLButtonElement | undefined {
    return activeId === undefined ? undefined : optionElements.get(activeId);
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
