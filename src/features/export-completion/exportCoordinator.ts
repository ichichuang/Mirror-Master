import { brandConfig } from '../../brand/brand.config';
import {
  captureProjectRevision,
  exportProjectCsv,
  exportProjectJson,
  safeDownloadBaseName,
} from '../../domain/export';
import type { BeadProject } from '../../domain/project';
import { PatternApiError } from '../pattern-api/client';
import { exportTaskDefinition, type ExportPngTemplate, type ExportTaskId } from './exportState';

export interface ExportPatternRequest {
  readonly project: BeadProject;
  readonly format: 'png' | 'pdf' | 'csv';
  readonly template: ExportPngTemplate;
  readonly signal: AbortSignal;
}

export type ExportCoordinatorEvent =
  | {
      readonly phase: 'running';
      readonly token: number;
      readonly task: ExportTaskId;
      readonly message: string;
    }
  | {
      readonly phase: 'success';
      readonly token: number;
      readonly task: ExportTaskId;
      readonly fileName: string;
      readonly message: string;
    }
  | {
      readonly phase: 'error';
      readonly token: number;
      readonly task: ExportTaskId;
      readonly message: string;
    }
  | {
      readonly phase: 'cancelled';
      readonly token: number;
      readonly task: ExportTaskId;
      readonly message: string;
    };

export interface ExportCoordinatorDependencies {
  readonly requestPatternExport: (request: ExportPatternRequest) => Promise<Blob>;
  readonly isOnline: () => boolean;
  readonly now: () => Date;
  readonly createObjectURL: (blob: Blob) => string;
  readonly revokeObjectURL: (objectUrl: string) => void;
  readonly triggerDownload: (objectUrl: string, fileName: string) => void;
  readonly schedule?: (callback: () => void) => void;
  readonly onEvent?: (event: ExportCoordinatorEvent) => void;
}

export interface StartExportInput {
  readonly project: BeadProject;
  readonly task: ExportTaskId;
  readonly pngTemplate: ExportPngTemplate;
}

export type ExportCoordinatorResult =
  | {
      readonly outcome: 'downloaded';
      readonly token: number;
      readonly task: ExportTaskId;
      readonly fileName: string;
    }
  | {
      readonly outcome: 'stale';
      readonly token: number;
      readonly task: ExportTaskId;
    }
  | {
      readonly outcome: 'failed';
      readonly token: number;
      readonly task: ExportTaskId;
      readonly message: string;
    };

export interface ExportCoordinator {
  readonly start: (input: StartExportInput) => Promise<ExportCoordinatorResult>;
  readonly invalidate: (message?: string) => void;
  readonly activeToken: () => number | null;
  readonly destroy: () => void;
}

interface ActiveExport {
  readonly token: number;
  readonly task: ExportTaskId;
  readonly controller: AbortController;
}

