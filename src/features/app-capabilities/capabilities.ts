export const CAPABILITIES_CONTRACT_VERSION = '1.0' as const;

export type AppImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp';
export type AppMode = 'photo' | 'pixelArt' | 'existingChart';
export type AppSamplingMode = 'average' | 'nearest';
export type AppDitheringMode = 'none' | 'floydSteinberg';
export type AppExportFormat = 'png' | 'pdf' | 'csv' | 'projectJson';
export type AppPngTemplate = 'pure' | 'annotated' | 'numbered' | 'rounded';
export type AppGridMirrorAxis = 'horizontal' | 'vertical';
export type BackgroundRemovalUnavailableReason =
  'MODEL_MISSING' | 'MODEL_INVALID' | 'ENGINE_INITIALIZATION_FAILED';

export interface BackgroundRemovalInteractiveCapability {
  readonly contractVersion: '1.0';
  readonly available: boolean;
  readonly refinement: 'grabcut';
  readonly maximumStrokesPerRequest: number;
  readonly maximumStrokePointsPerRequest: number;
  readonly minimumBrushRadiusPx: number;
  readonly maximumBrushRadiusPx: number;
}

export interface BackgroundRemovalCapability {
  readonly contractVersion: '1.0';
  readonly available: boolean;
  readonly outputMimeType: 'image/png';
  readonly maximumDecodedPixels: number;
  readonly maximumConcurrentInferences: number;
  readonly unavailableReason: BackgroundRemovalUnavailableReason | null;
  readonly interactive: BackgroundRemovalInteractiveCapability;
}

export interface AppBoardSize {
  readonly rows: number;
  readonly columns: number;
}

export interface AppCapabilities {
  readonly contractVersion: typeof CAPABILITIES_CONTRACT_VERSION;
  readonly schemaVersions: readonly string[];
  readonly paletteSourceVersion: string;
  readonly upload: {
    readonly mimeTypes: readonly AppImageMimeType[];
    readonly maximumBytes: number;
    readonly maximumDecodedPixels: number;
  };
  readonly backgroundRemoval: BackgroundRemovalCapability;
  readonly grid: {
    readonly minimumRows: number;
    readonly maximumRows: number;
    readonly minimumColumns: number;
    readonly maximumColumns: number;
  };
  readonly beads: {
    readonly minimumDiameterMm: number;
    readonly maximumDiameterMm: number;
    readonly minimumPitchMm: number;
    readonly maximumPitchMm: number;
    readonly pitchMustNotBeSmallerThanDiameter: boolean;
  };
  readonly boards: {
    readonly fixedPresets: Readonly<Record<string, AppBoardSize>>;
    readonly custom: {
      readonly minimumRows: number;
      readonly maximumRows: number;
      readonly minimumColumns: number;
      readonly maximumColumns: number;
    };
  };
  readonly modes: readonly AppMode[];
  readonly sampling: readonly AppSamplingMode[];
  readonly dithering: readonly AppDitheringMode[];
  readonly exports: readonly AppExportFormat[];
  readonly pngTemplates: readonly AppPngTemplate[];
  readonly pdf: {
    readonly pageSize: 'A4';
    readonly summaryPage: boolean;
    readonly onePagePerBoard: boolean;
    readonly coordinates: boolean;
    readonly legends: boolean;
    readonly counts: boolean;
    readonly physicalScale: 'fit-with-declared-scale';
    readonly maximumPages: number;
    readonly maximumRasterPixels: number;
  };
  readonly gridMirrorAxes: readonly AppGridMirrorAxis[];
}

export type AppCapabilitiesResolution =
  | {
      readonly source: 'remote';
      readonly capabilities: AppCapabilities;
      readonly message: null;
    }
  | {
      readonly source: 'fallback';
      readonly capabilities: AppCapabilities;
      readonly message: string;
    };

export interface AppCapabilitiesFetchResponse {
  readonly ok: boolean;
  json(): Promise<unknown>;
}

export type AppCapabilitiesFetcher = (
  input: string,
  init?: RequestInit,
) => Promise<AppCapabilitiesFetchResponse>;

export interface LoadAppCapabilitiesOptions {
  readonly endpoint?: string;
  readonly fetcher?: AppCapabilitiesFetcher;
}

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const MODES = ['photo', 'pixelArt', 'existingChart'] as const;
const SAMPLING_MODES = ['average', 'nearest'] as const;
const DITHERING_MODES = ['none', 'floydSteinberg'] as const;
const EXPORT_FORMATS = ['png', 'pdf', 'csv', 'projectJson'] as const;
const PNG_TEMPLATES = ['pure', 'annotated', 'numbered', 'rounded'] as const;
const GRID_MIRROR_AXES = ['horizontal', 'vertical'] as const;
const PDF_PAGE_SIZES = ['A4'] as const;
const PDF_PHYSICAL_SCALES = ['fit-with-declared-scale'] as const;
const BACKGROUND_REMOVAL_UNAVAILABLE_REASONS = [
  'MODEL_MISSING',
  'MODEL_INVALID',
  'ENGINE_INITIALIZATION_FAILED',
] as const;

