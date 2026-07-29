import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  calculateStatistics,
  parseBeadProject,
  withProjectCells,
  type BeadProject,
} from '../src/domain/project';
import { createVerifiedMatrixMirror } from '../src/features/pattern-editor/mirrorCommand';

const PROJECT_FIXTURE_URL = new URL('./fixtures/export-parity-project.json', import.meta.url);

function readProject(): BeadProject {
  return parseBeadProject(JSON.parse(readFileSync(PROJECT_FIXTURE_URL, 'utf8')));
}

test('verified horizontal and vertical mirrors preserve every material count', () => {
  const project = readProject();
  const expectedCounts = calculateStatistics(project.cells).perColorCounts;

  for (const axis of ['horizontal', 'vertical'] as const) {
    const result = createVerifiedMatrixMirror(project, axis);

    assert.equal(result.after.totalCellCount, result.before.totalCellCount);
    assert.equal(result.after.nonEmptyBeadCount, result.before.nonEmptyBeadCount);
    assert.equal(result.after.blankCount, result.before.blankCount);
    assert.equal(result.after.usedColorCount, result.before.usedColorCount);
    assert.deepEqual(calculateStatistics(result.cells).perColorCounts, expectedCounts);
  }
});

test('the same verified mirror twice restores every cell', () => {
  const project = readProject();

  for (const axis of ['horizontal', 'vertical'] as const) {
    const once = createVerifiedMatrixMirror(project, axis);
    const twice = createVerifiedMatrixMirror(
      withProjectCells(project, once.cells, project.updatedAt, project.revision + 1),
      axis,
    );

    assert.deepEqual(twice.cells, project.cells);
  }
});
