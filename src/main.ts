import './generated/phosphor-icons.css';
import './design/generated/tokens.css';
import './styles/base.css';
import './styles/page.css';
import './styles/vaadin-theme.css';

import { renderApp } from './app';
import { brandConfig } from './brand/brand.config';
import { safeDownloadBaseName } from './domain/export';
import { MatrixHistory } from './domain/history';
import {
  calculatePhysicalLayout,
  calculateStatistics,
  withProjectCells,
  type BeadProject,
  type ImageRotation,
  type ProjectMode,
  type ProjectStatistics,
} from './domain/project';
import { PALETTE_COLORS, PALETTE_SOURCE_VERSION, PALETTES } from './generated/palettes';
import {
  FALLBACK_APP_CAPABILITIES,
  loadAppCapabilities,
  type AppCapabilities,
} from './features/app-capabilities/capabilities';
import {
  createBackgroundRemovalCoordinator,
  type BackgroundRemovalCoordinator,
  type BackgroundRemovalCoordinatorEvent,
  type BackgroundRemovalRequest,
} from './features/background-removal/backgroundRemovalCoordinator';
import {
  activateBackgroundRemovalVariant,
  guardBackgroundRemovalChange,
  resolveBackgroundRemovalActionState,
} from './features/background-removal/backgroundRemovalFlow';
import {
  ImageTransformApiError,
  removeImageBackground,
} from './features/background-removal/client';
import {
  createSourceImageSession,
  type SelectedImage,
  type SourceImageSession,
  type SourceImageVariant,
} from './features/background-removal/sourceImageSession';
import { normalizeCropPercent } from './features/crop-controls/cropControls';
import {
  mirrorGrid,
  MirrorMasterApiError,
  type GridDetectionContract,
} from './features/grid-api/client';
import { createChartMirrorCoordinator } from './features/grid-editor/chartMirrorCoordinator';
import { resolveGridConfirmation } from './features/grid-editor/confirmationState';
import { syncChartDetectionBusyUi } from './features/grid-editor/detectionBusyUi';
import { mountGridEditor, type GridEditorController } from './features/grid-editor/gridEditor';
import { decodeImageResourceFromObjectUrl } from './features/local-image-input/imageDecoder';
import {
  formatFileSize,
  validateSingleImageFile,
} from './features/local-image-input/fileValidation';
import { createObjectUrlStore } from './features/local-image-input/objectUrlStore';
import {
  calculateSheetSnapPoints,
  createSheetMotionState,
  didSheetGestureMove,
  dragSheetHeight,
  registerSheetGestureCancellation,
  reduceSheetMotion,
  type SheetMotionState,
  type SheetSnapPoints,
  type SheetState,
} from './features/mobile-sheet/sheetMath';
import {
  ALL_SERIES_SELECT_VALUE,
  filterPaletteColors,
  paletteFilterStatusText,
  paletteSeriesFromSelectValue,
  paletteSeriesToSelectValue,
  pushRecentColor,
} from './features/palette-controls/paletteControls';
import {
  mountPatternCanvas,
  type CellSelection,
  type EditorTool,
  type PatternCanvasController,
  type SelectionTransferMode,
  type SelectionViewportRect,
} from './features/pattern-editor/canvasEditor';
import {
  createFirstUseHintSession,
  type FirstUseGesture,
} from './features/pattern-editor/firstUseHint';
import { createVerifiedMatrixMirror } from './features/pattern-editor/mirrorCommand';
import {
  describeSelection,
  positionSelectionContextBar,
  type ViewportRect,
} from './features/pattern-editor/selectionContext';
import {
  createPatternTrustSummary,
  formatPatternTrustSummary,
} from './features/pattern-trust/patternTrust';
import { recommendDecodedImageMode } from './features/customer-flow/imageRecommendation';
import {
  setModePreference,
  updateRecommendation,
  type NewPatternPrepareState,
} from './features/customer-flow/prepareState';
import { dimensionsForLongEdge } from './features/customer-flow/presets';
import {
  type CustomerTask,
  type ModePreference,
  type NewPatternMode,
} from './features/customer-flow/modeRecommendation';
import {
  createExportCoordinator,
  type ExportCoordinatorEvent,
} from './features/export-completion/exportCoordinator';
import {
  createConfirmationDialog,
  type ConfirmationDialogController,
} from './features/confirmation/confirmationDialog';
import {
  beginExport,
  closeExportCompletion,
  completeExport,
  createExportCompletionState,
  exportTaskDefinition,
  failExport,
  openExportCompletion,
  selectExportTask,
  setExportPngConfiguration,
  type ExportCompletionState,
  type ExportTaskId,
} from './features/export-completion/exportState';
import {
  configurationForPngExportPreset,
  configurationForPreviewMode,
  describePngExportConfiguration,
  resolvePngExportPreset,
  updatePngExportConfiguration,
  type PngExportAppearance,
  type PngExportBackground,
  type PngExportConfiguration,
  type PngExportContentOption,
  type PngExportPreset,
} from './features/export-completion/pngExportConfiguration';
import {
  createPngExportPreviewCoordinator,
  type PngExportPreviewResult,
  type PngExportPreviewState,
} from './features/export-completion/pngExportPreviewCoordinator';
import {
  encodeCanvasAsPng,
  pngExportConfigurationSignature,
  renderPngExportCanvas,
} from './features/export-completion/pngExportRenderer';
import {
  createAvailableColorDialog,
  type AvailableColorDialogController,
} from './features/prepare-workspace/availableColorDialog';
import {
  createAvailableColorGridRenderer,
  createLatestSourceRequest,
  createNewImagePrepareDefaults,
  hasAvailableColorSelection,
  mountPreparePresetControls,
  resolveSupportedNewPatternMode,
  type AvailableColorGridRenderer,
  type PreparePresetControlsController,
  type PreparePresetRadioGroupControllers,
} from './features/prepare-workspace/prepareWorkspace';
import {
  beginUploadedImage,
  chooseSampling,
  createAutomaticSampling,
  flowFromImportedProject,
  recommendSampling,
  resetFlowForReplacement,
  syncSamplingControls,
  syncUploadPrepareControls,
  type SamplingSelection,
  type SamplingValue,
  type UploadPrepareFlow,
  type UploadPrepareRadioControllers,
} from './features/prepare-workspace/prepareSession';
import {
  exportPattern,
  generatePattern,
  type PatternGenerationSettings,
} from './features/pattern-api/client';
import {
  createPreviewCoordinator,
  PREVIEW_STATUS_TEXT,
  type PreviewCoordinator,
  type PreviewCoordinatorEvent,
  type PreviewStatusKind,
} from './features/preview-workspace/previewCoordinator';
import {
  drawRotatedCropPreview,
  mountCropInteractions,
  renderCropSelectionOverlay,
} from './features/preview-workspace/previewCrop';
import {
  createPreviewModeSelection,
  DEFAULT_PREVIEW_RENDER_MODE,
  PREVIEW_RENDER_MODES,
  parsePreviewRenderMode,
  type PreviewModeSelection,
  type PreviewRenderMode,
} from './features/preview-workspace/previewMode';
import { formatPreviewDoneStatus } from './features/preview-workspace/previewSummary';
import {
  createPreviewView,
  type PreviewViewController,
} from './features/preview-workspace/previewView';
import {
  MAX_PROJECT_JSON_BYTES,
  parseProjectJsonText,
  ProjectImportError,
} from './features/project-import/projectImport';
import {
  createVaadinRadioGroupController,
  createVaadinSelectController,
  requiredVaadinElement,
  type VaadinChoiceOption,
  type VaadinRadioGroupController,
  type VaadinSelectController,
} from './features/vaadin-controls/vaadinControls';
import {
  captureWorkspaceSurfaceFocus,
  createResponsiveWorkspaceMount,
  resolveWorkspaceLayout,
  restoreWorkspaceSurfaceFocus,
  type ResponsiveWorkspaceMount,
  type WorkspaceLayoutMode,
} from './features/workspace-layout/layout';
import {
  createWorkspacePanels,
  moveFocusBeforeHiding,
  type WorkspacePanelsController,
  type WorkspacePanelsView,
} from './features/workspace-panels/workspacePanels';

type AppStage = 'start' | 'preview' | 'editor' | 'chart';
type InspectorPanel = 'tools' | 'palette' | 'materials' | 'settings';

