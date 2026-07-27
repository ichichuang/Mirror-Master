import type { ProjectMode } from '../../domain/project';
import type { Checkbox } from '@vaadin/checkbox';
import type { RadioGroup } from '@vaadin/radio-group';
import type { CropPercent } from '../crop-controls/cropControls';
import type { ModePreference, NewPatternMode } from '../customer-flow/modeRecommendation';
import {
  beadDimensionsForPreset,
  dimensionsForLongEdge,
  physicalDimensionsForGrid,
  processingSettingsForPreset,
  resolveBeadSizePreset,
  resolveColorCountPreset,
  resolveColorLimit,
  resolvePatternSizePreset,
  resolveProcessingPreset,
  type BeadSizePreset,
  type ColorCountPreset,
  type PatternSizePreset,
  type ProcessingPreset,
} from '../customer-flow/presets';

export interface PrepareWorkspaceState {
  readonly croppedColumns: number;
  readonly croppedRows: number;
  readonly columns: number;
  readonly rows: number;
  readonly patternSizePreset: PatternSizePreset;
  readonly beadDiameterMm: number;
  readonly beadPitchMm: number;
  readonly beadSizePreset: BeadSizePreset;
  readonly maximumColors: number;
  readonly availableColorCount: number;
  readonly colorCountPreset: ColorCountPreset;
  readonly dithering: 'none' | 'floydSteinberg';
  readonly processingPreset: ProcessingPreset;
  readonly physicalSizeMm: {
    readonly widthMm: number;
    readonly heightMm: number;
  };
}

export interface CreatePrepareWorkspaceStateInput {
  readonly croppedColumns: number;
  readonly croppedRows: number;
  readonly columns: number;
  readonly rows: number;
  readonly beadDiameterMm: number;
  readonly beadPitchMm: number;
  readonly maximumColors: number;
  readonly availableColorCount: number;
  readonly dithering: 'none' | 'floydSteinberg';
}

export interface CreateNewImagePrepareDefaultsInput {
  readonly croppedColumns: number;
  readonly croppedRows: number;
  readonly columns: number;
  readonly rows: number;
  readonly availableColorCount: number;
}

export type PrepareWorkspaceAction =
  | {
      readonly type: 'selectPatternSize';
      readonly preset: Exclude<PatternSizePreset, 'custom'>;
    }
  | {
      readonly type: 'setDimensions';
      readonly columns: number;
      readonly rows: number;
    }
  | {
      readonly type: 'setCropDimensions';
      readonly croppedColumns: number;
      readonly croppedRows: number;
    }
  | {
      readonly type: 'selectBeadSize';
      readonly preset: BeadSizePreset;
    }
  | {
      readonly type: 'setBeadDimensions';
      readonly beadDiameterMm: number;
      readonly beadPitchMm: number;
    }
  | {
      readonly type: 'selectColorCount';
      readonly preset: Exclude<ColorCountPreset, 'custom'>;
    }
  | {
      readonly type: 'setMaximumColors';
      readonly maximumColors: number;
    }
  | {
      readonly type: 'setAvailableColorCount';
      readonly count: number;
    }
  | {
      readonly type: 'selectProcessing';
      readonly preset: ProcessingPreset;
    }
  | {
      readonly type: 'setDithering';
      readonly dithering: 'none' | 'floydSteinberg';
    };

export function createPrepareWorkspaceState(
  input: CreatePrepareWorkspaceStateInput,
): PrepareWorkspaceState {
  return finalizePrepareWorkspaceState(input);
}

export function createNewImagePrepareDefaults(
  input: CreateNewImagePrepareDefaultsInput,
): CreatePrepareWorkspaceStateInput {
  return Object.freeze({
    croppedColumns: input.croppedColumns,
    croppedRows: input.croppedRows,
    columns: input.columns,
    rows: input.rows,
    beadDiameterMm: 5,
    beadPitchMm: 5,
    maximumColors: Math.min(24, input.availableColorCount),
    availableColorCount: input.availableColorCount,
    dithering: 'none',
  });
}

export function hasAvailableColorSelection(selectedIds: ReadonlySet<string>): boolean {
  return selectedIds.size > 0;
}

