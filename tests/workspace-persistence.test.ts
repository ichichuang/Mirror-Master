import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createKeyedListRenderer } from '../src/features/workspace-panels/keyedList';
import {
  createWorkspacePanels,
  moveFocusBeforeHiding,
  type WorkspacePanelsView,
} from '../src/features/workspace-panels/workspacePanels';

const mainSource = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

interface Row {
  readonly id: string;
  readonly label: string;
}

test('keyed updates preserve retained nodes, focus, input selection, and scroll position', async () => {
  const window = new Window();
  const { document } = window;
  const list = document.createElement('div');
  list.tabIndex = -1;
  list.style.overflow = 'auto';
  document.body.append(list);
  const renderer = createKeyedListRenderer<Row>({
    container: list,
    keyOf: (row) => row.id,
    create(row) {
      const element = document.createElement('label');
      const input = document.createElement('input');
      const text = document.createElement('span');
      input.dataset.rowInput = row.id;
      text.dataset.rowLabel = '';
      element.append(input, text);
      return element;
    },
    update(element, row) {
      const label = element.querySelector<HTMLElement>('[data-row-label]');
      if (label && label.textContent !== row.label) label.textContent = row.label;
    },
    focusFallback: list,
  });
  renderer.update([
    { id: 'a', label: '甲' },
    { id: 'b', label: '乙' },
    { id: 'c', label: '丙' },
  ]);
  const retainedRow = renderer.nodeFor('b');
  const retainedInput = retainedRow?.querySelector<HTMLInputElement>('[data-row-input="b"]');
  assert.ok(retainedRow);
  assert.ok(retainedInput);
  retainedInput.value = '手动输入';
  retainedInput.focus();
  retainedInput.setSelectionRange(2, 3);
  list.scrollTop = 87;

  renderer.update([
    { id: 'c', label: '丙更新' },
    { id: 'b', label: '乙更新' },
    { id: 'd', label: '丁' },
  ]);

  assert.equal(renderer.nodeFor('b') === retainedRow, true);
  assert.equal(document.activeElement === retainedInput, true);
  assert.equal(retainedInput.value, '手动输入');
  assert.equal(retainedInput.selectionStart, 2);
  assert.equal(retainedInput.selectionEnd, 3);
  assert.equal(list.scrollTop, 87);
  assert.deepEqual(renderer.keys(), ['c', 'b', 'd']);

  renderer.destroy();
  await window.happyDOM.close();
});

test('removing the focused row moves focus to the nearest retained equivalent control', async () => {
  const window = new Window();
  const { document } = window;
  const heading = document.createElement('h2');
  heading.tabIndex = -1;
  const list = document.createElement('div');
  document.body.append(heading, list);
  const renderer = createKeyedListRenderer<Row>({
    container: list,
    keyOf: (row) => row.id,
    create(row) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.rowButton = row.id;
      return button;
    },
    update(element, row) {
      element.textContent = row.label;
    },
    focusFallback: heading,
  });
  renderer.update([
    { id: 'a', label: '甲' },
    { id: 'b', label: '乙' },
    { id: 'c', label: '丙' },
  ]);
  renderer.nodeFor('b')?.focus();

  renderer.update([
    { id: 'a', label: '甲' },
    { id: 'c', label: '丙' },
  ]);

  assert.equal(document.activeElement === renderer.nodeFor('c'), true);
  renderer.update([]);
  assert.equal(document.activeElement === heading, true);

  renderer.destroy();
  await window.happyDOM.close();
});

test('duplicate or empty keys are rejected before mutating the current list', async () => {
  const window = new Window();
  const list = window.document.createElement('div');
  window.document.body.append(list);
  const renderer = createKeyedListRenderer<Row>({
    container: list,
    keyOf: (row) => row.id,
    create: () => window.document.createElement('div'),
    update() {},
  });
  renderer.update([{ id: 'a', label: '甲' }]);
  const retained = renderer.nodeFor('a');

  assert.throws(
    () =>
      renderer.update([
        { id: 'a', label: '甲' },
        { id: 'a', label: '重复' },
      ]),
    /稳定键/u,
  );
  assert.throws(() => renderer.update([{ id: '', label: '空' }]), /稳定键/u);
  assert.equal(renderer.nodeFor('a') === retained, true);

  renderer.destroy();
  await window.happyDOM.close();
});

