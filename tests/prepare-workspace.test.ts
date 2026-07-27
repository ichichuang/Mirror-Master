import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { renderApp } from '../src/app';
import {
  createAvailableColorGridRenderer,
  createLatestSourceRequest,
  createNewImagePrepareDefaults,
  createPrepareWorkspaceState,
  hasAvailableColorSelection,
  mountPreparePresetControls,
  reducePrepareWorkspaceState,
  resolveSupportedNewPatternMode,
  syncCropNumericInputValues,
  type PrepareColor,
} from '../src/features/prepare-workspace/prepareWorkspace';
import {
  createAdaptiveSelectController,
  type AdaptiveSelectMediaQuery,
} from '../src/features/prepare-workspace/adaptiveSelect';
import { createAvailableColorMobilePanel } from '../src/features/prepare-workspace/availableColorMobilePanel';

test('mounted customer cards update real prepare controls and live physical size', () => {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = renderApp();
  const prepare = document.querySelector<HTMLElement>('[data-prepare-workspace]');
  assert.ok(prepare);
  const controller = mountPreparePresetControls(prepare, {
    initialState: {
      croppedColumns: 160,
      croppedRows: 90,
      columns: 48,
      rows: 27,
      beadDiameterMm: 5,
      beadPitchMm: 5,
      maximumColors: 24,
      availableColorCount: 221,
      dithering: 'none',
    },
  });
  const customBeadFields = prepare.querySelector<HTMLFieldSetElement>('[data-custom-bead-fields]');
  assert.ok(customBeadFields);
  assert.equal(customBeadFields.hidden, true);
  assert.equal(customBeadFields.disabled, true);

  changeRadio(window, prepare, 'pattern-size-preset', '29');
  assert.equal(prepare.querySelector<HTMLInputElement>('[data-columns]')?.value, '29');
  assert.equal(prepare.querySelector<HTMLInputElement>('[data-rows]')?.value, '16');
  assert.equal(prepare.querySelector('[data-physical-size]')?.textContent, '约 14.5 × 8.0 cm');

  changeRadio(window, prepare, 'bead-size-preset', '2.6');
  assert.equal(customBeadFields.hidden, true);
  assert.equal(customBeadFields.disabled, true);
  assert.equal(prepare.querySelector<HTMLInputElement>('[data-bead-diameter]')?.value, '2.6');
  assert.equal(prepare.querySelector<HTMLInputElement>('[data-bead-pitch]')?.value, '2.6');
  assert.equal(prepare.querySelector('[data-physical-size]')?.textContent, '约 7.5 × 4.2 cm');

  changeRadio(window, prepare, 'color-count-preset', '48');
  assert.equal(prepare.querySelector<HTMLInputElement>('[data-maximum-colors]')?.value, '48');
  changeRadio(window, prepare, 'processing-preset', 'gradient');
  assert.equal(
    prepare.querySelector<HTMLButtonElement>('[data-dithering]')?.dataset.value,
    'floydSteinberg',
  );
  assert.equal(
    prepare.querySelector<HTMLElement>('[data-dithering] [data-select-label]')?.textContent,
    '细腻过渡',
  );
  assert.equal(controller.getState().processingPreset, 'gradient');
  controller.destroy();
  window.close();
});