export function syncCropNumericInputValues(
  root: ParentNode,
  crop: CropPercent,
  editingInput?: HTMLInputElement,
): void {
  for (const [selector, value] of [
    ['[data-crop-x]', crop.x],
    ['[data-crop-y]', crop.y],
    ['[data-crop-width]', crop.width],
    ['[data-crop-height]', crop.height],
  ] as const) {
    const input = root.querySelector<HTMLInputElement>(selector);
    if (!input || input === editingInput) continue;
    const nextValue = value.toFixed(1);
    if (input.value !== nextValue) input.value = nextValue;
  }
}

export function reducePrepareWorkspaceState(
  state: PrepareWorkspaceState,
  action: PrepareWorkspaceAction,
): PrepareWorkspaceState {
  switch (action.type) {
    case 'selectPatternSize': {
      const dimensions = dimensionsForLongEdge(
        action.preset,
        state.croppedColumns,
        state.croppedRows,
      );
      return finalizePrepareWorkspaceState(
        { ...state, ...dimensions },
        { patternSizePreset: action.preset },
      );
    }
    case 'setDimensions':
      return finalizePrepareWorkspaceState({ ...state, ...action });
    case 'setCropDimensions': {
      const crop = {
        croppedColumns: action.croppedColumns,
        croppedRows: action.croppedRows,
      };
      if (state.patternSizePreset === 'custom') {
        return finalizePrepareWorkspaceState(
          { ...state, ...crop },
          { patternSizePreset: 'custom' },
        );
      }
      const dimensions = dimensionsForLongEdge(
        state.patternSizePreset,
        crop.croppedColumns,
        crop.croppedRows,
      );
      return finalizePrepareWorkspaceState(
        { ...state, ...crop, ...dimensions },
        { patternSizePreset: state.patternSizePreset },
      );
    }
    case 'selectBeadSize': {
      if (action.preset === 'custom') {
        return finalizePrepareWorkspaceState(state, { beadSizePreset: 'custom' });
      }
      const dimensions = beadDimensionsForPreset(action.preset);
      return finalizePrepareWorkspaceState(
        { ...state, ...dimensions },
        { beadSizePreset: action.preset },
      );
    }
    case 'setBeadDimensions':
      return finalizePrepareWorkspaceState({
        ...state,
        beadDiameterMm: action.beadDiameterMm,
        beadPitchMm: action.beadPitchMm,
      });
    case 'selectColorCount':
      return finalizePrepareWorkspaceState(
        {
          ...state,
          maximumColors:
            state.availableColorCount === 0
              ? 0
              : resolveColorLimit(action.preset, state.availableColorCount),
        },
        { colorCountPreset: action.preset },
      );
    case 'setMaximumColors':
      return finalizePrepareWorkspaceState({
        ...state,
        maximumColors:
          state.availableColorCount === 0
            ? 0
            : clampInteger(action.maximumColors, 1, state.availableColorCount),
      });
    case 'setAvailableColorCount': {
      const availableColorCount = nonnegativeInteger(action.count, '可用颜色数量');
      const maximumColors =
        availableColorCount === 0
          ? 0
          : state.colorCountPreset === 'custom'
            ? clampInteger(state.maximumColors, 1, availableColorCount)
            : resolveColorLimit(state.colorCountPreset, availableColorCount);
      return finalizePrepareWorkspaceState(
        { ...state, availableColorCount, maximumColors },
        { colorCountPreset: state.colorCountPreset },
      );
    }
    case 'selectProcessing': {
      const settings = processingSettingsForPreset(action.preset);
      return finalizePrepareWorkspaceState(
        { ...state, ...settings },
        { processingPreset: action.preset },
      );
    }
    case 'setDithering':
      return finalizePrepareWorkspaceState({ ...state, dithering: action.dithering });
  }
}

