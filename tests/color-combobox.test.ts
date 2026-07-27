import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createColorCombobox } from '../src/features/ui-select/colorCombobox';

interface TestCleanup {
  after(callback: () => void | Promise<void>): void;
}

function setupCombobox(t: TestCleanup) {
  const window = new Window();
  const host = window.document.createElement('div');
  const sentinel = window.document.createElement('p');
  sentinel.dataset.hostSentinel = '';
  host.append(sentinel);
  window.document.body.append(host);
  const selected: string[] = [];
  const controller = createColorCombobox({
    host,
    id: 'palette-colors',
    options: [
      { id: 'mard:A14', label: '亮蓝色', meta: 'A14' },
      { id: 'mard:A01', label: '白色', meta: 'A01' },
      { id: 'mard:D21', label: '咖啡色', meta: 'D21' },
      { id: 'mard:Z99', label: '暂不可用', meta: 'Z99', disabled: true },
    ],
    onChange: (id) => selected.push(id),
  });
  t.after(async () => {
    controller.destroy();
    await window.happyDOM.close();
  });
  return { window, host, sentinel, controller, selected };
}

test('the color input exposes a complete ARIA combobox relationship and result announcement', (t) => {
  const { controller } = setupCombobox(t);

  assert.equal(controller.input.getAttribute('role'), 'combobox');
  assert.equal(controller.input.getAttribute('aria-autocomplete'), 'list');
  assert.equal(controller.input.getAttribute('aria-controls'), 'palette-colors-listbox');
  assert.equal(controller.input.getAttribute('aria-describedby'), 'palette-colors-status');
  assert.equal(controller.listbox.getAttribute('role'), 'listbox');
  assert.equal(controller.status.getAttribute('aria-live'), 'polite');
  assert.equal(controller.status.textContent, '找到 4 种颜色');
  for (const option of controller.listbox.querySelectorAll('[role="option"]')) {
    assert.equal(option.getAttribute('tabindex'), '-1');
  }
});

test('keyboard navigation selects the active filtered color rather than an unfiltered option', (t) => {
  const { controller, window, selected } = setupCombobox(t);
  controller.input.value = '白';
  controller.input.dispatchEvent(new window.Event('input', { bubbles: true }));
  controller.input.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
  );
  controller.input.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );

  assert.equal(
    controller.input.getAttribute('aria-activedescendant'),
    controller.listbox.querySelector('[data-color-option="mard:A01"]')?.id,
  );
  assert.deepEqual(selected, ['mard:A01']);
});

test('composition prevents enter from committing until composition ends', (t) => {
  const { controller, window, selected } = setupCombobox(t);
  controller.input.value = '白';
  controller.input.dispatchEvent(new window.Event('input', { bubbles: true }));
  controller.input.dispatchEvent(
    new window.CompositionEvent('compositionstart', { bubbles: true }),
  );
  controller.input.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  assert.deepEqual(selected, []);

  controller.input.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true }));
  controller.input.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  assert.deepEqual(selected, ['mard:A01']);
});

test('composition leaves arrow and boundary keys to the input method', (t) => {
  const { controller, window } = setupCombobox(t);
  const initialActive = controller.input.getAttribute('aria-activedescendant');
  controller.input.dispatchEvent(
    new window.CompositionEvent('compositionstart', { bubbles: true }),
  );

  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
    const event = new window.KeyboardEvent('keydown', { key, bubbles: true });
    controller.input.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(controller.input.getAttribute('aria-activedescendant'), initialActive);
  }
});

test('a query without colors announces an actionable empty result', (t) => {
  const { controller, window } = setupCombobox(t);
  controller.input.value = '不存在';
  controller.input.dispatchEvent(new window.Event('input', { bubbles: true }));

  assert.equal(controller.status.textContent, '没有符合条件的颜色');
  assert.equal(controller.listbox.querySelectorAll('[role="option"]').length, 0);
  assert.equal(controller.input.getAttribute('aria-activedescendant'), null);
});

test('disabled search results remain understandable but cannot become active or selected', (t) => {
  const { controller, window, selected } = setupCombobox(t);
  controller.input.value = 'Z99';
  controller.input.dispatchEvent(new window.Event('input', { bubbles: true }));
  controller.input.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );

  const disabled = controller.listbox.querySelector<HTMLElement>('[data-color-option="mard:Z99"]');
  assert.ok(disabled);
  assert.equal(disabled.getAttribute('aria-disabled'), 'true');
  assert.equal(controller.input.getAttribute('aria-activedescendant'), null);
  assert.deepEqual(selected, []);
});

test('external value and option updates retain the combobox nodes and matching option nodes', (t) => {
  const { controller } = setupCombobox(t);
  const input = controller.input;
  const listbox = controller.listbox;
  const retained = listbox.querySelector('[data-color-option="mard:A01"]');
  assert.ok(retained);

  controller.setOptions?.([
    { id: 'mard:A01', label: '纯白', meta: 'A01' },
    { id: 'mard:B02', label: '浅灰', meta: 'B02' },
  ]);
  controller.setValue?.('mard:B02');

  assert.equal(controller.input === input, true);
  assert.equal(controller.listbox === listbox, true);
  assert.equal(listbox.querySelector('[data-color-option="mard:A01"]') === retained, true);
  assert.equal(retained.textContent, 'A01 纯白');
  assert.equal(listbox.querySelectorAll('[role="option"]').length, 2);
  assert.equal(
    listbox.querySelector('[data-color-option="mard:B02"]')?.getAttribute('aria-selected'),
    'true',
  );
});

test('setValue keeps the active option inside the current filtered results', (t) => {
  const { controller, window, selected } = setupCombobox(t);
  controller.input.value = '白';
  controller.input.dispatchEvent(new window.Event('input', { bubbles: true }));

  controller.setValue('mard:D21');

  assert.equal(
    controller.input.getAttribute('aria-activedescendant'),
    controller.listbox.querySelector('[data-color-option="mard:A01"]')?.id,
  );
  controller.input.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  assert.equal(controller.selectedId(), 'mard:A01');
  assert.deepEqual(selected, ['mard:A01']);
});

test('DOM option ids stay unique for ids that differ only by punctuation', async () => {
  const window = new Window();
  const host = window.document.createElement('div');
  window.document.body.append(host);
  const controller = createColorCombobox({
    host,
    id: 'punctuation-colors',
    options: [
      { id: 'series:a/b', label: '斜线' },
      { id: 'series:a:b', label: '冒号' },
    ],
  });

  const slash = controller.listbox.querySelector<HTMLElement>('[data-color-option="series:a/b"]');
  const colon = controller.listbox.querySelector<HTMLElement>('[data-color-option="series:a:b"]');
  assert.ok(slash);
  assert.ok(colon);
  assert.notEqual(slash.id, colon.id);

  controller.destroy();
  await window.happyDOM.close();
});

test('destroy removes only owned combobox nodes and leaves existing host content intact', (t) => {
  const { host, sentinel, controller } = setupCombobox(t);

  controller.destroy();

  assert.equal(host.contains(sentinel), true);
  assert.equal(host.querySelector('[role="combobox"]') === null, true);
});
