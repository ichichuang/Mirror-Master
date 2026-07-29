# P0 Mirror Reliability and Pattern Trust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make matrix-derived counts visibly trustworthy and separate reverse viewing, matrix
flipping, and existing-chart mirroring into reliable, independently tested customer actions.

**Architecture:** Preserve the existing Vite/TypeScript, persistent workspace, Canvas, and
FastAPI/OpenCV/Pillow boundaries. Add one pure pattern-trust derivation/formatting module, one
verified matrix-mirror command, and one pure existing-chart confirmation-state module; keep
`src/main.ts` responsible only for lifecycle orchestration and DOM synchronization.

**Tech Stack:** TypeScript 6, Vite 8, Node test runner with happy-dom, Vaadin Web Components,
FastAPI, Pydantic, OpenCV, Pillow, pytest.

## Global Constraints

- `docs/PRODUCT_SPEC.zh-CN.md` remains the only normative product specification.
- The structured `cells` matrix remains the only business truth for preview, statistics, mirror,
  materials, and export.
- Do not introduce React, Vue, a state-management framework, or a new dependency.
- Do not add making mode, cleanup tools, inventory, purchasing, or new export templates.
- Customer copy uses only “查看反面”, “水平翻转图案”, “垂直翻转图案”, and “镜像已有图纸”.
- Do not expose revision, schema, hashes, or internal enum names in customer UI.
- Preserve persistent panel nodes, focus, input state, bottom-sheet state, and scroll positions.
- Do not create Git commits, switch branches, or push; repository instructions require explicit
  authorization for those actions.

---

### Task 1: Reconcile the Existing Selection Boundary Baseline

**Files:**

- Modify: `tests/selection-operations.test.ts`
- Modify: `tests/editor-canvas-controller.test.ts`
- Inspect only: `src/features/pattern-editor/selection.ts`
- Inspect only: `docs/PRODUCT_SPEC.zh-CN.md` section 9.2

**Interfaces:**

- Consumes: `boundSelectionTranslation(cells, selection, deltaRow, deltaColumn)`
- Produces: a green pre-feature `pnpm run test` baseline that matches the existing requirement that
  a selection transfer is bounded as a whole instead of partially cropped.

- [ ] **Step 1: Update the copy boundary test to the normative bounded behavior**

```ts
test('copy bounds the full selection inside the matrix', () => {
  const cells = matrix([[EMPTY, bead('A'), bead('B'), EMPTY]]);
  const result = copySelectedCells(
    cells,
    { startRow: 0, startColumn: 1, endRow: 0, endColumn: 2 },
    0,
    2,
  );

  assert.deepEqual(result.cells, matrix([[EMPTY, bead('A'), bead('A'), bead('B')]]));
  assert.deepEqual(result.selection, {
    startRow: 0,
    startColumn: 2,
    endRow: 0,
    endColumn: 3,
  });
});
```

- [ ] **Step 2: Update the move boundary test to keep the full destination**

```ts
test('a partially out-of-bounds move is bounded before committing', () => {
  const cells = matrix([
    [bead('A'), bead('B'), EMPTY],
    [bead('C'), bead('D'), EMPTY],
  ]);
  const result = moveSelectedCells(
    cells,
    { startRow: 0, startColumn: 0, endRow: 1, endColumn: 1 },
    0,
    2,
  );

  assert.deepEqual(
    result.cells,
    matrix([
      [EMPTY, bead('A'), bead('B')],
      [EMPTY, bead('C'), bead('D')],
    ]),
  );
  assert.deepEqual(result.selection, {
    startRow: 0,
    startColumn: 1,
    endRow: 1,
    endColumn: 2,
  });
});
```

- [ ] **Step 3: Update the Canvas integration expectation to the same bounded result**

Rename the failing controller test to
`explicit move placement bounds a partial out-of-bounds target before commit` and assert the same
bounded matrix and selection exposed by the domain test.

- [ ] **Step 4: Run the narrow tests**

Run:

```bash
pnpm exec tsx --test tests/selection-operations.test.ts tests/editor-canvas-controller.test.ts
```

Expected: all selection and Canvas controller tests pass.

- [ ] **Step 5: Run the full frontend baseline**

Run:

```bash
pnpm run test
```

Expected: 249 tests pass, 0 fail before feature code is added.

---

### Task 2: Add the Normative Trust Contract and Pure Derivation

**Files:**

- Modify: `docs/PRODUCT_SPEC.zh-CN.md`
- Create: `src/features/pattern-trust/patternTrust.ts`
- Create: `tests/pattern-trust.test.ts`
- Modify: `src/features/preview-workspace/previewSummary.ts`
- Modify: `tests/preview-summary.test.ts`

