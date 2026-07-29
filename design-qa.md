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

## Vaadin layout integration QA — 2026-07-26

### Evidence

- Accepted visual target: `/Users/cc/.codex/generated_images/019f9387-a181-7d62-992c-9c97969a12dd/call_hqcTe6dudcrwvwUmWpZPix8K.png`.
- Preparation captures: `artifacts/qa/mobile-prepare.png` and `artifacts/qa/mobile-short-choices-portrait.png`, both 390 × 844.
- Available-color captures: `artifacts/qa/mobile-available-colors-portrait.png`, 390 × 844; `artifacts/qa/mobile-available-colors-landscape.png`, 740 × 390; and `artifacts/qa/desktop-floating-series.png`, 1440 × 900.
- Editor captures: `artifacts/qa/mobile-editor-peek.png`, `artifacts/qa/mobile-editor-sheet-selection.png`, both 390 × 844, and `artifacts/qa/desktop-editor.png`, 1440 × 900.
- The in-app browser file chooser did not accept the local fixture. The same real local build was therefore exercised in system Chrome through Playwright; no mocked DOM or synthetic screenshot was used.

### Root-cause repairs

- Vaadin radio-group hosts, public group-field parts, radio-button hosts, and public label parts now own explicit inline sizing. Three-choice groups use a container query: two rows at 320/375 px and one row at 390/430 px, with the constrained desktop settings column remaining two rows.
- Radio-card visual states and Vaadin control geometry live in `vaadin-theme.css`; page, dialog, canvas, sheet, and product-grid geometry live in `page.css`.
- All-series values use the visible `__all__` sentinel inside Vaadin selects and convert to the domain empty string only at the controller boundary. The visible default is always `全部系列`.
- The generate-action row is one column when the return action is hidden and `auto + 1fr` when it is visible.
- Mobile sheet geometry uses explicit peek, half, and full snap inputs instead of content `scrollHeight`. Handle taps and pointer drags share the same public state machine.

### Responsive and interaction results

| Viewport   | Radio group | Card minimum | Rows | Action width | Page overflow |
| ---------- | ----------: | -----------: | ---: | -----------: | ------------: |
| 320 × 700  |      288 px |       140 px |    2 |         100% |          0 px |
| 375 × 812  |      343 px |       168 px |    2 |         100% |          0 px |
| 390 × 844  |      358 px |       114 px |    1 |         100% |          0 px |
| 430 × 932  |      398 px |       127 px |    1 |         100% |          0 px |
| 768 × 1024 |      287 px |       140 px |    2 |         100% |          0 px |
| 1024 × 768 |      287 px |       140 px |    2 |         100% |          0 px |
| 1440 × 900 |      287 px |       140 px |    2 |         100% |          0 px |

- All tested cards had zero internal horizontal overflow.
- The 390 × 844 color dialog measured a 462 px scrollable grid and a fully visible 57 px footer. The 740 × 390 layout reflowed to two columns, kept the series control and completion action visible, and retained a scrollable 225 px color grid with zero horizontal overflow.
- Series options displayed `全部系列`, `A 系列`, `B 系列`, and subsequent groups. Selecting B produced controller value `B`; restoring all produced `__all__`.
- At 390 × 844 the sheet settled at 144 px peek, 359 px half, and 780 px full with an 8 px workspace top gap. At 390 × 640, full recomputed to 576 px with the same 8 px gap. At 768 × 1024 it settled at 144 px peek, 442 px half, and 960 px full.
- The half sheet kept controls at 123 px, scroll content at 79 px, and the fixed action at 67 px without overlap. Searching `A14` returned `显示 1 / 221 色`; selecting `已使用` returned `显示 24 / 221 色`.
- At 1024 × 768 and 1440 × 900 the mobile sheet was absent and the persistent inspector remained visible. No page overflow or browser-console error occurred in the final flows.

### Fidelity check