interface CropPercent {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ConfirmationRequest {
  readonly title: string;
  readonly description: string;
  readonly onContinue: () => void;
  readonly onCancel?: () => void;
}

const appElement = document.querySelector<HTMLDivElement>('#app');
if (!appElement) {
  throw new Error(`${brandConfig.productName}启动失败：缺少应用容器。`);
}
const app: HTMLDivElement = appElement;

document.documentElement.dataset.theme = brandConfig.themeId;
document.title = brandConfig.productName;
document
  .querySelector('meta[name="description"]')
  ?.setAttribute(
    'content',
    `${brandConfig.description}。支持图片转换、逐格编辑、材料计算与制作级导出。`,
  );
app.innerHTML = renderApp();

const shell = required(app, '[data-app-shell]', HTMLElement);
const startWorkspace = required(app, '[data-start-workspace]', HTMLElement);
const previewWorkspace = required(app, '[data-preview-workspace]', HTMLElement);
const patternWorkspace = required(app, '[data-pattern-workspace]', HTMLElement);
const chartWorkspace = required(app, '[data-chart-workspace]', HTMLElement);
const fileInput = required(app, '[data-file-input]', HTMLInputElement);
const projectFileInput = required(app, '[data-project-file-input]', HTMLInputElement);
const dropZone = required(app, '[data-drop-zone]', HTMLLabelElement);
const fileStatus = required(app, '[data-file-status]', HTMLElement);
const projectFileStatus = required(app, '[data-project-file-status]', HTMLElement);
const capabilitiesStatus = required(app, '[data-capabilities-status]', HTMLElement);
const appLive = required(app, '[data-app-live]', HTMLElement);
const sessionStatus = required(app, '[data-session-status]', HTMLElement);
const headerContext = required(app, '[data-header-context]', HTMLElement);
const headerReplace = required(app, '[data-replace-image]', HTMLButtonElement);
const availableColorDialog = requiredVaadinElement(
  app,
  '[data-available-color-dialog]',
  'vaadin-dialog',
);
const confirmationDialog = requiredVaadinElement(
  app,
  '[data-confirmation-dialog]',
  'vaadin-confirm-dialog',
);
const workspaceToolRail = required(patternWorkspace, '[data-tool-rail]', HTMLElement);
const workspaceInspector = required(patternWorkspace, '[data-workspace-inspector]', HTMLElement);
const workspaceSheet = required(patternWorkspace, '[data-workspace-sheet]', HTMLElement);
const workspaceSheetHandle = required(workspaceSheet, '[data-sheet-handle]', HTMLButtonElement);
const desktopInspectorContent = required(
  workspaceInspector,
  '[data-inspector-content]',
  HTMLElement,
);
const mobileSheetContent = required(workspaceSheet, '[data-sheet-content]', HTMLElement);
const patternCanvasFrame = required(patternWorkspace, '.pattern-canvas-frame', HTMLElement);
const selectionContextBar = required(patternCanvasFrame, '[data-selection-context]', HTMLElement);
const selectionDescription = required(
  selectionContextBar,
  '[data-selection-description]',
  HTMLElement,
);
const firstUseHint = required(patternWorkspace, '[data-first-use-hint]', HTMLElement);
const workspaceSurfaceRoots = Object.freeze([workspaceInspector, workspaceSheet]);
let workspacePanelControllers: readonly WorkspacePanelsController[] = Object.freeze([]);

const objectUrls = createObjectUrlStore();
const recommendationRequests = createLatestSourceRequest();
const firstUseHintSession = createFirstUseHintSession();
const previewColorHexById: ReadonlyMap<string, string> = new Map(
  PALETTE_COLORS.map((color) => [color.id, color.displayHex]),
);
const previewColorCodeById: ReadonlyMap<string, string> = new Map(
  PALETTE_COLORS.map((color) => [color.id, color.code]),
);
let firstUseHintTimer: number | null = null;
let appCapabilities: AppCapabilities = FALLBACK_APP_CAPABILITIES;
let capabilitiesDegraded = false;
let stage: AppStage = 'start';
let customerTask: CustomerTask = 'newPattern';
let mirrorChartIntent = false;
let newPatternEntrySupported = true;
let mode: ProjectMode = 'photo';
let prepareState: NewPatternPrepareState | null = null;
let samplingSelection: SamplingSelection = createAutomaticSampling(
  'photo',
  FALLBACK_APP_CAPABILITIES.sampling,
);
let sourceImageSession: SourceImageSession | null = null;
let rotation: ImageRotation = 0;
let cropPercent: CropPercent = { x: 0, y: 0, width: 100, height: 100 };
let aspectLocked = true;
let currentProject: BeadProject | null = null;
let sourceGenerationRevision: number | null = null;
let previewProject: BeadProject | null = null;
let previewStatistics: ProjectStatistics | null = null;
let previewReturnToEditorAvailable = false;
let previewClobberAcknowledged = false;
let firstPreviewGenerationStarted = false;
let previewRegenerationTimer: number | null = null;
let hydratingPreviewControls = false;
let holdOriginalActive = false;
let previewRenderMode: PreviewRenderMode = DEFAULT_PREVIEW_RENDER_MODE;
let backgroundRemovalStatusState: 'ready' | 'loading' | 'error' = 'ready';
let backgroundRemovalStatusMessage = '';
let history: MatrixHistory | null = null;
let canvasController: PatternCanvasController | null = null;
let gridContract: GridDetectionContract | null = null;
let activePanel: InspectorPanel = 'tools';
let previewSheetState: SheetState = 'peek';
let previewSheetMotionState: SheetMotionState | null = null;
let sheetState: SheetState = 'peek';
let sheetMotionState: SheetMotionState | null = null;
let currentSelection: CellSelection | null = null;
let currentSelectionViewportRect: SelectionViewportRect | null = null;
let selectionTransferMode: SelectionTransferMode = null;
let selectionContextPositionFrame = 0;
let selectedColorId = 'mard:A1';
let availableColorIds = new Set(getPalette('mard').colorIds);
let activeTool: EditorTool = 'paint';
let paletteQuery = '';
let paletteScope: 'all' | 'used' | 'recent' = 'all';
let paletteSeries = '';
let prepareColorQuery = '';
let prepareColorSeries = '';
let recentColorIds: readonly string[] = Object.freeze([]);
let exportCompletionState: ExportCompletionState = createExportCompletionState();
let exportReturnFocus: HTMLElement | null = null;
let chartAcknowledgedCandidateId: string | null = null;
let chartDetectionRunning = false;
let chartResultUrl: string | null = null;
let chartAxis: 'horizontal' | 'vertical' = 'horizontal';
let loadRevision = 0;
let preparePresetControls: PreparePresetControlsController | null = null;
let availableColorGridRenderer: AvailableColorGridRenderer | null = null;
let availableColorDialogController: AvailableColorDialogController | null = null;
let boardSelectController: VaadinSelectController | null = null;
let paletteSelectController: VaadinSelectController | null = null;
let availableSeriesSelectController: VaadinSelectController | null = null;
let ditheringSelectController: VaadinSelectController | null = null;
let editorSeriesSelectControllers: readonly VaadinSelectController[] = Object.freeze([]);
let workspaceLayoutMode: WorkspaceLayoutMode | null = null;
let syncingPreparePresetCrop = false;
let confirmationRequest: ConfirmationRequest | null = null;
let confirmationSaving = false;
let confirmationDialogController: ConfirmationDialogController | null = null;
let uploadPrepareRadioControllers: UploadPrepareRadioControllers;
let preparePresetRadioGroupControllers: PreparePresetRadioGroupControllers;
let samplingRadioController: VaadinRadioGroupController;
let previewCompareRadioController: VaadinRadioGroupController;
let paletteScopeRadioControllers: readonly VaadinRadioGroupController[] = Object.freeze([]);
let exportPresetRadioControllers: readonly VaadinRadioGroupController[] = Object.freeze([]);
let exportBackgroundRadioControllers: readonly VaadinRadioGroupController[] = Object.freeze([]);
let exportAppearanceRadioControllers: readonly VaadinRadioGroupController[] = Object.freeze([]);
let responsiveWorkspaceMount: ResponsiveWorkspaceMount;
let gridController: GridEditorController;
let pngExportPreviewState: PngExportPreviewState = Object.freeze({ phase: 'idle' });

const exportCoordinator = createExportCoordinator({
  requestPatternExport: ({ project, format, template, signal }) =>
    exportPattern(project, format, template, signal),
  isOnline: () => navigator.onLine,
  now: () => new Date(),
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (objectUrl) => {
    URL.revokeObjectURL(objectUrl);
  },
  triggerDownload: triggerObjectUrlDownload,
  schedule: (callback) => {
    window.setTimeout(callback, 0);
  },
  onEvent: handleExportEvent,
});

const pngExportPreviewCoordinator = createPngExportPreviewCoordinator({
  createCanvas: () => document.createElement('canvas'),
  render: renderPngExportCanvas,
  encode: encodeCanvasAsPng,
  scheduleFrame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (handle) => {
    window.cancelAnimationFrame(handle);
  },
  onStateChange(state) {
    pngExportPreviewState = state;
    if (state.phase === 'ready') {
      presentPngExportPreview(state.result);
    }
    syncExportCompletionUi();
  },
});

const chartMirrorCoordinator = createChartMirrorCoordinator({
  request: (file, contract, axis, signal) => mirrorGrid(file, contract, axis, signal),
});

const previewCoordinator: PreviewCoordinator = createPreviewCoordinator({
  generate: ({ file, settings }, signal) => generatePattern(file, settings, signal),
  onEvent: handlePreviewCoordinatorEvent,
});

const backgroundRemovalCoordinator: BackgroundRemovalCoordinator =
  createBackgroundRemovalCoordinator({
    remove: createRemovedBackgroundImage,
    currentSourceSessionId: () => sourceImageSession?.id ?? null,
    onDiscard: (image) => {
      objectUrls.revoke(image.objectUrl);
    },
    onEvent: handleBackgroundRemovalCoordinatorEvent,
  });

function activeSourceImage(): SelectedImage | null {
  return sourceImageSession?.active() ?? null;
}

function disposeSourceImageSession(): void {
  backgroundRemovalCoordinator.cancel();
  sourceImageSession?.dispose();
  sourceImageSession = null;
  backgroundRemovalStatusState = 'ready';
  backgroundRemovalStatusMessage = '';
  syncBackgroundRemovalAction();
}

async function createRemovedBackgroundImage(
  input: BackgroundRemovalRequest,
  signal: AbortSignal,
): Promise<SelectedImage> {
  const output = await removeImageBackground(input.image.file, signal);
  signal.throwIfAborted();

  const file = new File([output], foregroundFileName(input.image.file.name), {
    type: 'image/png',
    lastModified: input.image.file.lastModified,
  });
  const objectUrl = objectUrls.create(file);
  try {
    const resource = await decodeImageResourceFromObjectUrl(objectUrl);
    signal.throwIfAborted();
    if (resource.width !== input.image.width || resource.height !== input.image.height) {
      throw new ImageTransformApiError(
        502,
        'BACKGROUND_REMOVAL_DIMENSIONS_INVALID',
        '去背景图片尺寸不一致。原图和当前图纸已保留，请稍后重试。',
      );
    }
    return Object.freeze({
      file,
      objectUrl,
      width: resource.width,
      height: resource.height,
      image: resource.image,
      mimeType: 'image/png',
    });
  } catch (error) {
    objectUrls.revoke(objectUrl);
    throw error;
  }
}

function foregroundFileName(fileName: string): string {
  const baseName = fileName.replace(/\.[^.]+$/u, '').trim() || 'image';
  return `${baseName}-foreground.png`;
}

function handleBackgroundRemovalCoordinatorEvent(event: BackgroundRemovalCoordinatorEvent): void {
  if (event.type === 'started') {
    setBackgroundRemovalStatus('正在本机去除背景，请稍候…', 'loading');
    syncBackgroundRemovalAction();
    return;
  }
  if (event.type === 'failed') {
    const message =
      event.error instanceof ImageTransformApiError
        ? event.error.message
        : '无法完成一键去背景。原图和当前图纸已保留，请稍后重试。';
    setBackgroundRemovalStatus(message, 'error');
    syncBackgroundRemovalAction();
    announce(message);
    return;
  }

  const session = sourceImageSession;
  if (!session) {
    objectUrls.revoke(event.result.objectUrl);
    return;
  }
  session.cacheForeground(event.result);
  setBackgroundRemovalStatus('已保留主体；可随时恢复原图。', 'ready');
  activateSourceVariant('foreground');
  announce('去背景完成，已更新拼豆预览。');
}

function requestBackgroundRemovalAction(): void {
  const session = sourceImageSession;
  if (!session || !appCapabilities.backgroundRemoval.available) {
    return;
  }
  const hasEditedCells =
    currentProject !== null &&
    sourceGenerationRevision !== null &&
    currentProject.revision !== sourceGenerationRevision;
  guardBackgroundRemovalChange({
    hasEditedCells,
    openConfirmation(request) {
      openConfirmation({
        ...request,
        onContinue() {
          previewClobberAcknowledged = true;
          request.onContinue();
        },
      });
    },
    apply() {
      const currentSession = sourceImageSession;
      if (!currentSession || currentSession.id !== session.id) {
        return;
      }
      if (currentSession.hasForeground()) {
        const variant = currentSession.activeVariant() === 'foreground' ? 'original' : 'foreground';
        setBackgroundRemovalStatus(
          variant === 'original'
            ? '已恢复原图；可再次使用去背景图。'
            : '已切换到去背景图；可随时恢复原图。',
          'ready',
        );
        activateSourceVariant(variant);
        return;
      }
      backgroundRemovalCoordinator.request({
        sourceSessionId: currentSession.id,
        image: currentSession.original,
      });
    },
  });
}

function activateSourceVariant(variant: SourceImageVariant): void {
  const session = sourceImageSession;
  if (!session) return;
  activateBackgroundRemovalVariant({
    session,
    variant,
    onActiveImage(_image, activeVariant) {
      required(
        previewWorkspace,
        '[data-preview-original-view]',
        HTMLElement,
      ).dataset.sourceImageVariant = activeVariant;
      required(
        previewWorkspace,
        '[data-preview-adjust-view]',
        HTMLElement,
      ).dataset.sourceImageVariant = activeVariant;
      drawCropPreview();
      drawAlignedOriginalCanvas();
      renderCropSelection();
      updatePrepareSummaries();
      syncBackgroundRemovalAction();
    },
    regenerate() {
      clearPreviewRegenerationTimer();
      startPreviewGeneration();
    },
  });
}

function setBackgroundRemovalStatus(message: string, state: 'ready' | 'loading' | 'error'): void {
  backgroundRemovalStatusMessage = message;
  backgroundRemovalStatusState = state;
  syncBackgroundRemovalStatus();
}

function syncBackgroundRemovalStatus(): void {
  const status = required(previewWorkspace, '[data-background-removal-status]', HTMLElement);
  const messageNode = required(status, '[data-background-removal-status-message]', HTMLElement);
  messageNode.textContent = backgroundRemovalStatusMessage;
  status.dataset.state = backgroundRemovalStatusState;
  status.hidden = backgroundRemovalStatusMessage.length === 0;
}

function syncBackgroundRemovalAction(): void {
  const control = required(previewWorkspace, '[data-background-removal-control]', HTMLElement);
  const action = required(control, '[data-background-removal-action]', HTMLButtonElement);
  const compactLabel = required(action, '[data-background-removal-label-short]', HTMLElement);
  const longLabel = required(action, '[data-background-removal-label-long]', HTMLElement);
  const available = appCapabilities.backgroundRemoval.available;
  const session = sourceImageSession;
  const busy = backgroundRemovalCoordinator.activeRequestId() !== null;
  const actionState = resolveBackgroundRemovalActionState({
    capabilityAvailable: available,
    hasSource: session !== null,
    hasForeground: session?.hasForeground() ?? false,
    activeVariant: session?.activeVariant() ?? 'original',
    busy,
  });
  action.disabled = actionState.disabled;
  action.setAttribute('aria-label', actionState.label);
  compactLabel.textContent = actionState.compactLabel;
  longLabel.textContent = actionState.label;
  if (actionState.unavailableMessage !== null) {
    setBackgroundRemovalStatus(actionState.unavailableMessage, 'error');
  }
  syncBackgroundRemovalStatus();
  const originalView = required(previewWorkspace, '[data-preview-original-view]', HTMLElement);
  originalView.dataset.sourceImageVariant = session?.activeVariant() ?? 'original';
  required(previewWorkspace, '[data-preview-adjust-view]', HTMLElement).dataset.sourceImageVariant =
    session?.activeVariant() ?? 'original';
}

const previewView: PreviewViewController = createPreviewView({
  root: previewWorkspace,
  colorHexById: previewColorHexById,
  colorCodeById: previewColorCodeById,
  onShowOriginal() {
    drawAlignedOriginalCanvas();
  },
});

void bootstrap();

async function bootstrap(): Promise<void> {
  await waitForVaadinDefinitions();
  await initializeRadioGroupControllers();
  workspacePanelControllers = Object.freeze([
    createWorkspacePanels(desktopInspectorContent),
    createWorkspacePanels(mobileSheetContent),
  ]);
  setupStart();
  setupPreview();
  setupPatternWorkspace();
  responsiveWorkspaceMount = createResponsiveWorkspaceMount({
    root: patternWorkspace,
    inspector: workspaceInspector,
    sheet: workspaceSheet,
  });
  updateWorkspaceLayout();
  gridController = setupChartWorkspace();
  setupReplacementActions();
  setupConfirmationSurface();
  setupPreviewCanvasResize();
  window.addEventListener('resize', updateWorkspaceLayout);
  window.addEventListener('orientationchange', updateWorkspaceLayout);
  window.visualViewport?.addEventListener('resize', handleVisualViewportChange);
  window.visualViewport?.addEventListener('scroll', handleVisualViewportChange);
  window.addEventListener('beforeunload', cleanup);
  syncUploadPrepareControls(uploadPrepareRadioControllers, currentUploadPrepareFlow());
  syncSamplingControls(samplingRadioController, samplingSelection);
  showStage('start');
  await initializeCapabilities();
}

async function waitForVaadinDefinitions(): Promise<void> {
  await Promise.all(
    [
      'vaadin-button',
      'vaadin-checkbox',
      'vaadin-confirm-dialog',
      'vaadin-dialog',
      'vaadin-radio-button',
      'vaadin-radio-group',
      'vaadin-select',
      'vaadin-text-field',
    ].map((tagName) => customElements.whenDefined(tagName)),
  );
}

async function initializeRadioGroupControllers(): Promise<void> {
  const modePreferenceGroup = requiredVaadinElement(
    previewWorkspace,
    '[data-mode-preference]',
    'vaadin-radio-group',
  );
  const samplingGroup = requiredVaadinElement(
    previewWorkspace,
    '[data-sampling]',
    'vaadin-radio-group',
  );
  const compareGroup = requiredVaadinElement(
    previewWorkspace,
    '[data-compare-switch]',
    'vaadin-radio-group',
  );
  const presetGroups = {
    patternSize: requiredVaadinElement(
      previewWorkspace,
      '[data-pattern-size-preset]',
      'vaadin-radio-group',
    ),
    beadSize: requiredVaadinElement(
      previewWorkspace,
      '[data-bead-size-preset]',
      'vaadin-radio-group',
    ),
    colorCount: requiredVaadinElement(
      previewWorkspace,
      '[data-color-count-preset]',
      'vaadin-radio-group',
    ),
    visualStyle: requiredVaadinElement(
      previewWorkspace,
      '[data-visual-style-preset]',
      'vaadin-radio-group',
    ),
  };
  const paletteGroups = queryPatternWorkspaceElements('[data-color-filter]', 'vaadin-radio-group');
  const exportPresetGroups = queryPatternWorkspaceElements(
    '[data-export-preset-options]',
    'vaadin-radio-group',
  );
  const exportBackgroundGroups = queryPatternWorkspaceElements(
    '[data-export-background-options]',
    'vaadin-radio-group',
  );
  const exportAppearanceGroups = queryPatternWorkspaceElements(
    '[data-export-appearance-options]',
    'vaadin-radio-group',
  );

  const [
    modePreferenceController,
    nextSamplingController,
    compareController,
    patternSizeController,
    beadSizeController,
    colorCountController,
    visualStyleController,
    nextPaletteControllers,
    nextExportPresetControllers,
    nextExportBackgroundControllers,
    nextExportAppearanceControllers,
  ] = await Promise.all([
    createVaadinRadioGroupController({
      element: modePreferenceGroup,
      initialValue: 'auto',
    }),
    createVaadinRadioGroupController({
      element: samplingGroup,
      initialValue: samplingSelection.value,
    }),
    createVaadinRadioGroupController({
      element: compareGroup,
      initialValue: 'pattern',
    }),
    createVaadinRadioGroupController({
      element: presetGroups.patternSize,
      initialValue: '48',
    }),
    createVaadinRadioGroupController({
      element: presetGroups.beadSize,
      initialValue: '5',
    }),
    createVaadinRadioGroupController({
      element: presetGroups.colorCount,
      initialValue: '24',
    }),
    createVaadinRadioGroupController({
      element: presetGroups.visualStyle,
      initialValue: 'natural',
    }),
    Promise.all(
      paletteGroups.map((element) =>
        createVaadinRadioGroupController({ element, initialValue: paletteScope }),
      ),
    ),
    Promise.all(
      exportPresetGroups.map((element) =>
        createVaadinRadioGroupController({
          element,
          initialValue: 'annotated',
        }),
      ),
    ),
    Promise.all(
      exportBackgroundGroups.map((element) =>
        createVaadinRadioGroupController({
          element,
          initialValue: exportCompletionState.pngConfiguration.background,
        }),
      ),
    ),
    Promise.all(
      exportAppearanceGroups.map((element) =>
        createVaadinRadioGroupController({
          element,
          initialValue: exportCompletionState.pngConfiguration.appearance,
        }),
      ),
    ),
  ]);

  uploadPrepareRadioControllers = Object.freeze({
    modePreference: modePreferenceController,
  });
  samplingRadioController = nextSamplingController;
  previewCompareRadioController = compareController;
  preparePresetRadioGroupControllers = Object.freeze({
    patternSize: patternSizeController,
    beadSize: beadSizeController,
    colorCount: colorCountController,
    visualStyle: visualStyleController,
  });
  paletteScopeRadioControllers = Object.freeze(nextPaletteControllers);
  exportPresetRadioControllers = Object.freeze(nextExportPresetControllers);
  exportBackgroundRadioControllers = Object.freeze(nextExportBackgroundControllers);
  exportAppearanceRadioControllers = Object.freeze(nextExportAppearanceControllers);
}

async function initializeCapabilities(): Promise<void> {
  const resolution = await loadAppCapabilities();
  const paletteMismatch =
    resolution.source === 'remote' &&
    resolution.capabilities.paletteSourceVersion !== PALETTE_SOURCE_VERSION;
  appCapabilities = paletteMismatch ? FALLBACK_APP_CAPABILITIES : resolution.capabilities;
  capabilitiesDegraded = paletteMismatch || resolution.source === 'fallback';
  applyCapabilitiesToInterface();

  const warning = paletteMismatch ? '在线色板暂不可用，已切换到内置色板。' : resolution.message;
  capabilitiesStatus.textContent = warning ?? '';
  capabilitiesStatus.hidden = warning === null;
}

function applyCapabilitiesToInterface(): void {
  fileInput.accept = appCapabilities.upload.mimeTypes.join(',');
  syncBackgroundRemovalAction();
  const mimeLabels = appCapabilities.upload.mimeTypes
    .map((mimeType) =>
      mimeType === 'image/jpeg' ? 'JPEG' : mimeType === 'image/webp' ? 'WebP' : 'PNG',
    )
    .join('、');
  required(app, '[data-upload-constraints]', HTMLElement).textContent =
    `${mimeLabels}，最大 ${formatFileSize(appCapabilities.upload.maximumBytes)}`;

  newPatternEntrySupported = appCapabilities.modes.some(
    (candidate) => candidate === 'photo' || candidate === 'pixelArt',
  );
  const newPatternEntry = required(app, '[data-new-pattern-entry]', HTMLLabelElement);
  newPatternEntry.classList.toggle('is-disabled', !newPatternEntrySupported);
  newPatternEntry.setAttribute('aria-disabled', String(!newPatternEntrySupported));
  required(app, '[data-mirror-existing-chart]', HTMLButtonElement).disabled =
    !appCapabilities.modes.includes('existingChart');
  syncUploadPrepareControls(uploadPrepareRadioControllers, currentUploadPrepareFlow());

  applyIntegerLimits(
    required(previewWorkspace, '[data-columns]', HTMLInputElement),
    appCapabilities.grid.minimumColumns,
    appCapabilities.grid.maximumColumns,
  );
  applyIntegerLimits(
    required(previewWorkspace, '[data-rows]', HTMLInputElement),
    appCapabilities.grid.minimumRows,
    appCapabilities.grid.maximumRows,
  );
  applyDecimalLimits(
    required(previewWorkspace, '[data-bead-diameter]', HTMLInputElement),
    appCapabilities.beads.minimumDiameterMm,
    appCapabilities.beads.maximumDiameterMm,
  );
  applyDecimalLimits(
    required(previewWorkspace, '[data-bead-pitch]', HTMLInputElement),
    appCapabilities.beads.minimumPitchMm,
    appCapabilities.beads.maximumPitchMm,
  );
  applyIntegerLimits(
    required(previewWorkspace, '[data-custom-board-rows]', HTMLInputElement),
    appCapabilities.boards.custom.minimumRows,
    appCapabilities.boards.custom.maximumRows,
  );
  applyIntegerLimits(
    required(previewWorkspace, '[data-custom-board-columns]', HTMLInputElement),
    appCapabilities.boards.custom.minimumColumns,
    appCapabilities.boards.custom.maximumColumns,
  );

  const boardOptions = boardSelectOptions().map((option) =>
    Object.freeze({
      ...option,
      disabled:
        option.id !== 'custom' && !Object.hasOwn(appCapabilities.boards.fixedPresets, option.id),
    }),
  );
  boardSelectController?.setOptions(boardOptions);
  const currentBoard = selectValue(previewWorkspace, '[data-board-preset]', 'standardSquare');
  if (boardOptions.find((option) => option.id === currentBoard)?.disabled) {
    const fallbackBoard = boardOptions.find((option) => !option.disabled);
    if (fallbackBoard) {
      boardSelectController?.setValue(fallbackBoard.id);
    }
  }
  const customBoardFields = required(
    previewWorkspace,
    '[data-custom-board-fields]',
    HTMLFieldSetElement,
  );
  const customBoardSelected =
    selectValue(previewWorkspace, '[data-board-preset]', 'standardSquare') === 'custom';
  customBoardFields.hidden = !customBoardSelected;
  customBoardFields.disabled = !customBoardSelected;

  const samplingGroup = requiredVaadinElement(
    previewWorkspace,
    '[data-sampling]',
    'vaadin-radio-group',
  );
  for (const option of samplingGroup.querySelectorAll<HTMLElementTagNameMap['vaadin-radio-button']>(
    'vaadin-radio-button',
  )) {
    option.disabled = !appCapabilities.sampling.includes(option.value as 'average' | 'nearest');
  }
  const nearestSamplingSupported = appCapabilities.sampling.includes('nearest');
  const gradientDitheringSupported = appCapabilities.dithering.includes('floydSteinberg');
  for (const option of previewWorkspace.querySelectorAll<
    HTMLElementTagNameMap['vaadin-radio-button']
  >('[data-visual-style-preset] vaadin-radio-button')) {
    option.disabled =
      (option.value === 'clearBlocks' && !nearestSamplingSupported) ||
      (option.value === 'smoothGradient' && !gradientDitheringSupported);
  }
  if (!appCapabilities.sampling.includes(samplingSelection.value)) {
    samplingSelection = createAutomaticSampling(
      firstSupportedNewPatternMode(),
      appCapabilities.sampling,
    );
  }
  syncSamplingControls(samplingRadioController, samplingSelection);
  preparePresetControls?.setSampling(samplingSelection.value);
  const ditheringOptions = ditheringSelectOptions().map((option) =>
    Object.freeze({
      ...option,
      disabled: !appCapabilities.dithering.includes(option.id as 'none' | 'floydSteinberg'),
    }),
  );
  ditheringSelectController?.setOptions(ditheringOptions);
  const selectedDithering =
    ditheringSelectController?.selectedId() ??
    selectValue(previewWorkspace, '[data-dithering]', 'none');
  if (ditheringOptions.find((option) => option.id === selectedDithering)?.disabled) {
    const fallbackDithering = ditheringOptions.find((option) => !option.disabled);
    if (fallbackDithering) {
      ditheringSelectController?.setValue(fallbackDithering.id);
      preparePresetControls?.setDithering(
        fallbackDithering.id === 'floydSteinberg' ? 'floydSteinberg' : 'none',
      );
    }
  } else {
    preparePresetControls?.setDithering(
      selectedDithering === 'floydSteinberg' ? 'floydSteinberg' : 'none',
    );
  }
  for (const button of queryPatternWorkspaceAll('[data-export-format]', HTMLButtonElement)) {
    const format =
      button.dataset.exportFormat === 'json' ? 'projectJson' : button.dataset.exportFormat;
    button.disabled =
      button.dataset.exportTask !== 'shareImage' &&
      !appCapabilities.exports.includes(format as 'png' | 'pdf' | 'csv' | 'projectJson');
  }
  syncExportCompletionUi();
  if (prepareState) {
    applyPrepareModeState();
  }
  syncChartConfirmationUi();
}

function setupStart(): void {
  const newPatternEntry = required(app, '[data-new-pattern-entry]', HTMLLabelElement);
  newPatternEntry.addEventListener('click', (event) => {
    mirrorChartIntent = false;
    if (!newPatternEntrySupported) {
      event.preventDefault();
      setFileStatus('当前服务暂不支持制作新图纸，请稍后再试。', 'error');
    }
  });
  required(app, '[data-mirror-existing-chart]', HTMLButtonElement).addEventListener('click', () => {
    mirrorChartIntent = true;
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    void acceptFiles(fileInput.files ? [...fileInput.files] : []);
    fileInput.value = '';
  });
  projectFileInput.addEventListener('change', () => {
    const file = projectFileInput.files?.[0];
    projectFileInput.value = '';
    if (file) {
      void openProjectFile(file);
    }
  });

  for (const eventName of ['dragenter', 'dragover']) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add('is-dragging');
    });
  }
  for (const eventName of ['dragleave', 'drop']) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove('is-dragging');
    });
  }
  dropZone.addEventListener('drop', (event) => {
    mirrorChartIntent = false;
    void acceptFiles(event.dataTransfer?.files ? [...event.dataTransfer.files] : []);
  });
}

async function acceptFiles(files: readonly File[]): Promise<void> {
  const requestRevision = ++loadRevision;
  const routeToChartMirror = mirrorChartIntent;
  mirrorChartIntent = false;
  const result = validateSingleImageFile(files, {
    mimeTypes: appCapabilities.upload.mimeTypes,
    maximumBytes: appCapabilities.upload.maximumBytes,
  });
  if (!result.ok) {
    setFileStatus(result.message, 'error');
    return;
  }
  if (!routeToChartMirror && !newPatternEntrySupported) {
    setFileStatus('当前服务暂不支持制作新图纸，请稍后再试。', 'error');
    return;
  }
  previewCoordinator.cancel();
  clearPreviewRegenerationTimer();
  exportCoordinator.invalidate();
  chartMirrorCoordinator.cancel();
  recommendationRequests.cancel();
  setFileStatus(`正在读取 ${result.file.name}…`, 'loading');
  setPreviewStatus('reading');
  disposeSourceImageSession();
  const objectUrl = objectUrls.create(result.file);

  try {
    const resource = await decodeImageResourceFromObjectUrl(objectUrl);
    if (requestRevision !== loadRevision) {
      objectUrls.revoke(objectUrl);
      return;
    }
    if (resource.width * resource.height > appCapabilities.upload.maximumDecodedPixels) {
      objectUrls.revoke(objectUrl);
      setFileStatus(
        `图片解码后共有 ${String(resource.width * resource.height)} 像素，超过 ${String(
          appCapabilities.upload.maximumDecodedPixels,
        )} 像素上限。请缩小图片后重试。`,
        'error',
      );
      return;
    }
    sourceImageSession = createSourceImageSession(
      {
        file: result.file,
        objectUrl,
        width: resource.width,
        height: resource.height,
        image: resource.image,
        mimeType: result.mimeType,
      },
      { revokeObjectUrl: objectUrls.revoke },
    );
    setBackgroundRemovalStatus('', 'ready');
    syncBackgroundRemovalAction();
    rotation = 0;
    cropPercent = { x: 0, y: 0, width: 100, height: 100 };
    currentProject = null;
    sourceGenerationRevision = null;
    previewProject = null;
    previewStatistics = null;
    history = null;
    canvasController?.destroy();
    canvasController = null;
    projectFileStatus.textContent = '';
    setFileStatus('图片已载入。', 'ready');
    if (routeToChartMirror) {
      mode = 'existingChart';
      applyUploadPrepareFlow(
        Object.freeze({ customerTask: 'mirrorExistingChart', prepareState: null }),
      );
      openChartWorkspace();
    } else {
      const recommendationRequest = recommendationRequests.begin();
      applyUploadPrepareFlow(
        beginUploadedImage(
          Object.freeze({ customerTask: 'newPattern', prepareState: null }),
          recommendationRequest.token,
        ),
      );
      mode = firstSupportedNewPatternMode();
      samplingSelection = createAutomaticSampling(mode, appCapabilities.sampling);
      syncSamplingControls(samplingRadioController, samplingSelection);
      openPreviewWorkspace();
      void completeImageRecommendation(
        resource.image,
        result.mimeType,
        recommendationRequest.token,
        recommendationRequest.signal,
      );
    }
  } catch {
    if (requestRevision !== loadRevision) {
      return;
    }
    if (sourceImageSession?.original.objectUrl === objectUrl) {
      disposeSourceImageSession();
    } else {
      objectUrls.revoke(objectUrl);
    }
    syncBackgroundRemovalAction();
    setFileStatus('无法读取这张图片，请确认文件没有损坏。', 'error');
  }
}

