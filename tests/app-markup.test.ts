import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { Window } from 'happy-dom';

import { renderApp } from '../src/app';

const markup = renderApp();
const mainSource = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const previewViewSource = readFileSync(
  new URL('../src/features/preview-workspace/previewView.ts', import.meta.url),
  'utf8',
);
const pageCss = readFileSync(new URL('../src/styles/page.css', import.meta.url), 'utf8');
const generatedIconCss = readFileSync(
  new URL('../src/generated/phosphor-icons.css', import.meta.url),
  'utf8',
);
const vaadinThemeCss = readFileSync(
  new URL('../src/styles/vaadin-theme.css', import.meta.url),
  'utf8',
);

test('start workspace exposes one dominant image entry and demotes every other task', () => {
  assert.match(markup, /id="image-file-input"[\s\S]*data-file-input/u);
  assert.match(markup, /id="project-file-input"[\s\S]*accept="application\/json,\.json"/u);
  assert.match(markup, /data-project-file-input/u);
  assert.match(markup, /data-project-file-status/u);
  assert.match(markup, /data-upload-constraints/u);

  const start = sectionMarkup('data-start-workspace', 'data-preview-workspace');
  assert.match(start, /把图片变成可制作的拼豆图纸/u);
  assert.match(start, /自动匹配色号、计算材料，还可以继续修改。/u);
  assert.match(start, /data-new-pattern-entry/u);
  assert.match(start, /选择图片/u);
  assert.match(start, /data-open-project/u);
  assert.match(start, /打开已保存项目/u);
  assert.match(start, /图片只用于生成当前图纸，不会发送给第三方图片服务。/u);
  assert.doesNotMatch(start, /data-customer-task/u);
  assert.doesNotMatch(start, /<vaadin-radio-group\b/u);
  assert.doesNotMatch(start, /value="photo"/u);
  assert.doesNotMatch(start, /value="pixelArt"/u);
  assert.doesNotMatch(start, /最近项目/u);
  assert.doesNotMatch(start, /空白画布/u);
  assert.doesNotMatch(start, /导入图案数据/u);

  const moreWays = start.match(/<details\b[^>]*data-more-ways[^>]*>([\s\S]*?)<\/details>/u)?.[0];
  assert.ok(moreWays);
  assert.match(moreWays, /更多制作方式/u);
  assert.match(moreWays, /data-mirror-existing-chart/u);
  assert.match(moreWays, /镜像已有图纸/u);
  assert.match(moreWays, /只翻转拼豆格，保留坐标和图例。/u);
});

test('preview workspace keeps one collapsed professional surface for every expert control', () => {
  for (const hook of [
    'data-custom-board-columns',
    'data-custom-board-rows',
    'data-crop-x',
    'data-crop-y',
    'data-crop-width',
    'data-crop-height',
    'data-available-color-search',
    'data-available-color-series',
    'data-clear-all-colors',
    'data-return-editor',
  ]) {
    assert.match(markup, new RegExp(hook, 'u'));
  }
  assert.match(markup, /data-crop-keyboard-target[\s\S]*aria-describedby="crop-keyboard-help"/u);
  assert.match(markup, /id="crop-keyboard-help"[\s\S]*方向键/u);
  assert.match(markup, /max="12"[\s\S]*data-bead-pitch/u);

  const preview = sectionMarkup('data-preview-workspace', 'data-pattern-workspace');
  const professional = preview.match(
    /<details\b[^>]*data-professional-settings[^>]*>([\s\S]*?)<\/details>/u,
  )?.[0];
  assert.ok(professional);
  assert.doesNotMatch(professional.match(/^<details\b[^>]*>/u)?.[0] ?? '', /\bopen\b/u);
  assert.equal(countMatches(preview, /<details\b/g), 1);
  for (const selector of [
    'data-mode-preference',
    'data-board-preset',
    'data-custom-board-columns',
    'data-custom-board-rows',
    'data-bead-size-preset',
    'data-available-color-grid',
    'data-available-color-search',
    'data-available-color-series',
    'data-sampling',
    'data-dithering',
    'data-alpha-threshold',
    'data-bead-pitch',
    'data-mode-recommendation',
    'data-crop-x',
  ]) {
    assert.match(professional, new RegExp(selector, 'u'));
  }
  assert.doesNotMatch(professional, /data-maximum-colors/u);
});

