import type { BeadProject, ImageRotation, ProjectStatistics } from '../../domain/project';
import type { CropPercent } from '../crop-controls/cropControls';
import {
  clearPatternPreview,
  computePreviewFrameSize,
  drawPatternPreview,
} from './previewRenderer';
import { drawAlignedOriginalPreview } from './previewCrop';
import { DEFAULT_PREVIEW_RENDER_MODE, type PreviewRenderMode } from './previewMode';
import {
  createPatternTrustSummary,
  formatPatternTrustSummary,
} from '../pattern-trust/patternTrust';
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
  readonly colorCodeById?: ReadonlyMap<string, string>;
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
  readonly setRenderMode: (mode: PreviewRenderMode) => void;
  readonly drawAlignedOriginal: (
    image: HTMLImageElement,
    rotation: ImageRotation,
    crop: CropPercent,
  ) => void;
  readonly applyCompareView: (view: 'adjust' | 'original' | 'pattern') => void;
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
  const trust = required(root, '[data-preview-trust]') as HTMLElement;
  const trustSummary = required(root, '[data-preview-trust-summary]') as HTMLElement;
  const trustVerification = required(root, '[data-preview-trust-verification]') as HTMLElement;
  const sheetSummary = required(root, '[data-preview-sheet-summary]') as HTMLElement;
  const estimate = required(root, '[data-color-count-estimate]') as HTMLElement;
  const editButton = required(root, '[data-edit-pattern]') as HTMLButtonElement;
  const returnEditorButton = required(root, '[data-return-editor]') as HTMLButtonElement;
  const originalView = required(root, '[data-preview-original-view]') as HTMLElement;
  const originalCanvas = required(root, '[data-preview-original-canvas]') as HTMLCanvasElement;
  const adjustView = required(root, '[data-preview-adjust-view]') as HTMLElement;
  const patternView = required(root, '[data-preview-pattern-view]') as HTMLElement;
  let lastProject: BeadProject | null = null;
  let renderMode: PreviewRenderMode = DEFAULT_PREVIEW_RENDER_MODE;
  let activeView: 'adjust' | 'original' | 'pattern' = 'pattern';

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
      if (input.project && input.statistics) {
        const trustCopy = formatPatternTrustSummary(createPatternTrustSummary(input.project));
        summary.hidden = false;
        summary.textContent = formatPreviewSummary(input.project);
        trust.hidden = false;
        trustSummary.textContent = trustCopy.primary;
        trustVerification.textContent = trustCopy.verification;
        sheetSummary.textContent = '大小、颜色与风格';
      } else {
        summary.hidden = true;
        summary.textContent = '';
        trust.hidden = true;
        trustSummary.textContent = '';
        trustVerification.textContent = '';
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
      drawPreview(input.project);
    },
    updateEstimate,
    setRenderMode(mode: PreviewRenderMode): void {
      if (renderMode === mode) {
        return;
      }
      renderMode = mode;
      if (activeView === 'pattern') {
        drawPreview(lastProject);
      }
    },
    drawAlignedOriginal(image: HTMLImageElement, rotation: ImageRotation, crop: CropPercent): void {
      drawAlignedOriginalPreview(originalCanvas, image, rotation, crop);
    },
    applyCompareView(view: 'adjust' | 'original' | 'pattern'): void {
      const viewChanged = activeView !== view;
      activeView = view;
      originalView.hidden = view !== 'original';
      patternView.hidden = view !== 'pattern';
      adjustView.hidden = view !== 'adjust';
      if (!viewChanged) {
        return;
      }
      if (view === 'original') {
        options.onShowOriginal();
      } else if (view === 'pattern') {
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
    drawPatternPreview(
      canvas,
      project.cells,
      options.colorHexById,
      renderMode,
      options.colorCodeById,
    );
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
