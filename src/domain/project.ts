import { PALETTE_COLORS, PALETTE_SOURCE_VERSION } from '../generated/palettes';

export const PROJECT_SCHEMA_VERSION = '1.0' as const;

export type ProjectMode = 'photo' | 'pixelArt' | 'existingChart';
export type SamplingMode = 'average' | 'nearest';
export type DitheringMode = 'none' | 'floydSteinberg';
export type MirrorAxis = 'horizontal' | 'vertical';
export type ImageRotation = 0 | 90 | 180 | 270;

export type BeadCell =
  { readonly kind: 'empty' } | { readonly kind: 'bead'; readonly colorId: string };

export interface CropRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BeadProject {
  readonly schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly mode: ProjectMode;
  readonly source: {
    readonly fileName: string;
    readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
    readonly naturalWidth: number;
    readonly naturalHeight: number;
    readonly sha256: string;
    readonly crop: CropRectangle;
    readonly rotation: ImageRotation;
  };
  readonly grid: {
    readonly rows: number;
    readonly columns: number;
    readonly aspectLocked: boolean;
    readonly beadDiameterMm: number;
    readonly beadPitchMm: number;
    readonly boardPresetId: BoardPresetId;
    readonly boardRows: number;
    readonly boardColumns: number;
  };
  readonly palette: {
    readonly paletteId: 'default' | 'mard';
    readonly paletteVersion: string;
    readonly availableColorIds: readonly string[];
    readonly maximumColors: number | null;
  };
  readonly generation: {
    readonly sampling: SamplingMode;
    readonly colorDistance: 'ciede2000';
    readonly dithering: DitheringMode;
    readonly alphaEmptyThreshold: number;
  };
  readonly cells: readonly (readonly BeadCell[])[];
  readonly revision: number;
}

export interface ProjectStatistics {
  readonly totalCellCount: number;
  readonly blankCount: number;
  readonly nonEmptyBeadCount: number;
  readonly usedColorCount: number;
  readonly perColorCounts: Readonly<Record<string, number>>;
}

export const BOARD_PRESETS = Object.freeze({
  smallSquare: Object.freeze({
    id: 'smallSquare',
    label: '14 × 14 小方板',
    columns: 14,
    rows: 14,
  }),
  standardSquare: Object.freeze({
    id: 'standardSquare',
    label: '29 × 29 标准方板',
    columns: 29,
    rows: 29,
  }),
  custom: Object.freeze({
    id: 'custom',
    label: '自定义拼板',
    columns: 29,
    rows: 29,
  }),
});

export type BoardPresetId = keyof typeof BOARD_PRESETS;

export interface PhysicalLayout {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly boardColumns: number;
  readonly boardRows: number;
  readonly boardCount: number;
}

const COLOR_BY_ID = new Map(PALETTE_COLORS.map((color) => [color.id, color]));
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export function calculateStatistics(cells: readonly (readonly BeadCell[])[]): ProjectStatistics {
  const counts = new Map<string, number>();
  let blankCount = 0;

  for (const row of cells) {
    for (const cell of row) {
      if (cell.kind === 'empty') {
        blankCount += 1;
      } else {
        counts.set(cell.colorId, (counts.get(cell.colorId) ?? 0) + 1);
      }
    }
  }

  const perColorCounts = Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
  const nonEmptyBeadCount = Object.values(perColorCounts).reduce((sum, count) => sum + count, 0);
  const totalCellCount = cells.reduce((sum, row) => sum + row.length, 0);

  if (nonEmptyBeadCount + blankCount !== totalCellCount) {
    throw new Error('拼豆统计与矩阵尺寸不一致。');
  }

  return Object.freeze({
    totalCellCount,
    blankCount,
    nonEmptyBeadCount,
    usedColorCount: counts.size,
    perColorCounts: Object.freeze(perColorCounts),
  });
}

export function calculatePhysicalLayout(project: BeadProject): PhysicalLayout {
  const widthMm =
    (project.grid.columns - 1) * project.grid.beadPitchMm + project.grid.beadDiameterMm;
  const heightMm = (project.grid.rows - 1) * project.grid.beadPitchMm + project.grid.beadDiameterMm;
  const boardColumns = Math.ceil(project.grid.columns / project.grid.boardColumns);
  const boardRows = Math.ceil(project.grid.rows / project.grid.boardRows);

  return Object.freeze({
    widthMm,
    heightMm,
    boardColumns,
    boardRows,
    boardCount: boardColumns * boardRows,
  });
}

