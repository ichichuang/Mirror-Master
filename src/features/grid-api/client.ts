export interface DetectionRectangle {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

export interface GridEvidenceMetrics {
  readonly lineCoverage: number;
  readonly latticeInlierRatio: number;
  readonly normalizedResidual: number;
  readonly periodicityScore: number;
  readonly harmonicMargin: number;
  readonly boundarySupport: number;
  readonly cellConsistency: number;
  readonly hypothesisAgreement: number;
}

export interface GridCellSummary {
  readonly totalCellCount: number;
  readonly occupiedCellCount: number;
  readonly colorClusterCount: number;
  readonly uncertainCellCount: number;
  readonly matrixDigest: string;
}

export interface GridCandidateV2 {
  readonly candidateId: string;
  readonly detector: 'line' | 'component' | 'periodic' | 'rectified' | 'manual';
  readonly style: 'line-grid' | 'ring-grid' | 'filled-cell-grid' | 'mixed';
  readonly mirrorFrame: 'explicit-grid' | 'occupied-bounds' | 'manual-region';
  readonly sourceQuad: readonly [GridPoint, GridPoint, GridPoint, GridPoint];
  readonly rectifiedWidth: number;
  readonly rectifiedHeight: number;
  readonly pitchX: number;
  readonly pitchY: number;
  readonly columns: number;
  readonly rows: number;
  readonly xBoundaries: readonly number[];
  readonly yBoundaries: readonly number[];
  readonly confidence: number;
  readonly review: 'ready' | 'review';
  readonly metrics: GridEvidenceMetrics;
  readonly cellSummary: GridCellSummary;
  readonly warnings: readonly string[];
}

export interface GridDetectionResult {
  readonly contractVersion: '2.0';
  readonly imageSha256: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly selectedCandidateId: string;
  readonly candidates: readonly GridCandidateV2[];
}

export interface GridDetectionContract extends GridCandidateV2 {
  readonly contractVersion: '2.0';
  readonly imageSha256: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}

export interface GridDetectionConstraints {
  readonly rectangle?: DetectionRectangle;
  readonly quad?: readonly [GridPoint, GridPoint, GridPoint, GridPoint];
  readonly expectedColumns?: number;
  readonly expectedRows?: number;
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
  constraints?: DetectionRectangle | GridDetectionConstraints,
  signal?: AbortSignal,
): Promise<GridDetectionResult> {
  const form = new FormData();
  form.set('file', file);
  form.set('mode', mode);

  if (constraints) {
    const normalized = isDetectionRectangle(constraints) ? { rectangle: constraints } : constraints;
    if (normalized.rectangle) {
      form.set('rectangle', JSON.stringify(normalized.rectangle));
    }
    if (normalized.quad) {
      form.set('quad', JSON.stringify(normalized.quad));
    }
    if (normalized.expectedColumns !== undefined) {
      form.set('expectedColumns', String(normalized.expectedColumns));
    }
    if (normalized.expectedRows !== undefined) {
      form.set('expectedRows', String(normalized.expectedRows));
    }
  }

  const response = await request('/api/grid/detect', {
    method: 'POST',
    body: form,
    ...(signal ? { signal } : {}),
  });
  const payload: unknown = await response.json();
  return parseGridDetectionResult(payload);
}

export function candidateContract(
  result: GridDetectionResult,
  candidateId: string = result.selectedCandidateId,
): GridDetectionContract {
  const candidate = result.candidates.find((item) => item.candidateId === candidateId);
  if (!candidate) {
    throw invalidContract();
  }
  return Object.freeze({
    contractVersion: result.contractVersion,
    imageSha256: result.imageSha256,
    naturalWidth: result.naturalWidth,
    naturalHeight: result.naturalHeight,
    ...candidate,
  });
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
      contractVersion: contract.contractVersion,
      imageSha256: contract.imageSha256,
      naturalWidth: contract.naturalWidth,
      naturalHeight: contract.naturalHeight,
      candidateId: contract.candidateId,
      sourceQuad: contract.sourceQuad,
      rectifiedWidth: contract.rectifiedWidth,
      rectifiedHeight: contract.rectifiedHeight,
      pitchX: contract.pitchX,
      pitchY: contract.pitchY,
      columns: contract.columns,
      rows: contract.rows,
      xBoundaries: contract.xBoundaries,
      yBoundaries: contract.yBoundaries,
      matrixDigest: contract.cellSummary.matrixDigest,
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
    throw new MirrorMasterApiError(502, 'RESULT_NOT_PNG', '镜像结果无法打开，请重试。');
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
      customerRequestMessage(path, 'SERVICE_UNREACHABLE'),
    );
  }

  if (response.ok) {
    return response;
  }

  const fallbackMessage = customerRequestMessage(path, 'REQUEST_FAILED');

  try {
    const payload: unknown = await response.json();
    const record = asRecord(payload);
    const error = record ? asRecord(record.error) : null;
    const code = error && typeof error.code === 'string' ? error.code : 'REQUEST_FAILED';
    throw new MirrorMasterApiError(response.status, code, customerRequestMessage(path, code));
  } catch (error) {
    if (error instanceof MirrorMasterApiError) {
      throw error;
    }

    throw new MirrorMasterApiError(response.status, 'REQUEST_FAILED', fallbackMessage);
  }
}

