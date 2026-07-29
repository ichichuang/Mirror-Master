const DETECTION_LOCK_SELECTOR = '[data-chart-detection-lock]';
const DISABLED_BY_DETECTION_KEY = 'disabledByDetection';

type LockableControl = HTMLButtonElement | HTMLInputElement;

export function syncChartDetectionBusyUi(root: HTMLElement, detecting: boolean): void {
  const workspace = requiredElement(root, '[data-chart-workspace]');
  const loader = requiredElement(root, '[data-chart-detection-loading]');
  workspace.setAttribute('aria-busy', String(detecting));
  loader.hidden = !detecting;

  for (const control of root.querySelectorAll<LockableControl>(DETECTION_LOCK_SELECTOR)) {
    if (detecting && !control.disabled) {
      control.dataset[DISABLED_BY_DETECTION_KEY] = 'true';
      control.disabled = true;
    } else if (!detecting && control.dataset[DISABLED_BY_DETECTION_KEY] === 'true') {
      control.disabled = false;
      control.removeAttribute('data-disabled-by-detection');
    }
  }
}

function requiredElement(root: HTMLElement, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Missing chart detection element: ${selector}`);
  }
  return element;
}
