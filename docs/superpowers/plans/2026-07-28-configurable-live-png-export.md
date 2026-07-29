# Configurable Live PNG Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fixed PNG templates with five presets, freely composable export content, and a real-time WYSIWYG PNG preview whose rendered Blob is the downloaded file.

**Architecture:** Add a typed PNG configuration module, a pure layout/rendering module, and a latest-request preview coordinator. The editor export surface will render the same offscreen canvas into desktop and mobile preview canvases, while the existing export coordinator receives the already-rendered PNG Blob; PDF, CSV, and JSON paths stay unchanged.

**Tech Stack:** TypeScript 6, Canvas 2D, Vaadin radio groups and checkboxes, Vite, Node test runner with `tsx`, Happy DOM.

## Global Constraints

- PNG only; PDF, CSV, and project JSON behavior must remain unchanged.
- Presets: `pure`, `annotated`, `numbered`, `rounded`, and `ring`.
- Background: `transparent` or `white`.
- Appearances: `bead`, `solidSquare`, `roundedSquare`, and `ring`.
- Independent content options: grid, coordinates, cell codes, statistics, material counts, and color swatch legend.
- Preview and download must use the same project revision, configuration signature, rendered canvas, and PNG Blob.
- PNG generation must work offline and must not depend on backend `pngTemplates`.
- Do not add a preview button; every configuration change schedules a live update.
- Do not change or commit unrelated dirty files.
- Do not create a Git commit without explicit user authorization.

---

### Task 1: Typed PNG configuration and presets

**Files:**

- Create: `src/features/export-completion/pngExportConfiguration.ts`
- Create: `tests/png-export-configuration.test.ts`
- Modify: `src/features/export-completion/exportState.ts`
- Modify: `tests/export-completion.test.ts`

**Interfaces:**

- Produces:
  - `PngExportPreset`
  - `PngExportPresetMatch`
  - `PngExportBackground`
  - `PngExportAppearance`
  - `PngExportConfiguration`
  - `PNG_EXPORT_PRESETS`
  - `configurationForPngExportPreset(preset)`
  - `configurationForPreviewMode(mode)`
  - `resolvePngExportPreset(configuration)`
  - `updatePngExportConfiguration(configuration, patch)`
  - `describePngExportConfiguration(configuration)`
- `ExportCompletionState` replaces `pngTemplate` with `pngConfiguration`.

- [ ] **Step 1: Write failing configuration tests**

```ts
test('five presets map to the approved independent PNG configuration', () => {
  assert.deepEqual(configurationForPngExportPreset('numbered'), {
    background: 'white',
    appearance: 'solidSquare',
    includeGrid: true,
    includeCoordinates: true,
    includeCellCodes: true,
    includeStatistics: true,
    includeMaterialCounts: true,
    includeColorLegend: true,
  });
  assert.equal(resolvePngExportPreset(configurationForPngExportPreset('ring')), 'ring');
});

test('a changed preset becomes custom and can match a preset again', () => {
  const pure = configurationForPngExportPreset('pure');
  const custom = updatePngExportConfiguration(pure, { includeGrid: true });
  assert.equal(resolvePngExportPreset(custom), 'custom');
  assert.equal(
    resolvePngExportPreset(updatePngExportConfiguration(custom, { includeGrid: false })),
    'pure',
  );
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm exec tsx --test tests/png-export-configuration.test.ts tests/export-completion.test.ts`

Expected: FAIL because the configuration module and `pngConfiguration` state do not exist.

- [ ] **Step 3: Implement immutable presets and state transitions**

Use frozen records. `resolvePngExportPreset` must compare every render field and return `custom` when no preset matches. `configurationForPreviewMode` must map all five preview modes directly.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `pnpm exec tsx --test tests/png-export-configuration.test.ts tests/export-completion.test.ts`

Expected: PASS.

### Task 2: PNG layout and Canvas renderer

**Files:**

- Create: `src/features/export-completion/pngExportRenderer.ts`
- Create: `tests/png-export-renderer.test.ts`

**Interfaces:**