**Interfaces:**

- Consumes:
  `calculateStatistics(cells): ProjectStatistics` and `BeadProject`.
- Produces:

```ts
export interface PatternTrustSummary {
  readonly rows: number;
  readonly columns: number;
  readonly totalCellCount: number;
  readonly nonEmptyBeadCount: number;
  readonly blankCount: number;
  readonly usedColorCount: number;
  readonly perColorCountSum: number;
  readonly isValid: true;
}

export interface PatternTrustCopy {
  readonly primary: string;
  readonly verification: '图纸统计校验通过';
}

export function createPatternTrustSummary(project: BeadProject): PatternTrustSummary;
export function formatPatternTrustSummary(summary: PatternTrustSummary): PatternTrustCopy;
```

- [ ] **Step 1: Add failing trust derivation tests**

```ts
test('trust summary derives every count from one project matrix', () => {
  const summary = createPatternTrustSummary(
    projectWithCells([
      [bead('default:A01'), empty()],
      [bead('default:A01'), bead('default:A02')],
    ]),
  );

  assert.deepEqual(summary, {
    rows: 2,
    columns: 2,
    totalCellCount: 4,
    nonEmptyBeadCount: 3,
    blankCount: 1,
    usedColorCount: 2,
    perColorCountSum: 3,
    isValid: true,
  });
});

test('trust copy distinguishes full and transparent patterns', () => {
  assert.deepEqual(formatPatternTrustSummary(fullSummary), {
    primary: '20 × 21 格 · 420 颗豆 · 8 种颜色',
    verification: '图纸统计校验通过',
  });
  assert.deepEqual(formatPatternTrustSummary(summaryWithBlanks), {
    primary: '总格数 420 · 实际用豆 356 · 空白 64 · 8 种颜色',
    verification: '图纸统计校验通过',
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
pnpm exec tsx --test tests/pattern-trust.test.ts
```

Expected: FAIL because `patternTrust.ts` does not exist.

- [ ] **Step 3: Update the normative product specification**

In section 11, add the customer-visible trust contract and exact copy for a full matrix and a matrix
with blanks. In sections 16 and 18, require the same trust summary in preview, editor/materials, and
export entry, and require values to match the current matrix revision.

- [ ] **Step 4: Implement the pure derivation and formatter**

Implementation rules:

```ts
const statistics = calculateStatistics(project.cells);
const totalCellCount = project.grid.rows * project.grid.columns;
const perColorCountSum = Object.values(statistics.perColorCounts).reduce(
  (total, count) => total + count,
  0,
);

if (
  project.cells.length !== project.grid.rows ||
  project.cells.some((row) => row.length !== project.grid.columns) ||
  perColorCountSum !== statistics.nonEmptyBeadCount ||
  statistics.nonEmptyBeadCount + statistics.blankCount !== totalCellCount
) {
  throw new Error('图纸统计与当前矩阵不一致。');
}
```

Freeze the returned summary and copy objects. Do not cache either structure.

- [ ] **Step 5: Route the preview formatter through the trust module**

Keep physical size and board count in `formatPreviewSummary`, but source the grid, bead, color, and
blank wording from `formatPatternTrustSummary(createPatternTrustSummary(project))`. Add focused
tests for full and transparent matrices.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm exec tsx --test tests/pattern-trust.test.ts tests/preview-summary.test.ts
```

Expected: all focused tests pass.

---

### Task 3: Surface the Same Trust Summary Across the Customer Workflow

**Files:**

- Modify: `src/app.ts`
- Modify: `src/main.ts`
- Modify: `src/styles/page.css`
- Modify: `src/features/workspace-panels/workspacePanels.ts`
- Modify: `tests/app-markup.test.ts`
- Modify: `tests/workspace-focus.test.ts`
- Modify: `tests/export-completion.test.ts`

**Interfaces:**

- Consumes:
  `createPatternTrustSummary(project)` and `formatPatternTrustSummary(summary)`.
- Extends `WorkspacePanelsView` with:

```ts
readonly trustPrimary: string;
readonly trustVerification: string;
```

- Produces persistent hooks:

```text
data-preview-trust-summary
data-preview-trust-verification
data-workspace-trust-summary
data-workspace-trust-verification
data-export-trust-summary
data-export-trust-verification
```

- [ ] **Step 1: Write failing markup and persistent-node tests**

Assert that preview, both editor surfaces, and both export completion panels contain the trust hooks,
that verification nodes use stable status semantics, and that ordinary panel updates retain node
identity.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
pnpm exec tsx --test tests/app-markup.test.ts tests/workspace-focus.test.ts tests/export-completion.test.ts
```

