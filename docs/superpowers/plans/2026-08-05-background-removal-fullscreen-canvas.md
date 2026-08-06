# Background Removal Fullscreen Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the preview-bound mask editor with a fullscreen, responsive image workspace that supports accurate zooming, panning, painting, undo, and stale-refinement rejection.

**Architecture:** Keep source and mask canvases at original image resolution, and add pure `maskViewport`, `maskEditGesture`, and `maskRevision` modules around the existing mask runtime. The visible canvas becomes a fullscreen renderer whose transform affects display only; `main.ts` translates screen input through the viewport before mutating the original-resolution mask.

**Tech Stack:** TypeScript 6, Vite 8, native Canvas 2D and Pointer Events, Vaadin controls, Phosphor icons, Node test runner through `tsx --test`, CSS design tokens.

## Global Constraints

- Do not add magic wand, lasso, feathering, layers, routes, backend endpoints, fonts, colors, or icon libraries.
- Keep `/api/image/remove-background/mask`, `/refine`, and `/apply` contracts unchanged.
- Keep `maskCanvas` and `overlayCanvas` at source-image pixel dimensions; zoom and pan never mutate them.
- All controls must use existing tokens and Phosphor icons; interactive targets remain at least 44 × 44 CSS px.
- Desktop inputs: left-button paint, Space + left-button pan, middle-button pan, wheel zoom around pointer.
- Touch inputs: one-pointer paint, two-pointer pinch and pan.
- `prefers-reduced-motion: reduce` disables the 160 ms editor entrance transition.
- Every behavior change follows red-green-refactor and ends with focused tests before the next task.

---

## File Structure

- Create `src/features/mask-editor/maskViewport.ts`: pure viewport geometry and coordinate transforms.
- Create `src/features/mask-editor/maskEditGesture.ts`: pure pointer/keyboard gesture-state reducer.
- Create `src/features/mask-editor/maskRevision.ts`: monotonic mask revision and stale-result guard.
- Modify `src/features/mask-editor/maskEditGeometry.ts`: make image-hit conversion nullable and viewport-aware callers explicit.
- Modify `src/features/preview-workspace/previewWorkspace.ts`: fullscreen editor toolbar, tool rail, canvas, and zoom controls.
- Modify `src/styles/page.css`: fullscreen editor composition and responsive variants.
- Modify `src/features/preview-workspace/previewView.ts`: reveal/hide the independent editor layer without sizing it through the preview stack.
- Modify `src/main.ts`: integrate viewport rendering, gestures, zoom controls, focus restoration, and revisioned refinement.
- Modify `tests/mask-editor.test.ts`: geometry, viewport, gesture, and revision unit coverage.
- Modify `tests/app-markup.test.ts`: DOM, responsive CSS, accessibility, and integration-contract coverage.

---

### Task 1: Pure Image Viewport

**Files:**

- Create: `src/features/mask-editor/maskViewport.ts`
- Modify: `src/features/mask-editor/maskEditGeometry.ts`
- Test: `tests/mask-editor.test.ts`

**Interfaces:**

- Consumes: positive canvas and image dimensions, CSS-pixel pointer coordinates.
- Produces:

```ts
export interface MaskViewport {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export function createFittedMaskViewport(input: MaskViewportDimensions): MaskViewport;
export function zoomMaskViewportAt(
  viewport: MaskViewport,
  nextScale: number,
  anchorX: number,
  anchorY: number,
): MaskViewport;
export function panMaskViewport(
  viewport: MaskViewport,
  deltaX: number,
  deltaY: number,
): MaskViewport;
export function resizeMaskViewport(
  viewport: MaskViewport,
  canvasWidth: number,
  canvasHeight: number,
): MaskViewport;
export function actualSizeMaskViewport(viewport: MaskViewport): MaskViewport;
export function maskViewportImageRect(viewport: MaskViewport): MaskEditRect;
export function maskViewportPointToImage(
  viewport: MaskViewport,
  x: number,
  y: number,
): MaskStrokePoint | null;
export function maskViewportScaleLimits(viewport: MaskViewport): {
  readonly min: number;
  readonly max: number;
};
```

