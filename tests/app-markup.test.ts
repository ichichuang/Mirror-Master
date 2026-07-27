import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { renderApp } from '../src/app';

const markup = renderApp();
const pageCss = readFileSync(new URL('../src/styles/page.css', import.meta.url), 'utf8');

test('upload starts with exactly two customer tasks and keeps project JSON secondary', () => {
  assert.match(markup, /id="image-file-input"[\s\S]*data-file-input/u);
  assert.match(markup, /id="project-file-input"[\s\S]*accept="application\/json,\.json"/u);
  assert.match(markup, /data-project-file-input/u);
  assert.match(markup, /data-project-file-status/u);
  assert.match(markup, /data-upload-constraints/u);

  const upload = sectionMarkup('data-upload-workspace', 'data-prepare-workspace');
  assert.deepEqual(
    [...upload.matchAll(/name="customer-task"[\s\S]*?value="([^"]+)"/gu)].map((match) => match[1]),
    ['newPattern', 'mirrorExistingChart'],
  );
  assert.equal(countMatches(upload, /name="customer-task"[^>]*checked/g), 1);
  assert.match(upload, /制作新图纸/u);
  assert.match(upload, /镜像已有图纸/u);
  assert.doesNotMatch(upload, /value="photo"/u);
  assert.doesNotMatch(upload, /value="pixelArt"/u);
});

test('prepare workspace keeps one collapsed professional surface for every expert control', () => {
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

  const prepare = sectionMarkup('data-prepare-workspace', 'data-pattern-workspace');
  const professional = prepare.match(
    /<details\b[^>]*data-professional-settings[^>]*>([\s\S]*?)<\/details>/u,
  )?.[0];
  assert.ok(professional);
  assert.doesNotMatch(professional.match(/^<details\b[^>]*>/u)?.[0] ?? '', /\bopen\b/u);
  assert.equal(countMatches(prepare, /<details\b/g), 1);
  for (const selector of [
    'data-mode-preference="auto"',
    'data-mode-preference="photo"',
    'data-mode-preference="pixelArt"',
    'data-board-preset',
    'data-custom-board-columns',
    'data-custom-board-rows',
    'data-maximum-colors',
    'data-available-color-grid',
    'data-available-color-search',
    'data-available-color-series',
    'name="sampling"',
    'data-dithering',
    'data-alpha-threshold',
    'data-bead-pitch',
    'data-mode-recommendation',
  ]) {
    assert.match(professional, new RegExp(selector, 'u'));
  }
});

test('prepare default surface exposes approved customer presets and one generation action', () => {
  const prepare = sectionMarkup('data-prepare-workspace', 'data-pattern-workspace');
  assert.deepEqual(valuesForRadioGroup(prepare, 'pattern-size-preset'), ['29', '48', '72']);
  assert.deepEqual(valuesForRadioGroup(prepare, 'bead-size-preset'), ['5', '2.6', 'custom']);
  assert.deepEqual(valuesForRadioGroup(prepare, 'color-count-preset'), ['12', '24', '48']);
  assert.deepEqual(valuesForRadioGroup(prepare, 'processing-preset'), ['easy', 'gradient']);
  assert.equal(countMatches(prepare, /data-generate-pattern/g), 1);
  assert.match(prepare, /data-physical-size/u);
  assert.match(prepare, /data-palette-id/u);
});

test('renderApp has no native select and provides desktop overlay plus an application-level mobile host', () => {
  assert.doesNotMatch(markup, /<select\b/u);
  assert.match(markup, /data-overlay-root/u);
  assert.match(markup, /data-prepare-settings-panel/u);
  assert.match(markup, /data-mobile-stage-host/u);
  assert.doesNotMatch(markup, /data-prepare-picker-surface/u);
  assert.doesNotMatch(markup, /data-mobile-picker-panel/u);
  assert.equal(countMatches(markup, /data-board-preset/g), 1);
  assert.equal(countMatches(markup, /data-palette-id/g), 1);
  assert.equal(countMatches(markup, /data-available-color-series/g), 1);
  assert.equal(countMatches(markup, /data-dithering/g), 1);
  assert.equal(countMatches(markup, /data-color-series-filter/g), 2);
  assert.match(pageCss, /\.app-overlay-root\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0/u);
  assert.match(pageCss, /\.mobile-stage-host\s*\{[^}]*position:\s*fixed/u);
});

test('short prepare choices stay visible and mobile available colors use a dedicated page', () => {
  assert.match(markup, /data-open-available-colors/u);
  assert.deepEqual(valuesForRadioGroup(markup, 'prepare-palette'), ['default', 'mard']);
  assert.deepEqual(valuesForRadioGroup(markup, 'prepare-board'), [
    'standardSquare',
    'smallSquare',
    'custom',
  ]);
  assert.deepEqual(valuesForRadioGroup(markup, 'prepare-dithering'), ['none', 'floydSteinberg']);
  assert.match(pageCss, /\.available-color-mobile-trigger\s*\{[^}]*display:\s*none[^}]*\}/u);
  assert.doesNotMatch(pageCss, /\.mobile-picker\b/u);

  const mediaStart = pageCss.indexOf('@media (min-width: 320px) and (max-width: 767px)');
  assert.notEqual(mediaStart, -1);
  const nextMedia = pageCss.indexOf('@media ', mediaStart + 1);
  const mobileCss = pageCss.slice(mediaStart, nextMedia === -1 ? undefined : nextMedia);
  assert.match(
    mobileCss,
    /\.available-color-mobile-trigger\s*\{[^}]*display:\s*(?:inline-)?flex[^}]*\}/u,
  );
  assert.match(
    mobileCss,
    /\[data-prepare-settings-panel\]\s+\.available-color-filter\s*\{[^}]*display:\s*none[^}]*\}/u,
  );
  assert.match(
    pageCss,
    /\.available-color-mobile-page\s*\{[^}]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/u,
  );
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
  assert.equal(countMatches(markup, /data-color-filter="used"/g), 2);
  assert.equal(countMatches(markup, /data-color-filter="recent"/g), 2);
  assert.equal(countMatches(markup, /data-color-series-filter/g), 2);
  assert.equal(countMatches(markup, /role="search"/g), 3);
  assert.equal(countMatches(markup, /data-export-template="pure"/g), 2);
  assert.equal(countMatches(markup, /data-export-template="annotated"/g), 2);
  assert.match(markup, /data-return-prepare/u);
  assert.match(markup, /data-regenerate-pattern/u);
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
    pageCss,
    /\.palette-controls input\[type='search'\]\s*\{[^}]*min-height:\s*2\.75rem/u,
  );
  assert.match(pageCss, /\.color-filter-status\s*\{[^}]*min-height:/u);
  assert.match(
    pageCss,
    /\.palette-scope input:focus-visible \+ span[\s\S]*outline:\s*2px solid var\(--color-focus\)/u,
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
  return [...value.matchAll(new RegExp(`name="${name}"[\\s\\S]*?value="([^"]+)"`, 'gu'))].map(
    (match) => match[1] ?? '',
  );
}
