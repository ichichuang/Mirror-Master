import './generated/phosphor-icons.css';
import './design/generated/tokens.css';
import './styles/base.css';
import './styles/page.css';

import { renderApp } from './app';
import { brandConfig } from './brand/brand.config';
import { safeDownloadBaseName } from './domain/export';
import { MatrixHistory } from './domain/history';
import {
  calculatePhysicalLayout,
  calculateStatistics,
  mirrorCells,
  withProjectCells,
  type BeadProject,
  type ImageRotation,
  type ProjectMode,
} from './domain/project';
import { PALETTE_COLORS, PALETTE_SOURCE_VERSION, PALETTES } from './generated/palettes';
import {
  FALLBACK_APP_CAPABILITIES,
  loadAppCapabilities,
  type AppCapabilities,
} from './features/app-capabilities/capabilities';
import {
  applyCropKeyboardStep,
  normalizeCropPercent,
  type CropArrowKey,
} from './features/crop-controls/cropControls';
import {
  mirrorGrid,
  MirrorMasterApiError,
  type GridDetectionContract,
} from './features/grid-api/client';
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
  dragSheetHeight,
  reduceSheetMotion,
  type SheetMotionState,
  type SheetSnapPoints,
  type SheetState,
} from './features/mobile-sheet/sheetMath';
import { filterPaletteColors, pushRecentColor } from './features/palette-controls/paletteControls';
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
import {
  describeSelection,
  positionSelectionContextBar,
  type ViewportRect,
} from './features/pattern-editor/selectionContext';
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
  beginExport,
  closeExportCompletion,
  completeExport,
  createExportCompletionState,
  exportTaskDefinition,
  failExport,
  openExportCompletion,
  selectExportTask,
  setExportPngTemplate,
  type ExportCompletionState,
  type ExportPngTemplate,
  type ExportTaskId,
} from './features/export-completion/exportState';
import {
  createAdaptiveSelectController,
  type AdaptiveSelectController,
} from './features/prepare-workspace/adaptiveSelect';
import {
  createAvailableColorMobilePanel,
  type AvailableColorMobilePanelController,
} from './features/prepare-workspace/availableColorMobilePanel';
import {
  createAvailableColorGridRenderer,
  createLatestSourceRequest,
  createNewImagePrepareDefaults,
  hasAvailableColorSelection,
  mountPreparePresetControls,
  resolveSupportedNewPatternMode,
  syncCropNumericInputValues,
  type AvailableColorGridRenderer,
  type PreparePresetControlsController,
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
} from './features/prepare-workspace/prepareSession';
import {
  exportPattern,
  generatePattern,
  PatternApiError,
  type PatternGenerationSettings,
} from './features/pattern-api/client';
import {
  MAX_PROJECT_JSON_BYTES,
  parseProjectJsonText,
  ProjectImportError,
} from './features/project-import/projectImport';
import {
  createMobilePicker,
  createUiSelectPopover,
  type MobilePickerController,
  type UiSelectPopoverController,
} from './features/ui-select/uiSelect';
import type { UiSelectOption } from './features/ui-select/state';
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
  type WorkspacePanelsController,
  type WorkspacePanelsView,
} from './features/workspace-panels/workspacePanels';

type AppStage = 'upload' | 'prepare' | 'editor' | 'chart';
type InspectorPanel = 'tools' | 'palette' | 'materials' | 'settings';
type SelectController = Pick<
  UiSelectPopoverController | MobilePickerController,
  'destroy' | 'selectedId' | 'setOptions' | 'setValue'
>;