async function completeImageRecommendation(
  image: HTMLImageElement,
  mimeType: string,
  sourceToken: number,
  signal: AbortSignal,
): Promise<void> {
  try {
    const result = await recommendDecodedImageMode(
      { image, mimeType, sourceToken },
      {
        maximumDecodedPixels: appCapabilities.upload.maximumDecodedPixels,
        signal,
      },
    );
    if (!recommendationRequests.isCurrent(sourceToken) || prepareState?.task !== 'newPattern') {
      return;
    }
    prepareState = updateRecommendation(prepareState, result);
    applyPrepareModeState();
  } catch (error) {
    if (signal.aborted || isAbortError(error)) return;
    if (prepareState?.task === 'newPattern' && prepareState.sourceToken === sourceToken) {
      required(previewWorkspace, '[data-mode-recommendation]', HTMLElement).textContent =
        '暂时无法自动分析这张图片，请在这里选择“自然图片”或“清晰像素”。';
      setPreviewStatus('analyzing');
    }
  }
}

function applyPrepareModeState(allowRegeneration = true): void {
  const state = prepareState;
  if (!state) return;
  syncUploadPrepareControls(uploadPrepareRadioControllers, currentUploadPrepareFlow());
  const status = required(previewWorkspace, '[data-mode-recommendation]', HTMLElement);
  if (state.recommendationStatus === 'analyzing' && state.resolvedMode === null) {
    mode = firstSupportedNewPatternMode();
    status.textContent = state.reason;
    updateSamplingDefault();
    if (stage === 'preview') {
      setPreviewStatus('analyzing');
    }
    return;
  }
  const requestedMode = state.resolvedMode ?? firstSupportedNewPatternMode();
  let supportedMode: NewPatternMode;
  try {
    supportedMode = resolveSupportedNewPatternMode(
      state.preference,
      requestedMode,
      appCapabilities.modes,
    );
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : '当前服务暂不支持制作新图纸。';
    if (stage === 'preview') {
      setPreviewStatus('failure');
    }
    return;
  }
  mode = supportedMode;
  const fallbackMessage =
    supportedMode === requestedMode
      ? ''
      : ` 当前服务暂不支持这项处理，生成时将使用${
          supportedMode === 'photo' ? '自然图片' : '清晰像素'
        }。`;
  status.textContent = `${state.reason}${fallbackMessage}`;
  updateSamplingDefault();
  if (stage === 'preview' && allowRegeneration) {
    if (firstPreviewGenerationStarted) {
      schedulePreviewRegeneration();
    } else {
      startPreviewGeneration();
    }
  }
}

function firstSupportedNewPatternMode(): NewPatternMode {
  return (
    appCapabilities.modes.find(
      (candidate): candidate is NewPatternMode => candidate === 'photo' || candidate === 'pixelArt',
    ) ?? 'photo'
  );
}

async function openProjectFile(file: File): Promise<void> {
  const requestRevision = ++loadRevision;
  previewCoordinator.cancel();
  clearPreviewRegenerationTimer();
  exportCoordinator.invalidate();
  chartMirrorCoordinator.cancel();
  recommendationRequests.cancel();
  if (file.size > MAX_PROJECT_JSON_BYTES) {
    projectFileStatus.textContent = `项目文件超过 ${formatFileSize(
      MAX_PROJECT_JSON_BYTES,
    )} 上限，无法安全打开。`;
    projectFileStatus.dataset.state = 'error';
    return;
  }

  projectFileStatus.textContent = `正在打开 ${file.name}…`;
  projectFileStatus.dataset.state = 'loading';
  try {
    const project = parseProjectJsonText(await file.text());
    if (requestRevision !== loadRevision) {
      return;
    }
    disposeSourceImageSession();
    rotation = project.source.rotation;
    cropPercent = { x: 0, y: 0, width: 100, height: 100 };
    mode = project.mode;
    applyUploadPrepareFlow(flowFromImportedProject(project.mode));
    samplingSelection = chooseSampling(
      createAutomaticSampling(
        project.mode === 'pixelArt' ? 'pixelArt' : 'photo',
        appCapabilities.sampling,
      ),
      project.generation.sampling,
      'project',
    );
    syncSamplingControls(samplingRadioController, samplingSelection);
    currentProject = project;
    sourceGenerationRevision = null;
    previewProject = null;
    previewStatistics = null;
    availableColorIds = new Set(project.palette.availableColorIds);
    selectedColorId =
      Object.keys(calculateStatistics(project.cells).perColorCounts)[0] ??
      project.palette.availableColorIds[0] ??
      selectedColorId;
    history = new MatrixHistory(project.cells, 100, project.revision);
    currentSelection = null;
    openPatternEditor(project);
    projectFileStatus.textContent = `已打开 ${file.name}，可以继续编辑。`;
    projectFileStatus.dataset.state = 'ready';
    sessionStatus.textContent = '项目已恢复';
    announce('项目已恢复，可以继续编辑。');
  } catch (error) {
    if (requestRevision !== loadRevision) {
      return;
    }
    const message =
      error instanceof ProjectImportError
        ? error.message
        : '无法读取项目文件，请确认文件没有损坏。';
    projectFileStatus.textContent = message;
    projectFileStatus.dataset.state = 'error';
  }
}

function setupPreview(): void {
  const prepareReplace = required(previewWorkspace, '[data-prepare-replace]', HTMLButtonElement);
  const holdOriginalButton = required(previewWorkspace, '[data-hold-original]', HTMLButtonElement);
  const adjustSourceButton = required(previewWorkspace, '[data-adjust-source]', HTMLButtonElement);
  const finishSourceAdjustButton = required(
    previewWorkspace,
    '[data-finish-source-adjust]',
    HTMLButtonElement,
  );
  const backgroundRemovalAction = required(
    previewWorkspace,
    '[data-background-removal-action]',
    HTMLButtonElement,
  );
  const panelToggle = required(previewWorkspace, '[data-preview-panel-toggle]', HTMLButtonElement);
  const previewControlSurface = required(
    previewWorkspace,
    '[data-preview-control-surface]',
    HTMLElement,
  );
  const previewSheetDragRegion = required(
    previewControlSurface,
    '[data-preview-sheet-drag-region]',
    HTMLElement,
  );
  let previewSheetGesture: {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly startY: number;
    readonly startHeight: number;
    readonly toggleOnTap: boolean;
    currentHeight: number;
    lastY: number;
    lastTime: number;
    pointerVelocityY: number;
    moved: boolean;
  } | null = null;
  const rotateLeft = required(previewWorkspace, '[data-rotate-left]', HTMLButtonElement);
  const rotateRight = required(previewWorkspace, '[data-rotate-right]', HTMLButtonElement);
  const columnsInput = required(previewWorkspace, '[data-columns]', HTMLInputElement);
  const rowsInput = required(previewWorkspace, '[data-rows]', HTMLInputElement);
  const aspectButton = required(previewWorkspace, '[data-aspect-lock]', HTMLButtonElement);
  const boardPreset = requiredVaadinElement(
    previewWorkspace,
    '[data-board-preset]',
    'vaadin-select',
  );
  const paletteSelect = requiredVaadinElement(
    previewWorkspace,
    '[data-palette-id]',
    'vaadin-select',
  );
  const maximumColors = required(previewWorkspace, '[data-maximum-colors]', HTMLInputElement);
  const alphaThreshold = required(previewWorkspace, '[data-alpha-threshold]', HTMLInputElement);
  const beadDiameter = required(previewWorkspace, '[data-bead-diameter]', HTMLInputElement);
  const beadPitch = required(previewWorkspace, '[data-bead-pitch]', HTMLInputElement);
  const customBoardFields = required(
    previewWorkspace,
    '[data-custom-board-fields]',
    HTMLFieldSetElement,
  );
  const customBoardRows = required(previewWorkspace, '[data-custom-board-rows]', HTMLInputElement);
  const customBoardColumns = required(
    previewWorkspace,
    '[data-custom-board-columns]',
    HTMLInputElement,
  );
  const openAvailableColors = requiredVaadinElement(
    previewWorkspace,
    '[data-open-available-colors]',
    'vaadin-button',
  );
  const availableColorTemplate = required(
    previewWorkspace,
    '[data-available-color-dialog-template]',
    HTMLTemplateElement,
  );
  availableColorDialogController = createAvailableColorDialog({
    dialog: availableColorDialog,
    template: availableColorTemplate,
    trigger: openAvailableColors,
  });
  const {
    selectAll: selectAllColors,
    clearAll: clearAllColors,
    grid: availableColorGrid,
    search: availableColorSearch,
    series: availableColorSeries,
    status: availableColorStatus,
  } = availableColorDialogController;
  const editPatternButton = required(previewWorkspace, '[data-edit-pattern]', HTMLButtonElement);
  const returnEditorButton = required(previewWorkspace, '[data-return-editor]', HTMLButtonElement);

  prepareReplace.addEventListener('click', handleReplaceImageClick);
  backgroundRemovalAction.addEventListener('click', requestBackgroundRemovalAction);
  for (const button of previewWorkspace.querySelectorAll<HTMLButtonElement>(
    '[data-preview-mode]',
  )) {
    button.addEventListener('click', () => {
      setPreviewRenderMode(createPreviewModeSelection(button.dataset.previewMode));
    });
  }
  adjustSourceButton.addEventListener('click', () => {
    previewView.applyCompareView('adjust');
    drawCropPreview();
    renderCropSelection();
    announce('正在调整原图；完成后可继续严格对比。');
  });
  finishSourceAdjustButton.addEventListener('click', () => {
    previewCompareRadioController.setValue('original');
    applyPreviewCompareView('original');
    announce('原图调整完成，已返回对齐对比。');
  });
  holdOriginalButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    holdOriginalActive = true;
    applyPreviewCompareView(currentPreviewCompareValue() === 'pattern' ? 'original' : 'pattern');
  });
  const endHoldOriginal = (): void => {
    if (!holdOriginalActive) return;
    holdOriginalActive = false;
    applyPreviewCompareView(currentPreviewCompareValue());
  };
  holdOriginalButton.addEventListener('pointerup', endHoldOriginal);
  holdOriginalButton.addEventListener('pointercancel', endHoldOriginal);
  holdOriginalButton.addEventListener('lostpointercapture', endHoldOriginal);
  holdOriginalButton.addEventListener('keydown', (event) => {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
      event.preventDefault();
      holdOriginalActive = true;
      applyPreviewCompareView(currentPreviewCompareValue() === 'pattern' ? 'original' : 'pattern');
    }
  });
  holdOriginalButton.addEventListener('keyup', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      endHoldOriginal();
    }
  });
  holdOriginalButton.addEventListener('blur', endHoldOriginal);
  panelToggle.addEventListener('click', (event) => {
    if (event.detail !== 0) {
      return;
    }
    setPreviewSheetState(nextSheetState(previewSheetState));
  });
  previewSheetDragRegion.addEventListener('pointerdown', (event) => {
    const target = event.target;
    const interactive =
      target instanceof Element
        ? target.closest('button, input, textarea, select, a, [role="button"]')
        : null;
    if (interactive && !panelToggle.contains(interactive)) {
      return;
    }
    const currentHeight =
      previewSheetMotionState?.height ?? previewControlSurface.getBoundingClientRect().height;
    previewSheetGesture = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startY: event.clientY,
      startHeight: currentHeight,
      toggleOnTap: target instanceof Node && panelToggle.contains(target),
      currentHeight,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      pointerVelocityY: 0,
      moved: false,
    };
    previewControlSurface.dataset.previewSheetDragging = 'true';
    previewSheetDragRegion.setPointerCapture(event.pointerId);
  });
  previewSheetDragRegion.addEventListener('pointermove', (event) => {
    if (!previewSheetGesture || previewSheetGesture.pointerId !== event.pointerId) {
      return;
    }
    const snapPoints = previewSheetSnapPoints();
    const height = dragSheetHeight({
      startHeight: previewSheetGesture.startHeight,
      startPointerY: previewSheetGesture.startY,
      pointerY: event.clientY,
      snapPoints,
    });
    const elapsed = event.timeStamp - previewSheetGesture.lastTime;
    if (elapsed > 0) {
      previewSheetGesture.pointerVelocityY = (event.clientY - previewSheetGesture.lastY) / elapsed;
    }
    previewSheetGesture.lastY = event.clientY;
    previewSheetGesture.lastTime = event.timeStamp;
    previewSheetGesture.currentHeight = height;
    previewSheetGesture.moved ||= didSheetGestureMove(
      previewSheetGesture.startY,
      event.clientY,
      previewSheetGesture.pointerType,
    );
    previewSheetMotionState = reduceSheetMotion(
      previewSheetMotionState ?? createSheetMotionState(previewSheetState, snapPoints),
      { type: 'drag', height },
    );
    previewControlSurface.style.setProperty('--preview-sheet-height', `${String(height)}px`);
    event.preventDefault();
  });
  previewSheetDragRegion.addEventListener('pointerup', (event) => {
    if (!previewSheetGesture || previewSheetGesture.pointerId !== event.pointerId) {
      return;
    }
    const elapsed = event.timeStamp - previewSheetGesture.lastTime;
    const releaseDeltaY = event.clientY - previewSheetGesture.lastY;
    if (elapsed > 0 && Math.abs(releaseDeltaY) > 0.5) {
      previewSheetGesture.pointerVelocityY = releaseDeltaY / elapsed;
    } else if (elapsed > 80) {
      previewSheetGesture.pointerVelocityY = 0;
    }
    const snapPoints = previewSheetSnapPoints();
    previewSheetGesture.currentHeight = dragSheetHeight({
      startHeight: previewSheetGesture.startHeight,
      startPointerY: previewSheetGesture.startY,
      pointerY: event.clientY,
      snapPoints,
    });
    const motion = reduceSheetMotion(
      previewSheetMotionState ?? createSheetMotionState(previewSheetState, snapPoints),
      {
        type: 'pointerup',
        height: previewSheetGesture.currentHeight,
        pointerVelocityY: previewSheetGesture.pointerVelocityY,
      },
    );
    const toggleOnTap = previewSheetGesture.toggleOnTap && !previewSheetGesture.moved;
    previewSheetGesture = null;
    previewSheetMotionState = motion;
    previewControlSurface.style.removeProperty('--preview-sheet-height');
    delete previewControlSurface.dataset.previewSheetDragging;
    if (toggleOnTap) {
      setPreviewSheetState(nextSheetState(previewSheetState));
    } else {
      applyPreviewSheetState(motion.stableState);
    }
    if (previewSheetDragRegion.hasPointerCapture(event.pointerId)) {
      previewSheetDragRegion.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
  });
  registerSheetGestureCancellation(previewSheetDragRegion, (event) => {
    if (
      !previewSheetGesture ||
      (event instanceof PointerEvent && event.pointerId !== previewSheetGesture.pointerId)
    ) {
      return;
    }
    const snapPoints = previewSheetSnapPoints();
    const motion = reduceSheetMotion(
      previewSheetMotionState ?? createSheetMotionState(previewSheetState, snapPoints),
      { type: 'pointercancel' },
    );
    previewSheetGesture = null;
    previewSheetMotionState = motion;
    previewControlSurface.style.removeProperty('--preview-sheet-height');
    delete previewControlSurface.dataset.previewSheetDragging;
    applyPreviewSheetState(motion.stableState);
  });
  previewControlSurface.addEventListener('keydown', (event) => {
    if (
      event.key !== 'Escape' ||
      previewSheetState === 'peek' ||
      workspaceLayoutMode === 'desktop'
    ) {
      return;
    }
    event.preventDefault();
    setPreviewSheetState('peek');
    panelToggle.focus({ preventScroll: true });
  });
  previewCompareRadioController.subscribe((value) => {
    if (holdOriginalActive) return;
    applyPreviewCompareView(value === 'original' ? 'original' : 'pattern');
  });
  rotateLeft.addEventListener('click', () => {
    rotation = normalizeRotation(rotation - 90);
    cropPercent = { x: 0, y: 0, width: 100, height: 100 };
    drawCropPreview();
    drawAlignedOriginalCanvas();
    renderCropSelection();
    updatePrepareSummaries();
    announce('图片已向左旋转。');
    schedulePreviewRegeneration();
  });
  rotateRight.addEventListener('click', () => {
    rotation = normalizeRotation(rotation + 90);
    cropPercent = { x: 0, y: 0, width: 100, height: 100 };
    drawCropPreview();
    drawAlignedOriginalCanvas();
    renderCropSelection();
    updatePrepareSummaries();
    announce('图片已向右旋转。');
    schedulePreviewRegeneration();
  });
  aspectButton.addEventListener('click', () => {
    aspectLocked = !aspectLocked;
    aspectButton.classList.toggle('is-active', aspectLocked);
    aspectButton.setAttribute('aria-pressed', String(aspectLocked));
    aspectButton.setAttribute('aria-label', aspectLocked ? '保持图片比例' : '不保持图片比例');
    if (aspectLocked) {
      updateRowsFromColumns();
      preparePresetControls?.syncFromFields();
    } else {
      updatePrepareSummaries();
    }
  });
  columnsInput.addEventListener('input', () => {
    clampNumberInput(
      columnsInput,
      appCapabilities.grid.minimumColumns,
      appCapabilities.grid.maximumColumns,
    );
    if (aspectLocked) {
      updateRowsFromColumns();
    }
    updatePrepareSummaries();
  });
  rowsInput.addEventListener('input', () => {
    clampNumberInput(rowsInput, appCapabilities.grid.minimumRows, appCapabilities.grid.maximumRows);
    if (aspectLocked) {
      updateColumnsFromRows();
    }
    updatePrepareSummaries();
  });
  customBoardRows.addEventListener('input', () => {
    clampNumberInput(
      customBoardRows,
      appCapabilities.boards.custom.minimumRows,
      appCapabilities.boards.custom.maximumRows,
    );
    updatePrepareSummaries();
  });
  customBoardColumns.addEventListener('input', () => {
    clampNumberInput(
      customBoardColumns,
      appCapabilities.boards.custom.minimumColumns,
      appCapabilities.boards.custom.maximumColumns,
    );
    updatePrepareSummaries();
  });
  beadDiameter.addEventListener('input', () => {
    clampDecimalInput(
      beadDiameter,
      appCapabilities.beads.minimumDiameterMm,
      appCapabilities.beads.maximumDiameterMm,
    );
    if (Number(beadPitch.value) < Number(beadDiameter.value)) {
      beadPitch.value = beadDiameter.value;
    }
    updatePrepareSummaries();
  });
  beadPitch.addEventListener('input', () => {
    clampDecimalInput(
      beadPitch,
      Math.max(
        appCapabilities.beads.minimumPitchMm,
        appCapabilities.beads.pitchMustNotBeSmallerThanDiameter
          ? Number(beadDiameter.value) || appCapabilities.beads.minimumDiameterMm
          : appCapabilities.beads.minimumPitchMm,
      ),
      appCapabilities.beads.maximumPitchMm,
    );
    updatePrepareSummaries();
  });
  alphaThreshold.addEventListener('input', syncAlphaThresholdCopy);
  alphaThreshold.addEventListener('change', () => {
    schedulePreviewRegeneration();
  });
  availableColorSearch.addEventListener('input', () => {
    prepareColorQuery = availableColorSearch.value;
    renderAvailableColorFilter();
  });
  selectAllColors.addEventListener('click', () => {
    availableColorIds = new Set(
      getPalette(selectValue(previewWorkspace, '[data-palette-id]', 'mard')).colorIds,
    );
    maximumColors.max = String(availableColorIds.size);
    maximumColors.value = String(
      Math.max(1, Math.min(Number(maximumColors.value), availableColorIds.size)),
    );
    preparePresetControls?.setAvailableColorCount(availableColorIds.size);
    renderAvailableColorFilter();
    announce('已选中当前色板的全部颜色。');
  });
  clearAllColors.addEventListener('click', () => {
    availableColorIds = new Set();
    maximumColors.max = '0';
    maximumColors.value = '0';
    preparePresetControls?.setAvailableColorCount(0);
    renderAvailableColorFilter();
    announce('已清除颜色选择；生成前请至少选择一种颜色。');
  });
  availableColorGrid.addEventListener('change', (event) => {
    const target = event.target;
    if (
      !(target instanceof HTMLElement) ||
      target.localName !== 'vaadin-checkbox' ||
      !target.dataset.availableColorId
    ) {
      return;
    }
    const checkbox = target as HTMLElementTagNameMap['vaadin-checkbox'];
    if (checkbox.checked) {
      availableColorIds.add(checkbox.dataset.availableColorId ?? '');
    } else if (availableColorIds.size === 1) {
      checkbox.checked = true;
      announce('至少保留一种颜色。');
      return;
    } else {
      availableColorIds.delete(checkbox.dataset.availableColorId ?? '');
    }
    maximumColors.max = String(availableColorIds.size);
    preparePresetControls?.setAvailableColorCount(availableColorIds.size);
    renderAvailableColorFilter();
  });
  editPatternButton.addEventListener('click', () => {
    confirmPreviewAsEditorBaseline();
  });
  returnEditorButton.addEventListener('click', () => {
    if (currentProject && history) {
      openPatternEditor(currentProject);
      announce('已返回当前图纸。');
    }
  });

  mountCropInteractions({
    root: previewWorkspace,
    getCrop: () => cropPercent,
    setCrop(nextCrop) {
      cropPercent = nextCrop;
    },
    onLiveChange(editingInput) {
      renderCropSelection(editingInput);
      drawAlignedOriginalCanvas();
      updatePrepareSummaries();
    },
    onGestureEnd() {
      schedulePreviewRegeneration();
    },
    announce,
  });

  availableColorGridRenderer = createAvailableColorGridRenderer(availableColorGrid, {
    status: availableColorStatus,
  });
  boardSelectController = createVaadinSelectController({
    element: boardPreset,
    options: boardSelectOptions(),
    selectedId: selectValue(previewWorkspace, '[data-board-preset]', 'standardSquare'),
    onChange() {
      updateCustomBoardVisibility();
      updatePrepareSummaries();
    },
  });
  paletteSelectController = createVaadinSelectController({
    element: paletteSelect,
    options: paletteSelectOptions(),
    selectedId: selectValue(previewWorkspace, '[data-palette-id]', 'mard'),
    onChange(selectedId) {
      applyPreparePalette(selectedId);
    },
  });
  availableSeriesSelectController = createVaadinSelectController({
    element: availableColorSeries,
    options: [{ id: ALL_SERIES_SELECT_VALUE, label: '全部系列' }],
    selectedId: ALL_SERIES_SELECT_VALUE,
    onChange(selectedId) {
      prepareColorSeries = paletteSeriesFromSelectValue(selectedId);
      renderAvailableColorFilter();
    },
  });
  const ditheringChoices = requiredVaadinElement(
    previewWorkspace,
    '[data-dithering]',
    'vaadin-select',
  );
  ditheringSelectController = createVaadinSelectController({
    element: ditheringChoices,
    options: ditheringSelectOptions(),
    selectedId: selectValue(previewWorkspace, '[data-dithering]', 'none'),
    onChange(selectedId) {
      const dithering = selectedId === 'floydSteinberg' ? 'floydSteinberg' : 'none';
      preparePresetControls?.setDithering(dithering);
      updatePrepareSummaries();
    },
  });
  preparePresetControls = mountPreparePresetControls(previewWorkspace, {
    initialState: {
      croppedColumns: 1,
      croppedRows: 1,
      columns: 48,
      rows: 48,
      beadDiameterMm: 5,
      beadPitchMm: 5,
      maximumColors: 24,
      availableColorCount: availableColorIds.size,
      sampling: 'average',
      dithering: 'none',
      colorBoost: 'none',
    },
    radioGroups: preparePresetRadioGroupControllers,
    onChange(state) {
      if (syncingPreparePresetCrop) {
        return;
      }
      ditheringSelectController?.setValue(state.dithering);
      if (state.sampling !== samplingSelection.value) {
        samplingSelection = chooseSampling(samplingSelection, state.sampling, 'user');
        syncSamplingControls(samplingRadioController, samplingSelection);
      }
      updatePrepareSummaries();
      updateColorCountEstimate();
      if (!hydratingPreviewControls) {
        schedulePreviewRegeneration();
      }
    },
  });
  uploadPrepareRadioControllers.modePreference.subscribe((preference) => {
    if (
      !isModePreference(preference) ||
      preference === prepareState?.preference ||
      prepareState?.task !== 'newPattern'
    ) {
      return;
    }
    prepareState = setModePreference(prepareState, preference);
    applyPrepareModeState();
  });
  samplingRadioController.subscribe((value) => {
    if (!isSamplingValue(value) || value === samplingSelection.value) return;
    samplingSelection = chooseSampling(samplingSelection, value, 'user');
    syncSamplingControls(samplingRadioController, samplingSelection);
    preparePresetControls?.setSampling(value);
    schedulePreviewRegeneration();
  });
  updateCustomBoardVisibility();
  initializePrepareColorSeries();
  syncAlphaThresholdCopy();

  function updateRowsFromColumns(): void {
    const dimensions = rotatedDimensions();
    const cropWidth = dimensions.width * (cropPercent.width / 100);
    const cropHeight = dimensions.height * (cropPercent.height / 100);
    const columns = Number(columnsInput.value);
    rowsInput.value = String(
      Math.max(
        appCapabilities.grid.minimumRows,
        Math.min(appCapabilities.grid.maximumRows, Math.round(columns * (cropHeight / cropWidth))),
      ),
    );
  }

  function updateColumnsFromRows(): void {
    const dimensions = rotatedDimensions();
    const cropWidth = dimensions.width * (cropPercent.width / 100);
    const cropHeight = dimensions.height * (cropPercent.height / 100);
    const rows = Number(rowsInput.value);
    columnsInput.value = String(
      Math.max(
        appCapabilities.grid.minimumColumns,
        Math.min(appCapabilities.grid.maximumColumns, Math.round(rows * (cropWidth / cropHeight))),
      ),
    );
  }

  function updateCustomBoardVisibility(): void {
    const isCustom = boardPreset.value === 'custom';
    customBoardFields.hidden = !isCustom;
    customBoardFields.disabled = !isCustom;
  }

  function applyPreparePalette(paletteId: string): void {
    const palette = getPalette(paletteId);
    paletteSelectController?.setValue(palette.id);
    availableColorIds = new Set(palette.colorIds);
    maximumColors.max = String(palette.colorIds.length);
    maximumColors.value = String(Math.min(Number(maximumColors.value), palette.colorIds.length));
    preparePresetControls?.setAvailableColorCount(palette.colorIds.length);
    selectedColorId = palette.colorIds[0] ?? selectedColorId;
    prepareColorSeries = '';
    initializePrepareColorSeries();
    renderAvailableColorFilter();
  }
}