- [ ] **Step 1: Write failing viewport tests**

Add tests for portrait fit, landscape fit, square fit, pointer-anchored zoom, constrained pan, 100%, resize-center preservation, and outside-image rejection. The central assertions are:

```ts
const portrait = createFittedMaskViewport({
  canvasWidth: 1200,
  canvasHeight: 700,
  imageWidth: 720,
  imageHeight: 1280,
});
assert.equal(portrait.scale, 700 / 1280);
assert.deepEqual(maskViewportPointToImage(portrait, 600, 350), { x: 360, y: 640 });
assert.equal(maskViewportPointToImage(portrait, 0, 0), null);

const before = maskViewportPointToImage(portrait, 600, 350);
const zoomed = zoomMaskViewportAt(portrait, portrait.scale * 2, 600, 350);
assert.deepEqual(maskViewportPointToImage(zoomed, 600, 350), before);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm exec tsx --test tests/mask-editor.test.ts`

Expected: FAIL because `maskViewport.ts` and its exports do not exist.

- [ ] **Step 3: Implement viewport geometry**

Implement immutable return values and these exact contracts:

```ts
const fitScale = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight);
const maxScale = Math.max(fitScale, Math.min(16, Math.max(8, 1 / fitScale)));
```

Clamp scale to `[fitScale, maxScale]`. Center images smaller than the canvas. When larger, keep at least one CSS pixel of the image on each reachable axis. Preserve the source-image coordinate under a zoom anchor. On resize, preserve the source coordinate that was under the old canvas center.

Change `clientPointToImagePoint` in `maskEditGeometry.ts` to return `MaskStrokePoint | null` when the point is outside the provided image frame instead of clamping outside coordinates to an image edge.

- [ ] **Step 4: Run viewport tests and verify GREEN**

Run: `pnpm exec tsx --test tests/mask-editor.test.ts`

Expected: PASS for all mask editor tests.

- [ ] **Step 5: Commit viewport behavior**

```bash
git add src/features/mask-editor/maskViewport.ts src/features/mask-editor/maskEditGeometry.ts tests/mask-editor.test.ts
git commit -m "feat(mask): add zoomable image viewport"
```

### Task 2: Gesture State Machine

**Files:**

- Create: `src/features/mask-editor/maskEditGesture.ts`
- Test: `tests/mask-editor.test.ts`

**Interfaces:**

- Consumes: normalized pointer down/move/up events and Space-key state.
- Produces:

```ts
export type MaskGestureMode = 'idle' | 'paint' | 'pan' | 'pinch';
export interface MaskGesturePointer {
  readonly id: number;
  readonly pointerType: 'mouse' | 'touch' | 'pen';
  readonly x: number;
  readonly y: number;
  readonly button: number;
  readonly insideImage: boolean;
}
export interface MaskGestureState {
  readonly mode: MaskGestureMode;
  readonly pointers: ReadonlyMap<number, MaskGesturePointer>;
  readonly primaryPointerId: number | null;
  readonly spacePressed: boolean;
}
export type MaskGestureEvent =
  | { readonly type: 'space'; readonly pressed: boolean }
  | { readonly type: 'pointerDown' | 'pointerMove'; readonly pointer: MaskGesturePointer }
  | { readonly type: 'pointerUp' | 'pointerCancel'; readonly pointerId: number };
export type MaskGestureIntent =
  | { readonly type: 'none' | 'paintEnd' | 'paintCancel' }
  | { readonly type: 'paintStart' | 'paintMove'; readonly x: number; readonly y: number }
  | { readonly type: 'pan'; readonly deltaX: number; readonly deltaY: number }
  | {
      readonly type: 'pinch';
      readonly centerX: number;
      readonly centerY: number;
      readonly scale: number;
      readonly deltaX: number;
      readonly deltaY: number;
    };
export interface MaskGestureTransition {
  readonly state: MaskGestureState;
  readonly intent: MaskGestureIntent;
}
export function createMaskGestureState(): MaskGestureState;
export function reduceMaskGesture(
  state: MaskGestureState,
  event: MaskGestureEvent,
): MaskGestureTransition;
```

