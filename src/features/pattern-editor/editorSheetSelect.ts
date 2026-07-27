import {
  createMobileSingleSelectSurface,
  type MobileSingleSelectSurfaceController,
} from '../ui-select/mobileSingleSelect';
import type { UiSelectOption } from '../ui-select/state';

export interface EditorSheetSelectController {
  readonly cancel: () => void;
  readonly isOpen: () => boolean;
  readonly selectedId: () => string | undefined;
  readonly setOptions: (options: readonly UiSelectOption[]) => void;
  readonly setValue: (selectedId: string) => void;
  readonly destroy: () => void;
}

export interface CreateEditorSheetSelectControllerOptions {
  readonly sheet: HTMLElement;
  readonly content: HTMLElement;
  readonly trigger: HTMLButtonElement;
  readonly id: string;
  readonly title: string;
  readonly options: readonly UiSelectOption[];
  readonly selectedId: string;
  readonly onChange?: (selectedId: string) => void;
}

interface ElementState {
  readonly element: HTMLElement;
  readonly hidden: HTMLElement['hidden'];
  readonly inert: boolean;
}

export function createEditorSheetSelectController({
  sheet,
  content,
  trigger,
  id,
  title,
  options: initialOptions,
  selectedId: initialSelectedId,
  onChange,
}: CreateEditorSheetSelectControllerOptions): EditorSheetSelectController {
  let selectedId: string | undefined = initialSelectedId;
  let contentSnapshot: readonly ElementState[] = Object.freeze([]);
  let chromeSnapshot: readonly ElementState[] = Object.freeze([]);
  let contentScrollTop = 0;
  let open = false;
  let destroyed = false;

  const surface: MobileSingleSelectSurfaceController = createMobileSingleSelectSurface({
    document: sheet.ownerDocument,
    id,
    title,
    options: initialOptions,
    selectedId: initialSelectedId,
    onSelect(nextSelectedId) {
      const previousSelectedId = selectedId;
      selectedId = nextSelectedId;
      surface.setValue(nextSelectedId);
      close(true);
      if (selectedId !== previousSelectedId) onChange?.(nextSelectedId);
    },
    onCancel() {
      close(true);
    },
  });

  trigger.addEventListener('click', onTriggerClick);
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', `${id}-listbox`);

  return Object.freeze({
    cancel() {
      close(true);
    },
    isOpen: () => open,
    selectedId: () => selectedId,
    setOptions(nextOptions: readonly UiSelectOption[]) {
      if (destroyed) return;
      surface.setOptions(nextOptions);
      selectedId = surface.selectedId();
    },
    setValue(nextSelectedId: string) {
      if (destroyed) return;
      surface.setValue(nextSelectedId);
      selectedId = surface.selectedId();
    },
    destroy() {
      if (destroyed) return;
      close(false);
      destroyed = true;
      trigger.removeEventListener('click', onTriggerClick);
      surface.destroy();
    },
  });

  function onTriggerClick(event: MouseEvent): void {
    event.preventDefault();
    if (open) close(true);
    else show();
  }

  function show(): void {
    if (open || destroyed) return;
    open = true;
    contentScrollTop = content.scrollTop;
    contentSnapshot = capture([...content.children]);
    chromeSnapshot = capture(
      [
        ...sheet.querySelectorAll<HTMLElement>(
          ':scope > [data-tab-surface], :scope > [data-palette-controls], :scope > .sheet-primary',
        ),
      ].filter((element) => element !== content),
    );
    conceal(contentSnapshot);
    conceal(chromeSnapshot);
    content.append(surface.element);
    content.dataset.selectionOpen = '';
    sheet.dataset.selectionOpen = '';
    content.scrollTop = 0;
    trigger.setAttribute('aria-expanded', 'true');
    surface.focus();
  }

  function close(returnFocus: boolean): void {
    if (!open) return;
    open = false;
    surface.element.remove();
    restore(contentSnapshot);
    restore(chromeSnapshot);
    contentSnapshot = Object.freeze([]);
    chromeSnapshot = Object.freeze([]);
    delete content.dataset.selectionOpen;
    delete sheet.dataset.selectionOpen;
    content.scrollTop = contentScrollTop;
    trigger.setAttribute('aria-expanded', 'false');
    if (returnFocus && !destroyed) trigger.focus({ preventScroll: true });
  }
}

function capture(elements: readonly Element[]): readonly ElementState[] {
  return Object.freeze(
    elements.map((element) => {
      const htmlElement = asHtmlElement(element);
      return Object.freeze({
        element: htmlElement,
        hidden: htmlElement.hidden,
        inert: htmlElement.inert,
      });
    }),
  );
}

function conceal(states: readonly ElementState[]): void {
  for (const state of states) {
    state.element.hidden = true;
    state.element.inert = true;
  }
}

function restore(states: readonly ElementState[]): void {
  for (const state of states) {
    if (!state.element.isConnected) continue;
    state.element.hidden = state.hidden;
    state.element.inert = state.inert;
  }
}

function asHtmlElement(element: Element): HTMLElement {
  const window = element.ownerDocument.defaultView;
  if (window === null || !(element instanceof window.HTMLElement)) {
    throw new Error('编辑器选择器只能管理 HTML 元素。');
  }
  return element;
}
