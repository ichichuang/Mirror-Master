export class ImageTransformApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ImageTransformApiError';
    this.status = status;
    this.code = code;
  }
}

export type BackgroundRemovalFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export async function removeImageBackground(
  file: File,
  signal?: AbortSignal,
  fetcher: BackgroundRemovalFetcher = globalThis.fetch,
): Promise<Blob> {
  const form = new FormData();
  form.set('file', file);

  let response: Response;
  try {
    response = await fetcher('/api/image/remove-background', {
      method: 'POST',
      body: form,
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw new DOMException('请求已取消。', 'AbortError');
    }
    throw new ImageTransformApiError(
      0,
      'SERVICE_UNREACHABLE',
      '无法连接去背景服务。原图和当前图纸已保留，请稍后重试。',
    );
  }

  if (!response.ok) {
    throw await readApiError(response);
  }

  const contentType = response.headers.get('Content-Type')?.split(';')[0]?.trim();
  const output = await response.blob();
  if (contentType !== 'image/png' || output.size === 0) {
    throw new ImageTransformApiError(
      502,
      'BACKGROUND_REMOVAL_RESPONSE_INVALID',
      '去背景服务返回了无效图片。原图和当前图纸已保留，请稍后重试。',
    );
  }
  return output;
}

async function readApiError(response: Response): Promise<ImageTransformApiError> {
  const fallbackMessage = `一键去背景请求失败（${String(response.status)}）。原图和当前图纸已保留。`;
  try {
    const payload: unknown = await response.json();
    const record = asRecord(payload);
    const error = asRecord(record?.error);
    const code = typeof error?.code === 'string' ? error.code : 'BACKGROUND_REMOVAL_REQUEST_FAILED';
    const message = typeof error?.message === 'string' ? error.message : fallbackMessage;
    return new ImageTransformApiError(response.status, code, message);
  } catch {
    return new ImageTransformApiError(
      response.status,
      'BACKGROUND_REMOVAL_REQUEST_FAILED',
      fallbackMessage,
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}