- Customer copy, task order, palette data, MARD color rendering, and the existing warm off-white/charcoal/teal visual direction are unchanged.
- The repaired cards now preserve the accepted hierarchy and selected-state treatment instead of collapsing Vaadin labels.
- The canvas remains the dominant editor surface; the mobile sheet and desktop inspector remain the only editing control surfaces.
- No new assets, marketing copy, decorative effects, UI library, or framework were introduced.
- No above-the-fold copy changed.

### Residual device-only checks

- Physical iOS Safari safe-area inset changes and the native soft-keyboard animation remain device-only validation items. Browser viewport resizing verified the same usable-height recomputation path, but it is not a substitute for a physical-device pass.

## Vaadin RadioGroup lifecycle QA — 2026-07-27

This pass supersedes the earlier RadioGroup interaction acceptance. The retained layout and responsive geometry remain accepted.

### Root cause and repair

- Static group `value` attributes and later raw `group.value` writes ran before Vaadin had completed custom-element definition, child updates, and light-DOM child registration. Vaadin therefore tried to select values before it could resolve the corresponding direct radio button, producing the reported `radio button ... was not found` warnings and stale checked state.
- Custom card content also used non-label `<div slot="label">` nodes. Clicking the visible card content did not activate Vaadin's labelled input consistently. The same content now uses semantic `<label slot="label">` nodes without changing copy or card geometry.
- Every group now has one checked child default and no static group value. One typed controller waits for both Vaadin definitions, the group and direct-button `updateComplete` promises, and the public slot/child-registration turn before validating and assigning a value.
- The controller rejects unknown or disabled values through a safe fallback, reads typed `RadioGroupValueChangedEvent.detail.value`, asserts one matching enabled checked child after every programmatic update, and never queries private shadow DOM.
- Application startup is async. Upload, preparation, editor, export, capability, and initial synchronization controllers mount only after all RadioGroups are ready. Preparation, task, mode, sampling, desktop/mobile palette, and desktop/mobile export now use direct typed subscriptions.

### Real rendered interaction

The final source was reloaded in the in-app browser and exercised at both 390 × 844 and 1440 × 900 using the real local Vite application, `artifacts/qa/source-option-2-normalized.png`, and `tests/fixtures/export-parity-project.json`.

| Group                                   | Options exercised              | Dependent result                                                                                                                  |
| --------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Customer task                           | 制作新图纸 / 镜像已有图纸      | Upload flow and task-specific state switched, then returned to new-pattern preparation                                            |
| Pattern size                            | 小巧 / 推荐 / 细致             | Portrait dimensions changed to 13 × 29, 22 × 48, and 33 × 72                                                                      |
| Bead size                               | 常规 / 迷你 / 自定义           | Physical size changed between 16.5 × 36.0 cm and 8.6 × 18.7 cm; custom fields opened only for 自定义                              |
| Color count                             | 简单 / 推荐 / 细致             | Selected values changed 12 / 24 / 48; the numeric control remained correctly capped by the active three-color fallback capability |
| Processing style                        | 容易制作 / 模拟渐变            | Color matching changed between 干净色块 and 细腻过渡                                                                              |
| Mode preference                         | 自动推荐 / 自然图片 / 清晰像素 | Recommendation copy updated; photo selected average sampling and pixel art selected nearest sampling                              |
| Sampling                                | 平均取色 / 保留像素            | Controlled sampling state changed average / nearest and survived synchronization                                                  |
| Palette scope, desktop and mobile       | 全部 / 已使用 / 最近           | Filter status changed 3 / 3, 3 / 3, and 0 / 3 for the project fixture                                                             |
| Export PNG template, desktop and mobile | 纯图案 / 带标注                | Native checkmark and `[checked]` highlight moved to each selected template                                                        |

Every click left exactly one matching enabled child checked. Final states survived preparation renders, capability/session synchronization, project import, and responsive inspector/sheet remounts in both directions.

### Validation

- Final browser console: zero application errors and zero Vaadin warnings, including zero `radio button ... was not found` messages. The only warnings were Lit's development-mode notice attributed to `/@vite/client`; no application-origin warning was present.
- Targeted regression tests: 29 passed across `app-markup`, `prepare-session`, and `prepare-workspace`.
- Targeted ESLint: passed for all modified source files.
- `pnpm run build`: passed; TypeScript validation and the Vite production build completed successfully.
- No framework, UI library, domain behavior, copy, layout repair, Canvas path, API, generation algorithm, import/export behavior, or responsive sheet state was replaced.

