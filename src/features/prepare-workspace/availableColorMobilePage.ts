import type { MobileStageHostController, MobileStageLease } from '../ui-select/mobileStageHost';
import type { SelectionMediaQuery } from './preparationSelect';

export interface AvailableColorMobilePageController {
  readonly open: () => void;
  readonly close: () => void;
  readonly isOpen: () => boolean;
  readonly destroy: () => void;
}

export interface CreateAvailableColorMobilePageOptions {
  readonly mobileStageHost: MobileStageHostController;
  readonly content: HTMLElement;
  readonly trigger: HTMLButtonElement;
  readonly searchInput: HTMLInputElement;
  readonly mediaQuery?: SelectionMediaQuery;
}

export function createAvailableColorMobilePage({
  mobileStageHost,
  content,
  trigger,
  searchInput,
  mediaQuery: suppliedMediaQuery,
}: CreateAvailableColorMobilePageOptions): AvailableColorMobilePageController {
  const document = content.ownerDocument;
  const window = document.defaultView;
  const mediaQueryCandidate =
    suppliedMediaQuery ?? window?.matchMedia('(min-width: 320px) and (max-width: 767px)');
  if (mediaQueryCandidate === undefined) {
    throw new Error('移动颜色面板需要可用的浏览器窗口。');
  }
  const mediaQuery: SelectionMediaQuery = mediaQueryCandidate;
  let surface: HTMLElement | null = null;
  let placeholder: Comment | null = null;
  let lease: MobileStageLease | null = null;
  let returnButton: HTMLButtonElement | null = null;
  let completeButton: HTMLButtonElement | null = null;
  let gridScrollTop = 0;
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
    const picker = document.createElement('section');
    const heading = document.createElement('header');
    const title = document.createElement('h2');
    const back = document.createElement('button');
    const actions = document.createElement('footer');
    const complete = document.createElement('button');
    picker.className = 'available-color-mobile-page';
    picker.dataset.availableColorMobilePage = '';
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-labelledby', 'available-color-mobile-title');
    picker.addEventListener('keydown', onSurfaceKeydown);
    heading.className = 'mobile-selection-heading';
    title.id = 'available-color-mobile-title';
    title.textContent = '选择手边有的颜色';
    back.type = 'button';
    back.className = 'text-button mobile-selection-back';
    back.dataset.availableColorMobileReturn = '';
    back.textContent = '返回设置';
    back.addEventListener('click', onReturn);
    actions.className = 'mobile-selection-actions';
    complete.type = 'button';
    complete.className = 'primary-button';
    complete.dataset.availableColorMobileComplete = '';
    complete.textContent = '完成选择';
    complete.addEventListener('click', onReturn);
    heading.append(title, back);
    actions.append(complete);
    picker.append(heading, content, actions);
    lease = mobileStageHost.mount(picker);
    surface = picker;
    returnButton = back;
    completeButton = complete;
    const grid = content.querySelector<HTMLElement>('[data-available-color-grid]');
    if (grid) grid.scrollTop = gridScrollTop;
    searchInput.focus({ preventScroll: true });
  }

  function close(returnFocus: boolean): void {
    if (surface === null) return;
    gridScrollTop =
      content.querySelector<HTMLElement>('[data-available-color-grid]')?.scrollTop ?? 0;
    placeholder?.parentNode?.insertBefore(content, placeholder);
    placeholder?.remove();
    placeholder = null;
    surface.removeEventListener('keydown', onSurfaceKeydown);
    returnButton?.removeEventListener('click', onReturn);
    completeButton?.removeEventListener('click', onReturn);
    lease?.release();
    lease = null;
    surface = null;
    returnButton = null;
    completeButton = null;
    if (returnFocus && !destroyed) trigger.focus({ preventScroll: true });
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
