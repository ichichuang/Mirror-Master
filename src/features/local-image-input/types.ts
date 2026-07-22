export const ACCEPTED_IMAGE_TYPES = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
} as const;

export const ACCEPTED_IMAGE_ACCEPT = Object.keys(ACCEPTED_IMAGE_TYPES).join(',');

export type AcceptedImageMimeType = keyof typeof ACCEPTED_IMAGE_TYPES;

export interface DecodedImage {
  readonly fileName: string;
  readonly format: (typeof ACCEPTED_IMAGE_TYPES)[AcceptedImageMimeType];
  readonly mimeType: AcceptedImageMimeType;
  readonly size: number;
  readonly sizeText: string;
  readonly width: number;
  readonly height: number;
  readonly objectUrl: string;
}

export type ImageInputStatus = 'empty' | 'loading' | 'ready' | 'error';

export interface LocalImageReadyPayload {
  readonly file: File;
  readonly image: DecodedImage;
  readonly dimensions: ImageDimensions;
}

export interface LocalImageClearedPayload {
  readonly previousImage: DecodedImage | null;
  readonly reason: 'replacement-started' | 'reset';
}

export interface LocalImageInputLifecycle {
  readonly onImageReady?: (payload: LocalImageReadyPayload) => void;
  readonly onImageCleared?: (payload: LocalImageClearedPayload) => void;
}

export interface ImageInputState {
  readonly status: ImageInputStatus;
  readonly selectedImage: DecodedImage | null;
  readonly message: string;
  readonly pendingFileName: string | null;
}

export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

export type FileValidationResult =
  | {
      readonly ok: true;
      readonly file: File;
      readonly mimeType: AcceptedImageMimeType;
      readonly format: DecodedImage['format'];
    }
  | {
      readonly ok: false;
      readonly message: string;
    };