## Final result

passed

## Numbered production-sheet export QA — 2026-07-28

### Evidence

- Visual truth: `/Users/cc/.Trash/bead-grid-100x56-keys-palette_MARD.png`, 3288 × 3883.
- Real renderer output: `/Users/cc/.codex/visualizations/2026/07/28/019fa83f-a244-7f91-9576-e22a443b0c41/numbered-export-100x56.png`, 4590 × 4886.
- Normalized side-by-side comparison: `/Users/cc/.codex/visualizations/2026/07/28/019fa83f-a244-7f91-9576-e22a443b0c41/numbered-export-comparison-full.png`.
- Focused grid comparison: `/Users/cc/.codex/visualizations/2026/07/28/019fa83f-a244-7f91-9576-e22a443b0c41/numbered-export-comparison-grid.png`.
- Focused material-list comparison: `/Users/cc/.codex/visualizations/2026/07/28/019fa83f-a244-7f91-9576-e22a443b0c41/numbered-export-comparison-legend.png`.
- Comparison normalization: 1600 px per source column at density 1.
- QA state: MARD palette, 100 columns × 56 rows, 5600 filled cells, 44 used colors.

### Accepted visual structure

- A white, high-density production sheet keeps bead color as the main visual signal.
- A compact dark header identifies the sheet and summarizes dimensions, total bead count, used-color count, and palette.
- The grid labels every filled cell with its real palette code, uses contrast-aware code text, and repeats coordinates on all four edges.
- Stronger guides every ten rows and columns provide practical navigation without replacing the per-cell grid.
- The material list uses four reading columns with a large swatch, exact code, exact quantity, and a final total.
- The new `色号图纸` choice sits beside the existing `纯图案` and `带标注` PNG choices and reuses the existing export interaction model.

### Comparison passes

#### Pass 1

- P1 grid readability: the first 100 × 56 output used the generic 24 px cell size, making codes visibly smaller than the reference. The renderer now chooses an adaptive cell size up to 44 px while retaining an 18 px floor for larger matrices and a 4400 px maximum grid span.

#### Pass 2

- P1 material readability: the first material list used 18 px base text and 36 px base swatches, which remained too compact after normalized comparison. The final list uses 36 px base text, 72 px base swatches, and 90 px base rows, producing a reference-comparable reading rhythm and clear quantities.
- Typography: the CJK export font renders all Chinese headings, codes, coordinates, and quantities without clipping.
- Spacing: header, coordinate gutters, grid, list heading, rows, and total remain visually separated at the tested density.
- Color: every filled cell and list swatch uses the project palette's real display color; light and dark cells receive contrast-aware text.
- Image quality: the evidence is generated by the real PNG export renderer at native resolution; no placeholder, mocked canvas, or reconstructed reference asset is used.
- Copy: the sheet uses customer-facing Chinese labels and preserves palette codes exactly as stored by the current palette contract.

### Functional validation

- The real production build loaded in the in-app browser with no console warnings or errors.
- The rendered DOM contains exactly one `vaadin-radio-button[value="numbered"]` with the visible label `色号图纸` and description `每格显示色号，并附材料数量清单`.
- The in-app browser's native file chooser did not return an automatable file handle, so the imported-project export panel could not be visually opened in that browser session. The same state boundary is covered by markup, template-state, capability, API-client, and backend export tests.
- Backend suite: 98 passed.
- Targeted frontend regression suite: 39 passed.
- TypeScript typecheck, ESLint, changed-TypeScript Prettier check, and production build passed.

### Residual checks

- A physical print proof remains useful for confirming the smallest codes after printer scaling and paper-driver interpolation.
- The full frontend suite retains three deterministic, unrelated selection-boundary failures in files not changed by this export work.

final result: passed

## Mobile configurable PNG export layout QA — 2026-07-28

### Evidence