test('preview default surface holds exactly the four customer setting groups in order', () => {
  const preview = sectionMarkup('data-preview-workspace', 'data-pattern-workspace');
  const groupOrder = [
    preview.indexOf('data-pattern-size-preset'),
    preview.indexOf('data-color-count-preset'),
    preview.indexOf('data-visual-style-preset'),
    preview.indexOf('data-palette-id'),
  ];
  assert.ok(groupOrder.every((index) => index >= 0));
  assert.deepEqual(
    [...groupOrder].sort((left, right) => left - right),
    groupOrder,
  );
  assert.match(preview, /图案大小/u);
  assert.match(preview, /颜色数量/u);
  assert.match(preview, /效果风格/u);
  assert.match(preview, /拼豆品牌/u);
  assert.deepEqual(valuesForRadioGroup(preview, 'pattern-size-preset'), [
    '29',
    '48',
    '72',
    'custom',
  ]);
  assert.deepEqual(valuesForRadioGroup(preview, 'color-count-preset'), [
    '12',
    '24',
    '48',
    'custom',
  ]);
  assert.deepEqual(valuesForRadioGroup(preview, 'visual-style-preset'), [
    'clearBlocks',
    'natural',
    'vivid',
    'smoothGradient',
  ]);
  assert.match(preview, /清晰色块/u);
  assert.match(preview, /自然还原/u);
  assert.match(preview, /鲜艳突出/u);
  assert.match(preview, /细腻渐变/u);
  assert.match(preview, /data-dimension-inputs[^>]*hidden/u);
  assert.match(preview, /data-maximum-colors-field[^>]*hidden/u);
  assert.match(preview, /data-color-count-estimate/u);
  assert.match(preview, /data-palette-availability/u);
});

test('preview is result-first with comparison controls and no generation button', () => {
  const preview = sectionMarkup('data-preview-workspace', 'data-pattern-workspace');
  assert.doesNotMatch(preview, /data-generate-pattern/u);
  assert.doesNotMatch(preview, /data-regenerate-pattern/u);
  assert.doesNotMatch(preview, /生成图纸/u);
  assert.equal(countMatches(preview, /data-edit-pattern/g), 1);
  assert.match(preview, /编辑图纸/u);
  assert.match(preview, /data-preview-canvas-slot/u);
  assert.match(preview, /data-preview-canvas/u);
  assert.match(preview, /data-preview-summary[^>]*hidden/u);
  assert.match(preview, /data-preview-trust-summary/u);
  assert.match(
    preview,
    /data-preview-trust-verification[^>]*role="status"[^>]*aria-live="polite"/u,
  );
  assert.match(preview, /data-preview-status[^>]*role="status"[^>]*aria-live="polite"/u);
  assert.match(preview, /data-preview-badge[^>]*hidden/u);
  assert.match(preview, /data-compare-switch/u);
  assert.match(preview, /value="original"[\s\S]*<label slot="label">原图<\/label>/u);
  assert.match(preview, /value="pattern"[^>]*checked[\s\S]*<label slot="label">拼豆<\/label>/u);
  assert.match(preview, /data-hold-original/u);
  assert.match(preview, /按住对比/u);
  assert.match(preview, /data-preview-image-actions/u);
  assert.match(preview, /data-action-label-short>裁剪</u);
  assert.match(preview, /data-action-label-long>调整原图</u);
  assert.match(preview, /data-action-label-short>换图</u);
  assert.match(preview, /data-action-label-long>更换图片</u);
  assert.match(preview, /data-background-removal-action[^>]*disabled/u);
  assert.match(preview, /data-background-removal-label-short>去背</u);
  assert.match(preview, /data-background-removal-label-long>一键去背景</u);
  assert.doesNotMatch(preview, /自动保留主要人物或物体，处理后可恢复原图/u);
  assert.match(
    preview,
    /class="background-removal-status"[^>]*data-background-removal-status[^>]*hidden[^>]*role="status"[^>]*aria-live="polite"/u,
  );
  assert.match(
    preview,
    /class="ph ph-check-circle"[\s\S]*data-background-removal-status-icon="ready"/u,
  );
  assert.match(
    preview,
    /class="ph ph-circle-notch spin"[\s\S]*data-background-removal-status-icon="loading"/u,
  );
  assert.match(
    preview,
    /class="ph ph-warning-circle"[\s\S]*data-background-removal-status-icon="error"/u,
  );
  for (const iconName of ['check-circle', 'circle-notch', 'warning-circle']) {
    assert.match(generatedIconCss, new RegExp(`\\.ph-${iconName}::before`, 'u'));
  }
  assert.match(preview, /data-background-removal-status-message/u);
  assert.match(preview, /data-preview-original-view[^>]*hidden/u);
  assert.match(
    preview,
    /data-preview-canvas-stack[\s\S]*data-preview-canvas[\s\S]*data-preview-original-canvas/u,
  );
  assert.match(preview, /data-preview-original-canvas/u);
  assert.match(preview, /data-preview-adjust-view[^>]*hidden/u);
  assert.match(preview, /data-adjust-source/u);
  assert.match(preview, /data-finish-source-adjust/u);
  assert.equal(countMatches(preview, /value="original"/g), 1);
  assert.match(preview, /data-crop-canvas/u);
  assert.match(preview, /data-rotate-left/u);
  assert.match(preview, /data-rotate-right/u);
  assert.equal(countMatches(preview, /data-preview-control-surface/g), 1);
  assert.match(preview, /data-preview-control-surface[\s\S]*data-preview-sheet-state="peek"/u);
  assert.match(preview, /data-preview-sheet-drag-region/u);
  assert.match(preview, /data-preview-controls-scroll[^>]*hidden/u);
  assert.match(preview, /data-preview-panel-toggle[\s\S]*aria-expanded="false"/u);
  assert.doesNotMatch(preview, /data-preview-inspector|data-preview-panel-body/u);
});

