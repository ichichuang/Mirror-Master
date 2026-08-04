import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXPORT_TASKS,
  beginExport,
  closeExportCompletion,
  completeExport,
  createExportCompletionState,
  exportDownloadActionLabel,
  failExport,
  openExportCompletion,
  parseExportPngTemplate,
  selectExportTask,
  setExportPngConfiguration,
  setExportPngTemplate,
} from '../src/features/export-completion/exportState';
import { configurationForPngExportPreset } from '../src/features/export-completion/pngExportConfiguration';

test('every export task exposes a concrete download action', () => {
  assert.deepEqual(
    EXPORT_TASKS.map(({ id }) => exportDownloadActionLabel(id)),
    ['下载分享图片', '下载打印制作', '下载材料清单', '下载项目文件'],
  );
});

test('completion exposes exactly four customer tasks with four PNG templates only for sharing', () => {
  assert.deepEqual(
    EXPORT_TASKS.map(({ id, label, format }) => ({ id, label, format })),
    [
      { id: 'shareImage', label: '分享图片', format: 'png' },
      { id: 'printMaking', label: '打印制作', format: 'pdf' },
      { id: 'materialsList', label: '材料清单', format: 'csv' },
      { id: 'saveProject', label: '保存项目', format: 'json' },
    ],
  );
  assert.deepEqual(EXPORT_TASKS[0]?.templates, [
    { id: 'pure', label: '纯图案' },
    { id: 'annotated', label: '带标注' },
    { id: 'numbered', label: '色号图纸' },
    { id: 'rounded', label: '圆角方格' },
  ]);
  assert.equal(EXPORT_TASKS[1]?.templates, undefined);
  assert.equal(EXPORT_TASKS[2]?.templates, undefined);
  assert.equal(EXPORT_TASKS[3]?.templates, undefined);
});

test('export template parsing preserves every explicit PNG presentation choice', () => {
  assert.equal(parseExportPngTemplate('pure'), 'pure');
  assert.equal(parseExportPngTemplate('annotated'), 'annotated');
  assert.equal(parseExportPngTemplate('numbered'), 'numbered');
  assert.equal(parseExportPngTemplate('rounded'), 'rounded');
  assert.equal(parseExportPngTemplate('unexpected'), 'annotated');
});

test('open and close retain the prior panel, sheet height, focus target, and scroll position', () => {
  const initial = createExportCompletionState();
  const returnContext = {
    panel: 'materials',
    sheetState: 'half' as const,
    triggerKey: 'mobile-export',
    scrollTop: 128,
  };

  const opened = openExportCompletion(initial, returnContext);
  assert.equal(opened.phase, 'open');
  assert.deepEqual(opened.returnContext, returnContext);
  assert.equal(opened.selectedTask, 'shareImage');

  const closed = closeExportCompletion(opened);
  assert.equal(closed.phase, 'closed');
  assert.deepEqual(closed.returnContext, returnContext);
  assert.deepEqual(closed.status, { phase: 'idle' });
});

test('completion state owns one immutable composable PNG configuration', () => {
  const initial = createExportCompletionState();
  assert.deepEqual(initial.pngConfiguration, configurationForPngExportPreset('annotated'));

  const rounded = setExportPngConfiguration(initial, configurationForPngExportPreset('rounded'));
  assert.deepEqual(rounded.pngConfiguration, configurationForPngExportPreset('rounded'));
  assert.equal(rounded.status.phase, 'idle');
  assert.notEqual(rounded, initial);
});

test('task and PNG template changes are explicit and a non-PNG task cannot retain template UI state', () => {
  const opened = openExportCompletion(createExportCompletionState(), {
    panel: 'tools',
    sheetState: 'peek',
    triggerKey: 'desktop-export',
    scrollTop: 0,
  });
  const pure = setExportPngTemplate(opened, 'pure');
  assert.equal(pure.pngTemplate, 'pure');

  const pdf = selectExportTask(pure, 'printMaking');
  assert.equal(pdf.selectedTask, 'printMaking');
  assert.equal(pdf.pngTemplate, 'pure');
  assert.equal(EXPORT_TASKS.find((task) => task.id === pdf.selectedTask)?.templates, undefined);
});

test('only the current request token can complete or fail the visible export status', () => {
  const opened = openExportCompletion(createExportCompletionState(), {
    panel: 'settings',
    sheetState: 'full',
    triggerKey: 'desktop-export',
    scrollTop: 12,
  });
  const first = beginExport(opened, 7, 'shareImage');
  const second = beginExport(first, 8, 'materialsList');

  assert.equal(completeExport(second, 7, '旧文件.png'), second);
  assert.equal(failExport(second, 7, '旧请求失败。'), second);

  const completed = completeExport(second, 8, '6个造物社-材料清单-20260726.csv');
  assert.deepEqual(completed.status, {
    phase: 'success',
    token: 8,
    task: 'materialsList',
    fileName: '6个造物社-材料清单-20260726.csv',
  });
});
