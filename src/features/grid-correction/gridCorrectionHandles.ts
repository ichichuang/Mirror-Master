export type HandleType = 'move' | 'n' | 'e' | 's' | 'w' | 'nw' | 'ne' | 'se' | 'sw';

export const HANDLE_TARGET_CSS_SIZE = 44;
export const HANDLE_VISUAL_CSS_SIZE = 12;

export const HANDLE_LABELS: Record<HandleType, string> = {
  move: '移动整个网格区域。方向键移动一自然像素，Shift 加方向键移动十自然像素。',
  n: '上边手柄。上下方向键调整上边，Shift 加方向键每次调整十自然像素。',
  e: '右边手柄。左右方向键调整右边，Shift 加方向键每次调整十自然像素。',
  s: '下边手柄。上下方向键调整下边，Shift 加方向键每次调整十自然像素。',
  w: '左边手柄。左右方向键调整左边，Shift 加方向键每次调整十自然像素。',
  nw: '左上角手柄。方向键调整左边和上边，Shift 加方向键每次调整十自然像素。',
  ne: '右上角手柄。方向键调整右边和上边，Shift 加方向键每次调整十自然像素。',
  se: '右下角手柄。方向键调整右边和下边，Shift 加方向键每次调整十自然像素。',
  sw: '左下角手柄。方向键调整左边和下边，Shift 加方向键每次调整十自然像素。',
};