const UNAVAILABLE_INTERACTIVE_CAPABILITY: BackgroundRemovalInteractiveCapability = Object.freeze({
  contractVersion: '1.0',
  available: false,
  refinement: 'grabcut',
  maximumStrokesPerRequest: 64,
  maximumStrokePointsPerRequest: 8192,
  minimumBrushRadiusPx: 1,
  maximumBrushRadiusPx: 512,
});

const UNAVAILABLE_BACKGROUND_REMOVAL_CAPABILITY: BackgroundRemovalCapability = Object.freeze({
  contractVersion: '1.0',
  available: false,
  outputMimeType: 'image/png',
  maximumDecodedPixels: 12_000_000,
  maximumConcurrentInferences: 1,
  unavailableReason: 'MODEL_MISSING',
  interactive: UNAVAILABLE_INTERACTIVE_CAPABILITY,
});

export const FALLBACK_APP_CAPABILITIES: AppCapabilities = Object.freeze({
  contractVersion: CAPABILITIES_CONTRACT_VERSION,
  schemaVersions: Object.freeze(['1.0']),
  paletteSourceVersion: '2026-07-24',
  upload: Object.freeze({
    mimeTypes: Object.freeze([...IMAGE_MIME_TYPES]),
    maximumBytes: 20 * 1024 * 1024,
    maximumDecodedPixels: 25_000_000,
  }),
  backgroundRemoval: UNAVAILABLE_BACKGROUND_REMOVAL_CAPABILITY,
  grid: Object.freeze({
    minimumRows: 1,
    maximumRows: 300,
    minimumColumns: 1,
    maximumColumns: 300,
  }),
  beads: Object.freeze({
    minimumDiameterMm: 1,
    maximumDiameterMm: 10,
    minimumPitchMm: 1,
    maximumPitchMm: 12,
    pitchMustNotBeSmallerThanDiameter: true,
  }),
  boards: Object.freeze({
    fixedPresets: Object.freeze({
      smallSquare: Object.freeze({ rows: 14, columns: 14 }),
      standardSquare: Object.freeze({ rows: 29, columns: 29 }),
    }),
    custom: Object.freeze({
      minimumRows: 1,
      maximumRows: 300,
      minimumColumns: 1,
      maximumColumns: 300,
    }),
  }),
  modes: Object.freeze([...MODES]),
  sampling: Object.freeze([...SAMPLING_MODES]),
  dithering: Object.freeze([...DITHERING_MODES]),
  exports: Object.freeze([...EXPORT_FORMATS]),
  pngTemplates: Object.freeze([...PNG_TEMPLATES]),
  pdf: Object.freeze({
    pageSize: 'A4',
    summaryPage: true,
    onePagePerBoard: true,
    coordinates: true,
    legends: true,
    counts: true,
    physicalScale: 'fit-with-declared-scale',
    maximumPages: 500,
    maximumRasterPixels: 1_100_000_000,
  }),
  gridMirrorAxes: Object.freeze([...GRID_MIRROR_AXES]),
});

