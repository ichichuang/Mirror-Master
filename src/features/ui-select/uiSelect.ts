import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom';

import {
  commitActiveOption,
  createUiSelectState,
  moveActiveOption,
  openUiSelect,
  optionDomId,
  type UiSelectMovement,
  type UiSelectOption,
} from './state';

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
  readonly listenForTriggerClick?: boolean;
}

export function createUiSelectPopover({
  trigger,
  overlayRoot,
  id,
  options: initialOptions,
  selectedId: initialSelectedId,
  onChange,
  listenForTriggerClick = true,
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
  let cleanupAutoUpdate: (() => void) | undefined;
  let positionRevision = 0;
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
  if (listenForTriggerClick) trigger.addEventListener('click', onTriggerClick);
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
    listbox.style.visibility = 'hidden';
    overlayRoot.append(listbox);
    trigger.setAttribute('aria-expanded', 'true');
    updatePresentation();
    reposition();
    scrollActiveOptionIntoView();
    addListeners();
  }

  function closePopover(returnFocus: boolean): void {
    const hadOpenSurface = state.open || listbox.isConnected || listening;
    positionRevision += 1;
    state = { ...state, open: false, activeIndex: state.selectedIndex };
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    listbox.remove();
    listbox.style.removeProperty('visibility');
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
    const revision = ++positionRevision;
    const margin = 12;
    void computePosition(trigger, listbox, {
      strategy: 'fixed',
      placement: 'bottom-start',
      middleware: [
        offset(6),
        flip({ padding: margin }),
        shift({ padding: margin }),
        size({
          padding: margin,
          apply({ availableHeight, availableWidth, elements, rects }) {
            const maximumWidth = Math.max(0, availableWidth);
            Object.assign(elements.floating.style, {
              minWidth: `${String(Math.min(rects.reference.width, maximumWidth))}px`,
              maxWidth: `${String(maximumWidth)}px`,
              maxHeight: `${String(Math.max(0, availableHeight))}px`,
            });
          },
        }),
      ],
    }).then(({ x, y, placement }) => {
      if (!state.open || revision !== positionRevision) return;
      Object.assign(listbox.style, {
        position: 'fixed',
        left: `${String(x)}px`,
        top: `${String(y)}px`,
        visibility: 'visible',
      });
      listbox.dataset.placement = placement;
    });
  }

  function addListeners(): void {
    if (listening) return;
    listening = true;
    document.addEventListener('pointerdown', onDocumentPointerdown, true);
    cleanupAutoUpdate = autoUpdate(trigger, listbox, reposition);
  }

  function removeListeners(): void {
    if (!listening) return;
    listening = false;
    document.removeEventListener('pointerdown', onDocumentPointerdown, true);
    cleanupAutoUpdate?.();
    cleanupAutoUpdate = undefined;
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
    if (listenForTriggerClick) trigger.removeEventListener('click', onTriggerClick);
    trigger.removeEventListener('keydown', onTriggerKeydown);
    restoreAttributes(trigger, originalTriggerAttributes);
    for (const element of optionElements.values()) {
      element.removeEventListener('click', onOptionClick);
    }
    optionElements.clear();
    listbox.remove();
  }
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