test('mounted manual controls reverse-sync cards and custom bead size opens the sole expert surface', () => {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = renderApp();
  const prepare = document.querySelector<HTMLElement>('[data-prepare-workspace]');
  assert.ok(prepare);
  const controller = mountPreparePresetControls(prepare, {
    initialState: {
      croppedColumns: 4,
      croppedRows: 3,
      columns: 48,
      rows: 36,
      beadDiameterMm: 5,
      beadPitchMm: 5,
      maximumColors: 24,
      availableColorCount: 39,
      dithering: 'none',
    },
  });
  const columns = prepare.querySelector<HTMLInputElement>('[data-columns]');
  assert.ok(columns);
  columns.value = '49';
  columns.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(
    prepare.querySelector<HTMLInputElement>('input[name="pattern-size-preset"][value="48"]')
      ?.checked,
    false,
  );
  assert.equal(controller.getState().patternSizePreset, 'custom');
  const customPatternState = prepare.querySelector<HTMLElement>('[data-pattern-size-custom]');
  assert.ok(customPatternState);
  assert.equal(customPatternState.hidden, false);
  assert.match(customPatternState.textContent, /自定义[\s\S]*49 × 36 颗/u);

  changeRadio(window, prepare, 'bead-size-preset', 'custom');
  const professional = prepare.querySelector<HTMLDetailsElement>('[data-professional-settings]');
  assert.ok(professional?.open);
  assert.equal(controller.getState().beadSizePreset, 'custom');
  const customBeadFields = prepare.querySelector<HTMLFieldSetElement>('[data-custom-bead-fields]');
  assert.ok(customBeadFields);
  assert.equal(customBeadFields.hidden, false);
  assert.equal(customBeadFields.disabled, false);

  const maximum = prepare.querySelector<HTMLInputElement>('[data-maximum-colors]');
  assert.ok(maximum);
  maximum.value = '12';
  maximum.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(
    prepare.querySelector<HTMLInputElement>('input[name="color-count-preset"][value="12"]')
      ?.checked,
    true,
  );

  controller.setDithering('floydSteinberg');
  assert.equal(
    prepare.querySelector<HTMLInputElement>('input[name="processing-preset"][value="gradient"]')
      ?.checked,
    true,
  );
  controller.destroy();
  window.close();
});

test('pattern cards map the cropped long edge to 29/48/72 and manual dimensions become custom', () => {
  let state = createPrepareWorkspaceState({
    croppedColumns: 160,
    croppedRows: 90,
    columns: 48,
    rows: 27,
    beadDiameterMm: 5,
    beadPitchMm: 5,
    maximumColors: 24,
    availableColorCount: 221,
    dithering: 'none',
  });

  state = reducePrepareWorkspaceState(state, { type: 'selectPatternSize', preset: 29 });
  assert.deepEqual(
    {
      columns: state.columns,
      rows: state.rows,
      preset: state.patternSizePreset,
      physical: state.physicalSizeMm,
    },
    {
      columns: 29,
      rows: 16,
      preset: 29,
      physical: { widthMm: 145, heightMm: 80 },
    },
  );

  state = reducePrepareWorkspaceState(state, {
    type: 'setDimensions',
    columns: 31,
    rows: 17,
  });
  assert.equal(state.patternSizePreset, 'custom');

  state = reducePrepareWorkspaceState(state, { type: 'selectPatternSize', preset: 72 });
  assert.deepEqual(
    { columns: state.columns, rows: state.rows, preset: state.patternSizePreset },
    { columns: 72, rows: 41, preset: 72 },
  );
});

test('crop changes keep a selected pattern preset proportional while custom dimensions stay exact', () => {
  let presetState = createPrepareWorkspaceState({
    croppedColumns: 4,
    croppedRows: 3,
    columns: 48,
    rows: 36,
    beadDiameterMm: 5,
    beadPitchMm: 5,
    maximumColors: 24,
    availableColorCount: 39,
    dithering: 'none',
  });
  presetState = reducePrepareWorkspaceState(presetState, {
    type: 'setCropDimensions',
    croppedColumns: 3,
    croppedRows: 4,
  });
  assert.deepEqual(
    {
      columns: presetState.columns,
      rows: presetState.rows,
      preset: presetState.patternSizePreset,
    },
    { columns: 36, rows: 48, preset: 48 },
  );

  let customState = reducePrepareWorkspaceState(presetState, {
    type: 'setDimensions',
    columns: 37,
    rows: 49,
  });
  customState = reducePrepareWorkspaceState(customState, {
    type: 'setCropDimensions',
    croppedColumns: 16,
    croppedRows: 9,
  });
  assert.deepEqual(
    {
      columns: customState.columns,
      rows: customState.rows,
      preset: customState.patternSizePreset,
    },
    { columns: 37, rows: 49, preset: 'custom' },
  );
});

