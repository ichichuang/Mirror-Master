# Preview Toolbar UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compress the preview toolbar into a canvas-first two-row layout, make preview-mode selection always reveal the pattern, and replace persistent background-removal help with compact contextual status.

**Architecture:** Preserve the existing preview workspace, matrix renderer, compare controller and source-image session. Extend the existing typed preview and background-removal contracts with customer-facing compact labels and a pure mode-selection result, then make `main.ts` consume those contracts while CSS handles the responsive label variants and one-line toolbar geometry.

**Tech Stack:** TypeScript 6, Vite 8, native Canvas 2D, Vaadin radio controls, CSS, Node test runner, Browser/IAB.

## Global Constraints

- Do not modify `BeadProject`, generation API, background-removal API, export API, statistics, history, mirrors or editor behavior.
- Keep “拼豆 / 原图” present at every supported breakpoint.
- Keep every image action at least 44 × 44 CSS px.
- At 390 px all five preview modes must fit; at 320 px only the mode strip may scroll horizontally.
- Do not add dependencies, assets, gradients, glass effects, badges, decorative animation or global state.
- Preserve existing uncommitted work; do not commit, push, switch branches or reformat unrelated files.

---

### Task 1: Compact background-removal action contract

**Files:**

- Modify: `src/features/background-removal/backgroundRemovalFlow.ts`
- Modify: `tests/background-removal.test.ts`

**Interfaces:**

- Consumes: existing `BackgroundRemovalActionStateInput`.
- Produces: `BackgroundRemovalActionState.compactLabel`.

- [ ] **Step 1: Extend the failing action-state assertions**

Update the existing action-state tests so the expected objects include:

```ts
{
  hidden: false,
  disabled: false,
  label: '一键去背景',
  compactLabel: '去背',
}
```

Also assert these mappings:

```ts
assert.equal(busy.compactLabel, '处理中');
assert.equal(foregroundActive.compactLabel, '恢复');
assert.equal(cachedForeground.compactLabel, '使用去背图');
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm exec tsx --test tests/background-removal.test.ts
```

Expected: FAIL because `compactLabel` is missing.

- [ ] **Step 3: Implement the typed compact label**

Extend the interface with:

```ts
readonly compactLabel: '去背' | '处理中' | '恢复' | '使用去背图';
```

Derive it from the same state branches that produce `label`; do not parse the long label afterward.

- [ ] **Step 4: Run GREEN**

Run:

```bash
pnpm exec tsx --test tests/background-removal.test.ts
```

Expected: PASS.

### Task 2: Canvas-first toolbar markup

**Files:**

- Modify: `src/features/preview-workspace/previewWorkspace.ts`
- Modify: `tests/app-markup.test.ts`
- Modify: `docs/PRODUCT_SPEC.zh-CN.md`

**Interfaces:**

- Consumes: existing compare, crop, background-removal and replacement hooks.
- Produces: `[data-preview-image-actions]`, `[data-action-label-long]`, `[data-action-label-short]`, and a standalone `[data-background-removal-status]`.

- [ ] **Step 1: Write failing markup assertions**

Assert that the preview markup:

```ts
assert.match(preview, /data-preview-image-actions/u);
assert.match(preview, /data-action-label-short>裁剪</u);
assert.match(preview, /data-action-label-long>调整原图</u);
assert.match(preview, /data-action-label-short>换图</u);
assert.match(preview, /data-background-removal-label-short/u);
assert.match(preview, /data-background-removal-label-long/u);
assert.doesNotMatch(preview, /自动保留主要人物或物体，处理后可恢复原图/u);
```

