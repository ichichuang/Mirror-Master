import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createUiSelectPopover } from '../src/features/ui-select/uiSelect';
import { positionPopover } from '../src/features/ui-select/position';

interface TestCleanup {
  after(callback: () => void | Promise<void>): void;
}

function setupPopover(t: TestCleanup) {
  const window = new Window();
  const { document } = window;
  const visualViewport = new window.EventTarget();
  Object.defineProperties(visualViewport, {
    width: { value: 360 },
    height: { value: 760 },
    offsetLeft: { value: 0 },
    offsetTop: { value: 0 },
  });
  Object.defineProperty(window, 'visualViewport', { value: visualViewport });
  const trigger = document.createElement('button');
  const triggerValue = document.createElement('span');
  triggerValue.dataset.selectLabel = '';
  trigger.append(triggerValue);
  trigger.setAttribute('aria-label', '选择拼豆规格');
  const overlayRoot = document.createElement('div');
  const scrollParent = document.createElement('div');
  document.body.append(scrollParent, trigger, overlayRoot);
  const changes: string[] = [];
  let scrollListenerAdds = 0;
  let scrollListenerRemoves = 0;
  const addEventListener = scrollParent.addEventListener.bind(scrollParent);
  const removeEventListener = scrollParent.removeEventListener.bind(scrollParent);
  scrollParent.addEventListener = (type, listener, options) => {
    if (type === 'scroll') scrollListenerAdds += 1;
    addEventListener(type, listener, options);
  };
  scrollParent.removeEventListener = (type, listener, options) => {
    if (type === 'scroll') scrollListenerRemoves += 1;
    removeEventListener(type, listener, options);
  };
  let rect = { left: 120, top: 680, right: 240, bottom: 720, width: 120, height: 40 };
  trigger.getBoundingClientRect = () => rect;
  const controller = createUiSelectPopover({
    trigger,
    overlayRoot,
    id: 'bead-size',
    options: [
      { id: 'regular', label: '常规 5 mm' },
      { id: 'mini', label: '迷你 2.6 mm' },
      { id: 'custom', label: '自定义', disabled: true },
    ],
    selectedId: 'regular',
    scrollAncestors: [scrollParent],
    viewport: () => ({ width: 360, height: 760 }),
    onChange: (id) => changes.push(id),
  });
  t.after(async () => {
    controller.destroy();
    await window.happyDOM.close();
  });
  return {
    window,
    visualViewport,
    document,
    trigger,
    triggerValue,
    overlayRoot,
    scrollParent,
    controller,
    changes,
    scrollListenerCounts() {
      return { adds: scrollListenerAdds, removes: scrollListenerRemoves };
    },
    setRect(next: typeof rect) {
      rect = next;
    },
  };
}

test('the popover exposes listbox ARIA, stable option ids, and a separate active option', (t) => {
  const { controller, trigger, triggerValue, overlayRoot, window } = setupPopover(t);
  controller.open();

  const listbox = overlayRoot.querySelector<HTMLElement>('[role="listbox"]');
  const options = overlayRoot.querySelectorAll<HTMLElement>('[role="option"]');
  assert.ok(listbox);
  assert.equal(trigger.getAttribute('role'), 'combobox');
  assert.equal(trigger.getAttribute('aria-haspopup'), 'listbox');
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(trigger.getAttribute('aria-controls'), 'bead-size-listbox');
  assert.equal(options.length, 3);
  assert.notEqual(options[0]?.id, '');
  assert.equal(options[0]?.getAttribute('aria-selected'), 'true');
  assert.equal(trigger.getAttribute('aria-activedescendant'), options[0]?.id);
  assert.equal(options[0]?.getAttribute('tabindex'), '-1');
  assert.equal(triggerValue.textContent, '常规 5 mm');
  assert.match(trigger.getAttribute('aria-label') ?? '', /当前选择：常规 5 mm/u);

  trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(options[0]?.getAttribute('aria-selected'), 'true');
  assert.equal(trigger.getAttribute('aria-activedescendant'), options[1]?.id);
});

test('composition-owned navigation keys do not move or commit the temporary active option', (t) => {
  const { controller, trigger, overlayRoot, changes, window } = setupPopover(t);
  controller.open();
  const initialActive = trigger.getAttribute('aria-activedescendant');

  trigger.dispatchEvent(
    new window.KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      isComposing: true,
    }),
  );
  trigger.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }),
  );

  assert.equal(trigger.getAttribute('aria-activedescendant'), initialActive);
  assert.equal(controller.isOpen(), true);
  assert.deepEqual(changes, []);
  assert.ok(overlayRoot.querySelector('[role="listbox"]'));
});

