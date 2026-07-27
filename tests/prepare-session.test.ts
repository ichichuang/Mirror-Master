import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { renderApp } from '../src/app';
import {
  beginUploadedImage,
  chooseSampling,
  createAutomaticSampling,
  flowFromImportedProject,
  recommendSampling,
  resetFlowForReplacement,
  syncSamplingControls,
  syncUploadPrepareControls,
} from '../src/features/prepare-workspace/prepareSession';

test('project import, replacement, and a new upload keep task radios synchronized without leaking mode preference', () => {
  for (const fixture of [
    { mode: 'photo' as const, task: 'newPattern' as const },
    { mode: 'pixelArt' as const, task: 'newPattern' as const },
    { mode: 'existingChart' as const, task: 'mirrorExistingChart' as const },
  ]) {
    const window = new Window();
    const document = window.document;
    document.body.innerHTML = renderApp();

    const imported = flowFromImportedProject(fixture.mode);
    syncUploadPrepareControls(document, imported);
    assert.equal(checkedValue(document, 'customer-task'), fixture.task);
    if (fixture.task === 'newPattern') {
      assert.equal(checkedValue(document, 'mode-preference'), fixture.mode);
    }

    const reset = resetFlowForReplacement(imported);
    syncUploadPrepareControls(document, reset);
    assert.equal(checkedValue(document, 'customer-task'), fixture.task);
    assert.equal(checkedValue(document, 'mode-preference'), 'auto');

    const uploaded = beginUploadedImage(reset, 41);
    syncUploadPrepareControls(document, uploaded);
    assert.equal(checkedValue(document, 'customer-task'), fixture.task);
    if (fixture.task === 'newPattern') {
      assert.equal(uploaded.prepareState?.preference, 'auto');
      assert.equal(checkedValue(document, 'mode-preference'), 'auto');
    } else {
      assert.equal(uploaded.prepareState, null);
    }

    window.close();
  }
});

test('late mode recommendations update only automatic sampling and preserve user or project choices', () => {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = renderApp();
  const supported = ['average', 'nearest'] as const;

  let automatic = createAutomaticSampling('photo', supported);
  syncSamplingControls(document, automatic);
  assert.equal(checkedValue(document, 'sampling'), 'average');
  automatic = recommendSampling(automatic, 'pixelArt', supported);
  syncSamplingControls(document, automatic);
  assert.equal(checkedValue(document, 'sampling'), 'nearest');

  let userChoice = createAutomaticSampling('photo', supported);
  userChoice = chooseSampling(userChoice, 'nearest', 'user');
  userChoice = recommendSampling(userChoice, 'photo', supported);
  syncSamplingControls(document, userChoice);
  assert.deepEqual(userChoice, { value: 'nearest', source: 'user' });
  assert.equal(checkedValue(document, 'sampling'), 'nearest');

  let projectChoice = chooseSampling(automatic, 'average', 'project');
  projectChoice = recommendSampling(projectChoice, 'pixelArt', supported);
  syncSamplingControls(document, projectChoice);
  assert.deepEqual(projectChoice, { value: 'average', source: 'project' });
  assert.equal(checkedValue(document, 'sampling'), 'average');

  window.close();
});

function checkedValue(root: ParentNode, name: string): string | undefined {
  return root.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value;
}