interface SelectedImage {
  readonly file: File;
  readonly objectUrl: string;
  readonly width: number;
  readonly height: number;
  readonly image: HTMLImageElement;
  readonly mimeType: string;
}

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
const appHeader = required(app, '.app-header', HTMLElement);
const mainWorkspace = required(app, '[data-app-shell] > .main-workspace', HTMLElement);
const uploadWorkspace = required(app, '[data-upload-workspace]', HTMLElement);
const prepareWorkspace = required(app, '[data-prepare-workspace]', HTMLElement);
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
const overlayRoot = required(app, '[data-overlay-root]', HTMLElement);
const confirmationSurface = required(app, '[data-confirmation-surface]', HTMLElement);
const confirmationTitle = required(
  confirmationSurface,
  '[data-confirmation-title]',
  HTMLElement,
);
const confirmationDescription = required(
  confirmationSurface,
  '[data-confirmation-description]',
  HTMLElement,
);
const confirmationStatus = required(
  confirmationSurface,
  '[data-confirmation-status]',
  HTMLElement,
);
const confirmationSave = required(
  confirmationSurface,
  '[data-confirmation-save]',
  HTMLButtonElement,
);
const confirmationContinue = required(
  confirmationSurface,
  '[data-confirmation-continue]',
  HTMLButtonElement,
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
const workspacePanelControllers: readonly WorkspacePanelsController[] = Object.freeze([
  createWorkspacePanels(desktopInspectorContent),
  createWorkspacePanels(mobileSheetContent),
]);

const objectUrls = createObjectUrlStore();
const recommendationRequests = createLatestSourceRequest();
const firstUseHintSession = createFirstUseHintSession();
let appCapabilities: AppCapabilities = FALLBACK_APP_CAPABILITIES;
let stage: AppStage = 'upload';
let customerTask: CustomerTask = 'newPattern';
let mode: ProjectMode = 'photo';
let prepareState: NewPatternPrepareState | null = null;
let samplingSelection: SamplingSelection = createAutomaticSampling(
  'photo',
  FALLBACK_APP_CAPABILITIES.sampling,
);
let selectedImage: SelectedImage | null = null;
let rotation: ImageRotation = 0;
let cropPercent: CropPercent = { x: 0, y: 0, width: 100, height: 100 };
let aspectLocked = true;
let currentProject: BeadProject | null = null;
let sourceGenerationRevision: number | null = null;
let history: MatrixHistory | null = null;
let canvasController: PatternCanvasController | null = null;
let gridContract: GridDetectionContract | null = null;
let activePanel: InspectorPanel = 'tools';
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
let generationController: AbortController | null = null;
let exportCompletionState: ExportCompletionState = createExportCompletionState();
let exportReturnFocus: HTMLElement | null = null;
let chartMirrorController: AbortController | null = null;
let chartResultUrl: string | null = null;
let chartAxis: 'horizontal' | 'vertical' = 'horizontal';
let loadRevision = 0;
let preparePresetControls: PreparePresetControlsController | null = null;
let availableColorGridRenderer: AvailableColorGridRenderer | null = null;
let availableColorMobilePanelController: AvailableColorMobilePanelController | null = null;
let boardSelectController: AdaptiveSelectController | null = null;
let paletteSelectController: AdaptiveSelectController | null = null;
let availableSeriesSelectController: AdaptiveSelectController | null = null;
let ditheringSelectController: AdaptiveSelectController | null = null;
let editorSeriesSelectControllers: readonly SelectController[] = Object.freeze([]);
let editorDesktopSeriesController: UiSelectPopoverController | null = null;
let editorMobileSeriesController: MobilePickerController | null = null;
let workspaceLayoutMode: WorkspaceLayoutMode | null = null;
let syncingPreparePresetCrop = false;
let confirmationRequest: ConfirmationRequest | null = null;
let confirmationReturnFocus: HTMLElement | null = null;
let confirmationSaving = false;

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

setupUpload();
setupPrepare();
setupPatternWorkspace();
const responsiveWorkspaceMount: ResponsiveWorkspaceMount = createResponsiveWorkspaceMount({
  root: patternWorkspace,
  inspector: workspaceInspector,
  sheet: workspaceSheet,
});
updateWorkspaceLayout();
const gridController: GridEditorController = setupChartWorkspace();
setupReplacementActions();
setupConfirmationSurface();
window.addEventListener('resize', updateWorkspaceLayout);
window.addEventListener('orientationchange', updateWorkspaceLayout);
window.visualViewport?.addEventListener('resize', handleVisualViewportChange);
window.visualViewport?.addEventListener('scroll', handleVisualViewportChange);
window.addEventListener('beforeunload', cleanup);
showStage('upload');
void initializeCapabilities();

async function initializeCapabilities(): Promise<void> {
  const resolution = await loadAppCapabilities();
  const paletteMismatch =
    resolution.source === 'remote' &&
    resolution.capabilities.paletteSourceVersion !== PALETTE_SOURCE_VERSION;
  appCapabilities = paletteMismatch ? FALLBACK_APP_CAPABILITIES : resolution.capabilities;
  applyCapabilitiesToInterface();

  const warning = paletteMismatch ? '在线色板暂不可用，已切换到内置色板。' : resolution.message;
  capabilitiesStatus.textContent = warning ?? '';
  capabilitiesStatus.hidden = warning === null;
}

function applyCapabilitiesToInterface(): void {
  fileInput.accept = appCapabilities.upload.mimeTypes.join(',');
  const mimeLabels = appCapabilities.upload.mimeTypes
    .map((mimeType) =>
      mimeType === 'image/jpeg' ? 'JPEG' : mimeType === 'image/webp' ? 'WebP' : 'PNG',
    )
    .join('、');
  required(app, '[data-upload-constraints]', HTMLElement).textContent =
    `${mimeLabels}，最大 ${formatFileSize(appCapabilities.upload.maximumBytes)}`;

  const taskInputs = [...app.querySelectorAll<HTMLInputElement>('input[name="customer-task"]')];
  const newPatternSupported = appCapabilities.modes.some(
    (candidate) => candidate === 'photo' || candidate === 'pixelArt',
  );
  for (const input of taskInputs) {
    input.disabled =
      input.value === 'newPattern'
        ? !newPatternSupported
        : !appCapabilities.modes.includes('existingChart');
  }
  const selectedTask = taskInputs.find((input) => input.value === customerTask);
  if (!selectedTask || selectedTask.disabled) {
    const fallbackTask = taskInputs.find((input) => !input.disabled);
    if (fallbackTask && isCustomerTask(fallbackTask.value)) {
      customerTask = fallbackTask.value;
      prepareState = null;
    }
  }
  syncUploadPrepareControls(app, currentUploadPrepareFlow());

  applyIntegerLimits(
    required(prepareWorkspace, '[data-columns]', HTMLInputElement),
    appCapabilities.grid.minimumColumns,
    appCapabilities.grid.maximumColumns,
  );
  applyIntegerLimits(
    required(prepareWorkspace, '[data-rows]', HTMLInputElement),
    appCapabilities.grid.minimumRows,
    appCapabilities.grid.maximumRows,
  );
  applyDecimalLimits(
    required(prepareWorkspace, '[data-bead-diameter]', HTMLInputElement),
    appCapabilities.beads.minimumDiameterMm,
    appCapabilities.beads.maximumDiameterMm,
  );
  applyDecimalLimits(
    required(prepareWorkspace, '[data-bead-pitch]', HTMLInputElement),
    appCapabilities.beads.minimumPitchMm,
    appCapabilities.beads.maximumPitchMm,
  );
  applyIntegerLimits(
    required(prepareWorkspace, '[data-custom-board-rows]', HTMLInputElement),
    appCapabilities.boards.custom.minimumRows,
    appCapabilities.boards.custom.maximumRows,
  );
  applyIntegerLimits(
    required(prepareWorkspace, '[data-custom-board-columns]', HTMLInputElement),
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
  const currentBoard = selectValue(prepareWorkspace, '[data-board-preset]', 'standardSquare');
  if (boardOptions.find((option) => option.id === currentBoard)?.disabled) {
    const fallbackBoard = boardOptions.find((option) => !option.disabled);
    if (fallbackBoard) {
      boardSelectController?.setValue(fallbackBoard.id);
    }
  }
  const customBoardFields = required(
    prepareWorkspace,
    '[data-custom-board-fields]',
    HTMLFieldSetElement,
  );
  const customBoardSelected =
    selectValue(prepareWorkspace, '[data-board-preset]', 'standardSquare') === 'custom';
  customBoardFields.hidden = !customBoardSelected;
  customBoardFields.disabled = !customBoardSelected;

  for (const input of prepareWorkspace.querySelectorAll<HTMLInputElement>(
    'input[name="sampling"]',
  )) {
    input.disabled = !appCapabilities.sampling.includes(input.value as 'average' | 'nearest');
  }
  if (!appCapabilities.sampling.includes(samplingSelection.value)) {
    samplingSelection = createAutomaticSampling(
      firstSupportedNewPatternMode(),
      appCapabilities.sampling,
    );
  }
  syncSamplingControls(prepareWorkspace, samplingSelection);
  const ditheringOptions = ditheringSelectOptions().map((option) =>
    Object.freeze({
      ...option,
      disabled: !appCapabilities.dithering.includes(option.id as 'none' | 'floydSteinberg'),
    }),
  );
  ditheringSelectController?.setOptions(ditheringOptions);
  const selectedDithering =
    ditheringSelectController?.selectedId() ??
    selectValue(prepareWorkspace, '[data-dithering]', 'none');
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
    button.disabled = !appCapabilities.exports.includes(
      format as 'png' | 'pdf' | 'csv' | 'projectJson',
    );
  }
  for (const input of queryPatternWorkspaceAll('[data-export-template]', HTMLInputElement)) {
    input.disabled = !appCapabilities.pngTemplates.includes(input.value as ExportPngTemplate);
    if (input.checked && input.disabled) {
      input.checked = false;
    }
  }
  const supportedTemplate = appCapabilities.pngTemplates.includes('annotated')
    ? 'annotated'
    : (appCapabilities.pngTemplates[0] ?? 'annotated');
  if (!appCapabilities.pngTemplates.includes(exportCompletionState.pngTemplate)) {
    exportCompletionState = setExportPngTemplate(exportCompletionState, supportedTemplate);
  }
  for (const panel of queryPatternWorkspaceAll('[data-export-completion]', HTMLElement)) {
    const checkedTemplate = panel.querySelector<HTMLInputElement>('[data-export-template]:checked');
    if (!checkedTemplate) {
      const fallbackTemplate = panel.querySelector<HTMLInputElement>(
        `[data-export-template="${supportedTemplate}"]`,
      );
      if (fallbackTemplate) {
        fallbackTemplate.checked = true;
      }
    }
  }
  syncExportCompletionUi();
  for (const button of chartWorkspace.querySelectorAll<HTMLButtonElement>('[data-chart-axis]')) {
    button.disabled = !appCapabilities.gridMirrorAxes.includes(
      button.dataset.chartAxis as 'horizontal' | 'vertical',
    );
  }
  if (prepareState) {
    applyPrepareModeState();
  }
}

function setupUpload(): void {
  for (const input of app.querySelectorAll<HTMLInputElement>('input[name="customer-task"]')) {
    input.addEventListener('change', () => {
      if (input.checked && isCustomerTask(input.value)) {
        customerTask = input.value;
        recommendationRequests.cancel();
        prepareState = null;
        mode = customerTask === 'mirrorExistingChart' ? 'existingChart' : 'photo';
        samplingSelection = createAutomaticSampling('photo', appCapabilities.sampling);
        syncUploadPrepareControls(app, currentUploadPrepareFlow());
        syncSamplingControls(prepareWorkspace, samplingSelection);
      }
    });
  }

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
    void acceptFiles(event.dataTransfer?.files ? [...event.dataTransfer.files] : []);
  });
}

async function acceptFiles(files: readonly File[]): Promise<void> {
  const requestRevision = ++loadRevision;
  const result = validateSingleImageFile(files, {
    mimeTypes: appCapabilities.upload.mimeTypes,
    maximumBytes: appCapabilities.upload.maximumBytes,
  });
  if (!result.ok) {
    setFileStatus(result.message, 'error');
    return;
  }
  generationController?.abort();
  exportCoordinator.invalidate();
  chartMirrorController?.abort();
  recommendationRequests.cancel();
  setFileStatus(`正在读取 ${result.file.name}…`, 'loading');
  objectUrls.revokeAll();
  const objectUrl = objectUrls.create(result.file);

  try {
    const resource = await decodeImageResourceFromObjectUrl(objectUrl);
    if (requestRevision !== loadRevision) {
      objectUrls.revoke(objectUrl);
      return;
    }
    if (resource.width * resource.height > appCapabilities.upload.maximumDecodedPixels) {
      objectUrls.revoke(objectUrl);
      selectedImage = null;
      setFileStatus(
        `图片解码后共有 ${String(resource.width * resource.height)} 像素，超过 ${String(
          appCapabilities.upload.maximumDecodedPixels,
        )} 像素上限。请缩小图片后重试。`,
        'error',
      );
      return;
    }
    selectedImage = {
      file: result.file,
      objectUrl,
      width: resource.width,
      height: resource.height,
      image: resource.image,
      mimeType: result.mimeType,
    };
    rotation = 0;
    cropPercent = { x: 0, y: 0, width: 100, height: 100 };
    currentProject = null;
    history = null;
    canvasController?.destroy();
    canvasController = null;
    projectFileStatus.textContent = '';
    setFileStatus('图片已载入。', 'ready');
    if (customerTask === 'mirrorExistingChart') {
      mode = 'existingChart';
      prepareState = null;
      syncUploadPrepareControls(app, currentUploadPrepareFlow());
      openChartWorkspace();
    } else {
      const recommendationRequest = recommendationRequests.begin();
      applyUploadPrepareFlow(
        beginUploadedImage(currentUploadPrepareFlow(), recommendationRequest.token),
      );
      mode = firstSupportedNewPatternMode();
      samplingSelection = createAutomaticSampling(mode, appCapabilities.sampling);
      syncSamplingControls(prepareWorkspace, samplingSelection);
      openPrepareWorkspace();
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
    objectUrls.revoke(objectUrl);
    selectedImage = null;
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
      required(prepareWorkspace, '[data-mode-recommendation]', HTMLElement).textContent =
        '暂时无法自动分析这张图片，请在这里选择“自然图片”或“清晰像素”。';
      const generateButton = required(
        prepareWorkspace,
        '[data-generate-pattern]',
        HTMLButtonElement,
      );
      generateButton.disabled = prepareState.preference === 'auto';
    }
  }
}

