import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createEditorSheetSelectController } from '../src/features/pattern-editor/editorSheetSelect';
import { createMobileSingleSelectSurface } from '../src/features/ui-select/mobileSingleSelect';
import { createMobileStageHost } from '../src/features/ui-select/mobileStageHost';
import { createShortChoiceController } from '../src/features/ui-select/shortChoice';

test('short choices commit immediately without creating a picker surface', async (t) => {
  const window = new Window();
  const { document } = window;
  const root = document.createElement('fieldset');
  root.innerHTML = `
    <label><input type="radio" name="palette" value="default" data-short-choice-option /></label>
    <label><input type="radio" name="palette" value="mard" data-short-choice-option /></label>
  `;
  document.body.append(root);
  const changes: string[] = [];
  const controller = createShortChoiceController({
    root,
    options: [
      { id: 'default', label: '默认色板' },
      { id: 'mard', label: 'MARD 色板' },
    ],
    selectedId: 'default',
    onChange: (selectedId) => changes.push(selectedId),
  });
  t.after(async () => {
    controller.destroy();
    await window.happyDOM.close();
  });

  const mard = root.querySelector<HTMLInputElement>('input[value="mard"]');
  assert.ok(mard);
  mard.checked = true;
  mard.dispatchEvent(new window.Event('change', { bubbles: true }));

  assert.deepEqual(changes, ['mard']);
  assert.equal(root.dataset.value, 'mard');
  assert.equal(document.querySelector('[role="listbox"]'), null);
  assert.equal(document.querySelector('input[type="search"]'), null);
});

test('mobile single-select hides search for a short list and commits on one tap', async (t) => {
  const window = new Window();
  const { document } = window;
  const selected: string[] = [];
  const surface = createMobileSingleSelectSurface({
    document,
    id: 'palette',
    title: '选择色板',
    options: [
      { id: 'default', label: '默认色板' },
      { id: 'mard', label: 'MARD 色板' },
    ],
    selectedId: 'default',
    onSelect: (selectedId) => selected.push(selectedId),
    onCancel() {},
  });
  document.body.append(surface.element);
  t.after(async () => {
    surface.destroy();
    await window.happyDOM.close();
  });

  const search = surface.element.querySelector<HTMLInputElement>('[data-mobile-selection-search]');
  const mard = surface.element.querySelector<HTMLButtonElement>(
    '[data-mobile-selection-option="mard"]',
  );
  assert.ok(search && mard);
  assert.equal(search.hidden, true);
  assert.equal(surface.element.querySelector('.primary-button'), null);

  mard.click();

  assert.deepEqual(selected, ['mard']);
  assert.equal(surface.selectedId(), 'mard');
});

test('mobile single-select keeps a real listbox and searches genuinely long lists', async (t) => {
  const window = new Window();
  const { document } = window;
  const selected: string[] = [];
  const options = Array.from({ length: 12 }, (_, index) => ({
    id: String(index + 1),
    label: `系列 ${String(index + 1)}`,
  }));
  const surface = createMobileSingleSelectSurface({
    document,
    id: 'series',
    title: '筛选系列',
    options,
    selectedId: '1',
    onSelect: (selectedId) => selected.push(selectedId),
    onCancel() {},
  });
  document.body.append(surface.element);
  t.after(async () => {
    surface.destroy();
    await window.happyDOM.close();
  });

  const search = surface.element.querySelector<HTMLInputElement>('[data-mobile-selection-search]');
  const listbox = surface.element.querySelector<HTMLElement>('[role="listbox"]');
  assert.ok(search && listbox);
  assert.equal(search.hidden, false);
  assert.equal(listbox.querySelectorAll('[role="option"]').length, 12);

  search.value = '系列 12';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));

  assert.equal(listbox.querySelectorAll('[role="option"]').length, 1);
  assert.match(
    surface.element.querySelector<HTMLElement>('[role="status"]')?.textContent ?? '',
    /显示 1 个选项/u,
  );
});

test('application mobile stage is fixed below the header and follows visual viewport changes', async (t) => {
  const window = new Window();
  const { document } = window;
  const visualViewport = new window.EventTarget();
  Object.defineProperties(visualViewport, {
    width: { value: 390, configurable: true },
    height: { value: 700, configurable: true },
    offsetLeft: { value: 0, configurable: true },
    offsetTop: { value: 0, configurable: true },
  });
  Object.defineProperty(window, 'visualViewport', { value: visualViewport });
  const header = document.createElement('header');
  const host = document.createElement('div');
  const surface = document.createElement('section');
  header.getBoundingClientRect = () =>
    ({ top: 0, right: 390, bottom: 56, left: 0, width: 390, height: 56 }) as DOMRect;
  host.hidden = true;
  document.body.append(header, host);
  const controller = createMobileStageHost(host, header);
  t.after(async () => {
    controller.destroy();
    await window.happyDOM.close();
  });

  const lease = controller.mount(surface);

  assert.equal(host.hidden, false);
  assert.equal(host.style.top, '56px');
  assert.equal(host.style.width, '390px');
  assert.equal(host.style.height, '644px');

  Object.defineProperties(visualViewport, {
    height: { value: 420, configurable: true },
    offsetTop: { value: 24, configurable: true },
  });
  visualViewport.dispatchEvent(new window.Event('resize'));
  assert.equal(host.style.top, '56px');
  assert.equal(host.style.height, '388px');

  lease.release();
  assert.equal(host.hidden, true);
});

test('editor selector reuses the existing sheet and restores content, scroll, and focus', async (t) => {
  const window = new Window();
  const { document } = window;
  const sheet = document.createElement('aside');
  const tabs = document.createElement('div');
  const content = document.createElement('div');
  const original = document.createElement('section');
  const primary = document.createElement('div');
  const trigger = document.createElement('button');
  tabs.dataset.tabSurface = '';
  primary.className = 'sheet-primary';
  trigger.textContent = '选择系列';
  original.append(trigger);
  content.append(original);
  sheet.append(tabs, content, primary);
  document.body.append(sheet);
  content.scrollTop = 84;
  const changes: string[] = [];
  const controller = createEditorSheetSelectController({
    sheet,
    content,
    trigger,
    id: 'editor-series',
    title: '筛选颜色系列',
    options: [
      { id: 'all', label: '全部系列' },
      { id: 'a', label: 'A 系列' },
    ],
    selectedId: 'all',
    onChange: (selectedId) => changes.push(selectedId),
  });
  t.after(async () => {
    controller.destroy();
    await window.happyDOM.close();
  });

  trigger.click();
  assert.equal(document.querySelectorAll('aside').length, 1);
  assert.equal(original.hidden, true);
  assert.equal(tabs.hidden, true);
  assert.equal(primary.hidden, true);
  assert.ok(content.querySelector('[data-mobile-single-select]'));

  content.querySelector<HTMLButtonElement>('[data-mobile-selection-option="a"]')?.click();

  assert.deepEqual(changes, ['a']);
  assert.equal(original.hidden, false);
  assert.equal(tabs.hidden, false);
  assert.equal(primary.hidden, false);
  assert.equal(content.scrollTop, 84);
  assert.strictEqual(document.activeElement, trigger);
});
