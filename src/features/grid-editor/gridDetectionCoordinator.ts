import {
  detectGrid,
  type GridDetectionConstraints,
  type GridDetectionResult,
} from '../grid-api/client';

export interface GridDetectionCoordinator {
  readonly run: (
    file: File,
    mode: 'auto' | 'manual',
    constraints?: GridDetectionConstraints,
  ) => Promise<GridDetectionResult | null>;
  readonly cancel: () => void;
  readonly isRunning: () => boolean;
}

export interface GridDetectionCoordinatorOptions {
  readonly request: (
    file: File,
    mode: 'auto' | 'manual',
    constraints: GridDetectionConstraints | undefined,
    signal: AbortSignal,
  ) => Promise<GridDetectionResult>;
}

interface ActiveDetection {
  readonly token: number;
  readonly controller: AbortController;
}

export function createGridDetectionCoordinator(
  options: GridDetectionCoordinatorOptions = {
    request: detectGrid,
  },
): GridDetectionCoordinator {
  let nextToken = 0;
  let active: ActiveDetection | null = null;

  function isCurrent(request: ActiveDetection): boolean {
    return active !== null && active.token === request.token;
  }

  return Object.freeze({
    async run(
      file: File,
      mode: 'auto' | 'manual',
      constraints?: GridDetectionConstraints,
    ): Promise<GridDetectionResult | null> {
      active?.controller.abort();
      const request = Object.freeze({
        token: ++nextToken,
        controller: new AbortController(),
      });
      active = request;

      try {
        const result = await options.request(file, mode, constraints, request.controller.signal);
        return request.controller.signal.aborted || !isCurrent(request) ? null : result;
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