function openPreviewWorkspace(preserveProjectSettings = false): void {
  if (!activeSourceImage()) {
    return;
  }
  previewReturnToEditorAvailable = preserveProjectSettings && currentProject !== null;
  availableColorDialogController?.close();
  showStage('preview');
  setPreviewSheetState('peek');
  previewClobberAcknowledged = false;
  const columnsInput = required(previewWorkspace, '[data-columns]', HTMLInputElement);
  const rowsInput = required(previewWorkspace, '[data-rows]', HTMLInputElement);
  const project = preserveProjectSettings ? currentProject : null;
  hydratingPreviewControls = true;
  try {
    if (project) {
      rotation = project.source.rotation;
      const dimensions = rotatedDimensions();
      cropPercent = normalizeCropPercent({
        x: (project.source.crop.x / dimensions.width) * 100,
        y: (project.source.crop.y / dimensions.height) * 100,
        width: (project.source.crop.width / dimensions.width) * 100,
        height: (project.source.crop.height / dimensions.height) * 100,
      });
      mode = project.mode;
      if (!prepareState) {
        applyUploadPrepareFlow(flowFromImportedProject(project.mode));
      }
      columnsInput.value = String(project.grid.columns);
      rowsInput.value = String(project.grid.rows);
      aspectLocked = project.grid.aspectLocked;
      const aspectButton = required(previewWorkspace, '[data-aspect-lock]', HTMLButtonElement);
      aspectButton.classList.toggle('is-active', aspectLocked);
      aspectButton.setAttribute('aria-pressed', String(aspectLocked));
      boardSelectController?.setValue(project.grid.boardPresetId);
      required(previewWorkspace, '[data-custom-board-rows]', HTMLInputElement).value = String(
        project.grid.boardRows,
      );
      required(previewWorkspace, '[data-custom-board-columns]', HTMLInputElement).value = String(
        project.grid.boardColumns,
      );
      paletteSelectController?.setValue(project.palette.paletteId);
      availableColorIds = new Set(project.palette.availableColorIds);
      required(previewWorkspace, '[data-maximum-colors]', HTMLInputElement).value = String(
        project.palette.maximumColors ?? project.palette.availableColorIds.length,
      );
      required(previewWorkspace, '[data-bead-diameter]', HTMLInputElement).value = String(
        project.grid.beadDiameterMm,
      );
      required(previewWorkspace, '[data-bead-pitch]', HTMLInputElement).value = String(
        project.grid.beadPitchMm,
      );
      ditheringSelectController?.setValue(project.generation.dithering);
      required(previewWorkspace, '[data-alpha-threshold]', HTMLInputElement).value = String(
        project.generation.alphaEmptyThreshold,
      );
      samplingSelection = chooseSampling(
        createAutomaticSampling(
          project.mode === 'pixelArt' ? 'pixelArt' : 'photo',
          appCapabilities.sampling,
        ),
        project.generation.sampling,
        'project',
      );
      syncSamplingControls(samplingRadioController, samplingSelection);
      const cropDimensions = croppedImageDimensions();
      preparePresetControls?.hydrate({
        croppedColumns: cropDimensions.width,
        croppedRows: cropDimensions.height,
        columns: project.grid.columns,
        rows: project.grid.rows,
        beadDiameterMm: project.grid.beadDiameterMm,
        beadPitchMm: project.grid.beadPitchMm,
        maximumColors: project.palette.maximumColors ?? project.palette.availableColorIds.length,
        availableColorCount: Math.max(1, project.palette.availableColorIds.length),
        sampling: project.generation.sampling,
        dithering: project.generation.dithering,
        colorBoost: preparePresetControls.getState().colorBoost,
      });
      previewProject = project;
      previewStatistics = calculateStatistics(project.cells);
    } else {
      firstPreviewGenerationStarted = false;
      previewProject = null;
      previewStatistics = null;
      const cropDimensions = croppedImageDimensions();
      const presetDimensions = dimensionsForLongEdge(
        48,
        cropDimensions.width,
        cropDimensions.height,
      );
      columnsInput.value = String(presetDimensions.columns);
      rowsInput.value = String(presetDimensions.rows);
      preparePresetControls?.hydrate(
        createNewImagePrepareDefaults({
          croppedColumns: cropDimensions.width,
          croppedRows: cropDimensions.height,
          columns: presetDimensions.columns,
          rows: presetDimensions.rows,
          availableColorCount: availableColorIds.size,
        }),
      );
      samplingSelection = createAutomaticSampling(
        mode === 'pixelArt' ? 'pixelArt' : 'photo',
        appCapabilities.sampling,
      );
      updateSamplingDefault();
    }
  } finally {
    hydratingPreviewControls = false;
  }
  const palette = getPalette(selectValue(previewWorkspace, '[data-palette-id]', 'mard'));
  if (![...availableColorIds].every((colorId) => palette.colorIds.includes(colorId))) {
    availableColorIds = new Set(palette.colorIds);
  }
  const customFields = required(
    previewWorkspace,
    '[data-custom-board-fields]',
    HTMLFieldSetElement,
  );
  const customBoard =
    selectValue(previewWorkspace, '[data-board-preset]', 'standardSquare') === 'custom';
  customFields.hidden = !customBoard;
  customFields.disabled = !customBoard;
  required(previewWorkspace, '[data-return-editor]', HTMLButtonElement).hidden =
    !previewReturnToEditorAvailable;
  syncPreviewResult();
  syncPreviewModeControls();
  applyPreviewCompareView(currentPreviewCompareValue());
  applyPrepareModeState(false);
  initializePrepareColorSeries();
  renderAvailableColorFilter();
  drawCropPreview();
  drawAlignedOriginalCanvas();
  renderCropSelection();
  updatePrepareSummaries();
}

function drawCropPreview(): void {
  const image = activeSourceImage();
  if (!image) {
    return;
  }
  drawRotatedCropPreview(previewWorkspace, image.image, rotation);
}

function drawAlignedOriginalCanvas(): void {
  const image = activeSourceImage();
  if (!image) {
    return;
  }
  previewView.drawAlignedOriginal(image.image, rotation, cropPercent);
}

function renderCropSelection(editingInput?: HTMLInputElement): void {
  renderCropSelectionOverlay(previewWorkspace, cropPercent, editingInput);
}

function updatePrepareSummaries(): void {
  if (!activeSourceImage()) {
    return;
  }
  const dimensions = rotatedDimensions();
  const cropWidth = Math.max(1, Math.round(dimensions.width * (cropPercent.width / 100)));
  const cropHeight = Math.max(1, Math.round(dimensions.height * (cropPercent.height / 100)));
  const presetController = preparePresetControls;
  const presetState = presetController?.getState();
  if (
    presetController !== null &&
    presetState !== undefined &&
    (presetState.croppedColumns !== cropWidth || presetState.croppedRows !== cropHeight)
  ) {
    syncingPreparePresetCrop = true;
    try {
      presetController.setCropDimensions(cropWidth, cropHeight);
    } finally {
      syncingPreparePresetCrop = false;
    }
  }
  const columns = numberValue(previewWorkspace, '[data-columns]', 48);
  const rows = numberValue(previewWorkspace, '[data-rows]', 48);
  const board = selectedBoardSize();
  const boardCount = Math.ceil(columns / board.columns) * Math.ceil(rows / board.rows);
  const beadDiameter = numberValue(previewWorkspace, '[data-bead-diameter]', 5);
  const beadPitch = Math.max(
    beadDiameter,
    numberValue(previewWorkspace, '[data-bead-pitch]', beadDiameter),
  );
  required(previewWorkspace, '[data-image-summary]', HTMLElement).textContent =
    `${String(cropWidth)} × ${String(cropHeight)} px`;
  required(previewWorkspace, '[data-size-summary]', HTMLElement).textContent =
    `约 ${(((columns - 1) * beadPitch + beadDiameter) / 10).toFixed(1)} × ${(
      ((rows - 1) * beadPitch + beadDiameter) /
      10
    ).toFixed(1)} cm`;
  required(previewWorkspace, '[data-board-summary]', HTMLElement).textContent =
    `约需 ${String(boardCount)} 块拼板`;
  syncAlphaThresholdCopy();
}

function syncAlphaThresholdCopy(): void {
  const threshold = numberValue(previewWorkspace, '[data-alpha-threshold]', 0.1);
  const label = required(previewWorkspace, '[data-alpha-threshold-label]', HTMLElement);
  const description = required(previewWorkspace, '[data-alpha-threshold-description]', HTMLElement);
  if (threshold <= 0.05) {
    label.textContent = '低';
    description.textContent = '低：保留更多半透明内容';
    return;
  }
  if (threshold <= 0.25) {
    label.textContent = '推荐';
    description.textContent = '推荐：保留主体，同时去除轻微透明边缘';
    return;
  }
  label.textContent = '高';
  description.textContent = '高：更积极去除透明边缘';
}

function renderAvailableColorFilter(): void {
  const paletteId = selectValue(previewWorkspace, '[data-palette-id]', 'mard');
  const palette = getPalette(paletteId);
  const paletteColors = PALETTE_COLORS.filter((color) => palette.colorIds.includes(color.id));
  availableColorGridRenderer?.update({
    colors: paletteColors.map((color) => ({
      id: color.id,
      code: color.code,
      ...(color.name === null ? {} : { name: color.name }),
      series: color.series,
      displayHex: color.displayHex,
      paletteLabel: color.paletteId.toUpperCase(),
    })),
    selectedIds: availableColorIds,
    query: prepareColorQuery,
    series: prepareColorSeries,
  });
  updateAvailableColorSummary();
}

function initializePrepareColorSeries(): void {
  const paletteId = selectValue(previewWorkspace, '[data-palette-id]', 'mard');
  const palette = getPalette(paletteId);
  const series = [
    ...new Set(
      PALETTE_COLORS.filter((color) => palette.colorIds.includes(color.id)).map(
        (color) => color.series,
      ),
    ),
  ].sort((left, right) =>
    left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' }),
  );
  if (prepareColorSeries && !series.includes(prepareColorSeries)) {
    prepareColorSeries = '';
  }
  const options = [
    { id: ALL_SERIES_SELECT_VALUE, label: '全部系列' },
    ...series.map((value) => ({ id: value, label: `${value} 系列` })),
  ];
  availableSeriesSelectController?.setOptions(options);
  availableSeriesSelectController?.setValue(paletteSeriesToSelectValue(prepareColorSeries));
  if (
    availableColorDialogController &&
    availableColorDialogController.search.value !== prepareColorQuery
  ) {
    availableColorDialogController.search.value = prepareColorQuery;
  }
}

function updateAvailableColorSummary(): void {
  const summary = availableColorDialogController?.content.querySelector<HTMLElement>(
    '[data-available-color-summary]',
  );
  if (summary) {
    summary.textContent =
      availableColorIds.size === 0 ? '尚未选择颜色' : `已选择 ${String(availableColorIds.size)} 色`;
  }
}

const PREVIEW_REGENERATION_DEBOUNCE_MS = 250;

function schedulePreviewRegeneration(): void {
  if (stage !== 'preview' || hydratingPreviewControls) {
    return;
  }
  clearPreviewRegenerationTimer();
  previewRegenerationTimer = window.setTimeout(() => {
    previewRegenerationTimer = null;
    startPreviewGeneration();
  }, PREVIEW_REGENERATION_DEBOUNCE_MS);
}

function clearPreviewRegenerationTimer(): void {
  if (previewRegenerationTimer !== null) {
    window.clearTimeout(previewRegenerationTimer);
    previewRegenerationTimer = null;
  }
}

function startPreviewGeneration(): void {
  const image = activeSourceImage();
  if (!image || stage !== 'preview') {
    return;
  }
  if (
    prepareState?.task === 'newPattern' &&
    prepareState.recommendationStatus === 'analyzing' &&
    prepareState.resolvedMode === null
  ) {
    setPreviewStatus('analyzing');
    return;
  }
  if (!hasAvailableColorSelection(availableColorIds)) {
    setPreviewStatusText('请至少选择一种手边有的颜色。');
    announce('生成预览前请至少选择一种颜色。');
    return;
  }
  if (
    !previewClobberAcknowledged &&
    currentProject &&
    sourceGenerationRevision !== null &&
    currentProject.revision !== sourceGenerationRevision
  ) {
    openConfirmation({
      title: '重新生成会替换当前编辑',
      description: '确认编辑新图纸时，当前逐格修改和撤销记录将被替换。你也可以从预览返回当前图纸。',
      onContinue() {
        previewClobberAcknowledged = true;
        startPreviewGeneration();
      },
      onCancel() {
        restoreProjectSettingsToPreviewControls();
      },
    });
    return;
  }
  firstPreviewGenerationStarted = true;
  setPreviewStatus(capabilitiesDegraded ? 'degraded' : 'generating');
  previewCoordinator.request({ file: image.file, settings: buildGenerationSettings() });
}

function handlePreviewCoordinatorEvent(event: PreviewCoordinatorEvent): void {
  if (event.type === 'started') {
    return;
  }
  if (event.type === 'failed') {
    setPreviewStatus('failure');
    announce(PREVIEW_STATUS_TEXT.failure);
    return;
  }
  const { result } = event;
  previewProject = result.project;
  previewStatistics = result.statistics;
  selectedColorId =
    Object.keys(result.statistics.perColorCounts)[0] ??
    result.project.palette.availableColorIds[0] ??
    selectedColorId;
  availableColorIds = new Set(result.project.palette.availableColorIds);
  const doneStatus = formatPreviewDoneStatus(
    result.project.grid.columns,
    result.project.grid.rows,
    result.statistics.usedColorCount,
  );
  setPreviewStatusText(doneStatus);
  announce(doneStatus);
  if (stage === 'preview') {
    syncPreviewResult();
  }
}

function confirmPreviewAsEditorBaseline(): void {
  const project = previewProject;
  if (!project) {
    return;
  }
  previewCoordinator.cancel();
  currentProject = project;
  sourceGenerationRevision = project.revision;
  history = new MatrixHistory(project.cells, 100, project.revision);
  currentSelection = null;
  previewReturnToEditorAvailable = false;
  exportCoordinator.invalidate();
  openPatternEditor(project);
}

function restoreProjectSettingsToPreviewControls(): void {
  const project = currentProject;
  if (!project || stage !== 'preview') {
    return;
  }
  previewProject = project;
  previewStatistics = calculateStatistics(project.cells);
  openPreviewWorkspace(true);
  announce('已恢复为当前图纸的设置，未重新生成。');
}

function setPreviewStatus(kind: PreviewStatusKind): void {
  if (kind === 'done') {
    const project = previewProject;
    const statistics = previewStatistics;
    setPreviewStatusText(
      project && statistics
        ? formatPreviewDoneStatus(
            project.grid.columns,
            project.grid.rows,
            statistics.usedColorCount,
          )
        : '',
    );
    return;
  }
  setPreviewStatusText(PREVIEW_STATUS_TEXT[kind]);
}

function setPreviewStatusText(text: string): void {
  const busy = text === PREVIEW_STATUS_TEXT.generating || text === PREVIEW_STATUS_TEXT.degraded;
  previewView.setStatusText(text, {
    hasResult: previewProject !== null,
    showBadge: busy && previewProject !== null,
  });
}

function syncPreviewResult(): void {
  previewView.syncResult({
    project: previewProject,
    statistics: previewStatistics,
    canReturnToEditor: previewReturnToEditorAvailable,
    generationActive: previewCoordinator.activeRequestId() !== null,
  });
  updateColorCountEstimate();
}

function drawPreviewCanvas(): void {
  previewView.drawPreview(previewProject);
}

function setPreviewRenderMode(selection: PreviewModeSelection): void {
  previewRenderMode = selection.mode;
  previewView.setRenderMode(selection.mode);
  previewCompareRadioController.setValue(selection.compareView);
  previewView.applyCompareView(selection.compareView);
  syncPreviewModeControls();
  announce(selection.announcement);
}

