# Home Start Layout and Token Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the two approved brand foreground colors in the Token source of truth, keep the homepage primary flow stationary when “更多制作方式” expands, and verify that the `quick-panel.js` warning is external to the application.

**Architecture:** Add separate brand and semantic foreground tokens so generic primary surfaces and primary buttons can keep distinct approved colors without editing generated files. Keep the native `<details>` interaction, but change the desktop start workspace from content-height centering to a responsive fixed start offset and restyle the expanded action as one integrated surface. Treat the console warning as an environment diagnostic because its named script is absent from source, dependencies, and build output.

**Tech Stack:** TypeScript 6, generated JSON design tokens, CSS, native `<details>`, Node test runner, Happy DOM, Vite 8, pnpm 10.

## Global Constraints

- Preserve `#f0ffcf` for `color.text.onPrimary` exactly.
- Preserve `#cef1f5` for `button.primary.foreground` exactly.
- Keep “选择图片” as the only dominant homepage action.
- Do not replace “更多制作方式” with a popover, dialog, or sheet.
- Keep `start-workspace` as the homepage's only vertical scroll owner.
- Do not change upload, project import, chart mirroring, routing, storage, or backend contracts.
- Do not add `Permissions-Policy: unload=*` or otherwise re-enable deprecated `unload` behavior.
- Preserve all pre-existing uncommitted worktree changes and do not stage or commit implementation files in this dirty worktree.
- Record the accepted contrast risk without changing the approved colors.

---

## File Structure

- `src/design/tokens/core.tokens.json`: owns the two raw approved brand foreground colors.
- `src/design/tokens/themes/mint-studio.tokens.json`: maps the active theme to generic-on-primary and button-primary foreground roles.
- `src/design/tokens/semantic.tokens.json`: exposes the primary-action foreground semantic token.
- `src/design/tokens/component.tokens.json`: maps the primary button component to its distinct semantic foreground.
- `src/design/generated/tokens.css`: generated CSS variables; never edit manually.
- `src/design/generated/tokens.ts`: generated runtime token map; never edit manually.
- `src/styles/page.css`: owns the homepage start offset, disclosure surface, responsive layout, focus, and reduced-motion styling.
- `tests/app-markup.test.ts`: existing regression coverage protects the native disclosure structure and homepage action hierarchy.
- `docs/superpowers/specs/2026-08-03-home-start-layout-and-token-integrity-design.md`: records the external-script diagnosis and accepted risks.

---

### Task 1: Move the approved colors into Token ownership

**Files:**

- Modify: `src/design/tokens/core.tokens.json`
- Modify: `src/design/tokens/themes/mint-studio.tokens.json`
- Modify: `src/design/tokens/semantic.tokens.json`
- Modify: `src/design/tokens/component.tokens.json`
- Modify (generated): `src/design/generated/tokens.css`
- Modify (generated): `src/design/generated/tokens.ts`

**Interfaces:**

- Consumes: `scripts/generate-design-tokens.mjs` token reference resolution.
- Produces: `DESIGN_TOKENS['color.text.onPrimary'] === '#f0ffcf'` and `DESIGN_TOKENS['button.primary.foreground'] === '#cef1f5'`.

- [ ] **Step 1: Run the Token drift gate and confirm it fails**

Run: `pnpm check:tokens`

Expected: FAIL with `design token drift: run pnpm generate:tokens` because the hand-edited CSS no longer matches the Token authority and generated TypeScript.

- [ ] **Step 2: Add distinct raw, theme, semantic, and component ownership**

Add these core values under `color.brand`:

```json
"brand": {
  "onPrimary": { "$type": "color", "$value": "#f0ffcf" },
  "buttonPrimaryForeground": { "$type": "color", "$value": "#cef1f5" }
}
```

Map `theme.color.text.onPrimary` to `{color.brand.onPrimary}`. Add `theme.color.action.primaryForeground` referencing `{color.brand.buttonPrimaryForeground}`; expose it as `color.action.primaryForeground`; then point `button.primary.foreground` to `{color.action.primaryForeground}`.

- [ ] **Step 3: Regenerate and verify Token outputs**

Run: `pnpm generate:tokens`

Expected generated values:

```css
--color-text-on-primary: #f0ffcf;
--button-primary-foreground: #cef1f5;
```

Run: `pnpm check:tokens`

Run:

```bash
node -e "import('./src/design/generated/tokens.ts').then(({DESIGN_TOKENS:t}) => { if (t['color.text.onPrimary'] !== '#f0ffcf' || t['button.primary.foreground'] !== '#cef1f5') process.exit(1) })"
```

Expected: both commands PASS.

---

### Task 2: Make the homepage disclosure expand downward from a stable anchor

**Files:**

- Modify: `src/styles/page.css`
- Verify: `tests/app-markup.test.ts`

**Interfaces:**

