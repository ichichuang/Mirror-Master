# Preview Modes and Aligned Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five local preview render modes and make the processed source comparison geometrically identical to the pattern preview at every supported viewport.

**Architecture:** Keep the authoritative `BeadProject.cells` matrix unchanged. Add one typed preview-mode module, extend the existing canvas renderer with mode-specific drawing, and render the rotated/cropped source into a second canvas that shares the exact `preview-canvas-stack` frame. Keep crop editing as a separate view state inside the same stack.

**Tech Stack:** TypeScript 6, Vite 8, native Canvas 2D, Vaadin controls, CSS, Node test runner, Browser/IAB.

## Global Constraints

- Do not change project schema, backend generation API, export API, revision semantics, statistics or history.
- The four export-corresponding modes are `pure`, `annotated`, `numbered`, and `rounded`; `ring` is preview-only.
- The “拼豆 / 原图” switch remains present at all breakpoints.
- Do not commit, push, switch branches or overwrite the existing uncommitted P0 work.
- Update `docs/PRODUCT_SPEC.zh-CN.md` before production behavior.

---

### Task 1: Preview mode contract

**Files:**

- Create: `src/features/preview-workspace/previewMode.ts`
- Create: `tests/preview-mode.test.ts`
- Modify: `docs/PRODUCT_SPEC.zh-CN.md`

**Interfaces:**

- Produces: `PreviewRenderMode`, `PREVIEW_RENDER_MODES`, `DEFAULT_PREVIEW_RENDER_MODE`, `parsePreviewRenderMode`.
- Consumes: no runtime state.

- [x] **Step 1: Write the failing contract test**

```ts
assert.deepEqual(
  PREVIEW_RENDER_MODES.map(({ id, label }) => [id, label]),
  [
    ['pure', '纯图案'],
    ['annotated', '带标注'],
    ['numbered', '色号图纸'],
    ['rounded', '圆角方格'],
    ['ring', '圆环豆粒'],
  ],
);
assert.equal(DEFAULT_PREVIEW_RENDER_MODE, 'ring');
assert.equal(parsePreviewRenderMode('unexpected'), 'ring');
```

- [x] **Step 2: Run RED**

Run: `pnpm exec tsx --test tests/preview-mode.test.ts`

Expected: FAIL because `previewMode.ts` does not exist.

- [x] **Step 3: Implement the immutable typed contract**

Create the exported union, ordered frozen definitions, default and parser. Add the five-mode and strict-alignment behavior to product spec sections 7.5, 16 and acceptance criteria.

- [x] **Step 4: Run GREEN**

Run: `pnpm exec tsx --test tests/preview-mode.test.ts`

Expected: PASS.

### Task 2: Five matrix renderers

**Files:**

- Modify: `src/features/preview-workspace/previewRenderer.ts`
- Modify: `tests/preview-summary.test.ts`

**Interfaces:**

- Consumes: `PreviewRenderMode`, matrix cells, HEX and color-code maps.
- Produces: `drawPatternPreview(canvas, cells, colors, mode): boolean`.

- [x] **Step 1: Write failing renderer-layout tests**

Add pure-function tests for:

```ts
assert.equal(resolvePreviewCellLabel('MARD A14', 18, 'numbered'), 'A14');
assert.equal(resolvePreviewCellLabel('MARD A14', 7, 'numbered'), null);
assert.deepEqual(previewGuideWeight(10, 'annotated'), 3);
assert.deepEqual(previewGuideWeight(5, 'annotated'), 2);
assert.deepEqual(previewGuideWeight(3, 'pure'), 0);
```

- [x] **Step 2: Run RED**

Run: `pnpm exec tsx --test tests/preview-summary.test.ts`

Expected: FAIL because mode helpers are missing.

- [x] **Step 3: Implement mode-specific drawing**

Keep `computePreviewCanvasLayout` as the sole geometry source. Implement:

- full-cell rectangles for `pure`;
- minor, 5-cell and 10-cell grid weights for `annotated`;
- adaptive black/white labels for `numbered`;
- inset rounded rectangles for `rounded`;
- circles with a transparent-looking center hole for `ring`;
- shared empty-cell checker rendering.

Text contrast is derived from display HEX luminance. The renderer must never derive or change statistics.

- [x] **Step 4: Run GREEN and regression tests**

Run: `pnpm exec tsx --test tests/preview-summary.test.ts tests/pattern-trust.test.ts`

Expected: PASS.

### Task 3: Strictly aligned original canvas

**Files:**