test('a trigger click opens and closes the same portal surface', (t) => {
  const { controller, trigger, overlayRoot } = setupPopover(t);

  trigger.click();
  const listbox = overlayRoot.querySelector('[role="listbox"]');
  assert.ok(listbox);
  assert.equal(controller.isOpen(), true);

  trigger.click();
  assert.equal(controller.isOpen(), false);
  assert.equal(overlayRoot.querySelector('[role="listbox"]') === null, true);
});

test('escape cancels an active change and returns focus to the trigger', (t) => {
  const { controller, trigger, window } = setupPopover(t);
  controller.open();
  trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  assert.equal(controller.isOpen(), false);
  assert.equal(controller.selectedId(), 'regular');
  assert.equal(trigger.ownerDocument.activeElement === trigger, true);
});

test('enter commits an enabled active option, removes the portal, and restores trigger focus', (t) => {
  const { controller, trigger, overlayRoot, changes, window } = setupPopover(t);
  controller.open();
  trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  assert.equal(controller.selectedId(), 'mini');
  assert.deepEqual(changes, ['mini']);
  assert.equal(controller.isOpen(), false);
  assert.equal(overlayRoot.querySelector('[role="listbox"]') === null, true);
  assert.equal(trigger.ownerDocument.activeElement === trigger, true);
});

test('space commits the active option through the same change entry', (t) => {
  const { controller, trigger, changes, window } = setupPopover(t);
  controller.open();
  trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));

  assert.equal(controller.selectedId(), 'mini');
  assert.deepEqual(changes, ['mini']);
  assert.equal(controller.isOpen(), false);
});

test('pointer selection commits once, closes the portal, and restores focus', (t) => {
  const { controller, trigger, overlayRoot, changes } = setupPopover(t);
  controller.open();
  const mini = overlayRoot.querySelector<HTMLButtonElement>('[data-select-option="mini"]');
  assert.ok(mini);

  mini.click();

  assert.deepEqual(changes, ['mini']);
  assert.equal(controller.selectedId(), 'mini');
  assert.equal(overlayRoot.querySelector('[role="listbox"]') === null, true);
  assert.equal(trigger.ownerDocument.activeElement === trigger, true);
});

test('tab closes without trapping or restoring focus to the trigger', (t) => {
  const { controller, trigger, document, window } = setupPopover(t);
  const next = document.createElement('button');
  document.body.append(next);
  controller.open();
  next.focus();
  trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));

  assert.equal(controller.isOpen(), false);
  assert.equal(document.activeElement === next, true);
});

test('fixed popovers flip above and clamp within the visual viewport', () => {
  assert.deepEqual(
    positionPopover(
      { left: 330, top: 680, width: 120, height: 40 },
      { width: 240, height: 160 },
      {
        width: 360,
        height: 760,
        margin: 12,
      },
    ),
    {
      left: 108,
      top: 508,
      minWidth: 120,
      maxWidth: 336,
      maxHeight: 736,
      placement: 'top',
    },
  );
});

test('fixed popovers account for a zoomed visual viewport offset', () => {
  assert.deepEqual(
    positionPopover(
      { left: 20, top: 90, width: 100, height: 40 },
      { width: 180, height: 120 },
      { left: 40, top: 80, width: 320, height: 400, margin: 12 },
    ),
    {
      left: 52,
      top: 142,
      minWidth: 100,
      maxWidth: 296,
      maxHeight: 376,
      placement: 'bottom',
    },
  );
});

test('fixed popovers constrain both dimensions to a zoomed visual viewport', () => {
  assert.deepEqual(
    positionPopover(
      { left: 20, top: 40, width: 120, height: 44 },
      { width: 500, height: 500 },
      { left: 40, top: 80, width: 240, height: 220, margin: 12 },
    ),
    {
      left: 52,
      top: 92,
      minWidth: 120,
      maxWidth: 216,
      maxHeight: 196,
      placement: 'bottom',
    },
  );
});

test('reopening after a narrower trigger clears stale sizing before measuring and positioning', (t) => {
  const { controller, trigger, overlayRoot, setRect } = setupPopover(t);
  setRect({ left: 20, top: 200, right: 260, bottom: 240, width: 240, height: 40 });
  controller.open();
  const listbox = overlayRoot.querySelector<HTMLElement>('[role="listbox"]');
  assert.ok(listbox);
  listbox.getBoundingClientRect = () => {
    const width = Number.parseFloat(listbox.style.minWidth) || 0;
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: width,
      bottom: 132,
      width,
      height: 132,
      toJSON() {
        return {};
      },
    };
  };
  controller.close();
  setRect({ left: 200, top: 200, right: 280, bottom: 240, width: 80, height: 40 });

  controller.open();

  assert.equal(listbox.style.minWidth, '80px');
  assert.equal(listbox.style.left, '200px');
});

