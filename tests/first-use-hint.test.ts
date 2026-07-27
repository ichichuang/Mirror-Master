import assert from 'node:assert/strict';
import test from 'node:test';

import { createFirstUseHintSession } from '../src/features/pattern-editor/firstUseHint';

test('first-use hint appears only on the first editor entry in one page session', () => {
  const session = createFirstUseHintSession();

  assert.equal(session.enterEditor(), true);
  assert.equal(session.visible, true);

  session.dismiss();

  assert.equal(session.visible, false);
  assert.equal(session.enterEditor(), false);
  assert.equal(session.visible, false);
});

test('a successful draw dismisses the visible first-use hint', () => {
  const session = createFirstUseHintSession();
  session.enterEditor();

  assert.equal(session.recordSuccessfulGesture('draw'), true);
  assert.equal(session.visible, false);
  assert.equal(session.recordSuccessfulGesture('draw'), false);
});

test('a successful two-finger gesture dismisses the visible first-use hint', () => {
  const session = createFirstUseHintSession();
  session.enterEditor();

  assert.equal(session.recordSuccessfulGesture('pinch'), true);
  assert.equal(session.visible, false);
});

test('a new in-memory session starts empty without persistent storage state', () => {
  const firstPage = createFirstUseHintSession();
  firstPage.enterEditor();
  firstPage.dismiss();

  const refreshedPage = createFirstUseHintSession();

  assert.equal(refreshedPage.enterEditor(), true);
  assert.equal(refreshedPage.visible, true);
});