test('renderApp uses Vaadin selectors and dialogs without legacy overlay or mobile hosts', () => {
  assert.doesNotMatch(markup, /<select\b/u);
  assert.match(markup, /<vaadin-select\b/u);
  assert.match(markup, /data-available-color-dialog/u);
  assert.match(markup, /data-confirmation-dialog/u);
  assert.equal(countMatches(markup, /data-preview-control-surface/g), 1);
  assert.equal(countMatches(markup, /data-preview-controls-scroll/g), 1);
  assert.doesNotMatch(markup, /data-overlay-root/u);
  assert.doesNotMatch(markup, /data-mobile-stage-host/u);
  assert.doesNotMatch(markup, /data-prepare-picker-surface/u);
  assert.doesNotMatch(markup, /data-mobile-picker-panel/u);
  assert.doesNotMatch(markup, /data-prepare-workspace/u);
  assert.doesNotMatch(markup, /data-upload-workspace/u);
  assert.equal(countMatches(markup, /data-board-preset/g), 1);
  assert.equal(countMatches(markup, /data-palette-id/g), 1);
  assert.equal(countMatches(markup, /data-available-color-series/g), 1);
  assert.equal(countMatches(markup, /data-dithering/g), 1);
  assert.equal(countMatches(markup, /data-color-series-filter/g), 2);
  assert.doesNotMatch(pageCss, /\.app-overlay-root|\.mobile-stage-host/u);
});

test('short prepare choices use anchored Select and available colors use one responsive Dialog', () => {
  assert.match(markup, /data-open-available-colors/u);
  for (const hook of ['data-palette-id', 'data-board-preset', 'data-dithering']) {
    assert.match(markup, new RegExp(`<vaadin-select[\\s\\S]*?${hook}`, 'u'));
  }
  assert.match(markup, /<template data-available-color-dialog-template>/u);
  assert.match(markup, /<vaadin-text-field[\s\S]*data-available-color-search/u);
  assert.match(markup, /<vaadin-checkbox|data-available-color-grid/u);
  assert.match(
    vaadinThemeCss,
    /vaadin-dialog\[theme~='color-picker'\]::part\(overlay\)[\s\S]*width:\s*100vw[\s\S]*height:\s*100dvh/u,
  );
  assert.doesNotMatch(pageCss, /available-color-mobile-page|mobile-single-select/u);
});

test('editor markup provides canvas fit and actual-size hooks', () => {
  assert.match(markup, /data-canvas-zoom-fit/u);
  assert.match(markup, /data-canvas-zoom-actual/u);
  assert.match(markup, /data-reverse-view>查看反面<\/button>/u);
});

test('editor markup provides bounded row and column jump controls', () => {
  assert.match(markup, /data-toggle-canvas-jump/u);
  assert.match(markup, /data-canvas-jump-form/u);
  assert.match(markup, /data-canvas-jump-form[^>]*hidden/u);
  assert.match(markup, /data-canvas-jump-row[^>]*min="1"[^>]*max="300"/u);
  assert.match(markup, /data-canvas-jump-column[^>]*min="1"[^>]*max="300"/u);
  assert.match(markup, /data-canvas-jump-submit/u);
  assert.match(markup, /data-canvas-jump-cancel/u);
});

test('existing-chart confirmation exposes dimensions, confidence, editable row and column counts', () => {
  const chart = markup.slice(markup.indexOf('data-chart-workspace'));
  assert.match(chart, /data-chart-dimensions/u);
  assert.match(chart, /data-chart-confidence/u);
  assert.match(chart, /data-chart-warning[^>]*role="status"/u);
  assert.match(chart, /data-chart-columns[^>]*min="2"[^>]*max="300"/u);
  assert.match(chart, /data-chart-rows[^>]*min="2"[^>]*max="300"/u);
  assert.match(chart, /data-chart-apply-dimensions[\s\S]*修改行列数/u);
  assert.match(chart, /data-chart-generate[^>]*disabled[\s\S]*确认并镜像/u);
});

test('desktop and mobile inspector tabs are roving-ready and control tabpanels', () => {
  for (const surface of ['desktop', 'mobile']) {
    assert.match(
      markup,
      new RegExp(
        `id="inspector-${surface}-tab-tools"[\\s\\S]*aria-controls="inspector-${surface}-tabpanel"[\\s\\S]*tabindex="0"`,
        'u',
      ),
    );
    assert.match(
      markup,
      new RegExp(
        `id="inspector-${surface}-tabpanel"[\\s\\S]*role="tabpanel"[\\s\\S]*data-tabpanel-surface="${surface}"`,
        'u',
      ),
    );
  }
  assert.match(markup, /data-panel-tab="palette"[\s\S]*tabindex="-1"/u);
});