`MaskGestureTransition` returns the next state plus one of `paintStart`, `paintMove`, `paintEnd`, `paintCancel`, `pan`, or `pinch` intents. A second touch during paint must emit `paintCancel` before entering `pinch`.

- [ ] **Step 1: Write failing gesture tests**

Cover left-button paint, image-outside no-op, Space + left pan, middle-button pan, second-touch paint cancellation, pinch centroid/scale changes, and pointer cancellation returning to idle.

```ts
let state = createMaskGestureState();
let transition = reduceMaskGesture(state, {
  type: 'pointerDown',
  pointer: { id: 1, pointerType: 'touch', x: 10, y: 10, button: 0, insideImage: true },
});
assert.equal(transition.intent.type, 'paintStart');
state = transition.state;
transition = reduceMaskGesture(state, {
  type: 'pointerDown',
  pointer: { id: 2, pointerType: 'touch', x: 30, y: 30, button: 0, insideImage: true },
});
assert.equal(transition.intent.type, 'paintCancel');
assert.equal(transition.state.mode, 'pinch');
```

- [ ] **Step 2: Run gesture tests and verify RED**

Run: `pnpm exec tsx --test tests/mask-editor.test.ts`

Expected: FAIL because the gesture module does not exist.

- [ ] **Step 3: Implement the minimal reducer**

Keep the reducer DOM-free. Copy pointer maps on transition. Compute pinch scale as `currentDistance / previousDistance` and pan delta as the change in the two-pointer centroid. Never emit a paint intent while mode is `pan` or `pinch`.

- [ ] **Step 4: Run gesture tests and verify GREEN**