function syncPreviewModeControls(): void {
  const definition =
    PREVIEW_RENDER_MODES.find(({ id }) => id === previewRenderMode) ??
    PREVIEW_RENDER_MODES.find(({ id }) => id === DEFAULT_PREVIEW_RENDER_MODE);
  for (const button of previewWorkspace.querySelectorAll<HTMLButtonElement>(
    '[data-preview-mode]',
  )) {
    button.setAttribute(
      'aria-pressed',
      String(parsePreviewRenderMode(button.dataset.previewMode) === previewRenderMode),
    );
  }
  const note = required(previewWorkspace, '[data-preview-mode-note]', HTMLElement);
  note.textContent = definition?.description ?? '';
}

function updateColorCountEstimate(): void {
  const usedColors = previewStatistics
    ? previewStatistics.usedColorCount
    : (preparePresetControls?.getState().maximumColors ?? 0);
  previewView.updateEstimate(usedColors);
}

function applyPreviewCompareView(view: 'original' | 'pattern'): void {
  previewView.applyCompareView(view);
}

function currentPreviewCompareValue(): 'original' | 'pattern' {
  return previewCompareRadioController.selectedValue() === 'original' ? 'original' : 'pattern';
}

function setupPreviewCanvasResize(): void {
  const slot = required(previewWorkspace, '[data-preview-canvas-slot]', HTMLElement);
  if (typeof ResizeObserver === 'undefined') {
    return;
  }
  const observer = new ResizeObserver(() => {
    if (stage === 'preview' && previewProject) {
      drawPreviewCanvas();
      drawAlignedOriginalCanvas();
      drawCropPreview();
      renderCropSelection();
    }
  });
  observer.observe(slot);
}

function buildGenerationSettings(): PatternGenerationSettings {
  const dimensions = rotatedDimensions();
  const paletteId = selectValue(previewWorkspace, '[data-palette-id]', 'mard') as
    'default' | 'mard';
  const maximumValue = numberValue(previewWorkspace, '[data-maximum-colors]', 24);
  const sampling = samplingSelection.value;
  const dithering =
    selectValue(previewWorkspace, '[data-dithering]', 'none') === 'floydSteinberg'
      ? 'floydSteinberg'
      : 'none';
  const board = selectedBoardSize();
  return {
    mode,
    crop: {
      x: Math.floor(dimensions.width * (cropPercent.x / 100)),
      y: Math.floor(dimensions.height * (cropPercent.y / 100)),
      width: Math.max(1, Math.round(dimensions.width * (cropPercent.width / 100))),
      height: Math.max(1, Math.round(dimensions.height * (cropPercent.height / 100))),
    },
    rotation,
    rows: numberValue(previewWorkspace, '[data-rows]', 48),
    columns: numberValue(previewWorkspace, '[data-columns]', 48),
    aspectLocked,
    beadDiameterMm: numberValue(previewWorkspace, '[data-bead-diameter]', 5),
    beadPitchMm: Math.max(
      numberValue(previewWorkspace, '[data-bead-diameter]', 5),
      numberValue(previewWorkspace, '[data-bead-pitch]', 5),
    ),
    boardPresetId: selectValue(previewWorkspace, '[data-board-preset]', 'standardSquare') as
      'smallSquare' | 'standardSquare' | 'custom',
    boardRows: board.rows,
    boardColumns: board.columns,
    paletteId,
    availableColorIds: [...availableColorIds],
    maximumColors: Math.min(Math.max(1, maximumValue), availableColorIds.size),
    sampling,
    dithering,
    alphaEmptyThreshold: numberValue(previewWorkspace, '[data-alpha-threshold]', 0.1),
    colorBoost: preparePresetControls?.getState().colorBoost ?? 'none',
  };
}

function setupPatternWorkspace(): void {
  const frontButton = required(patternWorkspace, '[data-front-view]', HTMLButtonElement);
  const reverseButton = required(patternWorkspace, '[data-reverse-view]', HTMLButtonElement);
  const undoButton = required(patternWorkspace, '[data-undo]', HTMLButtonElement);
  const redoButton = required(patternWorkspace, '[data-redo]', HTMLButtonElement);
  const canvasJumpForm = required(patternWorkspace, '[data-canvas-jump-form]', HTMLFormElement);
  const canvasJumpRow = required(canvasJumpForm, '[data-canvas-jump-row]', HTMLInputElement);
  const canvasJumpColumn = required(canvasJumpForm, '[data-canvas-jump-column]', HTMLInputElement);
  const sheetDragRegion = required(workspaceSheet, '[data-sheet-drag-region]', HTMLElement);
  let sheetGesture: {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly startY: number;
    readonly startHeight: number;
    readonly toggleOnTap: boolean;
    currentHeight: number;
    lastY: number;
    lastTime: number;
    pointerVelocityY: number;
    moved: boolean;
  } | null = null;

  patternWorkspace.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const toolButton = target.closest<HTMLButtonElement>('[data-tool]');
    if (toolButton?.dataset.tool && isEditorTool(toolButton.dataset.tool)) {
      setActiveTool(toolButton.dataset.tool);
      return;
    }
    const tab = target.closest<HTMLButtonElement>('[data-panel-tab]');
    if (tab?.dataset.panelTab && isInspectorPanel(tab.dataset.panelTab)) {
      setActiveInspectorPanel(tab.dataset.panelTab, tab);
      return;
    }
    const swatch = target.closest<HTMLButtonElement>('[data-color-id]');
    if (swatch?.dataset.colorId) {
      setSelectedColor(swatch.dataset.colorId);
      return;
    }
    const mirrorButton = target.closest<HTMLButtonElement>('[data-matrix-mirror]');
    if (mirrorButton?.dataset.matrixMirror) {
      mirrorProject(mirrorButton.dataset.matrixMirror === 'vertical' ? 'vertical' : 'horizontal');
      return;
    }
    const selectionAction = target.closest<HTMLButtonElement>('[data-selection-action]');
    if (selectionAction?.dataset.selectionAction === 'move') {
      canvasController?.beginSelectionTransfer('move');
      return;
    }
    if (selectionAction?.dataset.selectionAction === 'copy') {
      canvasController?.beginSelectionTransfer('copy');
      return;
    }
    if (selectionAction?.dataset.selectionAction === 'cancel') {
      canvasController?.cancelSelection();
      return;
    }
    if (
      selectionAction?.dataset.selectionAction === 'clear' ||
      target.closest('[data-clear-selection]')
    ) {
      canvasController?.clearSelection();
      return;
    }
    if (target.closest('[data-toggle-canvas-jump]')) {
      setCanvasJumpOpen(true);
      return;
    }
    if (target.closest('[data-canvas-jump-cancel]')) {
      setCanvasJumpOpen(false, true);
      return;
    }
    if (target.closest('[data-dismiss-first-use-hint]')) {
      dismissFirstUseHint();
      return;
    }
    if (target.closest('[data-sheet-open-tools]')) {
      setActiveInspectorPanel('tools');
      setSheetState('half');
      return;
    }
    if (target.closest('[data-return-prepare]')) {
      if (activeSourceImage()) {
        openPreviewWorkspace(true);
      } else {
        announce('已保存项目不包含源图片，无法重新生成；你仍可继续编辑和导出。');
      }
      return;
    }
    if (target.closest('[data-close-export]')) {
      closeExportSurface();
      return;
    }
    const exportTaskButton = target.closest<HTMLButtonElement>('[data-export-task]');
    if (
      exportTaskButton?.dataset.exportTask &&
      isExportTaskId(exportTaskButton.dataset.exportTask)
    ) {
      if (exportTaskButton.dataset.exportTask !== exportCompletionState.selectedTask) {
        exportCoordinator.invalidate();
      }
      exportCompletionState = selectExportTask(
        exportCompletionState,
        exportTaskButton.dataset.exportTask,
      );
      syncExportCompletionUi();
      schedulePngExportPreview();
      return;
    }
    if (target.closest('[data-export-run]')) {
      void startSelectedExport();
      return;
    }
  });
  patternWorkspace.addEventListener('change', (event) => {
    const target = event.target;
    const option = target instanceof HTMLElement ? target.dataset.exportContentOption : undefined;
    if (
      !(target instanceof HTMLElement) ||
      target.localName !== 'vaadin-checkbox' ||
      !isPngExportContentOption(option)
    ) {
      return;
    }

    const checkbox = target as HTMLElementTagNameMap['vaadin-checkbox'];
    applyPngExportConfigurationPatch({
      [option]: checkbox.checked,
    });
  });
  patternWorkspace.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && exportCompletionState.phase === 'open') {
      event.preventDefault();
      closeExportSurface();
      return;
    }
    if (
      event.key === 'Escape' &&
      !required(patternWorkspace, '[data-canvas-jump-form]', HTMLFormElement).hidden
    ) {
      event.preventDefault();
      setCanvasJumpOpen(false, true);
      return;
    }
    const tab =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[role="tab"][data-panel-tab]')
        : null;
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }
    const tabList = tab.closest<HTMLElement>('[role="tablist"]');
    const tabs = tabList
      ? [...tabList.querySelectorAll<HTMLButtonElement>('[data-panel-tab]')]
      : [];
    const index = tabs.indexOf(tab);
    if (index < 0 || tabs.length === 0) {
      return;
    }
    event.preventDefault();
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    if (nextTab?.dataset.panelTab && isInspectorPanel(nextTab.dataset.panelTab)) {
      setActiveInspectorPanel(nextTab.dataset.panelTab, nextTab);
      nextTab.focus();
    }
  });
  for (const controller of exportPresetRadioControllers) {
    controller.subscribe((value) => {
      if (!isPngExportPreset(value)) return;
      const next = configurationForPngExportPreset(value);
      if (pngExportConfigurationSignature(next) === currentPngExportConfigurationSignature()) {
        return;
      }
      exportCompletionState = setExportPngConfiguration(exportCompletionState, next);
      abortRunningExportForConfigurationChange();
      syncExportCompletionUi();
      schedulePngExportPreview();
    });
  }
  for (const controller of exportBackgroundRadioControllers) {
    controller.subscribe((value) => {
      if (!isPngExportBackground(value)) return;
      applyPngExportConfigurationPatch({ background: value });
    });
  }
  for (const controller of exportAppearanceRadioControllers) {
    controller.subscribe((value) => {
      if (!isPngExportAppearance(value)) return;
      applyPngExportConfigurationPatch({ appearance: value });
    });
  }

  frontButton.addEventListener('click', () => {
    frontButton.classList.add('is-active');
    reverseButton.classList.remove('is-active');
    frontButton.setAttribute('aria-pressed', 'true');
    reverseButton.setAttribute('aria-pressed', 'false');
    canvasController?.setReverseView(false);
  });
  reverseButton.addEventListener('click', () => {
    reverseButton.classList.add('is-active');
    frontButton.classList.remove('is-active');
    reverseButton.setAttribute('aria-pressed', 'true');
    frontButton.setAttribute('aria-pressed', 'false');
    canvasController?.setReverseView(true);
  });
  undoButton.addEventListener('click', undo);
  redoButton.addEventListener('click', redo);
  required(patternWorkspace, '[data-zoom-in]', HTMLButtonElement).addEventListener('click', () => {
    canvasController?.zoomIn();
  });
  required(patternWorkspace, '[data-zoom-out]', HTMLButtonElement).addEventListener('click', () => {
    canvasController?.zoomOut();
  });
  required(patternWorkspace, '[data-zoom-fit]', HTMLButtonElement).addEventListener('click', () => {
    canvasController?.fit();
  });
  required(patternWorkspace, '[data-canvas-zoom-actual]', HTMLButtonElement).addEventListener(
    'click',
    () => {
      canvasController?.actualSize();
    },
  );
  canvasJumpForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!currentProject || !canvasController) {
      return;
    }
    const row = clamp(Math.round(Number(canvasJumpRow.value) || 1), 1, currentProject.grid.rows);
    const column = clamp(
      Math.round(Number(canvasJumpColumn.value) || 1),
      1,
      currentProject.grid.columns,
    );
    canvasJumpRow.value = String(row);
    canvasJumpColumn.value = String(column);
    canvasController.jumpToCell(row - 1, column - 1);
    setCanvasJumpOpen(false);
  });
  for (const selector of ['[data-open-export]', '[data-mobile-export]']) {
    const opener = required(patternWorkspace, selector, HTMLButtonElement);
    opener.addEventListener('click', () => {
      openExportSurface(opener);
    });
  }

  workspaceSheetHandle.addEventListener('click', (event) => {
    if (event.detail !== 0) {
      return;
    }
    setSheetState(sheetState === 'peek' ? 'half' : sheetState === 'half' ? 'full' : 'peek');
  });
  sheetDragRegion.addEventListener('pointerdown', (event) => {
    const target = event.target;
    const interactive =
      target instanceof Element
        ? target.closest('button, input, textarea, select, a, [role="button"]')
        : null;
    if (interactive && !workspaceSheetHandle.contains(interactive)) {
      return;
    }
    const currentHeight = sheetMotionState?.height ?? workspaceSheet.getBoundingClientRect().height;
    sheetGesture = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startY: event.clientY,
      startHeight: currentHeight,
      toggleOnTap: target instanceof Node && workspaceSheetHandle.contains(target),
      currentHeight,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      pointerVelocityY: 0,
      moved: false,
    };
    workspaceSheet.dataset.sheetDragging = 'true';
    sheetDragRegion.setPointerCapture(event.pointerId);
  });
  sheetDragRegion.addEventListener('pointermove', (event) => {
    if (!sheetGesture || sheetGesture.pointerId !== event.pointerId) {
      return;
    }
    const height = dragSheetHeight({
      startHeight: sheetGesture.startHeight,
      startPointerY: sheetGesture.startY,
      pointerY: event.clientY,
      snapPoints: sheetSnapPoints(),
    });
    const elapsed = event.timeStamp - sheetGesture.lastTime;
    if (elapsed > 0) {
      sheetGesture.pointerVelocityY = (event.clientY - sheetGesture.lastY) / elapsed;
    }
    sheetGesture.lastY = event.clientY;
    sheetGesture.lastTime = event.timeStamp;
    sheetGesture.currentHeight = height;
    sheetGesture.moved ||= didSheetGestureMove(
      sheetGesture.startY,
      event.clientY,
      sheetGesture.pointerType,
    );
    sheetMotionState = reduceSheetMotion(
      sheetMotionState ?? createSheetMotionState(sheetState, sheetSnapPoints()),
      { type: 'drag', height },
    );
    workspaceSheet.style.setProperty('--sheet-height', `${String(height)}px`);
    event.preventDefault();
  });
  sheetDragRegion.addEventListener('pointerup', (event) => {
    if (!sheetGesture || sheetGesture.pointerId !== event.pointerId) {
      return;
    }
    const elapsed = event.timeStamp - sheetGesture.lastTime;
    if (elapsed > 0) {
      sheetGesture.pointerVelocityY = (event.clientY - sheetGesture.lastY) / elapsed;
    }
    sheetGesture.currentHeight = dragSheetHeight({
      startHeight: sheetGesture.startHeight,
      startPointerY: sheetGesture.startY,
      pointerY: event.clientY,
      snapPoints: sheetSnapPoints(),
    });
    const motion = reduceSheetMotion(
      sheetMotionState ?? createSheetMotionState(sheetState, sheetSnapPoints()),
      {
        type: 'pointerup',
        height: sheetGesture.currentHeight,
        pointerVelocityY: sheetGesture.pointerVelocityY,
      },
    );
    const toggleOnTap = sheetGesture.toggleOnTap && !sheetGesture.moved;
    sheetGesture = null;
    sheetMotionState = motion;
    workspaceSheet.style.removeProperty('--sheet-height');
    delete workspaceSheet.dataset.sheetDragging;
    if (toggleOnTap) {
      setSheetState(sheetState === 'peek' ? 'half' : sheetState === 'half' ? 'full' : 'peek');
    } else {
      applySheetState(motion.stableState);
    }
    if (sheetDragRegion.hasPointerCapture(event.pointerId)) {
      sheetDragRegion.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
  });
  registerSheetGestureCancellation(sheetDragRegion, (event) => {
    if (
      !sheetGesture ||
      (event instanceof PointerEvent && event.pointerId !== sheetGesture.pointerId)
    ) {
      return;
    }
    const motion = reduceSheetMotion(
      sheetMotionState ?? createSheetMotionState(sheetState, sheetSnapPoints()),
      { type: 'pointercancel' },
    );
    sheetGesture = null;
    sheetMotionState = motion;
    workspaceSheet.style.removeProperty('--sheet-height');
    delete workspaceSheet.dataset.sheetDragging;
    applySheetState(motion.stableState);
  });

  const colorSearches = queryPatternWorkspaceElements('[data-color-search]', 'vaadin-text-field');
  for (const search of colorSearches) {
    const applySearch = (): void => {
      paletteQuery = search.value;
      syncPaletteControls(search);
      applyPaletteFilters();
    };
    search.addEventListener('input', applySearch);
    search.addEventListener('value-changed', applySearch);
  }
  for (const controller of paletteScopeRadioControllers) {
    controller.subscribe((value) => {
      const nextScope = value === 'used' || value === 'recent' ? value : 'all';
      if (nextScope === paletteScope) return;
      paletteScope = nextScope;
      syncPaletteControls(controller);
      applyPaletteFilters();
    });
  }

  const seriesSelects = queryPatternWorkspaceElements(
    '[data-color-series-filter]',
    'vaadin-select',
  );
  const controllers: VaadinSelectController[] = [];
  for (const select of seriesSelects) {
    controllers.push(
      createVaadinSelectController({
        element: select,
        options: [{ id: ALL_SERIES_SELECT_VALUE, label: '全部系列' }],
        selectedId: ALL_SERIES_SELECT_VALUE,
        onChange: selectEditorSeries,
      }),
    );
  }
  editorSeriesSelectControllers = Object.freeze(controllers);

  function selectEditorSeries(selectedId: string): void {
    paletteSeries = paletteSeriesFromSelectValue(selectedId);
    syncPaletteControls();
    applyPaletteFilters();
  }
}

function openPatternEditor(project: BeadProject): void {
  currentProject = project;
  previewReturnToEditorAvailable = false;
  previewCoordinator.cancel();
  clearPreviewRegenerationTimer();
  required(previewWorkspace, '[data-preview-badge]', HTMLElement).hidden = true;
  showStage('editor');
  const canvas = required(patternWorkspace, '[data-pattern-canvas]', HTMLCanvasElement);
  const canvasJumpRow = required(patternWorkspace, '[data-canvas-jump-row]', HTMLInputElement);
  const canvasJumpColumn = required(
    patternWorkspace,
    '[data-canvas-jump-column]',
    HTMLInputElement,
  );
  canvasJumpRow.max = String(project.grid.rows);
  canvasJumpColumn.max = String(project.grid.columns);
  canvasJumpRow.value = '1';
  canvasJumpColumn.value = '1';
  canvasController?.destroy();
  canvasController = mountPatternCanvas(canvas, project, {
    onCommit(cells, message, changes) {
      if (!currentProject || !history) {
        return;
      }
      abortActiveExport();
      const snapshot = history.commitChanges(cells, changes);
      currentProject = withProjectCells(
        currentProject,
        snapshot.cells,
        new Date().toISOString(),
        snapshot.revision,
      );
      updateHistoryButtons();
      updateInspectorDynamicContent();
      sessionStatus.textContent = '本次会话有新修改';
      schedulePerformanceCapture();
      announce(message);
    },
    onColorPick(colorId) {
      setSelectedColor(colorId);
    },
    onStatus: announce,
    onSelectionChange(selection) {
      currentSelection = selection;
      updateSelectionActions();
    },
    onSelectionViewportRectChange(rect) {
      currentSelectionViewportRect = rect;
      scheduleSelectionContextPosition();
    },
    onSelectionTransferModeChange(nextMode) {
      selectionTransferMode = nextMode;
      updateSelectionActions();
    },
    onSuccessfulGesture(gesture) {
      handleSuccessfulFirstUseGesture(gesture);
    },
  });
  canvasController.setTool(activeTool);
  canvasController.setColor(selectedColorId);
  canvasController.resetPerformanceMetrics();
  activePanel = 'tools';
  currentSelection = null;
  currentSelectionViewportRect = null;
  selectionTransferMode = null;
  sheetState = 'peek';
  setSheetState('peek');
  setCanvasJumpOpen(false);
  if (firstUseHintSession.enterEditor()) {
    clearFirstUseHintTimer();
    firstUseHintTimer = window.setTimeout(() => {
      firstUseHintTimer = null;
      firstUseHintSession.dismiss();
      syncFirstUseHint();
    }, 4000);
  }
  syncFirstUseHint();
  resetExportSurface();
  for (const button of queryPatternWorkspaceAll('[data-return-prepare]', HTMLButtonElement)) {
    button.disabled = activeSourceImage() === null;
    button.title = activeSourceImage()
      ? '保留当前矩阵并返回预览调整设置'
      : '已保存项目不包含源图片，无法重新生成';
  }
  updateHistoryButtons();
  updateSelectionActions();
  renderInspector();
  schedulePerformanceCapture();
  sessionStatus.textContent = '图纸已生成';
}

function setActiveTool(tool: EditorTool): void {
  activeTool = tool;
  canvasController?.setTool(tool);
  for (const button of queryPatternWorkspaceAll('[data-tool]', HTMLButtonElement)) {
    const isActive = button.dataset.tool === tool;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  }
  updateInspectorDynamicContent();
}