export function mirrorCells(
  cells: readonly (readonly BeadCell[])[],
  axis: MirrorAxis,
): readonly (readonly BeadCell[])[] {
  if (axis === 'vertical') {
    return Object.freeze([...cells].reverse().map((row) => Object.freeze([...row])));
  }

  return Object.freeze(cells.map((row) => Object.freeze([...row].reverse())));
}

export function replaceCell(
  cells: readonly (readonly BeadCell[])[],
  rowIndex: number,
  columnIndex: number,
  nextCell: BeadCell,
): readonly (readonly BeadCell[])[] {
  if (!cells[rowIndex]?.[columnIndex]) {
    return cells;
  }

  return Object.freeze(
    cells.map((row, currentRow) =>
      Object.freeze(
        currentRow === rowIndex
          ? row.map((cell, currentColumn) =>
              currentColumn === columnIndex ? Object.freeze({ ...nextCell }) : cell,
            )
          : [...row],
      ),
    ),
  );
}

export function fillCells(
  cells: readonly (readonly BeadCell[])[],
  startRow: number,
  startColumn: number,
  nextCell: BeadCell,
): readonly (readonly BeadCell[])[] {
  const target = cells[startRow]?.[startColumn];
  if (!target || cellsEqual(target, nextCell)) {
    return cells;
  }

  const mutable = cells.map((row) => row.map((cell) => ({ ...cell })));
  const queue: Array<readonly [number, number]> = [[startRow, startColumn]];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const point = queue.shift();
    if (!point) {
      break;
    }
    const [row, column] = point;
    const key = `${String(row)}:${String(column)}`;
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);

    const mutableRow = mutable[row];
    const cell = mutableRow?.[column];
    if (!cell || !cellsEqual(cell, target)) {
      continue;
    }
    mutableRow[column] = { ...nextCell };
    queue.push([row - 1, column], [row + 1, column], [row, column - 1], [row, column + 1]);
  }

  return Object.freeze(mutable.map((row) => Object.freeze(row.map((cell) => Object.freeze(cell)))));
}

export function withProjectCells(
  project: BeadProject,
  cells: readonly (readonly BeadCell[])[],
  updatedAt = new Date().toISOString(),
  revision = project.revision + 1,
): BeadProject {
  const next = Object.freeze({
    ...project,
    updatedAt,
    cells,
    revision,
  });
  assertValidProject(next);
  return next;
}

export function parseBeadProject(value: unknown): BeadProject {
  if (!isRecord(value)) {
    throw new Error('项目文件不是有效对象。');
  }

  assertExactProjectShape(value);
  const project = value as unknown as BeadProject;
  assertValidProject(project);
  return freezeProject(project);
}