export function parseAppCapabilities(value: unknown): AppCapabilities {
  const root = readRecord(value);
  if (root.contractVersion !== CAPABILITIES_CONTRACT_VERSION) {
    throw invalidCapabilities();
  }

  const upload = readRecord(root.upload);
  const grid = readRecord(root.grid);
  const beads = readRecord(root.beads);
  const boards = readRecord(root.boards);
  const customBoard = readRecord(boards.custom);
  const pdf = readRecord(root.pdf);
  const minimumRows = readPositiveInteger(grid.minimumRows);
  const maximumRows = readPositiveInteger(grid.maximumRows);
  const minimumColumns = readPositiveInteger(grid.minimumColumns);
  const maximumColumns = readPositiveInteger(grid.maximumColumns);
  const minimumDiameterMm = readPositiveNumber(beads.minimumDiameterMm);
  const maximumDiameterMm = readPositiveNumber(beads.maximumDiameterMm);
  const minimumPitchMm = readPositiveNumber(beads.minimumPitchMm);
  const maximumPitchMm = readPositiveNumber(beads.maximumPitchMm);
  const customMinimumRows = readPositiveInteger(customBoard.minimumRows);
  const customMaximumRows = readPositiveInteger(customBoard.maximumRows);
  const customMinimumColumns = readPositiveInteger(customBoard.minimumColumns);
  const customMaximumColumns = readPositiveInteger(customBoard.maximumColumns);

  if (
    minimumRows > maximumRows ||
    minimumColumns > maximumColumns ||
    minimumDiameterMm > maximumDiameterMm ||
    minimumPitchMm > maximumPitchMm ||
    customMinimumRows > customMaximumRows ||
    customMinimumColumns > customMaximumColumns
  ) {
    throw invalidCapabilities();
  }

  const fixedPresets = readBoardPresets(
    boards.fixedPresets,
    customMaximumRows,
    customMaximumColumns,
  );

  return Object.freeze({
    contractVersion: root.contractVersion,
    schemaVersions: readStringArray(root.schemaVersions),
    paletteSourceVersion: readNonEmptyString(root.paletteSourceVersion),
    upload: Object.freeze({
      mimeTypes: readEnumArray(rootValue(upload, 'mimeTypes'), IMAGE_MIME_TYPES),
      maximumBytes: readPositiveInteger(upload.maximumBytes),
      maximumDecodedPixels: readPositiveInteger(upload.maximumDecodedPixels),
    }),
    backgroundRemoval: readBackgroundRemovalCapability(root.backgroundRemoval),
    grid: Object.freeze({
      minimumRows,
      maximumRows,
      minimumColumns,
      maximumColumns,
    }),
    beads: Object.freeze({
      minimumDiameterMm,
      maximumDiameterMm,
      minimumPitchMm,
      maximumPitchMm,
      pitchMustNotBeSmallerThanDiameter: readBoolean(beads.pitchMustNotBeSmallerThanDiameter),
    }),
    boards: Object.freeze({
      fixedPresets,
      custom: Object.freeze({
        minimumRows: customMinimumRows,
        maximumRows: customMaximumRows,
        minimumColumns: customMinimumColumns,
        maximumColumns: customMaximumColumns,
      }),
    }),
    modes: readEnumArray(root.modes, MODES),
    sampling: readEnumArray(root.sampling, SAMPLING_MODES),
    dithering: readEnumArray(root.dithering, DITHERING_MODES),
    exports: readEnumArray(root.exports, EXPORT_FORMATS),
    pngTemplates: readEnumArray(root.pngTemplates, PNG_TEMPLATES),
    pdf: Object.freeze({
      pageSize: readEnumValue(pdf.pageSize, PDF_PAGE_SIZES),
      summaryPage: readBoolean(pdf.summaryPage),
      onePagePerBoard: readBoolean(pdf.onePagePerBoard),
      coordinates: readBoolean(pdf.coordinates),
      legends: readBoolean(pdf.legends),
      counts: readBoolean(pdf.counts),
      physicalScale: readEnumValue(pdf.physicalScale, PDF_PHYSICAL_SCALES),
      maximumPages: readPositiveInteger(pdf.maximumPages),
      maximumRasterPixels: readPositiveInteger(pdf.maximumRasterPixels),
    }),
    gridMirrorAxes: readEnumArray(root.gridMirrorAxes, GRID_MIRROR_AXES),
  });
}

export function resolveAppCapabilities(value: unknown): AppCapabilitiesResolution {
  try {
    return Object.freeze({
      source: 'remote',
      capabilities: parseAppCapabilities(value),
      message: null,
    });
  } catch {
    return fallbackResolution('服务能力信息无效，已使用内置兼容配置。');
  }
}

export async function loadAppCapabilities(
  options: LoadAppCapabilitiesOptions = {},
): Promise<AppCapabilitiesResolution> {
  const endpoint = options.endpoint ?? '/api/capabilities';
  const fetcher =
    options.fetcher ?? ((input: string, init?: RequestInit) => globalThis.fetch(input, init));

  let response: AppCapabilitiesFetchResponse;
  try {
    response = await fetcher(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error('capabilities request failed');
    }
  } catch {
    return fallbackResolution('服务能力接口不可用，已使用内置兼容配置。');
  }

  try {
    return resolveAppCapabilities(await response.json());
  } catch {
    return fallbackResolution('服务能力信息无效，已使用内置兼容配置。');
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidCapabilities();
  }
  return value as Record<string, unknown>;
}

