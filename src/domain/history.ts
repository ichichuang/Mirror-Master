import { cloneCells, type BeadCell } from './project';

export interface MatrixHistorySnapshot {
  readonly cells: readonly (readonly BeadCell[])[];
  readonly revision: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

interface MatrixHistoryState {
  readonly cells: readonly (readonly BeadCell[])[];
  readonly revision: number;
}

export class MatrixHistory {
  readonly #limit: number;
  #past: MatrixHistoryState[] = [];
  #present: MatrixHistoryState;
  #future: MatrixHistoryState[] = [];

  constructor(initialCells: readonly (readonly BeadCell[])[], limit = 100, initialRevision = 0) {
    this.#present = freezeState(initialCells, initialRevision);
    this.#limit = Math.max(1, Math.floor(limit));
  }

  get snapshot(): MatrixHistorySnapshot {
    return Object.freeze({
      cells: cloneCells(this.#present.cells),
      revision: this.#present.revision,
      canUndo: this.#past.length > 0,
      canRedo: this.#future.length > 0,
    });
  }

  commit(
    nextCells: readonly (readonly BeadCell[])[],
    revision = this.#present.revision + 1,
  ): MatrixHistorySnapshot {
    this.#past.push(cloneState(this.#present));
    if (this.#past.length > this.#limit) {
      this.#past.shift();
    }
    this.#present = freezeState(nextCells, revision);
    this.#future = [];
    return this.snapshot;
  }

  undo(): MatrixHistorySnapshot {
    const previous = this.#past.pop();
    if (!previous) {
      return this.snapshot;
    }
    this.#future.push(cloneState(this.#present));
    this.#present = previous;
    return this.snapshot;
  }

  redo(): MatrixHistorySnapshot {
    const next = this.#future.pop();
    if (!next) {
      return this.snapshot;
    }
    this.#past.push(cloneState(this.#present));
    this.#present = next;
    return this.snapshot;
  }
}

function freezeState(
  cells: readonly (readonly BeadCell[])[],
  revision: number,
): MatrixHistoryState {
  return Object.freeze({
    cells: cloneCells(cells),
    revision: Math.max(0, Math.floor(revision)),
  });
}

function cloneState(state: MatrixHistoryState): MatrixHistoryState {
  return freezeState(state.cells, state.revision);
}