export function assertValidProject(project: BeadProject): void {
  assertExactProjectShape(project);
  if (
    (project as unknown as { readonly schemaVersion: unknown }).schemaVersion !==
    PROJECT_SCHEMA_VERSION
  ) {
    throw new Error('项目版本不受支持。');
  }
  if (!['photo', 'pixelArt', 'existingChart'].includes(project.mode)) {
    throw new Error('项目模式无效。');
  }
  if (
    !Number.isInteger(project.grid.rows) ||
    !Number.isInteger(project.grid.columns) ||
    project.grid.rows < 1 ||
    project.grid.rows > 300 ||
    project.grid.columns < 1 ||
    project.grid.columns > 300
  ) {
    throw new Error('项目行列必须是 1 到 300 的整数。');
  }
  if (
    project.cells.length !== project.grid.rows ||
    project.cells.some((row) => row.length !== project.grid.columns)
  ) {
    throw new Error('项目矩阵尺寸与行列设置不一致。');
  }
  if (!Object.hasOwn(BOARD_PRESETS, project.grid.boardPresetId)) {
    throw new Error('项目拼板预设无效。');
  }
  if (
    !Number.isInteger(project.grid.boardRows) ||
    !Number.isInteger(project.grid.boardColumns) ||
    project.grid.boardRows < 1 ||
    project.grid.boardRows > 300 ||
    project.grid.boardColumns < 1 ||
    project.grid.boardColumns > 300
  ) {
    throw new Error('项目拼板行列必须是 1 到 300 的整数。');
  }
  const preset = BOARD_PRESETS[project.grid.boardPresetId];
  if (
    project.grid.boardPresetId !== 'custom' &&
    (project.grid.boardRows !== preset.rows || project.grid.boardColumns !== preset.columns)
  ) {
    throw new Error('固定拼板尺寸与预设不一致。');
  }
  if (
    !Number.isFinite(project.grid.beadDiameterMm) ||
    !Number.isFinite(project.grid.beadPitchMm) ||
    project.grid.beadDiameterMm < 1 ||
    project.grid.beadDiameterMm > 10 ||
    project.grid.beadPitchMm < project.grid.beadDiameterMm ||
    project.grid.beadPitchMm > 12
  ) {
    throw new Error('拼豆直径或间距无效。');
  }
  if (project.palette.paletteVersion !== PALETTE_SOURCE_VERSION) {
    throw new Error('项目色板版本与当前应用不一致。');
  }
  const availableIds = project.palette.availableColorIds;
  const uniqueAvailableIds = new Set(availableIds);
  if (
    availableIds.length === 0 ||
    uniqueAvailableIds.size !== availableIds.length ||
    availableIds.some((id) => {
      const color = COLOR_BY_ID.get(id);
      return !color || color.paletteId !== project.palette.paletteId;
    })
  ) {
    throw new Error('项目可用颜色必须唯一并属于所选色板。');
  }
  if (
    project.palette.maximumColors !== null &&
    (!Number.isInteger(project.palette.maximumColors) ||
      project.palette.maximumColors < 1 ||
      project.palette.maximumColors > availableIds.length)
  ) {
    throw new Error('项目最多颜色数必须在可用颜色范围内。');
  }
  if (
    project.cells.some((row) =>
      row.some((cell) => {
        const record = cell as unknown;
        if (!isRecord(record)) {
          return true;
        }
        if (record.kind === 'empty') {
          return false;
        }
        return (
          record.kind !== 'bead' ||
          typeof record.colorId !== 'string' ||
          !uniqueAvailableIds.has(record.colorId)
        );
      }),
    )
  ) {
    throw new Error('项目矩阵包含无效颜色。');
  }
  if (
    !Number.isInteger(project.revision) ||
    project.revision < 0 ||
    !SHA256_PATTERN.test(project.source.sha256)
  ) {
    throw new Error('项目来源或版本无效。');
  }

  const statistics = calculateStatistics(project.cells);
  const sum = Object.values(statistics.perColorCounts).reduce((total, count) => total + count, 0);
  if (sum !== statistics.nonEmptyBeadCount) {
    throw new Error('项目材料统计不一致。');
  }
}

