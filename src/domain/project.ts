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

const KNOWN_COLOR_IDS = new Set(PALETTE_COLORS.map((color) => color.id));
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
  const preset = BOARD_PRESETS[project.grid.boardPresetId];
  const widthMm =
    (project.grid.columns - 1) * project.grid.beadPitchMm + project.grid.beadDiameterMm;
  const heightMm = (project.grid.rows - 1) * project.grid.beadPitchMm + project.grid.beadDiameterMm;
  const boardColumns = Math.ceil(project.grid.columns / preset.columns);
  const boardRows = Math.ceil(project.grid.rows / preset.rows);

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

  const project = value as unknown as BeadProject;
  assertValidProject(project);
  return project;
}

export function assertValidProject(project: BeadProject): void {
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
  if (
    project.palette.availableColorIds.length === 0 ||
    project.palette.availableColorIds.some((id) => !KNOWN_COLOR_IDS.has(id))
  ) {
    throw new Error('项目包含无效或空的可用颜色。');
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
          !KNOWN_COLOR_IDS.has(record.colorId)
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
