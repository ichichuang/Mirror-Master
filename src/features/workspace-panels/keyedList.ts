export interface CreateKeyedListRendererOptions<Item> {
  readonly container: HTMLElement;
  readonly keyOf: (item: Item) => string;
  readonly create: (item: Item) => HTMLElement;
  readonly update: (element: HTMLElement, item: Item) => void;
  readonly destroyNode?: (element: HTMLElement, key: string) => void;
  readonly focusFallback?: HTMLElement;
}

export interface KeyedListRenderer<Item> {
  readonly update: (items: readonly Item[]) => void;
  readonly nodeFor: (key: string) => HTMLElement | undefined;
  readonly keys: () => readonly string[];
  readonly destroy: () => void;
}

export function createKeyedListRenderer<Item>({
  container,
  keyOf,
  create,
  update,
  destroyNode,
  focusFallback,
}: CreateKeyedListRendererOptions<Item>): KeyedListRenderer<Item> {
  const nodes = new Map<string, HTMLElement>();
  let orderedKeys: readonly string[] = Object.freeze([]);
  let destroyed = false;

  return Object.freeze({
    update(items: readonly Item[]): void {
      if (destroyed) {
        throw new Error('稳定列表已销毁。');
      }
      const nextKeys = validateKeys(items, keyOf);
      const nextKeySet = new Set(nextKeys);
      const document = container.ownerDocument;
      const window = document.defaultView;
      const activeElement =
        window && document.activeElement instanceof window.HTMLElement
          ? document.activeElement
          : null;
      const activeWasInside = activeElement !== null && container.contains(activeElement);
      const textSelection = captureTextSelection(activeElement);
      const removedFocusedIndex = focusedRemovedIndex(
        activeElement,
        orderedKeys,
        nodes,
        nextKeySet,
      );
      const scrollTop = container.scrollTop;
      const scrollLeft = container.scrollLeft;

      items.forEach((item, index) => {
        const key = nextKeys[index];
        if (key === undefined) {
          return;
        }
        let element = nodes.get(key);
        if (!element) {
          element = create(item);
          if (element === container || [...nodes.values()].includes(element)) {
            throw new Error('稳定列表的每一项都必须拥有独立节点。');
          }
          element.dataset.stableKey = key;
          nodes.set(key, element);
        }
        update(element, item);
        container.append(element);
      });

      for (const [key, element] of nodes) {
        if (nextKeySet.has(key)) {
          continue;
        }
        destroyNode?.(element, key);
        element.remove();
        nodes.delete(key);
      }
      orderedKeys = Object.freeze([...nextKeys]);
      container.scrollTop = scrollTop;
      container.scrollLeft = scrollLeft;

      if (removedFocusedIndex !== null) {
        const nearestKey = nextKeys[Math.min(removedFocusedIndex, nextKeys.length - 1)];
        const nearestNode = nearestKey === undefined ? undefined : nodes.get(nearestKey);
        focusEquivalent(nearestNode ?? focusFallback);
      } else if (activeWasInside && activeElement.isConnected) {
        activeElement.focus({ preventScroll: true });
        restoreTextSelection(activeElement, textSelection);
      }
    },
    nodeFor(key: string): HTMLElement | undefined {
      return nodes.get(key);
    },
    keys(): readonly string[] {
      return orderedKeys;
    },
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      for (const [key, element] of nodes) {
        destroyNode?.(element, key);
        element.remove();
      }
      nodes.clear();
      orderedKeys = Object.freeze([]);
    },
  });
}

function validateKeys<Item>(
  items: readonly Item[],
  keyOf: (item: Item) => string,
): readonly string[] {
  const keys = items.map(keyOf);
  const unique = new Set(keys);
  if (keys.some((key) => key.trim() === '') || unique.size !== keys.length) {
    throw new Error('稳定键必须非空且不可重复。');
  }
  return keys;
}

function focusedRemovedIndex(
  activeElement: HTMLElement | null,
  orderedKeys: readonly string[],
  nodes: ReadonlyMap<string, HTMLElement>,
  nextKeys: ReadonlySet<string>,
): number | null {
  if (!activeElement) {
    return null;
  }
  const index = orderedKeys.findIndex((key) => {
    const node = nodes.get(key);
    return !nextKeys.has(key) && (node === activeElement || node?.contains(activeElement));
  });
  return index < 0 ? null : index;
}

function focusEquivalent(element: HTMLElement | undefined): void {
  if (!element) {
    return;
  }
  const focusable = element.matches(focusableSelector())
    ? element
    : element.querySelector<HTMLElement>(focusableSelector());
  (focusable ?? element).focus({ preventScroll: true });
}

function focusableSelector(): string {
  return 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
}

interface TextSelection {
  readonly start: number | null;
  readonly end: number | null;
  readonly direction: 'forward' | 'backward' | 'none' | null;
}

function captureTextSelection(element: HTMLElement | null): TextSelection | null {
  if (!isTextControl(element)) {
    return null;
  }
  return Object.freeze({
    start: element.selectionStart,
    end: element.selectionEnd,
    direction: element.selectionDirection,
  });
}

function restoreTextSelection(element: HTMLElement, selection: TextSelection | null): void {
  if (!selection || selection.start === null || selection.end === null || !isTextControl(element)) {
    return;
  }
  element.setSelectionRange(selection.start, selection.end, selection.direction ?? undefined);
}

function isTextControl(
  element: HTMLElement | null,
): element is HTMLInputElement | HTMLTextAreaElement {
  return element !== null && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA');
}
