import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { renderApp } from '../src/app';
import { syncChartDetectionBusyUi } from '../src/features/grid-editor/detectionBusyUi';

test('detection busy state locks result actions while preserving all preview zoom controls', () => {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = renderApp();
  const app = document.querySelector<HTMLElement>('[data-app-shell]');
  const workspace = document.querySelector<HTMLElement>('[data-chart-workspace]');
  const loader = document.querySelector<HTMLElement>('[data-chart-detection-loading]');
  assert.ok(app);
  assert.ok(workspace);
  assert.ok(loader);

  const locked = [
    ...app.querySelectorAll<HTMLButtonElement | HTMLInputElement>('[data-chart-detection-lock]'),
  ];
  const initiallyEnabled = locked.filter((control) => !control.disabled);
  const initiallyDisabled = locked.filter((control) => control.disabled);
  const zoom = [...workspace.querySelectorAll<HTMLButtonElement>('.zoom-controls button')];
  assert.ok(locked.length >= 12);
  assert.equal(zoom.length, 4);

  syncChartDetectionBusyUi(app, true);
  syncChartDetectionBusyUi(app, true);

  assert.equal(workspace.getAttribute('aria-busy'), 'true');
  assert.equal(loader.hidden, false);
  assert.ok(locked.every((control) => control.disabled));
  assert.ok(zoom.every((control) => !control.disabled));

  syncChartDetectionBusyUi(app, false);

  assert.equal(workspace.getAttribute('aria-busy'), 'false');
  assert.equal(loader.hidden, true);
  assert.ok(initiallyEnabled.every((control) => !control.disabled));
  assert.ok(initiallyDisabled.every((control) => control.disabled));
  window.close();
});