- Source visual truth: `/var/folders/x6/9_ly65113g1gppf6t0n4ncjr0000gn/T/codex-clipboard-edc6f483-115c-46c7-afc9-1662fc82a822.png`, 876 × 1370. This is the reported broken state rather than a replacement visual design.
- Browser-rendered implementation, top state: `artifacts/qa/export-mobile-style-fixed-top.png`, 390 × 844.
- Browser-rendered implementation, configuration state: `artifacts/qa/export-mobile-style-fixed-lower.png`, 390 × 844.
- Side-by-side comparison: `artifacts/qa/export-mobile-style-comparison.png`, 930 × 844.
- Browser viewport: 390 × 844 CSS px at device pixel ratio 1.
- Density normalization: the 876 × 1370 source was proportionally scaled to 540 × 844 and placed beside the 390 × 844 implementation configuration state.
- State: full mobile editor sheet, sharing-image task selected, annotated preset, white background, round-bead appearance, and five of six optional content rows selected.

### Comparison history

#### Pass 1

- P1 layout overlap: the source shows the live preview and its divider covering preset controls because the mobile preview was sticky and the containing `auto` grid track could shrink below its children.
- P1 missing labels: all six content choices rendered only their checkmark boxes because their customer-facing text was not assigned to Vaadin's public label slot.
- P2 obstructed controls: the sticky download action covered configuration cards while scrolling.
- Fixes: returned the preview to normal document flow, changed all seven export panel rows to non-shrinking `max-content` tracks, added explicit native label slots to every checkbox, made the mobile download action part of the normal flow, and reduced mobile-only preview/card spacing.

#### Pass 2

- The first browser pass after removing sticky positioning still exposed a zero-height preview host. DOM geometry showed the preview at 0 px while its 265.8 px children overflowed over the following 136 px task grid.
- Fix: the export panel now uses `repeat(7, max-content)`, producing sequential geometry: preview 240.6–506.4 px, task grid 518.4–654.4 px, and PNG controls starting at 666.4 px.
- The sticky mobile action was also confirmed to cover preset cards and was changed to relative positioning.

#### Pass 3

- The final side-by-side and focused configuration captures contain no remaining P0, P1, or P2 issue. Preview, tasks, presets, custom options, content labels, summary, and action follow one continuous scroll order without overlap.

### Required fidelity surfaces

- Fonts and typography: the existing Chinese system stack and hierarchy remain unchanged. Checkbox labels now render at the established 0.78 rem control weight and remain readable without truncation.
- Spacing and layout rhythm: the final mobile surface uses the existing spacing and radius tokens, compact three-rem radio cards, a bounded 11–16 rem preview, and 44 px checkbox touch rows. No fixed or sticky layer obscures a configuration control.
- Colors and visual tokens: teal selected states, neutral borders, checkerboard transparency, muted descriptions, and the summary callout continue to use the product's existing tokens.
- Image quality: the renderer and exported PNG data path were not modified. The deterministic canvas in the browser layout fixture was used only to verify responsive containment; native export rendering remains covered by the PNG renderer tests.
- Copy and content: all existing export copy is preserved. The six previously invisible labels—`网格线`, `行列坐标`, `格内色号`, `图纸统计`, `材料数量`, and `色块图例`—are now both visible and exposed as checkbox names.

### Functional and responsive validation

- In-app Browser DOM exposed all five preset radios, both background radios, all four appearance radios, and all six named checkboxes.
- Browser geometry confirmed zero overlap between preview, task grid, custom controls, summary, and action at 390 × 844.
- Browser console contained no application warning or error; the only warning was Lit's Vite development-mode notice.
- Full frontend suite: 290 passed.
- ESLint passed for the modified TypeScript application file.
- Prettier check passed for all modified production and regression-test files.
- TypeScript validation and the Vite production build passed.

### Residual checks

- The in-app browser file chooser did not return an automatable file handle, so the visual QA used the real export markup, Vaadin components, responsive CSS, and a deterministic canvas fixture. The user's final manual pass should confirm the same layout with their imported motorcycle project.

final result: passed

## Rounded-square share export QA — 2026-07-28

