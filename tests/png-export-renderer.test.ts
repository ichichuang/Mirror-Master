import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseBeadProject, type BeadProject } from '../src/domain/project';
import {
  configurationForPngExportPreset,
  updatePngExportConfiguration,
} from '../src/features/export-completion/pngExportConfiguration';
import {
  planPngExportLayout,
  pngExportConfigurationSignature,
  renderPngExportCanvas,
} from '../src/features/export-completion/pngExportRenderer';
import { PALETTE_COLORS } from '../src/generated/palettes';

const PROJECT_FIXTURE_URL = new URL('./fixtures/export-parity-project.json', import.meta.url);

function projectFixture(): BeadProject {
  return parseBeadProject(JSON.parse(readFileSync(PROJECT_FIXTURE_URL, 'utf8')));
}

test('optional export sections consume no output space when disabled', () => {
  const project = projectFixture();
  const pure = planPngExportLayout(project, configurationForPngExportPreset('pure'));
  const annotated = planPngExportLayout(project, configurationForPngExportPreset('annotated'));

  assert.equal(pure.statisticsBox, null);
  assert.equal(pure.materialsBox, null);
  assert.equal(pure.gridX, 0);
  assert.equal(pure.gridY, 0);
  assert.ok(annotated.statisticsBox);
  assert.ok(annotated.materialsBox);
  assert.ok(annotated.gridX > 0);
  assert.ok(annotated.gridY > (annotated.statisticsBox?.height ?? 0));
  assert.ok(annotated.canvasHeight > pure.canvasHeight);
});

test('cell codes retain a readable cell size within safe canvas limits', () => {
  const project = projectFixture();
  const layout = planPngExportLayout(project, configurationForPngExportPreset('numbered'));

  assert.ok(layout.cellSize >= 18);
  assert.ok(layout.canvasWidth <= 8192);
  assert.ok(layout.canvasHeight <= 8192);
  assert.ok(layout.canvasWidth * layout.canvasHeight <= 40_000_000);
});

test('configuration signatures change when any visible PNG choice changes', () => {
  const pure = configurationForPngExportPreset('pure');
  const white = updatePngExportConfiguration(pure, { background: 'white' });
  const grid = updatePngExportConfiguration(pure, { includeGrid: true });

  assert.notEqual(pngExportConfigurationSignature(pure), pngExportConfigurationSignature(white));
  assert.notEqual(pngExportConfigurationSignature(pure), pngExportConfigurationSignature(grid));
  assert.equal(
    pngExportConfigurationSignature(pure),
    pngExportConfigurationSignature(configurationForPngExportPreset('pure')),
  );
});

test('transparent output stays transparent while optional statistics and legend are rendered', () => {
  const project = projectFixture();
  const pureRecording = recordingCanvas();
  renderPngExportCanvas(pureRecording.canvas, {
    project,
    configuration: configurationForPngExportPreset('pure'),
    colorHexById: displayHexById(),
    colorCodeById: colorCodeById(),
  });

  assert.equal(pureRecording.operations[0]?.kind, 'clearRect');
  assert.equal(
    pureRecording.operations.some(
      (operation) =>
        operation.kind === 'fillRect' &&
        operation.x === 0 &&
        operation.y === 0 &&
        operation.width === pureRecording.canvas.width &&
        operation.height === pureRecording.canvas.height &&
        operation.fillStyle === '#ffffff',
    ),
    false,
  );

  const annotatedRecording = recordingCanvas();
  renderPngExportCanvas(annotatedRecording.canvas, {
    project,
    configuration: configurationForPngExportPreset('annotated'),
    colorHexById: displayHexById(),
    colorCodeById: colorCodeById(),
  });
  const text = annotatedRecording.operations
    .filter((operation) => operation.kind === 'fillText')
    .map((operation) => operation.text);

  assert.ok(text.some((value) => value?.includes('图纸统计')));
  assert.ok(text.some((value) => value?.includes('材料与颜色')));
  assert.ok(
    annotatedRecording.operations.some(
      (operation) => operation.kind === 'fillRect' && operation.fillStyle.startsWith('#'),
    ),
  );
});

function displayHexById(): ReadonlyMap<string, string> {
  return new Map(PALETTE_COLORS.map((color) => [color.id, color.displayHex]));
}

function colorCodeById(): ReadonlyMap<string, string> {
  return new Map(PALETTE_COLORS.map((color) => [color.id, color.code]));
}

type RecordingOperation =
  | {
      readonly kind: 'clearRect' | 'fillRect' | 'strokeRect';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly fillStyle: string;
    }
  | {
      readonly kind: 'fillText';
      readonly text: string;
      readonly x: number;
      readonly y: number;
      readonly fillStyle: string;
    }
  | { readonly kind: 'other' };

function recordingCanvas(): {
  readonly canvas: HTMLCanvasElement;
  readonly operations: RecordingOperation[];
} {
  const operations: RecordingOperation[] = [];
  let fillStyle = '#000000';
  const context = {
    save() {
      operations.push({ kind: 'other' });
    },
    restore() {
      operations.push({ kind: 'other' });
    },
    clearRect(x: number, y: number, width: number, height: number) {
      operations.push({ kind: 'clearRect', x, y, width, height, fillStyle });
    },
    fillRect(x: number, y: number, width: number, height: number) {
      operations.push({ kind: 'fillRect', x, y, width, height, fillStyle });
    },
    strokeRect(x: number, y: number, width: number, height: number) {
      operations.push({ kind: 'strokeRect', x, y, width, height, fillStyle });
    },
    beginPath() {
      operations.push({ kind: 'other' });
    },
    closePath() {
      operations.push({ kind: 'other' });
    },
    moveTo() {
      operations.push({ kind: 'other' });
    },
    lineTo() {
      operations.push({ kind: 'other' });
    },
    quadraticCurveTo() {
      operations.push({ kind: 'other' });
    },
    arc() {
      operations.push({ kind: 'other' });
    },
    fill() {
      operations.push({ kind: 'other' });
    },
    stroke() {
      operations.push({ kind: 'other' });
    },
    fillText(text: string, x: number, y: number) {
      operations.push({ kind: 'fillText', text, x, y, fillStyle });
    },
    measureText(text: string) {
      return { width: text.length * 8 };
    },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) {
      fillStyle = String(value);
    },
    get fillStyle() {
      return fillStyle;
    },
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '12px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 1,
    height: 1,
    getContext: () => context,
    toBlob: () => undefined,
  } as unknown as HTMLCanvasElement;
  return { canvas, operations };
}
