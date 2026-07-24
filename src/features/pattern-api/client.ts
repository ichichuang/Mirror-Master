import {
  calculateStatistics,
  parseBeadProject,
  type BeadProject,
  type DitheringMode,
  type ImageRotation,
  type ProjectMode,
  type ProjectStatistics,
  type SamplingMode,
} from '../../domain/project';

export interface PatternGenerationSettings {
  readonly mode: ProjectMode;
  readonly crop: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly rotation: ImageRotation;
  readonly rows: number;
  readonly columns: number;
  readonly aspectLocked: boolean;
  readonly beadDiameterMm: number;
  readonly beadPitchMm: number;
  readonly boardPresetId: 'smallSquare' | 'standardSquare' | 'custom';
  readonly paletteId: 'default' | 'mard';
  readonly availableColorIds: readonly string[];
  readonly maximumColors: number | null;
  readonly sampling: SamplingMode;
  readonly dithering: DitheringMode;
  readonly alphaEmptyThreshold: number;
}

export interface PatternGenerationResult {
  readonly project: BeadProject;
  readonly statistics: ProjectStatistics;
}

export class PatternApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'PatternApiError';
    this.status = status;
    this.code = code;
  }
}

export async function generatePattern(
  file: File,
  settings: PatternGenerationSettings,
  signal?: AbortSignal,
): Promise<PatternGenerationResult> {
  const form = new FormData();
  form.set('file', file);
  form.set('settings', JSON.stringify(settings));
  const response = await request(
    '/api/pattern/generate',
    {
      method: 'POST',
      body: form,
      ...(signal ? { signal } : {}),
    },
    signal,
  );
  const payload: unknown = await response.json();
  const record = asRecord(payload);
  const project = parseBeadProject(record?.project);
  const statistics = calculateStatistics(project.cells);
  const suppliedStatistics = asRecord(record?.statistics);

  if (
    !suppliedStatistics ||
    suppliedStatistics.nonEmptyBeadCount !== statistics.nonEmptyBeadCount ||
    suppliedStatistics.blankCount !== statistics.blankCount ||
    suppliedStatistics.totalCellCount !== statistics.totalCellCount
  ) {
    throw new PatternApiError(502, 'PATTERN_STATISTICS_INVALID', '服务返回的材料数量不一致。');
  }

  return Object.freeze({ project, statistics });
}

export async function exportPattern(
  project: BeadProject,
  format: 'png' | 'pdf' | 'csv',
  includeGrid: boolean,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await request(
    '/api/pattern/export',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, format, includeGrid }),
      ...(signal ? { signal } : {}),
    },
    signal,
  );
  return response.blob();
}

async function request(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  let response: Response;

  try {
    response = await fetch(path, init);
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new DOMException('请求已取消。', 'AbortError');
    }
    throw new PatternApiError(0, 'SERVICE_UNREACHABLE', '无法连接服务，请稍后重试。');
  }

  if (response.ok) {
    return response;
  }

  const fallbackMessage = `请求失败（${String(response.status)}）。`;
  try {
    const payload: unknown = await response.json();
    const record = asRecord(payload);
    const error = asRecord(record?.error);
    const code = typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED';
    const message = typeof error?.message === 'string' ? error.message : fallbackMessage;
    throw new PatternApiError(response.status, code, message);
  } catch (error) {
    if (error instanceof PatternApiError) {
      throw error;
    }
    throw new PatternApiError(response.status, 'REQUEST_FAILED', fallbackMessage);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}