export function createExportCoordinator({
  requestPatternExport,
  isOnline,
  now,
  createObjectURL,
  revokeObjectURL,
  triggerDownload,
  schedule = scheduleLater,
  onEvent,
}: ExportCoordinatorDependencies): ExportCoordinator {
  let nextToken = 0;
  let active: ActiveExport | null = null;
  let destroyed = false;

  return Object.freeze({
    async start(input: StartExportInput): Promise<ExportCoordinatorResult> {
      if (destroyed) {
        throw new Error('导出协调器已销毁。');
      }
      cancelActive();
      const token = nextToken + 1;
      nextToken = token;
      const controller = new AbortController();
      const task = input.task;
      active = Object.freeze({ token, task, controller });
      const project = captureProjectRevision(input.project);
      const definition = exportTaskDefinition(task);

      onEvent?.(
        Object.freeze({
          phase: 'running',
          token,
          task,
          message: `正在准备${definition.label}…`,
        }),
      );

      try {
        const blob = await createExportBlob(
          project,
          task,
          input.pngTemplate,
          controller.signal,
          requestPatternExport,
          isOnline,
        );
        if (!isCurrent(token, controller)) {
          return staleResult(token, task);
        }

        const objectUrl = createObjectURL(blob);
        if (!isCurrent(token, controller)) {
          revokeObjectURL(objectUrl);
          return staleResult(token, task);
        }

        const fileName = customerExportFileName(task, now());
        try {
          if (!isCurrent(token, controller)) {
            revokeObjectURL(objectUrl);
            return staleResult(token, task);
          }
          triggerDownload(objectUrl, fileName);
        } catch (error) {
          revokeObjectURL(objectUrl);
          throw error;
        }
        schedule(() => {
          revokeObjectURL(objectUrl);
        });

        if (!isCurrent(token, controller)) {
          return staleResult(token, task);
        }
        active = null;
        onEvent?.(
          Object.freeze({
            phase: 'success',
            token,
            task,
            fileName,
            message: `${definition.label}已下载。`,
          }),
        );
        return Object.freeze({ outcome: 'downloaded', token, task, fileName });
      } catch (error) {
        if (!isCurrent(token, controller) || controller.signal.aborted || isAbortError(error)) {
          return staleResult(token, task);
        }
        active = null;
        const message = error instanceof PatternApiError ? error.message : '导出失败，请稍后重试。';
        onEvent?.(Object.freeze({ phase: 'error', token, task, message }));
        return Object.freeze({ outcome: 'failed', token, task, message });
      }
    },
    invalidate(message?: string): void {
      if (destroyed) {
        return;
      }
      cancelActive(message);
    },
    activeToken(): number | null {
      return active?.token ?? null;
    },
    destroy(): void {
      if (destroyed) {
        return;
      }
      cancelActive();
      destroyed = true;
    },
  });

  function cancelActive(message?: string): void {
    const cancelled = active;
    if (!cancelled) {
      return;
    }
    active = null;
    cancelled.controller.abort();
    if (message) {
      onEvent?.(
        Object.freeze({
          phase: 'cancelled',
          token: cancelled.token,
          task: cancelled.task,
          message,
        }),
      );
    }
  }

  function isCurrent(token: number, controller: AbortController): boolean {
    return (
      !destroyed &&
      !controller.signal.aborted &&
      active?.token === token &&
      active.controller === controller
    );
  }
}

export function customerExportFileName(task: ExportTaskId, date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new Error('导出日期无效。');
  }
  const definition = exportTaskDefinition(task);
  const productName = safeDownloadBaseName(brandConfig.productName);
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${productName}-${definition.fileLabel}-${year}${month}${day}.${definition.format}`;
}

async function createExportBlob(
  project: BeadProject,
  task: ExportTaskId,
  pngTemplate: ExportPngTemplate,
  signal: AbortSignal,
  requestPatternExport: ExportCoordinatorDependencies['requestPatternExport'],
  isOnline: ExportCoordinatorDependencies['isOnline'],
): Promise<Blob> {
  if (task === 'saveProject') {
    return new Blob([exportProjectJson(project)], { type: 'application/json;charset=utf-8' });
  }
  if (task === 'materialsList' && !isOnline()) {
    return csvBlob(project);
  }

  const definition = exportTaskDefinition(task);
  const format = definition.format;
  if (format === 'json') {
    throw new Error('保存项目必须使用本地项目导出。');
  }
  try {
    return await requestPatternExport({
      project,
      format,
      template: task === 'shareImage' ? pngTemplate : 'annotated',
      signal,
    });
  } catch (error) {
    if (
      task === 'materialsList' &&
      error instanceof PatternApiError &&
      error.code === 'SERVICE_UNREACHABLE'
    ) {
      return csvBlob(project);
    }
    throw error;
  }
}

function csvBlob(project: BeadProject): Blob {
  return new Blob([exportProjectCsv(project)], { type: 'text/csv;charset=utf-8' });
}

function staleResult(token: number, task: ExportTaskId): ExportCoordinatorResult {
  return Object.freeze({ outcome: 'stale', token, task });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function scheduleLater(callback: () => void): void {
  globalThis.setTimeout(callback, 0);
}