function setSelectedColor(colorId: string): void {
  if (
    !currentProject?.palette.availableColorIds.includes(colorId) ||
    !PALETTE_COLORS.some((color) => color.id === colorId)
  ) {
    return;
  }
  selectedColorId = colorId;
  recentColorIds = pushRecentColor(recentColorIds, colorId);
  canvasController?.setColor(colorId);
  updateInspectorDynamicContent();
}

function mirrorProject(axis: 'horizontal' | 'vertical'): void {
  if (!currentProject || !history) {
    return;
  }
  let cells: BeadProject['cells'];
  try {
    cells = createVerifiedMatrixMirror(currentProject, axis).cells;
  } catch (error) {
    announce(
      error instanceof Error ? error.message : '无法安全翻转图案，当前图纸和材料统计已保留。',
    );
    return;
  }
  abortActiveExport();
  const snapshot = history.commit(cells);
  currentProject = withProjectCells(
    currentProject,
    snapshot.cells,
    new Date().toISOString(),
    snapshot.revision,
  );
  canvasController?.setProject(currentProject);
  updateHistoryButtons();
  updateInspectorDynamicContent();
  schedulePerformanceCapture();
  announce(axis === 'horizontal' ? '图案已水平翻转。' : '图案已垂直翻转。');
}

function undo(): void {
  if (!history || !currentProject) {
    return;
  }
  const snapshot = history.undo();
  if (snapshot.cells === currentProject.cells) {
    announce('没有可撤销的操作。');
    return;
  }
  abortActiveExport();
  currentProject = withProjectCells(
    currentProject,
    snapshot.cells,
    new Date().toISOString(),
    snapshot.revision,
  );
  canvasController?.setProject(currentProject);
  updateHistoryButtons();
  updateInspectorDynamicContent();
  schedulePerformanceCapture();
  announce('已撤销上一步。');
}

function redo(): void {
  if (!history || !currentProject) {
    return;
  }
  const snapshot = history.redo();
  if (snapshot.cells === currentProject.cells) {
    announce('没有可重做的操作。');
    return;
  }
  abortActiveExport();
  currentProject = withProjectCells(
    currentProject,
    snapshot.cells,
    new Date().toISOString(),
    snapshot.revision,
  );
  canvasController?.setProject(currentProject);
  updateHistoryButtons();
  updateInspectorDynamicContent();
  schedulePerformanceCapture();
  announce('已重做上一步。');
}

function updateHistoryButtons(): void {
  const snapshot = history?.snapshot;
  required(patternWorkspace, '[data-undo]', HTMLButtonElement).disabled = !snapshot?.canUndo;
  required(patternWorkspace, '[data-redo]', HTMLButtonElement).disabled = !snapshot?.canRedo;
}

function updateSelectionActions(): void {
  const active = currentSelection !== null;
  selectionContextBar.hidden = !active;
  selectionContextBar.dataset.transferMode = selectionTransferMode ?? '';
  if (currentSelection) {
    selectionDescription.textContent = describeSelection(currentSelection).label;
  }
  for (const button of queryPatternWorkspaceAll('[data-selection-action]', HTMLButtonElement)) {
    button.disabled = !active;
    if (button.dataset.selectionAction === 'copy' || button.dataset.selectionAction === 'move') {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.selectionAction === selectionTransferMode),
      );
    }
  }
  for (const button of queryPatternWorkspaceAll(
    '[data-clear-selection]:not([data-selection-action])',
    HTMLButtonElement,
  )) {
    button.disabled = !active;
  }
  scheduleSelectionContextPosition();
}

function scheduleSelectionContextPosition(): void {
  if (selectionContextPositionFrame !== 0) {
    return;
  }
  selectionContextPositionFrame = window.requestAnimationFrame(() => {
    selectionContextPositionFrame = 0;
    positionSelectionContext();
  });
}

function positionSelectionContext(): void {
  if (!currentSelection || !currentSelectionViewportRect || stage !== 'editor') {
    selectionContextBar.hidden = true;
    return;
  }
  selectionContextBar.hidden = false;
  selectionContextBar.style.visibility = 'hidden';
  const frameRect = patternCanvasFrame.getBoundingClientRect();
  const canvas = required(patternCanvasFrame, '[data-pattern-canvas]', HTMLCanvasElement);
  const canvasRect = canvas.getBoundingClientRect();
  const barRect = selectionContextBar.getBoundingClientRect();
  if (frameRect.width <= 0 || frameRect.height <= 0 || barRect.width <= 0 || barRect.height <= 0) {
    selectionContextBar.hidden = true;
    selectionContextBar.style.removeProperty('visibility');
    return;
  }

  const selectionRect: ViewportRect = Object.freeze({
    left: canvasRect.left - frameRect.left + currentSelectionViewportRect.left,
    top: canvasRect.top - frameRect.top + currentSelectionViewportRect.top,
    width: currentSelectionViewportRect.width,
    height: currentSelectionViewportRect.height,
  });
  const occlusions: ViewportRect[] = [];
  if (workspaceSheet.isConnected && workspaceLayoutMode !== 'desktop') {
    const sheetOcclusion = relativeIntersection(frameRect, workspaceSheet.getBoundingClientRect());
    if (sheetOcclusion) {
      occlusions.push(sheetOcclusion);
    }
  }
  const jumpForm = required(patternCanvasFrame, '[data-canvas-jump-form]', HTMLFormElement);
  if (!jumpForm.hidden) {
    const jumpOcclusion = relativeIntersection(frameRect, jumpForm.getBoundingClientRect());
    if (jumpOcclusion) {
      occlusions.push(jumpOcclusion);
    }
  }
  const visualViewport = window.visualViewport;
  if (visualViewport) {
    const visibleBottom = visualViewport.offsetTop + visualViewport.height;
    if (visibleBottom < frameRect.bottom) {
      occlusions.push({
        left: 0,
        top: Math.max(0, visibleBottom - frameRect.top),
        width: frameRect.width,
        height: Math.max(0, frameRect.bottom - visibleBottom),
      });
    }
  }

  try {
    const position = positionSelectionContextBar({
      viewport: { left: 0, top: 0, width: frameRect.width, height: frameRect.height },
      selection: selectionRect,
      bar: { width: barRect.width, height: barRect.height },
      safeArea: { top: 8, right: 8, bottom: 8, left: 8 },
      occlusions,
    });
    selectionContextBar.style.left = `${String(position.left)}px`;
    selectionContextBar.style.top = `${String(position.top)}px`;
    selectionContextBar.dataset.placement = position.placement;
    delete selectionContextBar.dataset.placementUnavailable;
    selectionContextBar.style.removeProperty('visibility');
  } catch {
    selectionContextBar.hidden = true;
    selectionContextBar.dataset.placementUnavailable = 'true';
    selectionContextBar.style.removeProperty('visibility');
  }
}

function relativeIntersection(container: DOMRect, candidate: DOMRect): ViewportRect | null {
  const left = Math.max(container.left, candidate.left);
  const top = Math.max(container.top, candidate.top);
  const right = Math.min(container.right, candidate.right);
  const bottom = Math.min(container.bottom, candidate.bottom);
  return right > left && bottom > top
    ? Object.freeze({
        left: left - container.left,
        top: top - container.top,
        width: right - left,
        height: bottom - top,
      })
    : null;
}

function setCanvasJumpOpen(open: boolean, restoreFocus = false): void {
  const form = required(patternWorkspace, '[data-canvas-jump-form]', HTMLFormElement);
  const toggle = required(patternWorkspace, '[data-toggle-canvas-jump]', HTMLButtonElement);
  form.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  if (open) {
    required(form, '[data-canvas-jump-row]', HTMLInputElement).focus({
      preventScroll: true,
    });
  } else if (restoreFocus) {
    toggle.focus({ preventScroll: true });
  }
  scheduleSelectionContextPosition();
}

function handleSuccessfulFirstUseGesture(gesture: FirstUseGesture): void {
  if (firstUseHintSession.recordSuccessfulGesture(gesture)) {
    clearFirstUseHintTimer();
    syncFirstUseHint();
  }
}

function dismissFirstUseHint(): void {
  clearFirstUseHintTimer();
  firstUseHintSession.dismiss();
  syncFirstUseHint();
}

function clearFirstUseHintTimer(): void {
  if (firstUseHintTimer !== null) {
    window.clearTimeout(firstUseHintTimer);
    firstUseHintTimer = null;
  }
}

function syncFirstUseHint(): void {
  firstUseHint.hidden = stage !== 'editor' || !firstUseHintSession.visible;
}

function schedulePerformanceCapture(): void {
  window.requestAnimationFrame(() => {
    const snapshot = canvasController?.getPerformanceSnapshot();
    if (!snapshot) {
      return;
    }
    patternWorkspace.dataset.editorFrameMs = snapshot.lastFrameDurationMs.toFixed(3);
    patternWorkspace.dataset.editorMaxFrameMs = snapshot.maxFrameDurationMs.toFixed(3);
    patternWorkspace.dataset.editorVisitedCells = String(snapshot.visitedCellCount);
    patternWorkspace.dataset.editorTransactionMs = snapshot.lastTransactionDurationMs.toFixed(3);
  });
}

function setActiveInspectorPanel(panel: InspectorPanel, sourceTab?: HTMLButtonElement): void {
  activePanel = panel;
  if (sourceTab?.closest('[data-tab-surface="mobile"]') && sheetState === 'peek') {
    setSheetState('half');
  }
  renderInspector();
}

function renderInspector(): void {
  const project = currentProject;
  if (!project) {
    return;
  }

  for (const tab of queryPatternWorkspaceAll('[role="tab"][data-panel-tab]', HTMLButtonElement)) {
    const isActive = tab.dataset.panelTab === activePanel;
    tab.setAttribute('aria-selected', String(isActive));
    tab.classList.toggle('is-active', isActive);
    tab.tabIndex = isActive ? 0 : -1;
  }
  for (const panel of queryPatternWorkspaceAll('[data-tabpanel-surface]', HTMLElement)) {
    const surface = panel.dataset.tabpanelSurface === 'mobile' ? 'mobile' : 'desktop';
    panel.setAttribute('aria-labelledby', `inspector-${surface}-tab-${activePanel}`);
  }
  for (const controls of queryPatternWorkspaceAll('[data-palette-controls]', HTMLElement)) {
    controls.hidden = activePanel !== 'palette';
  }

  updateInspectorDynamicContent();
  if (activePanel === 'palette') {
    initializePaletteControls();
  }
}

function updateInspectorDynamicContent(): void {
  const project = currentProject;
  if (!project) {
    return;
  }
  const view = createWorkspacePanelsView(project);
  for (const controller of workspacePanelControllers) {
    controller.update(view);
  }
  syncSheetPeekSummary(view);
  updateSelectionActions();
  if (activePanel === 'palette') {
    applyPaletteFilters();
  }
}

function createWorkspacePanelsView(project: BeadProject): WorkspacePanelsView {
  const selected = PALETTE_COLORS.find((color) => color.id === selectedColorId);
  const statistics = calculateStatistics(project.cells);
  const trustCopy = formatPatternTrustSummary(createPatternTrustSummary(project));
  const layout = calculatePhysicalLayout(project);
  const size = `${(layout.widthMm / 10).toFixed(1)} × ${(layout.heightMm / 10).toFixed(1)} cm`;
  const paletteColors = PALETTE_COLORS.filter((color) =>
    project.palette.availableColorIds.includes(color.id),
  ).map((color) =>
    Object.freeze({
      id: color.id,
      paletteLabel: color.paletteId.toUpperCase(),
      series: color.series,
      code: color.code,
      name: color.name,
      displayHex: color.displayHex,
    }),
  );
  const materials = Object.entries(statistics.perColorCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .flatMap(([colorId, count]) => {
      const color = PALETTE_COLORS.find((entry) => entry.id === colorId);
      return color
        ? [
            Object.freeze({
              id: color.id,
              paletteLabel: color.paletteId.toUpperCase(),
              code: color.code,
              name: color.name,
              displayHex: color.displayHex,
              count,
            }),
          ]
        : [];
    });

  return Object.freeze({
    activePanel,
    activeTool,
    activeToolLabel: toolCustomerLabel(activeTool),
    selectionActive: currentSelection !== null,
    selectedColor: selected
      ? Object.freeze({
          id: selected.id,
          label: `${selected.paletteId.toUpperCase()} ${selected.code}`,
          name: selected.name ?? '实物颜色以拼豆为准',
          displayHex: selected.displayHex,
        })
      : null,
    paletteColors: Object.freeze(paletteColors),
    materials: Object.freeze(materials),
    materialHeading: `${String(statistics.nonEmptyBeadCount)} 颗 · ${String(
      statistics.usedColorCount,
    )} 色`,
    trustPrimary: trustCopy.primary,
    trustVerification: trustCopy.verification,
    materialSize: size,
    materialBoards: `${String(layout.boardCount)} 块`,
    materialBlanks: `${String(statistics.blankCount)} 格`,
    settingsHeading: `${String(project.grid.columns)} 列 × ${String(project.grid.rows)} 行`,
    settingsPalette: project.palette.paletteId.toUpperCase(),
    settingsMaximum: String(project.palette.maximumColors ?? '不限'),
    settingsSampling: project.generation.sampling === 'average' ? '平均取色' : '保留像素',
    settingsDithering: project.generation.dithering === 'none' ? '干净色块' : '细腻过渡',
    settingsSize: size,
  });
}

function syncSheetPeekSummary(view: WorkspacePanelsView): void {
  required(workspaceSheet, '[data-sheet-current-tool]', HTMLElement).textContent =
    view.activeToolLabel;
  required(workspaceSheet, '[data-sheet-current-color]', HTMLElement).textContent =
    view.selectedColor?.label ?? '未选颜色';
  required(workspaceSheet, '[data-sheet-current-color-swatch]', HTMLElement).style.setProperty(
    '--swatch',
    view.selectedColor?.displayHex ?? 'transparent',
  );
  const icon = workspaceSheet.querySelector<HTMLElement>('[data-sheet-peek-summary] > span i');
  if (icon) {
    icon.className = `ph ${toolIconName(activeTool)}`;
  }
}

function initializePaletteControls(): void {
  const project = currentProject;
  if (!project) {
    return;
  }
  const series = [
    ...new Set(
      PALETTE_COLORS.filter((color) => project.palette.availableColorIds.includes(color.id)).map(
        (color) => color.series,
      ),
    ),
  ].sort((left, right) =>
    left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' }),
  );
  if (paletteSeries && !series.includes(paletteSeries)) {
    paletteSeries = '';
  }
  const options = [
    { id: ALL_SERIES_SELECT_VALUE, label: '全部系列' },
    ...series.map((value) => ({ id: value, label: `${value} 系列` })),
  ];
  for (const controller of editorSeriesSelectControllers) {
    controller.setOptions(options);
    controller.setValue(paletteSeriesToSelectValue(paletteSeries));
  }
  syncPaletteControls();
  applyPaletteFilters();
}

function syncPaletteControls(
  source?: HTMLElementTagNameMap['vaadin-text-field'] | VaadinRadioGroupController,
): void {
  for (const search of queryPatternWorkspaceElements('[data-color-search]', 'vaadin-text-field')) {
    if (search !== source && search.value !== paletteQuery) {
      search.value = paletteQuery;
    }
  }
  for (const controller of paletteScopeRadioControllers) {
    if (controller !== source) controller.setValue(paletteScope);
  }
  for (const controller of editorSeriesSelectControllers) {
    controller.setValue(paletteSeriesToSelectValue(paletteSeries));
  }
}

function applyPaletteFilters(): void {
  const project = currentProject;
  if (!project) {
    return;
  }
  const statistics = calculateStatistics(project.cells);
  const filtered = filterPaletteColors(PALETTE_COLORS, {
    availableColorIds: project.palette.availableColorIds,
    query: paletteQuery,
    scope: paletteScope,
    usedColorIds: Object.keys(statistics.perColorCounts),
    recentColorIds,
  }).filter((color) => paletteSeries === '' || color.series === paletteSeries);
  const visibleIds = new Set(filtered.map((color) => color.id));
  for (const swatch of queryPatternWorkspaceAll('[data-color-id]', HTMLButtonElement)) {
    swatch.hidden = !visibleIds.has(swatch.dataset.colorId ?? '');
  }
  for (const group of queryPatternWorkspaceAll('[data-palette-series-group]', HTMLElement)) {
    group.hidden = ![...group.querySelectorAll<HTMLButtonElement>('[data-color-id]')].some(
      (swatch) => !swatch.hidden,
    );
  }
  setTextAll(
    '[data-color-filter-status]',
    paletteFilterStatusText(
      filtered.length,
      project.palette.availableColorIds.length,
      paletteScope,
    ),
  );
}

function setTextAll(selector: string, text: string): void {
  for (const element of queryPatternWorkspaceAll(selector, HTMLElement)) {
    element.textContent = text;
  }
}

function applyPngExportConfigurationPatch(patch: Partial<PngExportConfiguration>): void {
  const next = updatePngExportConfiguration(exportCompletionState.pngConfiguration, patch);
  if (pngExportConfigurationSignature(next) === currentPngExportConfigurationSignature()) {
    return;
  }

  exportCompletionState = setExportPngConfiguration(exportCompletionState, next);
  abortRunningExportForConfigurationChange();
  syncExportCompletionUi();
  schedulePngExportPreview();
}

function abortRunningExportForConfigurationChange(): void {
  exportCoordinator.invalidate();
}

function schedulePngExportPreview(): void {
  if (
    exportCompletionState.phase !== 'open' ||
    exportCompletionState.selectedTask !== 'shareImage' ||
    !currentProject
  ) {
    if (pngExportPreviewState.phase !== 'idle') {
      pngExportPreviewCoordinator.invalidate();
    }
    return;
  }

  pngExportPreviewCoordinator.schedule({
    project: currentProject,
    configuration: exportCompletionState.pngConfiguration,
    colorHexById: previewColorHexById,
    colorCodeById: previewColorCodeById,
  });
}

function currentPngExportConfigurationSignature(): string {
  return pngExportConfigurationSignature(exportCompletionState.pngConfiguration);
}

function currentReadyPngExportPreview(): PngExportPreviewResult | null {
  if (!currentProject) {
    return null;
  }
  const result = pngExportPreviewCoordinator.result();
  return result &&
    result.revision === currentProject.revision &&
    result.configurationSignature === currentPngExportConfigurationSignature()
    ? result
    : null;
}

function presentPngExportPreview(result: PngExportPreviewResult): void {
  const maximumWidth = 1600;
  const maximumHeight = 1200;
  const scale = Math.min(
    1,
    maximumWidth / result.canvas.width,
    maximumHeight / result.canvas.height,
  );
  const width = Math.max(1, Math.round(result.canvas.width * scale));
  const height = Math.max(1, Math.round(result.canvas.height * scale));

  for (const canvas of queryPatternWorkspaceAll(
    '[data-export-preview-canvas]',
    HTMLCanvasElement,
  )) {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      continue;
    }
    context.clearRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(result.canvas, 0, 0, width, height);
  }
}

function pngExportPreviewStatusMessage(): string {
  if (pngExportPreviewState.phase === 'rendering') {
    return '正在更新最终图片…';
  }
  if (pngExportPreviewState.phase === 'error') {
    return pngExportPreviewState.message;
  }
  const ready = currentReadyPngExportPreview();
  if (ready) {
    return `${String(ready.canvas.width)} × ${String(ready.canvas.height)} px · 可下载`;
  }
  return '正在生成预览…';
}

function isPngExportPreset(value: string): value is PngExportPreset {
  return (
    value === 'pure' ||
    value === 'annotated' ||
    value === 'numbered' ||
    value === 'rounded' ||
    value === 'ring'
  );
}

function isPngExportBackground(value: string): value is PngExportBackground {
  return value === 'transparent' || value === 'white';
}

function isPngExportAppearance(value: string): value is PngExportAppearance {
  return (
    value === 'bead' || value === 'solidSquare' || value === 'roundedSquare' || value === 'ring'
  );
}

function isPngExportContentOption(value: string | undefined): value is PngExportContentOption {
  return (
    value === 'includeGrid' ||
    value === 'includeCoordinates' ||
    value === 'includeCellCodes' ||
    value === 'includeStatistics' ||
    value === 'includeMaterialCounts' ||
    value === 'includeColorLegend'
  );
}

async function startSelectedExport(): Promise<void> {
  if (!currentProject) {
    return;
  }
  const task = exportCompletionState.selectedTask;
  const definition = exportTaskDefinition(task);
  const capabilityFormat = definition.format === 'json' ? 'projectJson' : definition.format;
  if (task !== 'shareImage' && !appCapabilities.exports.includes(capabilityFormat)) {
    announce('当前服务不支持这种导出格式。');
    return;
  }
  const readyPreview = task === 'shareImage' ? currentReadyPngExportPreview() : null;
  if (task === 'shareImage' && !readyPreview) {
    announce(
      pngExportPreviewState.phase === 'error'
        ? pngExportPreviewState.message
        : '最终图片仍在更新，请稍候。',
    );
    schedulePngExportPreview();
    return;
  }
  await exportCoordinator.start({
    project: currentProject,
    task,
    pngTemplate: exportCompletionState.pngTemplate,
    ...(readyPreview ? { pngBlob: readyPreview.blob } : {}),
  });
}

