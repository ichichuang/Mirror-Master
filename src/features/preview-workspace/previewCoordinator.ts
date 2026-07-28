import type { PatternGenerationResult, PatternGenerationSettings } from '../pattern-api/client';

export const PREVIEW_STATUS_TEXT = Object.freeze({
  reading: '正在读取图片…',
  analyzing: '正在为这张图片选择合适设置…',
  generating: '正在更新拼豆预览…',
  degraded: '当前使用兼容模式生成预览',
  failure: '无法生成预览。保留当前结果，可重试或调整图片。',
} as const);

export type PreviewStatusKind = keyof typeof PREVIEW_STATUS_TEXT | 'done';

export interface PreviewGenerationRequest {
  readonly file: File;
  readonly settings: PatternGenerationSettings;
}

export type PreviewCoordinatorEvent =
  | {
      readonly type: 'started';
      readonly requestId: number;
    }
  | {
      readonly type: 'succeeded';
      readonly requestId: number;
      readonly result: PatternGenerationResult;
    }
  | {
      readonly type: 'failed';
      readonly requestId: number;
      readonly error: unknown;
    };

export interface PreviewCoordinatorOptions {
  readonly generate: (
    request: PreviewGenerationRequest,
    signal: AbortSignal,
  ) => Promise<PatternGenerationResult>;
  readonly onEvent: (event: PreviewCoordinatorEvent) => void;
}

export interface PreviewCoordinator {
  readonly request: (input: PreviewGenerationRequest) => number;
  readonly cancel: () => void;
  readonly activeRequestId: () => number | null;
  readonly destroy: () => void;
}

export function createPreviewCoordinator(options: PreviewCoordinatorOptions): PreviewCoordinator {
  let controller: AbortController | null = null;
  let latestRequestId = 0;
  let destroyed = false;

  return Object.freeze({
    request(input: PreviewGenerationRequest): number {
      if (destroyed) {
        throw new Error('预览协调器已销毁。');
      }
      controller?.abort();
      const next = new AbortController();
      controller = next;
      latestRequestId += 1;
      const requestId = latestRequestId;
      options.onEvent({ type: 'started', requestId });
      void settle(next, requestId, input);
      return requestId;
    },
    cancel(): void {
      if (destroyed) return;
      latestRequestId += 1;
      controller?.abort();
      controller = null;
    },
    activeRequestId(): number | null {
      return controller === null || controller.signal.aborted ? null : latestRequestId;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      controller?.abort();
      controller = null;
    },
  });

  async function settle(
    current: AbortController,
    requestId: number,
    input: PreviewGenerationRequest,
  ): Promise<void> {
    try {
      const result = await options.generate(input, current.signal);
      if (!isCurrent(current, requestId)) {
        return;
      }
      controller = null;
      options.onEvent({ type: 'succeeded', requestId, result });
    } catch (error) {
      if (!isCurrent(current, requestId) || current.signal.aborted || isAbortError(error)) {
        return;
      }
      controller = null;
      options.onEvent({ type: 'failed', requestId, error });
    }
  }

  function isCurrent(candidate: AbortController, requestId: number): boolean {
    return !destroyed && controller === candidate && requestId === latestRequestId;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