function finalizePrepareWorkspaceState(
  input: CreatePrepareWorkspaceStateInput,
  overrides: Partial<
    Pick<
      PrepareWorkspaceState,
      'patternSizePreset' | 'beadSizePreset' | 'colorCountPreset' | 'processingPreset'
    >
  > = {},
): PrepareWorkspaceState {
  const croppedColumns = positiveFinite(input.croppedColumns, '裁剪宽度');
  const croppedRows = positiveFinite(input.croppedRows, '裁剪高度');
  const columns = boundedGridDimension(input.columns, '图案列数');
  const rows = boundedGridDimension(input.rows, '图案行数');
  const availableColorCount = nonnegativeInteger(input.availableColorCount, '可用颜色数量');
  const beadDimensions = beadDimensionsForPreset('custom', {
    beadDiameterMm: input.beadDiameterMm,
    beadPitchMm: input.beadPitchMm,
  });
  const maximumColors =
    availableColorCount === 0 ? 0 : clampInteger(input.maximumColors, 1, availableColorCount);
  return Object.freeze({
    croppedColumns,
    croppedRows,
    columns,
    rows,
    patternSizePreset:
      overrides.patternSizePreset ??
      resolvePatternSizePreset({ columns, rows }, croppedColumns, croppedRows),
    ...beadDimensions,
    beadSizePreset: overrides.beadSizePreset ?? resolveBeadSizePreset(beadDimensions),
    maximumColors,
    availableColorCount,
    colorCountPreset:
      overrides.colorCountPreset ??
      (availableColorCount === 0
        ? 'custom'
        : resolveColorCountPreset(maximumColors, availableColorCount)),
    dithering: input.dithering,
    processingPreset: overrides.processingPreset ?? resolveProcessingPreset(input.dithering),
    physicalSizeMm: physicalDimensionsForGrid({
      columns,
      rows,
      ...beadDimensions,
    }),
  });
}

export function resolveSupportedNewPatternMode(
  preference: ModePreference,
  recommendation: NewPatternMode,
  supportedModes: readonly ProjectMode[],
): NewPatternMode {
  const supported = supportedModes.filter(
    (candidate): candidate is NewPatternMode => candidate === 'photo' || candidate === 'pixelArt',
  );
  if (supported.length === 0) {
    throw new Error('当前服务暂不支持制作新图纸。');
  }
  const requested = preference === 'auto' ? recommendation : preference;
  return supported.includes(requested) ? requested : (supported[0] ?? 'photo');
}

export interface MountPreparePresetControlsOptions {
  readonly initialState: CreatePrepareWorkspaceStateInput;
  readonly onChange?: (state: PrepareWorkspaceState) => void;
}

export interface PreparePresetControlsController {
  readonly getState: () => PrepareWorkspaceState;
  readonly hydrate: (input: CreatePrepareWorkspaceStateInput) => void;
  readonly setCropDimensions: (croppedColumns: number, croppedRows: number) => void;
  readonly setAvailableColorCount: (count: number) => void;
  readonly setDithering: (dithering: 'none' | 'floydSteinberg') => void;
  readonly syncFromFields: () => void;
  readonly destroy: () => void;
}