test('editor exposes palette filters, same-layer export, and flow action hooks', () => {
  assert.equal(countMatches(markup, /data-color-search/g), 2);
  assert.equal(countMatches(markup, /<vaadin-radio-button value="used"/g), 2);
  assert.equal(countMatches(markup, /<vaadin-radio-button value="recent"/g), 2);
  assert.equal(countMatches(markup, /data-color-series-filter/g), 2);
  assert.equal(countMatches(markup, /role="search"/g), 3);
  assert.equal(countMatches(markup, /data-export-preset="pure"/g), 2);
  assert.equal(countMatches(markup, /data-export-preset="annotated"/g), 2);
  assert.equal(countMatches(markup, /data-export-preset="numbered"/g), 2);
  assert.equal(countMatches(markup, /data-export-preset="rounded"/g), 2);
  assert.equal(countMatches(markup, /data-export-preset="ring"/g), 2);
  assert.equal(countMatches(markup, /data-export-background-options/g), 2);
  assert.equal(countMatches(markup, /data-export-appearance-options/g), 2);
  assert.equal(countMatches(markup, /data-export-content-option=/g), 12);
  assert.equal(
    countMatches(
      markup,
      /data-export-content-option="[^"]+"[^>]*>[\s\S]*?<label slot="label">[^<]+<\/label>/g,
    ),
    12,
  );
  assert.equal(countMatches(markup, /data-export-preview-canvas/g), 3);
  assert.doesNotMatch(markup, /data-export-preview-button/u);
  assert.match(markup, /色号图纸[\s\S]*每格显示色号，并附材料数量清单/u);
  assert.match(markup, /圆角方格[\s\S]*圆角小方格清晰分隔，适合放大分享/u);
  assert.match(markup, /圆环豆粒[\s\S]*模拟带中心孔的实体拼豆外观/u);
  assert.match(markup, /data-return-prepare/u);
  assert.match(markup, /data-edit-pattern/u);
  assert.match(markup, /data-return-editor/u);
  assert.match(markup, /data-selection-action="move"/u);
  assert.match(markup, /data-selection-action="copy"/u);
  assert.match(markup, /data-selection-action="clear"/u);
  assert.match(markup, /data-selection-action="cancel"/u);
  assert.match(
    markup,
    /class="selection-context-bar"[^>]*role="toolbar"[^>]*data-selection-context/u,
  );
  assert.match(markup, /data-selection-description/u);
  assert.match(markup, /data-selection-action="move"[\s\S]*移动/u);
  assert.match(markup, /data-selection-action="copy"[\s\S]*复制/u);
  assert.doesNotMatch(markup, /data-selection-actions/u);
});

test('mobile export preview stays in document flow instead of covering configuration controls', () => {
  assert.match(
    pageCss,
    /\.export-completion\s*\{[\s\S]*?grid-template-rows:\s*repeat\(7,\s*max-content\)/u,
  );
  assert.doesNotMatch(pageCss, /\.export-mobile-preview\s*\{\s*position:\s*sticky/u);
  assert.match(
    pageCss,
    /@media \(max-width: 767px\)[\s\S]*?\.export-mobile-preview\s*\{[\s\S]*?position:\s*relative/u,
  );
  assert.match(
    pageCss,
    /@media \(max-width: 767px\)[\s\S]*?\.export-run\s*\{[\s\S]*?position:\s*relative/u,
  );
});

test('PNG export option cards center their copy without centering checkbox rows', () => {
  assert.match(
    vaadinThemeCss,
    /\.export-template-options \[slot='label'\],\s*\.export-compact-options \[slot='label'\]\s*\{[^}]*place-items:\s*center;[^}]*text-align:\s*center;/u,
  );
  assert.match(
    vaadinThemeCss,
    /\.export-template-options \[slot='label'\] > span\s*\{[^}]*display:\s*grid;[^}]*justify-items:\s*center;[^}]*text-align:\s*center;/u,
  );
  assert.match(
    vaadinThemeCss,
    /\.export-compact-options \[slot='label'\]\s*\{[^}]*white-space:\s*nowrap;/u,
  );
  assert.match(
    pageCss,
    /\.workspace-inspector \.export-option-groups\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/u,
  );
  const checkboxLabelRule =
    vaadinThemeCss.match(
      /\.export-content-options vaadin-checkbox > \[slot='label'\]\s*\{([^}]*)\}/u,
    )?.[1] ?? '';
  assert.doesNotMatch(checkboxLabelRule, /justify-content:\s*center|text-align:\s*center/u);
});

test('palette scope controls expose one native label across every visual radio card', async () => {
  const window = new Window();
  window.document.body.innerHTML = markup;
  const groups = [
    ...window.document.querySelectorAll<HTMLElement>('vaadin-radio-group[data-color-filter]'),
  ];
  assert.equal(groups.length, 2);

  for (const group of groups) {
    assert.equal(group.hasAttribute('label'), false);
    const buttons = [...group.querySelectorAll<HTMLElement>('vaadin-radio-button')];
    assert.deepEqual(
      buttons.map((button) => button.querySelector('[slot="label"]')?.textContent?.trim()),
      ['全部', '已使用', '最近'],
    );
  }

  await window.happyDOM.close();
});

