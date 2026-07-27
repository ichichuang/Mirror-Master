import {
  createMobilePicker,
  createUiSelectPopover,
  type MobilePickerController,
  type UiSelectPopoverController,
} from '../ui-select/uiSelect';
import type { UiSelectOption } from '../ui-select/state';

export interface AdaptiveSelectMediaQuery {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

export interface AdaptiveSelectController {
  readonly selectedId: () => string | undefined;
  readonly setOptions: (options: readonly UiSelectOption[]) => void;
  readonly setValue: (selectedId: string) => void;
  readonly destroy: () => void;
}

export interface CreateAdaptiveSelectControllerOptions {
  readonly trigger: HTMLButtonElement;
  readonly overlayRoot: HTMLElement;
  readonly id: string;
  readonly title: string;
  readonly options: readonly UiSelectOption[];
  readonly selectedId: string;
  readonly mobileSurface: HTMLElement;
  readonly mobilePanel: HTMLElement;
  readonly mediaQuery?: AdaptiveSelectMediaQuery;
  readonly onChange?: (selectedId: string) => void;
}

export function createAdaptiveSelectController({
  trigger,
  overlayRoot,
  id,
  title,
  options,
  selectedId: initialSelectedId,
  mobileSurface,
  mobilePanel,
  mediaQuery: suppliedMediaQuery,
  onChange,
}: CreateAdaptiveSelectControllerOptions): AdaptiveSelectController {
  const window = trigger.ownerDocument.defaultView;
  const mediaQueryCandidate = suppliedMediaQuery ?? window?.matchMedia('(max-width: 767px)');
  if (mediaQueryCandidate === undefined) {
    throw new Error('自适应选择器需要可用的浏览器窗口。');
  }
  const mediaQuery: AdaptiveSelectMediaQuery = mediaQueryCandidate;

  let selectedId: string | undefined = initialSelectedId;
  let destroyed = false;
  const desktopController: UiSelectPopoverController = createUiSelectPopover({
    trigger,
    overlayRoot,
    id: `${id}-desktop`,
    options,
    selectedId: initialSelectedId,
    onChange: commit,
  });
  const mobileController: MobilePickerController = createMobilePicker({
    sheet: mobileSurface,
    panel: mobilePanel,
    trigger,
    id: `${id}-mobile`,
    title,
    options,
    selectedId: initialSelectedId,
    onChange: commit,
  });
  trigger.addEventListener('click', onTriggerClick, true);
  trigger.addEventListener('keydown', onTriggerKeydown, true);
  mediaQuery.addEventListener('change', onMediaChange);
  const MutationObserverConstructor = window?.MutationObserver;
  const mobileSurfaceObserver =
    MutationObserverConstructor === undefined
      ? undefined
      : new MutationObserverConstructor(syncTriggerAria);
  mobileSurfaceObserver?.observe(mobileSurface, { childList: true });
  syncSelectedId();
  syncTriggerAria();

  return Object.freeze({
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
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      mediaQuery.removeEventListener('change', onMediaChange);
      mobileSurfaceObserver?.disconnect();
      trigger.removeEventListener('click', onTriggerClick, true);
      trigger.removeEventListener('keydown', onTriggerKeydown, true);
      desktopController.destroy();
      mobileController.destroy();
    },
  });

  function onTriggerClick(event: MouseEvent): void {
    if (destroyed) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (mediaQuery.matches) {
      desktopController.close();
      if (mobileController.isOpen()) mobileController.cancel();
      else mobileController.open();
    } else {
      mobileController.cancel();
      if (desktopController.isOpen()) desktopController.close();
      else desktopController.open();
    }
    syncTriggerAria();
  }

  function onTriggerKeydown(event: KeyboardEvent): void {
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
    mobileController.open();
    syncTriggerAria();
  }

  function onMediaChange(): void {
    if (destroyed) return;
    if (mediaQuery.matches) desktopController.close();
    else mobileController.cancel();
    syncTriggerAria();
  }

  function commit(nextSelectedId: string): void {
    selectedId = nextSelectedId;
    syncControllerValues();
    syncTriggerAria();
    onChange?.(nextSelectedId);
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
    if (mobileController.isOpen()) {
      trigger.setAttribute('aria-expanded', 'true');
      trigger.setAttribute('aria-controls', `${id}-mobile-listbox`);
      return;
    }
    trigger.setAttribute('aria-expanded', String(desktopController.isOpen()));
    trigger.setAttribute('aria-controls', `${id}-desktop-listbox`);
  }
}
