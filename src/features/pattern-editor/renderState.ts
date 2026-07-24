export interface RenderCell {
  readonly row: number;
  readonly column: number;
}

export interface RenderPlan {
  readonly full: boolean;
  readonly overlay: boolean;
  readonly cells: readonly RenderCell[];
}

export interface EditorPerformanceSnapshot {
  readonly frameCount: number;
  readonly fullFrameCount: number;
  readonly dirtyFrameCount: number;
  readonly visitedCellCount: number;
  readonly lastFrameDurationMs: number;
  readonly maxFrameDurationMs: number;
  readonly transactionCount: number;
  readonly lastTransactionDurationMs: number;
  readonly maxTransactionDurationMs: number;
}

export class RenderInvalidation {
  readonly #cells = new Map<string, RenderCell>();
  #full = false;
  #overlay = false;

  get hasPending(): boolean {
    return this.#full || this.#overlay || this.#cells.size > 0;
  }

  markCell(row: number, column: number): void {
    if (!this.#full) {
      this.#cells.set(`${String(row)}:${String(column)}`, Object.freeze({ row, column }));
    }
  }

  markCells(cells: Iterable<RenderCell>): void {
    for (const cell of cells) {
      this.markCell(cell.row, cell.column);
    }
  }

  markOverlay(): void {
    this.#overlay = true;
  }

  markFull(): void {
    this.#full = true;
    this.#cells.clear();
  }

  consume(): RenderPlan {
    const plan = Object.freeze({
      full: this.#full,
      overlay: this.#overlay,
      cells: Object.freeze(this.#full ? [] : [...this.#cells.values()]),
    });
    this.#full = false;
    this.#overlay = false;
    this.#cells.clear();
    return plan;
  }
}

export class EditorPerformanceTracker {
  #frameCount = 0;
  #fullFrameCount = 0;
  #dirtyFrameCount = 0;
  #visitedCellCount = 0;
  #lastFrameDurationMs = 0;
  #maxFrameDurationMs = 0;
  #transactionCount = 0;
  #lastTransactionDurationMs = 0;
  #maxTransactionDurationMs = 0;

  get snapshot(): EditorPerformanceSnapshot {
    return Object.freeze({
      frameCount: this.#frameCount,
      fullFrameCount: this.#fullFrameCount,
      dirtyFrameCount: this.#dirtyFrameCount,
      visitedCellCount: this.#visitedCellCount,
      lastFrameDurationMs: this.#lastFrameDurationMs,
      maxFrameDurationMs: this.#maxFrameDurationMs,
      transactionCount: this.#transactionCount,
      lastTransactionDurationMs: this.#lastTransactionDurationMs,
      maxTransactionDurationMs: this.#maxTransactionDurationMs,
    });
  }

  recordFrame(kind: 'full' | 'dirty', durationMs: number, visitedCells: number): void {
    this.#frameCount += 1;
    if (kind === 'full') {
      this.#fullFrameCount += 1;
    } else {
      this.#dirtyFrameCount += 1;
    }
    this.#visitedCellCount += visitedCells;
    this.#lastFrameDurationMs = durationMs;
    this.#maxFrameDurationMs = Math.max(this.#maxFrameDurationMs, durationMs);
  }

  recordTransaction(durationMs: number): void {
    this.#transactionCount += 1;
    this.#lastTransactionDurationMs = durationMs;
    this.#maxTransactionDurationMs = Math.max(this.#maxTransactionDurationMs, durationMs);
  }

  reset(): void {
    this.#frameCount = 0;
    this.#fullFrameCount = 0;
    this.#dirtyFrameCount = 0;
    this.#visitedCellCount = 0;
    this.#lastFrameDurationMs = 0;
    this.#maxFrameDurationMs = 0;
    this.#transactionCount = 0;
    this.#lastTransactionDurationMs = 0;
    this.#maxTransactionDurationMs = 0;
  }
}
