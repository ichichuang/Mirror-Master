import assert from 'node:assert/strict';
import test from 'node:test';

import { createPreviewSettingsIntroductionSession } from '../src/features/preview-workspace/previewSettingsIntroduction';

const COMPLETION_STATUS = '已更新：48 × 48 颗，24 色';
const SETTINGS_GUIDANCE = '设置已展开，可调整图案大小、颜色、效果和品牌。';

test('first mobile preview success expands peek settings and combines one announcement', () => {
  const session = createPreviewSettingsIntroductionSession();

  assert.deepEqual(
    session.onPreviewSucceeded({
      mobile: true,
      sheetState: 'peek',
      completionStatus: COMPLETION_STATUS,
    }),
    {
      expandToHalf: true,
      announcement: `${COMPLETION_STATUS}。${SETTINGS_GUIDANCE}`,
    },
  );
});

test('repeated mobile preview success leaves the sheet and announcement unchanged', () => {
  const session = createPreviewSettingsIntroductionSession();
  session.onPreviewSucceeded({
    mobile: true,
    sheetState: 'peek',
    completionStatus: COMPLETION_STATUS,
  });

  assert.deepEqual(
    session.onPreviewSucceeded({
      mobile: true,
      sheetState: 'peek',
      completionStatus: COMPLETION_STATUS,
    }),
    { expandToHalf: false, announcement: COMPLETION_STATUS },
  );
});

test('desktop preview success preserves the later mobile introduction opportunity', () => {
  const session = createPreviewSettingsIntroductionSession();

  assert.deepEqual(
    session.onPreviewSucceeded({
      mobile: false,
      sheetState: 'peek',
      completionStatus: COMPLETION_STATUS,
    }),
    { expandToHalf: false, announcement: COMPLETION_STATUS },
  );
  assert.equal(
    session.onPreviewSucceeded({
      mobile: true,
      sheetState: 'peek',
      completionStatus: COMPLETION_STATUS,
    }).expandToHalf,
    true,
  );
});

test('explicit sheet interaction suppresses automatic introduction', () => {
  const session = createPreviewSettingsIntroductionSession();
  session.recordUserInteraction();

  assert.deepEqual(
    session.onPreviewSucceeded({
      mobile: true,
      sheetState: 'peek',
      completionStatus: COMPLETION_STATUS,
    }),
    { expandToHalf: false, announcement: COMPLETION_STATUS },
  );
});

test('an already-open mobile sheet consumes the introduction without overriding its state', () => {
  const session = createPreviewSettingsIntroductionSession();

  assert.deepEqual(
    session.onPreviewSucceeded({
      mobile: true,
      sheetState: 'full',
      completionStatus: COMPLETION_STATUS,
    }),
    { expandToHalf: false, announcement: COMPLETION_STATUS },
  );
  assert.equal(
    session.onPreviewSucceeded({
      mobile: true,
      sheetState: 'peek',
      completionStatus: COMPLETION_STATUS,
    }).expandToHalf,
    false,
  );
});

test('a fresh page session can introduce mobile preview settings again', () => {
  const firstPage = createPreviewSettingsIntroductionSession();
  firstPage.recordUserInteraction();

  const refreshedPage = createPreviewSettingsIntroductionSession();

  assert.equal(
    refreshedPage.onPreviewSucceeded({
      mobile: true,
      sheetState: 'peek',
      completionStatus: COMPLETION_STATUS,
    }).expandToHalf,
    true,
  );
});
