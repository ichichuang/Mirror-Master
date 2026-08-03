import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAPABILITIES_CONTRACT_VERSION,
  FALLBACK_APP_CAPABILITIES,
  loadAppCapabilities,
  parseAppCapabilities,
  resolveAppCapabilities,
} from '../src/features/app-capabilities/capabilities';

const VALID_CAPABILITIES = {
  contractVersion: '1.0',
  schemaVersions: ['1.0'],
  paletteSourceVersion: '2026-07-24',
  upload: {
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    maximumBytes: 20 * 1024 * 1024,
    maximumDecodedPixels: 25_000_000,
  },
  backgroundRemoval: {
    contractVersion: '1.0',
    available: true,
    outputMimeType: 'image/png',
    maximumDecodedPixels: 12_000_000,
    maximumConcurrentInferences: 1,
    unavailableReason: null,
    interactive: {
      contractVersion: '1.0',
      available: true,
      refinement: 'grabcut',
      maximumStrokesPerRequest: 64,
      maximumStrokePointsPerRequest: 8192,
      minimumBrushRadiusPx: 1,
      maximumBrushRadiusPx: 512,
    },
  },
  grid: {
    minimumRows: 1,
    maximumRows: 300,
    minimumColumns: 1,
    maximumColumns: 300,
  },
  beads: {
    minimumDiameterMm: 1,
    maximumDiameterMm: 10,
    minimumPitchMm: 1,
    maximumPitchMm: 12,
    pitchMustNotBeSmallerThanDiameter: true,
  },
  boards: {
    fixedPresets: {
      smallSquare: { rows: 14, columns: 14 },
      standardSquare: { rows: 29, columns: 29 },
    },
    custom: {
      minimumRows: 1,
      maximumRows: 300,
      minimumColumns: 1,
      maximumColumns: 300,
    },
  },
  modes: ['photo', 'pixelArt', 'existingChart'],
  sampling: ['average', 'nearest'],
  dithering: ['none', 'floydSteinberg'],
  exports: ['png', 'pdf', 'csv', 'projectJson'],
  pngTemplates: ['pure', 'annotated', 'numbered', 'rounded'],
  pdf: {
    pageSize: 'A4',
    summaryPage: true,
    onePagePerBoard: true,
    coordinates: true,
    legends: true,
    counts: true,
    physicalScale: 'fit-with-declared-scale',
    maximumPages: 500,
    maximumRasterPixels: 1_100_000_000,
  },
  gridMirrorAxes: ['horizontal', 'vertical'],
};

test('capabilities parser returns a typed versioned contract', () => {
  const capabilities = parseAppCapabilities(VALID_CAPABILITIES);

  assert.equal(capabilities.contractVersion, CAPABILITIES_CONTRACT_VERSION);
  assert.deepEqual(capabilities.schemaVersions, ['1.0']);
  assert.equal(capabilities.upload.maximumDecodedPixels, 25_000_000);
  assert.deepEqual(capabilities.backgroundRemoval, {
    contractVersion: '1.0',
    available: true,
    outputMimeType: 'image/png',
    maximumDecodedPixels: 12_000_000,
    maximumConcurrentInferences: 1,
    unavailableReason: null,
    interactive: {
      contractVersion: '1.0',
      available: true,
      refinement: 'grabcut',
      maximumStrokesPerRequest: 64,
      maximumStrokePointsPerRequest: 8192,
      minimumBrushRadiusPx: 1,
      maximumBrushRadiusPx: 512,
    },
  });
  assert.equal(capabilities.beads.pitchMustNotBeSmallerThanDiameter, true);
  assert.deepEqual(capabilities.boards.fixedPresets.standardSquare, {
    rows: 29,
    columns: 29,
  });
  assert.deepEqual(capabilities.exports, ['png', 'pdf', 'csv', 'projectJson']);
  assert.deepEqual(capabilities.pngTemplates, ['pure', 'annotated', 'numbered', 'rounded']);
  assert.equal(capabilities.pdf.physicalScale, 'fit-with-declared-scale');
  assert.equal(capabilities.pdf.maximumPages, 500);
  assert.equal(capabilities.pdf.maximumRasterPixels, 1_100_000_000);
});

