import { brandConfig } from '../../brand/brand.config';

export interface DetectionRectangle {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface GridDetectionContract extends DetectionRectangle {
  readonly imageSha256: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
  readonly xBoundaries: readonly number[];
  readonly yBoundaries: readonly number[];
  readonly confidence: number;
  readonly warning: string | null;
}

export class MirrorMasterApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'MirrorMasterApiError';
    this.status = status;
    this.code = code;
  }
}

export async function detectGrid(
  file: File,
  mode: 'auto' | 'manual',
  rectangle?: DetectionRectangle,
  signal?: AbortSignal,
): Promise<GridDetectionContract> {
  const form = new FormData();
  form.set('file', file);
  form.set('mode', mode);

  if (rectangle) {
    form.set('rectangle', JSON.stringify(rectangle));
  }

  const response = await request('/api/grid/detect', {
    method: 'POST',
    body: form,
    ...(signal ? { signal } : {}),
  });
  const payload: unknown = await response.json();
  return parseGridContract(payload);
}

export async function mirrorGrid(
  file: File,
  contract: GridDetectionContract,
  axis: 'horizontal' | 'vertical' = 'horizontal',
  signal?: AbortSignal,
): Promise<Blob> {
  const form = new FormData();
  form.set('file', file);
  form.set(
    'contract',
    JSON.stringify({
      ...contract,
      confirmed: true,
      axis,
    }),
  );

  const response = await request('/api/grid/mirror', {
    method: 'POST',
    body: form,
    ...(signal ? { signal } : {}),
  });
  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.toLowerCase().startsWith('image/png')) {
    throw new MirrorMasterApiError(502, 'RESULT_NOT_PNG', '服务未返回有效的 PNG 结果。');
  }

  return response.blob();
}

async function request(path: string, init: RequestInit): Promise<Response> {
  let response: Response;

  try {
    response = await fetch(path, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new MirrorMasterApiError(
      0,
      'SERVICE_UNREACHABLE',
      `无法连接${brandConfig.productName}服务，请确认服务正在运行。`,
    );
  }

  if (response.ok) {
    return response;
  }

  const fallbackMessage = `服务请求失败（${String(response.status)}）。`;

  try {
    const payload: unknown = await response.json();
    const record = asRecord(payload);
    const error = record ? asRecord(record.error) : null;
    const code = error && typeof error.code === 'string' ? error.code : 'REQUEST_FAILED';
    const message = error && typeof error.message === 'string' ? error.message : fallbackMessage;
    throw new MirrorMasterApiError(response.status, code, message);
  } catch (error) {
    if (error instanceof MirrorMasterApiError) {
      throw error;
    }

    throw new MirrorMasterApiError(response.status, 'REQUEST_FAILED', fallbackMessage);
  }
}

function parseGridContract(payload: unknown): GridDetectionContract {
  const value = asRecord(payload);

  if (!value) {
    throw invalidContract();
  }

  const imageSha256 = readString(value, 'imageSha256');
  const naturalWidth = readPositiveInteger(value, 'naturalWidth');
  const naturalHeight = readPositiveInteger(value, 'naturalHeight');
  const left = readInteger(value, 'left');
  const top = readInteger(value, 'top');
  const right = readInteger(value, 'right');
  const bottom = readInteger(value, 'bottom');
  const cellSize = readPositiveInteger(value, 'cellSize');
  const columns = readPositiveInteger(value, 'columns');
  const rows = readPositiveInteger(value, 'rows');
  const xBoundaries = readIntegerArray(value, 'xBoundaries');
  const yBoundaries = readIntegerArray(value, 'yBoundaries');
  const confidence = value.confidence;
  const warning = value.warning;

  if (
    !/^[0-9a-f]{64}$/.test(imageSha256) ||
    left < 0 ||
    top < 0 ||
    right > naturalWidth ||
    bottom > naturalHeight ||
    right <= left ||
    bottom <= top ||
    xBoundaries.length !== columns + 1 ||
    yBoundaries.length !== rows + 1 ||
    xBoundaries[0] !== left ||
    xBoundaries.at(-1) !== right ||
    yBoundaries[0] !== top ||
    yBoundaries.at(-1) !== bottom ||
    !hasExactSpacing(xBoundaries, cellSize) ||
    !hasExactSpacing(yBoundaries, cellSize) ||
    typeof confidence !== 'number' ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1 ||
    (warning !== null && typeof warning !== 'string')
  ) {
    throw invalidContract();
  }

  return Object.freeze({
    imageSha256,
    naturalWidth,
    naturalHeight,
    left,
    top,
    right,
    bottom,
    cellSize,
    columns,
    rows,
    xBoundaries: Object.freeze(xBoundaries),
    yBoundaries: Object.freeze(yBoundaries),
    confidence,
    warning,
  });
}

function hasExactSpacing(boundaries: readonly number[], cellSize: number): boolean {
  if (boundaries.length < 2) {
    return false;
  }

  for (let index = 1; index < boundaries.length; index += 1) {
    const previous = boundaries[index - 1];
    const current = boundaries[index];

    if (previous === undefined || current === undefined || current - previous !== cellSize) {
      return false;
    }
  }

  return true;
}

function readString(value: Record<string, unknown>, key: string): string {
  const field = value[key];

  if (typeof field !== 'string') {
    throw invalidContract();
  }

  return field;
}

function readInteger(value: Record<string, unknown>, key: string): number {
  const field = value[key];

  if (typeof field !== 'number' || !Number.isInteger(field)) {
    throw invalidContract();
  }

  return field;
}

function readPositiveInteger(value: Record<string, unknown>, key: string): number {
  const field = readInteger(value, key);

  if (field <= 0) {
    throw invalidContract();
  }

  return field;
}

function readIntegerArray(value: Record<string, unknown>, key: string): number[] {
  const field = value[key];

  if (!Array.isArray(field) || !field.every((item) => Number.isInteger(item))) {
    throw invalidContract();
  }

  return field as number[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function invalidContract(): MirrorMasterApiError {
  return new MirrorMasterApiError(
    502,
    'GRID_CONTRACT_INVALID',
    '服务返回的网格合同无效，请重新识别。',
  );
}