function parseGridDetectionResult(payload: unknown): GridDetectionResult {
  const value = asRecord(payload);
  const expectedKeys = [
    'contractVersion',
    'imageSha256',
    'naturalWidth',
    'naturalHeight',
    'selectedCandidateId',
    'candidates',
  ];
  if (!value || !hasExactKeys(value, expectedKeys) || value.contractVersion !== '2.0') {
    throw invalidContract();
  }

  const imageSha256 = readString(value, 'imageSha256');
  const naturalWidth = readPositiveInteger(value, 'naturalWidth');
  const naturalHeight = readPositiveInteger(value, 'naturalHeight');
  const selectedCandidateId = readString(value, 'selectedCandidateId');
  if (
    !/^[0-9a-f]{64}$/.test(imageSha256) ||
    !Array.isArray(value.candidates) ||
    value.candidates.length < 1 ||
    value.candidates.length > 3
  ) {
    throw invalidContract();
  }

  const candidates = value.candidates.map((candidate) =>
    parseCandidate(candidate, naturalWidth, naturalHeight),
  );
  const ids = candidates.map((candidate) => candidate.candidateId);
  if (new Set(ids).size !== ids.length || !ids.includes(selectedCandidateId)) {
    throw invalidContract();
  }

  return Object.freeze({
    contractVersion: '2.0',
    imageSha256,
    naturalWidth,
    naturalHeight,
    selectedCandidateId,
    candidates: Object.freeze(candidates),
  });
}

function parseCandidate(
  payload: unknown,
  naturalWidth: number,
  naturalHeight: number,
): GridCandidateV2 {
  const value = asRecord(payload);
  const expectedKeys = [
    'candidateId',
    'detector',
    'style',
    'mirrorFrame',
    'sourceQuad',
    'rectifiedWidth',
    'rectifiedHeight',
    'pitchX',
    'pitchY',
    'columns',
    'rows',
    'xBoundaries',
    'yBoundaries',
    'confidence',
    'review',
    'metrics',
    'cellSummary',
    'warnings',
  ];
  if (!value || !hasExactKeys(value, expectedKeys)) {
    throw invalidContract();
  }

  const candidateId = readString(value, 'candidateId');
  const detector = readEnum(value, 'detector', [
    'line',
    'component',
    'periodic',
    'rectified',
    'manual',
  ] as const);
  const style = readEnum(value, 'style', [
    'line-grid',
    'ring-grid',
    'filled-cell-grid',
    'mixed',
  ] as const);
  const mirrorFrame = readEnum(value, 'mirrorFrame', [
    'explicit-grid',
    'occupied-bounds',
    'manual-region',
  ] as const);
  const rectifiedWidth = readPositiveInteger(value, 'rectifiedWidth');
  const rectifiedHeight = readPositiveInteger(value, 'rectifiedHeight');
  const pitchX = readPositiveNumber(value, 'pitchX');
  const pitchY = readPositiveNumber(value, 'pitchY');
  const columns = readBoundedInteger(value, 'columns', 2, 300);
  const rows = readBoundedInteger(value, 'rows', 2, 300);
  const xBoundaries = readIntegerArray(value, 'xBoundaries');
  const yBoundaries = readIntegerArray(value, 'yBoundaries');
  const confidence = readUnitNumber(value, 'confidence');
  const review = readEnum(value, 'review', ['ready', 'review'] as const);
  const sourceQuad = parseQuad(value.sourceQuad, naturalWidth, naturalHeight);
  const metrics = parseMetrics(value.metrics);
  const cellSummary = parseCellSummary(value.cellSummary, rows * columns);
  const warnings = readStringArray(value, 'warnings');

  if (
    !/^[a-z][a-z0-9-]{7,79}$/.test(candidateId) ||
    !validCanonicalAxis(xBoundaries, columns, rectifiedWidth, pitchX) ||
    !validCanonicalAxis(yBoundaries, rows, rectifiedHeight, pitchY) ||
    warnings.length > 8 ||
    !warnings.every((warning) => /^GRID_[A-Z0-9_]+$/.test(warning)) ||
    (review === 'ready' && warnings.length > 0)
  ) {
    throw invalidContract();
  }

  return Object.freeze({
    candidateId,
    detector,
    style,
    mirrorFrame,
    sourceQuad,
    rectifiedWidth,
    rectifiedHeight,
    pitchX,
    pitchY,
    columns,
    rows,
    xBoundaries: Object.freeze(xBoundaries),
    yBoundaries: Object.freeze(yBoundaries),
    confidence,
    review,
    metrics,
    cellSummary,
    warnings: Object.freeze(warnings),
  });
}

