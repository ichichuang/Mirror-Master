import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createMobilePicker } from '../src/features/ui-select/uiSelect';

interface TestCleanup {
  after(callback: () => void | Promise<void>): void;
}

function setupPicker(t: TestCleanup) {
  const window = new Window();
  const { document } = window;
  const visualViewport = new window.EventTarget();
  Object.defineProperties(visualViewport, {
    width: { value: 390 },
    height: { value: 700 },
    offsetLeft: { value: 0 },
    offsetTop: { value: 0 },
  });
  Object.defineProperty(window, 'visualViewport', { value: visualViewport });
  const sheet = document.createElement('section');
  const handle = document.createElement('button');
  const tabs = document.createElement('div');
  const panel = document.createElement('div');
  const primary = document.createElement('div');
  const trigger = document.createElement('button');
  sheet.dataset.workspaceSheet = '';
  handle.textContent = '展开';
  tabs.textContent = '标签';
  panel.textContent = '材料';
  primary.textContent = '完成';
  trigger.textContent = '选择色板';
  sheet.append(handle, tabs, panel, primary);
  document.body.append(trigger, sheet);
  const selected: string[] = [];
  const picker = createMobilePicker({
    sheet,
    panel,
    trigger,
    title: '选择色板',
    options: [
      { id: 'default', label: '默认色板' },
      { id: 'mard', label: 'MARD 色板' },
    ],
    selectedId: 'default',
    onChange: (id) => selected.push(id),
  });
  t.after(async () => {
    picker.destroy();
    await window.happyDOM.close();
  });
  return {
    window,
    visualViewport,
    document,
    sheet,
    handle,
    tabs,
    panel,
    primary,
    trigger,
    picker,
    selected,
  };
}

test('the trigger replaces every original sheet surface element without opening a second surface', (t) => {
  const { sheet, handle, tabs, panel, primary, trigger, document } = setupPicker(t);
  trigger.click();

  assert.equal(document.querySelectorAll('[data-workspace-sheet]').length, 1);
  assert.equal(document.querySelectorAll('[aria-modal="true"]').length, 0);
  const picker = sheet.querySelector<HTMLElement>('[data-mobile-picker]');
  assert.equal(sheet.contains(panel), true);
  for (const element of [handle, tabs, panel, primary]) {
    assert.equal(element.hidden, true);
    assert.equal(element.inert, true);
  }
  assert.equal(picker?.getAttribute('role'), 'group');
  assert.equal([...sheet.children].filter((element) => !(element as HTMLElement).hidden).length, 1);
});

test('the mobile picker exposes searchable listbox status and a visible confirmation action', (t) => {
  const { picker, sheet } = setupPicker(t);
  picker.open();

  const input = sheet.querySelector<HTMLInputElement>('[data-mobile-picker-search]');
  const listbox = sheet.querySelector<HTMLElement>('[role="listbox"]');
  const status = sheet.querySelector<HTMLElement>('[role="status"]');
  const confirm = sheet.querySelector<HTMLButtonElement>('[data-mobile-picker-confirm]');
  assert.ok(input);
  assert.ok(listbox);
  assert.ok(status);
  assert.ok(confirm);
  assert.equal(input.getAttribute('role'), 'combobox');
  assert.equal(input.getAttribute('aria-controls'), listbox.id);
  assert.equal(status.textContent, '找到 2 个选项');
  assert.equal(confirm.textContent, '确认选择');
  for (const option of listbox.querySelectorAll('[role="option"]')) {
    assert.equal(option.getAttribute('tabindex'), '-1');
  }
});

test('cancel restores every original sheet element, original value, and trigger focus', (t) => {
  const { handle, tabs, panel, primary, trigger, picker, selected, sheet, window } = setupPicker(t);
  picker.open();
  const mard = sheet.querySelector<HTMLButtonElement>('[data-mobile-picker-option="mard"]');
  assert.ok(mard);
  mard.click();
  sheet.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  picker.cancel();

  assert.equal(panel.hidden, false);
  for (const element of [handle, tabs, panel, primary]) {
    assert.equal(element.hidden, false);
    assert.equal(element.inert, false);
  }
  assert.deepEqual(selected, []);
  assert.equal(picker.selectedId?.(), 'default');
  assert.equal(trigger.ownerDocument.activeElement === trigger, true);
});

test('pointer selection stays temporary until confirmation and then restores the original panel', (t) => {
  const { picker, panel, selected, sheet } = setupPicker(t);
  picker.open();
  const option = sheet.querySelector<HTMLButtonElement>('[data-mobile-picker-option="mard"]');
  assert.ok(option);
  option.click();
  assert.deepEqual(selected, []);
  assert.equal(option.getAttribute('data-active'), 'true');

  const confirm = sheet.querySelector<HTMLButtonElement>('[data-mobile-picker-confirm]');
  assert.ok(confirm);
  confirm.click();

  assert.deepEqual(selected, ['mard']);
  assert.equal(panel.hidden, false);
  assert.equal(sheet.querySelector('[data-mobile-picker]') === null, true);
});

test('keyboard filtering and navigation commit the active visible option', (t) => {
  const { picker, sheet, selected, window } = setupPicker(t);
  picker.open();
  const input = sheet.querySelector<HTMLInputElement>('[data-mobile-picker-search]');
  assert.ok(input);
  input.value = 'MARD';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  assert.deepEqual(selected, ['mard']);
  assert.equal(sheet.querySelector('[data-mobile-picker]') === null, true);
});

