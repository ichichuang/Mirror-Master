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
  type PreparePresetRadioGroupControllers,
} from '../src/features/prepare-workspace/prepareWorkspace';
import type {
  VaadinRadioGroupController,
  VaadinRadioGroupValueChangedListener,
} from '../src/features/vaadin-controls/vaadinControls';
test('mounted customer cards update real prepare controls and live physical size', () => {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = renderApp();
  const prepare = document.querySelector<HTMLElement>('[data-prepare-workspace]');
  assert.ok(prepare);
  const controller = mountPreparePresetControls(prepare, {
    radioGroups: createTestPrepareRadioGroups(prepare),
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
  assert.equal(controller.getState().dithering, 'floydSteinberg');
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
    radioGroups: createTestPrepareRadioGroups(prepare),
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
  assert.equal(radioGroupValue(prepare, 'pattern-size-preset'), 'custom');
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
  assert.equal(radioGroupValue(prepare, 'color-count-preset'), '12');

  controller.setDithering('floydSteinberg');
  assert.equal(radioGroupValue(prepare, 'processing-preset'), 'gradient');
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
  const controller = mountPreparePresetControls(prepare, {
    initialState: defaults,
    radioGroups: createTestPrepareRadioGroups(prepare),
  });
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
    (
      grid.querySelector<HTMLElement>(
        '[data-available-color-key="mard:A2"][data-available-color-id]',
      ) as (HTMLElement & { checked?: boolean }) | null
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

test('external preset synchronization preserves a focused numeric caret', () => {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = renderApp();
  const prepare = document.querySelector<HTMLElement>('[data-prepare-workspace]');
  assert.ok(prepare);
  const controller = mountPreparePresetControls(prepare, {
    radioGroups: createTestPrepareRadioGroups(prepare),
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
  const group = root.querySelector<HTMLElement>(`[data-${name}]`) as
    (HTMLElement & { value: string }) | null;
  assert.ok(group);
  group.value = value;
  group.dispatchEvent(
    new window.CustomEvent('value-changed', {
      bubbles: true,
      detail: { value },
    }),
  );
}

function radioGroupValue(root: ParentNode, name: string): string | undefined {
  return (
    root.querySelector<HTMLElement>(`[data-${name}]`) as (HTMLElement & { value?: string }) | null
  )?.value;
}

function createTestPrepareRadioGroups(root: ParentNode): PreparePresetRadioGroupControllers {
  return {
    patternSize: createTestRadioGroup(root, 'pattern-size-preset'),
    beadSize: createTestRadioGroup(root, 'bead-size-preset'),
    colorCount: createTestRadioGroup(root, 'color-count-preset'),
    processing: createTestRadioGroup(root, 'processing-preset'),
  };
}

function createTestRadioGroup(root: ParentNode, name: string): VaadinRadioGroupController {
  const group = root.querySelector<HTMLElement>(`[data-${name}]`) as
    (HTMLElement & { value: string }) | null;
  assert.ok(group);
  return {
    destroy() {},
    selectedValue: () => group.value ?? '',
    setValue(value) {
      group.value = value;
      return value;
    },
    subscribe(listener: VaadinRadioGroupValueChangedListener) {
      const handleValueChanged = (event: Event): void => {
        const value = (event as CustomEvent<{ value?: string }>).detail?.value ?? group.value;
        listener(value, event as Parameters<VaadinRadioGroupValueChangedListener>[1]);
      };
      group.addEventListener('value-changed', handleValueChanged);
      return () => {
        group.removeEventListener('value-changed', handleValueChanged);
      };
    },
  };
}