Run: `pnpm exec tsx --test tests/mask-editor.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit gesture behavior**

```bash
git add src/features/mask-editor/maskEditGesture.ts tests/mask-editor.test.ts
git commit -m "feat(mask): add paint pan and pinch gestures"
```

### Task 3: Revisioned Refinement and Undo Safety

**Files:**

- Create: `src/features/mask-editor/maskRevision.ts`
- Modify: `src/main.ts`
- Test: `tests/mask-editor.test.ts`

**Interfaces:**

- Consumes: local mask mutations and async refinement request tokens.
- Produces:

```ts
export interface MaskRevisionGuard {
  readonly current: () => number;
  readonly advance: () => number;
  readonly capture: () => number;
  readonly accepts: (revision: number) => boolean;
}
export function createMaskRevisionGuard(): MaskRevisionGuard;
```

- [ ] **Step 1: Write failing revision tests**

```ts
const guard = createMaskRevisionGuard();
const requestRevision = guard.capture();
guard.advance();
assert.equal(guard.accepts(requestRevision), false);
assert.equal(guard.accepts(guard.capture()), true);
```

Add this undo-order assertion so an older refinement cannot be accepted after the restored snapshot becomes current:

```ts
const beforeUndo = guard.capture();
guard.advance(); // local paint
guard.advance(); // undo restores a snapshot and invalidates requests
assert.equal(guard.accepts(beforeUndo), false);
```

- [ ] **Step 2: Run revision tests and verify RED**

Run: `pnpm exec tsx --test tests/mask-editor.test.ts`

Expected: FAIL because `maskRevision.ts` does not exist.

- [ ] **Step 3: Implement guard and integrate request checks**

Add `revisionGuard` to `MaskEditRuntime`. Advance it after local paint and undo. Capture a revision when `scheduleMaskRefine()` takes pending strokes. In `settleMaskRefine()`, apply the returned bitmap only when the runtime is current and `revisionGuard.accepts(requestRevision)` is true; otherwise discard the result without changing the mask or status.

Abort an active refinement before undo, restore the snapshot, requeue only strokes still represented by that snapshot, and invalidate the aborted request through `advance()`.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm exec tsx --test tests/mask-editor.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit refinement safety**

```bash
git add src/features/mask-editor/maskRevision.ts src/main.ts tests/mask-editor.test.ts
git commit -m "fix(mask): reject stale refinement results"
```

### Task 4: Fullscreen Editor Markup and Responsive Composition

**Files:**

- Modify: `src/features/preview-workspace/previewWorkspace.ts`
- Modify: `src/features/preview-workspace/previewView.ts`
- Modify: `src/styles/page.css`
- Test: `tests/app-markup.test.ts`

**Interfaces:**

- Consumes: existing mask edit state and controls.
- Produces stable hooks:

```text
data-mask-editor-title
data-mask-tool="remove|keep"
data-mask-edit-undo
data-mask-edit-cancel
data-mask-edit-apply
data-mask-zoom-out
data-mask-zoom-value
data-mask-zoom-in
data-mask-zoom-fit
data-mask-zoom-actual
```

- [ ] **Step 1: Write failing DOM and CSS contract tests**

Assert that the editor contains a labelled header, plain tool rail, canvas, zoom controls, and fixed completion action. Assert that `.preview-mask-edit-view` uses `position: absolute; inset: 0;` relative to `.preview-layout`, does not rely on preview canvas aspect ratio, and has responsive desktop/mobile control layouts. Assert 44 px minimum targets and reduced-motion behavior.

- [ ] **Step 2: Run markup tests and verify RED**

Run: `pnpm exec tsx --test tests/app-markup.test.ts`

Expected: FAIL because the new hooks and fullscreen CSS do not exist.

- [ ] **Step 3: Replace mask editor markup**

Use existing Phosphor classes: `ph-arrow-left`, `ph-eraser`, `ph-paint-brush`, `ph-arrow-u-up-left`, `ph-minus`, `ph-plus`, `ph-arrows-out`, and `ph-number-square-one`. Keep real `<button>` elements and the existing native brush range. Replace the Vaadin radio group with two pressed tool buttons so the same tool rail can reflow on mobile.

- [ ] **Step 4: Implement responsive CSS**

Make the editor a fullscreen grid with `grid-template-rows: auto minmax(0, 1fr)`. Use a dark token-derived canvas surface, one-pixel separators, no card grid, and one orange accent. On desktop position tools left and zoom bottom-center. Below 768 px, move tools and zoom into a safe-area-aware bottom dock.

- [ ] **Step 5: Update preview view ownership**

Keep mask editor visibility controlled by `setMaskEditActive()`, but do not let `drawPreview()` write `inline-size` or `block-size` to the mask editor. On entry, move focus to the active mask tool; on exit, restore focus to `[data-background-removal-action]` or `[data-mask-reedit]` depending on entry source.

- [ ] **Step 6: Run markup tests and verify GREEN**

Run: `pnpm exec tsx --test tests/app-markup.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 7: Commit fullscreen composition**

```bash
git add src/features/preview-workspace/previewWorkspace.ts src/features/preview-workspace/previewView.ts src/styles/page.css tests/app-markup.test.ts
git commit -m "feat(mask): add fullscreen removal workspace"
```

### Task 5: Runtime Viewport and Input Integration

**Files:**

- Modify: `src/main.ts`
- Modify: `tests/app-markup.test.ts`
- Test: `tests/mask-editor.test.ts`

**Interfaces:**

- Consumes: Task 1 `MaskViewport`, Task 2 gesture transitions, Task 3 revision guard, Task 4 DOM hooks.
- Produces: functional zoom, pan, paint, undo, cancel, and apply interactions.

- [ ] **Step 1: Write failing integration-contract tests**