Expected: FAIL because the trust hooks and view properties do not exist.

- [ ] **Step 3: Add code-native trust surfaces**

Add a compact trust block to the existing preview result region, materials panel, and export
completion panel. The block is open layout, not a nested card. Use:

```html
<div class="pattern-trust" data-pattern-trust>
  <p data-*-trust-summary></p>
  <p class="pattern-trust-verification" role="status" data-*-trust-verification></p>
</div>
```

The exact hook name replaces `*-trust-*` for each surface.

- [ ] **Step 4: Populate all surfaces from one formatter**

In `createWorkspacePanelsView`, `syncPreviewResult`, and `syncExportCompletionUi`, derive trust copy
once per update and assign only `textContent`. Do not call `innerHTML`, recreate the panel, or
recalculate counts independently.

- [ ] **Step 5: Add responsive styles**

Use existing semantic tokens. The verification line must use the normal success semantic color, not
a palette swatch. At compact widths, keep the primary text on at most two lines and do not increase
the bottom-sheet peek height enough to cover more Canvas content.

- [ ] **Step 6: Run focused and responsive tests**

Run:

```bash
pnpm exec tsx --test tests/app-markup.test.ts tests/workspace-focus.test.ts tests/export-completion.test.ts tests/responsive-layout.test.ts
```

Expected: all focused tests pass with persistent node identity preserved.

---

### Task 4: Protect Matrix Flips and Clarify Mirror Semantics

**Files:**

- Create: `src/features/pattern-editor/mirrorCommand.ts`
- Create: `tests/mirror-command.test.ts`
- Modify: `src/features/workspace-panels/workspacePanels.ts`
- Modify: `src/app.ts`
- Modify: `src/main.ts`
- Modify: `tests/app-markup.test.ts`
- Modify: `tests/editor-canvas-controller.test.ts`
- Modify: `tests/project.test.ts`

**Interfaces:**

- Consumes:
  `mirrorCells(cells, axis)`, `createPatternTrustSummary(project)`, and `MatrixHistory.commit(cells)`.
- Produces:

```ts
export type MatrixMirrorAxis = 'horizontal' | 'vertical';

export interface VerifiedMatrixMirror {
  readonly cells: readonly (readonly BeadCell[])[];
  readonly before: PatternTrustSummary;
  readonly after: PatternTrustSummary;
}

export function createVerifiedMatrixMirror(
  project: BeadProject,
  axis: MatrixMirrorAxis,
): VerifiedMatrixMirror;
```

- [ ] **Step 1: Add failing verified-mirror tests**

```ts
test('verified horizontal and vertical mirrors preserve every material count', () => {
  for (const axis of ['horizontal', 'vertical'] as const) {
    const result = createVerifiedMatrixMirror(project, axis);
    assert.equal(result.after.totalCellCount, result.before.totalCellCount);
    assert.equal(result.after.nonEmptyBeadCount, result.before.nonEmptyBeadCount);
    assert.equal(result.after.blankCount, result.before.blankCount);
    assert.equal(result.after.usedColorCount, result.before.usedColorCount);
  }
});

test('the same verified mirror twice restores every cell', () => {
  const once = createVerifiedMatrixMirror(project, 'horizontal');
  const twice = createVerifiedMatrixMirror(withProjectCells(project, once.cells), 'horizontal');
  assert.deepEqual(twice.cells, project.cells);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec tsx --test tests/mirror-command.test.ts
```

Expected: FAIL because `mirrorCommand.ts` does not exist.

- [ ] **Step 3: Implement the verified command**

Create mirrored cells, build an in-memory candidate project for trust derivation, compare the before
and after summaries, and throw `图案翻转后的材料统计与原图不一致。` before returning if any size,
bead, blank, color, or per-color count differs. Do not mutate the project or history in this module.

- [ ] **Step 4: Integrate one history transaction**

Replace the direct `mirrorCells` call in `mirrorProject` with `createVerifiedMatrixMirror`. Commit
only the returned cells to history. On verification failure, keep `currentProject`, history, Canvas,
and export state unchanged and announce the stable error.

- [ ] **Step 5: Replace ambiguous customer copy**

Use:

```text
正面
查看反面
水平翻转图案
垂直翻转图案
```

Completion announcements are `图案已水平翻转。` and `图案已垂直翻转。`. The reverse-view test
must assert no commit callback, no revision change, and no matrix change.

