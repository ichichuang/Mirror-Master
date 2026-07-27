import {
  commitActiveOption,
  createUiSelectState,
  moveActiveOption,
  openUiSelect,
  optionDomId,
  type UiSelectMovement,
  type UiSelectOption,
} from './state';
import { positionPopover, type PopoverRect } from './position';

export interface UiSelectPopoverController {
  open(): void;
  close(): void;
  destroy(): void;
  isOpen(): boolean;
  selectedId(): string | undefined;
  setValue(selectedId: string): void;
  setOptions(options: readonly UiSelectOption[]): void;
}

export interface CreateUiSelectPopoverOptions {
  readonly trigger: HTMLButtonElement;
  readonly overlayRoot: HTMLElement;
  readonly id: string;
  readonly options: readonly UiSelectOption[];
  readonly selectedId: string;
  readonly onChange?: (id: string) => void;
  readonly scrollAncestors?: readonly EventTarget[];
  readonly viewport?: () => { width: number; height: number; left?: number; top?: number };
}

export function createUiSelectPopover({
  trigger,
  overlayRoot,
  id,
  options: initialOptions,
  selectedId: initialSelectedId,
  onChange,
  scrollAncestors = [],
  viewport,
}: CreateUiSelectPopoverOptions): UiSelectPopoverController {
  const document = trigger.ownerDocument;
  const window = document.defaultView;
  const listbox = document.createElement('div');
  const optionElements = new Map<string, HTMLButtonElement>();
  const originalTriggerAttributes = captureAttributes(trigger, [
    'role',
    'aria-label',
    'aria-haspopup',
    'aria-expanded',
    'aria-controls',
    'aria-activedescendant',
    'data-value',
  ]);
  const triggerText = trigger.textContent.trim();
  const accessibleName =
    trigger.getAttribute('aria-label') ?? (triggerText === '' ? '选择选项' : triggerText);
  const valueElement = trigger.querySelector<HTMLElement>('[data-select-label]');
  let options = [...initialOptions];
  let state = createUiSelectState(options, initialSelectedId);
  let listening = false;
  let destroyed = false;

  listbox.id = `${id}-listbox`;
  listbox.className = 'ui-select-popover';
  listbox.setAttribute('role', 'listbox');
  listbox.setAttribute('aria-label', accessibleName);
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', listbox.id);
  syncOptionElements();
  updatePresentation();
  trigger.addEventListener('click', onTriggerClick);
  trigger.addEventListener('keydown', onTriggerKeydown);

  return {
    open,
    close() {
      closePopover(false);
    },
    destroy,
    isOpen() {
      return state.open;
    },
    selectedId() {
      return selectedOptionId();
    },
    setValue,
    setOptions,
  };

  function open(): void {
    if (destroyed || state.open) return;
    state = openUiSelect(state);
    overlayRoot.append(listbox);
    trigger.setAttribute('aria-expanded', 'true');
    updatePresentation();
    reposition();
    scrollActiveOptionIntoView();
    addListeners();
  }

  function closePopover(returnFocus: boolean): void {
    const hadOpenSurface = state.open || listbox.isConnected || listening;
    state = { ...state, open: false, activeIndex: state.selectedIndex };
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    listbox.remove();
    removeListeners();
    if (returnFocus && hadOpenSurface && !destroyed) trigger.focus();
  }

  function onTriggerClick(): void {
    if (state.open) closePopover(false);
    else open();
  }

  function onOptionClick(event: Event): void {
    const ButtonConstructor = window?.HTMLButtonElement;
    const element = event.currentTarget;
    if (ButtonConstructor === undefined || !(element instanceof ButtonConstructor)) return;
    const optionId = element.dataset.selectOption;
    if (optionId !== undefined) select(optionId);
  }

  function select(optionId: string): void {
    const optionIndex = options.findIndex((option) => option.id === optionId && !option.disabled);
    if (optionIndex === -1) return;
    commitIndex(optionIndex);
  }

  function onTriggerKeydown(event: KeyboardEvent): void {
    if (event.isComposing) return;
    if (!state.open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      open();
      if (event.key === 'ArrowUp') move('end');
      return;
    }
    if (!state.open) return;
    if (event.key === 'ArrowDown') move('next');
    else if (event.key === 'ArrowUp') move('previous');
    else if (event.key === 'Home') move('home');
    else if (event.key === 'End') move('end');
    else if (event.key === 'Enter' || event.key === ' ') commitIndex(state.activeIndex);
    else if (event.key === 'Escape') closePopover(true);
    else if (event.key === 'Tab') closePopover(false);
    else return;
    if (event.key !== 'Tab') event.preventDefault();
  }

  function move(movement: UiSelectMovement): void {
    state = moveActiveOption(state, options, movement);
    updatePresentation();
    scrollActiveOptionIntoView();
  }

  function commitIndex(optionIndex: number): void {
    const previousSelectedId = selectedOptionId();
    const committed = commitActiveOption({ ...state, activeIndex: optionIndex }, options);
    const nextSelectedId = options[committed.selectedIndex]?.id;
    state = committed;
    closePopover(true);
    if (nextSelectedId !== undefined && nextSelectedId !== previousSelectedId) {
      onChange?.(nextSelectedId);
    }
  }

  function setValue(selectedId: string): void {
    if (destroyed) return;
    const wasOpen = state.open;
    state = createUiSelectState(options, selectedId);
    if (wasOpen) state = openUiSelect(state);
    updatePresentation();
    if (wasOpen) {
      reposition();
      scrollActiveOptionIntoView();
    }
  }

  function setOptions(nextOptions: readonly UiSelectOption[]): void {
    if (destroyed) return;
    const previousSelectedId = selectedOptionId() ?? '';
    const previousActiveId = options[state.activeIndex]?.id;
    const wasOpen = state.open;
    options = [...nextOptions];
    state = createUiSelectState(options, previousSelectedId);
    if (wasOpen) {
      state = openUiSelect(state);
      const retainedActiveIndex = options.findIndex(
        (option) => option.id === previousActiveId && !option.disabled,
      );
      if (retainedActiveIndex !== -1) state = { ...state, activeIndex: retainedActiveIndex };
    }
    syncOptionElements();
    updatePresentation();
    if (wasOpen) {
      reposition();
      scrollActiveOptionIntoView();
    }
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
        element.className = 'ui-select-option';
        element.dataset.selectOption = option.id;
        element.setAttribute('role', 'option');
        element.tabIndex = -1;
        element.addEventListener('click', onOptionClick);
        optionElements.set(option.id, element);
      }
      element.id = optionDomId(id, option.id);
      element.setAttribute('aria-disabled', String(option.disabled === true));
      element.disabled = option.disabled === true;
      element.textContent = option.label;
      listbox.append(element);
    }
  }

  function updatePresentation(): void {
    const active = options[state.activeIndex];
    if (state.open && active !== undefined) {
      trigger.setAttribute('aria-activedescendant', optionDomId(id, active.id));
    } else {
      trigger.removeAttribute('aria-activedescendant');
    }
    for (const option of options) {
      const element = optionElements.get(option.id);
      if (element === undefined) continue;
      element.setAttribute('aria-selected', String(selectedOptionId() === option.id));
      element.dataset.active = String(state.open && active?.id === option.id);
    }
    const selected = options[state.selectedIndex];
    if (selected !== undefined) {
      trigger.dataset.value = selected.id;
      if (valueElement !== null) valueElement.textContent = selected.label;
      trigger.setAttribute('aria-label', `${accessibleName}，当前选择：${selected.label}`);
    } else {
      trigger.removeAttribute('data-value');
      if (valueElement !== null) valueElement.textContent = '';
      trigger.setAttribute('aria-label', `${accessibleName}，当前没有可用选项`);
    }
  }

  function reposition(): void {
    if (!state.open) return;
    const anchor = toPopoverRect(trigger.getBoundingClientRect());
    const visualViewport = window?.visualViewport;
    const viewportSize = viewport?.() ?? {
      width: visualViewport?.width ?? window?.innerWidth ?? 0,
      height: visualViewport?.height ?? window?.innerHeight ?? 0,
      left: visualViewport?.offsetLeft ?? 0,
      top: visualViewport?.offsetTop ?? 0,
    };
    const margin = 12;
    const maximumWidth = Math.max(0, viewportSize.width - margin * 2);
    const maximumHeight = Math.max(0, viewportSize.height - margin * 2);
    listbox.style.minWidth = `${String(Math.min(anchor.width, maximumWidth))}px`;
    listbox.style.maxWidth = `${String(maximumWidth)}px`;
    listbox.style.maxHeight = `${String(maximumHeight)}px`;
    const measured = listbox.getBoundingClientRect();
    const estimatedHeight = Math.min(maximumHeight, Math.max(measured.height, options.length * 44));
    const position = positionPopover(
      anchor,
      { width: Math.max(measured.width, anchor.width), height: estimatedHeight },
      {
        ...viewportSize,
        margin,
      },
    );
    Object.assign(listbox.style, {
      position: 'fixed',
      left: `${String(position.left)}px`,
      top: `${String(position.top)}px`,
      minWidth: `${String(position.minWidth)}px`,
      maxWidth: `${String(position.maxWidth)}px`,
      maxHeight: `${String(position.maxHeight)}px`,
    });
    listbox.dataset.placement = position.placement;
  }

  function addListeners(): void {
    if (listening) return;
    listening = true;
    document.addEventListener('pointerdown', onDocumentPointerdown, true);
    document.addEventListener('scroll', reposition, true);
    window?.addEventListener('resize', reposition);
    window?.visualViewport?.addEventListener('resize', reposition);
    window?.visualViewport?.addEventListener('scroll', reposition);
    for (const ancestor of new Set(scrollAncestors)) {
      ancestor.addEventListener('scroll', reposition);
    }
  }

  function removeListeners(): void {
    if (!listening) return;
    listening = false;
    document.removeEventListener('pointerdown', onDocumentPointerdown, true);
    document.removeEventListener('scroll', reposition, true);
    window?.removeEventListener('resize', reposition);
    window?.visualViewport?.removeEventListener('resize', reposition);
    window?.visualViewport?.removeEventListener('scroll', reposition);
    for (const ancestor of new Set(scrollAncestors)) {
      ancestor.removeEventListener('scroll', reposition);
    }
  }

  function onDocumentPointerdown(event: Event): void {
    const NodeConstructor = window?.Node;
    const target = event.target;
    if (NodeConstructor === undefined || !(target instanceof NodeConstructor)) return;
    if (!trigger.contains(target) && !listbox.contains(target)) closePopover(false);
  }

  function selectedOptionId(): string | undefined {
    return options[state.selectedIndex]?.id;
  }

  function scrollActiveOptionIntoView(): void {
    const active = options[state.activeIndex];
    if (active === undefined) return;
    optionElements.get(active.id)?.scrollIntoView({ block: 'nearest' });
  }

  function destroy(): void {
    if (destroyed) return;
    closePopover(false);
    destroyed = true;
    trigger.removeEventListener('click', onTriggerClick);
    trigger.removeEventListener('keydown', onTriggerKeydown);
    restoreAttributes(trigger, originalTriggerAttributes);
    for (const element of optionElements.values()) {
      element.removeEventListener('click', onOptionClick);
    }
    optionElements.clear();
    listbox.remove();
  }
}

