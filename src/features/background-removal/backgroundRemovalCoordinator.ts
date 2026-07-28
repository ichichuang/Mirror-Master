import type { SelectedImage } from './sourceImageSession';

export interface BackgroundRemovalRequest {
  readonly sourceSessionId: number;
  readonly image: SelectedImage;
}

export type BackgroundRemovalCoordinatorEvent =
  | {
      readonly type: 'started';
      readonly requestId: number;
    }
  | {
      readonly type: 'succeeded';
      readonly requestId: number;
      readonly result: SelectedImage;
    }
  | {
      readonly type: 'failed';
      readonly requestId: number;
      readonly error: unknown;
    };

export interface BackgroundRemovalCoordinatorOptions {
  readonly remove: (input: BackgroundRemovalRequest, signal: AbortSignal) => Promise<SelectedImage>;
  readonly currentSourceSessionId: () => number | null;
  readonly onDiscard: (result: SelectedImage) => void;
  readonly onEvent: (event: BackgroundRemovalCoordinatorEvent) => void;
}

export interface BackgroundRemovalCoordinator {
  readonly request: (input: BackgroundRemovalRequest) => number | null;
  readonly cancel: () => void;
  readonly activeRequestId: () => number | null;
  readonly destroy: () => void;
}

export function createBackgroundRemovalCoordinator(
  options: BackgroundRemovalCoordinatorOptions,
): BackgroundRemovalCoordinator {
  let controller: AbortController | null = null;
  let latestRequestId = 0;
  let destroyed = false;

  return Object.freeze({
    request(input: BackgroundRemovalRequest): number | null {
      if (destroyed) {
        throw new Error('去背景协调器已销毁。');
      }
      if (controller !== null && !controller.signal.aborted) {
        return null;
      }
      const next = new AbortController();
      controller = next;
      const requestId = ++latestRequestId;
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
      latestRequestId += 1;
      controller?.abort();
      controller = null;
    },
  });

  async function settle(
    current: AbortController,
    requestId: number,
    input: BackgroundRemovalRequest,
  ): Promise<void> {
    try {
      const result = await options.remove(input, current.signal);
      if (!isCurrent(current, requestId, input.sourceSessionId)) {
        options.onDiscard(result);
        if (controller === current) {
          controller = null;
        }
        return;
      }
      controller = null;
      options.onEvent({ type: 'succeeded', requestId, result });
    } catch (error) {
      if (
        !isCurrent(current, requestId, input.sourceSessionId) ||
        current.signal.aborted ||
        isAbortError(error)
      ) {
        if (controller === current) {
          controller = null;
        }
        return;
      }
      controller = null;
      options.onEvent({ type: 'failed', requestId, error });
    }
  }

  function isCurrent(
    candidate: AbortController,
    requestId: number,
    sourceSessionId: number,
  ): boolean {
    return (
      !destroyed &&
      controller === candidate &&
      requestId === latestRequestId &&
      options.currentSourceSessionId() === sourceSessionId
    );
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
