import type { MatrixCellChange } from '../../domain/history';
import type { BeadCell } from '../../domain/project';
import { MatrixDraft } from './matrixTransaction';

export interface CellSelection {
  readonly startRow: number;
  readonly startColumn: number;
  readonly endRow: number;
  readonly endColumn: number;
}

export interface SelectionOperationResult {
  readonly cells: readonly (readonly BeadCell[])[];
  readonly changes: readonly MatrixCellChange[];
  readonly selection: CellSelection | null;
}

export interface SelectionCellSnapshot {
  readonly selection: CellSelection;
  readonly cells: readonly (readonly BeadCell[])[];
}

export type SelectionTransferOperation = 'copy' | 'move';

export interface BoundedSelectionTranslation {
  readonly deltaRow: number;
  readonly deltaColumn: number;
  readonly wasBounded: boolean;
}

interface SelectionCell {
  readonly rowOffset: number;
  readonly columnOffset: number;
  readonly cell: BeadCell;
}

const EMPTY_CELL: BeadCell = Object.freeze({ kind: 'empty' });

export function normalizeSelection(selection: CellSelection): CellSelection {
  return Object.freeze({
    startRow: Math.min(selection.startRow, selection.endRow),
    startColumn: Math.min(selection.startColumn, selection.endColumn),
    endRow: Math.max(selection.startRow, selection.endRow),
    endColumn: Math.max(selection.startColumn, selection.endColumn),
  });
}

export function selectionContains(selection: CellSelection, row: number, column: number): boolean {
  const normalized = normalizeSelection(selection);
  return (
    row >= normalized.startRow &&
    row <= normalized.endRow &&
    column >= normalized.startColumn &&
    column <= normalized.endColumn
  );
}

export function createSelectionCellSnapshot(
  cells: readonly (readonly BeadCell[])[],
  selection: CellSelection,
): SelectionCellSnapshot | null {
  const normalized = clipSelection(selection, cells);
  if (!normalized) {
    return null;
  }
  return Object.freeze({
    selection: normalized,
    cells: Object.freeze(
      cells
        .slice(normalized.startRow, normalized.endRow + 1)
        .map((row) => Object.freeze(row.slice(normalized.startColumn, normalized.endColumn + 1))),
    ),
  });
}

export function getSelectionTransferPreviewCell(
  cells: readonly (readonly BeadCell[])[],
  snapshot: SelectionCellSnapshot,
  operation: SelectionTransferOperation,
  deltaRow: number,
  deltaColumn: number,
  row: number,
  column: number,
): BeadCell | null {
  const baseCell = cells[row]?.[column];
  if (!baseCell) {
    return null;
  }
  const sourceRow = row - deltaRow;
  const sourceColumn = column - deltaColumn;
  if (normalizedSelectionContains(snapshot.selection, sourceRow, sourceColumn)) {
    return (
      snapshot.cells[sourceRow - snapshot.selection.startRow]?.[
        sourceColumn - snapshot.selection.startColumn
      ] ?? baseCell
    );
  }
  if (operation === 'move' && normalizedSelectionContains(snapshot.selection, row, column)) {
    return EMPTY_CELL;
  }
  return baseCell;
}

function normalizedSelectionContains(
  selection: CellSelection,
  row: number,
  column: number,
): boolean {
  return (
    row >= selection.startRow &&
    row <= selection.endRow &&
    column >= selection.startColumn &&
    column <= selection.endColumn
  );
}

export function clearSelectedCells(
  cells: readonly (readonly BeadCell[])[],
  selection: CellSelection,
): SelectionOperationResult {
  const normalized = clipSelection(selection, cells);
  if (!normalized) {
    return Object.freeze({ cells, changes: Object.freeze([]), selection: null });
  }

  const draft = new MatrixDraft(cells);
  for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
    for (let column = normalized.startColumn; column <= normalized.endColumn; column += 1) {
      draft.setCell(row, column, EMPTY_CELL);
    }
  }
  const result = draft.finish();
  return Object.freeze({ ...result, selection: null });
}

export function copySelectedCells(
  cells: readonly (readonly BeadCell[])[],
  selection: CellSelection,
  deltaRow: number,
  deltaColumn: number,
): SelectionOperationResult {
  return translateSelectedCells(cells, selection, deltaRow, deltaColumn, false);
}

export function moveSelectedCells(
  cells: readonly (readonly BeadCell[])[],
  selection: CellSelection,
  deltaRow: number,
  deltaColumn: number,
): SelectionOperationResult {
  return translateSelectedCells(cells, selection, deltaRow, deltaColumn, true);
}

