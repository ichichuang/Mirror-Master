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
