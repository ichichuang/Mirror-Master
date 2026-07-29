# Grid Detection Loading Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an accessible loading layer while grid detection runs, lock every result-changing interaction, and keep all four preview zoom controls usable.

**Architecture:** Add one focused DOM state synchronizer for the chart detection busy state, driven by the existing `onDetectionChange` lifecycle. Keep request ownership inside `gridEditor`, where result-changing controller methods and SVG pointer/keyboard handlers gain defensive busy guards. Reuse the existing icon, token, live-region, and reduced-motion foundations.

**Tech Stack:** TypeScript 6, Vite 8, native DOM, happy-dom, Node test runner, existing CSS tokens and Phosphor icon font.

## Global Constraints

- Do not change grid detection algorithms, mirror algorithms, or request contracts.
- Do not add dependencies, global state, cancellation controls, progress percentages, or estimated time.
- Lock every interaction that can change recognition or mirror output.
- Keep `适合窗口`, `缩小`, `实际大小`, and `放大` enabled.
- Use real native `disabled` states, `aria-busy`, the existing polite live region, and reduced-motion behavior.
- Preserve unrelated dirty-worktree changes.
- Do not create a Git commit because the user has not authorized commits.

---

### Task 1: Loading surface and page-level interaction lock

**Files:**

- Create: `src/features/grid-editor/detectionBusyUi.ts`
- Modify: `src/app.ts:20-25,580-726`
- Modify: `src/main.ts:3780-3920`
- Modify: `src/styles/page.css:2712-3000,3480-3510`
- Create: `tests/chart-detection-busy-ui.test.ts`
- Modify: `tests/app-markup.test.ts:274-289`

**Interfaces:**

- Consumes: rendered app root containing `[data-chart-workspace]`, `[data-chart-detection-loading]`, and controls marked `[data-chart-detection-lock]`.
- Produces: `syncChartDetectionBusyUi(root: HTMLElement, detecting: boolean): void`.

- [x] **Step 1: Write the failing DOM behavior test**

```ts
test('detection busy state locks result mutations while preserving zoom', () => {
  document.body.innerHTML = renderApp();
  const app = document.querySelector<HTMLElement>('[data-app-shell]')!;
  const workspace = app.querySelector<HTMLElement>('[data-chart-workspace]')!;
  const loader = app.querySelector<HTMLElement>('[data-chart-detection-loading]')!;
  const locked = [
    ...app.querySelectorAll<HTMLButtonElement | HTMLInputElement>('[data-chart-detection-lock]'),
  ];
  const initiallyEnabled = locked.filter((control) => !control.disabled);
  const zoom = [...workspace.querySelectorAll<HTMLButtonElement>('.zoom-controls button')];

  syncChartDetectionBusyUi(app, true);

  assert.equal(workspace.getAttribute('aria-busy'), 'true');
  assert.equal(loader.hidden, false);
  assert.ok(locked.length >= 10);
  assert.ok(locked.every((control) => control.disabled));
  assert.equal(zoom.length, 4);
  assert.ok(zoom.every((control) => !control.disabled));

  syncChartDetectionBusyUi(app, false);
  assert.equal(workspace.getAttribute('aria-busy'), 'false');
  assert.equal(loader.hidden, true);
  assert.ok(initiallyEnabled.every((control) => !control.disabled));
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec tsx --test tests/chart-detection-busy-ui.test.ts`

Expected: FAIL because `detectionBusyUi.ts` and the loading/lock hooks do not exist.

- [x] **Step 3: Add the minimal busy-state synchronizer**