export function mountPreparePresetControls(
  root: HTMLElement,
  options: MountPreparePresetControlsOptions,
): PreparePresetControlsController {
  let state = createPrepareWorkspaceState(options.initialState);
  let destroyed = false;
  let syncingPresetGroups = false;
  root.addEventListener('value-changed', onPresetChange);
  root.addEventListener('input', onInput);
  render();

  return Object.freeze({
    getState: () => state,
    hydrate(input: CreatePrepareWorkspaceStateInput) {
      if (destroyed) return;
      state = createPrepareWorkspaceState(input);
      render();
    },
    setCropDimensions(croppedColumns: number, croppedRows: number) {
      update({ type: 'setCropDimensions', croppedColumns, croppedRows });
    },
    setAvailableColorCount(count: number) {
      update({ type: 'setAvailableColorCount', count });
    },
    setDithering(dithering: 'none' | 'floydSteinberg') {
      update({ type: 'setDithering', dithering });
    },
    syncFromFields,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      root.removeEventListener('value-changed', onPresetChange);
      root.removeEventListener('input', onInput);
    },
  });

  function onPresetChange(event: Event): void {
    if (syncingPresetGroups) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.localName !== 'vaadin-radio-group') {
      return;
    }
    const group = target as RadioGroup;
    if (group.matches('[data-pattern-size-preset]')) {
      const preset = Number(group.value);
      if (
        (preset === 29 || preset === 48 || preset === 72) &&
        preset !== state.patternSizePreset
      ) {
        update({ type: 'selectPatternSize', preset });
      }
      return;
    }
    if (group.matches('[data-bead-size-preset]')) {
      const preset =
        group.value === 'custom'
          ? 'custom'
          : group.value === '2.6'
            ? 2.6
            : group.value === '5'
              ? 5
              : null;
      if (preset === null) return;
      if (preset === state.beadSizePreset) return;
      update({ type: 'selectBeadSize', preset });
      if (preset === 'custom') {
        const details = root.querySelector<HTMLDetailsElement>('[data-professional-settings]');
        if (details) details.open = true;
      }
      return;
    }
    if (group.matches('[data-color-count-preset]')) {
      const preset = Number(group.value);
      if (
        (preset === 12 || preset === 24 || preset === 48) &&
        preset !== state.colorCountPreset
      ) {
        update({ type: 'selectColorCount', preset });
      }
      return;
    }
    if (group.matches('[data-processing-preset]')) {
      if (
        (group.value === 'easy' || group.value === 'gradient') &&
        group.value !== state.processingPreset
      ) {
        update({ type: 'selectProcessing', preset: group.value });
      }
    }
  }

  function onInput(event: Event): void {
    const InputConstructor = root.ownerDocument.defaultView?.HTMLInputElement;
    const target = event.target;
    if (InputConstructor === undefined || !(target instanceof InputConstructor)) return;
    if (target.matches('[data-columns], [data-rows]')) {
      syncDimensionsFromFields();
      return;
    }
    if (target.matches('[data-bead-diameter], [data-bead-pitch]')) {
      syncBeadDimensionsFromFields();
      return;
    }
    if (target.matches('[data-maximum-colors]')) {
      update({
        type: 'setMaximumColors',
        maximumColors: numericInput(root, '[data-maximum-colors]', state.maximumColors),
      });
    }
  }

  function syncFromFields(): void {
    if (destroyed) return;
    syncDimensionsFromFields(false);
    syncBeadDimensionsFromFields(false);
    state = reducePrepareWorkspaceState(state, {
      type: 'setMaximumColors',
      maximumColors: numericInput(root, '[data-maximum-colors]', state.maximumColors),
    });
    render();
    options.onChange?.(state);
  }

  function syncDimensionsFromFields(notify = true): void {
    const columns = Math.round(numericInput(root, '[data-columns]', state.columns));
    const rows = Math.round(numericInput(root, '[data-rows]', state.rows));
    update({ type: 'setDimensions', columns, rows }, notify);
  }

  function syncBeadDimensionsFromFields(notify = true): void {
    const beadDiameterMm = numericInput(root, '[data-bead-diameter]', state.beadDiameterMm);
    const beadPitchMm = Math.max(
      beadDiameterMm,
      numericInput(root, '[data-bead-pitch]', state.beadPitchMm),
    );
    update({ type: 'setBeadDimensions', beadDiameterMm, beadPitchMm }, notify);
  }

  function update(action: PrepareWorkspaceAction, notify = true): void {
    if (destroyed) return;
    state = reducePrepareWorkspaceState(state, action);
    render();
    if (notify) options.onChange?.(state);
  }

  function render(): void {
    setInputValue(root, '[data-columns]', state.columns);
    setInputValue(root, '[data-rows]', state.rows);
    setInputValue(root, '[data-bead-diameter]', state.beadDiameterMm);
    setInputValue(root, '[data-bead-pitch]', state.beadPitchMm);
    setInputValue(root, '[data-maximum-colors]', state.maximumColors);
    syncingPresetGroups = true;
    setPresetValue(root, '[data-pattern-size-preset]', state.patternSizePreset);
    setPresetValue(root, '[data-bead-size-preset]', state.beadSizePreset);
    setPresetValue(root, '[data-color-count-preset]', state.colorCountPreset);
    setPresetValue(root, '[data-processing-preset]', state.processingPreset);
    syncingPresetGroups = false;
    for (const element of root.querySelectorAll<HTMLElement>('[data-physical-size]')) {
      const nextText =
        `约 ${(state.physicalSizeMm.widthMm / 10).toFixed(1)} × ` +
        `${(state.physicalSizeMm.heightMm / 10).toFixed(1)} cm`;
      if (element.textContent !== nextText) element.textContent = nextText;
    }
    const maximumColors = root.querySelector<HTMLInputElement>('[data-maximum-colors]');
    if (maximumColors) {
      maximumColors.disabled = state.availableColorCount === 0;
      maximumColors.min = state.availableColorCount === 0 ? '0' : '1';
    }
    const customBeadFields = root.querySelector<HTMLFieldSetElement>('[data-custom-bead-fields]');
    if (customBeadFields) {
      const custom = state.beadSizePreset === 'custom';
      customBeadFields.hidden = !custom;
      customBeadFields.disabled = !custom;
    }
    const customPatternState = root.querySelector<HTMLElement>('[data-pattern-size-custom]');
    if (customPatternState) {
      const custom = state.patternSizePreset === 'custom';
      customPatternState.hidden = !custom;
      const dimensions = customPatternState.querySelector<HTMLElement>(
        '[data-custom-pattern-size]',
      );
      const nextText = `${String(state.columns)} × ${String(state.rows)} 颗`;
      if (dimensions && dimensions.textContent !== nextText) {
        dimensions.textContent = nextText;
      }
    }
  }
}