test('bead-size, color-detail, and processing presets remain two-way synchronized', () => {
  let state = createPrepareWorkspaceState({
    croppedColumns: 1,
    croppedRows: 1,
    columns: 29,
    rows: 29,
    beadDiameterMm: 5,
    beadPitchMm: 5,
    maximumColors: 24,
    availableColorCount: 39,
    dithering: 'none',
  });

  state = reducePrepareWorkspaceState(state, { type: 'selectBeadSize', preset: 2.6 });
  assert.deepEqual(
    {
      beadDiameterMm: state.beadDiameterMm,
      beadPitchMm: state.beadPitchMm,
      preset: state.beadSizePreset,
      physical: state.physicalSizeMm,
    },
    {
      beadDiameterMm: 2.6,
      beadPitchMm: 2.6,
      preset: 2.6,
      physical: { widthMm: 75.4, heightMm: 75.4 },
    },
  );
  state = reducePrepareWorkspaceState(state, {
    type: 'setBeadDimensions',
    beadDiameterMm: 4,
    beadPitchMm: 4.5,
  });
  assert.equal(state.beadSizePreset, 'custom');

  state = reducePrepareWorkspaceState(state, { type: 'selectColorCount', preset: 48 });
  assert.equal(state.maximumColors, 39);
  assert.equal(state.colorCountPreset, 48);
  state = reducePrepareWorkspaceState(state, { type: 'setAvailableColorCount', count: 12 });
  assert.equal(state.maximumColors, 12);
  assert.equal(state.colorCountPreset, 48);
  state = reducePrepareWorkspaceState(state, { type: 'setMaximumColors', maximumColors: 10 });
  assert.equal(state.colorCountPreset, 'custom');

  state = reducePrepareWorkspaceState(state, {
    type: 'selectProcessing',
    preset: 'gradient',
  });
  assert.equal(state.dithering, 'floydSteinberg');
  assert.equal(state.processingPreset, 'gradient');
  state = reducePrepareWorkspaceState(state, { type: 'setDithering', dithering: 'none' });
  assert.equal(state.processingPreset, 'easy');
});

test('clearing every available color is represented as an explicit zero state', () => {
  let state = createPrepareWorkspaceState({
    croppedColumns: 1,
    croppedRows: 1,
    columns: 48,
    rows: 48,
    beadDiameterMm: 5,
    beadPitchMm: 5,
    maximumColors: 24,
    availableColorCount: 39,
    dithering: 'none',
  });
  state = reducePrepareWorkspaceState(state, { type: 'selectColorCount', preset: 48 });
  state = reducePrepareWorkspaceState(state, { type: 'setAvailableColorCount', count: 0 });
  assert.equal(state.availableColorCount, 0);
  assert.equal(state.maximumColors, 0);
  assert.equal(state.colorCountPreset, 48);

  state = reducePrepareWorkspaceState(state, { type: 'setAvailableColorCount', count: 39 });
  assert.equal(state.maximumColors, 39);
  assert.equal(state.colorCountPreset, 48);
});

test('replacement defaults preserve a cleared palette as coherent zero state and block generation', () => {
  const defaults = createNewImagePrepareDefaults({
    croppedColumns: 160,
    croppedRows: 90,
    columns: 48,
    rows: 27,
    availableColorCount: 0,
  });
  assert.equal(defaults.availableColorCount, 0);
  assert.equal(defaults.maximumColors, 0);
  assert.equal(hasAvailableColorSelection(new Set()), false);
  assert.equal(hasAvailableColorSelection(new Set(['mard:A1'])), true);

  const window = new Window();
  const document = window.document;
  document.body.innerHTML = renderApp();
  const prepare = document.querySelector<HTMLElement>('[data-prepare-workspace]');
  assert.ok(prepare);
  const controller = mountPreparePresetControls(prepare, { initialState: defaults });
  const maximum = prepare.querySelector<HTMLInputElement>('[data-maximum-colors]');
  assert.ok(maximum);
  assert.equal(maximum.value, '0');
  assert.equal(maximum.disabled, true);
  controller.destroy();
  window.close();
});