export interface MobilePickerController {
  open(): void;
  cancel(): void;
  destroy(): void;
  isOpen(): boolean;
  selectedId(): string | undefined;
  setValue(selectedId: string): void;
  setOptions(options: readonly UiSelectOption[]): void;
}

export interface CreateMobilePickerOptions {
  readonly sheet: HTMLElement;
  readonly panel: HTMLElement;
  readonly trigger: HTMLElement;
  readonly title: string;
  readonly options: readonly UiSelectOption[];
  readonly selectedId: string;
  readonly id?: string;
  readonly onChange?: (id: string) => void;
}

export function createMobilePicker({
  sheet,
  panel,
  trigger,
  title,
  options: initialOptions,
  selectedId: initialSelectedId,
  id = trigger.id === '' ? 'mobile-picker' : `${trigger.id}-picker`,
  onChange,
}: CreateMobilePickerOptions): MobilePickerController {
  const document = sheet.ownerDocument;
  const window = document.defaultView;
  const optionElements = new Map<string, HTMLButtonElement>();
  let options = [...initialOptions];
  let selectedId = resolveEnabledId(options, initialSelectedId);
  let activeId = selectedId;
  let root: HTMLElement | undefined;
  let input: HTMLInputElement | undefined;
  let listbox: HTMLDivElement | undefined;
  let status: HTMLParagraphElement | undefined;
  let confirmButton: HTMLButtonElement | undefined;
  let surfaceSnapshot: readonly SurfaceElementState[] | undefined;
  let lastFocusInside: HTMLElement | undefined;
  let composing = false;
  let destroyed = false;

  trigger.addEventListener('click', open);

  return {
    open,
    cancel,
    destroy,
    isOpen() {
      return root !== undefined;
    },
    selectedId() {
      return selectedId;
    },
    setValue,
    setOptions,
  };

  function open(): void {
    if (destroyed || root !== undefined) return;
    surfaceSnapshot = captureSurfaceElements();
    for (const state of surfaceSnapshot) {
      state.element.hidden = true;
      state.element.inert = true;
    }
    root = buildPicker();
    sheet.append(root);
    input?.focus();
    document.addEventListener('focusin', onDocumentFocusIn, true);
    window?.addEventListener('resize', keepPickerTargetsVisible);
    window?.visualViewport?.addEventListener('resize', keepPickerTargetsVisible);
    window?.visualViewport?.addEventListener('scroll', keepPickerTargetsVisible);
    keepPickerTargetsVisible();
  }

  function cancel(): void {
    close(true);
  }

  function close(returnFocus: boolean): void {
    if (root === undefined) return;
    window?.removeEventListener('resize', keepPickerTargetsVisible);
    window?.visualViewport?.removeEventListener('resize', keepPickerTargetsVisible);
    window?.visualViewport?.removeEventListener('scroll', keepPickerTargetsVisible);
    document.removeEventListener('focusin', onDocumentFocusIn, true);
    root.removeEventListener('keydown', onPickerKeydown);
    root.remove();
    root = undefined;
    input = undefined;
    listbox = undefined;
    status = undefined;
    confirmButton = undefined;
    optionElements.clear();
    activeId = selectedId;
    composing = false;
    lastFocusInside = undefined;
    restoreSurfaceElements();
    if (returnFocus && !destroyed) trigger.focus();
  }

  function buildPicker(): HTMLElement {
    const picker = document.createElement('section');
    const heading = document.createElement('h2');
    const search = document.createElement('input');
    const optionsList = document.createElement('div');
    const liveStatus = document.createElement('p');
    const actions = document.createElement('div');
    const confirm = document.createElement('button');
    const cancelButton = document.createElement('button');
    picker.className = 'mobile-picker';
    picker.dataset.mobilePicker = '';
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-labelledby', `${id}-title`);
    heading.id = `${id}-title`;
    heading.textContent = title;
    search.type = 'search';
    search.dataset.mobilePickerSearch = '';
    search.setAttribute('role', 'combobox');
    search.setAttribute('aria-label', `搜索${title}`);
    search.setAttribute('aria-autocomplete', 'list');
    search.setAttribute('aria-expanded', 'true');
    search.setAttribute('aria-controls', `${id}-listbox`);
    search.setAttribute('aria-describedby', `${id}-status`);
    optionsList.id = `${id}-listbox`;
    optionsList.setAttribute('role', 'listbox');
    optionsList.setAttribute('aria-label', `${title}选项`);
    liveStatus.id = `${id}-status`;
    liveStatus.className = 'mobile-picker-status';
    liveStatus.setAttribute('role', 'status');
    liveStatus.setAttribute('aria-live', 'polite');
    actions.className = 'mobile-picker-actions';
    confirm.type = 'button';
    confirm.dataset.mobilePickerConfirm = '';
    confirm.textContent = '确认选择';
    confirm.addEventListener('click', commitActive);
    cancelButton.type = 'button';
    cancelButton.dataset.mobilePickerCancel = '';
    cancelButton.textContent = '返回';
    cancelButton.addEventListener('click', cancel);
    search.addEventListener('input', updateFilteredOptions);
    search.addEventListener('compositionstart', onCompositionStart);
    search.addEventListener('compositionend', onCompositionEnd);
    picker.addEventListener('keydown', onPickerKeydown);
    actions.append(confirm, cancelButton);
    picker.append(heading, search, optionsList, liveStatus, actions);
    input = search;
    listbox = optionsList;
    status = liveStatus;
    confirmButton = confirm;
    activeId = selectedId;
    syncMobileOptions();
    updateMobilePresentation();
    return picker;
  }

  function onCompositionStart(): void {
    composing = true;
  }

  function onCompositionEnd(): void {
    composing = false;
    updateFilteredOptions();
  }

  function onPickerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
      return;
    }
    if (document.activeElement === input) {
      if (
        (composing || event.isComposing) &&
        ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)
      ) {
        return;
      }
      if (event.key === 'ArrowDown') moveMobileActive('next');
      else if (event.key === 'ArrowUp') moveMobileActive('previous');
      else if (event.key === 'Home') moveMobileActive('home');
      else if (event.key === 'End') moveMobileActive('end');
      else if (event.key === 'Enter' && !composing) commitActive();
      else if (event.key !== 'Tab') return;
      if (event.key !== 'Tab') {
        event.preventDefault();
        return;
      }
    }
    if (event.key !== 'Tab' || root === undefined) return;
    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>('input, button:not([disabled]):not([role="option"])'),
    ).filter((element) => !element.hidden);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function updateFilteredOptions(): void {
    const enabled = enabledVisibleMobileOptions();
    if (!enabled.some((option) => option.id === activeId)) {
      activeId = enabled.find((option) => option.id === selectedId)?.id ?? enabled[0]?.id;
    }
    syncMobileOptions();
    updateMobilePresentation();
  }

  function moveMobileActive(movement: UiSelectMovement): void {
    const enabled = enabledVisibleMobileOptions();
    if (enabled.length === 0) return;
    const mobileState = createUiSelectState(enabled, activeId ?? '');
    const moved = moveActiveOption(
      { ...mobileState, open: true, activeIndex: mobileState.selectedIndex },
      enabled,
      movement,
    );
    activeId = enabled[moved.activeIndex]?.id;
    updateMobilePresentation();
    activeMobileElement()?.scrollIntoView({ block: 'nearest' });
  }

  function onMobileOptionClick(event: Event): void {
    const ButtonConstructor = window?.HTMLButtonElement;
    const element = event.currentTarget;
    if (ButtonConstructor === undefined || !(element instanceof ButtonConstructor)) return;
    const optionId = element.dataset.mobilePickerOption;
    if (optionId === undefined) return;
    const option = options.find((candidate) => candidate.id === optionId);
    if (option === undefined || option.disabled) return;
    activeId = option.id;
    updateMobilePresentation();
  }

  function commitActive(): void {
    if (composing || activeId === undefined) return;
    const option = options.find((candidate) => candidate.id === activeId && !candidate.disabled);
    if (
      option === undefined ||
      !visibleMobileOptions().some((candidate) => candidate.id === option.id)
    ) {
      return;
    }
    const previousSelectedId = selectedId;
    selectedId = option.id;
    close(true);
    if (selectedId !== previousSelectedId) onChange?.(selectedId);
  }

  function setValue(nextSelectedId: string): void {
    if (destroyed) return;
    selectedId = resolveEnabledId(options, nextSelectedId);
    if (root !== undefined) {
      updateFilteredOptions();
    } else {
      activeId = selectedId;
    }
  }

  function setOptions(nextOptions: readonly UiSelectOption[]): void {
    if (destroyed) return;
    const previousActiveId = activeId;
    options = [...nextOptions];
    selectedId = resolveEnabledId(options, selectedId ?? '');
    activeId = options.some((option) => option.id === previousActiveId && !option.disabled)
      ? previousActiveId
      : selectedId;
    if (root !== undefined) {
      syncMobileOptions();
      updateFilteredOptions();
    }
  }

  function syncMobileOptions(): void {
    if (listbox === undefined) return;
    const currentIds = new Set(options.map((option) => option.id));
    for (const [optionId, element] of optionElements) {
      if (currentIds.has(optionId)) continue;
      element.removeEventListener('click', onMobileOptionClick);
      element.remove();
      optionElements.delete(optionId);
    }
    for (const option of options) {
      let element = optionElements.get(option.id);
      if (element === undefined) {
        element = document.createElement('button');
        element.type = 'button';
        element.className = 'mobile-picker-option';
        element.dataset.mobilePickerOption = option.id;
        element.setAttribute('role', 'option');
        element.tabIndex = -1;
        element.addEventListener('click', onMobileOptionClick);
        optionElements.set(option.id, element);
      }
      element.id = optionDomId(id, option.id);
      element.textContent = option.label;
      element.disabled = option.disabled === true;
      element.setAttribute('aria-disabled', String(option.disabled === true));
    }
    listbox.replaceChildren(
      ...visibleMobileOptions().flatMap((option) => {
        const element = optionElements.get(option.id);
        return element === undefined ? [] : [element];
      }),
    );
  }

  function updateMobilePresentation(): void {
    if (input === undefined || status === undefined || confirmButton === undefined) return;
    const visible = visibleMobileOptions();
    const active = options.find(
      (option) =>
        option.id === activeId &&
        !option.disabled &&
        visible.some((visibleOption) => visibleOption.id === option.id),
    );
    if (active === undefined || !visible.some((option) => option.id === active.id)) {
      input.removeAttribute('aria-activedescendant');
    } else {
      input.setAttribute('aria-activedescendant', optionDomId(id, active.id));
    }
    for (const option of options) {
      const element = optionElements.get(option.id);
      if (element === undefined) continue;
      element.setAttribute('aria-selected', String(option.id === selectedId));
      element.dataset.active = String(option.id === active?.id);
    }
    status.textContent =
      visible.length === 0 ? '没有符合条件的选项' : `找到 ${String(visible.length)} 个选项`;
    confirmButton.disabled = active === undefined;
  }

  function visibleMobileOptions(): readonly UiSelectOption[] {
    const query = input?.value.trim().toLocaleLowerCase() ?? '';
    return options.filter((option) =>
      `${option.id} ${option.label}`.toLocaleLowerCase().includes(query),
    );
  }

  function enabledVisibleMobileOptions(): readonly UiSelectOption[] {
    return visibleMobileOptions().filter((option) => !option.disabled);
  }

  function activeMobileElement(): HTMLButtonElement | undefined {
    return activeId === undefined ? undefined : optionElements.get(activeId);
  }

  function keepPickerTargetsVisible(): void {
    if (root === undefined) return;
    const visualViewport = window?.visualViewport;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportHeight = visualViewport?.height ?? window?.innerHeight ?? 0;
    const viewportBottom = viewportTop + viewportHeight;
    const margin = 12;
    root.style.maxHeight = `${String(Math.max(0, viewportHeight))}px`;
    const active = activeMobileElement();
    const candidates = [input, active, confirmButton].filter(
      (element): element is HTMLInputElement | HTMLButtonElement => element !== undefined,
    );
    const obscured = candidates.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top < viewportTop + margin || rect.bottom > viewportBottom - margin;
    });
    const focused = isHtmlElement(document.activeElement) ? document.activeElement : undefined;
    const target =
      (focused !== undefined && obscured.some((element) => element === focused)
        ? focused
        : undefined) ??
      (confirmButton !== undefined && obscured.includes(confirmButton)
        ? confirmButton
        : undefined) ??
      (active !== undefined && obscured.includes(active) ? active : undefined) ??
      obscured[0];
    target?.scrollIntoView({ block: 'nearest' });
  }

  function destroy(): void {
    if (destroyed) return;
    close(false);
    destroyed = true;
    trigger.removeEventListener('click', open);
  }

  function captureSurfaceElements(): readonly SurfaceElementState[] {
    const elements = new Set<HTMLElement>([
      ...Array.from(sheet.children).filter(isHtmlElement),
      panel,
    ]);
    return [...elements].map((element) => ({
      element,
      hidden: element.hidden,
      inert: element.inert,
    }));
  }

  function restoreSurfaceElements(): void {
    if (surfaceSnapshot === undefined) return;
    for (const state of surfaceSnapshot) {
      state.element.hidden = state.hidden;
      state.element.inert = state.inert;
    }
    surfaceSnapshot = undefined;
  }

  function onDocumentFocusIn(event: FocusEvent): void {
    if (root === undefined) return;
    const target = event.target;
    if (isHtmlElement(target) && root.contains(target)) {
      lastFocusInside = target;
      return;
    }
    (lastFocusInside?.isConnected ? lastFocusInside : input)?.focus({ preventScroll: true });
  }

  function isHtmlElement(value: unknown): value is HTMLElement {
    return window !== null && value instanceof window.HTMLElement;
  }
}

interface SurfaceElementState {
  readonly element: HTMLElement;
  readonly hidden: HTMLElement['hidden'];
  readonly inert: boolean;
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

function toPopoverRect(rect: DOMRect): PopoverRect {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function captureAttributes(
  element: HTMLElement,
  names: readonly string[],
): ReadonlyMap<string, string | null> {
  return new Map(names.map((name) => [name, element.getAttribute(name)]));
}

function restoreAttributes(
  element: HTMLElement,
  attributes: ReadonlyMap<string, string | null>,
): void {
  for (const [name, value] of attributes) {
    if (value === null) element.removeAttribute(name);
    else element.setAttribute(name, value);
  }
}