export interface LatestSourceRequest {
  readonly begin: () => { readonly token: number; readonly signal: AbortSignal };
  readonly isCurrent: (token: number) => boolean;
  readonly cancel: () => void;
}

export function createLatestSourceRequest(): LatestSourceRequest {
  let token = 0;
  let controller: AbortController | null = null;
  return Object.freeze({
    begin() {
      controller?.abort();
      controller = new AbortController();
      token += 1;
      return Object.freeze({ token, signal: controller.signal });
    },
    isCurrent(candidate: number) {
      return controller !== null && !controller.signal.aborted && candidate === token;
    },
    cancel() {
      controller?.abort();
      controller = null;
    },
  });
}

export interface PrepareColor {
  readonly id: string;
  readonly code: string;
  readonly name?: string;
  readonly series: string;
  readonly displayHex: string;
  readonly paletteLabel: string;
}

export interface AvailableColorGridUpdate {
  readonly colors: readonly PrepareColor[];
  readonly selectedIds: ReadonlySet<string>;
  readonly query: string;
  readonly series: string;
}

export interface AvailableColorGridRenderer {
  readonly update: (input: AvailableColorGridUpdate) => void;
  readonly destroy: () => void;
}

export interface AvailableColorGridRendererOptions {
  readonly status?: HTMLElement;
}

interface ColorChoiceNodes {
  readonly root: Checkbox;
  readonly swatch: HTMLSpanElement;
  readonly code: HTMLElement;
}

interface ColorGroupNodes {
  readonly root: HTMLElement;
  readonly choices: HTMLElement;
}

