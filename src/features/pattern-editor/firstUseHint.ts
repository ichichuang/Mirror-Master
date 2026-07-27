export type FirstUseGesture = 'draw' | 'pinch';

export interface FirstUseHintSession {
  readonly visible: boolean;
  readonly enterEditor: () => boolean;
  readonly dismiss: () => void;
  readonly recordSuccessfulGesture: (gesture: FirstUseGesture) => boolean;
}

export const FIRST_USE_HINT_MESSAGE = '单指绘制，双指移动和缩放';

export function createFirstUseHintSession(): FirstUseHintSession {
  let presented = false;
  let visible = false;

  return Object.freeze({
    get visible() {
      return visible;
    },
    enterEditor() {
      if (presented) {
        return false;
      }
      presented = true;
      visible = true;
      return true;
    },
    dismiss() {
      visible = false;
    },
    recordSuccessfulGesture() {
      if (!visible) {
        return false;
      }
      visible = false;
      return true;
    },
  });
}
