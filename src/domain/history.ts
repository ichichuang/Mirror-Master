import type { BeadCell } from './project';

export interface MatrixHistorySnapshot {
  readonly cells: readonly (readonly BeadCell[])[];
  readonly revision: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly retainedTransactionCount: number;
  readonly retainedChangeCount: number;
  readonly memoryEstimateBytes: number;
}

export interface MatrixCellChange {
  readonly row: number;
  readonly column: number;
  readonly before: BeadCell;
  readonly after: BeadCell;
}

interface MatrixHistoryTransaction {
  readonly changes: readonly MatrixCellChange[];
  readonly beforeRevision: number;
  readonly afterRevision: number;
  readonly estimatedBytes: number;
}

export class MatrixHistory {
  readonly #limit: number;
  readonly #byteBudget: number;
  #past: MatrixHistoryTransaction[] = [];
  #future: MatrixHistoryTransaction[] = [];
  #cells: readonly (readonly BeadCell[])[];
  #revision: number;
  #memoryEstimateBytes = 0;

  constructor(
    initialCells: readonly (readonly BeadCell[])[],
    limit = 100,
    initialRevision = 0,
    byteBudget = 8 * 1024 * 1024,
  ) {
    this.#cells = initialCells;
    this.#revision = normalizeRevision(initialRevision);
    this.#limit = Math.max(1, Math.floor(limit));
    this.#byteBudget = Math.max(0, Math.floor(byteBudget));
  }