- Consumes: existing `.start-workspace`, `.more-ways`, `.more-ways-item`, and native `<details>` markup.
- Produces: a desktop start workspace using `align-content: start` with a responsive block-start offset; an integrated disclosure action row with no nested-card border or outer margin.

- [ ] **Step 1: Reproduce the failing layout behavior in a real browser**

At a desktop viewport, load the homepage and record `getBoundingClientRect().top` for `#start-title`, `.primary-upload`, `[data-open-project]`, and `.more-ways summary`. Set `[data-more-ways].open = true`, wait two animation frames, and record the same values again.

Expected RED result: one or more protected elements move vertically because the desktop workspace uses content-height centering. Also inspect the expanded action's computed border and margin to confirm the nested-card presentation.

- [ ] **Step 2: Implement the stable layout owner**

Define a mobile-first local structural variable on `.start-workspace` and use it for block-start padding:

```css
.start-workspace {
  --start-workspace-offset: clamp(var(--space-5), 12svh, 6rem);
  align-content: start;
  padding: var(--start-workspace-offset) var(--space-4) calc(var(--space-4) + var(--safe-bottom));
}
```

At `min-width: 768px`, keep `align-content: start` and set:

```css
--start-workspace-offset: clamp(6rem, 27svh, 15rem);
```

This preserves the closed-state visual center while making the position independent of the disclosure's height.

- [ ] **Step 3: Integrate the expanded action into one surface**

Update disclosure styles so the open summary gains a token border separator, `.more-ways-item` uses `width: 100%`, `margin: 0`, no independent border, a bottom-only radius, left-aligned content, token-based hover feedback, and an inset visible focus ring. Do not add height animation. Keep the existing caret transition and reduced-motion override.

- [ ] **Step 4: Verify the browser behavior turns green**

Repeat the Step 1 measurement at the same viewport.

Expected GREEN result: all four protected `top` values have a delta of `0`; the expanded action has no independent outer margin or border; the privacy note moves downward in normal flow.

- [ ] **Step 5: Run focused tests and formatting**

Run: `pnpm exec tsx --test tests/app-markup.test.ts`

Run: `pnpm exec prettier --check src/styles/page.css src/design/tokens/core.tokens.json src/design/tokens/themes/mint-studio.tokens.json src/design/tokens/semantic.tokens.json src/design/tokens/component.tokens.json`

Expected: all checks PASS.

---

### Task 3: Verify the console warning boundary

**Files:**

- Verify only: `src/main.ts`
- Verify only: `src/features/local-image-input/localImageInput.ts`
- Verify only: `dist/**`
- Reference: `docs/superpowers/specs/2026-08-03-home-start-layout-and-token-integrity-design.md`

**Interfaces:**

- Consumes: browser console source URL and current application build.
- Produces: evidence that no application source or build artifact registers an exact `unload` listener or contains `quick-panel.js`.

- [ ] **Step 1: Search exact application ownership**

Run:

```bash
rg -n --hidden --glob '!node_modules/**' --glob '!dist/**' --glob '!artifacts/**' "quick-panel|addEventListener\\s*\\(\\s*['\"]unload['\"]" .
```

Expected: no `quick-panel` result and no exact `unload` listener. Existing `beforeunload` listeners are not the event named by the violation.

- [ ] **Step 2: Build and search generated assets**

Run: `pnpm build`

Run: `rg -n 'quick-panel' dist || true`

Expected: build PASS and no `quick-panel` match.

- [ ] **Step 3: Validate in a clean browser context**

Open the Vite application in a browser context without extensions, load the homepage, expand and collapse “更多制作方式”, and inspect the console.

Expected: no application-originated `unload` Permissions Policy warning. If a normal browser profile still reports `quick-panel.js`, capture its full source URL and classify it as an injected browser component rather than changing application policy.

---

### Task 4: Full regression and responsive acceptance

**Files:**

- Verify: all changed files
- Preserve: all unrelated pre-existing worktree changes

**Interfaces:**

- Consumes: completed Token and homepage style tasks.
- Produces: a clean full project check and desktop/mobile visual evidence.

- [ ] **Step 1: Run the complete project gate**

Run: `pnpm check`

Expected: token, palette, icon, brand, tests, typecheck, ESLint, Prettier, and production build all PASS.

- [ ] **Step 2: Verify desktop layout stability**

At a desktop viewport, record bounding rectangles for `#start-title`, `.primary-upload`, `[data-open-project]`, and `.more-ways summary` before and after opening the details element.

Expected: every recorded `top` value remains unchanged; only the disclosure content and following privacy note move downward.

- [ ] **Step 3: Verify short desktop and 390px mobile behavior**

Expected:

- The homepage remains the only vertical scroll owner.
- All expanded content remains reachable.
- No horizontal overflow appears.
- DOM reading and keyboard focus order remain unchanged.
- Enter/Space toggles the summary and the action row has a visible focus ring.

- [ ] **Step 4: Review the final diff without staging**

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors; implementation files remain unstaged; all pre-existing changes and deletions are preserved.
