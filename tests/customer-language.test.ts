import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { exportProjectCsv, exportProjectJson } from '../src/domain/export';
import { calculateStatistics, parseBeadProject } from '../src/domain/project';

const PROJECT_FIXTURE_URL = new URL('./fixtures/export-parity-project.json', import.meta.url);
const CSV_FIXTURE_URL = new URL('./fixtures/export-parity.csv', import.meta.url);

function readGoldenProject() {
  return parseBeadProject(JSON.parse(readFileSync(PROJECT_FIXTURE_URL, 'utf8')));
}

test('customer CSV matches the shared UTF-8 BOM and CRLF golden without internal metadata', () => {
  const project = readGoldenProject();
  const actual = exportProjectCsv(project);
  const expected = readFileSync(CSV_FIXTURE_URL, 'utf8');

  assert.equal(actual, expected);
  assert.equal(actual.codePointAt(0), 0xfeff);
  assert.equal(actual.replaceAll('\r\n', '').includes('\n'), false);
  assert.match(actual, /项目摘要\r\n产品,6个造物社/u);
  assert.match(actual, /行,列,类型,颜色标识,色板,系列,色号\r\n/u);
  assert.doesNotMatch(actual, /schema|revision|matrixVersion|项目版本|矩阵版本|颜色 ID|显示 HEX/iu);
});

test('project JSON keeps recovery metadata and round-trips the exact editable project', () => {
  const project = readGoldenProject();
  const serialized = exportProjectJson(project);
  const restored = parseBeadProject(JSON.parse(serialized));

  assert.equal(restored.schemaVersion, project.schemaVersion);
  assert.equal(restored.revision, 17);
  assert.equal(restored.mode, 'pixelArt');
  assert.deepEqual(restored, project);
  assert.deepEqual(calculateStatistics(restored.cells), calculateStatistics(project.cells));
});