- Consumes: `BeadProject`, `PngExportConfiguration`, color display/code maps.
- Produces:
  - `PngExportLayout`
  - `planPngExportLayout(project, configuration)`
  - `renderPngExportCanvas(canvas, input)`
  - `encodeCanvasAsPng(canvas)`
  - `pngExportConfigurationSignature(configuration)`

- [ ] **Step 1: Write failing layout and renderer contract tests**

```ts
test('optional sections consume no output space when disabled', () => {
  const pure = planPngExportLayout(projectFixture(), configurationForPngExportPreset('pure'));
  const annotated = planPngExportLayout(
    projectFixture(),
    configurationForPngExportPreset('annotated'),
  );
  assert.equal(pure.statisticsBox, null);
  assert.equal(pure.materialsBox, null);
  assert.ok(annotated.canvasHeight > pure.canvasHeight);
});

test('cell codes retain a readable cell size or fail explicitly', () => {
  const layout = planPngExportLayout(projectFixture(), configurationForPngExportPreset('numbered'));
  assert.ok(layout.cellSize >= 18);
});
```

Add a recording 2D context and assert that transparent exports call `clearRect` without a white canvas fill, while statistics and swatch configurations emit text and swatch drawing operations.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm exec tsx --test tests/png-export-renderer.test.ts`

Expected: FAIL because the renderer module does not exist.

- [ ] **Step 3: Implement deterministic layout**

Use:

```ts
const MAX_CANVAS_EDGE = 8192;
const MAX_CANVAS_PIXELS = 40_000_000;
const MIN_CELL_SIZE = 16;
const MIN_CODE_CELL_SIZE = 18;
```

The layout must allocate only enabled coordinate, statistics, material-count, and color-legend regions. Throw a stable Chinese `PngExportRenderError` instead of silently hiding cell codes.

- [ ] **Step 4: Implement the layered renderer**

Draw in this order: background, cells, guides, coordinates, statistics, materials, legend. Use adaptive black/white code text and five-/ten-cell guide weights. Standard bead and ring appearances must retain visible center holes; solid and rounded squares must not.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `pnpm exec tsx --test tests/png-export-renderer.test.ts`

Expected: PASS.

### Task 3: Latest-result preview coordinator and Blob handoff

**Files:**

- Create: `src/features/export-completion/pngExportPreviewCoordinator.ts`
- Create: `tests/png-export-preview-coordinator.test.ts`
- Modify: `src/features/export-completion/exportCoordinator.ts`
- Modify: `tests/export-coordinator.test.ts`

**Interfaces:**

- Consumes: project snapshot, configuration, render and encode dependencies.
- Produces:
  - `PngExportPreviewResult` with `revision`, `configurationSignature`, `canvas`, and `blob`.
  - `createPngExportPreviewCoordinator(dependencies)`.
  - `schedule(input)`, `result()`, `invalidate()`, and `destroy()`.
- `StartExportInput` gains `pngBlob?: Blob`; `shareImage` must use it without a remote request.

- [ ] **Step 1: Write failing stale-result tests**

```ts
test('rapid updates publish only the latest PNG preview result', async () => {
  coordinator.schedule(firstInput);
  coordinator.schedule(secondInput);
  await flushFrame();
  firstEncode.resolve(new Blob(['old']));
  secondEncode.resolve(new Blob(['new'], { type: 'image/png' }));
  assert.equal(coordinator.result()?.configurationSignature, secondSignature);
});
```

Add an export coordinator test that passes `pngBlob`, asserts zero remote calls, and verifies that the exact Blob instance reaches the object URL dependency.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm exec tsx --test tests/png-export-preview-coordinator.test.ts tests/export-coordinator.test.ts`

Expected: FAIL because no preview coordinator or `pngBlob` handoff exists.

- [ ] **Step 3: Implement frame coalescing and stale guards**

Only the newest token may publish ready/error state. Preserve the previous ready result while a new render is running. `invalidate` must clear the downloadable result.

- [ ] **Step 4: Make the export coordinator consume the ready Blob**

For `shareImage`, reject missing/non-PNG blobs with a stable local error. Keep PDF, CSV fallback, and JSON paths unchanged.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `pnpm exec tsx --test tests/png-export-preview-coordinator.test.ts tests/export-coordinator.test.ts`

