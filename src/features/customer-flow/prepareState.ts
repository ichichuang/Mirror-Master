import type { ProjectMode } from '../../domain/project';
import type { ImageRecommendationResult } from './imageRecommendation';
import type { ModePreference, NewPatternMode } from './modeRecommendation';

export interface StoredProjectRecommendationResult {
  readonly sourceToken: null;
  readonly recommendation: NewPatternMode;
  readonly basis: 'storedProject';
  readonly reason: string;
}

export type PrepareRecommendationResult =
  ImageRecommendationResult | StoredProjectRecommendationResult;

export interface NewPatternAnalyzingPrepareState {
  readonly task: 'newPattern';
  readonly recommendationStatus: 'analyzing';
  readonly sourceToken: number;
  readonly preference: ModePreference;
  readonly resolvedMode: NewPatternMode | null;
  readonly reason: string;
}

export interface NewPatternReadyPrepareState {
  readonly task: 'newPattern';
  readonly recommendationStatus: 'ready';
  readonly sourceToken: number | null;
  readonly preference: ModePreference;
  readonly recommendation: PrepareRecommendationResult;
  readonly resolvedMode: NewPatternMode;
  readonly reason: string;
}

export type NewPatternPrepareState = NewPatternAnalyzingPrepareState | NewPatternReadyPrepareState;

export interface MirrorExistingChartPrepareState {
  readonly task: 'mirrorExistingChart';
  readonly resolvedMode: 'existingChart';
  readonly reason: string;
}

export type PrepareState = NewPatternPrepareState | MirrorExistingChartPrepareState;

export type CreatePrepareStateInput =
  | {
      readonly task: 'newPattern';
      readonly preference: ModePreference;
      readonly recommendation: ImageRecommendationResult;
    }
  | {
      readonly task: 'mirrorExistingChart';
    };

export function createPrepareState(input: CreatePrepareStateInput): PrepareState {
  if (input.task === 'mirrorExistingChart') {
    return mirrorExistingChartState();
  }
  return buildNewPatternState(input.preference, input.recommendation);
}

export function beginRecommendation(
  sourceToken: number,
  currentState?: NewPatternPrepareState,
): NewPatternAnalyzingPrepareState {
  assertSourceToken(sourceToken);
  return buildAnalyzingState(currentState?.preference ?? 'auto', sourceToken);
}

export function updateRecommendation(
  state: NewPatternPrepareState,
  recommendation: ImageRecommendationResult,
): NewPatternPrepareState {
  if (state.sourceToken === null || state.sourceToken !== recommendation.sourceToken) {
    return state;
  }
  return buildNewPatternState(state.preference, recommendation);
}

export function setModePreference(
  state: NewPatternPrepareState,
  preference: ModePreference,
): NewPatternPrepareState {
  if (state.recommendationStatus === 'analyzing') {
    return buildAnalyzingState(preference, state.sourceToken);
  }
  return buildNewPatternState(preference, state.recommendation);
}

export function createImportedPrepareState(mode: ProjectMode): PrepareState {
  if (mode === 'existingChart') {
    return mirrorExistingChartState();
  }
  return buildNewPatternState(mode, storedProjectRecommendation(mode));
}

function buildNewPatternState(
  preference: ModePreference,
  recommendation: PrepareRecommendationResult,
): NewPatternReadyPrepareState {
  const resolvedMode = preference === 'auto' ? recommendation.recommendation : preference;
  return Object.freeze({
    task: 'newPattern',
    recommendationStatus: 'ready',
    sourceToken: recommendation.sourceToken,
    preference,
    recommendation,
    resolvedMode,
    reason: resolvedReason(preference, recommendation),
  });
}

function buildAnalyzingState(
  preference: ModePreference,
  sourceToken: number,
): NewPatternAnalyzingPrepareState {
  return Object.freeze({
    task: 'newPattern',
    recommendationStatus: 'analyzing',
    sourceToken,
    preference,
    resolvedMode: preference === 'auto' ? null : preference,
    reason:
      preference === 'auto'
        ? '正在分析图片颜色，以推荐合适的处理方式。'
        : manualPreferenceReason(preference),
  });
}

function mirrorExistingChartState(): MirrorExistingChartPrepareState {
  return Object.freeze({
    task: 'mirrorExistingChart',
    resolvedMode: 'existingChart',
    reason: '镜像已有图纸会进入网格检测和智能镜像。',
  });
}

function storedProjectRecommendation(mode: NewPatternMode): StoredProjectRecommendationResult {
  return Object.freeze({
    sourceToken: null,
    recommendation: mode,
    basis: 'storedProject',
    reason:
      mode === 'photo' ? '已按项目保存设置恢复：自然图片。' : '已按项目保存设置恢复：清晰像素。',
  });
}

function resolvedReason(
  preference: ModePreference,
  recommendation: PrepareRecommendationResult,
): string {
  if (preference !== 'auto') {
    return manualPreferenceReason(preference);
  }
  return recommendation.reason;
}

function manualPreferenceReason(preference: NewPatternMode): string {
  return preference === 'photo' ? '已手动选择：自然图片。' : '已手动选择：清晰像素。';
}

function assertSourceToken(sourceToken: number): void {
  if (!Number.isSafeInteger(sourceToken) || sourceToken < 0) {
    throw new Error('图片来源令牌必须是非负整数。');
  }
}