- [ ] **Step 6: Run focused mirror tests**

Run:

```bash
pnpm exec tsx --test tests/mirror-command.test.ts tests/project.test.ts tests/editor-canvas-controller.test.ts tests/app-markup.test.ts
```

Expected: all mirror and copy tests pass.

---

### Task 5: Make Existing-Chart Confirmation Explicit and Race-Safe

**Files:**

- Create: `src/features/grid-editor/confirmationState.ts`
- Create: `src/features/grid-editor/chartMirrorCoordinator.ts`
- Create: `tests/grid-confirmation-state.test.ts`
- Create: `tests/chart-mirror-coordinator.test.ts`
- Modify: `src/app.ts`
- Modify: `src/main.ts`
- Modify: `src/features/grid-editor/gridEditor.ts`
- Modify: `tests/app-markup.test.ts`
- Modify: `tests/file-validation-capabilities.test.ts`

**Interfaces:**

- Consumes:
  `GridDetectionContract`, `mirrorGrid(file, contract, axis, signal)`.
- Produces:

```ts
export type GridConfidenceLevel = 'high' | 'review' | 'insufficient';

export interface GridConfirmationState {
  readonly level: GridConfidenceLevel;
  readonly dimensions: string;
  readonly confidenceLabel: string;
  readonly warning: string | null;
  readonly canSubmit: boolean;
  readonly requiresWarningAcknowledgement: boolean;
}

export function resolveGridConfirmation(
  contract: GridDetectionContract | null,
  warningAcknowledged: boolean,
): GridConfirmationState;

export interface ChartMirrorCoordinator {
  readonly run: (
    file: File,
    contract: GridDetectionContract,
    axis: 'horizontal' | 'vertical',
  ) => Promise<Blob | null>;
  readonly cancel: () => void;
  readonly isRunning: () => boolean;
}

export function createChartMirrorCoordinator(options: {
  readonly request: (
    file: File,
    contract: GridDetectionContract,
    axis: 'horizontal' | 'vertical',
    signal: AbortSignal,
  ) => Promise<Blob>;
}): ChartMirrorCoordinator;
```

- [ ] **Step 1: Add failing confirmation-state tests**

```ts
test('a clean contract is high confidence and submit-ready', () => {
  assert.deepEqual(resolveGridConfirmation(cleanContract, false), {
    level: 'high',
    dimensions: '检测到 20 列 × 21 行',
    confidenceLabel: '网格置信度：高',
    warning: null,
    canSubmit: true,
    requiresWarningAcknowledgement: false,
  });
});

test('a warning requires one explicit acknowledgement', () => {
  assert.equal(resolveGridConfirmation(warningContract, false).canSubmit, false);
  assert.equal(resolveGridConfirmation(warningContract, true).canSubmit, true);
});

test('no valid contract is insufficient and cannot submit', () => {
  assert.equal(resolveGridConfirmation(null, false).level, 'insufficient');
  assert.equal(resolveGridConfirmation(null, false).canSubmit, false);
});
```

- [ ] **Step 2: Run the state test to verify it fails**

Run:

```bash
pnpm exec tsx --test tests/grid-confirmation-state.test.ts
```

Expected: FAIL because `confirmationState.ts` does not exist.

- [ ] **Step 3: Implement deterministic confirmation state**

Do not invent a new numeric confidence threshold. A complete contract without `warning` is `high`; a
complete contract with `warning` is `review`; no valid contract is `insufficient`. A `review`
contract becomes submit-ready only after its warning is acknowledged.

- [ ] **Step 4: Add persistent confirmation copy**

Add code-native nodes for detected dimensions, confidence label, warning, and grid overlay
instructions. Rename directions to `水平镜像` and `垂直镜像`, and the primary operation to
`确认并镜像`. Contract changes reset warning acknowledgement.

- [ ] **Step 5: Add a two-step warning confirmation**

For a warning contract, the first primary-button activation records acknowledgement, keeps the
result unchanged, announces the warning, and changes the button copy to `确认提示并镜像`. The second
activation starts the request. An invalid contract never starts a request.

- [ ] **Step 6: Preserve the last valid result during async work**

Implement `createChartMirrorCoordinator` with one active `AbortController` and a monotonically
increasing token. `run` cancels the prior request and returns `null` for cancelled or late success;
only the current token may return a Blob. A genuine current failure is rethrown. `cancel` aborts and
invalidates the token.

Do not call `clearChartResult()` when a mirror request starts or fails. Create the replacement object
URL only after the coordinator returns a current Blob; then show the new result and revoke the old
URL. Repeated activation while `isRunning()` is true must be a no-op.