```ts
const LOCK_SELECTOR = '[data-chart-detection-lock]';

export function syncChartDetectionBusyUi(root: HTMLElement, detecting: boolean): void {
  const workspace = requiredElement(root, '[data-chart-workspace]');
  const loader = requiredElement(root, '[data-chart-detection-loading]');
  workspace.setAttribute('aria-busy', String(detecting));
  loader.hidden = !detecting;

  for (const control of root.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
    LOCK_SELECTOR,
  )) {
    if (detecting && !control.disabled) {
      control.dataset.disabledByDetection = 'true';
      control.disabled = true;
    } else if (!detecting && control.dataset.disabledByDetection === 'true') {
      control.disabled = false;
      delete control.dataset.disabledByDetection;
    }
  }
}

function requiredElement(root: HTMLElement, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Missing chart detection element: ${selector}`);
  }
  return element;
}
```

- [x] **Step 4: Add markup hooks and the visual loading layer**

Mark the header replacement action, hidden image/project file inputs, redetect/reset actions,
candidate actions, dimensions, axis actions, generate action, and stale-result download action
with `data-chart-detection-lock`. Add a loading layer sharing grid row 4 with the editor frame:

```html
<div class="chart-detection-loading" data-chart-detection-loading hidden aria-hidden="true">
  <div class="chart-detection-loading-card">
    <i class="ph ph-circle-notch spin" aria-hidden="true"></i>
    <strong>正在识别拼豆网格</strong>
    <span>请稍候，完成后即可继续调整。</span>
  </div>
