# Product Design QA

## Evidence

- Selected visual target: `/Users/cc/.codex/generated_images/019f9387-a181-7d62-992c-9c97969a12dd/call_hqcTe6dudcrwvwUmWpZPix8K.png`
- Source pixels: 853 × 1844; normalized comparison: 390 × 844.
- Implementation capture: `artifacts/qa/mobile-editor-materials.png`, 390 × 844 CSS viewport at device density 1.
- Combined comparison input: `artifacts/qa/comparison-option-2-mobile.png`, 780 × 844.
- Compared state: generated pattern, front view, mobile sheet at half height, Materials selected, fixed export action visible.
- Additional captures: mobile upload, mobile crop, mobile editor peek, desktop editor/materials, mobile/desktop intelligent mirror.

## Selected-direction interpretation

The source establishes the editor hierarchy: compact header, dominant pattern canvas, front/reverse and history controls, one bottom sheet, concise material summary, material rows, and a persistent completion action. Owner direction intentionally overrides the source's dark blue treatment and mobile left rail:

- Theme is warm off-white and charcoal with teal only for primary/active UI.
- MARD/default colors are limited to pattern cells, swatches, legends, selected-color feedback, and material rows.
- Mobile tools live in the single three-state bottom sheet; the left rail appears only on desktop.
- The provisional customer brand is 豆图设计台 and is configuration-driven.

These are approved direction changes, not fidelity defects.

## Comparison passes

### Pass 1

- P0 icons: generated icon CSS emitted escaped code strings, so icon names appeared as `\E...`. Fixed the generator to emit the correct font glyph escapes and regenerated the asset.
- P0 upload: the native file input was visible and displaced the mobile layout. Added the standard visually-hidden contract while keeping the associated label and keyboard access.
- P1 materials: the half sheet spent too much height on three stacked summary rows, hiding the first useful material entry. Reworked the mobile summary into one compact three-column strip.
- P1 touch target: the sheet handle was 56 × 24 CSS px. Increased it to 56 × 44 CSS px and adjusted the peek height.

### Pass 2

- Layout: canvas remains the dominant surface; the sheet does not stack or obscure the fixed action; desktop resolves to 64 px tool rail, flexible canvas, and 328 px persistent inspector.
- Spacing: summary, material rows, sheet tabs, and fixed action have clear grouping without card proliferation or oversized empty marketing space.
- Typography: system Chinese sans stack, compact hierarchy, no clipped or awkwardly wrapped customer copy at tested widths.
- Color: runtime tokens resolve to page `#F7F8F5`, primary `#0F766E`, charcoal text, subtle neutral borders; no decorative gradient, glass, glow, or bead-pattern background.
- Icons: all visible actions use the generated Phosphor font subset with consistent stroke weight and alignment.
- Imagery: the canvas uses the generated project matrix; no fake preview, placeholder image service, CSS art, or third-party image result.
- Interaction: upload, crop drag, generation, paint/erase, undo/redo, front/reverse, matrix mirror, smart chart mirror, material statistics, exports, replace image, reload reset, and invalid-upload recovery were exercised in the in-app browser.
- Accessibility: visible focus rules and reduced-motion rules are present; all visible buttons at 320, 375, 390, 430, 768, and 1440 widths meet 44 × 44 CSS px; no horizontal page overflow occurred.
- Browser console: no warnings or errors in the final flow.

Dynamic pattern content differs from the reference because the implementation renders the actual uploaded image through the real palette conversion pipeline. The spatial hierarchy and interaction model are the fidelity surface under comparison.

## Selector architecture QA — 2026-07-26

### Evidence

- Authoritative failure evidence: the supplied mobile screenshots and task description showing the selector mounted inside `.prepare-settings`, a collapsed listbox, an empty scrollbar line, off-screen options, default-gray controls, and a selection surface beginning below the crop workspace.
- Existing product styling baseline: `artifacts/qa/mobile-prepare.png`.
- Updated short-choice capture: `artifacts/qa/mobile-short-choices-portrait.png`, 390 × 844.
- Updated preparation multi-select captures: `artifacts/qa/mobile-available-colors-portrait.png`, 390 × 844, and `artifacts/qa/mobile-available-colors-landscape.png`, 740 × 390.
- Updated editor sheet capture: `artifacts/qa/mobile-editor-sheet-selection.png`, 390 × 844.
- Updated desktop popover capture: `artifacts/qa/desktop-floating-series.png`, 1200 × 800.

### Comparison passes

#### Pass 1

- Replaced two-option palette and processing pickers plus three-option board presets with visible radio cards. A palette tap commits directly; the 390 × 844 capture contains two palette options, no mobile selection surface, no visible search field, and no confirmation action.
- Moved mobile preparation selection into the root-level host below the 56 px app header. At 390 × 844, the host and selection page both measured 788 px high, from y=56 through y=844.
- Verified the available-color listbox has a nonzero 381.6 px viewport with 684 px scroll content and 39 visible options. The preparation settings panel remains connected and is not hidden while the page is open.

#### Pass 2

- The first 740 × 390 layout kept the listbox at only 80 px and pushed it behind the footer. Reflowed the multi-select page into two columns for compact landscape.
- Final 740 × 390 measurements: the page spans y=56–390; the color list spans y=112–323.6 at 211.6 px high; the series trigger ends at y=326.4; the completion footer begins at y=331.6. Title, return action, options, filters, and completion action remain visible without horizontal overflow.
- In the pattern editor, the selector reuses the one existing bottom sheet. The capture measured one workspace sheet, one temporary selection content surface, a 142 px listbox, hidden search for three options, and unchanged sheet top at y=470 before and after selection. Selection closes immediately and returns focus to the series trigger.
- The desktop series listbox uses fixed positioning below its trigger. At 1200 × 800 it measured y=458.2–788 with a 329.8 px Floating UI size constraint and `bottom-start` placement.
- Dynamic buttons resolve through the project text, primary, secondary, option, selected, active, disabled, and focus-visible contracts. No browser-default gray button appears in the updated captures.

## Final result

passed