test('capability fallback resolves through the same auto/manual mode state without inventing auto API mode', () => {
  assert.equal(resolveSupportedNewPatternMode('auto', 'pixelArt', ['photo']), 'photo');
  assert.equal(resolveSupportedNewPatternMode('photo', 'pixelArt', ['pixelArt']), 'pixelArt');
  assert.equal(
    resolveSupportedNewPatternMode('pixelArt', 'photo', ['existingChart', 'photo', 'pixelArt']),
    'pixelArt',
  );
  assert.throws(
    () => resolveSupportedNewPatternMode('auto', 'photo', ['existingChart']),
    /制作新图纸/u,
  );
});

test('latest-source lifecycle aborts the previous signal and rejects stale completions', () => {
  const requests = createLatestSourceRequest();
  const first = requests.begin();
  assert.equal(first.token, 1);
  assert.equal(first.signal.aborted, false);
  assert.equal(requests.isCurrent(first.token), true);

  const second = requests.begin();
  assert.equal(first.signal.aborted, true);
  assert.equal(requests.isCurrent(first.token), false);
  assert.equal(requests.isCurrent(second.token), true);

  requests.cancel();
  assert.equal(second.signal.aborted, true);
  assert.equal(requests.isCurrent(second.token), false);
});

test('available-color updates retain keyed choices, focus, and scroll position', () => {
  const window = new Window();
  const document = window.document;
  const search = document.createElement('input');
  const grid = document.createElement('div');
  document.body.append(search, grid);
  const renderer = createAvailableColorGridRenderer(grid);
  const colors: readonly PrepareColor[] = [
    {
      id: 'mard:A1',
      code: 'A1',
      name: '奶油白',
      series: 'A',
      displayHex: '#F5F0E4',
      paletteLabel: 'MARD',
    },
    {
      id: 'mard:A2',
      code: 'A2',
      name: '象牙白',
      series: 'A',
      displayHex: '#E8DFC9',
      paletteLabel: 'MARD',
    },
    {
      id: 'mard:B1',
      code: 'B1',
      name: '薄荷绿',
      series: 'B',
      displayHex: '#9FC9B4',
      paletteLabel: 'MARD',
    },
  ];

  renderer.update({
    colors,
    selectedIds: new Set(['mard:A1', 'mard:B1']),
    query: '',
    series: '',
  });
  const retained = grid.querySelector<HTMLElement>('[data-available-color-key="mard:A1"]');
  assert.ok(retained);
  search.focus();
  grid.scrollTop = 73;

  renderer.update({
    colors,
    selectedIds: new Set(['mard:A1', 'mard:A2']),
    query: '白',
    series: 'A',
  });

  assert.strictEqual(
    grid.querySelector('[data-available-color-key="mard:A1"]'),
    retained,
    'a retained color must keep the same DOM node',
  );
  assert.strictEqual(document.activeElement, search);
  assert.equal(grid.scrollTop, 73);
  assert.equal(
    grid.querySelector<HTMLInputElement>(
      '[data-available-color-key="mard:A2"] input[data-available-color-id]',
    )?.checked,
    true,
  );
  assert.equal(
    grid.querySelector<HTMLElement>('[data-available-color-key="mard:B1"]')?.hidden,
    true,
  );
  renderer.destroy();
  window.close();
});