test('scroll, resize, and visual viewport changes reposition the fixed portal without recreating it', (t) => {
  const { controller, overlayRoot, scrollParent, document, setRect, visualViewport, window } =
    setupPopover(t);
  controller.open();
  const listbox = overlayRoot.querySelector<HTMLElement>('[role="listbox"]');
  assert.ok(listbox);
  const initialNode = listbox;
  setRect({ left: 20, top: 50, right: 140, bottom: 90, width: 120, height: 40 });
  scrollParent.dispatchEvent(new window.Event('scroll'));
  assert.equal(listbox.style.left, '20px');
  document.dispatchEvent(new window.Event('scroll', { bubbles: true }));
  window.dispatchEvent(new window.Event('resize'));
  visualViewport.dispatchEvent(new window.Event('resize'));
  visualViewport.dispatchEvent(new window.Event('scroll'));
  assert.equal(overlayRoot.querySelector('[role="listbox"]') === initialNode, true);
});

test('committing balances scroll listeners before the controller is destroyed', (t) => {
  const { controller, trigger, scrollListenerCounts, window } = setupPopover(t);
  controller.open();
  trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  assert.deepEqual(scrollListenerCounts(), { adds: 1, removes: 1 });
});

test('external option and value updates preserve the open listbox and retained option nodes', (t) => {
  const { controller, trigger, triggerValue, overlayRoot, window } = setupPopover(t);
  controller.open();
  trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  const listbox = overlayRoot.querySelector<HTMLElement>('[role="listbox"]');
  const retainedMini = overlayRoot.querySelector<HTMLElement>('[data-select-option="mini"]');
  assert.ok(listbox);
  assert.ok(retainedMini);

  controller.setOptions?.([
    { id: 'regular', label: '常规 5 mm' },
    { id: 'mini', label: '迷你 2.6 mm（推荐）' },
    { id: 'large', label: '大颗粒' },
  ]);

  assert.equal(overlayRoot.querySelector('[role="listbox"]') === listbox, true);
  assert.equal(overlayRoot.querySelector('[data-select-option="mini"]') === retainedMini, true);
  assert.equal(retainedMini.textContent, '迷你 2.6 mm（推荐）');
  assert.equal(trigger.getAttribute('aria-activedescendant'), retainedMini.id);

  controller.setValue?.('large');
  assert.equal(overlayRoot.querySelector('[role="listbox"]') === listbox, true);
  assert.equal(controller.selectedId(), 'large');
  assert.equal(
    trigger.getAttribute('aria-activedescendant'),
    overlayRoot.querySelector('[data-select-option="large"]')?.id,
  );
  assert.equal(triggerValue.textContent, '大颗粒');
  assert.match(trigger.getAttribute('aria-label') ?? '', /当前选择：大颗粒/u);
});

test('distinct option ids remain distinct after DOM-safe encoding', (t) => {
  const { controller, overlayRoot } = setupPopover(t);
  controller.setOptions([
    { id: 'series:a/b', label: '斜线' },
    { id: 'series:a:b', label: '冒号' },
  ]);
  controller.open();

  const slash = overlayRoot.querySelector<HTMLElement>('[data-select-option="series:a/b"]');
  const colon = overlayRoot.querySelector<HTMLElement>('[data-select-option="series:a:b"]');
  assert.ok(slash);
  assert.ok(colon);
  assert.notEqual(slash.id, colon.id);
});

test('destroy removes owned ARIA relationships and prevents trigger clicks from reopening', async () => {
  const window = new Window();
  const { document } = window;
  const trigger = document.createElement('button');
  const overlayRoot = document.createElement('div');
  document.body.append(trigger, overlayRoot);
  const controller = createUiSelectPopover({
    trigger,
    overlayRoot,
    id: 'destroyed-select',
    options: [{ id: 'one', label: '一' }],
    selectedId: 'one',
  });
  controller.open();

  controller.destroy();
  trigger.click();

  assert.equal(overlayRoot.querySelector('[role="listbox"]') === null, true);
  assert.equal(trigger.getAttribute('aria-haspopup'), null);
  assert.equal(trigger.getAttribute('aria-expanded'), null);
  assert.equal(trigger.getAttribute('aria-controls'), null);
  await window.happyDOM.close();
});