function openExportSurface(opener: HTMLButtonElement): void {
  if (!currentProject) {
    return;
  }
  const mobile = opener.matches('[data-mobile-export]');
  const content = mobile ? mobileSheetContent : desktopInspectorContent;
  exportReturnFocus = opener;
  exportCompletionState = openExportCompletion(exportCompletionState, {
    panel: activePanel,
    sheetState,
    triggerKey: mobile ? 'mobile-export' : 'desktop-export',
    scrollTop: content.scrollTop,
  });
  exportCompletionState = setExportPngConfiguration(
    exportCompletionState,
    configurationForPreviewMode(previewRenderMode),
  );
  if (mobile) {
    setSheetState('full');
  }
  setExportSurfacesOpen(true);
  syncExportCompletionUi();
  schedulePngExportPreview();
  const surfaceRoot = mobile ? workspaceSheet : workspaceInspector;
  surfaceRoot
    .querySelector<HTMLButtonElement>(`[data-export-task="${exportCompletionState.selectedTask}"]`)
    ?.focus();
}

function closeExportSurface(restoreFocus = true): void {
  const returnContext = exportCompletionState.returnContext;
  exportCoordinator.invalidate();
  pngExportPreviewCoordinator.invalidate();
  exportCompletionState = closeExportCompletion(exportCompletionState);
  setExportSurfacesOpen(false);
  if (returnContext) {
    activePanel = isInspectorPanel(returnContext.panel) ? returnContext.panel : activePanel;
    setSheetState(returnContext.sheetState);
    renderInspector();
    const content =
      returnContext.triggerKey === 'mobile-export' ? mobileSheetContent : desktopInspectorContent;
    content.scrollTop = returnContext.scrollTop;
  }
  if (restoreFocus) {
    exportReturnFocus?.focus();
  }
  exportReturnFocus = null;
}

function resetExportSurface(): void {
  exportCoordinator.invalidate();
  pngExportPreviewCoordinator.invalidate();
  exportCompletionState = createExportCompletionState();
  setExportSurfacesOpen(false);
  exportReturnFocus = null;
}

function setExportSurfacesOpen(open: boolean): void {
  patternWorkspace.dataset.exportOpen = String(open);
  if (!open) {
    patternWorkspace.dataset.exportPreviewOpen = 'false';
    required(patternWorkspace, '[data-export-preview-stage]', HTMLElement).hidden = true;
  }
  for (const panel of queryPatternWorkspaceAll('[data-export-completion]', HTMLElement)) {
    const surface = panel.dataset.exportSurface;
    const container = panel.parentElement;
    if (!container) {
      continue;
    }
    for (const element of container.querySelectorAll<HTMLElement>(
      '[data-tab-surface], [data-palette-controls], [data-tabpanel-surface], .inspector-primary, .sheet-primary',
    )) {
      if (!panel.contains(element)) {
        element.hidden = open;
      }
    }
    panel.hidden = !open;
    if (!open && surface) {
      panel.removeAttribute('aria-busy');
    }
  }
}

function syncExportCompletionUi(): void {
  const definition = exportTaskDefinition(exportCompletionState.selectedTask);
  const project = currentProject;
  const trustCopy = project ? formatPatternTrustSummary(createPatternTrustSummary(project)) : null;
  const panels = queryPatternWorkspaceAll('[data-export-completion]', HTMLElement);
  for (const [index, panel] of panels.entries()) {
    for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-export-task]')) {
      const selected = button.dataset.exportTask === exportCompletionState.selectedTask;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    const isPngTask = exportCompletionState.selectedTask === 'shareImage';
    required(panel, '[data-export-png-controls]', HTMLElement).hidden = !isPngTask;
    required(panel, '.export-mobile-preview', HTMLElement).hidden = !isPngTask;
    const presetMatch = resolvePngExportPreset(exportCompletionState.pngConfiguration);
    exportPresetRadioControllers[index]?.setValue(presetMatch === 'custom' ? '' : presetMatch);
    exportBackgroundRadioControllers[index]?.setValue(
      exportCompletionState.pngConfiguration.background,
    );
    exportAppearanceRadioControllers[index]?.setValue(
      exportCompletionState.pngConfiguration.appearance,
    );
    required(panel, '[data-export-preset-match]', HTMLElement).textContent =
      presetMatch === 'custom'
        ? '自定义搭配'
        : (PREVIEW_RENDER_MODES.find((mode) => mode.id === presetMatch)?.label ?? '常用样式');
    required(panel, '[data-export-configuration-summary]', HTMLElement).textContent =
      describePngExportConfiguration(exportCompletionState.pngConfiguration);
    for (const option of panel.querySelectorAll<HTMLElementTagNameMap['vaadin-checkbox']>(
      '[data-export-content-option]',
    )) {
      const key = option.dataset.exportContentOption;
      if (isPngExportContentOption(key)) {
        option.checked = exportCompletionState.pngConfiguration[key];
      }
    }
    required(panel, '[data-export-preview-status]', HTMLElement).textContent =
      pngExportPreviewStatusMessage();
    const runButton = required(panel, '[data-export-run]', HTMLButtonElement);
    runButton.textContent =
      exportCompletionState.selectedTask === 'saveProject'
        ? '保存项目文件'
        : `下载${definition.label}`;
    runButton.disabled =
      exportCompletionState.status.phase === 'running' ||
      (isPngTask
        ? currentReadyPngExportPreview() === null
        : !appCapabilities.exports.includes(
            definition.format === 'json' ? 'projectJson' : definition.format,
          ));
    required(panel, '[data-export-summary]', HTMLElement).textContent =
      trustCopy === null ? '当前没有可导出的图纸。' : trustCopy.primary;
    required(panel, '[data-export-trust-verification]', HTMLElement).textContent =
      trustCopy?.verification ?? '';
    panel.setAttribute('aria-busy', String(exportCompletionState.status.phase === 'running'));
    required(panel, '[data-export-status]', HTMLElement).textContent = exportStatusMessage();
  }
  const showWorkspacePreview =
    exportCompletionState.phase === 'open' && exportCompletionState.selectedTask === 'shareImage';
  required(patternWorkspace, '[data-export-preview-stage]', HTMLElement).hidden =
    !showWorkspacePreview;
  required(patternWorkspace, '[data-export-preview-workspace-status]', HTMLElement).textContent =
    pngExportPreviewStatusMessage();
  patternWorkspace.dataset.exportPreviewOpen = String(showWorkspacePreview);
  for (const frame of queryPatternWorkspaceAll('[data-export-preview-frame]', HTMLElement)) {
    frame.dataset.background = exportCompletionState.pngConfiguration.background;
  }
}

function exportStatusMessage(): string {
  const status = exportCompletionState.status;
  if (status.phase === 'idle') {
    return '';
  }
  if (status.phase === 'running') {
    return `正在准备${exportTaskDefinition(status.task).label}…`;
  }
  if (status.phase === 'success') {
    return `${exportTaskDefinition(status.task).label}已下载。`;
  }
  return status.message;
}

function handleExportEvent(event: ExportCoordinatorEvent): void {
  if (event.phase === 'running') {
    exportCompletionState = beginExport(exportCompletionState, event.token, event.task);
  } else if (event.phase === 'success') {
    exportCompletionState = completeExport(exportCompletionState, event.token, event.fileName);
  } else {
    exportCompletionState = failExport(exportCompletionState, event.token, event.message);
  }
  syncExportCompletionUi();
  announce(event.message);
}

function abortActiveExport(): void {
  exportCoordinator.invalidate('图纸已更新，请重新导出');
  if (
    exportCompletionState.phase === 'open' &&
    exportCompletionState.selectedTask === 'shareImage'
  ) {
    schedulePngExportPreview();
  }
}

function setupChartWorkspace(): GridEditorController {
  const generateButton = required(chartWorkspace, '[data-chart-generate]', HTMLButtonElement);
  const downloadButton = required(chartWorkspace, '[data-chart-download]', HTMLButtonElement);
  const dimensionForm = required(chartWorkspace, '[data-chart-dimension-form]', HTMLFormElement);
  const columnsInput = required(chartWorkspace, '[data-chart-columns]', HTMLInputElement);
  const rowsInput = required(chartWorkspace, '[data-chart-rows]', HTMLInputElement);
  const controller = mountGridEditor(chartWorkspace, {
    onContractChange(contract) {
      chartMirrorCoordinator.cancel();
      gridContract = contract;
      chartAcknowledgedCandidateId = null;
      if (contract) {
        columnsInput.value = String(contract.columns);
        rowsInput.value = String(contract.rows);
      } else {
        columnsInput.value = '';
        rowsInput.value = '';
      }
      clearChartResult();
      syncChartConfirmationUi();
    },
    onDetectionChange(detecting) {
      chartDetectionRunning = detecting;
      syncChartConfirmationUi();
    },
    onCandidatesChange(index, total) {
      const controls = required(chartWorkspace, '[data-chart-candidates]', HTMLElement);
      const status = required(chartWorkspace, '[data-chart-candidate-status]', HTMLElement);
      controls.hidden = total < 2;
      status.textContent = total > 0 ? `候选 ${String(index)} / ${String(total)}` : '';
      for (const button of controls.querySelectorAll<HTMLButtonElement>('[data-chart-candidate]')) {
        button.disabled = total < 2 || chartDetectionRunning;
      }
    },
  });
  required(chartWorkspace, '[data-chart-redetect]', HTMLButtonElement).addEventListener(
    'click',
    controller.redetect,
  );
  required(chartWorkspace, '[data-chart-reset]', HTMLButtonElement).addEventListener(
    'click',
    controller.resetSelection,
  );
  for (const candidateButton of chartWorkspace.querySelectorAll<HTMLButtonElement>(
    '[data-chart-candidate]',
  )) {
    candidateButton.addEventListener('click', () => {
      const offset = candidateButton.dataset.chartCandidate === 'previous' ? -1 : 1;
      controller.cycleCandidate(offset);
    });
  }
  dimensionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    chartAcknowledgedCandidateId = null;
    controller.adjustDimensions(columnsInput.valueAsNumber, rowsInput.valueAsNumber);
    syncChartConfirmationUi();
  });
  for (const axisButton of chartWorkspace.querySelectorAll<HTMLButtonElement>(
    '[data-chart-axis]',
  )) {
    axisButton.addEventListener('click', () => {
      chartMirrorCoordinator.cancel();
      chartAxis = axisButton.dataset.chartAxis === 'vertical' ? 'vertical' : 'horizontal';
      for (const button of chartWorkspace.querySelectorAll<HTMLButtonElement>(
        '[data-chart-axis]',
      )) {
        const active = button === axisButton;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      }
      clearChartResult();
      syncChartConfirmationUi();
    });
  }
  generateButton.addEventListener('click', () => {
    const confirmation = resolveGridConfirmation(gridContract, chartAcknowledgedCandidateId);
    if (confirmation.requiresWarningAcknowledgement) {
      chartAcknowledgedCandidateId = gridContract?.candidateId ?? null;
      syncChartConfirmationUi();
      gridController.setMessage(
        `${confirmation.warning ?? '请复核当前网格。'} 请再次点击“仍要镜像”。`,
      );
      return;
    }
    void generateChartMirror();
  });
  downloadButton.addEventListener('click', () => {
    if (chartResultUrl) {
      const anchor = document.createElement('a');
      anchor.href = chartResultUrl;
      anchor.download = `${safeDownloadBaseName(activeSourceImage()?.file.name ?? 'chart')}-${chartAxis}-mirror.png`;
      anchor.click();
    }
  });
  syncChartConfirmationUi();
  return controller;
}

function syncChartConfirmationUi(): void {
  syncChartDetectionBusyUi(app, chartDetectionRunning);
  const confirmation = resolveGridConfirmation(gridContract, chartAcknowledgedCandidateId);
  const dimensions = required(chartWorkspace, '[data-chart-dimensions]', HTMLElement);
  const confidence = required(chartWorkspace, '[data-chart-confidence]', HTMLElement);
  const warning = required(chartWorkspace, '[data-chart-warning]', HTMLElement);
  const columns = required(chartWorkspace, '[data-chart-columns]', HTMLInputElement);
  const rows = required(chartWorkspace, '[data-chart-rows]', HTMLInputElement);
  const applyDimensions = required(
    chartWorkspace,
    '[data-chart-apply-dimensions]',
    HTMLButtonElement,
  );
  const generate = required(chartWorkspace, '[data-chart-generate]', HTMLButtonElement);
  const hasContract = gridContract !== null;
  const hasSourceImage = activeSourceImage() !== null;
  const mirrorRunning = chartMirrorCoordinator.isRunning();
  const candidateControls = required(chartWorkspace, '[data-chart-candidates]', HTMLElement);

  dimensions.textContent = confirmation.dimensions;
  confidence.textContent = confirmation.confidenceLabel;
  confidence.dataset.state = confirmation.level;
  warning.textContent = confirmation.warning ?? '';
  warning.hidden = confirmation.warning === null;
  columns.disabled = !hasSourceImage || chartDetectionRunning || mirrorRunning;
  rows.disabled = !hasSourceImage || chartDetectionRunning || mirrorRunning;
  applyDimensions.disabled = !hasSourceImage || chartDetectionRunning || mirrorRunning;
  generate.disabled = !hasContract || chartDetectionRunning || mirrorRunning;
  for (const button of candidateControls.querySelectorAll<HTMLButtonElement>(
    '[data-chart-candidate]',
  )) {
    button.disabled = Boolean(candidateControls.hidden || chartDetectionRunning || mirrorRunning);
  }
  for (const button of chartWorkspace.querySelectorAll<HTMLButtonElement>('[data-chart-axis]')) {
    button.disabled =
      chartDetectionRunning ||
      mirrorRunning ||
      !appCapabilities.gridMirrorAxes.includes(
        button.dataset.chartAxis as 'horizontal' | 'vertical',
      );
  }
  generate.textContent = mirrorRunning
    ? '正在镜像图纸…'
    : confirmation.requiresWarningAcknowledgement
      ? '确认识别结果'
      : confirmation.level === 'review'
        ? '仍要镜像'
        : '确认并镜像';
}

function openChartWorkspace(): void {
  const image = activeSourceImage();
  if (!image) {
    return;
  }
  chartMirrorCoordinator.cancel();
  chartAcknowledgedCandidateId = null;
  chartDetectionRunning = false;
  showStage('chart');
  gridContract = null;
  clearChartResult();
  syncChartConfirmationUi();
  gridController.setImage({
    file: image.file,
    fileName: image.file.name,
    objectUrl: image.objectUrl,
    naturalImage: { width: image.width, height: image.height },
  });
}

async function generateChartMirror(): Promise<void> {
  const image = activeSourceImage();
  const contract = gridContract;
  if (!image || !contract) {
    return;
  }
  const confirmation = resolveGridConfirmation(contract, chartAcknowledgedCandidateId);
  if (!confirmation.canSubmit || chartMirrorCoordinator.isRunning()) {
    return;
  }
  gridController.setMessage('正在镜像完整拼豆格，坐标和图例会保持原位…');
  const task = chartMirrorCoordinator.run(image.file, contract, chartAxis);
  syncChartConfirmationUi();

  try {
    const blob = await task;
    if (!blob) {
      return;
    }
    const previousResultUrl = chartResultUrl;
    const nextResultUrl = URL.createObjectURL(blob);
    chartResultUrl = nextResultUrl;
    gridController.showResult(nextResultUrl);
    if (previousResultUrl) {
      URL.revokeObjectURL(previousResultUrl);
    }
    gridController.setMessage(
      chartAxis === 'horizontal'
        ? '水平镜像已完成，网格外坐标和图例保持不变。'
        : '垂直镜像已完成，网格外坐标和图例保持不变。',
    );
    const download = required(chartWorkspace, '[data-chart-download]', HTMLButtonElement);
    download.hidden = false;
    download.disabled = false;
  } catch (error) {
    gridController.setMessage(
      error instanceof MirrorMasterApiError ? error.message : '镜像失败，请重新识别后再试。',
    );
  } finally {
    syncChartConfirmationUi();
  }
}

function setupReplacementActions(): void {
  headerReplace.addEventListener('click', handleReplaceImageClick);
}

function handleReplaceImageClick(): void {
  confirmReplaceImage();
}

function setupConfirmationSurface(): void {
  confirmationDialogController = createConfirmationDialog({
    dialog: confirmationDialog,
    onConfirm() {
      void saveBeforeConfirmation();
    },
    onReject() {
      const request = confirmationRequest;
      if (!request || confirmationSaving) return;
      confirmationRequest = null;
      request.onContinue();
    },
    onCancel() {
      if (confirmationSaving) return;
      const request = confirmationRequest;
      confirmationRequest = null;
      request?.onCancel?.();
    },
  });
}

function openConfirmation(request: ConfirmationRequest): void {
  if (confirmationRequest || confirmationSaving) {
    return;
  }
  confirmationRequest = request;
  confirmationDialogController?.open(request);
}

async function saveBeforeConfirmation(): Promise<void> {
  const project = currentProject;
  const request = confirmationRequest;
  if (!project || !request || confirmationSaving) {
    return;
  }
  confirmationSaving = true;
  const result = await exportCoordinator.start({
    project,
    task: 'saveProject',
    pngTemplate: 'annotated',
  });
  confirmationSaving = false;
  if (result.outcome === 'downloaded') {
    confirmationRequest = null;
    request.onContinue();
    return;
  }
  confirmationDialogController?.reopenWithError(
    result.outcome === 'failed' ? result.message : '保存已取消，请重试或选择其他操作。',
  );
}

function confirmReplaceImage(replacementConfirmed = false): void {
  if (
    !replacementConfirmed &&
    currentProject &&
    (sourceGenerationRevision === null || currentProject.revision !== sourceGenerationRevision)
  ) {
    openConfirmation({
      title: '更换图片会结束当前编辑',
      description:
        '当前图纸、逐格修改和撤销记录都会从工作区移除。你可以先保存项目，之后再回来继续。',
      onContinue() {
        confirmReplaceImage(true);
      },
    });
    return;
  }
  resetToStart();
}

function resetToStart(): void {
  loadRevision += 1;
  previewCoordinator.cancel();
  clearPreviewRegenerationTimer();
  exportCoordinator.invalidate();
  chartMirrorCoordinator.cancel();
  recommendationRequests.cancel();
  availableColorDialogController?.close();
  canvasController?.destroy();
  canvasController = null;
  history = null;
  currentProject = null;
  sourceGenerationRevision = null;
  previewProject = null;
  previewStatistics = null;
  previewReturnToEditorAvailable = false;
  previewClobberAcknowledged = false;
  firstPreviewGenerationStarted = false;
  mirrorChartIntent = false;
  holdOriginalActive = false;
  previewRenderMode = DEFAULT_PREVIEW_RENDER_MODE;
  disposeSourceImageSession();
  currentSelection = null;
  currentSelectionViewportRect = null;
  selectionTransferMode = null;
  recentColorIds = Object.freeze([]);
  gridContract = null;
  chartAcknowledgedCandidateId = null;
  chartDetectionRunning = false;
  applyUploadPrepareFlow(resetFlowForReplacement(currentUploadPrepareFlow()));
  mode = 'photo';
  samplingSelection = createAutomaticSampling('photo', appCapabilities.sampling);
  syncSamplingControls(samplingRadioController, samplingSelection);
  clearChartResult();
  objectUrls.revokeAll();
  fileInput.value = '';
  projectFileInput.value = '';
  projectFileStatus.textContent = '';
  setFileStatus('', 'ready');
  previewCompareRadioController.setValue('pattern');
  previewView.setRenderMode(previewRenderMode);
  syncPreviewModeControls();
  applyPreviewCompareView('pattern');
  setPreviewStatusText('');
  syncPreviewResult();
  showStage('start');
  announce('已返回图片选择。');
}

function showStage(nextStage: AppStage): void {
  const mainWorkspace = required(app, '#main-workspace', HTMLElement);
  if (stage !== nextStage) {
    const currentStage =
      stage === 'start'
        ? startWorkspace
        : stage === 'preview'
          ? previewWorkspace
          : stage === 'editor'
            ? patternWorkspace
            : chartWorkspace;
    moveFocusBeforeHiding([currentStage], mainWorkspace);
  }
  if (stage === 'preview' && nextStage !== 'preview') {
    availableSeriesSelectController?.close();
    availableColorDialogController?.close();
    paletteSelectController?.close();
    boardSelectController?.close();
    ditheringSelectController?.close();
  }
  if (stage === 'editor' && nextStage !== 'editor') {
    for (const controller of editorSeriesSelectControllers) controller.close();
    dismissFirstUseHint();
    setCanvasJumpOpen(false);
    resetExportSurface();
  }
  stage = nextStage;
  shell.dataset.stage = nextStage;
  startWorkspace.hidden = nextStage !== 'start';
  previewWorkspace.hidden = nextStage !== 'preview';
  patternWorkspace.hidden = nextStage !== 'editor';
  chartWorkspace.hidden = nextStage !== 'chart';
  headerReplace.hidden = nextStage === 'start';
  headerContext.textContent =
    nextStage === 'start'
      ? brandConfig.shortName
      : nextStage === 'preview'
        ? '预览图纸'
        : nextStage === 'editor'
          ? '编辑拼豆图纸'
          : '镜像已有图纸';
  sessionStatus.textContent = nextStage === 'start' ? '仅保存在本次会话' : '本次会话';
  mainWorkspace.focus({ preventScroll: true });
}