Require the standalone status to retain `role="status"` and `aria-live="polite"`.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm exec tsx --test tests/app-markup.test.ts
```

Expected: FAIL because the compact action group and label variants do not exist.

- [ ] **Step 3: Update the canonical product contract**

Add the compact two-row toolbar, contextual background-removal status, mode-to-pattern behavior and 390/320 responsive requirements to `docs/PRODUCT_SPEC.zh-CN.md` section 7.5 and acceptance criteria before production markup changes.

- [ ] **Step 4: Implement semantic toolbar markup**

Use this structure inside `.preview-compare-bar`:

```html
<div class="preview-image-actions" data-preview-image-actions>
  <button class="secondary-button preview-image-action" data-adjust-source>
    <i class="ph ph-crop"></i>
    <span data-action-label-short>裁剪</span>
    <span data-action-label-long>调整原图</span>
  </button>
  <div class="background-removal-control" data-background-removal-control hidden>
    <button class="secondary-button preview-image-action" data-background-removal-action>
      <i class="ph ph-person-simple-circle"></i>
      <span data-background-removal-label-short>去背</span>
      <span data-background-removal-label-long>一键去背景</span>
    </button>
  </div>
  <button class="secondary-button preview-image-action" data-prepare-replace>
    <i class="ph ph-image"></i>
    <span data-action-label-short>换图</span>
    <span data-action-label-long>更换图片</span>
  </button>