</div>
```

Use token-backed CSS, `pointer-events: none`, and the existing `.spin` reduced-motion rule. Keep the zoom toolbar outside the loading layer.

- [x] **Step 5: Wire the synchronizer before existing business-state recomputation**

```ts
function syncChartConfirmationUi(): void {
  syncChartDetectionBusyUi(app, chartDetectionRunning);
  // Existing contract, candidate, dimension, and generation rules follow.
}
```

This ordering allows the synchronizer to release only controls it locked, then lets existing rules re-disable controls that still lack a valid contract or are mirroring.

- [x] **Step 6: Run focused UI tests and verify GREEN**

Run: `pnpm exec tsx --test tests/chart-detection-busy-ui.test.ts tests/app-markup.test.ts`

Expected: PASS.

---

### Task 2: Defensive locking inside the grid editor

**Files:**

- Modify: `src/features/grid-editor/gridEditor.ts:175-335,390-540,630-705`
- Create: `tests/grid-editor-detection-lock.test.ts`

**Interfaces:**

- Consumes: existing `mountGridEditor(root, lifecycle)` and internal `detecting` state.
- Produces: the same public controller API, with `redetect`, `resetSelection`, and result-changing methods becoming safe no-ops while detection is active.

- [x] **Step 1: Write the failing controller integration test**

Mount the real editor in happy-dom, replace only `fetch` with one unresolved request, and call the real controller:

```ts
test('an active detection rejects result-changing controller actions', () => {
  document.body.innerHTML = renderApp();
  const root = document.querySelector<HTMLElement>('[data-chart-workspace]')!;
  const requests: RequestInit[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(init ?? {});
    return new Promise<Response>(() => undefined);
  }) as typeof fetch;
  const controller = mountGridEditor(root);
  try {
    controller.setImage({
      file: new File(['chart'], 'chart.png', { type: 'image/png' }),
      fileName: 'chart.png',
      objectUrl: 'blob:chart',
      naturalImage: { width: 1440, height: 1819 },
    });

    assert.equal(requests.length, 1);
    controller.redetect();
    controller.resetSelection();
    assert.equal(controller.adjustDimensions(23, 22), false);
    assert.equal(controller.cycleCandidate(1), false);
    assert.equal(requests.length, 1);

    const overlay = root.querySelector<SVGSVGElement>('[data-editor-overlay]')!;
    assert.equal(overlay.getAttribute('aria-disabled'), 'true');
    assert.equal(overlay.querySelectorAll('[data-grid-handle][tabindex="0"]').length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

Install `window`, `document`, `HTMLElement`, `HTMLImageElement`, `SVGSVGElement`, and
`Element` from one happy-dom `Window` in the test setup. The test double replaces only
the external request; DOM rendering, controller state, and event guards remain real.

- [x] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec tsx --test tests/grid-editor-detection-lock.test.ts`

Expected: FAIL because repeated controller actions currently cancel/start detection and SVG handles remain interactive.

- [x] **Step 3: Add busy guards to every result-changing entry**

```ts
function redetect(): void {
  if (detecting) return;
  if (currentImage) void runDetection('auto');
}

function resetSelection(): void {
  if (detecting) return;
}

function adjustDimensions(columns: number, rows: number): boolean {
  if (detecting) return false;
}
```

Insert the shown guard as the first statement of the existing `resetSelection` and
`adjustDimensions` functions without changing their remaining branches. Apply equivalent
first-statement guards to `cycleCandidate`, `handlePointerDown`, and
`handleOverlayKeyDown`.

Before setting `detecting = true`, terminate any already captured pointer interaction so a
gesture begun before recognition cannot cancel or replace the new request.

- [x] **Step 4: Remove editing focus and pointer access from the SVG while busy**

During `renderOverlay()`:

```ts
elements.overlay.toggleAttribute('data-detection-locked', detecting);
elements.overlay.setAttribute('aria-disabled', String(detecting));
for (const handle of elements.overlay.querySelectorAll<SVGElement>('[data-grid-handle]')) {
  handle.setAttribute('tabindex', detecting ? '-1' : '0');
  handle.setAttribute('aria-disabled', String(detecting));
}
```

Add `[data-editor-overlay][data-detection-locked] { pointer-events: none; }`.

- [x] **Step 5: Use one customer-facing loading announcement**

Set the existing editor hint/live region to `正在识别拼豆网格，请稍候…` when a detection begins. Preserve existing success and failure messages.

- [x] **Step 6: Run focused editor tests and verify GREEN**

Run: `pnpm exec tsx --test tests/grid-editor-detection-lock.test.ts tests/grid-detection-coordinator.test.ts`

Expected: PASS.

---

### Task 3: Full regression and rendered interaction verification

**Files:**

- Verify only; no additional production file is expected.

**Interfaces:**

- Consumes: completed Tasks 1 and 2.
- Produces: verified desktop and mobile loading behavior for the real `pdA11.jpg` flow.

- [x] **Step 1: Run all automated frontend checks**

Run:

```bash
pnpm test
pnpm run typecheck
pnpm run lint
pnpm run build
```

Expected: 0 failures.

- [x] **Step 2: Verify the real desktop interaction**

Flow: start page → 镜像已有图纸 → upload `/Users/cc/Downloads/pdA11.jpg` → detection loading → detected 23 × 22.

Assert while pending:

- loading layer is visible;
- chart workspace has `aria-busy="true"`;
- replacement, redetect/reset, candidates, dimensions, overlay editing, axis, and generate are locked;
- a gesture captured before recognition cannot cancel or replace the active request;
- a late capability update cannot re-enable either mirror axis;
- four zoom controls are enabled and one zoom interaction changes the visible zoom label.

Assert after completion:

- loading layer is hidden;
- `aria-busy="false"`;
- 23 × 22 is shown;
- controls recover according to the valid/review state;
- no relevant console warning or error exists.

- [x] **Step 3: Verify one mobile viewport**

Use a 390 × 844 viewport. Confirm the loading card does not clip or cover the zoom toolbar, the preview remains scrollable, and result-changing controls remain locked.

- [x] **Step 4: Inspect the final scoped diff**

Run:

```bash
git diff --check -- \
  src/app.ts \
  src/main.ts \
  src/features/grid-editor/detectionBusyUi.ts \
  src/features/grid-editor/gridEditor.ts \
  src/styles/page.css \
  tests/app-markup.test.ts \
  tests/chart-detection-busy-ui.test.ts \
  tests/grid-editor-detection-lock.test.ts \
  docs/superpowers/specs/2026-07-29-grid-detection-loading-lock-design.md \
  docs/superpowers/plans/2026-07-29-grid-detection-loading-lock.md
```

Expected: no whitespace errors in scoped files. Do not alter unrelated dirty files.
