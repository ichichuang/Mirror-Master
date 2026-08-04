import {
  configurationForPngExportPreset,
  type PngExportConfiguration,
} from './pngExportConfiguration';

export type ExportTaskId = 'shareImage' | 'printMaking' | 'materialsList' | 'saveProject';
export type ExportFormat = 'png' | 'pdf' | 'csv' | 'json';
export type ExportPngTemplate = 'pure' | 'annotated' | 'numbered' | 'rounded';
export type ExportSheetState = 'peek' | 'half' | 'full';

export interface ExportTaskDefinition {
  readonly id: ExportTaskId;
  readonly label: string;
  readonly format: ExportFormat;
  readonly fileLabel: string;
  readonly description: string;
  readonly templates?: readonly {
    readonly id: ExportPngTemplate;
    readonly label: string;
  }[];
}

export const EXPORT_TASKS: readonly ExportTaskDefinition[] = Object.freeze([
  Object.freeze({
    id: 'shareImage',
    label: '分享图片',
    format: 'png',
    fileLabel: '分享图',
    description: '下载适合查看与分享的 PNG 图片。',
    templates: Object.freeze([
      Object.freeze({ id: 'pure', label: '纯图案' }),
      Object.freeze({ id: 'annotated', label: '带标注' }),
      Object.freeze({ id: 'numbered', label: '色号图纸' }),
      Object.freeze({ id: 'rounded', label: '圆角方格' }),
    ]),
  }),
  Object.freeze({
    id: 'printMaking',
    label: '打印制作',
    format: 'pdf',
    fileLabel: '打印制作',
    description: '始终生成摘要、拼板分页、坐标和材料图例。',
  }),
  Object.freeze({
    id: 'materialsList',
    label: '材料清单',
    format: 'csv',
    fileLabel: '材料清单',
    description: '下载项目摘要、每色材料数量和逐格明细。',
  }),
  Object.freeze({
    id: 'saveProject',
    label: '保存项目',
    format: 'json',
    fileLabel: '项目',
    description: '下载可继续编辑的项目文件。',
  }),
]);

export interface ExportReturnContext {
  readonly panel: string;
  readonly sheetState: ExportSheetState;
  readonly triggerKey: string;
  readonly scrollTop: number;
}

export type ExportCompletionStatus =
  | { readonly phase: 'idle' }
  | {
      readonly phase: 'running';
      readonly token: number;
      readonly task: ExportTaskId;
    }
  | {
      readonly phase: 'success';
      readonly token: number;
      readonly task: ExportTaskId;
      readonly fileName: string;
    }
  | {
      readonly phase: 'error';
      readonly token: number;
      readonly task: ExportTaskId;
      readonly message: string;
    };

export interface ExportCompletionState {
  readonly phase: 'closed' | 'open';
  readonly selectedTask: ExportTaskId;
  readonly pngTemplate: ExportPngTemplate;
  readonly pngConfiguration: PngExportConfiguration;
  readonly returnContext: ExportReturnContext | null;
  readonly status: ExportCompletionStatus;
}

export function createExportCompletionState(): ExportCompletionState {
  return freezeState({
    phase: 'closed',
    selectedTask: 'shareImage',
    pngTemplate: 'annotated',
    pngConfiguration: configurationForPngExportPreset('annotated'),
    returnContext: null,
    status: Object.freeze({ phase: 'idle' }),
  });
}

export function openExportCompletion(
  state: ExportCompletionState,
  returnContext: ExportReturnContext,
): ExportCompletionState {
  return freezeState({
    ...state,
    phase: 'open',
    returnContext: Object.freeze({ ...returnContext }),
    status: Object.freeze({ phase: 'idle' }),
  });
}

export function closeExportCompletion(state: ExportCompletionState): ExportCompletionState {
  return freezeState({
    ...state,
    phase: 'closed',
    status: Object.freeze({ phase: 'idle' }),
  });
}

export function selectExportTask(
  state: ExportCompletionState,
  selectedTask: ExportTaskId,
): ExportCompletionState {
  return freezeState({
    ...state,
    selectedTask,
    status: Object.freeze({ phase: 'idle' }),
  });
}

export function setExportPngTemplate(
  state: ExportCompletionState,
  pngTemplate: ExportPngTemplate,
): ExportCompletionState {
  return freezeState({ ...state, pngTemplate });
}

export function setExportPngConfiguration(
  state: ExportCompletionState,
  pngConfiguration: PngExportConfiguration,
): ExportCompletionState {
  return freezeState({
    ...state,
    pngConfiguration: Object.freeze({ ...pngConfiguration }),
    status: Object.freeze({ phase: 'idle' }),
  });
}

export function parseExportPngTemplate(value: string): ExportPngTemplate {
  if (value === 'pure' || value === 'numbered' || value === 'rounded') {
    return value;
  }
  return 'annotated';
}

export function beginExport(
  state: ExportCompletionState,
  token: number,
  task: ExportTaskId,
): ExportCompletionState {
  assertToken(token);
  return freezeState({
    ...state,
    status: Object.freeze({ phase: 'running', token, task }),
  });
}

export function completeExport(
  state: ExportCompletionState,
  token: number,
  fileName: string,
): ExportCompletionState {
  if (state.status.phase !== 'running' || state.status.token !== token) {
    return state;
  }
  return freezeState({
    ...state,
    status: Object.freeze({
      phase: 'success',
      token,
      task: state.status.task,
      fileName,
    }),
  });
}

export function failExport(
  state: ExportCompletionState,
  token: number,
  message: string,
): ExportCompletionState {
  if (state.status.phase !== 'running' || state.status.token !== token) {
    return state;
  }
  return freezeState({
    ...state,
    status: Object.freeze({
      phase: 'error',
      token,
      task: state.status.task,
      message,
    }),
  });
}

export function exportTaskDefinition(task: ExportTaskId): ExportTaskDefinition {
  const definition = EXPORT_TASKS.find((candidate) => candidate.id === task);
  if (!definition) {
    throw new Error('未知导出任务。');
  }
  return definition;
}

export function exportDownloadActionLabel(task: ExportTaskId): string {
  const definition = exportTaskDefinition(task);
  return `下载${task === 'saveProject' ? '项目文件' : definition.label}`;
}

function freezeState(state: ExportCompletionState): ExportCompletionState {
  return Object.freeze(state);
}

function assertToken(token: number): void {
  if (!Number.isSafeInteger(token) || token < 1) {
    throw new Error('导出请求令牌必须是正整数。');
  }
}
