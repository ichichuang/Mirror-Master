export interface XhsExtractionImage {
  readonly id: number;
  readonly previewUrl: string;
}

export interface XhsExtraction {
  readonly extractionId: string;
  readonly images: readonly XhsExtractionImage[];
}

export class XhsImportApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'XhsImportApiError';
    this.status = status;
    this.code = code;
  }
}

export type XhsImportFetcher = (input: string, init?: RequestInit) => Promise<Response>;
export type XhsDownloadSink = (blob: Blob, fileName: string) => void;

export async function createXhsExtraction(
  shareText: string,
  signal?: AbortSignal,
  fetcher: XhsImportFetcher = globalThis.fetch,
): Promise<XhsExtraction> {
  const response = await sendRequest(
    '/api/xhs/extractions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareText }),
      ...(signal ? { signal } : {}),
    },
    signal,
    fetcher,
  );
  const payload: unknown = await response.json();
  const record = asRecord(payload);
  const extractionId = typeof record?.extractionId === 'string' ? record.extractionId : '';
  if (!extractionId || !Array.isArray(record?.images)) {
    throw invalidResponse();
  }
  const images = record.images.map((value) => parseImage(value, extractionId));
  if (images.length === 0 || new Set(images.map((image) => image.id)).size !== images.length) {
    throw invalidResponse();
  }
  return Object.freeze({ extractionId, images: Object.freeze(images) });
}

export async function fetchXhsImage(
  extractionId: string,
  imageId: number,
  signal?: AbortSignal,
  fetcher: XhsImportFetcher = globalThis.fetch,
): Promise<File> {
  const response = await sendRequest(
    `/api/xhs/extractions/${encodeURIComponent(extractionId)}/images/${String(imageId)}`,
    signal ? { signal } : {},
    signal,
    fetcher,
  );
  const mimeType = response.headers.get('Content-Type')?.split(';', 1)[0]?.trim() ?? '';
  const extension = extensionForMimeType(mimeType);
  const blob = await response.blob();
  if (!extension || blob.size === 0) {
    throw invalidResponse();
  }
  return new File([blob], `xiaohongshu-${String(imageId + 1).padStart(2, '0')}.${extension}`, {
    type: mimeType,
  });
}

export async function downloadXhsImages(
  extractionId: string,
  imageIds: readonly number[],
  signal?: AbortSignal,
  fetcher: XhsImportFetcher = globalThis.fetch,
  sink: XhsDownloadSink = saveBlob,
): Promise<void> {
  const response = await sendRequest(
    `/api/xhs/extractions/${encodeURIComponent(extractionId)}/download`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageIds }),
      ...(signal ? { signal } : {}),
    },
    signal,
    fetcher,
  );
  const blob = await response.blob();
  if (blob.size === 0) throw invalidResponse();
  sink(blob, responseFileName(response));
}

async function sendRequest(
  input: string,
  init: RequestInit,
  signal: AbortSignal | undefined,
  fetcher: XhsImportFetcher,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetcher(input, init);
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw new DOMException('请求已取消。', 'AbortError');
    }
    throw new XhsImportApiError(0, 'SERVICE_UNREACHABLE', '无法连接图片提取服务，请稍后重试。');
  }
  if (!response.ok) throw await readApiError(response);
  return response;
}

async function readApiError(response: Response): Promise<XhsImportApiError> {
  const fallback = `图片提取请求失败（${String(response.status)}）。`;
  try {
    const payload: unknown = await response.json();
    const error = asRecord(asRecord(payload)?.error);
    return new XhsImportApiError(
      response.status,
      typeof error?.code === 'string' ? error.code : 'XHS_REQUEST_FAILED',
      typeof error?.message === 'string' ? error.message : fallback,
    );
  } catch {
    return new XhsImportApiError(response.status, 'XHS_REQUEST_FAILED', fallback);
  }
}

function parseImage(value: unknown, extractionId: string): XhsExtractionImage {
  const record = asRecord(value);
  const id = record?.id;
  const previewUrl = record?.previewUrl;
  const expectedPrefix = `/api/xhs/extractions/${extractionId}/images/`;
  if (
    typeof id !== 'number' ||
    !Number.isInteger(id) ||
    id < 0 ||
    typeof previewUrl !== 'string' ||
    !previewUrl.startsWith(expectedPrefix)
  ) {
    throw invalidResponse();
  }
  return Object.freeze({ id, previewUrl });
}

function extensionForMimeType(mimeType: string): 'jpg' | 'png' | 'webp' | null {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return null;
}

function responseFileName(response: Response): string {
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/iu.exec(disposition);
  if (match?.[1]) return match[1];
  return response.headers.get('Content-Type')?.startsWith('image/')
    ? 'xiaohongshu-image.jpg'
    : 'xiaohongshu-images.zip';
}

function saveBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

function invalidResponse(): XhsImportApiError {
  return new XhsImportApiError(502, 'XHS_RESPONSE_INVALID', '图片提取服务返回了无效内容。');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}
