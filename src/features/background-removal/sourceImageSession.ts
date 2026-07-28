export interface SelectedImage {
  readonly file: File;
  readonly objectUrl: string;
  readonly width: number;
  readonly height: number;
  readonly image: HTMLImageElement;
  readonly mimeType: string;
}

export type SourceImageVariant = 'original' | 'foreground';

export interface SourceImageSession {
  readonly id: number;
  readonly original: SelectedImage;
  readonly active: () => SelectedImage;
  readonly activeVariant: () => SourceImageVariant;
  readonly hasForeground: () => boolean;
  readonly cacheForeground: (image: SelectedImage) => void;
  readonly activate: (variant: SourceImageVariant) => SelectedImage;
  readonly dispose: () => void;
}

export interface SourceImageSessionOptions {
  readonly revokeObjectUrl: (objectUrl: string) => void;
}

let nextSessionId = 0;

export function createSourceImageSession(
  original: SelectedImage,
  options: SourceImageSessionOptions,
): SourceImageSession {
  const id = ++nextSessionId;
  let foreground: SelectedImage | null = null;
  let variant: SourceImageVariant = 'original';
  let disposed = false;

  return Object.freeze({
    id,
    original,
    active(): SelectedImage {
      assertActive();
      return variant === 'foreground' && foreground ? foreground : original;
    },
    activeVariant(): SourceImageVariant {
      assertActive();
      return variant;
    },
    hasForeground(): boolean {
      return !disposed && foreground !== null;
    },
    cacheForeground(image: SelectedImage): void {
      assertActive();
      if (foreground && foreground.objectUrl !== image.objectUrl) {
        options.revokeObjectUrl(foreground.objectUrl);
      }
      foreground = image;
    },
    activate(nextVariant: SourceImageVariant): SelectedImage {
      assertActive();
      if (nextVariant === 'foreground' && foreground === null) {
        throw new Error('尚未生成去背景图片。');
      }
      variant = nextVariant;
      return nextVariant === 'foreground' ? (foreground as SelectedImage) : original;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      options.revokeObjectUrl(original.objectUrl);
      if (foreground && foreground.objectUrl !== original.objectUrl) {
        options.revokeObjectUrl(foreground.objectUrl);
      }
      foreground = null;
    },
  });

  function assertActive(): void {
    if (disposed) {
      throw new Error('源图片会话已释放。');
    }
  }
}
