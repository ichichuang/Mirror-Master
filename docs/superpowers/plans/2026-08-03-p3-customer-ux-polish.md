# P3 Customer UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the documented entry flow and download language, add a respectful one-time mobile preview-settings introduction, and prevent audit artifacts from entering ESLint.

**Architecture:** Keep copy and configuration changes at their current owners. Add one DOM-free in-memory session object beside the preview workspace feature, then wire it to the existing preview success callback and three-state sheet interactions in `src/main.ts`; the existing sheet state machine remains the sole owner of layout, gesture, focus, and reduced-motion behavior.

**Tech Stack:** TypeScript 6, Vite 8, Node test runner through `tsx --test`, ESLint 10, Happy DOM markup tests.

## Global Constraints

- Do not change generation algorithms, export formats, project contracts, deployment boundaries, existing-chart mirroring, or GrabCut behavior.
- Do not add a sheet, modal, timer, animation dependency, browser storage, or persistent customer data.
- Keep the task name “保存项目”; only the file-producing action and helper description use “下载”.
- Auto-expand only on the first successful mobile preview result when settings have not already been discovered.
- Preserve keyboard focus; existing toggle, drag, and Escape collapse behavior remains authoritative.
- Keep all changes uncommitted for owner signoff.

---

### Task 1: Entry documentation, download copy, and ESLint boundary

**Files:**

- Modify: `README.md:11`
- Modify: `eslint.config.js:9`
- Modify: `.prettierignore:1-3`
- Modify: `src/features/export-completion/exportState.ts:50-58`
- Modify: `src/main.ts:4506-4512`
- Modify: `tests/export-completion.test.ts:1-40`

**Interfaces:**

- Consumes: `ExportTaskDefinition.label` and the existing `data-export-run` button.
- Produces: `exportDownloadActionLabel(task: ExportTaskId): string`, returning a concrete “下载…” action for all four tasks.

- [x] **Step 1: Add a failing behavior test**

Add one table-driven test that calls `exportDownloadActionLabel()` and expects the literal mapping `分享图片 → 下载分享图片`, `打印制作 → 下载打印制作`, `材料清单 → 下载材料清单`, and `保存项目 → 下载项目文件`.

- [x] **Step 2: Run the focused test and observe failure**

Run: `pnpm exec tsx --test tests/export-completion.test.ts`

Expected: failure because `exportDownloadActionLabel` does not exist.

- [x] **Step 3: Apply the minimal copy and ignore changes**

Change README step 1 to describe direct image selection plus the two secondary entry paths. Add `artifacts` to the top-level ESLint and Prettier ignore lists. Change the save-project description to `下载可继续编辑的项目文件。`. Implement `exportDownloadActionLabel()` at the export-state owner and use it for `runButton.textContent`.

- [x] **Step 4: Run the focused test**

Run: `pnpm exec tsx --test tests/export-completion.test.ts`

Expected: all export-completion tests pass.

### Task 2: One-page-session mobile settings introduction

**Files:**

- Create: `src/features/preview-workspace/previewSettingsIntroduction.ts`
- Create: `tests/preview-settings-introduction.test.ts`

**Interfaces:**

- Consumes: `SheetState` from `src/features/mobile-sheet/sheetMath.ts`.
- Produces: `createPreviewSettingsIntroductionSession(): PreviewSettingsIntroductionSession` with `recordUserInteraction(): void` and `onPreviewSucceeded(input: { readonly mobile: boolean; readonly sheetState: SheetState; readonly completionStatus: string }): { readonly expandToHalf: boolean; readonly announcement: string }`.

- [x] **Step 1: Write the failing session tests**

Cover these exact cases: first mobile success at `peek` returns `expandToHalf: true` and combines the completion status with the guidance; a second success returns `false` with the unmodified completion status; desktop success returns `false` without consuming the later mobile opportunity; prior `recordUserInteraction()` prevents expansion; a non-peek mobile success returns `false` and consumes the opportunity; a fresh session can introduce again.

- [x] **Step 2: Run the focused test and observe failure**

Run: `pnpm exec tsx --test tests/preview-settings-introduction.test.ts`

Expected: failure because the feature module does not exist.

- [x] **Step 3: Implement the in-memory session**

Use one closure-local `completed` boolean. `recordUserInteraction()` sets it to `true`. `onPreviewSucceeded()` returns the unchanged completion status without changing state for desktop; for mobile, it returns no expansion if completed, otherwise marks completed, expands only when `sheetState === 'peek'`, and appends `设置已展开，可调整图案大小、颜色、效果和品牌。` only when expanding. Freeze the returned session and result objects.

