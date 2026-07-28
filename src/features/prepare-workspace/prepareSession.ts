import type { ProjectMode } from '../../domain/project';
import type { CustomerTask, NewPatternMode } from '../customer-flow/modeRecommendation';
import {
  beginRecommendation,
  createImportedPrepareState,
  type NewPatternPrepareState,
} from '../customer-flow/prepareState';
import type { VaadinRadioGroupController } from '../vaadin-controls/vaadinControls';

export interface UploadPrepareFlow {
  readonly customerTask: CustomerTask;
  readonly prepareState: NewPatternPrepareState | null;
}

export type SamplingValue = 'average' | 'nearest';
export type SamplingSource = 'automatic' | 'user' | 'project';

export interface SamplingSelection {
  readonly value: SamplingValue;
  readonly source: SamplingSource;
}

export interface UploadPrepareRadioControllers {
  readonly modePreference: VaadinRadioGroupController;
}

export function flowFromImportedProject(mode: ProjectMode): UploadPrepareFlow {
  const imported = createImportedPrepareState(mode);
  return Object.freeze({
    customerTask: mode === 'existingChart' ? 'mirrorExistingChart' : 'newPattern',
    prepareState: imported.task === 'newPattern' ? imported : null,
  });
}

export function resetFlowForReplacement(flow: UploadPrepareFlow): UploadPrepareFlow {
  return Object.freeze({
    customerTask: flow.customerTask,
    prepareState: null,
  });
}

export function beginUploadedImage(
  flow: UploadPrepareFlow,
  sourceToken: number,
): UploadPrepareFlow {
  return Object.freeze({
    customerTask: flow.customerTask,
    prepareState: flow.customerTask === 'newPattern' ? beginRecommendation(sourceToken) : null,
  });
}

export function syncUploadPrepareControls(
  controllers: UploadPrepareRadioControllers,
  flow: UploadPrepareFlow,
): void {
  controllers.modePreference.setValue(flow.prepareState?.preference ?? 'auto');
}

export function createAutomaticSampling(
  mode: NewPatternMode,
  supported: readonly SamplingValue[],
): SamplingSelection {
  return Object.freeze({
    value: supportedSampling(mode === 'pixelArt' ? 'nearest' : 'average', supported),
    source: 'automatic',
  });
}

export function chooseSampling(
  _current: SamplingSelection,
  value: SamplingValue,
  source: Exclude<SamplingSource, 'automatic'>,
): SamplingSelection {
  return Object.freeze({ value, source });
}

export function recommendSampling(
  current: SamplingSelection,
  mode: NewPatternMode,
  supported: readonly SamplingValue[],
): SamplingSelection {
  return current.source === 'automatic' ? createAutomaticSampling(mode, supported) : current;
}

export function syncSamplingControls(
  controller: VaadinRadioGroupController,
  selection: SamplingSelection,
): void {
  controller.setValue(selection.value);
}

function supportedSampling(
  preferred: SamplingValue,
  supported: readonly SamplingValue[],
): SamplingValue {
  const value = supported.includes(preferred) ? preferred : supported[0];
  if (value === undefined) {
    throw new Error('当前服务没有可用的格子取色方式。');
  }
  return value;
}
