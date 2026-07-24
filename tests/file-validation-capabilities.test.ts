import assert from 'node:assert/strict';
import test from 'node:test';

import { validateSingleImageFile } from '../src/features/local-image-input/fileValidation';

const pngOnlyLimits = {
  mimeTypes: ['image/png'] as const,
  maximumBytes: 3,
};

test('image validation uses the active capabilities MIME and byte limits', () => {
  const unsupported = validateSingleImageFile(
    [new File(['ok'], 'sample.jpg', { type: 'image/jpeg' })],
    pngOnlyLimits,
  );
  assert.equal(unsupported.ok, false);

  const oversized = validateSingleImageFile(
    [new File(['four'], 'sample.png', { type: 'image/png' })],
    pngOnlyLimits,
  );
  assert.equal(oversized.ok, false);
  if (!oversized.ok) {
    assert.match(oversized.message, /3 B/u);
  }

  const accepted = validateSingleImageFile(
    [new File(['ok'], 'sample.png', { type: 'image/png' })],
    pngOnlyLimits,
  );
  assert.equal(accepted.ok, true);
});
