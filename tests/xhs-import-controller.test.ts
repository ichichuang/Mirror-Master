import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createXhsImportController } from '../src/features/xhs-import/controller';
import { renderXhsImportWorkspace } from '../src/features/xhs-import/xhsImportWorkspace';

const EXTRACTION = {
  extractionId: '123e4567-e89b-12d3-a456-426614174000',
  images: [
    {
      id: 0,
      previewUrl: '/api/xhs/extractions/123e4567-e89b-12d3-a456-426614174000/images/0',
    },
    {
      id: 1,
      previewUrl: '/api/xhs/extractions/123e4567-e89b-12d3-a456-426614174000/images/1',
    },
  ],
} as const;

test('clipboard failure keeps manual paste available and focuses the input', async () => {
  const window = new Window();
  window.document.body.innerHTML = renderXhsImportWorkspace();
  const root = required<HTMLElement>(window.document, '[data-xhs-import-workspace]');
  const input = required<HTMLTextAreaElement>(root, '[data-xhs-share-text]');
  const status = required<HTMLElement>(root, '[data-xhs-import-status]');
  const controller = createXhsImportController({
    root,
    clipboard: { readText: async () => Promise.reject(new Error('denied')) },
    onBack() {},
    async onUseImage() {},
  });

  controller.open();
  required<HTMLButtonElement>(root, '[data-xhs-read-clipboard]').click();
  await settle();

  assert.equal(input === window.document.activeElement, true);
  assert.equal(status.textContent, '无法读取剪贴板，请手动粘贴链接。');
  assert.equal(input.disabled, false);
  controller.destroy();
  await window.happyDOM.close();
});

test('extracted images enforce single-pattern selection and save the requested ids', async () => {
  const window = new Window();
  window.document.body.innerHTML = renderXhsImportWorkspace();
  const root = required<HTMLElement>(window.document, '[data-xhs-import-workspace]');
  const downloads: number[][] = [];
  const usedFiles: File[] = [];
  const controller = createXhsImportController({
    root,
    clipboard: { readText: async () => '分享链接' },
    createExtraction: async () => EXTRACTION,
    fetchImage: async (_extractionId, imageId) =>
      new File(['image'], `xiaohongshu-${String(imageId + 1).padStart(2, '0')}.jpg`, {
        type: 'image/jpeg',
      }),
    downloadImages: async (_extractionId, imageIds) => {
      downloads.push([...imageIds]);
    },
    onBack() {},
    async onUseImage(file) {
      usedFiles.push(file);
    },
  });

  controller.open();
  const input = required<HTMLTextAreaElement>(root, '[data-xhs-share-text]');
  input.value = '分享链接';
  required<HTMLFormElement>(root, '[data-xhs-import-form]').dispatchEvent(
    new window.Event('submit', { bubbles: true, cancelable: true }),
  );
  await settle();

  const checkboxes = [...root.querySelectorAll<HTMLInputElement>('[data-xhs-image-checkbox]')];
  const saveSelected = required<HTMLButtonElement>(root, '[data-xhs-save-selected]');
  const saveAll = required<HTMLButtonElement>(root, '[data-xhs-save-all]');
  const useAsPattern = required<HTMLButtonElement>(root, '[data-xhs-use-as-pattern]');
  const reason = required<HTMLElement>(root, '[data-xhs-pattern-disabled-reason]');
  assert.equal(checkboxes.length, 2);
  assert.equal(saveSelected.disabled, true);
  assert.equal(useAsPattern.disabled, true);
  assert.equal(saveAll.disabled, false);

  checkboxes[0]!.checked = true;
  checkboxes[0]!.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(saveSelected.disabled, false);
  assert.equal(useAsPattern.disabled, false);
  useAsPattern.click();
  await settle();
  assert.equal(usedFiles[0]?.name, 'xiaohongshu-01.jpg');

  checkboxes[1]!.checked = true;
  checkboxes[1]!.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(useAsPattern.disabled, true);
  assert.equal(reason.textContent, '只能选择 1 张图片');
  saveSelected.click();
  await settle();
  saveAll.click();
  await settle();
  assert.deepEqual(downloads, [
    [0, 1],
    [0, 1],
  ]);

  controller.destroy();
  await window.happyDOM.close();
});

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  assert.ok(element, `missing ${selector}`);
  return element;
}