Assert that `main.ts` registers wheel with `{ passive: false }`, keyboard Space handlers, zoom-control click handlers, and viewport-aware resize. Assert that rendering uses `maskViewportImageRect()` and that pointer conversion can return `null` before starting a stroke.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm exec tsx --test tests/app-markup.test.ts tests/mask-editor.test.ts`

Expected: FAIL because runtime integration is absent.

- [ ] **Step 3: Add viewport state to runtime and renderer**

Replace `drawRect` with `viewport: MaskViewport`. On first non-zero canvas measurement create a fitted viewport; on later size changes call `resizeMaskViewport()`. Render source and overlay using `maskViewportImageRect()` and draw the cursor radius as `currentBrushRadiusPx(edit) * viewport.scale`.

- [ ] **Step 4: Wire zoom controls and wheel input**

Use 1.25× button steps. Wheel zoom uses `Math.exp(-deltaY * 0.0015)` and anchors at the event position. Fit recreates a fitted viewport. Actual size calls `actualSizeMaskViewport()`. Keep `[data-mask-zoom-value]` synchronized as a rounded percentage and update disabled states at bounds.

- [ ] **Step 5: Wire pointer and keyboard gestures**

Route pointer events through `reduceMaskGesture()`. Paint intents mutate the real mask. Pan and pinch intents update viewport only. Prevent default scrolling during Space-pan, wheel zoom, and active touch gestures. Release captures on end/cancel and clear Space state on blur or visibility change.

- [ ] **Step 6: Synchronize tool, busy, and focus states**

Make remove/keep buttons update `MaskEditSession.brushMode()` and `aria-pressed`. Disable painting, tool changes, undo, and repeated apply during final composition. Keep pan/zoom rendering visible. Restore the invoking button focus after cancel or successful apply.

- [ ] **Step 7: Run focused and full frontend tests**

Run: `pnpm exec tsx --test tests/mask-editor.test.ts tests/app-markup.test.ts && pnpm test && pnpm typecheck`

Expected: PASS.

- [ ] **Step 8: Commit runtime integration**

```bash
git add src/main.ts tests/app-markup.test.ts tests/mask-editor.test.ts
git commit -m "feat(mask): integrate fullscreen zoom pan and paint"
```

### Task 6: Verification and Manual-Test Handoff

**Files:**

- Modify only files required by failures found during verification.

**Interfaces:**

- Consumes: completed editor implementation.
- Produces: verified local build and a concise manual-test checklist.

- [ ] **Step 1: Run repository checks**

Run: `pnpm run check`

Expected: all generation checks, tests, typecheck, lint, formatting, and build pass.

- [ ] **Step 2: Run backend background-removal tests**

Run: `backend/.venv/bin/python -m pytest backend/tests/test_background_removal.py backend/tests/test_background_mask.py -q`

Expected: PASS.

- [ ] **Step 3: Start local frontend and backend**

Run backend on `127.0.0.1:8000` and Vite on an available localhost port. Confirm `/api/capabilities` reports interactive background removal available.

- [ ] **Step 4: Perform visual and interaction verification**

With a real 720 × 1280 portrait source, verify fullscreen entry, fit, 100%, button zoom, wheel zoom, pan, paint, restore, outside-image no-op, undo, cancel, apply, and focus return at 1440 × 900, 768 × 1024, 390 × 844, and 844 × 390.

- [ ] **Step 5: Inspect accessibility and console signals**

Confirm unique accessible names, visible focus, 44 px targets, polite status announcements, reduced-motion behavior, zero application console errors, and no clipped controls.

- [ ] **Step 6: Commit verification fixes, if any**

```bash
git add src/main.ts src/styles/page.css src/features/preview-workspace/previewWorkspace.ts src/features/preview-workspace/previewView.ts src/features/mask-editor/maskViewport.ts src/features/mask-editor/maskEditGesture.ts src/features/mask-editor/maskRevision.ts src/features/mask-editor/maskEditGeometry.ts tests/mask-editor.test.ts tests/app-markup.test.ts
git commit -m "fix(mask): resolve fullscreen verification findings"
```

- [ ] **Step 7: Hand off manual test scenarios**

Report the local preview URL, implemented behaviors, automated commands and results, remaining visual limitations, and the exact portrait/mobile scenarios the user should test manually.
