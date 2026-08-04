import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createXhsExtraction,
  downloadXhsImages,
  fetchXhsImage,
  XhsImportApiError,
  type XhsImportFetcher,
} from '../src/features/xhs-import/client';
import { deriveXhsSelectionState } from '../src/features/xhs-import/selection';

test('selection enables pattern creation for exactly one image', () => {
  const imageIds = [0, 1, 2];

  assert.deepEqual(deriveXhsSelectionState(imageIds, new Set()), {
    selectedCount: 0,
    allSelected: false,
    canSaveSelected: false,
    canUseAsPattern: false,
    patternDisabledReason: '',
  });
  assert.deepEqual(deriveXhsSelectionState(imageIds, new Set([1])), {
    selectedCount: 1,
    allSelected: false,
    canSaveSelected: true,
    canUseAsPattern: true,
    patternDisabledReason: '',
  });
  assert.deepEqual(deriveXhsSelectionState(imageIds, new Set([0, 2])), {
    selectedCount: 2,
    allSelected: false,
    canSaveSelected: true,
    canUseAsPattern: false,
    patternDisabledReason: '只能选择 1 张图片',
  });
  assert.deepEqual(deriveXhsSelectionState(imageIds, new Set(imageIds)), {
    selectedCount: 3,
    allSelected: true,
    canSaveSelected: true,
    canUseAsPattern: false,
    patternDisabledReason: '只能选择 1 张图片',
  });
});

test('extraction client sends share text and validates the opaque response', async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetcher: XhsImportFetcher = async (input, init) => {
    calls.push({ input, init });
    return new Response(
      JSON.stringify({
        extractionId: '123e4567-e89b-12d3-a456-426614174000',
        images: [
          {
            id: 0,
            previewUrl: '/api/xhs/extractions/123e4567-e89b-12d3-a456-426614174000/images/0',
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const result = await createXhsExtraction('分享文字', undefined, fetcher);

  assert.equal(result.images.length, 1);
  assert.equal(result.images[0]?.id, 0);
  assert.deepEqual(calls, [
    {
      input: '/api/xhs/extractions',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareText: '分享文字' }),
      },
    },
  ]);
});

test('image client returns a named File and preserves structured Chinese errors', async () => {
  const imageFetcher: XhsImportFetcher = async () =>
    new Response(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }), {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg' },
    });

  const file = await fetchXhsImage('extraction', 3, undefined, imageFetcher);
  assert.equal(file.name, 'xiaohongshu-04.jpg');
  assert.equal(file.type, 'image/jpeg');

  const errorFetcher: XhsImportFetcher = async () =>
    new Response(
      JSON.stringify({
        error: { code: 'XHS_EXTRACTION_EXPIRED', message: '图片提取结果已过期。' },
      }),
      { status: 410, headers: { 'Content-Type': 'application/json' } },
    );

  await assert.rejects(
    fetchXhsImage('expired', 0, undefined, errorFetcher),
    (error: unknown) =>
      error instanceof XhsImportApiError &&
      error.status === 410 &&
      error.code === 'XHS_EXTRACTION_EXPIRED' &&
      error.message === '图片提取结果已过期。',
  );
});

test('download client submits selected ids and emits one browser download', async () => {
  const requests: Array<{ input: string; body: string | null }> = [];
  const fetcher: XhsImportFetcher = async (input, init) => {
    requests.push({
      input,
      body: typeof init?.body === 'string' ? init.body : null,
    });
    return new Response(new Blob(['zip-bytes'], { type: 'application/zip' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="xiaohongshu-images.zip"',
      },
    });
  };
  const downloads: Array<{ name: string; size: number }> = [];

  await downloadXhsImages('extraction-id', [2, 0], undefined, fetcher, (blob, fileName) => {
    downloads.push({ name: fileName, size: blob.size });
  });

  assert.deepEqual(requests, [
    {
      input: '/api/xhs/extractions/extraction-id/download',
      body: JSON.stringify({ imageIds: [2, 0] }),
    },
  ]);
  assert.deepEqual(downloads, [{ name: 'xiaohongshu-images.zip', size: 9 }]);
});
