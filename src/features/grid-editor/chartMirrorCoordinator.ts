import type { GridDetectionContract } from '../grid-api/client';

export interface ChartMirrorCoordinator {
  readonly run: (
    file: File,
    contract: GridDetectionContract,
    axis: 'horizontal' | 'vertical',
  ) => Promise<Blob | null>;
  readonly cancel: () => void;
  readonly isRunning: () => boolean;
}

export interface ChartMirrorCoordinatorOptions {
  readonly request: (
    file: File,
    contract: GridDetectionContract,
    axis: 'horizontal' | 'vertical',
    signal: AbortSignal,
  ) => Promise<Blob>;
}

interface ActiveRequest {
  readonly token: number;
  readonly controller: AbortController;
}

export function createChartMirrorCoordinator(
  options: ChartMirrorCoordinatorOptions,
): ChartMirrorCoordinator {
  let nextToken = 0;
  let active: ActiveRequest | null = null;

  function isCurrent(request: ActiveRequest): boolean {
    return active !== null && active.token === request.token;
  }

  return Object.freeze({
    async run(
      file: File,
      contract: GridDetectionContract,
      axis: 'horizontal' | 'vertical',
    ): Promise<Blob | null> {
      active?.controller.abort();
      const request = Object.freeze({
        token: ++nextToken,
        controller: new AbortController(),
      });
      active = request;

      try {
        const blob = await options.request(file, contract, axis, request.controller.signal);
        return request.controller.signal.aborted || !isCurrent(request) ? null : blob;
      } catch (error) {
        if (request.controller.signal.aborted || !isCurrent(request)) {
          return null;
        }
        throw error;
      } finally {
        if (isCurrent(request)) {
          active = null;
        }
      }
    },
    cancel(): void {
      nextToken += 1;
      active?.controller.abort();
      active = null;
    },
    isRunning(): boolean {
      return active !== null;
    },
  });
}