- Modify: `src/features/preview-workspace/previewCrop.ts`
- Modify: `src/features/preview-workspace/previewView.ts`
- Modify: `src/features/preview-workspace/previewWorkspace.ts`
- Create: `tests/preview-alignment.test.ts`
- Modify: `tests/app-markup.test.ts`

**Interfaces:**

- Produces: `computeRotatedCropSourceRect`, `drawAlignedOriginalPreview`.
- Updates `PreviewViewController` with `setRenderMode`, `drawAlignedOriginal`, and the `adjust` view.

- [x] **Step 1: Write failing geometry tests**

Use hand-derived literals:

```ts
assert.deepEqual(
  computeRotatedCropSourceRect({ width: 1200, height: 800 }, 90, {
    x: 10,
    y: 20,
    width: 50,
    height: 40,
  }),
  { rotatedWidth: 800, rotatedHeight: 1200, x: 80, y: 240, width: 400, height: 480 },
);
```

Add markup assertions that both canvases are inside `data-preview-canvas-stack`, the original switch is present once, and `data-adjust-source` exists.

- [x] **Step 2: Run RED**

Run: `pnpm exec tsx --test tests/preview-alignment.test.ts tests/app-markup.test.ts`

Expected: FAIL because the aligned canvas and geometry function are missing.

- [x] **Step 3: Implement aligned rendering and separate adjust view**

Add `[data-preview-original-canvas]` as a sibling of the pattern canvas. Draw the rotated source into an offscreen canvas, crop by normalized percent, then scale the exact crop to the destination canvas bounds. Keep the existing crop frame under `[data-preview-adjust-view]`.

The compare switch controls only `pattern` and `original`; “调整原图” enters `adjust`. Selecting either compare choice exits adjust.

- [x] **Step 4: Run GREEN**

Run: `pnpm exec tsx --test tests/preview-alignment.test.ts tests/app-markup.test.ts`

Expected: PASS.

### Task 4: Session wiring and polished responsive controls

**Files:**

- Modify: `src/main.ts`
- Modify: `src/styles/page.css`
- Modify: `src/features/preview-workspace/previewWorkspace.ts`
- Modify: `tests/app-markup.test.ts`

**Interfaces:**

- Consumes: `PreviewRenderMode` definitions and extended view controller.
- Produces: persistent session mode switching, stable compare controls and responsive UI.

- [x] **Step 1: Write failing interaction markup assertions**

Assert five unique `data-preview-mode` values, 44 px minimum target, local overflow on the mode strip, and no rule that hides the original compare option.

- [x] **Step 2: Run RED**

Run: `pnpm exec tsx --test tests/app-markup.test.ts`

Expected: FAIL because mode controls and styles are missing.

- [x] **Step 3: Wire mode and view state**

Bind each mode button to `previewView.setRenderMode`, set `aria-pressed`, redraw locally and announce the selected label. Bind “调整原图” and “完成调整”. Redraw the aligned original after crop, rotation, source-variant, preview-result and resize changes.

- [x] **Step 4: Implement responsive styling**

Use one non-wrapping mode strip with `overflow-x: auto`, keep comparison controls above it, and place all preview canvases with identical absolute inset. Do not alter the surrounding mint studio tokens.

- [x] **Step 5: Run focused validation**

Run:

```bash
pnpm exec tsx --test tests/preview-mode.test.ts tests/preview-alignment.test.ts tests/preview-summary.test.ts tests/app-markup.test.ts
pnpm run typecheck
pnpm run lint
```

Expected: all pass.

### Task 5: Browser fidelity and final verification

**Files:**

- Update status: `docs/superpowers/specs/2026-07-28-preview-modes-aligned-compare-design.md`

**Interfaces:**

- Consumes: completed preview implementation.
- Produces: browser evidence and final validation report.

- [x] **Step 1: Run complete automated verification**

Run:

```bash
pnpm run test
pnpm run typecheck
pnpm run lint
pnpm run build
backend/.venv/bin/pytest backend/tests -q
git diff --check
```

- [x] **Step 2: Verify with Browser/IAB**

At 1440 × 900 and 390 × 844:

1. Upload one source image and wait for preview.
2. Switch all five modes and verify visible redraw without a generation request.
3. Switch pattern/original and compare both canvas rectangles through DOM geometry.
4. Enter and exit crop adjustment; verify the compare switch remains visible.
5. Confirm no console errors or framework overlay.

- [x] **Step 3: Visual comparison**

Capture latest desktop and mobile screenshots outside the repository. Compare with the accepted preview references through `view_image`, recording at least five visual points and intentional differences.

- [x] **Step 4: Mark the design verified**

Change status to `已实施并验证` only after every required check passes.