function assertExactProjectShape(value: unknown): asserts value is BeadProject {
  if (!isRecord(value)) {
    throw new Error('项目文件不是有效对象。');
  }
  assertExactKeys(value, [
    'schemaVersion',
    'id',
    'createdAt',
    'updatedAt',
    'mode',
    'source',
    'grid',
    'palette',
    'generation',
    'cells',
    'revision',
  ]);
  if (
    typeof value.id !== 'string' ||
    value.id.length < 8 ||
    value.id.length > 80 ||
    typeof value.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    typeof value.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.updatedAt))
  ) {
    throw new Error('项目标识或时间无效。');
  }

  const source = value.source;
  if (!isRecord(source)) {
    throw new Error('项目来源无效。');
  }
  assertExactKeys(source, [
    'fileName',
    'mimeType',
    'naturalWidth',
    'naturalHeight',
    'sha256',
    'crop',
    'rotation',
  ]);
  if (
    typeof source.fileName !== 'string' ||
    source.fileName.length < 1 ||
    source.fileName.length > 255 ||
    !['image/png', 'image/jpeg', 'image/webp'].includes(String(source.mimeType)) ||
    !Number.isInteger(source.naturalWidth) ||
    Number(source.naturalWidth) < 1 ||
    !Number.isInteger(source.naturalHeight) ||
    Number(source.naturalHeight) < 1 ||
    typeof source.sha256 !== 'string' ||
    !SHA256_PATTERN.test(source.sha256) ||
    ![0, 90, 180, 270].includes(Number(source.rotation))
  ) {
    throw new Error('项目来源字段无效。');
  }
  const crop = source.crop;
  if (!isRecord(crop)) {
    throw new Error('项目裁剪范围无效。');
  }
  assertExactKeys(crop, ['x', 'y', 'width', 'height']);
  if (
    !Number.isInteger(crop.x) ||
    Number(crop.x) < 0 ||
    !Number.isInteger(crop.y) ||
    Number(crop.y) < 0 ||
    !Number.isInteger(crop.width) ||
    Number(crop.width) < 1 ||
    !Number.isInteger(crop.height) ||
    Number(crop.height) < 1
  ) {
    throw new Error('项目裁剪范围无效。');
  }
  const rotatedWidth =
    source.rotation === 90 || source.rotation === 270
      ? Number(source.naturalHeight)
      : Number(source.naturalWidth);
  const rotatedHeight =
    source.rotation === 90 || source.rotation === 270
      ? Number(source.naturalWidth)
      : Number(source.naturalHeight);
  if (
    Number(crop.x) + Number(crop.width) > rotatedWidth ||
    Number(crop.y) + Number(crop.height) > rotatedHeight
  ) {
    throw new Error('项目裁剪范围超出来源图片。');
  }

  const grid = value.grid;
  if (!isRecord(grid)) {
    throw new Error('项目网格设置无效。');
  }
  assertExactKeys(grid, [
    'rows',
    'columns',
    'aspectLocked',
    'beadDiameterMm',
    'beadPitchMm',
    'boardPresetId',
    'boardRows',
    'boardColumns',
  ]);
  if (typeof grid.aspectLocked !== 'boolean') {
    throw new Error('项目宽高比设置无效。');
  }

  const palette = value.palette;
  if (!isRecord(palette)) {
    throw new Error('项目色板设置无效。');
  }
  assertExactKeys(palette, ['paletteId', 'paletteVersion', 'availableColorIds', 'maximumColors']);
  if (
    !['default', 'mard'].includes(String(palette.paletteId)) ||
    !Array.isArray(palette.availableColorIds) ||
    palette.availableColorIds.some((id) => typeof id !== 'string')
  ) {
    throw new Error('项目色板设置无效。');
  }

  const generation = value.generation;
  if (!isRecord(generation)) {
    throw new Error('项目生成设置无效。');
  }
  assertExactKeys(generation, ['sampling', 'colorDistance', 'dithering', 'alphaEmptyThreshold']);
  if (
    !['average', 'nearest'].includes(String(generation.sampling)) ||
    generation.colorDistance !== 'ciede2000' ||
    !['none', 'floydSteinberg'].includes(String(generation.dithering)) ||
    typeof generation.alphaEmptyThreshold !== 'number' ||
    !Number.isFinite(generation.alphaEmptyThreshold) ||
    generation.alphaEmptyThreshold < 0 ||
    generation.alphaEmptyThreshold > 1
  ) {
    throw new Error('项目生成设置无效。');
  }

  if (!Array.isArray(value.cells)) {
    throw new Error('项目矩阵无效。');
  }
  for (const row of value.cells) {
    if (!Array.isArray(row)) {
      throw new Error('项目矩阵无效。');
    }
    for (const cell of row) {
      if (!isRecord(cell)) {
        throw new Error('项目矩阵无效。');
      }
      if (cell.kind === 'empty') {
        assertExactKeys(cell, ['kind']);
      } else if (cell.kind === 'bead') {
        assertExactKeys(cell, ['kind', 'colorId']);
      } else {
        throw new Error('项目矩阵包含无效单元。');
      }
    }
  }
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const expected = new Set(keys);
  const actual = Object.keys(value);
  if (actual.length !== expected.size || actual.some((key) => !expected.has(key))) {
    throw new Error('项目文件包含缺失或未知字段。');
  }
}

function freezeProject(project: BeadProject): BeadProject {
  return Object.freeze({
    ...project,
    source: Object.freeze({
      ...project.source,
      crop: Object.freeze({ ...project.source.crop }),
    }),
    grid: Object.freeze({ ...project.grid }),
    palette: Object.freeze({
      ...project.palette,
      availableColorIds: Object.freeze([...project.palette.availableColorIds]),
    }),
    generation: Object.freeze({ ...project.generation }),
    cells: cloneCells(project.cells),
  });
}

export function cloneCells(
  cells: readonly (readonly BeadCell[])[],
): readonly (readonly BeadCell[])[] {
  return Object.freeze(
    cells.map((row) => Object.freeze(row.map((cell) => Object.freeze({ ...cell })))),
  );
}

function cellsEqual(left: BeadCell, right: BeadCell): boolean {
  return (
    left.kind === right.kind &&
    (left.kind === 'empty' || (right.kind === 'bead' && left.colorId === right.colorId))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
