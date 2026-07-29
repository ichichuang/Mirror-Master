import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseBeadProject, type BeadProject } from '../src/domain/project';
import { configurationForPngExportPreset } from '../src/features/export-completion/pngExportConfiguration';
import {
  createPngExportPreviewCoordinator,
  type PngExportPreviewInput,
  type PngExportPreviewState,
} from '../src/features/export-completion/pngExportPreviewCoordinator';

const PROJECT_FIXTURE_URL = new URL('./fixtures/export-parity-project.json', import.meta.url);

function projectFixture(): BeadProject {
  return parseBeadProject(JSON.parse(readFileSync(PROJECT_FIXTURE_URL, 'utf8')));
}

test('rapid updates publish only the latest encoded PNG result', async () => {
  const frames: Array<() => void> = [];
  const encodes: Array<ReturnType<typeof deferred<Blob>>> = [];
  const states: PngExportPreviewState[] = [];
  const coordinator = createPngExportPreviewCoordinator({
    createCanvas: () => ({ width: 1, height: 1 }) as HTMLCanvasElement,
    render(canvas, input) {
      canvas.width = input.configuration.includeGrid ? 202 : 101;
      canvas.height = 50;
    },
    encode() {
      const pending = deferred<Blob>();
      encodes.push(pending);
      return pending.promise;
    },
    scheduleFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    cancelFrame() {},
    onStateChange(state) {
      states.push(state);
    },
  });
  const first = input(false);
  const second = input(true);

  coordinator.schedule(first);
  frames.shift()?.();
  coordinator.schedule(second);
  frames.shift()?.();
  assert.equal(encodes.length, 2);

  encodes[1]?.resolve(new Blob(['new'], { type: 'image/png' }));
  await Promise.resolve();
  encodes[0]?.resolve(new Blob(['old'], { type: 'image/png' }));
  await Promise.resolve();

  assert.equal(coordinator.result()?.canvas.width, 202);
  assert.equal(coordinator.result()?.revision, second.project.revision);
  assert.deepEqual(await coordinator.result()?.blob.text(), 'new');
  assert.equal(states.filter((state) => state.phase === 'ready').length, 1);
});

test('invalidation clears a downloadable result and suppresses late encoding', async () => {
  const frames: Array<() => void> = [];
  const pending = deferred<Blob>();
  const coordinator = createPngExportPreviewCoordinator({
    createCanvas: () => ({ width: 1, height: 1 }) as HTMLCanvasElement,
    render() {},
    encode: () => pending.promise,
    scheduleFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    cancelFrame() {},
  });

  coordinator.schedule(input(false));
  frames.shift()?.();
  coordinator.invalidate();
  pending.resolve(new Blob(['late'], { type: 'image/png' }));
  await Promise.resolve();

  assert.equal(coordinator.result(), null);
  assert.equal(coordinator.state().phase, 'idle');
});

function input(includeGrid: boolean): PngExportPreviewInput {
  return {
    project: projectFixture(),
    configuration: {
      ...configurationForPngExportPreset('pure'),
      includeGrid,
    },
    colorHexById: new Map(),
    colorCodeById: new Map(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