test('segmented radio controls give their native inputs the full visual hit area', () => {
  assert.match(
    vaadinThemeCss,
    /vaadin-radio-button\s*>\s*input\[slot=['"]input['"]\]\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*inline-size:\s*100%;[^}]*block-size:\s*100%;/u,
  );
  assert.doesNotMatch(
    vaadinThemeCss,
    /\.workspace-sheet \.palette-scope\s*\{[^}]*block-size:\s*2\.75rem;/u,
  );
  assert.match(
    pageCss,
    /\.workspace-sheet \.color-filter-status\s*\{[^}]*pointer-events:\s*none;/u,
  );
});

test('RadioGroups use one checked child default without a static group value', () => {
  const groups = [
    ...markup.matchAll(/<vaadin-radio-group\b([^>]*)>([\s\S]*?)<\/vaadin-radio-group>/gu),
  ];
  assert.equal(groups.length, 15);
  for (const [, attributes = '', children = ''] of groups) {
    assert.doesNotMatch(attributes, /\bvalue=/u);
    assert.equal(countMatches(children, /<vaadin-radio-button\b[^>]*\bchecked\b/gu), 1);
  }
  assert.doesNotMatch(markup, /<div\b[^>]*\bslot="label"/u);
});

test('editor exposes one-session first-use guidance and a useful sheet peek summary', () => {
  assert.match(markup, /data-first-use-hint[^>]*hidden/u);
  assert.match(markup, /单指绘制，双指移动和缩放/u);
  assert.match(markup, /data-dismiss-first-use-hint/u);
  assert.match(
    markup,
    /data-first-use-hint[\s\S]*class="pattern-canvas-frame"/u,
    '首用提示应在画布框外占据自己的布局行，不能遮挡可编辑格子',
  );
  assert.doesNotMatch(
    markup,
    /class="pattern-canvas-frame"[\s\S]*data-first-use-hint[\s\S]*data-pattern-canvas/u,
  );
  assert.match(markup, /data-sheet-drag-region/u);
  assert.match(markup, /data-sheet-current-tool/u);
  assert.match(markup, /data-sheet-current-color/u);
  assert.match(markup, /data-sheet-open-tools/u);
  assert.match(markup, /工具与颜色/u);
});

test('export completion reuses inspector and sheet surfaces without a modal', () => {
  assert.doesNotMatch(markup, /data-export-popover/u);
  assert.doesNotMatch(markup, /aria-modal="true"/u);
  assert.equal(countMatches(markup, /data-export-completion\b/g), 2);
  assert.equal(countMatches(markup, /data-export-trust-summary/g), 2);
  assert.equal(countMatches(markup, /data-export-trust-verification/g), 2);
  assert.deepEqual(
    [...markup.matchAll(/data-export-surface="([^"]+)"/gu)].map((match) => match[1]),
    ['desktop', 'mobile'],
  );
  for (const task of ['shareImage', 'printMaking', 'materialsList', 'saveProject']) {
    assert.equal(countMatches(markup, new RegExp(`data-export-task="${task}"`, 'g')), 2);
  }
  assert.equal(countMatches(markup, /data-export-run/g), 2);
  assert.equal(countMatches(markup, /data-export-status/g), 2);
  assert.match(markup, /分享图片/u);
  assert.match(markup, /打印制作/u);
  assert.match(markup, /材料清单/u);
  assert.match(markup, /保存项目/u);
});

test('PNG export is configured against one live preview result with no confirmation step', () => {
  assert.equal(countMatches(markup, /data-export-preview-workspace-status/g), 1);
  assert.match(mainSource, /configurationForPreviewMode\(previewRenderMode\)/u);
  assert.match(
    mainSource,
    /pngExportPreviewCoordinator\.schedule\(\{[\s\S]*configuration:\s*exportCompletionState\.pngConfiguration/u,
  );
  assert.match(mainSource, /currentReadyPngExportPreview\(\)[\s\S]*pngBlob:\s*readyPreview\.blob/u);
  assert.doesNotMatch(markup, /导出预览/u);
  assert.match(
    pageCss,
    /@media \(max-width:\s*1023px\)\s*\{[\s\S]*\.export-live-stage\s*\{[^}]*display:\s*none/u,
  );
  assert.match(
    pageCss,
    /@media \(min-width:\s*1024px\)\s*\{[\s\S]*\.export-mobile-preview\s*\{[^}]*display:\s*none/u,
  );
});

test('mobile sheet states use the shared height variable and disable drag transitions', () => {
  assert.match(pageCss, /\.workspace-sheet\s*\{[\s\S]*height:\s*var\(--sheet-height/u);
  for (const state of ['peek', 'half', 'full']) {
    assert.match(
      pageCss,
      new RegExp(
        `\\.workspace-sheet\\[data-sheet-state='${state}'\\]\\s*\\{[^}]*--sheet-height:`,
        'u',
      ),
    );
  }
  assert.match(
    pageCss,
    /\.workspace-sheet\[data-sheet-dragging='true'\]\s*\{[^}]*transition:\s*none/u,
  );
});

test('editor full sheet covers the workspace without exposing controls behind rounded corners', () => {
  const sheetSnapPointSource = mainSource.match(
    /function sheetSnapPoints\(\): SheetSnapPoints \{[\s\S]*?\n\}/u,
  )?.[0];
  assert.ok(sheetSnapPointSource);
  assert.match(sheetSnapPointSource, /topGap:\s*0/u);
  assert.match(
    pageCss,
    /\.workspace-sheet\[data-sheet-state='full'\]\s*\{[^}]*border-radius:\s*0;/u,
  );
});

test('preview uses one responsive three-state control surface with isolated scrolling and actions', () => {
  assert.match(
    pageCss,
    /\.preview-control-surface\s*\{[\s\S]*position:\s*absolute;[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;/u,
  );
  assert.match(
    pageCss,
    /\.preview-control-surface\s*\{[\s\S]*bottom:\s*var\(--preview-sheet-keyboard-offset\);/u,
  );
  for (const state of ['peek', 'half', 'full']) {
    assert.match(
      pageCss,
      new RegExp(
        `\\.preview-control-surface\\[data-preview-sheet-state='${state}'\\]\\s*\\{[^}]*--preview-sheet-height:`,
        'u',
      ),
    );
  }
  assert.match(
    pageCss,
    /\.preview-control-surface\[data-preview-sheet-dragging='true'\]\s*\{[^}]*transition:\s*none/u,
  );
  assert.match(
    pageCss,
    /\.preview-controls-scroll\s*\{[\s\S]*container-type:\s*inline-size;[\s\S]*overflow:\s*auto;/u,
  );
  assert.match(
    pageCss,
    /\.preview-canvas-column\s*\{[\s\S]*padding:[^;]*var\(--preview-sheet-peek-height\)[^;]*;[\s\S]*overflow:\s*hidden;/u,
  );
  assert.match(
    pageCss,
    /@media \(orientation:\s*landscape\) and \(max-width:\s*1023px\) and \(max-height:\s*500px\)/u,
  );
  const actionDockRule = pageCss.match(/\.preview-action-dock\s*\{([^}]*)\}/u)?.[1] ?? '';
  assert.doesNotMatch(actionDockRule, /position:\s*sticky/u);
  assert.doesNotMatch(actionDockRule, /margin-inline:\s*calc/u);
});

test('preview sheet preserves focus and reachability across breakpoints, keyboards, and flicks', () => {
  assert.match(
    mainSource,
    /crossingDesktopBoundary && previewFocusWasInSettings[\s\S]*previewSheetState = 'half'/u,
  );
  assert.match(
    mainSource,
    /const controlsShouldBeHidden = workspaceLayoutMode !== 'desktop' && nextState === 'peek'[\s\S]*controlsScroll\.hidden = controlsShouldBeHidden/u,
  );
  assert.match(
    pageCss,
    /\.preview-workspace\[data-preview-layout='desktop'\] \.preview-sheet-header\s*\{[^}]*display:\s*none/u,
  );
  assert.doesNotMatch(
    pageCss,
    /\.preview-control-surface\[data-preview-sheet-state='peek'\] \.preview-controls-scroll/u,
  );
  assert.match(mainSource, /--preview-sheet-keyboard-offset'[\s\S]*String\(rawKeyboardHeight\)/u);
  assert.match(mainSource, /Math\.abs\(releaseDeltaY\) > 0\.5[\s\S]*else if \(elapsed > 80\)/u);
});

test('preview comparison and preset cards adapt without global radio width pollution', () => {
  assert.doesNotMatch(
    vaadinThemeCss,
    /vaadin-radio-group\s*>\s*vaadin-radio-button[\s\S]*inline-size:\s*100%/u,
  );
  assert.match(
    vaadinThemeCss,
    /\.compare-switch vaadin-radio-button::part\(radio\)\s*\{[\s\S]*opacity:\s*0;/u,
  );
  assert.match(
    vaadinThemeCss,
    /\.compare-switch::part\(group-field\)\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,/u,
  );
  assert.match(
    vaadinThemeCss,
    /\.compare-switch::part\(label\),[\s\S]*\.compare-switch::part\(error-message\)\s*\{[^}]*display:\s*none;/u,
  );
  assert.match(
    vaadinThemeCss,
    /\.compare-switch::before\s*\{[^}]*content:\s*none;[^}]*display:\s*none;/u,
  );
  assert.match(
    vaadinThemeCss,
    /\.compare-switch vaadin-radio-button\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\);[^}]*align-items:\s*stretch;/u,
  );
  assert.match(
    vaadinThemeCss,
    /\.compare-switch vaadin-radio-button > \[slot='label'\]\s*\{[^}]*block-size:\s*100%;[^}]*place-items:\s*center;/u,
  );
  assert.match(
    vaadinThemeCss,
    /\.compare-switch vaadin-radio-button::before,[\s\S]*\.palette-scope vaadin-radio-button::before\s*\{[^}]*content:\s*none;[^}]*display:\s*none;/u,
  );
  assert.match(
    vaadinThemeCss,
    /\.preset-card > \[slot='label'\]\s*\{[^}]*display:\s*grid;[^}]*block-size:\s*100%;[^}]*place-items:\s*center;/u,
  );
  assert.match(
    vaadinThemeCss,
    /\.preset-cards-four::part\(group-field\)\s*\{[^}]*grid-template-columns:\s*repeat\(2,/u,
  );
  assert.match(
    vaadinThemeCss,
    /@container \(min-width:\s*35rem\)[\s\S]*\.preview-workspace\[data-preview-layout='desktop'\] \.preset-cards-four::part\(group-field\)[\s\S]*grid-template-columns:\s*repeat\(4,/u,
  );
  assert.match(
    pageCss,
    /\.secondary-button\.hold-original-button\s*\{[^}]*min-height:\s*3\.25rem;[^}]*border-radius:\s*var\(--radius-md\);/u,
  );
});

test('preview exposes five local render modes without removing original comparison', () => {
  const preview = sectionMarkup('data-preview-workspace', 'data-pattern-workspace');
  assert.deepEqual(
    [...preview.matchAll(/data-preview-mode="([^"]+)"/gu)].map((match) => match[1]),
    ['pure', 'annotated', 'numbered', 'rounded', 'ring'],
  );
  assert.match(preview, /data-preview-mode-note[^>]*aria-live="polite"/u);
  assert.match(
    pageCss,
    /\.preview-mode-strip\s*\{[^}]*overflow-x:\s*auto;[^}]*white-space:\s*nowrap;/u,
  );
  assert.match(pageCss, /\.preview-mode-button\s*\{[^}]*min-height:\s*2\.75rem;/u);
  assert.match(
    pageCss,
    /\.preview-canvas\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*width:\s*100%;[^}]*height:\s*100%;/u,
  );
  assert.doesNotMatch(pageCss, /value=['"]original['"][^{]*\{[^}]*display:\s*none/u);
  assert.equal(countMatches(preview, /value="original"/g), 1);
});

test('preview mode selection updates the renderer before revealing the pattern', () => {
  assert.match(
    mainSource,
    /setPreviewRenderMode\(createPreviewModeSelection\(button\.dataset\.previewMode\)\)/u,
  );
  const selectionHandler = mainSource.match(/function setPreviewRenderMode\([\s\S]*?\n\}/u)?.[0];
  assert.ok(selectionHandler);
  const compareIndex = selectionHandler.indexOf(
    'previewCompareRadioController.setValue(selection.compareView)',
  );
  const applyIndex = selectionHandler.indexOf(
    'previewView.applyCompareView(selection.compareView)',
  );
  const drawIndex = selectionHandler.indexOf('previewView.setRenderMode(selection.mode)');
  assert.ok(drawIndex >= 0);
  assert.ok(compareIndex > drawIndex);
  assert.ok(applyIndex > compareIndex);
  assert.match(mainSource, /\[data-background-removal-label-short\][\s\S]*compactLabel/u);
  assert.match(mainSource, /\[data-background-removal-label-long\][\s\S]*actionState\.label/u);
  assert.doesNotMatch(mainSource, /action\.textContent\s*=/u);
});

test('preview image actions stay touch-safe while responsive labels and status save canvas space', () => {
  assert.match(
    pageCss,
    /\.preview-image-action\s*\{[^}]*min-width:\s*2\.75rem;[^}]*min-height:\s*2\.75rem;/u,
  );
  assert.match(
    pageCss,
    /\.background-removal-status\s*\{[^}]*display:\s*flex;[^}]*max-inline-size:\s*min\(100%,\s*34rem\);[^}]*justify-self:\s*end;[^}]*overflow-wrap:\s*anywhere;/u,
  );
  assert.doesNotMatch(pageCss, /\[data-background-removal-status\]\s*\{[^}]*flex-basis:\s*100%/u);
  assert.match(
    mainSource,
    /data-background-removal-status-message[\s\S]*messageNode\.textContent = backgroundRemovalStatusMessage[\s\S]*status\.hidden = backgroundRemovalStatusMessage\.length === 0/u,
  );
  assert.match(
    pageCss,
    /@media \(max-width:\s*767px\)[\s\S]*\[data-action-label-long\],[\s\S]*\[data-background-removal-label-long\]\s*\{[^}]*display:\s*none;/u,
  );
  assert.match(
    pageCss,
    /@media \(min-width:\s*768px\)[\s\S]*\[data-action-label-short\],[\s\S]*\[data-background-removal-label-short\]\s*\{[^}]*display:\s*none;/u,
  );
});

test('mobile preview keeps the comparison, canvas, and settings choices visually compact', () => {
  assert.match(
    previewViewSource,
    /canvasSlot\.style\.setProperty\(\s*'--preview-canvas-aspect-ratio',\s*`\$\{String\(project\.grid\.columns\)\} \/ \$\{String\(project\.grid\.rows\)\}`/u,
  );
  assert.match(
    pageCss,
    /@media \(max-width:\s*767px\)[\s\S]*\.preview-canvas-column\s*\{[^}]*grid-template-rows:\s*auto auto auto auto;[^}]*align-content:\s*start;/u,
  );
  assert.match(
    pageCss,
    /@media \(max-width:\s*767px\)[\s\S]*\.preview-canvas-slot\s*\{[^}]*aspect-ratio:\s*var\(--preview-canvas-aspect-ratio,\s*4 \/ 3\);[^}]*max-height:\s*48svh;/u,
  );
  assert.match(
    pageCss,
    /@media \(max-width:\s*767px\)[\s\S]*\.preview-compare-bar\s*\{[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\);/u,
  );
  assert.match(
    pageCss,
    /@media \(max-width:\s*767px\)[\s\S]*\.preview-controls-scroll > \.settings-section\s*\{[^}]*gap:\s*var\(--space-3\);/u,
  );
  assert.doesNotMatch(
    vaadinThemeCss,
    /\.preset-card\[checked\]\s*\{[^}]*box-shadow:\s*inset 0 0 0 1px/u,
  );
});

test('preview and editor reserve visible geometry and expose only valid return actions', () => {
  assert.match(
    pageCss,
    /\.preview-canvas-slot\s*\{[^}]*place-items:\s*center;[^}]*overflow:\s*hidden;/u,
  );
  assert.match(pageCss, /\.preview-status\[data-state='done'\],[\s\S]*clip-path:\s*inset\(50%\)/u);
  assert.match(
    pageCss,
    /\.canvas-workspace\s*\{[^}]*padding-bottom:\s*calc\(var\(--sheet-peek-height\) \+ var\(--sheet-keyboard-offset\)\)/u,
  );
  assert.match(pageCss, /\.workspace-sheet\s*\{[\s\S]*bottom:\s*var\(--sheet-keyboard-offset\);/u);
  assert.match(
    pageCss,
    /\.sheet-handle\s*\{[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\)/u,
  );
  assert.match(
    pageCss,
    /\.completion-actions\s*\{[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\)/u,
  );
  assert.match(mainSource, /canReturnToEditor:\s*previewReturnToEditorAvailable/u);
  const previewEventHandler = mainSource.slice(
    mainSource.indexOf('function handlePreviewCoordinatorEvent'),
    mainSource.indexOf('function confirmPreviewAsEditorBaseline'),
  );
  assert.doesNotMatch(previewEventHandler, /currentProject\s*=/u);
});

test('new controls retain touch targets, visible focus, and status surfaces', () => {
  assert.match(pageCss, /\.secondary-upload\s*\{[^}]*min-height:\s*2\.75rem/u);
  assert.match(
    vaadinThemeCss,
    /vaadin-text-field::part\(input-field\)[\s\S]*min-height:\s*2\.75rem/u,
  );
  assert.match(pageCss, /\.color-filter-status\s*\{[^}]*min-height:/u);
  assert.match(
    vaadinThemeCss,
    /\.palette-scope vaadin-radio-button\[focus-ring\][\s\S]*outline:\s*2px solid var\(--color-focus-ring\)/u,
  );
});

test('rendered controls do not contain duplicate crop attributes or nested buttons', () => {
  const cropHeightInput = markup.match(/<input\b[^>]*data-crop-height[^>]*>/u)?.[0];
  assert.ok(cropHeightInput);
  assert.equal(countMatches(cropHeightInput, /\baria-describedby=/g), 1);

  let buttonDepth = 0;
  for (const token of markup.matchAll(/<\/?button\b[^>]*>/gu)) {
    if (token[0].startsWith('</')) {
      buttonDepth -= 1;
      assert.ok(buttonDepth >= 0, 'encountered a closing button without an opening button');
    } else {
      buttonDepth += 1;
      assert.equal(buttonDepth, 1, 'button elements must not be nested');
    }
  }
  assert.equal(buttonDepth, 0, 'every opening button must have a closing button');
});

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

function sectionMarkup(startHook: string, endHook: string): string {
  const start = markup.indexOf(startHook);
  const end = markup.indexOf(endHook);
  assert.notEqual(start, -1, `missing ${startHook}`);
  assert.notEqual(end, -1, `missing ${endHook}`);
  return markup.slice(start, end);
}

function valuesForRadioGroup(value: string, name: string): string[] {
  return [
    ...value.matchAll(new RegExp(`data-choice-group="${name}"[\\s\\S]*?value="([^"]+)"`, 'gu')),
  ].map((match) => match[1] ?? '');
}
