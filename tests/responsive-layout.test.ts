import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import {
  createResponsiveWorkspaceMount,
  resolveWorkspaceLayout,
} from '../src/features/workspace-layout/layout';

test('layout breakpoints expose one compact sheet, one tablet panel, or the desktop inspector', () => {
  assert.deepEqual(resolveWorkspaceLayout(320), {
    mode: 'compact',
    attachSheet: true,
    attachInspector: false,
    toolRailWidth: 0,
    inspectorWidth: 0,
    canvasWidth: 320,
  });
  assert.equal(resolveWorkspaceLayout(767).mode, 'compact');
  assert.equal(resolveWorkspaceLayout(768).mode, 'tablet');
  assert.equal(resolveWorkspaceLayout(1023).mode, 'tablet');

  const desktop = resolveWorkspaceLayout(1024);
  assert.equal(desktop.mode, 'desktop');
  assert.equal(desktop.attachSheet, false);
  assert.equal(desktop.attachInspector, true);
  assert.ok(desktop.toolRailWidth >= 56 && desktop.toolRailWidth <= 64);
  assert.ok(desktop.inspectorWidth >= 304 && desktop.inspectorWidth <= 344);
  assert.ok(desktop.canvasWidth >= 1024 * 0.55);

  const wide = resolveWorkspaceLayout(1440);
  assert.ok(wide.canvasWidth >= 1440 * 0.55);
});

test('invalid and very narrow viewport widths fail closed without negative geometry', () => {
  assert.throws(() => resolveWorkspaceLayout(Number.NaN), /视口宽度/u);
  assert.throws(() => resolveWorkspaceLayout(0), /视口宽度/u);
  const narrow = resolveWorkspaceLayout(240);
  assert.equal(narrow.canvasWidth, 240);
  assert.equal(narrow.toolRailWidth, 0);
  assert.equal(narrow.inspectorWidth, 0);
});

test('breakpoint changes detach and reattach the same sheet and inspector nodes', async () => {
  const window = new Window();
  const { document } = window;
  const root = document.createElement('main');
  const canvas = document.createElement('div');
  const inspector = document.createElement('aside');
  const sheet = document.createElement('section');
  inspector.dataset.workspaceInspector = '';
  sheet.dataset.workspaceSheet = '';
  root.append(canvas, inspector, sheet);
  document.body.append(root);
  const controller = createResponsiveWorkspaceMount({ root, inspector, sheet });

  controller.update(390);
  assert.equal(root.contains(sheet), true);
  assert.equal(root.contains(inspector), false);
  const retainedSheet = sheet;

  controller.update(1440);
  assert.equal(root.contains(sheet), false);
  assert.equal(root.contains(inspector), true);
  assert.equal(inspector === controller.inspector, true);

  controller.update(768);
  assert.equal(root.contains(sheet), true);
  assert.equal(sheet === retainedSheet, true);
  assert.equal(root.querySelectorAll('[data-workspace-sheet]').length, 1);

  controller.destroy();
  assert.equal(root.contains(sheet), true);
  assert.equal(root.contains(inspector), true);
  await window.happyDOM.close();
});

test('same-mode layout updates preserve focused inspector controls and scroll state', async () => {
  const window = new Window();
  const { document } = window;
  const root = document.createElement('main');
  const canvas = document.createElement('div');
  const inspector = document.createElement('aside');
  const sheet = document.createElement('section');
  const scrollRegion = document.createElement('div');
  const input = document.createElement('input');
  scrollRegion.append(input);
  inspector.append(scrollRegion);
  root.append(canvas, inspector, sheet);
  document.body.append(root);
  const controller = createResponsiveWorkspaceMount({ root, inspector, sheet });

  controller.update(1440);
  scrollRegion.scrollTop = 73;
  input.value = '保留输入';
  input.focus();
  input.setSelectionRange(2, 4);

  controller.update(1280);

  assert.equal(document.activeElement === input, true);
  assert.equal(input.selectionStart, 2);
  assert.equal(input.selectionEnd, 4);
  assert.equal(scrollRegion.scrollTop, 73);
  controller.destroy();
  await window.happyDOM.close();
});