test('available-color search is a multiselect combobox with composition-safe keyboard toggles', () => {
  const window = new Window();
  const document = window.document;
  const search = document.createElement('input');
  const grid = document.createElement('div');
  const status = document.createElement('p');
  document.body.append(search, grid, status);
  const toggled: string[] = [];
  const renderer = createAvailableColorGridRenderer(grid, {
    searchInput: search,
    status,
    onToggle(colorId) {
      toggled.push(colorId);
    },
  });
  const colors: readonly PrepareColor[] = [
    {
      id: 'mard:A1',
      code: 'A1',
      name: '奶油白',
      series: 'A',
      displayHex: '#F5F0E4',
      paletteLabel: 'MARD',
    },
    {
      id: 'mard:A2',
      code: 'A2',
      name: '象牙白',
      series: 'A',
      displayHex: '#E8DFC9',
      paletteLabel: 'MARD',
    },
  ];
  renderer.update({
    colors,
    selectedIds: new Set(['mard:A1']),
    query: '',
    series: '',
  });

  assert.equal(search.getAttribute('role'), 'combobox');
  assert.equal(search.getAttribute('aria-autocomplete'), 'list');
  assert.equal(search.getAttribute('aria-expanded'), 'true');
  assert.equal(search.getAttribute('aria-controls'), grid.id);
  assert.equal(grid.getAttribute('role'), 'listbox');
  assert.equal(grid.getAttribute('aria-multiselectable'), 'true');
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(status.textContent, '显示 2 种颜色');
  const options = [...grid.querySelectorAll<HTMLElement>('[role="option"]')];
  assert.equal(options.length, 2);
  assert.equal(options[0]?.getAttribute('aria-selected'), 'true');
  assert.equal(options[1]?.getAttribute('aria-selected'), 'false');
  assert.equal(search.getAttribute('aria-activedescendant'), options[0]?.id);
  for (const checkbox of grid.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    assert.equal(checkbox.tabIndex, -1);
  }

  search.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(search.getAttribute('aria-activedescendant'), options[1]?.id);
  search.dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true }));
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ']) {
    const event = new window.KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    });
    search.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false, `${key} must remain available to the IME`);
    assert.equal(search.getAttribute('aria-activedescendant'), options[1]?.id);
    assert.deepEqual(toggled, []);
  }
  search.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true }));
  search.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  assert.deepEqual(toggled, ['mard:A2']);

  renderer.destroy();
  window.close();
});

test('crop numeric synchronization preserves the active multi-key value and caret', () => {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = renderApp();
  const prepare = document.querySelector<HTMLElement>('[data-prepare-workspace]');
  const x = prepare?.querySelector<HTMLInputElement>('[data-crop-x]');
  const y = prepare?.querySelector<HTMLInputElement>('[data-crop-y]');
  assert.ok(prepare && x && y);
  x.type = 'text';
  x.value = '12';
  x.focus();
  x.setSelectionRange(2, 2);

  syncCropNumericInputValues(prepare, { x: 12, y: 3.5, width: 80, height: 60 }, x);
  assert.equal(x.value, '12');
  assert.equal(x.selectionStart, 2);
  assert.equal(x.selectionEnd, 2);
  assert.equal(y.value, '3.5');

  x.value = '12.3';
  x.setSelectionRange(4, 4);
  syncCropNumericInputValues(prepare, { x: 12.3, y: 3.5, width: 80, height: 60 }, x);
  assert.equal(x.value, '12.3');
  assert.equal(x.selectionStart, 4);
  assert.equal(x.selectionEnd, 4);
  window.close();
});

test('adaptive selectors preserve controller DOM and selection across viewport changes', () => {
  const window = new Window();
  const document = window.document;
  const trigger = document.createElement('button');
  const overlay = document.createElement('div');
  const mobileSurface = document.createElement('aside');
  const mobilePanel = document.createElement('div');
  mobileSurface.append(mobilePanel);
  document.body.append(trigger, overlay, mobileSurface);
  const media = new MutableMediaQuery();
  const changes: string[] = [];
  const controller = createAdaptiveSelectController({
    trigger,
    overlayRoot: overlay,
    id: 'prepare-board',
    title: '选择拼板',
    options: [
      { id: '29', label: '29 × 29' },
      { id: '14', label: '14 × 14' },
    ],
    selectedId: '29',
    mobileSurface,
    mobilePanel,
    mediaQuery: media,
    onChange(selectedId) {
      changes.push(selectedId);
    },
  });

  trigger.click();
  const retainedDesktopOption = overlay.querySelector('[data-select-option="29"]');
  assert.ok(retainedDesktopOption);

  media.setMatches(true);
  assert.equal(overlay.querySelector('[role="listbox"]'), null);
  trigger.click();
  assert.ok(mobileSurface.querySelector('[data-mobile-picker]'));
  mobileSurface.querySelector<HTMLButtonElement>('[data-mobile-picker-option="14"]')?.click();
  mobileSurface.querySelector<HTMLButtonElement>('[data-mobile-picker-confirm]')?.click();
  assert.deepEqual(changes, ['14']);
  assert.equal(controller.selectedId(), '14');

  media.setMatches(false);
  trigger.click();
  assert.strictEqual(
    overlay.querySelector('[data-select-option="29"]'),
    retainedDesktopOption,
    'viewport changes must not destroy and rebuild the desktop option DOM',
  );
  assert.equal(
    overlay.querySelector('[data-select-option="14"]')?.getAttribute('aria-selected'),
    'true',
  );

  controller.destroy();
  window.close();
});