### Evidence

- Source visual truth: `/tmp/codex-remote-attachments/019fa83f-a244-7f91-9576-e22a443b0c41/E3EF0857-9614-4E1C-B4FA-E355519D857B/2-照片-2.jpg`, 992 × 674.
- Source grid crop: `/Users/cc/.codex/visualizations/2026/07/28/019fa83f-a244-7f91-9576-e22a443b0c41/rounded-export-reference-grid.png`, 880 × 658.
- Real renderer output: `/Users/cc/.codex/visualizations/2026/07/28/019fa83f-a244-7f91-9576-e22a443b0c41/rounded-export-51x38.png`, 816 × 608.
- Full normalized comparison: `/Users/cc/.codex/visualizations/2026/07/28/019fa83f-a244-7f91-9576-e22a443b0c41/rounded-export-comparison-full.png`, 1760 × 702.
- Focused cell comparison: `/Users/cc/.codex/visualizations/2026/07/28/019fa83f-a244-7f91-9576-e22a443b0c41/rounded-export-comparison-detail.png`, 600 × 304.
- Comparison normalization: source grid retained at 880 × 658; implementation scaled with nearest-neighbor sampling from 816 × 608 to 880 × 656 and padded by 2 white pixels to align the comparison frame.
- QA state: 51 columns × 38 rows, 1938 filled cells, MARD palette, 26 colors sampled from the source grid and mapped to the nearest real MARD display color.

### Accepted visual structure

- The export contains only the color matrix. It intentionally omits title, coordinates, color codes, legend, material counts, and decorative framing.
- Each matrix position uses a 16 px pitch, 14 px visible square, 2 px inter-cell gap, and 3 px corner radius.
- Filled cells use the project's real palette display color. Empty cells remain white so negative space stays clean.
- Only colors with luminance above 235 receive a one-pixel neutral outline, keeping white and near-white beads visible without outlining or muddying darker colors.
- The new customer-facing mode is `圆角方格`, described as `圆角小方格清晰分隔，适合放大分享`.

### Comparison history

#### Pass 1

- P1 light-color visibility: white and near-white beads disappeared into the white canvas in the first real renderer output, unlike the reference where pale beads retain a subtle edge.
- Fix: added a luminance-gated one-pixel neutral outline for only the lightest bead colors.

#### Pass 2

- Post-fix full and focused comparisons show the same dense color-mosaic hierarchy, lightly rounded corners, and narrow white separation as the source.
- No actionable P0, P1, or P2 mismatch remains. Differences in individual colors come from reconstructing the QA matrix from a compressed screenshot and mapping it to the current MARD palette; production exports render the authoritative project matrix directly.

### Required fidelity surfaces

- Typography: the exported artifact contains no typography by design. The real app build exposes the complete `圆角方格` label and description without truncation in the DOM.
- Spacing and layout rhythm: the 14/16 tile-to-pitch ratio matches the source's approximately 15/17 rhythm; the canvas has no unrelated outer section or annotation area.
- Colors and tokens: tiles use `displayHex` from the current project palette, the canvas uses the export background token, and the light-cell outline uses the export grid token.
- Image quality: the implementation evidence is a native PNG produced by the real backend renderer. The full-view comparison uses nearest-neighbor normalization to preserve hard cell edges.
- Copy and content: no prompt or explanatory copy appears in the image. The selection copy is concise customer-facing Chinese.

### Functional validation

- The production build loaded in the in-app browser with one enabled `vaadin-radio-button[data-export-template="rounded"]`.
- Browser console warnings and errors: none.
- The in-app browser file chooser did not return an automatable handle for the local project fixture. Export-panel interaction is covered by template-state, markup, capability, API-client, and backend renderer tests.
- Backend suite: 100 passed.
- Targeted frontend suite: 40 passed.
- TypeScript typecheck, ESLint, changed-TypeScript Prettier check, and production build passed.

### Follow-up polish

- P3: a physical display or print proof can confirm whether a particular sharing platform's JPEG recompression warrants a larger pitch. The native PNG itself remains crisp.

final result: passed
