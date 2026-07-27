import assert from 'node:assert/strict';
import test from 'node:test';

import {
  commitActiveOption,
  createUiSelectState,
  moveActiveOption,
  openUiSelect,
  type UiSelectOption,
} from '../src/features/ui-select/state';

const OPTIONS: readonly UiSelectOption[] = [
  { id: 'small', label: '小巧' },
  { id: 'recommended', label: '推荐' },
  { id: 'detailed', label: '细致', disabled: true },
  { id: 'custom', label: '自定义' },
];

test('opening a select starts the temporary active option at the selected option', () => {
  const state = createUiSelectState(OPTIONS, 'recommended');

  assert.deepEqual(openUiSelect(state), {
    open: true,
    selectedIndex: 1,
    activeIndex: 1,
  });
});

test('arrow and boundary navigation moves only the active option and skips disabled options', () => {
  const opened = openUiSelect(createUiSelectState(OPTIONS, 'recommended'));

  const next = moveActiveOption(opened, OPTIONS, 'next');
  assert.equal(next.selectedIndex, 1);
  assert.equal(next.activeIndex, 3);
  assert.equal(moveActiveOption(next, OPTIONS, 'home').activeIndex, 0);
  assert.equal(moveActiveOption(next, OPTIONS, 'end').activeIndex, 3);
});

test('committing the active option changes the selected option and closes the select', () => {
  const opened = openUiSelect(createUiSelectState(OPTIONS, 'small'));
  const active = moveActiveOption(opened, OPTIONS, 'next');

  assert.deepEqual(commitActiveOption(active, OPTIONS), {
    open: false,
    selectedIndex: 1,
    activeIndex: 1,
  });
});

test('a disabled option cannot become active or be committed', () => {
  const opened = openUiSelect(createUiSelectState(OPTIONS, 'recommended'));
  const invalid = { ...opened, activeIndex: 2 };

  assert.equal(moveActiveOption(invalid, OPTIONS, 'next').activeIndex, 3);
  assert.deepEqual(commitActiveOption(invalid, OPTIONS), opened);
});