  get snapshot(): MatrixHistorySnapshot {
    return Object.freeze({
      cells: this.#cells,
      revision: this.#revision,
      canUndo: this.#past.length > 0,
      canRedo: this.#future.length > 0,
      retainedTransactionCount: this.#past.length + this.#future.length,
      retainedChangeCount: countChanges(this.#past) + countChanges(this.#future),
      memoryEstimateBytes: this.#memoryEstimateBytes,
    });
  }

  commit(
    nextCells: readonly (readonly BeadCell[])[],
    revision = this.#revision + 1,
  ): MatrixHistorySnapshot {
    return this.commitChanges(nextCells, diffMatrices(this.#cells, nextCells), revision);
  }

  commitChanges(
    nextCells: readonly (readonly BeadCell[])[],
    changes: readonly MatrixCellChange[],
    revision = this.#revision + 1,
  ): MatrixHistorySnapshot {
    assertMatchingShape(this.#cells, nextCells);
    const normalizedChanges = normalizeChanges(changes);
    validateChanges(this.#cells, nextCells, normalizedChanges);
    if (normalizedChanges.length === 0) {
      return this.snapshot;
    }

    this.#discardFuture();
    const transaction = freezeTransaction(
      normalizedChanges,
      this.#revision,
      normalizeRevision(revision),
    );
    this.#past.push(transaction);
    this.#memoryEstimateBytes += transaction.estimatedBytes;
    this.#cells = nextCells;
    this.#revision = transaction.afterRevision;
    this.#trimPast();
    return this.snapshot;
  }

  undo(): MatrixHistorySnapshot {
    const transaction = this.#past.pop();
    if (!transaction) {
      return this.snapshot;
    }
    this.#cells = applyChanges(this.#cells, transaction.changes, 'before');
    this.#revision = transaction.beforeRevision;
    this.#future.push(transaction);
    return this.snapshot;
  }

  redo(): MatrixHistorySnapshot {
    const transaction = this.#future.pop();
    if (!transaction) {
      return this.snapshot;
    }
    this.#cells = applyChanges(this.#cells, transaction.changes, 'after');
    this.#revision = transaction.afterRevision;
    this.#past.push(transaction);
    return this.snapshot;
  }

  #discardFuture(): void {
    for (const transaction of this.#future) {
      this.#memoryEstimateBytes -= transaction.estimatedBytes;
    }
    this.#future = [];
  }

  #trimPast(): void {
    while (
      this.#past.length > 0 &&
      (this.#past.length > this.#limit || this.#memoryEstimateBytes > this.#byteBudget)
    ) {
      const removed = this.#past.shift();
      if (removed) {
        this.#memoryEstimateBytes -= removed.estimatedBytes;
      }
    }
  }
}

function diffMatrices(
  before: readonly (readonly BeadCell[])[],
  after: readonly (readonly BeadCell[])[],
): readonly MatrixCellChange[] {
  assertMatchingShape(before, after);

  const changes: MatrixCellChange[] = [];
  for (let row = 0; row < before.length; row += 1) {
    const beforeRow = before[row];
    const afterRow = after[row];
    if (!beforeRow || !afterRow || beforeRow === afterRow) {
      continue;
    }
    for (let column = 0; column < beforeRow.length; column += 1) {
      const beforeCell = beforeRow[column];
      const afterCell = afterRow[column];
      if (beforeCell && afterCell && !cellsEqual(beforeCell, afterCell)) {
        changes.push(Object.freeze({ row, column, before: beforeCell, after: afterCell }));
      }
    }
  }
  return Object.freeze(changes);
}

function normalizeChanges(changes: readonly MatrixCellChange[]): readonly MatrixCellChange[] {
  const merged = new Map<string, MatrixCellChange>();
  for (const change of changes) {
    const key = `${String(change.row)}:${String(change.column)}`;
    const previous = merged.get(key);
    const candidate = Object.freeze({
      row: change.row,
      column: change.column,
      before: previous?.before ?? change.before,
      after: change.after,
    });
    if (cellsEqual(candidate.before, candidate.after)) {
      merged.delete(key);
    } else {
      merged.set(key, candidate);
    }
  }
  return Object.freeze([...merged.values()]);
}

function validateChanges(
  before: readonly (readonly BeadCell[])[],
  after: readonly (readonly BeadCell[])[],
  changes: readonly MatrixCellChange[],
): void {
  const changesByCell = new Map(
    changes.map((change) => [`${String(change.row)}:${String(change.column)}`, change] as const),
  );
  let discoveredChangeCount = 0;

  for (let row = 0; row < before.length; row += 1) {
    const beforeRow = before[row];
    const afterRow = after[row];
    if (!beforeRow || !afterRow || beforeRow === afterRow) {
      continue;
    }
    for (let column = 0; column < beforeRow.length; column += 1) {
      const beforeCell = beforeRow[column];
      const afterCell = afterRow[column];
      if (!beforeCell || !afterCell || cellsEqual(beforeCell, afterCell)) {
        continue;
      }
      const change = changesByCell.get(`${String(row)}:${String(column)}`);
      if (
        !change ||
        !cellsEqual(beforeCell, change.before) ||
        !cellsEqual(afterCell, change.after)
      ) {
        throw new Error('历史差异与当前矩阵不一致。');
      }
      discoveredChangeCount += 1;
    }
  }

  if (discoveredChangeCount !== changes.length) {
    throw new Error('历史差异与当前矩阵不一致。');
  }
}

function assertMatchingShape(
  before: readonly (readonly BeadCell[])[],
  after: readonly (readonly BeadCell[])[],
): void {
  if (
    before.length !== after.length ||
    before.some((row, rowIndex) => row.length !== after[rowIndex]?.length)
  ) {
    throw new Error('历史记录不能跨矩阵尺寸提交。');
  }
}

function freezeTransaction(
  changes: readonly MatrixCellChange[],
  beforeRevision: number,
  afterRevision: number,
): MatrixHistoryTransaction {
  return Object.freeze({
    changes,
    beforeRevision,
    afterRevision,
    estimatedBytes:
      40 +
      changes.reduce(
        (total, change) =>
          total + 32 + estimateCellBytes(change.before) + estimateCellBytes(change.after),
        0,
      ),
  });
}

function applyChanges(
  cells: readonly (readonly BeadCell[])[],
  changes: readonly MatrixCellChange[],
  direction: 'before' | 'after',
): readonly (readonly BeadCell[])[] {
  const nextRows = [...cells];
  const mutableRows = new Map<number, BeadCell[]>();
  for (const change of changes) {
    let row = mutableRows.get(change.row);
    if (!row) {
      const currentRow = cells[change.row];
      if (!currentRow) {
        throw new Error('历史差异超出矩阵范围。');
      }
      row = [...currentRow];
      mutableRows.set(change.row, row);
    }
    row[change.column] = direction === 'before' ? change.before : change.after;
  }
  for (const [rowIndex, row] of mutableRows) {
    nextRows[rowIndex] = Object.freeze(row);
  }
  return Object.freeze(nextRows);
}

function countChanges(transactions: readonly MatrixHistoryTransaction[]): number {
  return transactions.reduce((total, transaction) => total + transaction.changes.length, 0);
}

function estimateCellBytes(cell: BeadCell): number {
  return cell.kind === 'empty' ? 8 : 16 + cell.colorId.length * 2;
}

function normalizeRevision(revision: number): number {
  return Math.max(0, Math.floor(revision));
}

function cellsEqual(left: BeadCell, right: BeadCell): boolean {
  return (
    left.kind === right.kind &&
    (left.kind === 'empty' || (right.kind === 'bead' && left.colorId === right.colorId))
  );
}
