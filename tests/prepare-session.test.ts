import assert from 'node:assert/strict';
import test from 'node:test';

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
import type { VaadinRadioGroupController } from '../src/features/vaadin-controls/vaadinControls';

test('project import, replacement, and a new upload keep mode preference synchronized without leaking across flows', () => {
  for (const fixture of [
    { mode: 'photo' as const, task: 'newPattern' as const },
    { mode: 'pixelArt' as const, task: 'newPattern' as const },
    { mode: 'existingChart' as const, task: 'mirrorExistingChart' as const },
  ]) {
    const modePreference = createTestRadioController('auto');
    const controllers = { modePreference };

    const imported = flowFromImportedProject(fixture.mode);
    assert.equal(imported.customerTask, fixture.task);
    syncUploadPrepareControls(controllers, imported);
    if (fixture.task === 'newPattern') {
      assert.equal(modePreference.selectedValue(), fixture.mode);
    } else {
      assert.equal(imported.prepareState, null);
    }

    const reset = resetFlowForReplacement(imported);
    syncUploadPrepareControls(controllers, reset);
    assert.equal(reset.customerTask, fixture.task);
    assert.equal(reset.prepareState, null);
    assert.equal(modePreference.selectedValue(), 'auto');

    const uploaded = beginUploadedImage(reset, 41);
    syncUploadPrepareControls(controllers, uploaded);
    assert.equal(uploaded.customerTask, fixture.task);
    if (fixture.task === 'newPattern') {
      assert.equal(uploaded.prepareState?.preference, 'auto');
      assert.equal(modePreference.selectedValue(), 'auto');
    } else {
      assert.equal(uploaded.prepareState, null);
    }
  }
});

test('late mode recommendations update only automatic sampling and preserve user or project choices', () => {
  const sampling = createTestRadioController('average');
  const supported = ['average', 'nearest'] as const;

  let automatic = createAutomaticSampling('photo', supported);
  syncSamplingControls(sampling, automatic);
  assert.equal(sampling.selectedValue(), 'average');
  automatic = recommendSampling(automatic, 'pixelArt', supported);
  syncSamplingControls(sampling, automatic);
  assert.equal(sampling.selectedValue(), 'nearest');

  let userChoice = createAutomaticSampling('photo', supported);
  userChoice = chooseSampling(userChoice, 'nearest', 'user');
  userChoice = recommendSampling(userChoice, 'photo', supported);
  syncSamplingControls(sampling, userChoice);
  assert.deepEqual(userChoice, { value: 'nearest', source: 'user' });
  assert.equal(sampling.selectedValue(), 'nearest');

  let projectChoice = chooseSampling(automatic, 'average', 'project');
  projectChoice = recommendSampling(projectChoice, 'pixelArt', supported);
  syncSamplingControls(sampling, projectChoice);
  assert.deepEqual(projectChoice, { value: 'average', source: 'project' });
  assert.equal(sampling.selectedValue(), 'average');
});

function createTestRadioController(initialValue: string): VaadinRadioGroupController {
  let value = initialValue;
  return {
    destroy() {},
    selectedValue: () => value,
    setValue(nextValue) {
      value = nextValue;
      return value;
    },
    subscribe: () => () => {},
  };
}