test('composition prevents enter from committing a mobile search result', (t) => {
  const { picker, sheet, selected, window } = setupPicker(t);
  picker.open();
  const input = sheet.querySelector<HTMLInputElement>('[data-mobile-picker-search]');
  assert.ok(input);
  input.value = 'MARD';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  input.dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true }));
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.deepEqual(selected, []);

  input.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true }));
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.deepEqual(selected, ['mard']);
});

test('composition leaves arrow and boundary keys to the mobile input method', (t) => {
  const { picker, sheet, window } = setupPicker(t);
  picker.open();
  const input = sheet.querySelector<HTMLInputElement>('[data-mobile-picker-search]');
  assert.ok(input);
  const initialActive = input.getAttribute('aria-activedescendant');
  input.dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true }));

  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
    const event = new window.KeyboardEvent('keydown', { key, bubbles: true });
    input.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(input.getAttribute('aria-activedescendant'), initialActive);
  }
});

test('focus remains inside the picker when an outside control receives focus', (t) => {
  const { picker, sheet, window, document } = setupPicker(t);
  const outside = document.createElement('button');
  document.body.append(outside);
  picker.open();
  const input = sheet.querySelector<HTMLInputElement>('[data-mobile-picker-search]');
  assert.ok(input);

  outside.focus();
  outside.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));

  assert.equal(document.activeElement === input, true);
});

test('viewport changes scroll only the obscured priority target and constrain picker height', (t) => {
  const { picker, sheet, window, visualViewport, document } = setupPicker(t);
  picker.open();
  const cancel = sheet.querySelector<HTMLButtonElement>('[data-mobile-picker-cancel]');
  const input = sheet.querySelector<HTMLInputElement>('[data-mobile-picker-search]');
  const active = sheet.querySelector<HTMLElement>('[data-active="true"]');
  const confirm = sheet.querySelector<HTMLButtonElement>('[data-mobile-picker-confirm]');
  assert.ok(cancel);
  assert.ok(input);
  assert.ok(active);
  assert.ok(confirm);
  let inputScrolls = 0;
  let activeScrolls = 0;
  let confirmScrolls = 0;
  input.getBoundingClientRect = () =>
    ({ top: 80, bottom: 124, left: 0, right: 200, width: 200, height: 44 }) as DOMRect;
  active.getBoundingClientRect = () =>
    ({ top: 140, bottom: 184, left: 0, right: 200, width: 200, height: 44 }) as DOMRect;
  confirm.getBoundingClientRect = () =>
    ({ top: 720, bottom: 764, left: 0, right: 200, width: 200, height: 44 }) as DOMRect;
  input.scrollIntoView = () => {
    inputScrolls += 1;
  };
  active.scrollIntoView = () => {
    activeScrolls += 1;
  };
  confirm.scrollIntoView = () => {
    confirmScrolls += 1;
  };
  cancel.focus();
  cancel.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  assert.equal(document.activeElement === input, true);

  visualViewport.dispatchEvent(new window.Event('resize'));
  assert.deepEqual(
    { inputScrolls, activeScrolls, confirmScrolls },
    { inputScrolls: 0, activeScrolls: 0, confirmScrolls: 1 },
  );
  assert.equal(sheet.querySelector<HTMLElement>('[data-mobile-picker]')?.style.maxHeight, '700px');
});

test('external option and value updates keep the active picker surface and retained option nodes', (t) => {
  const { picker, sheet } = setupPicker(t);
  picker.open();
  const root = sheet.querySelector('[data-mobile-picker]');
  const listbox = sheet.querySelector('[role="listbox"]');
  const retainedDefault = sheet.querySelector('[data-mobile-picker-option="default"]');
  assert.ok(root);
  assert.ok(listbox);
  assert.ok(retainedDefault);

  picker.setOptions?.([
    { id: 'default', label: '默认色板（39 色）' },
    { id: 'mard', label: 'MARD 色板（221 色）', disabled: true },
    { id: 'studio', label: '工作室色板' },
  ]);
  picker.setValue?.('studio');

  assert.equal(sheet.querySelector('[data-mobile-picker]') === root, true);
  assert.equal(sheet.querySelector('[role="listbox"]') === listbox, true);
  assert.equal(
    sheet.querySelector('[data-mobile-picker-option="default"]') === retainedDefault,
    true,
  );
  assert.equal(retainedDefault.textContent, '默认色板（39 色）');
  assert.equal(picker.selectedId?.(), 'studio');
  assert.equal(
    sheet.querySelector('[data-mobile-picker-option="studio"]')?.getAttribute('aria-selected'),
    'true',
  );
});

test('setValue keeps the active mobile option inside the current filtered results', (t) => {
  const { picker, sheet, selected, window } = setupPicker(t);
  picker.open();
  const input = sheet.querySelector<HTMLInputElement>('[data-mobile-picker-search]');
  assert.ok(input);
  input.value = 'MARD';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));

  picker.setValue('default');

  assert.equal(
    input.getAttribute('aria-activedescendant'),
    sheet.querySelector('[data-mobile-picker-option="mard"]')?.id,
  );
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.deepEqual(selected, ['mard']);
});

test('destroying a never-opened picker does not overwrite later panel visibility', (t) => {
  const { picker, panel } = setupPicker(t);
  panel.hidden = true;

  picker.destroy();

  assert.equal(panel.hidden, true);
});
