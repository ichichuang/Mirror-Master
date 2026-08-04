import type { PreviewRenderMode } from '../preview-workspace/previewMode';

export type PngExportPreset = 'pure' | 'annotated' | 'numbered' | 'rounded';
export type PngExportPresetMatch = PngExportPreset | 'custom';
export type PngExportBackground = 'transparent' | 'white';
export type PngExportAppearance = 'bead' | 'solidSquare' | 'roundedSquare';
export type PngExportContentOption =
  | 'includeGrid'
  | 'includeCoordinates'
  | 'includeCellCodes'
  | 'includeStatistics'
  | 'includeMaterialCounts'
  | 'includeColorLegend';

export interface PngExportConfiguration {
  readonly background: PngExportBackground;
  readonly appearance: PngExportAppearance;
  readonly includeGrid: boolean;
  readonly includeCoordinates: boolean;
  readonly includeCellCodes: boolean;
  readonly includeStatistics: boolean;
  readonly includeMaterialCounts: boolean;
  readonly includeColorLegend: boolean;
}

export interface PngExportPresetDefinition {
  readonly id: PngExportPreset;
  readonly label: string;
  readonly description: string;
  readonly configuration: PngExportConfiguration;
}

function configuration(value: PngExportConfiguration): Readonly<PngExportConfiguration> {
  return Object.freeze({ ...value });
}

export const PNG_EXPORT_PRESETS: readonly PngExportPresetDefinition[] = Object.freeze([
  Object.freeze({
    id: 'pure',
    label: '纯图案',
    description: '透明背景，只保留拼豆图案',
    configuration: configuration({
      background: 'transparent',
      appearance: 'bead',
      includeGrid: false,
      includeCoordinates: false,
      includeCellCodes: false,
      includeStatistics: false,
      includeMaterialCounts: false,
      includeColorLegend: false,
    }),
  }),
  Object.freeze({
    id: 'annotated',
    label: '带标注',
    description: '包含网格、坐标、统计和材料图例',
    configuration: configuration({
      background: 'white',
      appearance: 'bead',
      includeGrid: true,
      includeCoordinates: true,
      includeCellCodes: false,
      includeStatistics: true,
      includeMaterialCounts: true,
      includeColorLegend: true,
    }),
  }),
  Object.freeze({
    id: 'numbered',
    label: '色号图纸',
    description: '每格显示色号，并附材料数量清单',
    configuration: configuration({
      background: 'white',
      appearance: 'solidSquare',
      includeGrid: true,
      includeCoordinates: true,
      includeCellCodes: true,
      includeStatistics: true,
      includeMaterialCounts: true,
      includeColorLegend: true,
    }),
  }),
  Object.freeze({
    id: 'rounded',
    label: '圆角方格',
    description: '圆角小方格清晰分隔，适合放大分享',
    configuration: configuration({
      background: 'white',
      appearance: 'roundedSquare',
      includeGrid: false,
      includeCoordinates: false,
      includeCellCodes: false,
      includeStatistics: false,
      includeMaterialCounts: false,
      includeColorLegend: false,
    }),
  }),
]);

const CONFIGURATION_KEYS = Object.freeze([
  'background',
  'appearance',
  'includeGrid',
  'includeCoordinates',
  'includeCellCodes',
  'includeStatistics',
  'includeMaterialCounts',
  'includeColorLegend',
] as const satisfies readonly (keyof PngExportConfiguration)[]);

export function configurationForPngExportPreset(preset: PngExportPreset): PngExportConfiguration {
  const definition = PNG_EXPORT_PRESETS.find((candidate) => candidate.id === preset);
  if (!definition) {
    throw new Error('未知的图片导出样式。');
  }
  return configuration(definition.configuration);
}

export function configurationForPreviewMode(mode: PreviewRenderMode): PngExportConfiguration {
  // “圆环豆粒”是屏幕专属预览样式，不进入 PNG 导出模板；
  // 从圆环豆粒预览进入导出时回退到最接近的可导出“纯图案”。
  return configurationForPngExportPreset(mode === 'ring' ? 'pure' : mode);
}

export function resolvePngExportPreset(value: PngExportConfiguration): PngExportPresetMatch {
  for (const preset of PNG_EXPORT_PRESETS) {
    if (CONFIGURATION_KEYS.every((key) => preset.configuration[key] === value[key])) {
      return preset.id;
    }
  }
  return 'custom';
}

export function updatePngExportConfiguration(
  value: PngExportConfiguration,
  patch: Partial<PngExportConfiguration>,
): PngExportConfiguration {
  return configuration({ ...value, ...patch });
}

export function describePngExportConfiguration(value: PngExportConfiguration): string {
  const parts = [
    value.background === 'transparent' ? '透明背景' : '白色背景',
    appearanceLabel(value.appearance),
  ];
  if (value.includeGrid && value.includeCoordinates) {
    parts.push('网格与坐标');
  } else if (value.includeGrid) {
    parts.push('网格线');
  } else if (value.includeCoordinates) {
    parts.push('行列坐标');
  }
  if (value.includeCellCodes) parts.push('格内色号');
  if (value.includeStatistics) parts.push('图纸统计');
  if (value.includeMaterialCounts && value.includeColorLegend) {
    parts.push('材料数量与色块图例');
  } else if (value.includeMaterialCounts) {
    parts.push('材料数量');
  } else if (value.includeColorLegend) {
    parts.push('颜色色块图例');
  }
  return parts.join(' · ');
}

function appearanceLabel(appearance: PngExportAppearance): string {
  if (appearance === 'solidSquare') return '实心方格';
  if (appearance === 'roundedSquare') return '圆角方格';
  return '标准拼豆';
}