export function createAvailableColorGridRenderer(
  root: HTMLElement,
  options: AvailableColorGridRendererOptions = {},
): AvailableColorGridRenderer {
  const document = root.ownerDocument;
  const groups = new Map<string, ColorGroupNodes>();
  const choices = new Map<string, ColorChoiceNodes>();
  root.setAttribute('role', 'group');
  if (options.status) {
    options.status.setAttribute('role', 'status');
    options.status.setAttribute('aria-live', 'polite');
  }

  return Object.freeze({
    update(input: AvailableColorGridUpdate) {
      const activeColorIds = new Set(input.colors.map((color: PrepareColor) => color.id));
      const normalizedQuery = input.query.trim().toLocaleLowerCase();
      const visibleBySeries = new Map<string, number>();

      for (const color of input.colors) {
        const group = ensureGroup(color.series);
        const choice = ensureChoice(color, group);
        updateChoice(choice, color, input.selectedIds.has(color.id));
        const matchesSeries = input.series === '' || input.series === color.series;
        const searchable =
          `${color.id} ${color.code} ${color.name ?? ''} ${color.paletteLabel}`.toLocaleLowerCase();
        const visible = matchesSeries && searchable.includes(normalizedQuery);
        choice.root.hidden = !visible;
        if (visible) {
          visibleBySeries.set(color.series, (visibleBySeries.get(color.series) ?? 0) + 1);
        }
      }

      for (const [colorId, choice] of choices) {
        if (!activeColorIds.has(colorId)) {
          choice.root.hidden = true;
        }
      }
      for (const [series, group] of groups) {
        group.root.hidden = (visibleBySeries.get(series) ?? 0) === 0;
      }
      const visibleCount = [...visibleBySeries.values()].reduce((total, count) => total + count, 0);
      root.setAttribute('aria-label', `选择手边有的拼豆颜色，当前显示 ${String(visibleCount)} 色`);
      if (options.status) {
        options.status.textContent =
          visibleCount === 0 ? '没有符合条件的颜色' : `显示 ${String(visibleCount)} 种颜色`;
      }
    },
    destroy() {},
  });

  function ensureGroup(series: string): ColorGroupNodes {
    const retained = groups.get(series);
    if (retained) {
      return retained;
    }
    const group = document.createElement('section');
    const heading = document.createElement('h3');
    const groupChoices = document.createElement('div');
    group.className = 'available-color-series-group';
    group.dataset.availableColorSeriesKey = series;
    group.setAttribute('aria-label', `${series} 系列`);
    heading.textContent = `${series} 系列`;
    group.append(heading, groupChoices);
    root.append(group);
    const nodes = Object.freeze({ root: group, choices: groupChoices });
    groups.set(series, nodes);
    return nodes;
  }

  function ensureChoice(color: PrepareColor, group: ColorGroupNodes): ColorChoiceNodes {
    const retained = choices.get(color.id);
    if (retained) {
      if (retained.root.parentElement !== group.choices) {
        group.choices.append(retained.root);
      }
      return retained;
    }
    const checkbox = document.createElement('vaadin-checkbox');
    const label = document.createElement('label');
    const swatch = document.createElement('span');
    const code = document.createElement('small');
    checkbox.className = 'available-color-choice';
    checkbox.dataset.availableColorKey = color.id;
    checkbox.dataset.availableColorId = color.id;
    label.className = 'available-color-choice-content';
    label.slot = 'label';
    swatch.className = 'available-color-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    label.append(swatch, code);
    checkbox.append(label);
    group.choices.append(checkbox);
    const nodes = Object.freeze({ root: checkbox, swatch, code });
    choices.set(color.id, nodes);
    return nodes;
  }
}

function updateChoice(choice: ColorChoiceNodes, color: PrepareColor, selected: boolean): void {
  const label = `${color.paletteLabel} ${color.code}${color.name ? ` · ${color.name}` : ''}`;
  choice.root.title = label;
  if (choice.root.checked !== selected) choice.root.checked = selected;
  choice.root.setAttribute('aria-label', label);
  choice.root.toggleAttribute('data-selected', selected);
  choice.swatch.style.setProperty('--swatch', color.displayHex);
  choice.code.textContent = color.code;
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label}必须是正数。`);
  }
  return value;
}

function nonnegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label}必须是非负整数。`);
  }
  return value;
}

function boundedGridDimension(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 300) {
    throw new Error(`${label}必须在 1 到 300 之间。`);
  }
  return value;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function numericInput(root: ParentNode, selector: string, fallback: number): number {
  const value = root.querySelector<HTMLInputElement>(selector)?.valueAsNumber;
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function setInputValue(root: ParentNode, selector: string, value: number): void {
  const input = root.querySelector<HTMLInputElement>(selector);
  const nextValue = String(value);
  if (input && input.value !== nextValue) input.value = nextValue;
}

function setPresetValue(
  root: ParentNode,
  selector: string,
  value: PatternSizePreset | BeadSizePreset | ColorCountPreset | ProcessingPreset,
): void {
  const group = root.querySelector<RadioGroup>(selector);
  const nextValue = String(value);
  if (group && group.value !== nextValue) {
    group.value = nextValue;
  }
}
