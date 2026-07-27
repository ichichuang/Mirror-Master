import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import {
  captureWorkspaceSurfaceFocus,
  restoreWorkspaceSurfaceFocus,
} from '../src/features/workspace-layout/layout';

test('panel tab focus crosses from the desktop inspector to the equivalent sheet tab', (t) => {
  const window = new Window();
  t.after(async () => {
    await window.happyDOM.close();
  });
  const { document } = window;
  const inspector = buildSurface(document);
  const sheet = buildSurface(document);
  document.body.append(inspector.root, sheet.root);
  inspector.paletteTab.focus();

  const snapshot = captureWorkspaceSurfaceFocus(inspector.root, document.activeElement, 'palette');
  inspector.root.remove();
  const restored = restoreWorkspaceSurfaceFocus(sheet.root, snapshot);

  assert.equal(restored === sheet.paletteTab, true);
  assert.equal(document.activeElement === sheet.paletteTab, true);
});

test('palette search focus and caret cross from the sheet to the desktop inspector', (t) => {
  const window = new Window();
  t.after(async () => {
    await window.happyDOM.close();
  });
  const { document } = window;
  const inspector = buildSurface(document);
  const sheet = buildSurface(document);
  document.body.append(inspector.root, sheet.root);
  inspector.search.value = 'A14 海蓝';
  sheet.search.value = 'A14 海蓝';
  sheet.search.focus();
  sheet.search.setSelectionRange(2, 6, 'backward');

  const snapshot = captureWorkspaceSurfaceFocus(sheet.root, document.activeElement, 'palette');
  sheet.root.remove();
  const restored = restoreWorkspaceSurfaceFocus(inspector.root, snapshot);

  assert.equal(restored === inspector.search, true);
  assert.equal(document.activeElement === inspector.search, true);
  assert.equal(inspector.search.selectionStart, 2);
  assert.equal(inspector.search.selectionEnd, 6);
  assert.equal(inspector.search.selectionDirection, 'backward');
});

test('tool focus crosses from the desktop inspector to the equivalent sheet tool', (t) => {
  const window = new Window();
  t.after(async () => {
    await window.happyDOM.close();
  });
  const { document } = window;
  const inspector = buildSurface(document);
  const sheet = buildSurface(document);
  document.body.append(inspector.root, sheet.root);
  inspector.paintTool.focus();

  const snapshot = captureWorkspaceSurfaceFocus(inspector.root, document.activeElement, 'tools');
  inspector.root.remove();
  const restored = restoreWorkspaceSurfaceFocus(sheet.root, snapshot);

  assert.equal(restored === sheet.paintTool, true);
  assert.equal(document.activeElement === sheet.paintTool, true);
});

test('series selector focus crosses from the sheet to the desktop inspector', (t) => {
  const window = new Window();
  t.after(async () => {
    await window.happyDOM.close();
  });
  const { document } = window;
  const inspector = buildSurface(document);
  const sheet = buildSurface(document);
  document.body.append(inspector.root, sheet.root);
  sheet.seriesTrigger.focus();

  const snapshot = captureWorkspaceSurfaceFocus(sheet.root, document.activeElement, 'palette');
  sheet.root.remove();
  const restored = restoreWorkspaceSurfaceFocus(inspector.root, snapshot);

  assert.equal(restored === inspector.seriesTrigger, true);
  assert.equal(document.activeElement === inspector.seriesTrigger, true);
});

test('an unmapped inspector control restores to the active sheet panel heading', (t) => {
  const window = new Window();
  t.after(async () => {
    await window.happyDOM.close();
  });
  const { document } = window;
  const inspector = buildSurface(document);
  const sheet = buildSurface(document);
  document.body.append(inspector.root, sheet.root);
  inspector.unmappedControl.focus();

  const snapshot = captureWorkspaceSurfaceFocus(inspector.root, document.activeElement, 'settings');
  inspector.root.remove();
  const restored = restoreWorkspaceSurfaceFocus(sheet.root, snapshot);

  assert.equal(restored === sheet.settingsHeading, true);
  assert.equal(document.activeElement === sheet.settingsHeading, true);
});

function buildSurface(document: Document): {
  readonly root: HTMLElement;
  readonly paletteTab: HTMLButtonElement;
  readonly search: HTMLInputElement;
  readonly paintTool: HTMLButtonElement;
  readonly seriesTrigger: HTMLButtonElement;
  readonly settingsHeading: HTMLHeadingElement;
  readonly unmappedControl: HTMLButtonElement;
} {
  const root = document.createElement('section');
  const paletteTab = document.createElement('button');
  const search = document.createElement('input');
  const paintTool = document.createElement('button');
  const seriesTrigger = document.createElement('button');
  const settingsPanel = document.createElement('section');
  const settingsHeading = document.createElement('h2');
  const unmappedControl = document.createElement('button');
  paletteTab.type = 'button';
  paletteTab.dataset.panelTab = 'palette';
  paletteTab.setAttribute('role', 'tab');
  search.type = 'search';
  search.dataset.colorSearch = '';
  paintTool.type = 'button';
  paintTool.dataset.tool = 'paint';
  seriesTrigger.type = 'button';
  seriesTrigger.dataset.colorSeriesFilter = '';
  settingsPanel.dataset.workspacePanel = 'settings';
  settingsHeading.tabIndex = -1;
  unmappedControl.type = 'button';
  unmappedControl.dataset.unmappedControl = '';
  settingsPanel.append(settingsHeading, unmappedControl);
  root.append(paletteTab, search, paintTool, seriesTrigger, settingsPanel);
  return {
    root,
    paletteTab,
    search,
    paintTool,
    seriesTrigger,
    settingsHeading,
    unmappedControl,
  };
}
