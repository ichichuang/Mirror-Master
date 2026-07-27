export interface MobileStageLease {
  readonly release: () => void;
}

export interface MobileStageHostController {
  readonly mount: (surface: HTMLElement) => MobileStageLease;
  readonly updateViewport: () => void;
  readonly destroy: () => void;
}

interface HostElementState {
  readonly element: HTMLElement;
  readonly hidden: HTMLElement['hidden'];
  readonly inert: boolean;
}

export function createMobileStageHost(
  host: HTMLElement,
  header: HTMLElement,
): MobileStageHostController {
  const window = host.ownerDocument.defaultView;
  const mountedSurfaces = new Set<HTMLElement>();
  let listening = false;
  let destroyed = false;

  return Object.freeze({
    mount(surface: HTMLElement): MobileStageLease {
      if (destroyed) {
        throw new Error('移动选择舞台已经销毁。');
      }
      const snapshot = [...host.children].map((element) => {
        const htmlElement = asHtmlElement(element);
        return Object.freeze({
          element: htmlElement,
          hidden: htmlElement.hidden,
          inert: htmlElement.inert,
        });
      });
      for (const state of snapshot) {
        state.element.hidden = true;
        state.element.inert = true;
      }
      host.append(surface);
      mountedSurfaces.add(surface);
      host.hidden = false;
      addListeners();
      updateViewport();
      let released = false;
      return Object.freeze({
        release() {
          if (released) return;
          released = true;
          mountedSurfaces.delete(surface);
          surface.remove();
          restore(snapshot);
          if (host.children.length === 0) {
            host.hidden = true;
            removeListeners();
          } else {
            updateViewport();
          }
        },
      });
    },
    updateViewport,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      removeListeners();
      for (const surface of mountedSurfaces) surface.remove();
      mountedSurfaces.clear();
      host.replaceChildren();
      host.hidden = true;
      host.style.removeProperty('top');
      host.style.removeProperty('left');
      host.style.removeProperty('width');
      host.style.removeProperty('height');
    },
  });

  function updateViewport(): void {
    if (destroyed || host.hidden) return;
    const visualViewport = window?.visualViewport;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportLeft = visualViewport?.offsetLeft ?? 0;
    const viewportWidth = visualViewport?.width ?? window?.innerWidth ?? 0;
    const viewportHeight = visualViewport?.height ?? window?.innerHeight ?? 0;
    const viewportBottom = viewportTop + viewportHeight;
    const headerBottom = Math.min(
      viewportBottom,
      Math.max(viewportTop, header.getBoundingClientRect().bottom),
    );
    Object.assign(host.style, {
      top: `${String(headerBottom)}px`,
      left: `${String(viewportLeft)}px`,
      width: `${String(Math.max(0, viewportWidth))}px`,
      height: `${String(Math.max(0, viewportBottom - headerBottom))}px`,
    });
  }

  function addListeners(): void {
    if (listening) return;
    listening = true;
    window?.addEventListener('resize', updateViewport);
    window?.addEventListener('orientationchange', updateViewport);
    window?.visualViewport?.addEventListener('resize', updateViewport);
    window?.visualViewport?.addEventListener('scroll', updateViewport);
  }

  function removeListeners(): void {
    if (!listening) return;
    listening = false;
    window?.removeEventListener('resize', updateViewport);
    window?.removeEventListener('orientationchange', updateViewport);
    window?.visualViewport?.removeEventListener('resize', updateViewport);
    window?.visualViewport?.removeEventListener('scroll', updateViewport);
  }

  function restore(snapshot: readonly HostElementState[]): void {
    for (const state of snapshot) {
      if (!state.element.isConnected) continue;
      state.element.hidden = state.hidden;
      state.element.inert = state.inert;
    }
  }
}

function asHtmlElement(element: Element): HTMLElement {
  const window = element.ownerDocument.defaultView;
  if (window === null || !(element instanceof window.HTMLElement)) {
    throw new Error('移动选择舞台只能管理 HTML 元素。');
  }
  return element;
}
