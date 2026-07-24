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

## Final result

passed
