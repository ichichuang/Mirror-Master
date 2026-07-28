import type { BeadProject, ProjectStatistics } from '../../domain/project';
import {
  clearPatternPreview,
  computePreviewFrameSize,
  drawPatternPreview,
} from './previewRenderer';
import { formatPreviewDoneStatus, formatPreviewSummary } from './previewSummary';

export interface PreviewResultViewInput {
  readonly project: BeadProject | null;
  readonly statistics: ProjectStatistics | null;
  readonly canReturnToEditor: boolean;
  readonly generationActive: boolean;
}

export interface PreviewViewOptions {
  readonly root: HTMLElement;
  readonly colorHexById: ReadonlyMap<string, string>;
  readonly onShowOriginal: () => void;
}

export interface PreviewViewController {
  readonly setStatusText: (
    text: string,
    options: { hasResult: boolean; showBadge: boolean },
  ) => void;
  readonly drawPreview: (project: BeadProject | null) => void;
  readonly syncResult: (input: PreviewResultViewInput) => void;
  readonly updateEstimate: (usedColors: number) => void;
  readonly applyCompareView: (view: 'original' | 'pattern') => void;
}

export function createPreviewView(options: PreviewViewOptions): PreviewViewController {
  const { root } = options;
  const canvas = required(root, '[data-preview-canvas]') as HTMLCanvasElement;
  const canvasSlot = required(root, '[data-preview-canvas-slot]') as HTMLElement;
  const canvasStack = required(root, '[data-preview-canvas-stack]') as HTMLElement;
  const emptyHint = required(root, '[data-preview-empty]') as HTMLElement;
  const badge = required(root, '[data-preview-badge]') as HTMLElement;
  const status = required(root, '[data-preview-status]') as HTMLElement;
  const summary = required(root, '[data-preview-summary]') as HTMLElement;
  const sheetSummary = required(root, '[data-preview-sheet-summary]') as HTMLElement;
  const estimate = required(root, '[data-color-count-estimate]') as HTMLElement;
  const editButton = required(root, '[data-edit-pattern]') as HTMLButtonElement;
  const returnEditorButton = required(root, '[data-return-editor]') as HTMLButtonElement;
  const originalView = required(root, '[data-preview-original-view]') as HTMLElement;
  const patternView = required(root, '[data-preview-pattern-view]') as HTMLElement;
  let lastProject: BeadProject | null = null;

  return Object.freeze({
    setStatusText(
      text: string,
      { hasResult, showBadge }: { hasResult: boolean; showBadge: boolean },
    ): void {
      if (status.textContent !== text) {
        status.textContent = text;
      }
      status.dataset.state =
        text.length === 0 ? 'empty' : hasResult && showBadge ? 'live-only' : 'message';
      badge.hidden = !showBadge;
      if (showBadge) {
        badge.textContent = text;
      }
      if (!hasResult) {
        emptyHint.hidden = false;
        emptyHint.textContent = text;
      }
    },
    drawPreview,
    syncResult(input: PreviewResultViewInput): void {
      drawPreview(input.project);
      if (input.project && input.statistics) {
        summary.hidden = false;
        summary.textContent = formatPreviewSummary(input.project, input.statistics);
        sheetSummary.textContent = '大小、颜色与风格';
      } else {
        summary.hidden = true;
        summary.textContent = '';
        sheetSummary.textContent = '调整图案大小、颜色与风格';
      }
      updateEstimate(input.statistics?.usedColorCount ?? null);
      if (input.project && input.statistics && !input.generationActive) {
        const doneText = formatPreviewDoneStatus(
          input.project.grid.columns,
          input.project.grid.rows,
          input.statistics.usedColorCount,
        );
        if (status.textContent !== doneText) {
          status.textContent = doneText;
        }
        status.dataset.state = 'done';
        badge.hidden = true;
      }
      editButton.disabled = input.project === null;
      returnEditorButton.hidden = !input.canReturnToEditor;
    },
    updateEstimate,
    applyCompareView(view: 'original' | 'pattern'): void {
      originalView.hidden = view !== 'original';
      patternView.hidden = view === 'original';
      if (view === 'original') {
        options.onShowOriginal();
      } else {
        drawPreview(lastProject);
      }
    },
  });

  function drawPreview(project: BeadProject | null): void {
    lastProject = project;
    if (!project) {
      canvasSlot.style.removeProperty('--preview-canvas-aspect-ratio');
      canvasStack.style.removeProperty('inline-size');
      canvasStack.style.removeProperty('block-size');
      clearPatternPreview(canvas);
      emptyHint.hidden = false;
      return;
    }
    canvasSlot.style.setProperty(
      '--preview-canvas-aspect-ratio',
      `${String(project.grid.columns)} / ${String(project.grid.rows)}`,
    );
    const slotWidth = canvasSlot.clientWidth;
    const slotHeight = canvasSlot.clientHeight;
    if (slotWidth > 0 && slotHeight > 0) {
      const frame = computePreviewFrameSize(
        slotWidth,
        slotHeight,
        project.grid.columns,
        project.grid.rows,
      );
      canvasStack.style.inlineSize = `${String(frame.width)}px`;
      canvasStack.style.blockSize = `${String(frame.height)}px`;
    }
    emptyHint.hidden = true;
    drawPatternPreview(canvas, project.cells, options.colorHexById);
  }

  function updateEstimate(usedColors: number | null): void {
    if (usedColors === null) {
      return;
    }
    estimate.textContent = `当前预计使用 ${String(usedColors)} 色`;
  }
}

function required(root: ParentNode, selector: string): Element {
  const element = root.querySelector(selector);
  if (!element) {
    throw new Error(`缺少界面元素：${selector}`);
  }
  return element;
}
