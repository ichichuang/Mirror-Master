import type { AdaptiveSelectMediaQuery } from './adaptiveSelect';

export interface AvailableColorMobilePanelController {
  readonly open: () => void;
  readonly close: () => void;
  readonly isOpen: () => boolean;
  readonly destroy: () => void;
}

export interface CreateAvailableColorMobilePanelOptions {
  readonly sheet: HTMLElement;
  readonly panel: HTMLElement;
  readonly content: HTMLElement;
  readonly trigger: HTMLButtonElement;
  readonly searchInput: HTMLInputElement;
  readonly mediaQuery?: AdaptiveSelectMediaQuery;
}

interface SurfaceElementState {
  readonly element: HTMLElement;
  readonly hidden: HTMLElement['hidden'];
  readonly inert: boolean;
}

export function createAvailableColorMobilePanel({
  sheet,
  panel,
  content,
  trigger,
  searchInput,
  mediaQuery: suppliedMediaQuery,
}: CreateAvailableColorMobilePanelOptions): AvailableColorMobilePanelController {
  const document = sheet.ownerDocument;
  const window = document.defaultView;
  const mediaQueryCandidate =
    suppliedMediaQuery ?? window?.matchMedia('(min-width: 320px) and (max-width: 767px)');
  if (mediaQueryCandidate === undefined) {
    throw new Error('移动颜色面板需要可用的浏览器窗口。');
  }
  const mediaQuery: AdaptiveSelectMediaQuery = mediaQueryCandidate;
  let surface: HTMLElement | null = null;
  let placeholder: Comment | null = null;
  let surfaceSnapshot: readonly SurfaceElementState[] = Object.freeze([]);
  let seriesFieldState: SurfaceElementState | null = null;
  let returnButton: HTMLButtonElement | null = null;
  let destroyed = false;

  trigger.addEventListener('click', open);
  mediaQuery.addEventListener('change', onMediaChange);

  return Object.freeze({
    open,
    close: () => {
      close(true);
    },
    isOpen: () => surface !== null,
    destroy() {
      if (destroyed) return;
      close(false);
      destroyed = true;
      trigger.removeEventListener('click', open);
      mediaQuery.removeEventListener('change', onMediaChange);
    },
  });

  function open(): void {
    if (destroyed || surface !== null || !mediaQuery.matches) return;
    const parent = content.parentNode;
    if (parent === null) return;
    placeholder = document.createComment('available-color-filter');
    parent.insertBefore(placeholder, content);
    surfaceSnapshot = Object.freeze(
      [...sheet.children].map((element) => {
        const htmlElement = asHtmlElement(element);
        return Object.freeze({
          element: htmlElement,
          hidden: htmlElement.hidden,
          inert: htmlElement.inert,
        });
      }),
    );
    for (const state of surfaceSnapshot) {
      state.element.hidden = true;
      state.element.inert = true;
    }
    const seriesField = content
      .querySelector<HTMLElement>('[data-available-color-series]')
      ?.closest<HTMLElement>('.selector-field');
    if (seriesField) {
      seriesFieldState = Object.freeze({
        element: seriesField,
        hidden: seriesField.hidden,
        inert: seriesField.inert,
      });
      seriesField.hidden = true;
      seriesField.inert = true;
    }
    const picker = document.createElement('section');
    const heading = document.createElement('div');
    const title = document.createElement('h2');
    const back = document.createElement('button');
    picker.className = 'mobile-picker available-color-mobile-panel';
    picker.dataset.mobilePicker = '';
    picker.dataset.availableColorMobilePanel = '';
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-labelledby', 'available-color-mobile-title');
    picker.addEventListener('keydown', onSurfaceKeydown);
    heading.className = 'available-color-mobile-heading';
    title.id = 'available-color-mobile-title';
    title.textContent = '选择手边有的颜色';
    back.type = 'button';
    back.className = 'secondary-button';
    back.dataset.availableColorMobileReturn = '';
    back.textContent = '返回设置';
    back.addEventListener('click', onReturn);
    heading.append(title, back);
    picker.append(heading, content);
    sheet.append(picker);
    panel.hidden = true;
    panel.inert = true;
    surface = picker;
    returnButton = back;
    searchInput.focus();
  }

  function close(returnFocus: boolean): void {
    if (surface === null) return;
    placeholder?.parentNode?.insertBefore(content, placeholder);
    placeholder?.remove();
    placeholder = null;
    surface.removeEventListener('keydown', onSurfaceKeydown);
    returnButton?.removeEventListener('click', onReturn);
    surface.remove();
    surface = null;
    returnButton = null;
    if (seriesFieldState) {
      seriesFieldState.element.hidden = seriesFieldState.hidden;
      seriesFieldState.element.inert = seriesFieldState.inert;
      seriesFieldState = null;
    }
    for (const state of surfaceSnapshot) {
      state.element.hidden = state.hidden;
      state.element.inert = state.inert;
    }
    surfaceSnapshot = Object.freeze([]);
    if (returnFocus && !destroyed) trigger.focus();
  }

  function onReturn(): void {
    close(true);
  }

  function onMediaChange(): void {
    if (!mediaQuery.matches) close(false);
  }

  function onSurfaceKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key !== 'Tab' || surface === null) return;
    const focusable = [
      ...surface.querySelectorAll<HTMLElement>(
        'input:not([tabindex="-1"]):not(:disabled), button:not(:disabled)',
      ),
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
}

function asHtmlElement(element: Element): HTMLElement {
  const window = element.ownerDocument.defaultView;
  if (window === null || !(element instanceof window.HTMLElement)) {
    throw new Error('移动颜色面板只能管理 HTML 元素。');
  }
  return element;
}