- [x] **Step 4: Run the focused test**

Run: `pnpm exec tsx --test tests/preview-settings-introduction.test.ts`

Expected: all session tests pass.

### Task 3: Wire success and explicit user intent into the existing preview sheet

**Files:**

- Modify: `src/main.ts:89-99, 350-410, 2228-2360, 3015-3048`
- Test: `tests/preview-settings-introduction.test.ts`

**Interfaces:**

- Consumes: `createPreviewSettingsIntroductionSession()` from Task 2 and existing `setPreviewSheetState('half')`.
- Produces: a single auto-expand per page session by applying the already-tested decision from Task 2.

- [x] **Step 1: Re-run the decision tests before integration**

Run the Task 2 tests once more before wiring so the integration consumes a known-green behavior contract.

- [x] **Step 2: Confirm the decision contract stays green**

Run: `pnpm exec tsx --test tests/preview-settings-introduction.test.ts`

Expected: all decision tests pass.

- [x] **Step 3: Wire user interactions and preview success**

Create one module-level session. Record user intent before keyboard toggle state changes and after a valid pointer-down begins on the drag region. On a successful preview while `stage === 'preview'`, synchronize the result, call `onPreviewSucceeded()` with `mobile: workspaceLayoutMode !== 'desktop'`, and, if requested, call `setPreviewSheetState('half')`. Keep focus unchanged and announce the returned message. Results outside the preview stage retain the original completion announcement.

- [x] **Step 4: Run focused behavior and markup tests**

Run: `pnpm exec tsx --test tests/preview-settings-introduction.test.ts tests/app-markup.test.ts tests/export-completion.test.ts`

Expected: all tests pass.

### Task 4: Full production verification and diff review

**Files:**

- Review: all files changed by this plan plus pre-existing user changes.

**Interfaces:**

- Consumes: completed Tasks 1–3.
- Produces: fresh verification evidence and a clean, scoped diff without committing.

- [x] **Step 1: Run TypeScript and lint checks**

Run: `pnpm typecheck && pnpm lint`

Expected: both commands exit 0 with zero errors.

- [x] **Step 2: Run the full repository check**

Run: `pnpm check`

Expected: palette, icon, token, brand, test, typecheck, lint, format, and production build stages all exit 0.

- [x] **Step 3: Review formatting and scope**

Run: `git diff --check && git status --short && git diff -- README.md eslint.config.js .prettierignore src/features/export-completion/exportState.ts src/features/preview-workspace/previewSettingsIntroduction.ts src/main.ts tests/app-markup.test.ts tests/preview-settings-introduction.test.ts docs/superpowers/specs/2026-08-03-p3-customer-ux-polish-design.md docs/superpowers/plans/2026-08-03-p3-customer-ux-polish.md`

Expected: no whitespace errors; the diff contains only the approved P3 work alongside the already-existing uncommitted P2/audit cleanup.

- [x] **Step 4: Perform responsive browser verification when the local app is available**

At 390 × 844, confirm first success produces `data-preview-sheet-state="half"`, the same result does not re-open after manual collapse, Escape and drag still collapse, and the page has no horizontal overflow. At 1440 × 900, confirm the inspector remains visible and no automatic sheet transition occurs. Record any environment limitation instead of claiming visual verification without evidence.

## Execution Record

- TDD red/green evidence: export action test failed on the missing label function and then passed 7/7; preview introduction tests failed on the missing module and then passed 6/6.
- Focused integration suite passed 46/46.
- `pnpm check` passed with 330/330 tests, typecheck, ESLint, Prettier, and the production build. The build retained its existing advisory that one minified chunk exceeds 500 kB.
- The repository token generator corrected one pre-existing generated value in `src/design/generated/tokens.css`; the subsequent token drift check passed.
- Browser checks passed at 390 × 844 (`compact`, no horizontal overflow, no console errors) and 1440 × 900 (`desktop`, inspector attached, sheet detached, no horizontal overflow). Live upload-to-first-success verification was blocked because the Chrome extension did not have local-file URL access; the first-success, repeat, desktop, pre-interaction, already-open, and fresh-session branches remain covered by the six automated behavior tests.
- No branch or commit was created; all work remains in the owner’s existing uncommitted change set.
