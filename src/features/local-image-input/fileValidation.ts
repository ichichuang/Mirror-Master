import {
  ACCEPTED_IMAGE_TYPES,
  type AcceptedImageMimeType,
  type DecodedImage,
  type FileValidationResult,
} from './types';

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;
const DEFAULT_IMAGE_VALIDATION_LIMITS: ImageValidationLimits = Object.freeze({
  mimeTypes: Object.freeze(Object.keys(ACCEPTED_IMAGE_TYPES) as AcceptedImageMimeType[]),
  maximumBytes: 20 * 1024 * 1024,
});

export interface ImageValidationLimits {
  readonly mimeTypes: readonly AcceptedImageMimeType[];
  readonly maximumBytes: number;
}

export function validateSingleImageFile(
  files: readonly File[],
  limits: ImageValidationLimits = DEFAULT_IMAGE_VALIDATION_LIMITS,
): FileValidationResult {
  if (files.length === 0) {
    return {
      ok: false,
      message: '没有检测到图片文件。请选择一张 PNG、JPEG 或 WebP 图片。',
    };
  }

  if (files.length > 1) {
    return {
      ok: false,
      message: '一次只能选择一张图片。请只拖入或选择一个 PNG、JPEG 或 WebP 文件。',
    };
  }

  const [file] = files;

  if (!file) {
    return {
      ok: false,
      message: '没有检测到图片文件。请选择一张 PNG、JPEG 或 WebP 图片。',
    };
  }

  if (!isAcceptedImageType(file.type, limits.mimeTypes)) {
    const detectedType = file.type.trim() === '' ? '未知格式' : file.type;
    const acceptedLabels = limits.mimeTypes.map((type) => ACCEPTED_IMAGE_TYPES[type]).join('、');

    return {
      ok: false,
      message: `不支持 ${detectedType}。当前只支持 ${acceptedLabels} 图片。`,
    };
  }

  if (file.size > limits.maximumBytes) {
    return {
      ok: false,
      message: `图片大小为 ${formatFileSize(file.size)}，超过 ${formatFileSize(
        limits.maximumBytes,
      )} 上限。请压缩图片后重试。`,
    };
  }

  if (file.size === 0) {
    return {
      ok: false,
      message: '这张图片是空文件，请重新选择。',
    };
  }

  return {
    ok: true,
    file,
    mimeType: file.type,
    format: ACCEPTED_IMAGE_TYPES[file.type],
  };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '未知大小';
  }

  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }

  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 || unitIndex === 0 ? 1 : 2;
  const fallbackUnit: (typeof BYTE_UNITS)[number] = 'GB';
  const unit = BYTE_UNITS[unitIndex] ?? fallbackUnit;

  return `${value.toFixed(precision)} ${unit}`;
}

function isAcceptedImageType(
  type: string,
  allowedMimeTypes: readonly AcceptedImageMimeType[],
): type is AcceptedImageMimeType {
  return (
    Object.hasOwn(ACCEPTED_IMAGE_TYPES, type) &&
    allowedMimeTypes.includes(type as AcceptedImageMimeType)
  );
}

export function toDecodedImage(
  file: File,
  mimeType: AcceptedImageMimeType,
  format: DecodedImage['format'],
  width: number,
  height: number,
  objectUrl: string,
): DecodedImage {
  return {
    fileName: file.name,
    format,
    mimeType,
    size: file.size,
    sizeText: formatFileSize(file.size),
    width,
    height,
    objectUrl,
  };
}