function parseQuad(
  payload: unknown,
  naturalWidth: number,
  naturalHeight: number,
): readonly [GridPoint, GridPoint, GridPoint, GridPoint] {
  if (!Array.isArray(payload) || payload.length !== 4) {
    throw invalidContract();
  }
  const points = payload.map((item) => {
    const value = asRecord(item);
    if (!value || !hasExactKeys(value, ['x', 'y'])) {
      throw invalidContract();
    }
    const x = readFiniteNumber(value, 'x');
    const y = readFiniteNumber(value, 'y');
    if (x < 0 || y < 0 || x > naturalWidth || y > naturalHeight) {
      throw invalidContract();
    }
    return Object.freeze({ x, y });
  });
  const crosses = points.map((current, index) => {
    const previous = points[(index + 3) % 4];
    const next = points[(index + 1) % 4];
    if (!previous || !next) throw invalidContract();
    return (
      (current.x - previous.x) * (next.y - current.y) -
      (current.y - previous.y) * (next.x - current.x)
    );
  });
  if (
    crosses.some((cross) => Math.abs(cross) < 1e-6) ||
    !(crosses.every((cross) => cross > 0) || crosses.every((cross) => cross < 0))
  ) {
    throw invalidContract();
  }
  return Object.freeze(points) as unknown as readonly [GridPoint, GridPoint, GridPoint, GridPoint];
}

function parseMetrics(payload: unknown): GridEvidenceMetrics {
  const value = asRecord(payload);
  const keys = [
    'lineCoverage',
    'latticeInlierRatio',
    'normalizedResidual',
    'periodicityScore',
    'harmonicMargin',
    'boundarySupport',
    'cellConsistency',
    'hypothesisAgreement',
  ];
  if (!value || !hasExactKeys(value, keys)) {
    throw invalidContract();
  }
  return Object.freeze({
    lineCoverage: readUnitNumber(value, 'lineCoverage'),
    latticeInlierRatio: readUnitNumber(value, 'latticeInlierRatio'),
    normalizedResidual: readUnitNumber(value, 'normalizedResidual'),
    periodicityScore: readUnitNumber(value, 'periodicityScore'),
    harmonicMargin: readUnitNumber(value, 'harmonicMargin'),
    boundarySupport: readUnitNumber(value, 'boundarySupport'),
    cellConsistency: readUnitNumber(value, 'cellConsistency'),
    hypothesisAgreement: readUnitNumber(value, 'hypothesisAgreement'),
  });
}

function parseCellSummary(payload: unknown, expectedTotal: number): GridCellSummary {
  const value = asRecord(payload);
  const keys = [
    'totalCellCount',
    'occupiedCellCount',
    'colorClusterCount',
    'uncertainCellCount',
    'matrixDigest',
  ];
  if (!value || !hasExactKeys(value, keys)) {
    throw invalidContract();
  }
  const totalCellCount = readPositiveInteger(value, 'totalCellCount');
  const occupiedCellCount = readBoundedInteger(value, 'occupiedCellCount', 0, totalCellCount);
  const colorClusterCount = readBoundedInteger(value, 'colorClusterCount', 0, occupiedCellCount);
  const uncertainCellCount = readBoundedInteger(value, 'uncertainCellCount', 0, totalCellCount);
  const matrixDigest = readString(value, 'matrixDigest');
  if (totalCellCount !== expectedTotal || !/^[0-9a-f]{64}$/.test(matrixDigest)) {
    throw invalidContract();
  }
  return Object.freeze({
    totalCellCount,
    occupiedCellCount,
    colorClusterCount,
    uncertainCellCount,
    matrixDigest,
  });
}

