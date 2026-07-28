import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { renderApp } from '../src/app';

const markup = renderApp();
const pageCss = readFileSync(new URL('../src/styles/page.css', import.meta.url), 'utf8');
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
  assert.match(preview, /data-preview-canvas/u);
  assert.match(preview, /data-preview-summary[^>]*hidden/u);
  assert.match(preview, /data-preview-status[^>]*role="status"[^>]*aria-live="polite"/u);
  assert.match(preview, /data-preview-badge[^>]*hidden/u);
  assert.match(preview, /data-compare-switch/u);
  assert.match(preview, /value="original"[^>]*label="原图"|label="原图"/u);
  assert.match(preview, /label="拼豆"[^>]*checked|checked[^>]*label="拼豆"/u);
  assert.match(preview, /data-hold-original/u);
  assert.match(preview, /按住看原图/u);
  assert.match(preview, /data-preview-original-view[^>]*hidden/u);
  assert.match(preview, /data-crop-canvas/u);
  assert.match(preview, /data-rotate-left/u);
  assert.match(preview, /data-rotate-right/u);
  assert.match(preview, /data-preview-inspector/u);
  assert.match(preview, /data-preview-panel-body/u);
  assert.match(preview, /data-preview-panel-toggle[^>]*aria-expanded="true"/u);
});

test('renderApp uses Vaadin selectors and dialogs without legacy overlay or mobile hosts', () => {
  assert.doesNotMatch(markup, /<select\b/u);
  assert.match(markup, /<vaadin-select\b/u);
  assert.match(markup, /data-available-color-dialog/u);
  assert.match(markup, /data-confirmation-dialog/u);
  assert.match(markup, /data-preview-controls-panel/u);
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
  assert.equal(countMatches(markup, /data-export-template="pure"/g), 2);
  assert.equal(countMatches(markup, /data-export-template="annotated"/g), 2);
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

test('RadioGroups use one checked child default without a static group value', () => {
  const groups = [
    ...markup.matchAll(/<vaadin-radio-group\b([^>]*)>([\s\S]*?)<\/vaadin-radio-group>/gu),
  ];
  assert.equal(groups.length, 11);
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