function panelView(overrides: Partial<WorkspacePanelsView> = {}): WorkspacePanelsView {
  return {
    activePanel: 'tools',
    activeTool: 'paint',
    activeToolLabel: '画笔',
    selectionActive: false,
    selectedColor: {
      id: 'mard:A1',
      label: 'MARD A1',
      name: '白色',
      displayHex: '#F2F0E8',
    },
    paletteColors: [
      {
        id: 'mard:A1',
        paletteLabel: 'MARD',
        series: 'A',
        code: 'A1',
        name: '白色',
        displayHex: '#F2F0E8',
      },
      {
        id: 'mard:B2',
        paletteLabel: 'MARD',
        series: 'B',
        code: 'B2',
        name: '黑色',
        displayHex: '#222222',
      },
    ],
    materials: [
      {
        id: 'mard:A1',
        paletteLabel: 'MARD',
        code: 'A1',
        name: '白色',
        displayHex: '#F2F0E8',
        count: 12,
      },
    ],
    materialHeading: '12 颗 · 1 色',
    trustPrimary: '总格数 48 · 实际用豆 12 · 空白 36 · 1 种颜色',
    trustVerification: '图纸统计校验通过',
    materialSize: '4.0 × 3.0 cm',
    materialBoards: '1 块',
    materialBlanks: '2 格',
    settingsHeading: '8 列 × 6 行',
    settingsPalette: 'MARD',
    settingsMaximum: '24',
    settingsSampling: '平均取色',
    settingsDithering: '干净色块',
    settingsSize: '4.0 × 3.0 cm',
    ...overrides,
  };
}

test('workspace panel updates retain every panel and keyed palette/material node without innerHTML', async () => {
  const window = new Window();
  const { document } = window;
  const root = document.createElement('div');
  root.tabIndex = 0;
  document.body.append(root);
  const controller = createWorkspacePanels(root);
  controller.update(panelView({ activePanel: 'palette' }));
  const toolsPanel = controller.panelFor('tools');
  const palettePanel = controller.panelFor('palette');
  const materialPanel = controller.panelFor('materials');
  const settingsPanel = controller.panelFor('settings');
  const colorNode = controller.colorNodeFor('mard:A1');
  const materialNode = controller.materialNodeFor('mard:A1');
  const trustSummary = materialPanel.querySelector<HTMLElement>('[data-workspace-trust-summary]');
  const trustVerification = materialPanel.querySelector<HTMLElement>(
    '[data-workspace-trust-verification]',
  );
  assert.ok(colorNode);
  assert.ok(materialNode);
  assert.ok(trustSummary);
  assert.ok(trustVerification);
  assert.match(settingsPanel.textContent ?? '', /水平翻转图案/u);
  assert.match(settingsPanel.textContent ?? '', /垂直翻转图案/u);
  colorNode.focus();
  const paletteGrid = palettePanel.querySelector<HTMLElement>('[data-workspace-palette-list]');
  assert.ok(paletteGrid);
  paletteGrid.scrollTop = 55;

  Object.defineProperty(root, 'innerHTML', {
    configurable: true,
    set() {
      throw new Error('runtime innerHTML is forbidden');
    },
  });
  controller.update(
    panelView({
      activePanel: 'palette',
      activeTool: 'erase',
      activeToolLabel: '橡皮',
      paletteColors: [
        {
          id: 'mard:A1',
          paletteLabel: 'MARD',
          series: 'A',
          code: 'A1',
          name: '暖白',
          displayHex: '#F3EFE4',
        },
        {
          id: 'mard:C3',
          paletteLabel: 'MARD',
          series: 'C',
          code: 'C3',
          name: '红色',
          displayHex: '#CC3322',
        },
      ],
      materials: [
        {
          id: 'mard:A1',
          paletteLabel: 'MARD',
          code: 'A1',
          name: '暖白',
          displayHex: '#F3EFE4',
          count: 13,
        },
      ],
      trustPrimary: '总格数 48 · 实际用豆 13 · 空白 35 · 1 种颜色',
    }),
  );

  assert.equal(controller.panelFor('tools') === toolsPanel, true);
  assert.equal(controller.panelFor('palette') === palettePanel, true);
  assert.equal(controller.panelFor('materials') === materialPanel, true);
  assert.equal(controller.panelFor('settings') === settingsPanel, true);
  assert.equal(controller.colorNodeFor('mard:A1') === colorNode, true);
  assert.equal(controller.materialNodeFor('mard:A1') === materialNode, true);
  assert.equal(
    materialPanel.querySelector('[data-workspace-trust-summary]') === trustSummary,
    true,
  );
  assert.equal(trustSummary.textContent, '总格数 48 · 实际用豆 13 · 空白 35 · 1 种颜色');
  assert.equal(trustVerification.textContent, '图纸统计校验通过');
  assert.equal(document.activeElement === colorNode, true);
  assert.equal(paletteGrid.scrollTop, 55);
  assert.equal(colorNode.textContent?.includes('暖白'), true);
  assert.equal(materialNode.textContent?.includes('13 颗'), true);
  assert.equal(toolsPanel.hidden, true);
  assert.equal(palettePanel.hidden, false);

  controller.destroy();
  await window.happyDOM.close();
});