function validCanonicalAxis(
  boundaries: readonly number[],
  cells: number,
  extent: number,
  pitch: number,
): boolean {
  if (boundaries.length !== cells + 1 || boundaries[0] !== 0 || boundaries.at(-1) !== extent) {
    return false;
  }
  const steps = boundaries.slice(1).map((value, index) => value - (boundaries[index] ?? value));
  const expectedPitch = extent / cells;
  return (
    steps.every((step) => step > 0) &&
    Math.max(...steps) - Math.min(...steps) <= 1 &&
    Math.abs(pitch - expectedPitch) <= Math.max(0.51, expectedPitch * 0.02)
  );
}

function isDetectionRectangle(
  value: DetectionRectangle | GridDetectionConstraints,
): value is DetectionRectangle {
  return 'left' in value && 'top' in value && 'right' in value && 'bottom' in value;
}

function readString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string') throw invalidContract();
  return field;
}

function readFiniteNumber(value: Record<string, unknown>, key: string): number {
  const field = value[key];
  if (typeof field !== 'number' || !Number.isFinite(field)) throw invalidContract();
  return field;
}

function readPositiveNumber(value: Record<string, unknown>, key: string): number {
  const field = readFiniteNumber(value, key);
  if (field <= 0) throw invalidContract();
  return field;
}

function readUnitNumber(value: Record<string, unknown>, key: string): number {
  const field = readFiniteNumber(value, key);
  if (field < 0 || field > 1) throw invalidContract();
  return field;
}

function readInteger(value: Record<string, unknown>, key: string): number {
  const field = readFiniteNumber(value, key);
  if (!Number.isInteger(field)) throw invalidContract();
  return field;
}

function readPositiveInteger(value: Record<string, unknown>, key: string): number {
  const field = readInteger(value, key);
  if (field <= 0) throw invalidContract();
  return field;
}

function readBoundedInteger(
  value: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number,
): number {
  const field = readInteger(value, key);
  if (field < minimum || field > maximum) throw invalidContract();
  return field;
}

function readIntegerArray(value: Record<string, unknown>, key: string): number[] {
  const field = value[key];
  if (!Array.isArray(field) || !field.every((item) => Number.isInteger(item))) {
    throw invalidContract();
  }
  return field as number[];
}

function readStringArray(value: Record<string, unknown>, key: string): string[] {
  const field = value[key];
  if (!Array.isArray(field) || !field.every((item) => typeof item === 'string')) {
    throw invalidContract();
  }
  return field;
}

function readEnum<const Values extends readonly string[]>(
  value: Record<string, unknown>,
  key: string,
  allowed: Values,
): Values[number] {
  const field = value[key];
  if (typeof field !== 'string' || !allowed.includes(field)) {
    throw invalidContract();
  }
  return field;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function invalidContract(): MirrorMasterApiError {
  return new MirrorMasterApiError(
    502,
    'GRID_CONTRACT_INVALID',
    '识别结果暂时无法使用。请点击“重新识别”，或填写正确的列数和行数。',
  );
}

function customerRequestMessage(path: string, code: string): string {
  if (
    [
      'GRID_CONTRACT_INVALID',
      'GRID_CANDIDATE_AUTHORITY_INVALID',
      'GRID_CELL_MATRIX_MISMATCH',
      'GRID_IMAGE_STALE',
      'GRID_IMAGE_HASH_MISMATCH',
    ].includes(code)
  ) {
    return '当前识别结果已失效，请重新识别后再试。';
  }
  if (path.endsWith('/detect')) {
    return '暂时没有识别出完整网格。请调整红框，或填写正确的列数和行数。';
  }
  if (path.endsWith('/mirror')) {
    return '暂时无法生成镜像，请重新识别后再试。';
  }
  return '处理失败，请稍后重试。';
}