test('missing background removal capability disables only that feature', () => {
  const { backgroundRemoval: _backgroundRemoval, ...withoutBackgroundRemoval } = VALID_CAPABILITIES;
  const capabilities = parseAppCapabilities(withoutBackgroundRemoval);

  assert.equal(capabilities.backgroundRemoval.available, false);
  assert.equal(capabilities.backgroundRemoval.unavailableReason, 'MODEL_MISSING');
  assert.equal(capabilities.backgroundRemoval.interactive.available, false);
  assert.equal(capabilities.upload.maximumBytes, 20 * 1024 * 1024);
});

test('missing or incompatible interactive capability falls back to one-shot removal', () => {
  const { interactive: _interactive, ...withoutInteractive } = VALID_CAPABILITIES.backgroundRemoval;
  const missingInteractive = parseAppCapabilities({
    ...VALID_CAPABILITIES,
    backgroundRemoval: withoutInteractive,
  });
  assert.equal(missingInteractive.backgroundRemoval.available, true);
  assert.equal(missingInteractive.backgroundRemoval.interactive.available, false);

  const incompatible = parseAppCapabilities({
    ...VALID_CAPABILITIES,
    backgroundRemoval: {
      ...VALID_CAPABILITIES.backgroundRemoval,
      interactive: {
        ...VALID_CAPABILITIES.backgroundRemoval.interactive,
        contractVersion: '2.0',
      },
    },
  });
  assert.equal(incompatible.backgroundRemoval.interactive.available, false);
});

test('invalid background removal capability disables only that feature', () => {
  const capabilities = parseAppCapabilities({
    ...VALID_CAPABILITIES,
    backgroundRemoval: {
      ...VALID_CAPABILITIES.backgroundRemoval,
      contractVersion: '2.0',
    },
  });

  assert.equal(capabilities.backgroundRemoval.available, false);
  assert.equal(capabilities.backgroundRemoval.unavailableReason, 'MODEL_INVALID');
});

test('capabilities parser rejects malformed limits and unsupported values', () => {
  assert.throws(
    () =>
      parseAppCapabilities({
        ...VALID_CAPABILITIES,
        upload: { ...VALID_CAPABILITIES.upload, maximumBytes: -1 },
      }),
    /服务能力/u,
  );
  assert.throws(
    () => parseAppCapabilities({ ...VALID_CAPABILITIES, modes: ['photo', 'futureMode'] }),
    /服务能力/u,
  );
  assert.throws(
    () => parseAppCapabilities({ ...VALID_CAPABILITIES, contractVersion: '2.0' }),
    /服务能力/u,
  );
});

test('capabilities resolution exposes an explicit fallback contract', () => {
  const resolution = resolveAppCapabilities({ schemaVersions: [] });

  assert.equal(resolution.source, 'fallback');
  assert.equal(resolution.capabilities, FALLBACK_APP_CAPABILITIES);
  assert.match(resolution.message ?? '', /兼容配置/u);
});

test('valid capabilities resolution reports the remote source without a warning', () => {
  const resolution = resolveAppCapabilities(VALID_CAPABILITIES);

  assert.equal(resolution.source, 'remote');
  assert.equal(resolution.message, null);
  assert.equal(resolution.capabilities.upload.maximumBytes, 20 * 1024 * 1024);
});

test('capabilities loader fetches the endpoint through an injected client', async () => {
  const requests: Array<{ input: string; accept: string | null }> = [];
  const resolution = await loadAppCapabilities({
    endpoint: '/custom/capabilities',
    fetcher: async (input, init) => {
      requests.push({
        input,
        accept: new Headers(init?.headers).get('Accept'),
      });
      return {
        ok: true,
        json: async () => VALID_CAPABILITIES,
      };
    },
  });

  assert.deepEqual(requests, [{ input: '/custom/capabilities', accept: 'application/json' }]);
  assert.equal(resolution.source, 'remote');
});

test('capabilities loader falls back explicitly for network and parse failures', async () => {
  const networkResolution = await loadAppCapabilities({
    fetcher: async () => {
      throw new Error('offline');
    },
  });
  const parseResolution = await loadAppCapabilities({
    fetcher: async () => ({
      ok: true,
      json: async () => ({ contractVersion: 'future' }),
    }),
  });

  assert.equal(networkResolution.source, 'fallback');
  assert.equal(networkResolution.capabilities, FALLBACK_APP_CAPABILITIES);
  assert.match(networkResolution.message ?? '', /接口不可用/u);
  assert.equal(parseResolution.source, 'fallback');
  assert.equal(parseResolution.capabilities, FALLBACK_APP_CAPABILITIES);
  assert.match(parseResolution.message ?? '', /信息无效/u);
});