Expected: PASS.

### Task 4: Responsive export controls and live preview surfaces

**Files:**

- Modify: `src/app.ts`
- Modify: `src/main.ts`
- Modify: `src/styles/page.css`
- Modify: `src/styles/vaadin-theme.css`
- Modify: `tests/app-markup.test.ts`
- Modify: `src/features/preview-workspace/previewMode.ts`
- Modify: `tests/preview-mode.test.ts`

**Interfaces:**

- Consumes: configuration functions and preview coordinator.
- Produces markup hooks:
  - `[data-export-preview-stage]`
  - `[data-export-preview-canvas]`
  - `[data-export-preset-options]`
  - `[data-export-background-options]`
  - `[data-export-appearance-options]`
  - `[data-export-content-option]`
  - `[data-export-configuration-summary]`
  - `[data-export-preview-status]`

- [ ] **Step 1: Write failing markup and synchronization tests**

Assert two responsive export surfaces expose five presets, two backgrounds, four appearances, six checkboxes, a live status region, and preview canvases. Assert no “导出预览” button exists.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm exec tsx --test tests/app-markup.test.ts tests/preview-mode.test.ts`

Expected: FAIL because the new controls and ring export mapping do not exist.

- [ ] **Step 3: Replace fixed template cards with grouped configuration controls**

Use existing Vaadin radio-group controllers and Vaadin checkboxes. All labels must remain customer-facing Simplified Chinese and retain 44px touch targets.

- [ ] **Step 4: Wire live rendering and exact download state**

When export opens:

```ts
exportCompletionState = setExportPngConfiguration(
  openExportCompletion(exportCompletionState, returnContext),
  configurationForPreviewMode(previewRenderMode),
);
schedulePngExportPreview();
```

On each control change, update the immutable configuration, sync both surfaces, and schedule one render. Copy the ready offscreen canvas into every visible display canvas. Enable download only when revision and configuration signature match.

- [ ] **Step 5: Add responsive presentation**

Desktop/tablet: show the main export preview in the canvas workspace and keep the inspector independently scrollable with a sticky action. Mobile: show a live preview at the top of the full export sheet, scroll configuration below it, and pin download above the safe area.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `pnpm exec tsx --test tests/app-markup.test.ts tests/preview-mode.test.ts tests/export-completion.test.ts`

Expected: PASS.

### Task 5: Full verification and visual QA

**Files:**

- Modify only if verification finds a feature-scoped defect.

- [ ] **Step 1: Generate/check icon styles if new existing-library icons are referenced**

Run: `pnpm run generate:icons && pnpm run check:icons`

- [ ] **Step 2: Run frontend verification**

Run:

```bash
pnpm run test
pnpm run typecheck
pnpm run lint
pnpm run build
git diff --check
```

Expected: all feature tests, typecheck, lint, build, and diff check pass. Report unrelated existing repository formatting failures separately rather than modifying those files.

- [ ] **Step 3: Run backend regression tests**

Run: `cd backend && python3 -m pytest tests/test_pattern_export.py tests/test_pattern_api.py`

Expected: PASS; the retained backend PNG/PDF/CSV contract is unchanged.

- [ ] **Step 4: Verify desktop interaction in the in-app Browser**

At a desktop viewport:

1. Open export.
2. Confirm the editor canvas is replaced by the final PNG composition.
3. Switch all five presets.
4. Toggle each background/content option.
5. Confirm every change updates without a preview button.
6. Confirm the download button only enables for the latest ready render.

- [ ] **Step 5: Verify mobile interaction in the in-app Browser**

At 390 × 844:

1. Confirm live preview stays visible above scrolling controls.
2. Confirm preset, background, appearance, and content controls do not overlap.
3. Confirm the download action stays above the safe area.
4. Confirm transparent output uses a checkerboard preview.

- [ ] **Step 6: Inspect downloaded PNG parity**

Verify at least:

- transparent pure preset alpha;
- numbered preset cell codes, statistics, material counts, and swatches;
- ring preset appearance;
- one custom combination with only image plus coordinates and statistics.

The downloaded PNG must match the live preview composition and configuration summary.
