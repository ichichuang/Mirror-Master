import type { BeadProject } from '../../domain/project';
import type { PngExportConfiguration } from './pngExportConfiguration';
import { pngExportConfigurationSignature, type RenderPngExportInput } from './pngExportRenderer';

export interface PngExportPreviewInput {
  readonly project: BeadProject;
  readonly configuration: PngExportConfiguration;
  readonly colorHexById: ReadonlyMap<string, string>;
  readonly colorCodeById: ReadonlyMap<string, string>;
}

export interface PngExportPreviewResult {
  readonly token: number;
  readonly revision: number;
  readonly configurationSignature: string;
  readonly canvas: HTMLCanvasElement;
  readonly blob: Blob;
}

export type PngExportPreviewState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'rendering'; readonly token: number }
  | {
      readonly phase: 'ready';
      readonly token: number;
      readonly result: PngExportPreviewResult;
    }
  | { readonly phase: 'error'; readonly token: number; readonly message: string };

export interface PngExportPreviewCoordinatorDependencies {
  readonly createCanvas: () => HTMLCanvasElement;
  readonly render: (canvas: HTMLCanvasElement, input: RenderPngExportInput) => unknown;
  readonly encode: (canvas: HTMLCanvasElement) => Promise<Blob>;
  readonly scheduleFrame: (callback: () => void) => number;
  readonly cancelFrame: (handle: number) => void;
  readonly onStateChange?: (state: PngExportPreviewState) => void;
}

export interface PngExportPreviewCoordinator {
  readonly schedule: (input: PngExportPreviewInput) => number;
  readonly result: () => PngExportPreviewResult | null;
  readonly state: () => PngExportPreviewState;
  readonly invalidate: () => void;
  readonly destroy: () => void;
}

const idleState = (): PngExportPreviewState => Object.freeze({ phase: 'idle' });

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : '图片预览生成失败，请调整设置后重试。';

export const createPngExportPreviewCoordinator = (
  dependencies: PngExportPreviewCoordinatorDependencies,
): PngExportPreviewCoordinator => {
  let nextToken = 0;
  let activeToken: number | null = null;
  let frameHandle: number | null = null;
  let currentResult: PngExportPreviewResult | null = null;
  let currentState: PngExportPreviewState = idleState();
  let destroyed = false;

  const publish = (state: PngExportPreviewState): void => {
    currentState = Object.freeze(state);
    dependencies.onStateChange?.(currentState);
  };

  const cancelScheduledFrame = (): void => {
    if (frameHandle === null) {
      return;
    }

    dependencies.cancelFrame(frameHandle);
    frameHandle = null;
  };

  const invalidate = (): void => {
    cancelScheduledFrame();
    activeToken = null;
    currentResult = null;
    publish(idleState());
  };

  const schedule = (input: PngExportPreviewInput): number => {
    if (destroyed) {
      throw new Error('图片预览控制器已经销毁。');
    }

    cancelScheduledFrame();
    const token = ++nextToken;
    activeToken = token;
    currentResult = null;
    publish({ phase: 'rendering', token });

    frameHandle = dependencies.scheduleFrame(() => {
      frameHandle = null;
      if (destroyed || activeToken !== token) {
        return;
      }

      const canvas = dependencies.createCanvas();

      try {
        dependencies.render(canvas, {
          project: input.project,
          configuration: input.configuration,
          colorHexById: input.colorHexById,
          colorCodeById: input.colorCodeById,
        });
      } catch (error) {
        publish({ phase: 'error', token, message: errorMessage(error) });
        return;
      }

      void dependencies
        .encode(canvas)
        .then((blob) => {
          if (destroyed || activeToken !== token) {
            return;
          }

          if (blob.type !== 'image/png') {
            throw new Error('图片预览编码失败，请稍后重试。');
          }

          const result: PngExportPreviewResult = Object.freeze({
            token,
            revision: input.project.revision,
            configurationSignature: pngExportConfigurationSignature(input.configuration),
            canvas,
            blob,
          });

          currentResult = result;
          publish({ phase: 'ready', token, result });
        })
        .catch((error: unknown) => {
          if (!destroyed && activeToken === token) {
            currentResult = null;
            publish({ phase: 'error', token, message: errorMessage(error) });
          }
        });
    });

    return token;
  };

  return Object.freeze({
    schedule,
    result: () => currentResult,
    state: () => currentState,
    invalidate,
    destroy: () => {
      if (destroyed) {
        return;
      }

      destroyed = true;
      invalidate();
    },
  });
};
