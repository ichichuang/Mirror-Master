import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseBeadProject, type BeadProject } from '../src/domain/project';
import {
  createExportCoordinator,
  type ExportCoordinatorDependencies,
  type ExportCoordinatorEvent,
  type ExportPatternRequest,
} from '../src/features/export-completion/exportCoordinator';

const PROJECT_FIXTURE_URL = new URL('./fixtures/export-parity-project.json', import.meta.url);

function projectFixture(): BeadProject {
  return parseBeadProject(JSON.parse(readFileSync(PROJECT_FIXTURE_URL, 'utf8')));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createHarness(
  requestPatternExport: ExportCoordinatorDependencies['requestPatternExport'],
) {
  const downloads: Array<{ objectUrl: string; fileName: string }> = [];
  const revoked: string[] = [];
  const events: ExportCoordinatorEvent[] = [];
  const blobs: Blob[] = [];
  let objectUrlIndex = 0;
  const coordinator = createExportCoordinator({
    requestPatternExport,
    isOnline: () => true,
    now: () => new Date(2026, 6, 26, 15, 30),
    createObjectURL(blob) {
      blobs.push(blob);
      objectUrlIndex += 1;
      return `blob:export-${String(objectUrlIndex)}`;
    },
    revokeObjectURL(objectUrl) {
      revoked.push(objectUrl);
    },
    triggerDownload(objectUrl, fileName) {
      downloads.push({ objectUrl, fileName });
    },
    onEvent(event) {
      events.push(event);
    },
  });
  return { coordinator, downloads, revoked, events, blobs };
}

test('a newer export aborts and suppresses a late older response', async () => {
  const first = deferred<Blob>();
  const second = deferred<Blob>();
  const requests: ExportPatternRequest[] = [];
  const harness = createHarness((request) => {
    requests.push(request);
    return requests.length === 1 ? first.promise : second.promise;
  });

  const firstRun = harness.coordinator.start({
    project: projectFixture(),
    task: 'shareImage',
    pngTemplate: 'pure',
  });
  const secondRun = harness.coordinator.start({
    project: projectFixture(),
    task: 'printMaking',
    pngTemplate: 'annotated',
  });

  assert.equal(requests[0]?.signal.aborted, true);
  first.resolve(new Blob(['old']));
  second.resolve(new Blob(['new']));
  const [firstResult, secondResult] = await Promise.all([firstRun, secondRun]);

  assert.equal(firstResult.outcome, 'stale');
  assert.equal(secondResult.outcome, 'downloaded');
  assert.deepEqual(harness.downloads, [
    {
      objectUrl: 'blob:export-1',
      fileName: '豆图设计台-打印制作-20260726.pdf',
    },
  ]);
  assert.equal(
    harness.events.some((event) => event.phase === 'success' && event.task === 'shareImage'),
    false,
  );
});

test('the request captures one immutable project snapshot before later edits', async () => {
  const pending = deferred<Blob>();
  const requests: ExportPatternRequest[] = [];
  const harness = createHarness((request) => {
    requests.push(request);
    return pending.promise;
  });
  const mutableProject = structuredClone(projectFixture());

  const run = harness.coordinator.start({
    project: mutableProject,
    task: 'shareImage',
    pngTemplate: 'annotated',
  });
  (mutableProject as { revision: number }).revision = 999;
  (mutableProject.cells[0] as Array<{ kind: 'empty' } | { kind: 'bead'; colorId: string }>)[0] = {
    kind: 'empty',
  };

  assert.equal(requests[0]?.project.revision, 17);
  assert.notEqual(requests[0]?.project.cells[0]?.[0]?.kind, 'empty');
  assert.equal(Object.isFrozen(requests[0]?.project), true);
  assert.equal(Object.isFrozen(requests[0]?.project.cells), true);

  pending.resolve(new Blob(['captured']));
  await run;
});

test('invalidation after a Blob arrives prevents URL creation and every visible completion effect', async () => {
  const pending = deferred<Blob>();
  const harness = createHarness(() => pending.promise);
  const run = harness.coordinator.start({
    project: projectFixture(),
    task: 'shareImage',
    pngTemplate: 'annotated',
  });

  pending.resolve(new Blob(['stale']));
  harness.coordinator.invalidate();
  const result = await run;

  assert.equal(result.outcome, 'stale');
  assert.equal(harness.blobs.length, 0);
  assert.equal(harness.downloads.length, 0);
  assert.equal(
    harness.events.some((event) => event.phase === 'success'),
    false,
  );
});

test('invalidation during URL creation revokes the URL before download', async () => {
  const downloads: string[] = [];
  const revoked: string[] = [];
  let coordinator: ReturnType<typeof createExportCoordinator>;
  coordinator = createExportCoordinator({
    requestPatternExport: async () => new Blob(['ready']),
    isOnline: () => true,
    now: () => new Date(2026, 6, 26),
    createObjectURL() {
      coordinator.invalidate();
      return 'blob:invalidated';
    },
    revokeObjectURL(objectUrl) {
      revoked.push(objectUrl);
    },
    triggerDownload(_objectUrl, fileName) {
      downloads.push(fileName);
    },
  });

  const result = await coordinator.start({
    project: projectFixture(),
    task: 'shareImage',
    pngTemplate: 'pure',
  });

  assert.equal(result.outcome, 'stale');
  assert.deepEqual(revoked, ['blob:invalidated']);
  assert.deepEqual(downloads, []);
});

test('customer filenames use brand, task, and local date without source or internal metadata', async () => {
  const harness = createHarness(async () => {
    throw new Error('project JSON must not call the remote exporter');
  });
  const result = await harness.coordinator.start({
    project: projectFixture(),
    task: 'saveProject',
    pngTemplate: 'annotated',
  });

  assert.equal(result.outcome, 'downloaded');
  assert.deepEqual(harness.downloads, [
    {
      objectUrl: 'blob:export-1',
      fileName: '豆图设计台-项目-20260726.json',
    },
  ]);
  assert.doesNotMatch(
    harness.downloads[0]?.fileName ?? '',
    /fixture|pattern|revision|schema|matrix|r17/iu,
  );
  const json = await harness.blobs[0]?.text();
  assert.equal(JSON.parse(json ?? '').revision, 17);
});

test('offline material export uses the byte-identical local CSV without a remote request', async () => {
  let remoteCalls = 0;
  const blobs: Blob[] = [];
  const coordinator = createExportCoordinator({
    requestPatternExport: async () => {
      remoteCalls += 1;
      return new Blob(['unexpected']);
    },
    isOnline: () => false,
    now: () => new Date(2026, 6, 26),
    createObjectURL(blob) {
      blobs.push(blob);
      return 'blob:csv';
    },
    revokeObjectURL() {},
    triggerDownload() {},
  });

  const result = await coordinator.start({
    project: projectFixture(),
    task: 'materialsList',
    pngTemplate: 'annotated',
  });

  assert.equal(result.outcome, 'downloaded');
  assert.equal(remoteCalls, 0);
  const bytes = new Uint8Array((await blobs[0]?.arrayBuffer()) ?? new ArrayBuffer(0));
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
});

test('share image downloads the exact ready local PNG without a remote request', async () => {
  let remoteCalls = 0;
  const readyPng = new Blob(['ready preview'], { type: 'image/png' });
  const harness = createHarness(async () => {
    remoteCalls += 1;
    return new Blob(['unexpected remote image'], { type: 'image/png' });
  });

  const result = await harness.coordinator.start({
    project: projectFixture(),
    task: 'shareImage',
    pngTemplate: 'annotated',
    pngBlob: readyPng,
  });

  assert.equal(result.outcome, 'downloaded');
  assert.equal(remoteCalls, 0);
  assert.equal(harness.blobs[0], readyPng);
  assert.equal(harness.downloads[0]?.fileName, '豆图设计台-分享图-20260726.png');
});
