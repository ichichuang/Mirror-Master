import type { PixelGridPrecisionState } from './types';

export const PIXEL_GRID_PRECISION_STATE_LABELS: Record<PixelGridPrecisionState, string> = {
  idle: '空闲',
  refining: '精修中',
  candidate: '候选',
  'confirmed-ready': '已确认可处理',
  rejected: '已拒绝',
};

export const MIN_PRECISION_CELL_SIZE = 4;
export const PRECISION_COARSE_CANDIDATE_LIMIT = 28;
export const PRECISION_FINAL_CANDIDATE_LIMIT = 18;
export const PRECISION_MIN_SCORE = 0.62;
export const PRECISION_MIN_BOUNDARY_STRENGTH = 0.5;
export const PRECISION_MIN_CENTER_CONTRAST = 0.28;
export const PRECISION_MIN_PERIODIC_CONSISTENCY = 0.58;
export const PRECISION_MIN_OUTER_EDGE_SUPPORT = 0.42;
export const PRECISION_MIN_AMBIGUITY_GAP = 0.003;