function updateWorkspaceLayout(): void {
  const viewportWidth = Math.max(
    1,
    document.documentElement.clientWidth || window.innerWidth || 320,
  );
  const nextLayout = resolveWorkspaceLayout(viewportWidth);
  const crossingDesktopBoundary =
    workspaceLayoutMode !== null &&
    (workspaceLayoutMode === 'desktop') !== (nextLayout.mode === 'desktop');
  const activeElement = document.activeElement;
  const previewControlSurface = required(
    previewWorkspace,
    '[data-preview-control-surface]',
    HTMLElement,
  );
  const previewControlsScroll = required(
    previewControlSurface,
    '[data-preview-controls-scroll]',
    HTMLElement,
  );
  const previewPanelToggle = required(
    previewControlSurface,
    '[data-preview-panel-toggle]',
    HTMLButtonElement,
  );
  const previewFocusWasInSettings =
    activeElement instanceof HTMLElement && previewControlsScroll.contains(activeElement);
  const previewFocusWasOnToggle =
    activeElement instanceof HTMLElement && previewPanelToggle.contains(activeElement);
  const sourceUsesDesktopSurface = workspaceLayoutMode === 'desktop';
  const focusWasInSourceSurface =
    activeElement !== null &&
    (sourceUsesDesktopSurface
      ? workspaceInspector.contains(activeElement) || workspaceToolRail.contains(activeElement)
      : workspaceSheet.contains(activeElement));
  const sourceFocusRoot = sourceUsesDesktopSurface ? patternWorkspace : workspaceSheet;
  const focusSnapshot = crossingDesktopBoundary
    ? captureWorkspaceSurfaceFocus(
        sourceFocusRoot,
        focusWasInSourceSurface ? activeElement : null,
        activePanel,
      )
    : null;

  if (crossingDesktopBoundary) {
    for (const controller of editorSeriesSelectControllers) controller.close();
    paletteSelectController?.close();
    boardSelectController?.close();
    ditheringSelectController?.close();
    availableSeriesSelectController?.close();
  }

  const layout = responsiveWorkspaceMount.update(viewportWidth);
  workspaceLayoutMode = layout.mode;
  patternWorkspace.style.setProperty(
    '--workspace-tool-rail-width',
    `${String(layout.toolRailWidth)}px`,
  );
  patternWorkspace.style.setProperty(
    '--workspace-inspector-width',
    `${String(layout.inspectorWidth)}px`,
  );
  previewWorkspace.dataset.previewLayout = layout.mode;
  if (layout.mode === 'desktop') {
    previewSheetState = 'peek';
    previewSheetMotionState = null;
  } else if (crossingDesktopBoundary && previewFocusWasInSettings) {
    previewSheetState = 'half';
    previewSheetMotionState = null;
  }
  recalculatePreviewSheetMotion();
  recalculateSheetMotion();
  scheduleSelectionContextPosition();

  if (exportCompletionState.phase === 'open') {
    const attachedSurface = layout.attachInspector ? workspaceInspector : workspaceSheet;
    exportReturnFocus = required(
      attachedSurface,
      layout.attachInspector ? '[data-open-export]' : '[data-mobile-export]',
      HTMLButtonElement,
    );
    setExportSurfacesOpen(true);
    syncExportCompletionUi();
    if (crossingDesktopBoundary && focusWasInSourceSurface) {
      attachedSurface
        .querySelector<HTMLButtonElement>(
          `[data-export-task="${exportCompletionState.selectedTask}"]`,
        )
        ?.focus({ preventScroll: true });
    }
  } else if (crossingDesktopBoundary) {
    restoreWorkspaceSurfaceFocus(
      layout.attachInspector ? patternWorkspace : workspaceSheet,
      focusSnapshot,
    );
  }

  if (crossingDesktopBoundary && layout.mode === 'desktop' && previewFocusWasOnToggle) {
    previewControlsScroll
      .querySelector<HTMLElement>(
        'vaadin-radio-button[checked], vaadin-select, button:not([disabled]), input:not([disabled])',
      )
      ?.focus({ preventScroll: true });
  }
}

function nextSheetState(currentState: SheetState): SheetState {
  return currentState === 'peek' ? 'half' : currentState === 'half' ? 'full' : 'peek';
}

function setPreviewSheetState(nextState: SheetState): void {
  const snapPoints = previewSheetSnapPoints();
  applyPreviewSheetSnapPointVariables(snapPoints);
  previewSheetMotionState = createSheetMotionState(nextState, snapPoints);
  applyPreviewSheetState(nextState);
}

function applyPreviewSheetState(nextState: SheetState): void {
  const surface = required(previewWorkspace, '[data-preview-control-surface]', HTMLElement);
  const toggle = required(surface, '[data-preview-panel-toggle]', HTMLButtonElement);
  const controlsScroll = required(surface, '[data-preview-controls-scroll]', HTMLElement);
  previewSheetState = nextState;
  surface.dataset.previewSheetState = nextState;
  const controlsShouldBeHidden = workspaceLayoutMode !== 'desktop' && nextState === 'peek';
  if (
    controlsShouldBeHidden &&
    document.activeElement instanceof HTMLElement &&
    controlsScroll.contains(document.activeElement)
  ) {
    toggle.focus({ preventScroll: true });
  }
  controlsScroll.hidden = controlsShouldBeHidden;
  toggle.setAttribute('aria-expanded', String(nextState !== 'peek'));
  toggle.setAttribute(
    'aria-label',
    nextState === 'peek'
      ? '展开预览设置'
      : nextState === 'half'
        ? '展开全部预览设置'
        : '收起预览设置',
  );
}

function recalculatePreviewSheetMotion(): void {
  const surface = required(previewWorkspace, '[data-preview-control-surface]', HTMLElement);
  const snapPoints = previewSheetSnapPoints();
  applyPreviewSheetSnapPointVariables(snapPoints);
  previewSheetMotionState = previewSheetMotionState
    ? reduceSheetMotion(previewSheetMotionState, { type: 'recalculate', snapPoints })
    : createSheetMotionState(previewSheetState, snapPoints);
  surface.style.removeProperty('--preview-sheet-height');
  delete surface.dataset.previewSheetDragging;
  applyPreviewSheetState(previewSheetMotionState.stableState);
}

function applyPreviewSheetSnapPointVariables(snapPoints: SheetSnapPoints): void {
  previewWorkspace.style.setProperty('--preview-sheet-peek-height', `${String(snapPoints.peek)}px`);
  previewWorkspace.style.setProperty('--preview-sheet-half-height', `${String(snapPoints.half)}px`);
  previewWorkspace.style.setProperty('--preview-sheet-full-height', `${String(snapPoints.full)}px`);
}

function setSheetState(nextState: SheetState): void {
  const snapPoints = sheetSnapPoints();
  applySheetSnapPointVariables(snapPoints);
  sheetMotionState = createSheetMotionState(nextState, snapPoints);
  applySheetState(nextState);
}

function applySheetState(nextState: SheetState): void {
  if (nextState === 'peek') {
    moveFocusBeforeHiding(
      [
        ...workspaceSheet.querySelectorAll<HTMLElement>(
          '.inspector-tabs, .palette-controls, .sheet-content',
        ),
      ],
      workspaceSheetHandle,
    );
  }
  sheetState = nextState;
  workspaceSheet.dataset.sheetState = nextState;
  workspaceSheetHandle.setAttribute(
    'aria-label',
    nextState === 'peek'
      ? '展开控制面板'
      : nextState === 'half'
        ? '展开全部控制面板'
        : '收起控制面板',
  );
  scheduleSelectionContextPosition();
}

function recalculateSheetMotion(): void {
  const snapPoints = sheetSnapPoints();
  applySheetSnapPointVariables(snapPoints);
  sheetMotionState = sheetMotionState
    ? reduceSheetMotion(sheetMotionState, { type: 'recalculate', snapPoints })
    : createSheetMotionState(sheetState, snapPoints);
  workspaceSheet.style.removeProperty('--sheet-height');
  delete workspaceSheet.dataset.sheetDragging;
  applySheetState(sheetMotionState.stableState);
}

function handleVisualViewportChange(): void {
  recalculatePreviewSheetMotion();
  recalculateSheetMotion();
  scheduleSelectionContextPosition();
}

function applySheetSnapPointVariables(snapPoints: SheetSnapPoints): void {
  patternWorkspace.style.setProperty('--sheet-peek-height', `${String(snapPoints.peek)}px`);
  patternWorkspace.style.setProperty('--sheet-half-height', `${String(snapPoints.half)}px`);
  patternWorkspace.style.setProperty('--sheet-full-height', `${String(snapPoints.full)}px`);
  workspaceSheet.style.setProperty('--sheet-peek-height', `${String(snapPoints.peek)}px`);
  workspaceSheet.style.setProperty('--sheet-half-height', `${String(snapPoints.half)}px`);
  workspaceSheet.style.setProperty('--sheet-full-height', `${String(snapPoints.full)}px`);
}

function updateSamplingDefault(): void {
  if (mode === 'existingChart') return;
  samplingSelection = recommendSampling(samplingSelection, mode, appCapabilities.sampling);
  syncSamplingControls(samplingRadioController, samplingSelection);
  preparePresetControls?.setSampling(samplingSelection.value);
}

function setFileStatus(message: string, state: 'ready' | 'loading' | 'error'): void {
  fileStatus.textContent = message;
  fileStatus.dataset.state = state;
  dropZone.dataset.state = state;
  dropZone.setAttribute('aria-busy', String(state === 'loading'));
  fileInput.disabled = state === 'loading';
  projectFileInput.disabled = state === 'loading';
}

function announce(message: string): void {
  appLive.textContent = '';
  window.requestAnimationFrame(() => {
    appLive.textContent = message;
  });
}

function getPalette(paletteId: string) {
  const palette = PALETTES.find((entry) => entry.id === paletteId) ?? PALETTES[0];
  if (!palette) {
    throw new Error('应用没有可用色板。');
  }
  return palette;
}

function rotatedDimensions(): { readonly width: number; readonly height: number } {
  const image = activeSourceImage();
  if (!image) {
    return { width: 1, height: 1 };
  }
  return rotation === 90 || rotation === 270
    ? { width: image.height, height: image.width }
    : { width: image.width, height: image.height };
}

function selectedBoardSize(): { readonly rows: number; readonly columns: number } {
  const presetId = selectValue(previewWorkspace, '[data-board-preset]', 'standardSquare');
  if (presetId === 'custom') {
    return Object.freeze({
      rows: numberValue(
        previewWorkspace,
        '[data-custom-board-rows]',
        appCapabilities.boards.custom.minimumRows,
      ),
      columns: numberValue(
        previewWorkspace,
        '[data-custom-board-columns]',
        appCapabilities.boards.custom.minimumColumns,
      ),
    });
  }
  return (
    appCapabilities.boards.fixedPresets[presetId] ??
    Object.freeze({
      rows: appCapabilities.boards.custom.minimumRows,
      columns: appCapabilities.boards.custom.minimumColumns,
    })
  );
}

function previewSheetSnapPoints(): SheetSnapPoints {
  const viewportHeight = Math.max(
    12,
    previewWorkspace.clientHeight ||
      previewWorkspace.parentElement?.clientHeight ||
      window.innerHeight ||
      12,
  );
  const surface = required(previewWorkspace, '[data-preview-control-surface]', HTMLElement);
  const header = required(surface, '[data-preview-sheet-drag-region]', HTMLElement);
  const actionDock = required(surface, '.preview-action-dock', HTMLElement);
  const measuredPeekHeight = Math.ceil(
    header.getBoundingClientRect().height + actionDock.getBoundingClientRect().height,
  );
  const visualViewport = window.visualViewport;
  const rawKeyboardHeight = visualViewport
    ? Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop)
    : 0;
  const keyboardHeight = Math.min(Math.max(0, viewportHeight - 12), rawKeyboardHeight);
  previewWorkspace.style.setProperty(
    '--preview-sheet-keyboard-offset',
    `${String(rawKeyboardHeight)}px`,
  );
  const isLowLandscape = viewportHeight <= 440 && window.innerWidth > window.innerHeight;
  return calculateSheetSnapPoints({
    viewportHeight,
    peekContentHeight: Math.max(isLowLandscape ? 88 : 124, measuredPeekHeight),
    keyboardHeight,
    topGap: 8,
    halfRatio: 0.48,
  });
}

function sheetSnapPoints(): SheetSnapPoints {
  const viewportHeight = Math.max(240, patternWorkspace.clientHeight || window.innerHeight || 240);
  const visualViewport = window.visualViewport;
  const rawKeyboardHeight = visualViewport
    ? Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop)
    : 0;
  const keyboardHeight = Math.min(viewportHeight - 160, rawKeyboardHeight);
  patternWorkspace.style.setProperty('--sheet-keyboard-offset', `${String(rawKeyboardHeight)}px`);
  return calculateSheetSnapPoints({
    viewportHeight,
    peekContentHeight: 144,
    keyboardHeight,
    topGap: 0,
    halfRatio: 0.46,
  });
}

function applyIntegerLimits(input: HTMLInputElement, minimum: number, maximum: number): void {
  input.min = String(minimum);
  input.max = String(maximum);
  clampNumberInput(input, minimum, maximum);
}

function applyDecimalLimits(input: HTMLInputElement, minimum: number, maximum: number): void {
  input.min = String(minimum);
  input.max = String(maximum);
  clampDecimalInput(input, minimum, maximum);
}

function boardSelectOptions(): readonly VaadinChoiceOption[] {
  return Object.freeze([
    Object.freeze({ id: 'standardSquare', label: '29 × 29 标准方板' }),
    Object.freeze({ id: 'smallSquare', label: '14 × 14 小方板' }),
    Object.freeze({ id: 'custom', label: '自定义拼板' }),
  ]);
}

function paletteSelectOptions(): readonly VaadinChoiceOption[] {
  return Object.freeze(
    PALETTES.map((palette) =>
      Object.freeze({
        id: palette.id,
        label: `${palette.label} · ${String(palette.colorIds.length)} 色`,
      }),
    ),
  );
}

function ditheringSelectOptions(): readonly VaadinChoiceOption[] {
  return Object.freeze([
    Object.freeze({ id: 'none', label: '干净色块' }),
    Object.freeze({ id: 'floydSteinberg', label: '细腻过渡' }),
  ]);
}

function selectValue(root: ParentNode, selector: string, fallback: string): string {
  return root.querySelector<HTMLElementTagNameMap['vaadin-select']>(selector)?.value ?? fallback;
}

function croppedImageDimensions(): { readonly width: number; readonly height: number } {
  const dimensions = rotatedDimensions();
  return Object.freeze({
    width: Math.max(1, Math.round(dimensions.width * (cropPercent.width / 100))),
    height: Math.max(1, Math.round(dimensions.height * (cropPercent.height / 100))),
  });
}

function toolCustomerLabel(tool: EditorTool): string {
  const labels: Record<EditorTool, string> = {
    paint: '画笔',
    erase: '橡皮',
    eyedropper: '吸取颜色',
    fill: '填充相邻区域',
    select: '选择区域',
  };
  return labels[tool];
}

function toolIconName(tool: EditorTool): string {
  const icons: Record<EditorTool, string> = {
    paint: 'ph-pencil-simple',
    erase: 'ph-eraser',
    eyedropper: 'ph-eyedropper',
    fill: 'ph-paint-bucket',
    select: 'ph-selection',
  };
  return icons[tool];
}

function normalizeRotation(value: number): ImageRotation {
  return (((value % 360) + 360) % 360) as ImageRotation;
}

function numberValue(root: ParentNode, selector: string, fallback: number): number {
  const value = Number(required(root, selector, HTMLInputElement).value);
  return Number.isFinite(value) ? value : fallback;
}

function clampNumberInput(input: HTMLInputElement, minimum: number, maximum: number): void {
  const value = Number(input.value);
  if (Number.isFinite(value)) {
    input.value = String(Math.min(maximum, Math.max(minimum, Math.round(value))));
  }
}

function clampDecimalInput(input: HTMLInputElement, minimum: number, maximum: number): void {
  const value = Number(input.value);
  if (Number.isFinite(value)) {
    input.value = String(Math.min(maximum, Math.max(minimum, Math.round(value * 10) / 10)));
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function isModePreference(value: string): value is ModePreference {
  return value === 'auto' || value === 'photo' || value === 'pixelArt';
}

function isSamplingValue(value: string): value is SamplingValue {
  return value === 'average' || value === 'nearest';
}

function currentUploadPrepareFlow(): UploadPrepareFlow {
  return Object.freeze({ customerTask, prepareState });
}

function applyUploadPrepareFlow(flow: UploadPrepareFlow): void {
  customerTask = flow.customerTask;
  prepareState = flow.prepareState;
  syncUploadPrepareControls(uploadPrepareRadioControllers, flow);
}

function isEditorTool(value: string): value is EditorTool {
  return ['paint', 'erase', 'eyedropper', 'fill', 'select'].includes(value);
}

function isInspectorPanel(value: string): value is InspectorPanel {
  return ['tools', 'palette', 'materials', 'settings'].includes(value);
}

function isExportTaskId(value: string): value is ExportTaskId {
  return ['shareImage', 'printMaking', 'materialsList', 'saveProject'].includes(value);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function triggerObjectUrlDownload(objectUrl: string, fileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function clearChartResult(): void {
  if (chartResultUrl) {
    URL.revokeObjectURL(chartResultUrl);
    chartResultUrl = null;
  }
  const download = chartWorkspace.querySelector<HTMLButtonElement>('[data-chart-download]');
  if (download) {
    download.hidden = true;
    download.disabled = true;
  }
  if (typeof gridController !== 'undefined') {
    gridController.clearResult();
  }
}

function cleanup(): void {
  window.removeEventListener('resize', updateWorkspaceLayout);
  window.removeEventListener('orientationchange', updateWorkspaceLayout);
  window.visualViewport?.removeEventListener('resize', handleVisualViewportChange);
  window.visualViewport?.removeEventListener('scroll', handleVisualViewportChange);
  if (selectionContextPositionFrame !== 0) {
    window.cancelAnimationFrame(selectionContextPositionFrame);
    selectionContextPositionFrame = 0;
  }
  clearPreviewRegenerationTimer();
  previewCoordinator.destroy();
  backgroundRemovalCoordinator.destroy();
  exportCoordinator.destroy();
  pngExportPreviewCoordinator.destroy();
  chartMirrorCoordinator.cancel();
  recommendationRequests.cancel();
  canvasController?.destroy();
  preparePresetControls?.destroy();
  availableColorGridRenderer?.destroy();
  availableColorDialogController?.destroy();
  boardSelectController?.destroy();
  paletteSelectController?.destroy();
  availableSeriesSelectController?.destroy();
  ditheringSelectController?.destroy();
  uploadPrepareRadioControllers.modePreference.destroy();
  samplingRadioController.destroy();
  previewCompareRadioController.destroy();
  for (const controller of [
    preparePresetRadioGroupControllers.patternSize,
    preparePresetRadioGroupControllers.beadSize,
    preparePresetRadioGroupControllers.colorCount,
    preparePresetRadioGroupControllers.visualStyle,
  ]) {
    controller.destroy();
  }
  for (const controller of paletteScopeRadioControllers) controller.destroy();
  for (const controller of exportPresetRadioControllers) controller.destroy();
  for (const controller of exportBackgroundRadioControllers) controller.destroy();
  for (const controller of exportAppearanceRadioControllers) controller.destroy();
  for (const controller of editorSeriesSelectControllers) controller.destroy();
  confirmationDialogController?.destroy();
  responsiveWorkspaceMount.destroy();
  for (const controller of workspacePanelControllers) controller.destroy();
  clearChartResult();
  sourceImageSession?.dispose();
  sourceImageSession = null;
  objectUrls.revokeAll();
}

function queryPatternWorkspaceAll<ElementType extends Element>(
  selector: string,
  elementType: { new (): ElementType },
): readonly ElementType[] {
  const matches = new Set<ElementType>();
  for (const element of patternWorkspace.querySelectorAll(selector)) {
    if (element instanceof elementType) {
      matches.add(element);
    }
  }
  for (const root of workspaceSurfaceRoots) {
    if (root.matches(selector) && root instanceof elementType) {
      matches.add(root);
    }
    for (const element of root.querySelectorAll(selector)) {
      if (element instanceof elementType) {
        matches.add(element);
      }
    }
  }
  return [...matches];
}

function queryPatternWorkspaceElements<TagName extends keyof HTMLElementTagNameMap>(
  selector: string,
  tagName: TagName,
): readonly HTMLElementTagNameMap[TagName][] {
  const matches = new Set<HTMLElementTagNameMap[TagName]>();
  for (const root of [patternWorkspace, ...workspaceSurfaceRoots]) {
    if (root.matches(selector) && root.localName === tagName) {
      matches.add(root as HTMLElementTagNameMap[TagName]);
    }
    for (const element of root.querySelectorAll(selector)) {
      if (element.localName === tagName) {
        matches.add(element as HTMLElementTagNameMap[TagName]);
      }
    }
  }
  return [...matches];
}

function required<ElementType extends Element>(
  root: ParentNode,
  selector: string,
  elementType: { new (): ElementType },
): ElementType {
  const element = root.querySelector(selector);
  if (!(element instanceof elementType)) {
    throw new Error(`缺少界面元素：${selector}`);
  }
  return element;
}

void stage;