test('workspace panel active state changes never recreate project-level collections', async () => {
  const window = new Window();
  const root = window.document.createElement('div');
  window.document.body.append(root);
  const controller = createWorkspacePanels(root);
  controller.update(panelView());
  const color = controller.colorNodeFor('mard:B2');
  const material = controller.materialNodeFor('mard:A1');
  assert.ok(color);
  assert.ok(material);

  for (const activePanel of ['materials', 'settings', 'tools', 'palette'] as const) {
    controller.setActivePanel(activePanel);
  }

  assert.equal(controller.colorNodeFor('mard:B2') === color, true);
  assert.equal(controller.materialNodeFor('mard:A1') === material, true);
  controller.destroy();
  await window.happyDOM.close();
});

test('switching panels moves focus out of the panel before it becomes hidden', async (context) => {
  const window = new Window();
  context.after(async () => {
    await window.happyDOM.close();
  });
  const { document } = window;
  const root = document.createElement('div');
  document.body.append(root);
  const controller = createWorkspacePanels(root);
  controller.update(panelView());
  const toolsPanel = controller.panelFor('tools');
  const palettePanel = controller.panelFor('palette');
  const changeColor = toolsPanel.querySelector<HTMLButtonElement>('[data-panel-tab="palette"]');
  assert.ok(changeColor);
  changeColor.focus();
  assert.strictEqual(document.activeElement, changeColor);

  controller.setActivePanel('palette');

  assert.strictEqual(document.activeElement, palettePanel);
  assert.equal(toolsPanel.hidden, true);
  assert.equal(palettePanel.hidden, false);
  controller.destroy();
});

test('inactive workspace panels are inert without redundant aria-hidden state', async (context) => {
  const window = new Window();
  context.after(async () => {
    await window.happyDOM.close();
  });
  const root = window.document.createElement('div');
  window.document.body.append(root);
  const controller = createWorkspacePanels(root);
  controller.update(panelView({ activePanel: 'palette' }));
  const toolsPanel = controller.panelFor('tools');
  const palettePanel = controller.panelFor('palette');

  assert.equal(toolsPanel.hasAttribute('inert'), true);
  assert.equal(toolsPanel.hasAttribute('aria-hidden'), false);
  assert.equal(palettePanel.hasAttribute('inert'), false);
  assert.equal(palettePanel.hasAttribute('aria-hidden'), false);

  controller.destroy();
});

test('focus handoff moves focus before a container is hidden by responsive state', async (context) => {
  const window = new Window();
  context.after(async () => {
    await window.happyDOM.close();
  });
  const collapsible = window.document.createElement('div');
  const focusedButton = window.document.createElement('button');
  const fallback = window.document.createElement('button');
  collapsible.append(focusedButton);
  window.document.body.append(collapsible, fallback);
  focusedButton.focus();

  assert.equal(moveFocusBeforeHiding([collapsible], fallback), true);
  collapsible.hidden = true;
  assert.strictEqual(window.document.activeElement, fallback);
  assert.equal(moveFocusBeforeHiding([collapsible], fallback), false);
});

test('main mounts the persistent workspace after the one-time app shell without runtime innerHTML', () => {
  const shellMount = 'app.innerHTML = renderApp();';
  const shellMountIndex = mainSource.indexOf(shellMount);
  assert.notEqual(shellMountIndex, -1);
  const runtimeSource = mainSource.slice(shellMountIndex + shellMount.length);

  assert.match(runtimeSource, /createWorkspacePanels/u);
  assert.match(runtimeSource, /createResponsiveWorkspaceMount/u);
  assert.match(runtimeSource, /captureWorkspaceSurfaceFocus/u);
  assert.match(runtimeSource, /restoreWorkspaceSurfaceFocus/u);
  assert.doesNotMatch(runtimeSource, /\.innerHTML\s*=/u);
  assert.doesNotMatch(runtimeSource, /function panelMarkup/u);
  assert.doesNotMatch(runtimeSource, /renderedInspectorPanel/u);
});