function applyPrepareModeState(): void {
  const state = prepareState;
  if (!state) return;
  syncUploadPrepareControls(app, currentUploadPrepareFlow());
  const status = required(prepareWorkspace, '[data-mode-recommendation]', HTMLElement);
  const generateButton = required(prepareWorkspace, '[data-generate-pattern]', HTMLButtonElement);
  if (state.recommendationStatus === 'analyzing' && state.resolvedMode === null) {
    mode = firstSupportedNewPatternMode();
    status.textContent = state.reason;
    generateButton.disabled = true;
    updateSamplingDefault();
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
    generateButton.disabled = true;
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
  generateButton.disabled = false;
  updateSamplingDefault();
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
  generationController?.abort();
  exportCoordinator.invalidate();
  chartMirrorController?.abort();
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
    objectUrls.revokeAll();
    selectedImage = null;
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
    syncSamplingControls(prepareWorkspace, samplingSelection);
    currentProject = project;
    sourceGenerationRevision = null;
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

function setupPrepare(): void {
  const prepareReplace = required(prepareWorkspace, '[data-prepare-replace]', HTMLButtonElement);
  const rotateLeft = required(prepareWorkspace, '[data-rotate-left]', HTMLButtonElement);
  const rotateRight = required(prepareWorkspace, '[data-rotate-right]', HTMLButtonElement);
  const columnsInput = required(prepareWorkspace, '[data-columns]', HTMLInputElement);
  const rowsInput = required(prepareWorkspace, '[data-rows]', HTMLInputElement);
  const aspectButton = required(prepareWorkspace, '[data-aspect-lock]', HTMLButtonElement);
  const boardPreset = required(prepareWorkspace, '[data-board-preset]', HTMLButtonElement);
  const paletteSelect = required(prepareWorkspace, '[data-palette-id]', HTMLButtonElement);
  const maximumColors = required(prepareWorkspace, '[data-maximum-colors]', HTMLInputElement);
  const alphaThreshold = required(
    prepareWorkspace,
    '[data-alpha-threshold]',
    HTMLInputElement,
  );
  const beadDiameter = required(prepareWorkspace, '[data-bead-diameter]', HTMLInputElement);
  const beadPitch = required(prepareWorkspace, '[data-bead-pitch]', HTMLInputElement);
  const customBoardFields = required(
    prepareWorkspace,
    '[data-custom-board-fields]',
    HTMLFieldSetElement,
  );
  const customBoardRows = required(prepareWorkspace, '[data-custom-board-rows]', HTMLInputElement);
  const customBoardColumns = required(
    prepareWorkspace,
    '[data-custom-board-columns]',
    HTMLInputElement,
  );
  const selectAllColors = required(prepareWorkspace, '[data-select-all-colors]', HTMLButtonElement);
  const clearAllColors = required(prepareWorkspace, '[data-clear-all-colors]', HTMLButtonElement);
  const availableColorGrid = required(prepareWorkspace, '[data-available-color-grid]', HTMLElement);
  const availableColorSearch = required(
    prepareWorkspace,
    '[data-available-color-search]',
    HTMLInputElement,
  );
  const availableColorSeries = required(
    prepareWorkspace,
    '[data-available-color-series]',
    HTMLButtonElement,
  );
  const openAvailableColors = required(
    prepareWorkspace,
    '[data-open-available-colors]',
    HTMLButtonElement,
  );
  const availableColorFilter = required(
    prepareWorkspace,
    '[data-available-color-filter]',
    HTMLElement,
  );
  const generateButton = required(prepareWorkspace, '[data-generate-pattern]', HTMLButtonElement);
  const returnEditorButton = required(prepareWorkspace, '[data-return-editor]', HTMLButtonElement);
  const cropFrame = required(prepareWorkspace, '[data-crop-frame]', HTMLElement);
  const cropSelection = required(prepareWorkspace, '[data-crop-selection]', HTMLElement);
  const cropInputs = {
    x: required(prepareWorkspace, '[data-crop-x]', HTMLInputElement),
    y: required(prepareWorkspace, '[data-crop-y]', HTMLInputElement),
    width: required(prepareWorkspace, '[data-crop-width]', HTMLInputElement),
    height: required(prepareWorkspace, '[data-crop-height]', HTMLInputElement),
  };
  let cropGesture: {
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly initial: CropPercent;
    readonly handle: 'move' | 'nw' | 'ne' | 'sw' | 'se';
  } | null = null;

  prepareReplace.addEventListener('click', handleReplaceImageClick);
  rotateLeft.addEventListener('click', () => {
    rotation = normalizeRotation(rotation - 90);
    cropPercent = { x: 0, y: 0, width: 100, height: 100 };
    drawCropPreview();
    renderCropSelection();
    updatePrepareSummaries();
    announce('图片已向左旋转。');
  });
  rotateRight.addEventListener('click', () => {
    rotation = normalizeRotation(rotation + 90);
    cropPercent = { x: 0, y: 0, width: 100, height: 100 };
    drawCropPreview();
    renderCropSelection();
    updatePrepareSummaries();
    announce('图片已向右旋转。');
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
  availableColorSearch.addEventListener('input', () => {
    prepareColorQuery = availableColorSearch.value;
    renderAvailableColorFilter();
  });
  selectAllColors.addEventListener('click', () => {
    availableColorIds = new Set(
      getPalette(selectValue(prepareWorkspace, '[data-palette-id]', 'mard')).colorIds,
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
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.availableColorId) {
      return;
    }
    if (input.checked) {
      availableColorIds.add(input.dataset.availableColorId);
    } else if (availableColorIds.size === 1) {
      input.checked = true;
      announce('至少保留一种颜色。');
      return;
    } else {
      availableColorIds.delete(input.dataset.availableColorId);
    }
    maximumColors.max = String(availableColorIds.size);
    preparePresetControls?.setAvailableColorCount(availableColorIds.size);
    renderAvailableColorFilter();
  });
  generateButton.addEventListener('click', () => {
    void startPatternGeneration();
  });
  returnEditorButton.addEventListener('click', () => {
    if (currentProject && history) {
      openPatternEditor(currentProject);
      announce('已返回当前图纸。');
    }
  });

  cropSelection.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const handle = target.classList.contains('crop-handle-nw')
      ? 'nw'
      : target.classList.contains('crop-handle-ne')
        ? 'ne'
        : target.classList.contains('crop-handle-sw')
          ? 'sw'
          : target.classList.contains('crop-handle-se')
            ? 'se'
            : 'move';
    event.preventDefault();
    cropSelection.setPointerCapture(event.pointerId);
    cropGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initial: cropPercent,
      handle,
    };
  });
  cropSelection.addEventListener('pointermove', (event) => {
    if (!cropGesture || cropGesture.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const frameRect = cropFrame.getBoundingClientRect();
    const deltaX = ((event.clientX - cropGesture.startX) / frameRect.width) * 100;
    const deltaY = ((event.clientY - cropGesture.startY) / frameRect.height) * 100;
    cropPercent = resizeCrop(cropGesture.initial, cropGesture.handle, deltaX, deltaY);
    renderCropSelection();
    updatePrepareSummaries();
  });
  const endCropGesture = (event: PointerEvent): void => {
    if (!cropGesture || cropGesture.pointerId !== event.pointerId) {
      return;
    }
    cropGesture = null;
    if (cropSelection.hasPointerCapture(event.pointerId)) {
      cropSelection.releasePointerCapture(event.pointerId);
    }
    announce('裁剪范围已更新。');
  };
  cropSelection.addEventListener('pointerup', endCropGesture);
  cropSelection.addEventListener('pointercancel', (event) => {
    if (!cropGesture || cropGesture.pointerId !== event.pointerId) {
      return;
    }
    cropPercent = cropGesture.initial;
    cropGesture = null;
    renderCropSelection();
    updatePrepareSummaries();
    announce('本次裁剪调整已取消。');
  });
  cropSelection.addEventListener('lostpointercapture', (event) => {
    if (cropGesture?.pointerId === event.pointerId) {
      cropPercent = cropGesture.initial;
      cropGesture = null;
      renderCropSelection();
      updatePrepareSummaries();
    }
  });
  cropSelection.addEventListener('keydown', (event) => {
    if (!isCropArrowKey(event.key)) {
      return;
    }
    event.preventDefault();
    cropPercent = applyCropKeyboardStep(cropPercent, event.key, {
      resize: event.altKey,
      shiftKey: event.shiftKey,
    });
    renderCropSelection();
    updatePrepareSummaries();
    announce(event.altKey ? '裁剪大小已更新。' : '裁剪位置已更新。');
  });
  for (const input of Object.values(cropInputs)) {
    input.addEventListener('input', () => {
      cropPercent = normalizeCropPercent({
        x: Number(cropInputs.x.value),
        y: Number(cropInputs.y.value),
        width: Number(cropInputs.width.value),
        height: Number(cropInputs.height.value),
      });
      renderCropSelection(input);
      updatePrepareSummaries();
    });
  }

  availableColorGridRenderer = createAvailableColorGridRenderer(availableColorGrid, {
    searchInput: availableColorSearch,
    status: required(prepareWorkspace, '[data-available-color-filter-status]', HTMLElement),
  });
  const pickerSurface = required(prepareWorkspace, '[data-prepare-picker-surface]', HTMLElement);
  const pickerPanel = required(prepareWorkspace, '[data-prepare-settings-panel]', HTMLElement);
  availableColorMobilePanelController = createAvailableColorMobilePanel({
    sheet: pickerSurface,
    panel: pickerPanel,
    content: availableColorFilter,
    trigger: openAvailableColors,
    searchInput: availableColorSearch,
  });
  boardSelectController = createAdaptiveSelectController({
    trigger: boardPreset,
    overlayRoot,
    id: 'prepare-board',
    title: '选择拼板',
    options: boardSelectOptions(),
    selectedId: selectValue(prepareWorkspace, '[data-board-preset]', 'standardSquare'),
    mobileSurface: pickerSurface,
    mobilePanel: pickerPanel,
    onChange() {
      updateCustomBoardVisibility();
      updatePrepareSummaries();
    },
  });
  paletteSelectController = createAdaptiveSelectController({
    trigger: paletteSelect,
    overlayRoot,
    id: 'prepare-palette',
    title: '选择色板',
    options: paletteSelectOptions(),
    selectedId: selectValue(prepareWorkspace, '[data-palette-id]', 'mard'),
    mobileSurface: pickerSurface,
    mobilePanel: pickerPanel,
    onChange(selectedId) {
      applyPreparePalette(selectedId);
    },
  });
  availableSeriesSelectController = createAdaptiveSelectController({
    trigger: availableColorSeries,
    overlayRoot,
    id: 'prepare-color-series',
    title: '筛选颜色系列',
    options: [{ id: '', label: '全部系列' }],
    selectedId: '',
    mobileSurface: pickerSurface,
    mobilePanel: pickerPanel,
    onChange(selectedId) {
      prepareColorSeries = selectedId;
      renderAvailableColorFilter();
    },
  });
  const ditheringTrigger = required(prepareWorkspace, '[data-dithering]', HTMLButtonElement);
  ditheringSelectController = createAdaptiveSelectController({
    trigger: ditheringTrigger,
    overlayRoot,
    id: 'prepare-dithering',
    title: '选择颜色接近方式',
    options: ditheringSelectOptions(),
    selectedId: selectValue(prepareWorkspace, '[data-dithering]', 'none'),
    mobileSurface: pickerSurface,
    mobilePanel: pickerPanel,
    onChange(selectedId) {
      const dithering = selectedId === 'floydSteinberg' ? 'floydSteinberg' : 'none';
      preparePresetControls?.setDithering(dithering);
      updatePrepareSummaries();
    },
  });
  preparePresetControls = mountPreparePresetControls(prepareWorkspace, {
    initialState: {
      croppedColumns: 1,
      croppedRows: 1,
      columns: 48,
      rows: 48,
      beadDiameterMm: 5,
      beadPitchMm: 5,
      maximumColors: 24,
      availableColorCount: availableColorIds.size,
      dithering: 'none',
    },
    onChange() {
      if (!syncingPreparePresetCrop) {
        ditheringSelectController?.setValue(
          selectValue(prepareWorkspace, '[data-dithering]', 'none'),
        );
        updatePrepareSummaries();
      }
    },
  });
  for (const input of prepareWorkspace.querySelectorAll<HTMLInputElement>(
    'input[name="mode-preference"]',
  )) {
    input.addEventListener('change', () => {
      if (input.checked && isModePreference(input.value) && prepareState?.task === 'newPattern') {
        prepareState = setModePreference(prepareState, input.value);
        applyPrepareModeState();
      }
    });
  }
  for (const input of prepareWorkspace.querySelectorAll<HTMLInputElement>(
    'input[name="sampling"]',
  )) {
    input.addEventListener('change', () => {
      if (input.checked && isSamplingValue(input.value)) {
        samplingSelection = chooseSampling(samplingSelection, input.value, 'user');
        syncSamplingControls(prepareWorkspace, samplingSelection);
      }
    });
  }
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
    const isCustom = boardPreset.dataset.value === 'custom';
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

function openPrepareWorkspace(preserveProjectSettings = false): void {
  if (!selectedImage) {
    return;
  }
  availableColorMobilePanelController?.close();
  showStage('prepare');
  const columnsInput = required(prepareWorkspace, '[data-columns]', HTMLInputElement);
  const rowsInput = required(prepareWorkspace, '[data-rows]', HTMLInputElement);
  const project = preserveProjectSettings ? currentProject : null;
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
    const aspectButton = required(prepareWorkspace, '[data-aspect-lock]', HTMLButtonElement);
    aspectButton.classList.toggle('is-active', aspectLocked);
    aspectButton.setAttribute('aria-pressed', String(aspectLocked));
    boardSelectController?.setValue(project.grid.boardPresetId);
    required(prepareWorkspace, '[data-custom-board-rows]', HTMLInputElement).value = String(
      project.grid.boardRows,
    );
    required(prepareWorkspace, '[data-custom-board-columns]', HTMLInputElement).value = String(
      project.grid.boardColumns,
    );
    paletteSelectController?.setValue(project.palette.paletteId);
    availableColorIds = new Set(project.palette.availableColorIds);
    required(prepareWorkspace, '[data-maximum-colors]', HTMLInputElement).value = String(
      project.palette.maximumColors ?? project.palette.availableColorIds.length,
    );
    required(prepareWorkspace, '[data-bead-diameter]', HTMLInputElement).value = String(
      project.grid.beadDiameterMm,
    );
    required(prepareWorkspace, '[data-bead-pitch]', HTMLInputElement).value = String(
      project.grid.beadPitchMm,
    );
    ditheringSelectController?.setValue(project.generation.dithering);
    required(prepareWorkspace, '[data-alpha-threshold]', HTMLInputElement).value = String(
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
    syncSamplingControls(prepareWorkspace, samplingSelection);
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
      dithering: project.generation.dithering,
    });
  } else {
    const cropDimensions = croppedImageDimensions();
    const presetDimensions = dimensionsForLongEdge(48, cropDimensions.width, cropDimensions.height);
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
  const palette = getPalette(selectValue(prepareWorkspace, '[data-palette-id]', 'mard'));
  if (![...availableColorIds].every((colorId) => palette.colorIds.includes(colorId))) {
    availableColorIds = new Set(palette.colorIds);
  }
  const customFields = required(
    prepareWorkspace,
    '[data-custom-board-fields]',
    HTMLFieldSetElement,
  );
  const customBoard =
    selectValue(prepareWorkspace, '[data-board-preset]', 'standardSquare') === 'custom';
  customFields.hidden = !customBoard;
  customFields.disabled = !customBoard;
  required(prepareWorkspace, '[data-generate-label]', HTMLElement).textContent = currentProject
    ? '重新生成图纸'
    : '生成图纸';
  required(prepareWorkspace, '[data-return-editor]', HTMLButtonElement).hidden =
    currentProject === null;
  required(prepareWorkspace, '[data-generate-status]', HTMLElement).textContent = currentProject
    ? '当前图纸会保留到重新生成成功；替换前会再次确认。'
    : '';
  applyPrepareModeState();
  initializePrepareColorSeries();
  renderAvailableColorFilter();
  drawCropPreview();
  renderCropSelection();
  updatePrepareSummaries();
}

function drawCropPreview(): void {
  if (!selectedImage) {
    return;
  }
  const canvas = required(prepareWorkspace, '[data-crop-canvas]', HTMLCanvasElement);
  const frame = required(prepareWorkspace, '[data-crop-frame]', HTMLElement);
  const image = selectedImage.image;
  const dimensions = rotatedDimensions();
  const maxDimension = 1400;
  const scale = Math.min(1, maxDimension / Math.max(dimensions.width, dimensions.height));
  canvas.width = Math.max(1, Math.round(dimensions.width * scale));
  canvas.height = Math.max(1, Math.round(dimensions.height * scale));
  frame.style.aspectRatio = `${String(dimensions.width)} / ${String(dimensions.height)}`;
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  if (rotation === 90) {
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(image, 0, 0, canvas.height, canvas.width);
  } else if (rotation === 180) {
    context.translate(canvas.width, canvas.height);
    context.rotate(Math.PI);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } else if (rotation === 270) {
    context.translate(0, canvas.height);
    context.rotate(-Math.PI / 2);
    context.drawImage(image, 0, 0, canvas.height, canvas.width);
  } else {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  }
  context.restore();
}

function renderCropSelection(editingInput?: HTMLInputElement): void {
  const selection = required(prepareWorkspace, '[data-crop-selection]', HTMLElement);
  selection.style.left = `${String(cropPercent.x)}%`;
  selection.style.top = `${String(cropPercent.y)}%`;
  selection.style.width = `${String(cropPercent.width)}%`;
  selection.style.height = `${String(cropPercent.height)}%`;
  syncCropNumericInputValues(prepareWorkspace, cropPercent, editingInput);
}

function updatePrepareSummaries(): void {
  if (!selectedImage) {
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
  const columns = numberValue(prepareWorkspace, '[data-columns]', 48);
  const rows = numberValue(prepareWorkspace, '[data-rows]', 48);
  const board = selectedBoardSize();
  const boardCount = Math.ceil(columns / board.columns) * Math.ceil(rows / board.rows);
  const beadDiameter = numberValue(prepareWorkspace, '[data-bead-diameter]', 5);
  const beadPitch = Math.max(
    beadDiameter,
    numberValue(prepareWorkspace, '[data-bead-pitch]', beadDiameter),
  );
  required(prepareWorkspace, '[data-image-summary]', HTMLElement).textContent =
    `${String(cropWidth)} × ${String(cropHeight)} px`;
  required(prepareWorkspace, '[data-size-summary]', HTMLElement).textContent =
    `约 ${(((columns - 1) * beadPitch + beadDiameter) / 10).toFixed(1)} × ${(
      ((rows - 1) * beadPitch + beadDiameter) /
      10
    ).toFixed(1)} cm`;
  required(prepareWorkspace, '[data-board-summary]', HTMLElement).textContent =
    `约需 ${String(boardCount)} 块拼板`;
  syncAlphaThresholdCopy();
}

function syncAlphaThresholdCopy(): void {
  const threshold = numberValue(prepareWorkspace, '[data-alpha-threshold]', 0.1);
  const label = required(prepareWorkspace, '[data-alpha-threshold-label]', HTMLElement);
  const description = required(
    prepareWorkspace,
    '[data-alpha-threshold-description]',
    HTMLElement,
  );
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
  const paletteId = selectValue(prepareWorkspace, '[data-palette-id]', 'mard');
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
  const paletteId = selectValue(prepareWorkspace, '[data-palette-id]', 'mard');
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
    { id: '', label: '全部系列' },
    ...series.map((value) => ({ id: value, label: `${value} 系列` })),
  ];
  availableSeriesSelectController?.setOptions(options);
  availableSeriesSelectController?.setValue(prepareColorSeries);
  required(prepareWorkspace, '[data-available-color-search]', HTMLInputElement).value =
    prepareColorQuery;
}

function updateAvailableColorSummary(): void {
  required(prepareWorkspace, '[data-available-color-summary]', HTMLElement).textContent =
    availableColorIds.size === 0 ? '尚未选择颜色' : `已选择 ${String(availableColorIds.size)} 色`;
}

async function startPatternGeneration(replacementConfirmed = false): Promise<void> {
  const image = selectedImage;
  if (!image) {
    return;
  }
  if (
    prepareState?.task === 'newPattern' &&
    prepareState.recommendationStatus === 'analyzing' &&
    prepareState.resolvedMode === null
  ) {
    required(prepareWorkspace, '[data-generate-status]', HTMLElement).textContent =
      '正在分析图片；也可以在“专业设置”中先选择自然图片或清晰像素。';
    return;
  }
  if (!hasAvailableColorSelection(availableColorIds)) {
    required(prepareWorkspace, '[data-generate-status]', HTMLElement).textContent =
      '请至少选择一种手边有的颜色。';
    announce('生成前请至少选择一种颜色。');
    return;
  }
  if (
    !replacementConfirmed &&
    currentProject &&
    sourceGenerationRevision !== null &&
    currentProject.revision !== sourceGenerationRevision
  ) {
    openConfirmation({
      title: '重新生成会替换当前编辑',
      description: '新图纸生成成功后，当前逐格修改和撤销记录将被替换。你可以先保存项目，之后再继续。',
      onContinue() {
        void startPatternGeneration(true);
      },
    });
    return;
  }
  generationController?.abort();
  const controller = new AbortController();
  generationController = controller;
  const generateButton = required(prepareWorkspace, '[data-generate-pattern]', HTMLButtonElement);
  const status = required(prepareWorkspace, '[data-generate-status]', HTMLElement);
  generateButton.disabled = true;
  required(generateButton, '[data-generate-label]', HTMLElement).textContent = '正在生成图纸…';
  status.textContent = '正在按你选择的色板生成拼豆格，可以随时更换图片取消。';
  sessionStatus.textContent = '正在生成';

  try {
    const result = await generatePattern(image.file, buildGenerationSettings(), controller.signal);
    if (controller.signal.aborted) {
      return;
    }
    currentProject = result.project;
    sourceGenerationRevision = result.project.revision;
    selectedColorId =
      Object.keys(result.statistics.perColorCounts)[0] ??
      result.project.palette.availableColorIds[0] ??
      selectedColorId;
    availableColorIds = new Set(result.project.palette.availableColorIds);
    history = new MatrixHistory(result.project.cells, 100, result.project.revision);
    currentSelection = null;
    openPatternEditor(result.project);
    announce(
      `图纸已生成，共 ${String(result.statistics.nonEmptyBeadCount)} 颗拼豆，使用 ${String(
        result.statistics.usedColorCount,
      )} 种颜色。`,
    );
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      status.textContent = '生成已取消。';
      return;
    }
    status.textContent =
      error instanceof PatternApiError ? error.message : '生成失败，请检查设置后重试。';
    sessionStatus.textContent = '需要重试';
  } finally {
    if (generationController === controller) {
      generationController = null;
    }
    required(generateButton, '[data-generate-label]', HTMLElement).textContent = currentProject
      ? '重新生成图纸'
      : '生成图纸';
    if (prepareState) {
      applyPrepareModeState();
    } else {
      generateButton.disabled = false;
    }
  }
}

function buildGenerationSettings(): PatternGenerationSettings {
  const dimensions = rotatedDimensions();
  const paletteId = selectValue(prepareWorkspace, '[data-palette-id]', 'mard') as
    'default' | 'mard';
  const maximumValue = numberValue(prepareWorkspace, '[data-maximum-colors]', 24);
  const sampling = samplingSelection.value;
  const dithering =
    selectValue(prepareWorkspace, '[data-dithering]', 'none') === 'floydSteinberg'
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
    rows: numberValue(prepareWorkspace, '[data-rows]', 48),
    columns: numberValue(prepareWorkspace, '[data-columns]', 48),
    aspectLocked,
    beadDiameterMm: numberValue(prepareWorkspace, '[data-bead-diameter]', 5),
    beadPitchMm: Math.max(
      numberValue(prepareWorkspace, '[data-bead-diameter]', 5),
      numberValue(prepareWorkspace, '[data-bead-pitch]', 5),
    ),
    boardPresetId: selectValue(prepareWorkspace, '[data-board-preset]', 'standardSquare') as
      'smallSquare' | 'standardSquare' | 'custom',
    boardRows: board.rows,
    boardColumns: board.columns,
    paletteId,
    availableColorIds: [...availableColorIds],
    maximumColors: Math.min(Math.max(1, maximumValue), availableColorIds.size),
    sampling,
    dithering,
    alphaEmptyThreshold: numberValue(prepareWorkspace, '[data-alpha-threshold]', 0.1),
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
  let suppressSheetClick = false;
  let sheetGesture: {
    readonly pointerId: number;
    readonly startY: number;
    readonly startHeight: number;
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
      firstUseHintSession.dismiss();
      syncFirstUseHint();
      return;
    }
    if (target.closest('[data-sheet-open-tools]')) {
      setActiveInspectorPanel('tools');
      setSheetState('half');
      return;
    }
    if (target.closest('[data-return-prepare]')) {
      if (selectedImage) {
        openPrepareWorkspace(true);
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
      exportCompletionState = selectExportTask(
        exportCompletionState,
        exportTaskButton.dataset.exportTask,
      );
      syncExportCompletionUi();
      return;
    }
    if (target.closest('[data-export-run]')) {
      void startSelectedExport();
      return;
    }
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
  patternWorkspace.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.matches('[data-color-search]')) {
      paletteQuery = target.value;
      syncPaletteControls(target);
      applyPaletteFilters();
      return;
    }
    if (target.matches('[data-color-filter]') && target.checked) {
      paletteScope = target.value === 'used' || target.value === 'recent' ? target.value : 'all';
      syncPaletteControls(target);
      applyPaletteFilters();
    }
  });
  patternWorkspace.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.matches('[data-export-template]')) {
      const template = target.value === 'pure' ? 'pure' : 'annotated';
      exportCompletionState = setExportPngTemplate(exportCompletionState, template);
      syncExportCompletionUi();
    }
  });

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

  workspaceSheetHandle.addEventListener('click', () => {
    if (suppressSheetClick) {
      suppressSheetClick = false;
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
      startY: event.clientY,
      startHeight: currentHeight,
      currentHeight,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      pointerVelocityY: 0,
      moved: false,
    };
    workspaceSheet.dataset.sheetDragging = 'true';
    sheetDragRegion.setPointerCapture(event.pointerId);
    event.preventDefault();
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
    sheetGesture.moved ||= Math.abs(event.clientY - sheetGesture.startY) > 4;
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
    suppressSheetClick = sheetGesture.moved;
    sheetGesture = null;
    sheetMotionState = motion;
    workspaceSheet.style.removeProperty('--sheet-height');
    delete workspaceSheet.dataset.sheetDragging;
    applySheetState(motion.stableState);
    if (sheetDragRegion.hasPointerCapture(event.pointerId)) {
      sheetDragRegion.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
  });
  sheetDragRegion.addEventListener('pointercancel', () => {
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

  const seriesTriggers = queryPatternWorkspaceAll('[data-color-series-filter]', HTMLButtonElement);
  const desktopSeriesTrigger = seriesTriggers.find(
    (trigger) => trigger.closest('[data-palette-controls="desktop"]') !== null,
  );
  const mobileSeriesTrigger = seriesTriggers.find(
    (trigger) => trigger.closest('[data-palette-controls="mobile"]') !== null,
  );
  const controllers: SelectController[] = [];
  if (desktopSeriesTrigger) {
    editorDesktopSeriesController = createUiSelectPopover({
      trigger: desktopSeriesTrigger,
      overlayRoot,
      id: 'editor-series-desktop',
      options: [{ id: '', label: '全部系列' }],
      selectedId: '',
      onChange: selectEditorSeries,
    });
    controllers.push(editorDesktopSeriesController);
  }
  if (mobileSeriesTrigger) {
    editorMobileSeriesController = createMobilePicker({
      sheet: workspaceSheet,
      panel: mobileSheetContent,
      trigger: mobileSeriesTrigger,
      id: 'editor-series-mobile',
      title: '筛选颜色系列',
      options: [{ id: '', label: '全部系列' }],
      selectedId: '',
      onChange: selectEditorSeries,
    });
    controllers.push(editorMobileSeriesController);
  }
  editorSeriesSelectControllers = Object.freeze(controllers);

  function selectEditorSeries(selectedId: string): void {
    paletteSeries = selectedId;
    syncPaletteControls();
    applyPaletteFilters();
  }
}

function openPatternEditor(project: BeadProject): void {
  currentProject = project;
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
  firstUseHintSession.enterEditor();
  syncFirstUseHint();
  resetExportSurface();
  for (const button of queryPatternWorkspaceAll('[data-return-prepare]', HTMLButtonElement)) {
    button.disabled = selectedImage === null;
    button.title = selectedImage
      ? '保留当前矩阵并返回生成设置'
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
  abortActiveExport();
  const cells = mirrorCells(currentProject.cells, axis);
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
  announce(axis === 'horizontal' ? '图案已左右镜像。' : '图案已上下镜像。');
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
    syncFirstUseHint();
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
    { id: '', label: '全部系列' },
    ...series.map((value) => ({ id: value, label: `${value} 系列` })),
  ];
  for (const controller of editorSeriesSelectControllers) {
    controller.setOptions(options);
    controller.setValue(paletteSeries);
  }
  syncPaletteControls();
  applyPaletteFilters();
}

function syncPaletteControls(source?: HTMLInputElement): void {
  for (const input of queryPatternWorkspaceAll('[data-color-search]', HTMLInputElement)) {
    if (input !== source) {
      input.value = paletteQuery;
    }
  }
  for (const input of queryPatternWorkspaceAll('[data-color-filter]', HTMLInputElement)) {
    input.checked = input.value === paletteScope;
  }
  for (const controller of editorSeriesSelectControllers) {
    controller.setValue(paletteSeries);
  }
  const mobileTrigger = workspaceSheet.querySelector<HTMLButtonElement>(
    '[data-palette-controls="mobile"] [data-color-series-filter]',
  );
  if (mobileTrigger) {
    setSelectTriggerValue(
      mobileTrigger,
      paletteSeries,
      paletteSeries === '' ? '全部系列' : `${paletteSeries} 系列`,
    );
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
    `显示 ${String(filtered.length)} / ${String(project.palette.availableColorIds.length)} 色`,
  );
}

function setTextAll(selector: string, text: string): void {
  for (const element of queryPatternWorkspaceAll(selector, HTMLElement)) {
    element.textContent = text;
  }
}

async function startSelectedExport(): Promise<void> {
  if (!currentProject) {
    return;
  }
  const task = exportCompletionState.selectedTask;
  const definition = exportTaskDefinition(task);
  const capabilityFormat = definition.format === 'json' ? 'projectJson' : definition.format;
  if (!appCapabilities.exports.includes(capabilityFormat)) {
    announce('当前服务不支持这种导出格式。');
    return;
  }
  await exportCoordinator.start({
    project: currentProject,
    task,
    pngTemplate: exportCompletionState.pngTemplate,
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
  if (mobile) {
    setSheetState('full');
  }
  setExportSurfacesOpen(true);
  syncExportCompletionUi();
  const surfaceRoot = mobile ? workspaceSheet : workspaceInspector;
  surfaceRoot
    .querySelector<HTMLButtonElement>(`[data-export-task="${exportCompletionState.selectedTask}"]`)
    ?.focus();
}

function closeExportSurface(restoreFocus = true): void {
  const returnContext = exportCompletionState.returnContext;
  exportCoordinator.invalidate();
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
  exportCompletionState = createExportCompletionState();
  setExportSurfacesOpen(false);
  exportReturnFocus = null;
}

function setExportSurfacesOpen(open: boolean): void {
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
  const statistics = project ? calculateStatistics(project.cells) : null;
  for (const panel of queryPatternWorkspaceAll('[data-export-completion]', HTMLElement)) {
    for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-export-task]')) {
      const selected = button.dataset.exportTask === exportCompletionState.selectedTask;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    const templates = required(panel, '[data-export-template-options]', HTMLFieldSetElement);
    templates.hidden = exportCompletionState.selectedTask !== 'shareImage';
    for (const input of panel.querySelectorAll<HTMLInputElement>('[data-export-template]')) {
      input.checked = input.value === exportCompletionState.pngTemplate;
    }
    const runButton = required(panel, '[data-export-run]', HTMLButtonElement);
    runButton.textContent =
      exportCompletionState.selectedTask === 'saveProject'
        ? '保存项目文件'
        : `下载${definition.label}`;
    runButton.disabled =
      exportCompletionState.status.phase === 'running' ||
      !appCapabilities.exports.includes(
        definition.format === 'json' ? 'projectJson' : definition.format,
      );
    required(panel, '[data-export-summary]', HTMLElement).textContent =
      statistics === null
        ? '当前没有可导出的图纸。'
        : `${String(statistics.nonEmptyBeadCount)} 颗拼豆 · ${String(
            statistics.usedColorCount,
          )} 色 · ${String(project?.grid.columns ?? 0)} × ${String(project?.grid.rows ?? 0)} 格`;
    panel.setAttribute('aria-busy', String(exportCompletionState.status.phase === 'running'));
    required(panel, '[data-export-status]', HTMLElement).textContent = exportStatusMessage();
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
}

function setupChartWorkspace(): GridEditorController {
  const generateButton = required(chartWorkspace, '[data-chart-generate]', HTMLButtonElement);
  const downloadButton = required(chartWorkspace, '[data-chart-download]', HTMLButtonElement);
  const controller = mountGridEditor(chartWorkspace, {
    onContractChange(contract) {
      gridContract = contract;
      generateButton.disabled = contract === null;
      clearChartResult();
    },
    onDetectionChange(detecting) {
      generateButton.disabled = detecting || gridContract === null;
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
  for (const axisButton of chartWorkspace.querySelectorAll<HTMLButtonElement>(
    '[data-chart-axis]',
  )) {
    axisButton.addEventListener('click', () => {
      chartAxis = axisButton.dataset.chartAxis === 'vertical' ? 'vertical' : 'horizontal';
      for (const button of chartWorkspace.querySelectorAll<HTMLButtonElement>(
        '[data-chart-axis]',
      )) {
        const active = button === axisButton;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      }
      clearChartResult();
    });
  }
  generateButton.addEventListener('click', () => {
    void generateChartMirror();
  });
  downloadButton.addEventListener('click', () => {
    if (chartResultUrl) {
      const anchor = document.createElement('a');
      anchor.href = chartResultUrl;
      anchor.download = `${safeDownloadBaseName(selectedImage?.file.name ?? 'chart')}-${chartAxis}-mirror.png`;
      anchor.click();
    }
  });
  return controller;
}

function openChartWorkspace(): void {
  if (!selectedImage) {
    return;
  }
  showStage('chart');
  gridContract = null;
  clearChartResult();
  gridController.setImage({
    file: selectedImage.file,
    fileName: selectedImage.file.name,
    objectUrl: selectedImage.objectUrl,
    naturalImage: { width: selectedImage.width, height: selectedImage.height },
  });
}

async function generateChartMirror(): Promise<void> {
  const image = selectedImage;
  const contract = gridContract;
  if (!image || !contract) {
    return;
  }
  chartMirrorController?.abort();
  const controller = new AbortController();
  chartMirrorController = controller;
  const button = required(chartWorkspace, '[data-chart-generate]', HTMLButtonElement);
  button.disabled = true;
  button.textContent = '正在镜像图纸…';
  gridController.setMessage('正在镜像完整拼豆格，坐标和图例会保持原位…');
  clearChartResult();

  try {
    const blob = await mirrorGrid(image.file, contract, chartAxis, controller.signal);
    if (controller.signal.aborted) {
      return;
    }
    chartResultUrl = URL.createObjectURL(blob);
    gridController.showResult(chartResultUrl);
    gridController.setMessage(
      chartAxis === 'horizontal'
        ? '左右镜像已完成，网格外坐标和图例保持不变。'
        : '上下镜像已完成，网格外坐标和图例保持不变。',
    );
    const download = required(chartWorkspace, '[data-chart-download]', HTMLButtonElement);
    download.hidden = false;
    download.disabled = false;
  } catch (error) {
    if (!controller.signal.aborted && !isAbortError(error)) {
      gridController.setMessage(
        error instanceof MirrorMasterApiError ? error.message : '智能镜像失败，请重新识别后再试。',
      );
    }
  } finally {
    button.disabled = gridContract === null;
    button.textContent = '智能镜像图纸';
    if (chartMirrorController === controller) {
      chartMirrorController = null;
    }
  }
}

function setupReplacementActions(): void {
  headerReplace.addEventListener('click', handleReplaceImageClick);
}

function handleReplaceImageClick(): void {
  confirmReplaceImage();
}

function setupConfirmationSurface(): void {
  confirmationSurface.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest('[data-confirmation-cancel]')) {
      closeConfirmation(true);
      return;
    }
    if (target.closest('[data-confirmation-continue]')) {
      const request = confirmationRequest;
      if (!request || confirmationSaving) {
        return;
      }
      closeConfirmation(false);
      request.onContinue();
      return;
    }
    if (target.closest('[data-confirmation-save]')) {
      void saveBeforeConfirmation();
    }
  });
  confirmationSurface.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      const focusable = [
        ...confirmationSurface.querySelectorAll<HTMLButtonElement>(
          'button:not(:disabled):not([tabindex="-1"])',
        ),
      ].filter((button) => !button.hidden);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key !== 'Escape' || confirmationSaving) {
      return;
    }
    event.preventDefault();
    closeConfirmation(true);
  });
}

function openConfirmation(request: ConfirmationRequest): void {
  if (confirmationRequest || confirmationSaving) {
    return;
  }
  confirmationRequest = request;
  confirmationReturnFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  confirmationTitle.textContent = request.title;
  confirmationDescription.textContent = request.description;
  confirmationStatus.textContent = '';
  confirmationSurface.hidden = false;
  shell.dataset.confirmationOpen = 'true';
  appHeader.inert = true;
  mainWorkspace.inert = true;
  confirmationContinue.focus();
}

function closeConfirmation(restoreFocus: boolean): void {
  if (confirmationSaving) {
    return;
  }
  confirmationSurface.hidden = true;
  delete shell.dataset.confirmationOpen;
  appHeader.inert = false;
  mainWorkspace.inert = false;
  confirmationRequest = null;
  confirmationStatus.textContent = '';
  confirmationSave.disabled = false;
  confirmationContinue.disabled = false;
  if (restoreFocus) {
    confirmationReturnFocus?.focus();
  }
  confirmationReturnFocus = null;
}

async function saveBeforeConfirmation(): Promise<void> {
  const project = currentProject;
  const request = confirmationRequest;
  if (!project || !request || confirmationSaving) {
    return;
  }
  confirmationSaving = true;
  confirmationSave.disabled = true;
  confirmationContinue.disabled = true;
  confirmationStatus.textContent = '正在保存项目…';
  const result = await exportCoordinator.start({
    project,
    task: 'saveProject',
    pngTemplate: 'annotated',
  });
  confirmationSaving = false;
  if (result.outcome === 'downloaded') {
    confirmationStatus.textContent = '项目已保存，正在继续…';
    closeConfirmation(false);
    request.onContinue();
    return;
  }
  confirmationSave.disabled = false;
  confirmationContinue.disabled = false;
  confirmationStatus.textContent =
    result.outcome === 'failed' ? result.message : '保存已取消，请重试或选择其他操作。';
  confirmationSave.focus();
}

function confirmReplaceImage(replacementConfirmed = false): void {
  if (
    !replacementConfirmed &&
    currentProject &&
    (sourceGenerationRevision === null || currentProject.revision !== sourceGenerationRevision)
  ) {
    openConfirmation({
      title: '更换图片会结束当前编辑',
      description: '当前图纸、逐格修改和撤销记录都会从工作区移除。你可以先保存项目，之后再回来继续。',
      onContinue() {
        confirmReplaceImage(true);
      },
    });
    return;
  }
  resetToUpload();
}

function resetToUpload(): void {
  loadRevision += 1;
  generationController?.abort();
  exportCoordinator.invalidate();
  chartMirrorController?.abort();
  recommendationRequests.cancel();
  availableColorMobilePanelController?.close();
  canvasController?.destroy();
  canvasController = null;
  history = null;
  currentProject = null;
  sourceGenerationRevision = null;
  selectedImage = null;
  currentSelection = null;
  currentSelectionViewportRect = null;
  selectionTransferMode = null;
  recentColorIds = Object.freeze([]);
  gridContract = null;
  applyUploadPrepareFlow(resetFlowForReplacement(currentUploadPrepareFlow()));
  mode = customerTask === 'mirrorExistingChart' ? 'existingChart' : 'photo';
  samplingSelection = createAutomaticSampling('photo', appCapabilities.sampling);
  syncSamplingControls(prepareWorkspace, samplingSelection);
  clearChartResult();
  objectUrls.revokeAll();
  fileInput.value = '';
  projectFileInput.value = '';
  projectFileStatus.textContent = '';
  setFileStatus('', 'ready');
  showStage('upload');
  announce('已返回图片选择。');
}

function showStage(nextStage: AppStage): void {
  if (stage === 'editor' && nextStage !== 'editor') {
    editorDesktopSeriesController?.close();
    editorMobileSeriesController?.cancel();
    firstUseHintSession.dismiss();
    syncFirstUseHint();
    setCanvasJumpOpen(false);
    resetExportSurface();
  }
  stage = nextStage;
  shell.dataset.stage = nextStage;
  uploadWorkspace.hidden = nextStage !== 'upload';
  prepareWorkspace.hidden = nextStage !== 'prepare';
  patternWorkspace.hidden = nextStage !== 'editor';
  chartWorkspace.hidden = nextStage !== 'chart';
  headerReplace.hidden = nextStage === 'upload';
  headerContext.textContent =
    nextStage === 'upload'
      ? '创建拼豆图纸'
      : nextStage === 'prepare'
        ? '准备图片'
        : nextStage === 'editor'
          ? '编辑拼豆图纸'
          : '镜像已有图纸';
  sessionStatus.textContent = nextStage === 'upload' ? '仅保存在本次会话' : '本次会话';
  required(app, '#main-workspace', HTMLElement).focus({ preventScroll: true });
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
  const sourceUsesDesktopSurface = workspaceLayoutMode === 'desktop';
  const focusWasInSourceSurface =
    activeElement !== null &&
    (sourceUsesDesktopSurface
      ? workspaceInspector.contains(activeElement) || workspaceToolRail.contains(activeElement)
      : workspaceSheet.contains(activeElement));
  const sourceSeriesController = sourceUsesDesktopSurface
    ? editorDesktopSeriesController
    : editorMobileSeriesController;
  const sourceSeriesWasOpen = sourceSeriesController?.isOpen() ?? false;
  const sourceFocusRoot = sourceUsesDesktopSurface ? patternWorkspace : workspaceSheet;
  const sourceSeriesTrigger = sourceFocusRoot.querySelector<HTMLElement>(
    '[data-color-series-filter]',
  );
  const focusSnapshot = crossingDesktopBoundary
    ? captureWorkspaceSurfaceFocus(
        sourceFocusRoot,
        sourceSeriesWasOpen ? sourceSeriesTrigger : focusWasInSourceSurface ? activeElement : null,
        activePanel,
      )
    : null;

  if (crossingDesktopBoundary) {
    editorDesktopSeriesController?.close();
    editorMobileSeriesController?.cancel();
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
}

function setSheetState(nextState: SheetState): void {
  const snapPoints = sheetSnapPoints();
  applySheetSnapPointVariables(snapPoints);
  sheetMotionState = createSheetMotionState(nextState, snapPoints);
  applySheetState(nextState);
}

function applySheetState(nextState: SheetState): void {
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
  recalculateSheetMotion();
  scheduleSelectionContextPosition();
}

function applySheetSnapPointVariables(snapPoints: SheetSnapPoints): void {
  workspaceSheet.style.setProperty('--sheet-peek-height', `${String(snapPoints.peek)}px`);
  workspaceSheet.style.setProperty('--sheet-half-height', `${String(snapPoints.half)}px`);
  workspaceSheet.style.setProperty('--sheet-full-height', `${String(snapPoints.full)}px`);
}

function updateSamplingDefault(): void {
  if (mode === 'existingChart') return;
  samplingSelection = recommendSampling(samplingSelection, mode, appCapabilities.sampling);
  syncSamplingControls(prepareWorkspace, samplingSelection);
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
  if (!selectedImage) {
    return { width: 1, height: 1 };
  }
  return rotation === 90 || rotation === 270
    ? { width: selectedImage.height, height: selectedImage.width }
    : { width: selectedImage.width, height: selectedImage.height };
}

function resizeCrop(
  initial: CropPercent,
  handle: 'move' | 'nw' | 'ne' | 'sw' | 'se',
  deltaX: number,
  deltaY: number,
): CropPercent {
  const minimum = 8;
  if (handle === 'move') {
    return {
      ...initial,
      x: clamp(initial.x + deltaX, 0, 100 - initial.width),
      y: clamp(initial.y + deltaY, 0, 100 - initial.height),
    };
  }
  let left = initial.x;
  let top = initial.y;
  let right = initial.x + initial.width;
  let bottom = initial.y + initial.height;
  if (handle.includes('w')) {
    left = clamp(initial.x + deltaX, 0, right - minimum);
  }
  if (handle.includes('e')) {
    right = clamp(initial.x + initial.width + deltaX, left + minimum, 100);
  }
  if (handle.includes('n')) {
    top = clamp(initial.y + deltaY, 0, bottom - minimum);
  }
  if (handle.includes('s')) {
    bottom = clamp(initial.y + initial.height + deltaY, top + minimum, 100);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function selectedBoardSize(): { readonly rows: number; readonly columns: number } {
  const presetId = selectValue(prepareWorkspace, '[data-board-preset]', 'standardSquare');
  if (presetId === 'custom') {
    return Object.freeze({
      rows: numberValue(
        prepareWorkspace,
        '[data-custom-board-rows]',
        appCapabilities.boards.custom.minimumRows,
      ),
      columns: numberValue(
        prepareWorkspace,
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

function sheetSnapPoints(): SheetSnapPoints {
  const viewportHeight = Math.max(240, patternWorkspace.clientHeight || window.innerHeight || 240);
  const visualViewport = window.visualViewport;
  const rawKeyboardHeight = visualViewport
    ? Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop)
    : 0;
  const keyboardHeight = Math.min(viewportHeight - 160, rawKeyboardHeight);
  const header = required(workspaceSheet, '[data-sheet-drag-region]', HTMLElement);
  const primary = required(workspaceSheet, '.sheet-primary', HTMLElement);
  const peekContentHeight = Math.max(112, header.scrollHeight + primary.scrollHeight);
  return calculateSheetSnapPoints({
    viewportHeight,
    peekContentHeight,
    keyboardHeight,
    topGap: 8,
    halfRatio: 0.48,
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

function boardSelectOptions(): readonly UiSelectOption[] {
  return Object.freeze([
    Object.freeze({ id: 'standardSquare', label: '29 × 29 标准方板' }),
    Object.freeze({ id: 'smallSquare', label: '14 × 14 小方板' }),
    Object.freeze({ id: 'custom', label: '自定义拼板' }),
  ]);
}

function paletteSelectOptions(): readonly UiSelectOption[] {
  return Object.freeze(
    PALETTES.map((palette) =>
      Object.freeze({
        id: palette.id,
        label: `${palette.label} · ${String(palette.colorIds.length)} 色`,
      }),
    ),
  );
}

function ditheringSelectOptions(): readonly UiSelectOption[] {
  return Object.freeze([
    Object.freeze({ id: 'none', label: '干净色块' }),
    Object.freeze({ id: 'floydSteinberg', label: '细腻过渡' }),
  ]);
}

function selectValue(root: ParentNode, selector: string, fallback: string): string {
  return root.querySelector<HTMLButtonElement>(selector)?.dataset.value ?? fallback;
}

function setSelectTriggerValue(trigger: HTMLButtonElement, value: string, label: string): void {
  trigger.dataset.value = value;
  const labelElement = trigger.querySelector<HTMLElement>('[data-select-label]');
  if (labelElement && labelElement.textContent !== label) {
    labelElement.textContent = label;
  }
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

function isCustomerTask(value: string): value is CustomerTask {
  return value === 'newPattern' || value === 'mirrorExistingChart';
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
  syncUploadPrepareControls(app, flow);
}

function isCropArrowKey(value: string): value is CropArrowKey {
  return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(value);
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
  generationController?.abort();
  exportCoordinator.destroy();
  chartMirrorController?.abort();
  recommendationRequests.cancel();
  canvasController?.destroy();
  preparePresetControls?.destroy();
  availableColorGridRenderer?.destroy();
  availableColorMobilePanelController?.destroy();
  boardSelectController?.destroy();
  paletteSelectController?.destroy();
  availableSeriesSelectController?.destroy();
  ditheringSelectController?.destroy();
  for (const controller of editorSeriesSelectControllers) controller.destroy();
  responsiveWorkspaceMount.destroy();
  for (const controller of workspacePanelControllers) controller.destroy();
  clearChartResult();
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
