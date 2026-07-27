import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeImageFromObjectUrl,
  decodeImageResourceFromObjectUrl,
} from '../src/features/local-image-input/imageDecoder';

interface ControllableImage {
  readonly element: HTMLImageElement;
  readonly assignedSources: string[];
}

function controllableImage(width: number, height: number): ControllableImage {
  const assignedSources: string[] = [];
  const element = {
    naturalWidth: width,
    naturalHeight: height,
    decoding: 'auto',
    onload: null,
    onerror: null,
    set src(value: string) {
      assignedSources.push(value);
      queueMicrotask(() => {
        element.onload?.(new Event('load'));
      });
    },
  } as unknown as HTMLImageElement;
  return { element, assignedSources };
}

test('resource decoder returns the same decoded image element for later canvas analysis', async () => {
  const controlled = controllableImage(640, 480);

  const result = await decodeImageResourceFromObjectUrl('blob:fixture', () => controlled.element);

  assert.deepEqual({ width: result.width, height: result.height }, { width: 640, height: 480 });
  assert.strictEqual(result.image, controlled.element);
  assert.deepEqual(controlled.assignedSources, ['blob:fixture']);
  assert.equal(controlled.element.onload, null);
  assert.equal(controlled.element.onerror, null);
});

test('dimension-only decoder remains compatible with existing callers', async () => {
  const controlled = controllableImage(29, 48);

  const result = await decodeImageFromObjectUrl('blob:fixture', () => controlled.element);

  assert.deepEqual(result, { width: 29, height: 48 });
});
