export type PreviewRenderMode = 'pure' | 'annotated' | 'numbered' | 'rounded' | 'ring';

export interface PreviewRenderModeDefinition {
  readonly id: PreviewRenderMode;
  readonly label: string;
  readonly description: string;
  readonly exportTemplate: PreviewRenderMode;
}

export interface PreviewModeSelection {
  readonly mode: PreviewRenderMode;
  readonly compareView: 'pattern';
  readonly announcement: string;
}

export const PREVIEW_RENDER_MODES: readonly PreviewRenderModeDefinition[] = Object.freeze([
  Object.freeze({
    id: 'pure',
    label: '纯图案',
    description: '查看连续色块和整体轮廓',
    exportTemplate: 'pure',
  }),
  Object.freeze({
    id: 'annotated',
    label: '带标注',
    description: '查看分区辅助线和格子边界',
    exportTemplate: 'annotated',
  }),
  Object.freeze({
    id: 'numbered',
    label: '色号图纸',
    description: '在格子内直接核对品牌色号',
    exportTemplate: 'numbered',
  }),
  Object.freeze({
    id: 'rounded',
    label: '圆角方格',
    description: '预览适合分享的圆角豆粒效果',
    exportTemplate: 'rounded',
  }),
  Object.freeze({
    id: 'ring',
    label: '圆环豆粒',
    description: '模拟带中心孔的实体拼豆外观',
    exportTemplate: 'ring',
  }),
]);

export const DEFAULT_PREVIEW_RENDER_MODE: PreviewRenderMode = 'ring';

const previewRenderModeIds = new Set<PreviewRenderMode>(PREVIEW_RENDER_MODES.map(({ id }) => id));

export function parsePreviewRenderMode(value: unknown): PreviewRenderMode {
  return typeof value === 'string' && previewRenderModeIds.has(value as PreviewRenderMode)
    ? (value as PreviewRenderMode)
    : DEFAULT_PREVIEW_RENDER_MODE;
}

export function createPreviewModeSelection(value: unknown): PreviewModeSelection {
  const mode = parsePreviewRenderMode(value);
  const label =
    PREVIEW_RENDER_MODES.find((definition) => definition.id === mode)?.label ?? '圆环豆粒';
  return Object.freeze({
    mode,
    compareView: 'pattern',
    announcement: `已切换为${label}预览。`,
  });
}