</div>
<p data-background-removal-status role="status" aria-live="polite"></p>
```

Keep the compare group and desktop-only hold control outside the image-action group.

- [ ] **Step 5: Run GREEN**

Run:

```bash
pnpm exec tsx --test tests/app-markup.test.ts
```

Expected: PASS.

### Task 3: Preview mode selection always reveals the pattern

**Files:**

- Modify: `src/features/preview-workspace/previewMode.ts`
- Modify: `src/main.ts`
- Modify: `tests/preview-mode.test.ts`
- Modify: `tests/app-markup.test.ts`

**Interfaces:**

- Produces: `createPreviewModeSelection(value: unknown): PreviewModeSelection`.
- Consumes: `parsePreviewRenderMode`, `PREVIEW_RENDER_MODES`.

- [ ] **Step 1: Write the failing pure-state test**

Add:

```ts
assert.deepEqual(createPreviewModeSelection('numbered'), {
  mode: 'numbered',
  compareView: 'pattern',
  announcement: '已切换为色号图纸预览。',
});
assert.deepEqual(createPreviewModeSelection('unexpected'), {
  mode: 'ring',
  compareView: 'pattern',
  announcement: '已切换为圆环豆粒预览。',
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm exec tsx --test tests/preview-mode.test.ts
```

Expected: FAIL because `createPreviewModeSelection` does not exist.

- [ ] **Step 3: Implement the immutable selection result**

Define:

```ts
export interface PreviewModeSelection {
  readonly mode: PreviewRenderMode;
  readonly compareView: 'pattern';
  readonly announcement: string;
}
```

Return a frozen object using the matching definition label.

- [ ] **Step 4: Wire the selection into `main.ts`**

Replace direct parsing in mode button listeners with `createPreviewModeSelection`. In `setPreviewRenderMode`:

```ts
previewCompareRadioController.setValue(selection.compareView);
previewView.applyCompareView(selection.compareView);
previewRenderMode = selection.mode;
previewView.setRenderMode(selection.mode);
syncPreviewModeControls();
announce(selection.announcement);
```

Update the background-removal UI by setting `aria-label`, `[data-background-removal-label-short]` and `[data-background-removal-label-long]` instead of replacing `button.textContent`.

- [ ] **Step 5: Add source-contract assertions**

In `tests/app-markup.test.ts`, assert that mode selection sets the compare controller to `pattern` before drawing the selected mode and that background-removal synchronization updates both label hooks without assigning `action.textContent`.

- [ ] **Step 6: Run GREEN**

Run:

```bash
pnpm exec tsx --test tests/preview-mode.test.ts tests/app-markup.test.ts tests/background-removal.test.ts
```

Expected: PASS.

### Task 4: Responsive styling and stable contextual status

**Files:**

- Modify: `src/styles/page.css`
- Modify: `tests/app-markup.test.ts`

**Interfaces:**

- Consumes: markup hooks from Task 2.
- Produces: one-line 390 px toolbar, internally scrollable 320 px mode strip, responsive label variants and non-layout-shifting status.

- [ ] **Step 1: Write failing CSS contract assertions**

Require:

```ts
assert.match(pageCss, /\.preview-image-action\s*\{[^}]*min-height:\s*2\.75rem;/u);
assert.match(pageCss, /\[data-background-removal-status\]:empty\s*\{[^}]*display:\s*none;/u);
assert.match(
  pageCss,
  /@media \(max-width:\s*767px\)[\s\S]*\[data-action-label-long\][^{]*\{[^}]*display:\s*none;/u,
);
assert.match(
  pageCss,
  /@media \(min-width:\s*768px\)[\s\S]*\[data-action-label-short\][^{]*\{[^}]*display:\s*none;/u,
);
```

Also retain existing no-page-overflow and mode-strip overflow assertions.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm exec tsx --test tests/app-markup.test.ts
```

Expected: FAIL because the responsive compact-action rules are missing.

- [ ] **Step 3: Implement the responsive toolbar**

Desktop:

```css
.preview-compare-bar {
  display: flex;
  flex-wrap: nowrap;
}

.preview-image-actions {
  display: flex;
  min-width: 0;
  margin-left: auto;
  gap: var(--space-1);
}
```

Mobile:

```css
.preview-compare-bar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
}

.preview-image-actions {
  grid-column: 2;
  justify-content: end;
}
```

Keep `.preview-mode-strip` as the only horizontal scroller. Make the background-removal status span the full toolbar width only when non-empty. Preserve the existing mint tokens and focus styling.

- [ ] **Step 4: Polish the canvas status badge**

Keep the badge inside `.preview-pattern-view`; reduce its visual weight with the existing surface, border and shadow tokens. Do not change its visibility logic or introduce animation.

- [ ] **Step 5: Run focused validation**

Run:

```bash
pnpm exec tsx --test tests/app-markup.test.ts tests/preview-mode.test.ts tests/background-removal.test.ts
pnpm run typecheck
pnpm run lint
pnpm run build
git diff --check
```

Expected: all pass.

### Task 5: Browser fidelity and final verification

**Files:**

- Modify: `docs/superpowers/specs/2026-07-28-preview-toolbar-ux-polish-design.md`

**Interfaces:**

- Consumes: completed toolbar implementation.
- Produces: Browser/IAB evidence and final verified status.

- [ ] **Step 1: Run complete automated verification**

Run:

```bash
pnpm run test
pnpm run typecheck
pnpm run lint
pnpm run build
cd backend && .venv/bin/pytest -q
git diff --check
```

- [ ] **Step 2: Verify the real flow with Browser/IAB**

At 390 × 844 and 1440 × 900:

1. Upload `backend/tests/fixtures/owner-grid.jpg`.
2. Confirm compare and all available image actions are on one line.
3. Select “原图”, then select “色号图纸”; verify the view returns to “拼豆”.
4. Exercise crop adjustment and return.
5. Confirm background status is absent when empty.
6. Confirm no application console errors or framework overlay.

At 320 × 720:

1. Confirm page horizontal overflow is 0.
2. Confirm the mode strip is internally scrollable.
3. Confirm every image action has at least 44 px width and height.

- [ ] **Step 3: Measure the canvas-first improvement**

Compare the new 390 × 844 screenshot with `/tmp/bean-preview-mobile-final.png`. Record toolbar height, canvas top position, canvas visible height and at least five visual comparison points. The canvas or visible content must gain at least 40 px without hiding required controls.

- [ ] **Step 4: Complete the UI review gate**

Check architecture boundary, design thesis, token compliance, state completeness, responsive behavior, accessibility, console health and validation commands. Use `view_image` on the accepted reference and latest screenshot.

- [ ] **Step 5: Mark the design verified**

Only after every check passes, change the design status to `已实施并验证` and append the measured Browser/IAB evidence.
