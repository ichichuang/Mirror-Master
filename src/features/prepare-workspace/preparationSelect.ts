import {
  createMobileSingleSelectSurface,
  type MobileSingleSelectSurfaceController,
} from '../ui-select/mobileSingleSelect';
import type { MobileStageHostController, MobileStageLease } from '../ui-select/mobileStageHost';
import type { UiSelectOption } from '../ui-select/state';
import { createUiSelectPopover, type UiSelectPopoverController } from '../ui-select/uiSelect';

export interface SelectionMediaQuery {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

export interface PreparationSelectController {
  readonly close: () => void;
  readonly selectedId: () => string | undefined;
  readonly setOptions: (options: readonly UiSelectOption[]) => void;
  readonly setValue: (selectedId: string) => void;
  readonly destroy: () => void;
}

export interface CreatePreparationSelectControllerOptions {
  readonly trigger: HTMLButtonElement;
  readonly overlayRoot: HTMLElement;
  readonly mobileStageHost: MobileStageHostController;
  readonly id: string;
  readonly title: string;
  readonly options: readonly UiSelectOption[];
  readonly selectedId: string;
  readonly mediaQuery?: SelectionMediaQuery;
  readonly onChange?: (selectedId: string) => void;
}

export function createPreparationSelectController({
  trigger,
  overlayRoot,
  mobileStageHost,
  id,
  title,
  options: initialOptions,
  selectedId: initialSelectedId,
  mediaQuery: suppliedMediaQuery,
  onChange,
}: CreatePreparationSelectControllerOptions): PreparationSelectController {
  const window = trigger.ownerDocument.defaultView;
  const mediaQueryCandidate = suppliedMediaQuery ?? window?.matchMedia('(max-width: 767px)');
  if (mediaQueryCandidate === undefined) {
    throw new Error('准备阶段选择器需要可用的浏览器窗口。');
  }
  const mediaQuery: SelectionMediaQuery = mediaQueryCandidate;
  let selectedId: string | undefined = initialSelectedId;
  let mobileLease: MobileStageLease | undefined;
  let destroyed = false;

  const desktopController: UiSelectPopoverController = createUiSelectPopover({
    trigger,
    overlayRoot,
    id: `${id}-desktop`,
    options: initialOptions,
    selectedId: initialSelectedId,
    listenForTriggerClick: false,
    onChange: commit,
  });
  const mobileController: MobileSingleSelectSurfaceController = createMobileSingleSelectSurface({
    document: trigger.ownerDocument,
    id: `${id}-mobile`,
    title,
    options: initialOptions,
    selectedId: initialSelectedId,
    onSelect(nextSelectedId) {
      commit(nextSelectedId);
      closeMobile(true);
    },
    onCancel() {
      closeMobile(true);
    },
  });

  trigger.addEventListener('click', onTriggerClick);
  trigger.addEventListener('keydown', onMobileTriggerKeydown, true);
  mediaQuery.addEventListener('change', onMediaChange);
  syncSelectedId();
  syncTriggerAria();

  return Object.freeze({
    close() {
      desktopController.close();
      closeMobile(false);
      syncTriggerAria();
    },
    selectedId: () => selectedId,
    setOptions(nextOptions: readonly UiSelectOption[]) {
      if (destroyed) return;
      desktopController.setOptions(nextOptions);
      mobileController.setOptions(nextOptions);
      syncSelectedId();
      syncControllerValues();
    },
    setValue(nextSelectedId: string) {
      if (destroyed) return;
      desktopController.setValue(nextSelectedId);
      mobileController.setValue(nextSelectedId);
      syncSelectedId();
      syncTriggerAria();
    },
    destroy() {
      if (destroyed) return;
      closeMobile(false);
      destroyed = true;
      trigger.removeEventListener('click', onTriggerClick);
      trigger.removeEventListener('keydown', onMobileTriggerKeydown, true);
      mediaQuery.removeEventListener('change', onMediaChange);
      desktopController.destroy();
      mobileController.destroy();
    },
  });

  function onTriggerClick(event: MouseEvent): void {
    if (destroyed) return;
    event.preventDefault();
    if (mediaQuery.matches) {
      desktopController.close();
      if (mobileLease) closeMobile(true);
      else openMobile();
    } else {
      closeMobile(false);
      if (desktopController.isOpen()) desktopController.close();
      else desktopController.open();
    }
    syncTriggerAria();
  }

  function onMobileTriggerKeydown(event: KeyboardEvent): void {
    if (
      destroyed ||
      !mediaQuery.matches ||
      !['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)
    ) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    desktopController.close();
    openMobile();
  }

  function onMediaChange(): void {
    if (destroyed) return;
    if (mediaQuery.matches) desktopController.close();
    else closeMobile(false);
    syncTriggerAria();
  }

  function openMobile(): void {
    if (mobileLease || destroyed) return;
    mobileLease = mobileStageHost.mount(mobileController.element);
    syncTriggerAria();
    mobileController.focus();
  }

  function closeMobile(returnFocus: boolean): void {
    if (!mobileLease) return;
    mobileLease.release();
    mobileLease = undefined;
    syncTriggerAria();
    if (returnFocus && !destroyed) trigger.focus({ preventScroll: true });
  }

  function commit(nextSelectedId: string): void {
    const previousSelectedId = selectedId;
    selectedId = nextSelectedId;
    syncControllerValues();
    syncTriggerAria();
    if (selectedId !== previousSelectedId) onChange?.(nextSelectedId);
  }

  function syncControllerValues(): void {
    if (selectedId === undefined) return;
    desktopController.setValue(selectedId);
    mobileController.setValue(selectedId);
  }

  function syncSelectedId(): void {
    selectedId = desktopController.selectedId() ?? mobileController.selectedId();
  }

  function syncTriggerAria(): void {
    const mobileOpen = mobileLease !== undefined;
    trigger.setAttribute('aria-expanded', String(mobileOpen || desktopController.isOpen()));
    trigger.setAttribute(
      'aria-controls',
      mobileOpen ? `${id}-mobile-listbox` : `${id}-desktop-listbox`,
    );
  }
}
