import type { GridMirrorProcessingState } from './types';

export const GRID_MIRROR_STATE_LABELS: Record<GridMirrorProcessingState, string> = {
  'waiting-for-confirmation': '等待确认',
  ready: '已就绪',
  processing: '生成中',
  completed: '已完成',
  failed: '失败',
  invalidated: '已失效',
};

export const GRID_MIRROR_UNCHANGED_SCOPE_TEXT =
  '仅 34 × 27 主网格内的单元格位置发生左右镜像移动；单元格内部像素方向和网格外区域保持不变。';