test('mobile available colors replace the prepare panel with one surface and restore focus and state', () => {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = renderApp();
  const sheet = document.querySelector<HTMLElement>('[data-prepare-picker-surface]');
  const panel = document.querySelector<HTMLElement>('[data-prepare-settings-panel]');
  const content = document.querySelector<HTMLElement>('[data-available-color-filter]');
  const trigger = document.querySelector<HTMLButtonElement>('[data-open-available-colors]');
  const search = document.querySelector<HTMLInputElement>('[data-available-color-search]');
  const grid = document.querySelector<HTMLElement>('[data-available-color-grid]');
  assert.ok(sheet && panel && content && trigger && search && grid);
  const originalParent = content.parentElement;
  const media = new MutableMediaQuery();
  media.setMatches(true);
  search.value = 'A14';
  grid.scrollTop = 67;
  trigger.focus();

  const controller = createAvailableColorMobilePanel({
    sheet,
    panel,
    content,
    trigger,
    searchInput: search,
    mediaQuery: media,
  });
  trigger.click();

  assert.equal(sheet.querySelectorAll('[data-mobile-picker]').length, 1);
  assert.equal(panel.hidden, true);
  assert.equal(panel.inert, true);
  assert.ok(content.closest('[data-mobile-picker]'));
  assert.equal(search.value, 'A14');
  assert.equal(grid.scrollTop, 67);
  assert.strictEqual(document.activeElement, search);

  trigger.click();
  assert.equal(sheet.querySelectorAll('[data-mobile-picker]').length, 1);
  sheet.querySelector<HTMLButtonElement>('[data-available-color-mobile-return]')?.click();
  assert.equal(sheet.querySelectorAll('[data-mobile-picker]').length, 0);
  assert.strictEqual(content.parentElement, originalParent);
  assert.equal(panel.hidden, false);
  assert.equal(panel.inert, false);
  assert.equal(search.value, 'A14');
  assert.equal(grid.scrollTop, 67);
  assert.strictEqual(document.activeElement, trigger);

  controller.destroy();
  window.close();
});

test('external preset synchronization preserves a focused numeric caret', () => {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = renderApp();
  const prepare = document.querySelector<HTMLElement>('[data-prepare-workspace]');
  assert.ok(prepare);
  const controller = mountPreparePresetControls(prepare, {
    initialState: {
      croppedColumns: 4,
      croppedRows: 3,
      columns: 48,
      rows: 36,
      beadDiameterMm: 5,
      beadPitchMm: 5,
      maximumColors: 24,
      availableColorCount: 39,
      dithering: 'none',
    },
  });
  const columns = prepare.querySelector<HTMLInputElement>('[data-columns]');
  assert.ok(columns);
  columns.type = 'text';
  columns.focus();
  columns.setSelectionRange(1, 1);

  controller.setDithering('floydSteinberg');

  assert.strictEqual(document.activeElement, columns);
  assert.equal(columns.selectionStart, 1);
  assert.equal(columns.selectionEnd, 1);
  controller.destroy();
  window.close();
});

function changeRadio(window: Window, root: ParentNode, name: string, value: string): void {
  const input = root.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
  assert.ok(input);
  input.checked = true;
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
}

class MutableMediaQuery implements AdaptiveSelectMediaQuery {
  matches = false;
  readonly listeners = new Set<() => void>();

  addEventListener(_type: 'change', listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'change', listener: () => void): void {
    this.listeners.delete(listener);
  }

  setMatches(matches: boolean): void {
    this.matches = matches;
    for (const listener of this.listeners) listener();
  }
}