export function boundSelectionTranslation(
  cells: readonly (readonly BeadCell[])[],
  selection: CellSelection,
  deltaRow: number,
  deltaColumn: number,
): BoundedSelectionTranslation {
  const normalized = clipSelection(selection, cells);
  if (!normalized) {
    return Object.freeze({ deltaRow: 0, deltaColumn: 0, wasBounded: true });
  }
  const rows = cells.length;
  const columns = cells[0]?.length ?? 0;
  const boundedRow = Math.min(
    rows - 1 - normalized.endRow,
    Math.max(-normalized.startRow, deltaRow),
  );
  const boundedColumn = Math.min(
    columns - 1 - normalized.endColumn,
    Math.max(-normalized.startColumn, deltaColumn),
  );
  return Object.freeze({
    deltaRow: boundedRow,
    deltaColumn: boundedColumn,
    wasBounded: boundedRow !== deltaRow || boundedColumn !== deltaColumn,
  });
}

function translateSelectedCells(
  cells: readonly (readonly BeadCell[])[],
  selection: CellSelection,
  deltaRow: number,
  deltaColumn: number,
  clearSource: boolean,
): SelectionOperationResult {
  const normalized = clipSelection(selection, cells);
  if (!normalized) {
    return Object.freeze({ cells, changes: Object.freeze([]), selection: null });
  }

  const source = snapshotSelection(cells, normalized);
  const bounded = boundSelectionTranslation(cells, normalized, deltaRow, deltaColumn);

  const draft = new MatrixDraft(cells);
  if (clearSource) {
    for (const entry of source) {
      draft.setCell(
        normalized.startRow + entry.rowOffset,
        normalized.startColumn + entry.columnOffset,
        EMPTY_CELL,
      );
    }
  }

  const destinationPoints: Array<{ readonly row: number; readonly column: number }> = [];
  for (const entry of source) {
    const row = normalized.startRow + entry.rowOffset + bounded.deltaRow;
    const column = normalized.startColumn + entry.columnOffset + bounded.deltaColumn;
    draft.setCell(row, column, entry.cell);
    destinationPoints.push(Object.freeze({ row, column }));
  }

  const result = draft.finish();
  return Object.freeze({
    ...result,
    selection: selectionFromPoints(destinationPoints),
  });
}

function snapshotSelection(
  cells: readonly (readonly BeadCell[])[],
  selection: CellSelection,
): readonly SelectionCell[] {
  const snapshot: SelectionCell[] = [];
  for (let row = selection.startRow; row <= selection.endRow; row += 1) {
    for (let column = selection.startColumn; column <= selection.endColumn; column += 1) {
      const cell = cells[row]?.[column];
      if (cell) {
        snapshot.push(
          Object.freeze({
            rowOffset: row - selection.startRow,
            columnOffset: column - selection.startColumn,
            cell,
          }),
        );
      }
    }
  }
  return Object.freeze(snapshot);
}

function clipSelection(
  selection: CellSelection,
  cells: readonly (readonly BeadCell[])[],
): CellSelection | null {
  const rows = cells.length;
  const columns = cells[0]?.length ?? 0;
  if (rows === 0 || columns === 0) {
    return null;
  }
  const normalized = normalizeSelection(selection);
  const clipped = {
    startRow: Math.max(0, normalized.startRow),
    startColumn: Math.max(0, normalized.startColumn),
    endRow: Math.min(rows - 1, normalized.endRow),
    endColumn: Math.min(columns - 1, normalized.endColumn),
  };
  return clipped.startRow <= clipped.endRow && clipped.startColumn <= clipped.endColumn
    ? Object.freeze(clipped)
    : null;
}

function selectionFromPoints(
  points: readonly { readonly row: number; readonly column: number }[],
): CellSelection | null {
  if (points.length === 0) {
    return null;
  }
  let startRow = Number.POSITIVE_INFINITY;
  let startColumn = Number.POSITIVE_INFINITY;
  let endRow = Number.NEGATIVE_INFINITY;
  let endColumn = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    startRow = Math.min(startRow, point.row);
    startColumn = Math.min(startColumn, point.column);
    endRow = Math.max(endRow, point.row);
    endColumn = Math.max(endColumn, point.column);
  }
  return Object.freeze({
    startRow,
    startColumn,
    endRow,
    endColumn,
  });
}
