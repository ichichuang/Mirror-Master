import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { renderApp } from '../src/app';

const markup = renderApp();
const pageCss = readFileSync(new URL('../src/styles/page.css', import.meta.url), 'utf8');

test('upload workspace exposes separate image and project JSON inputs', () => {
  assert.match(markup, /id="image-file-input"[\s\S]*data-file-input/u);
  assert.match(markup, /id="project-file-input"[\s\S]*accept="application\/json,\.json"/u);
  assert.match(markup, /data-project-file-input/u);
  assert.match(markup, /data-project-file-status/u);
  assert.match(markup, /data-upload-constraints/u);
});

test('prepare workspace exposes custom board and numeric crop controls', () => {
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
});

test('editor markup provides canvas fit and actual-size hooks', () => {
  assert.match(markup, /data-canvas-zoom-fit/u);
  assert.match(markup, /data-canvas-zoom-actual/u);
});

test('editor markup provides bounded row and column jump controls', () => {
  assert.match(markup, /data-canvas-jump-form/u);
  assert.match(markup, /data-canvas-jump-row[^>]*min="1"[^>]*max="300"/u);
  assert.match(markup, /data-canvas-jump-column[^>]*min="1"[^>]*max="300"/u);
  assert.match(markup, /data-canvas-jump-submit/u);
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

test('editor exposes palette filters, annotated export, and flow action hooks', () => {
  assert.equal(countMatches(markup, /data-color-search/g), 2);
  assert.equal(countMatches(markup, /data-color-filter="used"/g), 2);
  assert.equal(countMatches(markup, /data-color-filter="recent"/g), 2);
  assert.equal(countMatches(markup, /data-color-series-filter/g), 2);
  assert.equal(countMatches(markup, /role="search"/g), 3);
  assert.match(markup, /data-export-template="pure"/u);
  assert.match(markup, /data-export-template="annotated"/u);
  assert.match(markup, /data-return-prepare/u);
  assert.match(markup, /data-regenerate-pattern/u);
  assert.match(markup, /data-return-editor/u);
  assert.match(markup, /data-selection-action="move"/u);
  assert.match(markup, /data-selection-action="copy"/u);
  assert.match(markup, /data-selection-action="clear"/u);
  assert.match(
    markup,
    /class="canvas-toolbar-group selection-actions"[^>]*role="group"[^>]*data-selection-actions/u,
  );
  assert.match(markup, /data-selection-action="move"[\s\S]*aria-label="选区向右移动一格"/u);
  assert.match(markup, /data-selection-action="copy"[\s\S]*aria-label="选区向右复制一格"/u);
});

test('export chooser is a labelled modal dialog', () => {
  const dialog = markup.match(/<div\b[^>]*data-export-popover[^>]*>/u)?.[0];
  assert.ok(dialog);
  assert.match(dialog, /role="dialog"/u);
  assert.match(dialog, /aria-modal="true"/u);
  assert.match(dialog, /aria-labelledby="export-dialog-title"/u);
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