- [ ] **Step 7: Add race and failure tests**

Cover:

- warning acknowledgement does not call `mirrorGrid`;
- the second activation calls it once;
- a late prior success does not replace the current result;
- cancellation and late completion return `null` without a visible effect;
- a genuine current failure is rethrown so the caller preserves the prior result URL and displays
  the stable error;
- changing the contract invalidates acknowledgement;
- no-contract and detecting states disable the primary action.

- [ ] **Step 8: Run focused chart tests**

Run:

```bash
pnpm exec tsx --test tests/grid-confirmation-state.test.ts tests/chart-mirror-coordinator.test.ts tests/app-markup.test.ts tests/file-validation-capabilities.test.ts
```

Expected: all confirmation, copy, and capability tests pass.

---

### Task 6: Strengthen Existing-Chart Pixel Invariants

**Files:**

- Modify: `backend/tests/test_mirror_api.py`
- Inspect only: `backend/app/mirror.py`
- Modify only if a new test exposes a contract defect: `backend/app/mirror.py`

**Interfaces:**

- Consumes:
  `POST /api/grid/mirror` with a confirmed `GridContract`.
- Produces:
  regression coverage for full-cell movement, external-pixel identity, and double-mirror identity on
  both axes.

- [ ] **Step 1: Add a fixture with readable asymmetric cell content**

Build a small RGBA image with a labeled outer region and cell-local asymmetric marks. Keep an exact
mask of pixels outside the half-open grid bounds.

- [ ] **Step 2: Add horizontal and vertical invariant tests**

For each axis:

```py
assert np.array_equal(result_pixels[outside_mask], source_pixels[outside_mask])
assert moved_cell.tobytes() == original_source_cell.tobytes()
assert double_mirror.tobytes() == normalized_source.tobytes()
```

The moved cell comparison must prove the cell contents moved without an internal flip.

- [ ] **Step 3: Run the focused backend test**

Run:

```bash
backend/.venv/bin/pytest backend/tests/test_mirror_api.py -q
```

Expected: all mirror API tests pass without changing production code. If a new test fails, patch only
the source-cell read or destination paste calculation in `backend/app/mirror.py`, then rerun.

---

### Task 7: Full Validation and Browser Fidelity Review

**Files:**

- Modify if required by evidence: files changed in Tasks 1–6 only
- Create QA screenshots under: `artifacts/qa/`
- Update: `docs/superpowers/specs/2026-07-28-p0-mirror-trust-design.md`

**Interfaces:**

- Consumes: the completed P0 implementation.
- Produces: automated validation, responsive browser evidence, and a final implementation status.

- [ ] **Step 1: Run generated-asset checks and the full frontend suite**

Run:

```bash
pnpm run check:palettes
pnpm run check:icons
pnpm run check:tokens
pnpm run check:brand
pnpm run test
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run build
```

Expected: every command exits 0.

- [ ] **Step 2: Run the focused and full backend suites**

Run:

```bash
backend/.venv/bin/pytest backend/tests/test_mirror_api.py -q
backend/.venv/bin/pytest backend/tests -q
```

Expected: every test passes.

- [ ] **Step 3: Start the local application**

Run:

```bash
./scripts/start-local.sh
```

Expected: application available at `http://127.0.0.1:8000` and health check succeeds.

- [ ] **Step 4: Verify the core workflow in the browser**

Use the installed Browser/IAB tooling first. Check:

1. preview trust summary;
2. editor/material trust summary;
3. export-entry trust summary;
4. reverse view with unchanged history;
5. horizontal and vertical matrix flips with unchanged counts;
6. existing-chart dimensions, confidence, warning acknowledgement, axis choice, result replacement,
   and failure preservation.

- [ ] **Step 5: Check responsive surfaces**

Capture desktop at 1440 px and mobile at 390 px. Also inspect 320, 768, and 1024 px for overflow,
covered primary actions, clipped trust copy, inaccessible confirmation controls, and Canvas loss.

- [ ] **Step 6: Perform the Build Web Apps fidelity review**

Use `view_image` on the existing accepted workspace reference screenshots and the latest desktop and
mobile render screenshots. Record at least five comparisons: copy, trust hierarchy, container model,
typography, semantic colors, responsive behavior, and unchanged Canvas prominence. Fix every
material mismatch.

- [ ] **Step 7: Final repository checks**

Run:

```bash
git diff --check
git status --short
```

Confirm no secrets, temporary files, generated browser traces, or unrelated changes are present.
Change the design document status to `已实施并验证` only after all required validation passes.
