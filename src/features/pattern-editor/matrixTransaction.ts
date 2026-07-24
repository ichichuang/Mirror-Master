import type { MatrixCellChange } from '../../domain/history';
import type { BeadCell } from '../../domain/project';

export interface MatrixTransactionResult {
  readonly cells: readonly (readonly BeadCell[])[];
  readonly changes: readonly MatrixCellChange[];
}

interface MutableChange {
  readonly row: number;
  readonly column: number;
  readonly before: BeadCell;
  after: BeadCell;
}

export class MatrixDraft {
  readonly #base: readonly (readonly BeadCell[])[];
  readonly #rows = new Map<number, BeadCell[]>();
  readonly #changes = new Map<string, MutableChange>();

  constructor(base: readonly (readonly BeadCell[])[]) {
    this.#base = base;
  }

  getCell(row: number, column: number): BeadCell | null {
    return this.#rows.get(row)?.[column] ?? this.#base[row]?.[column] ?? null;
  }

  setCell(row: number, column: number, nextCell: BeadCell): boolean {
    const currentCell = this.getCell(row, column);
    const baseCell = this.#base[row]?.[column];
    if (!currentCell || !baseCell || cellsEqual(currentCell, nextCell)) {
      return false;
    }

    let mutableRow = this.#rows.get(row);
    if (!mutableRow) {
      const baseRow = this.#base[row];
      if (!baseRow) {
        return false;
      }
      mutableRow = [...baseRow];
      this.#rows.set(row, mutableRow);
    }

    const frozenNext = freezeCell(nextCell);
    mutableRow[column] = frozenNext;
    const key = `${String(row)}:${String(column)}`;
    const existing = this.#changes.get(key);
    if (existing) {
      existing.after = frozenNext;
      if (cellsEqual(existing.before, frozenNext)) {
        this.#changes.delete(key);
      }
    } else if (!cellsEqual(baseCell, frozenNext)) {
      this.#changes.set(key, {
        row,
        column,
        before: baseCell,
        after: frozenNext,
      });
    }
    return true;
  }

  finish(): MatrixTransactionResult {
    if (this.#changes.size === 0) {
      return Object.freeze({ cells: this.#base, changes: Object.freeze([]) });
    }

    const cells = [...this.#base];
    const changedRows = new Set([...this.#changes.values()].map((change) => change.row));
    for (const rowIndex of changedRows) {
      const row = this.#rows.get(rowIndex);
      if (row) {
        cells[rowIndex] = Object.freeze([...row]);
      }
    }
    const changes = [...this.#changes.values()].map((change) =>
      Object.freeze({
        row: change.row,
        column: change.column,
        before: change.before,
        after: change.after,
      }),
    );

    return Object.freeze({
      cells: Object.freeze(cells),
      changes: Object.freeze(changes),
    });
  }
}

function freezeCell(cell: BeadCell): BeadCell {
  return Object.freeze({ ...cell });
}

function cellsEqual(left: BeadCell, right: BeadCell): boolean {
  return (
    left.kind === right.kind &&
    (left.kind === 'empty' || (right.kind === 'bead' && left.colorId === right.colorId))
  );
}
