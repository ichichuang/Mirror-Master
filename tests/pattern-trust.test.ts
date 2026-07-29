import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseBeadProject, type BeadProject } from '../src/domain/project';
import {
  createPatternTrustSummary,
  formatPatternTrustSummary,
  type PatternTrustSummary,
} from '../src/features/pattern-trust/patternTrust';

const PROJECT_FIXTURE_URL = new URL('./fixtures/export-parity-project.json', import.meta.url);

function readProject(): BeadProject {
  return parseBeadProject(JSON.parse(readFileSync(PROJECT_FIXTURE_URL, 'utf8')));
}

test('trust summary derives every count from one project matrix', () => {
  assert.deepEqual(createPatternTrustSummary(readProject()), {
    rows: 2,
    columns: 3,
    totalCellCount: 6,
    nonEmptyBeadCount: 4,
    blankCount: 2,
    usedColorCount: 3,
    perColorCountSum: 4,
    isValid: true,
  });
});

test('trust copy distinguishes full and transparent patterns', () => {
  const full: PatternTrustSummary = {
    rows: 21,
    columns: 20,
    totalCellCount: 420,
    nonEmptyBeadCount: 420,
    blankCount: 0,
    usedColorCount: 8,
    perColorCountSum: 420,
    isValid: true,
  };
  const transparent: PatternTrustSummary = {
    ...full,
    nonEmptyBeadCount: 356,
    blankCount: 64,
    perColorCountSum: 356,
  };

  assert.deepEqual(formatPatternTrustSummary(full), {
    primary: '20 × 21 格 · 420 颗豆 · 8 种颜色',
    verification: '图纸统计校验通过',
  });
  assert.deepEqual(formatPatternTrustSummary(transparent), {
    primary: '总格数 420 · 实际用豆 356 · 空白 64 · 8 种颜色',
    verification: '图纸统计校验通过',
  });
});

test('trust summary rejects a matrix whose shape differs from the project grid', () => {
  const project = readProject();
  const malformed = {
    ...project,
    grid: { ...project.grid, rows: 3 },
  } as BeadProject;

  assert.throws(() => createPatternTrustSummary(malformed), /矩阵/u);
});