function readBackgroundRemovalCapability(value: unknown): BackgroundRemovalCapability {
  if (value === undefined) {
    return UNAVAILABLE_BACKGROUND_REMOVAL_CAPABILITY;
  }
  try {
    const capability = readRecord(value);
    if (capability.contractVersion !== '1.0' || capability.outputMimeType !== 'image/png') {
      throw invalidCapabilities();
    }
    const available = readBoolean(capability.available);
    const unavailableReason =
      capability.unavailableReason === null
        ? null
        : readEnumValue(capability.unavailableReason, BACKGROUND_REMOVAL_UNAVAILABLE_REASONS);
    if (available !== (unavailableReason === null)) {
      throw invalidCapabilities();
    }
    return Object.freeze({
      contractVersion: '1.0',
      available,
      outputMimeType: 'image/png',
      maximumDecodedPixels: readPositiveInteger(capability.maximumDecodedPixels),
      maximumConcurrentInferences: readPositiveInteger(capability.maximumConcurrentInferences),
      unavailableReason,
      interactive: readInteractiveCapability(capability.interactive, available),
    });
  } catch {
    return Object.freeze({
      ...UNAVAILABLE_BACKGROUND_REMOVAL_CAPABILITY,
      unavailableReason: 'MODEL_INVALID',
    });
  }
}

function readInteractiveCapability(
  value: unknown,
  serviceAvailable: boolean,
): BackgroundRemovalInteractiveCapability {
  // interactive 对象缺失或合同不兼容时按不可用处理，前端回退到一键直出流程。
  if (!serviceAvailable || value === undefined) {
    return UNAVAILABLE_INTERACTIVE_CAPABILITY;
  }
  try {
    const interactive = readRecord(value);
    if (
      interactive.contractVersion !== '1.0' ||
      interactive.refinement !== 'grabcut' ||
      !readBoolean(interactive.available)
    ) {
      return UNAVAILABLE_INTERACTIVE_CAPABILITY;
    }
    const maximumStrokesPerRequest = readPositiveInteger(interactive.maximumStrokesPerRequest);
    const maximumStrokePointsPerRequest = readPositiveInteger(
      interactive.maximumStrokePointsPerRequest,
    );
    const minimumBrushRadiusPx = readPositiveInteger(interactive.minimumBrushRadiusPx);
    const maximumBrushRadiusPx = readPositiveInteger(interactive.maximumBrushRadiusPx);
    if (minimumBrushRadiusPx > maximumBrushRadiusPx) {
      return UNAVAILABLE_INTERACTIVE_CAPABILITY;
    }
    return Object.freeze({
      contractVersion: '1.0',
      available: true,
      refinement: 'grabcut',
      maximumStrokesPerRequest,
      maximumStrokePointsPerRequest,
      minimumBrushRadiusPx,
      maximumBrushRadiusPx,
    });
  } catch {
    return UNAVAILABLE_INTERACTIVE_CAPABILITY;
  }
}

function rootValue(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

function readNonEmptyString(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidCapabilities();
  }
  return value;
}

function readPositiveInteger(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw invalidCapabilities();
  }
  return value as number;
}

function readPositiveNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw invalidCapabilities();
  }
  return value;
}

function readBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw invalidCapabilities();
  }
  return value;
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw invalidCapabilities();
  }
  const values = value.map(readNonEmptyString);
  if (new Set(values).size !== values.length) {
    throw invalidCapabilities();
  }
  return Object.freeze(values);
}

function readEnumArray<const AllowedValue extends string>(
  value: unknown,
  allowedValues: readonly AllowedValue[],
): readonly AllowedValue[] {
  const values = readStringArray(value);
  const allowed = new Set<string>(allowedValues);
  if (values.some((entry) => !allowed.has(entry))) {
    throw invalidCapabilities();
  }
  return Object.freeze(values as AllowedValue[]);
}

function readEnumValue<const AllowedValue extends string>(
  value: unknown,
  allowedValues: readonly AllowedValue[],
): AllowedValue {
  if (typeof value !== 'string' || !allowedValues.some((allowedValue) => allowedValue === value)) {
    throw invalidCapabilities();
  }
  return value as AllowedValue;
}

function readBoardPresets(
  value: unknown,
  maximumRows: number,
  maximumColumns: number,
): Readonly<Record<string, AppBoardSize>> {
  const record = readRecord(value);
  const entries = Object.entries(record);
  if (entries.length === 0) {
    throw invalidCapabilities();
  }

  const presets: Record<string, AppBoardSize> = {};
  for (const [presetId, presetValue] of entries) {
    if (presetId.trim().length === 0) {
      throw invalidCapabilities();
    }
    const preset = readRecord(presetValue);
    const rows = readPositiveInteger(preset.rows);
    const columns = readPositiveInteger(preset.columns);
    if (rows > maximumRows || columns > maximumColumns) {
      throw invalidCapabilities();
    }
    presets[presetId] = Object.freeze({ rows, columns });
  }

  return Object.freeze(presets);
}

function invalidCapabilities(): Error {
  return new Error('服务能力信息格式无效。');
}

function fallbackResolution(message: string): AppCapabilitiesResolution {
  return Object.freeze({
    source: 'fallback',
    capabilities: FALLBACK_APP_CAPABILITIES,
    message,
  });
}
