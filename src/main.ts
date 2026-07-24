import './generated/phosphor-icons.css';
import './design/generated/tokens.css';
import './styles/base.css';
import './styles/page.css';

import { renderApp } from './app';
import { brandConfig } from './brand/brand.config';
import {
  captureProjectRevision,
  exportProjectCsv,
  exportProjectJson,
  safeDownloadBaseName,
} from './domain/export';
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
  type AppPngTemplate,
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
import { decodeImageFromObjectUrl } from './features/local-image-input/imageDecoder';
import {
  formatFileSize,
  validateSingleImageFile,
} from './features/local-image-input/fileValidation';
import { createObjectUrlStore } from './features/local-image-input/objectUrlStore';
import {
  dragSheetHeight,
  snapSheetHeight,
  type SheetSnapPoints,
  type SheetState,
} from './features/mobile-sheet/sheetMath';
import {
  filterPaletteColors,
  groupPaletteColorsBySeries,
  pushRecentColor,
} from './features/palette-controls/paletteControls';
import {
  mountPatternCanvas,
  type CellSelection,
  type EditorTool,
  type PatternCanvasController,
} from './features/pattern-editor/canvasEditor';
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

type AppStage = 'upload' | 'prepare' | 'editor' | 'chart';
type InspectorPanel = 'tools' | 'palette' | 'materials' | 'settings';

interface SelectedImage {
  readonly file: File;
  readonly objectUrl: string;
  readonly width: number;
  readonly height: number;
}

interface CropPercent {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
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

const objectUrls = createObjectUrlStore();
let appCapabilities: AppCapabilities = FALLBACK_APP_CAPABILITIES;
let stage: AppStage = 'upload';
let mode: ProjectMode = 'photo';
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
let currentSelection: CellSelection | null = null;
let selectedColorId = 'mard:A1';
let availableColorIds = new Set(getPalette('mard').colorIds);
let activeTool: EditorTool = 'paint';
let paletteQuery = '';
let paletteScope: 'all' | 'used' | 'recent' = 'all';
let paletteSeries = '';
let prepareColorQuery = '';
let prepareColorSeries = '';
let recentColorIds: readonly string[] = Object.freeze([]);
let renderedInspectorPanel: InspectorPanel | null = null;
let generationController: AbortController | null = null;
let exportController: AbortController | null = null;
let chartMirrorController: AbortController | null = null;
let chartResultUrl: string | null = null;
let chartAxis: 'horizontal' | 'vertical' = 'horizontal';
let loadRevision = 0;

setupUpload();
setupPrepare();
setupPatternWorkspace();
const gridController: GridEditorController = setupChartWorkspace();
setupReplacementActions();
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

  const warning = paletteMismatch
    ? '服务色板版本与应用不一致，已使用内置兼容配置。'
    : resolution.message;
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

  const modeInputs = [...app.querySelectorAll<HTMLInputElement>('input[name="input-mode"]')];
  for (const input of modeInputs) {
    input.disabled = !appCapabilities.modes.includes(input.value as ProjectMode);
  }
  const currentModeInput = modeInputs.find((input) => input.value === mode);
  if (!currentModeInput || currentModeInput.disabled) {
    const fallbackMode = modeInputs.find((input) => !input.disabled);
    if (fallbackMode && isProjectMode(fallbackMode.value)) {
      fallbackMode.checked = true;
      mode = fallbackMode.value;
    }
  }

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

  const boardSelect = required(prepareWorkspace, '[data-board-preset]', HTMLSelectElement);
  for (const option of [...boardSelect.options]) {
    option.disabled =
      option.value !== 'custom' &&
      !Object.hasOwn(appCapabilities.boards.fixedPresets, option.value);
  }
  if (boardSelect.selectedOptions[0]?.disabled) {
    const fallback = [...boardSelect.options].find((option) => !option.disabled);
    if (fallback) {
      boardSelect.value = fallback.value;
    }
  }

  for (const input of prepareWorkspace.querySelectorAll<HTMLInputElement>(
    'input[name="sampling"]',
  )) {
    input.disabled = !appCapabilities.sampling.includes(input.value as 'average' | 'nearest');
  }
  for (const option of [
    ...required(prepareWorkspace, '[data-dithering]', HTMLSelectElement).options,
  ]) {
    option.disabled = !appCapabilities.dithering.includes(
      option.value as 'none' | 'floydSteinberg',
    );
  }
  for (const button of patternWorkspace.querySelectorAll<HTMLButtonElement>(
    '[data-export-format]',
  )) {
    const format =
      button.dataset.exportFormat === 'json' ? 'projectJson' : button.dataset.exportFormat;
    button.disabled = !appCapabilities.exports.includes(
      format as 'png' | 'pdf' | 'csv' | 'projectJson',
    );
  }
  for (const input of patternWorkspace.querySelectorAll<HTMLInputElement>(
    '[data-export-template]',
  )) {
    input.disabled = !appCapabilities.pngTemplates.includes(input.value as AppPngTemplate);
    if (input.checked && input.disabled) {
      input.checked = false;
    }
  }
  const supportedTemplate = appCapabilities.pngTemplates.includes('annotated')
    ? 'annotated'
    : (appCapabilities.pngTemplates[0] ?? 'annotated');
  const checkedTemplate = patternWorkspace.querySelector<HTMLInputElement>(
    'input[name="export-template"]:checked',
  );
  if (!checkedTemplate) {
    const fallbackTemplate = patternWorkspace.querySelector<HTMLInputElement>(
      `[data-export-template="${supportedTemplate}"]`,
    );
    if (fallbackTemplate) {
      fallbackTemplate.checked = true;
    }
  }
  const includeGrid = patternWorkspace.querySelector<HTMLInputElement>('[data-export-grid]');
  if (includeGrid) {
    includeGrid.disabled = appCapabilities.pngTemplates.length < 2;
    includeGrid.checked =
      patternWorkspace.querySelector<HTMLInputElement>('input[name="export-template"]:checked')
        ?.value === 'annotated';
  }
  for (const button of chartWorkspace.querySelectorAll<HTMLButtonElement>('[data-chart-axis]')) {
    button.disabled = !appCapabilities.gridMirrorAxes.includes(
      button.dataset.chartAxis as 'horizontal' | 'vertical',
    );
  }
}

function setupUpload(): void {
  for (const input of app.querySelectorAll<HTMLInputElement>('input[name="input-mode"]')) {
    input.addEventListener('change', () => {
      if (input.checked && isProjectMode(input.value)) {
        mode = input.value;
        updateSamplingDefault();
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
  exportController?.abort();
  chartMirrorController?.abort();
  setFileStatus(`正在读取 ${result.file.name}…`, 'loading');
  objectUrls.revokeAll();
  const objectUrl = objectUrls.create(result.file);

  try {
    const dimensions = await decodeImageFromObjectUrl(objectUrl);
    if (requestRevision !== loadRevision) {
      objectUrls.revoke(objectUrl);
      return;
    }
    if (dimensions.width * dimensions.height > appCapabilities.upload.maximumDecodedPixels) {
      objectUrls.revoke(objectUrl);
      selectedImage = null;
      setFileStatus(
        `图片解码后共有 ${String(dimensions.width * dimensions.height)} 像素，超过 ${String(
          appCapabilities.upload.maximumDecodedPixels,
        )} 像素上限。请缩小图片后重试。`,
        'error',
      );
      return;
    }
    selectedImage = {
      file: result.file,
      objectUrl,
      width: dimensions.width,
      height: dimensions.height,
    };
    rotation = 0;
    cropPercent = { x: 0, y: 0, width: 100, height: 100 };
    currentProject = null;
    history = null;
    canvasController?.destroy();
    canvasController = null;
    projectFileStatus.textContent = '';
    setFileStatus('图片已载入。', 'ready');
    if (mode === 'existingChart') {
      openChartWorkspace();
    } else {
      openPrepareWorkspace();
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

async function openProjectFile(file: File): Promise<void> {
  const requestRevision = ++loadRevision;
  generationController?.abort();
  exportController?.abort();
  chartMirrorController?.abort();
  if (file.size > MAX_PROJECT_JSON_BYTES) {
    projectFileStatus.textContent = `项目文件超过 ${formatFileSize(
      MAX_PROJECT_JSON_BYTES,
    )} 上限，无法安全打开。`;
    return;
  }

  projectFileStatus.textContent = `正在打开 ${file.name}…`;
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
    projectFileStatus.textContent = `已打开 ${file.name}，矩阵版本 ${String(project.revision)}。`;
    sessionStatus.textContent = `已恢复矩阵版本 ${String(project.revision)}`;
    announce(`项目已恢复，可以继续编辑。当前矩阵版本 ${String(project.revision)}。`);
  } catch (error) {
    if (requestRevision !== loadRevision) {
      return;
    }
    const message =
      error instanceof ProjectImportError
        ? error.message
        : '无法读取项目文件，请确认文件没有损坏。';
    projectFileStatus.textContent = message;
  }
}

function setupPrepare(): void {
  const prepareReplace = required(prepareWorkspace, '[data-prepare-replace]', HTMLButtonElement);
  const rotateLeft = required(prepareWorkspace, '[data-rotate-left]', HTMLButtonElement);
  const rotateRight = required(prepareWorkspace, '[data-rotate-right]', HTMLButtonElement);
  const columnsInput = required(prepareWorkspace, '[data-columns]', HTMLInputElement);
  const rowsInput = required(prepareWorkspace, '[data-rows]', HTMLInputElement);
  const aspectButton = required(prepareWorkspace, '[data-aspect-lock]', HTMLButtonElement);
  const boardPreset = required(prepareWorkspace, '[data-board-preset]', HTMLSelectElement);
  const paletteSelect = required(prepareWorkspace, '[data-palette-id]', HTMLSelectElement);
  const maximumColors = required(prepareWorkspace, '[data-maximum-colors]', HTMLInputElement);
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
    HTMLSelectElement,
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

  prepareReplace.addEventListener('click', confirmReplaceImage);
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
    }
    updatePrepareSummaries();
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
  boardPreset.addEventListener('change', () => {
    updateCustomBoardVisibility();
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
  paletteSelect.addEventListener('change', () => {
    const palette = getPalette(paletteSelect.value);
    availableColorIds = new Set(palette.colorIds);
    maximumColors.max = String(palette.colorIds.length);
    maximumColors.value = String(Math.min(Number(maximumColors.value), palette.colorIds.length));
    selectedColorId = palette.colorIds[0] ?? selectedColorId;
    prepareColorSeries = '';
    initializePrepareColorSeries();
    renderAvailableColorFilter();
  });
  availableColorSearch.addEventListener('input', () => {
    prepareColorQuery = availableColorSearch.value;
    renderAvailableColorFilter();
  });
  availableColorSeries.addEventListener('change', () => {
    prepareColorSeries = availableColorSeries.value;
    renderAvailableColorFilter();
  });
  selectAllColors.addEventListener('click', () => {
    availableColorIds = new Set(getPalette(paletteSelect.value).colorIds);
    maximumColors.max = String(availableColorIds.size);
    maximumColors.value = String(
      Math.max(1, Math.min(Number(maximumColors.value), availableColorIds.size)),
    );
    renderAvailableColorFilter();
    announce('已选中当前色板的全部颜色。');
  });
  clearAllColors.addEventListener('click', () => {
    availableColorIds = new Set();
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
    maximumColors.value = String(
      Math.max(1, Math.min(Number(maximumColors.value), availableColorIds.size)),
    );
    updateAvailableColorSummary();
  });
  generateButton.addEventListener('click', () => {
    void startPatternGeneration();
  });
  returnEditorButton.addEventListener('click', () => {
    if (currentProject && history) {
      openPatternEditor(currentProject);
      announce(`已返回矩阵版本 r${String(currentProject.revision)}。`);
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
      renderCropSelection();
      updatePrepareSummaries();
    });
  }

  updateCustomBoardVisibility();
  initializePrepareColorSeries();

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
}

function openPrepareWorkspace(preserveProjectSettings = false): void {
  if (!selectedImage) {
    return;
  }
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
    columnsInput.value = String(project.grid.columns);
    rowsInput.value = String(project.grid.rows);
    aspectLocked = project.grid.aspectLocked;
    const aspectButton = required(prepareWorkspace, '[data-aspect-lock]', HTMLButtonElement);
    aspectButton.classList.toggle('is-active', aspectLocked);
    aspectButton.setAttribute('aria-pressed', String(aspectLocked));
    required(prepareWorkspace, '[data-board-preset]', HTMLSelectElement).value =
      project.grid.boardPresetId;
    required(prepareWorkspace, '[data-custom-board-rows]', HTMLInputElement).value = String(
      project.grid.boardRows,
    );
    required(prepareWorkspace, '[data-custom-board-columns]', HTMLInputElement).value = String(
      project.grid.boardColumns,
    );
    required(prepareWorkspace, '[data-palette-id]', HTMLSelectElement).value =
      project.palette.paletteId;
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
    required(prepareWorkspace, '[data-dithering]', HTMLSelectElement).value =
      project.generation.dithering;
    required(prepareWorkspace, '[data-alpha-threshold]', HTMLInputElement).value = String(
      project.generation.alphaEmptyThreshold,
    );
    const samplingInput = prepareWorkspace.querySelector<HTMLInputElement>(
      `input[name="sampling"][value="${project.generation.sampling}"]`,
    );
    if (samplingInput) {
      samplingInput.checked = true;
    }
  } else {
    columnsInput.value =
      mode === 'pixelArt'
        ? String(Math.min(128, selectedImage.width, appCapabilities.grid.maximumColumns))
        : String(Math.min(48, appCapabilities.grid.maximumColumns));
    rowsInput.value = String(
      Math.max(
        appCapabilities.grid.minimumRows,
        Math.min(
          appCapabilities.grid.maximumRows,
          Math.round(Number(columnsInput.value) * (selectedImage.height / selectedImage.width)),
        ),
      ),
    );
    updateSamplingDefault();
  }
  const palette = getPalette(
    required(prepareWorkspace, '[data-palette-id]', HTMLSelectElement).value,
  );
  if (![...availableColorIds].every((colorId) => palette.colorIds.includes(colorId))) {
    availableColorIds = new Set(palette.colorIds);
  }
  const customFields = required(
    prepareWorkspace,
    '[data-custom-board-fields]',
    HTMLFieldSetElement,
  );
  const customBoard =
    required(prepareWorkspace, '[data-board-preset]', HTMLSelectElement).value === 'custom';
  customFields.hidden = !customBoard;
  customFields.disabled = !customBoard;
  required(prepareWorkspace, '[data-generate-label]', HTMLElement).textContent = currentProject
    ? '重新生成图纸'
    : '生成图纸';
  required(prepareWorkspace, '[data-return-editor]', HTMLButtonElement).hidden =
    currentProject === null;
  required(prepareWorkspace, '[data-generate-status]', HTMLElement).textContent = currentProject
    ? `当前保留矩阵版本 ${String(currentProject.revision)}；重新生成前会再次确认。`
    : '';
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
  const image = new Image();
  image.onload = () => {
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
  };
  image.src = selectedImage.objectUrl;
}

function renderCropSelection(): void {
  const selection = required(prepareWorkspace, '[data-crop-selection]', HTMLElement);
  selection.style.left = `${String(cropPercent.x)}%`;
  selection.style.top = `${String(cropPercent.y)}%`;
  selection.style.width = `${String(cropPercent.width)}%`;
  selection.style.height = `${String(cropPercent.height)}%`;
  required(prepareWorkspace, '[data-crop-x]', HTMLInputElement).value = cropPercent.x.toFixed(1);
  required(prepareWorkspace, '[data-crop-y]', HTMLInputElement).value = cropPercent.y.toFixed(1);
  required(prepareWorkspace, '[data-crop-width]', HTMLInputElement).value =
    cropPercent.width.toFixed(1);
  required(prepareWorkspace, '[data-crop-height]', HTMLInputElement).value =
    cropPercent.height.toFixed(1);
}

function updatePrepareSummaries(): void {
  if (!selectedImage) {
    return;
  }
  const dimensions = rotatedDimensions();
  const cropWidth = Math.max(1, Math.round(dimensions.width * (cropPercent.width / 100)));
  const cropHeight = Math.max(1, Math.round(dimensions.height * (cropPercent.height / 100)));
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
}

function renderAvailableColorFilter(): void {
  const paletteId = required(prepareWorkspace, '[data-palette-id]', HTMLSelectElement).value;
  const palette = getPalette(paletteId);
  const grid = required(prepareWorkspace, '[data-available-color-grid]', HTMLElement);
  const fragment = document.createDocumentFragment();
  const paletteColors = PALETTE_COLORS.filter((color) => palette.colorIds.includes(color.id));
  const filteredColors = filterPaletteColors(paletteColors, {
    availableColorIds: palette.colorIds,
    query: prepareColorQuery,
  }).filter((color) => prepareColorSeries === '' || color.series === prepareColorSeries);

  for (const group of groupPaletteColorsBySeries(filteredColors)) {
    const section = document.createElement('section');
    section.className = 'available-color-series-group';
    section.setAttribute('aria-label', `${group.series} 系列`);
    const heading = document.createElement('h3');
    heading.textContent = `${group.series} 系列`;
    const choices = document.createElement('div');
    for (const color of group.colors) {
      const label = document.createElement('label');
      label.className = 'available-color-choice';
      label.title = `${color.paletteId.toUpperCase()} ${color.code}${
        color.name ? ` · ${color.name}` : ''
      }`;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = availableColorIds.has(color.id);
      input.dataset.availableColorId = color.id;
      input.setAttribute('aria-label', label.title);
      const swatch = document.createElement('span');
      swatch.className = 'available-color-swatch';
      swatch.style.setProperty('--swatch', color.displayHex);
      swatch.setAttribute('aria-hidden', 'true');
      const code = document.createElement('small');
      code.textContent = color.code;
      label.append(input, swatch, code);
      choices.append(label);
    }
    section.append(heading, choices);
    fragment.append(section);
  }

  grid.replaceChildren(fragment);
  grid.setAttribute(
    'aria-label',
    `选择手边有的拼豆颜色，当前显示 ${String(filteredColors.length)} 色`,
  );
  updateAvailableColorSummary();
}

function initializePrepareColorSeries(): void {
  const paletteId = required(prepareWorkspace, '[data-palette-id]', HTMLSelectElement).value;
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
  const select = required(prepareWorkspace, '[data-available-color-series]', HTMLSelectElement);
  const fragment = document.createDocumentFragment();
  const all = document.createElement('option');
  all.value = '';
  all.textContent = '全部系列';
  fragment.append(all);
  for (const value of series) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = `${value} 系列`;
    fragment.append(option);
  }
  select.replaceChildren(fragment);
  select.value = prepareColorSeries;
  required(prepareWorkspace, '[data-available-color-search]', HTMLInputElement).value =
    prepareColorQuery;
}

function updateAvailableColorSummary(): void {
  required(prepareWorkspace, '[data-available-color-summary]', HTMLElement).textContent =
    availableColorIds.size === 0 ? '尚未选择颜色' : `已选择 ${String(availableColorIds.size)} 色`;
}

async function startPatternGeneration(): Promise<void> {
  const image = selectedImage;
  if (!image) {
    return;
  }
  if (availableColorIds.size === 0) {
    required(prepareWorkspace, '[data-generate-status]', HTMLElement).textContent =
      '请至少选择一种手边有的颜色。';
    announce('生成前请至少选择一种颜色。');
    return;
  }
  if (
    currentProject &&
    sourceGenerationRevision !== null &&
    currentProject.revision !== sourceGenerationRevision &&
    !window.confirm(
      `重新生成会替换当前矩阵版本 ${String(
        currentProject.revision,
      )} 的全部编辑。请先导出项目 JSON；仍要继续吗？`,
    )
  ) {
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
    generateButton.disabled = false;
    required(generateButton, '[data-generate-label]', HTMLElement).textContent = currentProject
      ? '重新生成图纸'
      : '生成图纸';
  }
}

function buildGenerationSettings(): PatternGenerationSettings {
  const dimensions = rotatedDimensions();
  const paletteId = required(prepareWorkspace, '[data-palette-id]', HTMLSelectElement).value as
    'default' | 'mard';
  const maximumValue = numberValue(prepareWorkspace, '[data-maximum-colors]', 24);
  const sampling =
    prepareWorkspace.querySelector<HTMLInputElement>('input[name="sampling"]:checked')?.value ===
    'nearest'
      ? 'nearest'
      : 'average';
  const dithering =
    required(prepareWorkspace, '[data-dithering]', HTMLSelectElement).value === 'floydSteinberg'
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
    boardPresetId: required(prepareWorkspace, '[data-board-preset]', HTMLSelectElement).value as
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
  const sheet = required(patternWorkspace, '[data-workspace-sheet]', HTMLElement);
  const sheetHandle = required(patternWorkspace, '[data-sheet-handle]', HTMLButtonElement);
  const exportPopover = required(patternWorkspace, '[data-export-popover]', HTMLElement);
  let exportReturnFocus: HTMLButtonElement | null = null;
  let suppressSheetClick = false;
  let sheetGesture: {
    readonly pointerId: number;
    readonly startY: number;
    readonly startHeight: number;
    currentHeight: number;
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
      canvasController?.moveSelection(0, 1);
      return;
    }
    if (selectionAction?.dataset.selectionAction === 'copy') {
      canvasController?.copySelection(0, 1);
      return;
    }
    if (
      selectionAction?.dataset.selectionAction === 'clear' ||
      target.closest('[data-clear-selection]')
    ) {
      canvasController?.clearSelection();
      return;
    }
    if (target.closest('[data-return-prepare]')) {
      if (selectedImage) {
        openPrepareWorkspace(true);
      } else {
        announce('项目 JSON 不包含源图片，无法重新生成；你仍可继续编辑和导出。');
      }
      return;
    }
    if (target.closest('[data-close-export]')) {
      exportPopover.hidden = true;
      exportReturnFocus?.focus();
      return;
    }
    const exportButton = target.closest<HTMLButtonElement>('[data-export-format]');
    if (exportButton?.dataset.exportFormat) {
      void downloadExport(exportButton.dataset.exportFormat);
      return;
    }
  });
  patternWorkspace.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && !exportPopover.hidden) {
      const focusable = [
        ...exportPopover.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first && last) {
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      return;
    }
    if (event.key === 'Escape' && !exportPopover.hidden) {
      event.preventDefault();
      exportPopover.hidden = true;
      exportReturnFocus?.focus();
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
    if (target instanceof HTMLSelectElement && target.matches('[data-color-series-filter]')) {
      paletteSeries = target.value;
      syncPaletteControls(target);
      applyPaletteFilters();
      return;
    }
    if (
      target instanceof HTMLInputElement &&
      (target.matches('[data-export-template]') || target.matches('[data-export-grid]'))
    ) {
      syncExportTemplateControls(target);
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
  });
  for (const selector of ['[data-open-export]', '[data-mobile-export]']) {
    const opener = required(patternWorkspace, selector, HTMLButtonElement);
    opener.addEventListener('click', () => {
      exportReturnFocus = opener;
      exportPopover.hidden = false;
      const firstFormat = exportPopover.querySelector<HTMLButtonElement>('[data-export-format]');
      firstFormat?.focus();
    });
  }

  sheetHandle.addEventListener('click', () => {
    if (suppressSheetClick) {
      suppressSheetClick = false;
      return;
    }
    setSheetState(sheetState === 'peek' ? 'half' : sheetState === 'half' ? 'full' : 'peek');
  });
  sheetHandle.addEventListener('pointerdown', (event) => {
    sheetGesture = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: sheet.getBoundingClientRect().height,
      currentHeight: sheet.getBoundingClientRect().height,
      moved: false,
    };
    sheet.dataset.sheetDragging = 'true';
    sheetHandle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  sheetHandle.addEventListener('pointermove', (event) => {
    if (!sheetGesture || sheetGesture.pointerId !== event.pointerId) {
      return;
    }
    const height = dragSheetHeight({
      startHeight: sheetGesture.startHeight,
      startPointerY: sheetGesture.startY,
      pointerY: event.clientY,
      snapPoints: sheetSnapPoints(),
    });
    sheetGesture.currentHeight = height;
    sheetGesture.moved ||= Math.abs(event.clientY - sheetGesture.startY) > 4;
    sheet.style.setProperty('--sheet-height', `${String(height)}px`);
    event.preventDefault();
  });
  sheetHandle.addEventListener('pointerup', (event) => {
    if (!sheetGesture || sheetGesture.pointerId !== event.pointerId) {
      return;
    }
    const result = snapSheetHeight(sheetGesture.currentHeight, sheetSnapPoints());
    suppressSheetClick = sheetGesture.moved;
    sheetGesture = null;
    sheet.style.removeProperty('--sheet-height');
    delete sheet.dataset.sheetDragging;
    setSheetState(result.state);
    if (sheetHandle.hasPointerCapture(event.pointerId)) {
      sheetHandle.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
  });
  sheetHandle.addEventListener('pointercancel', () => {
    sheetGesture = null;
    sheet.style.removeProperty('--sheet-height');
    delete sheet.dataset.sheetDragging;
    setSheetState(sheetState);
  });
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
      abortActiveExport('图纸已修改，之前的导出已取消。');
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
  });
  canvasController.setTool(activeTool);
  canvasController.setColor(selectedColorId);
  canvasController.resetPerformanceMetrics();
  activePanel = 'tools';
  renderedInspectorPanel = null;
  currentSelection = null;
  sheetState = 'peek';
  setSheetState('peek');
  required(patternWorkspace, '[data-export-popover]', HTMLElement).hidden = true;
  for (const button of patternWorkspace.querySelectorAll<HTMLButtonElement>(
    '[data-return-prepare]',
  )) {
    button.disabled = selectedImage === null;
    button.title = selectedImage
      ? '保留当前矩阵并返回生成设置'
      : '项目 JSON 不包含源图片，无法重新生成';
  }
  updateHistoryButtons();
  updateSelectionActions();
  renderInspector(true);
  schedulePerformanceCapture();
  sessionStatus.textContent = '图纸已生成';
}

function setActiveTool(tool: EditorTool): void {
  activeTool = tool;
  canvasController?.setTool(tool);
  for (const button of patternWorkspace.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
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
  abortActiveExport('图纸已修改，之前的导出已取消。');
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
  abortActiveExport('图纸版本已变化，之前的导出已取消。');
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
  abortActiveExport('图纸版本已变化，之前的导出已取消。');
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
  for (const group of patternWorkspace.querySelectorAll<HTMLElement>('[data-selection-actions]')) {
    group.dataset.selectionActive = String(active);
  }
  for (const button of patternWorkspace.querySelectorAll<HTMLButtonElement>(
    '[data-selection-action]',
  )) {
    button.disabled = !active;
  }
  for (const button of patternWorkspace.querySelectorAll<HTMLButtonElement>(
    '[data-clear-selection]:not([data-selection-action])',
  )) {
    button.disabled = !active;
  }
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

function renderInspector(force = false): void {
  const project = currentProject;
  if (!project) {
    return;
  }
  if (force || renderedInspectorPanel !== activePanel) {
    const markup = panelMarkup(project, activePanel);
    required(patternWorkspace, '[data-inspector-content]', HTMLElement).innerHTML = markup;
    required(patternWorkspace, '[data-sheet-content]', HTMLElement).innerHTML = markup;
    renderedInspectorPanel = activePanel;
  }

  for (const tab of patternWorkspace.querySelectorAll<HTMLButtonElement>(
    '[role="tab"][data-panel-tab]',
  )) {
    const isActive = tab.dataset.panelTab === activePanel;
    tab.setAttribute('aria-selected', String(isActive));
    tab.classList.toggle('is-active', isActive);
    tab.tabIndex = isActive ? 0 : -1;
  }
  for (const panel of patternWorkspace.querySelectorAll<HTMLElement>('[data-tabpanel-surface]')) {
    const surface = panel.dataset.tabpanelSurface === 'mobile' ? 'mobile' : 'desktop';
    panel.setAttribute('aria-labelledby', `inspector-${surface}-tab-${activePanel}`);
  }
  for (const controls of patternWorkspace.querySelectorAll<HTMLElement>(
    '[data-palette-controls]',
  )) {
    controls.hidden = activePanel !== 'palette';
  }

  if (activePanel === 'palette') {
    initializePaletteControls();
  }
  updateInspectorDynamicContent();
}

function panelMarkup(project: BeadProject, panel: InspectorPanel): string {
  if (panel === 'palette') {
    const paletteColors = PALETTE_COLORS.filter((color) =>
      project.palette.availableColorIds.includes(color.id),
    );
    const groups = groupPaletteColorsBySeries(paletteColors);
    return `
      <div class="panel-heading">
        <div>
          <span class="eyebrow">当前颜色</span>
          <h2 data-current-color-heading>选择颜色</h2>
        </div>
        <span class="selected-swatch" data-current-color-swatch aria-hidden="true"></span>
      </div>
      <p class="panel-note">只显示生成时选定的可用颜色；屏幕颜色是近似预览，备料请以实物为准。</p>
      <div class="palette-grid" role="list" aria-label="项目可用拼豆颜色">
        ${groups
          .map(
            (group) => `
              <section
                class="palette-series-group"
                data-palette-series-group="${group.series}"
                aria-label="${group.series} 系列"
              >
                <h3>${group.series} 系列</h3>
                <div role="group">
                  ${group.colors
                    .map(
                      (color) => `
                        <button
                          class="palette-swatch"
                          type="button"
                          data-color-id="${color.id}"
                          data-color-series="${color.series}"
                          style="--swatch:${color.displayHex}"
                          aria-label="色号 ${color.paletteId.toUpperCase()} ${color.code}${
                            color.name ? `，${color.name}` : ''
                          }"
                        >
                          <span aria-hidden="true"></span>
                          <small>${color.code}</small>
                        </button>
                      `,
                    )
                    .join('')}
                </div>
              </section>
            `,
          )
          .join('')}
      </div>
    `;
  }

  if (panel === 'materials') {
    return `
      <div class="panel-heading">
        <div><span class="eyebrow">材料清单</span><h2 data-material-heading></h2></div>
      </div>
      <dl class="material-summary">
        <div><dt>成品大小</dt><dd data-material-size></dd></div>
        <div><dt>拼板</dt><dd data-material-boards></dd></div>
        <div><dt>空格</dt><dd data-material-blanks></dd></div>
      </dl>
      <ul class="material-list" data-material-list></ul>
    `;
  }

  if (panel === 'settings') {
    return `
      <div class="panel-heading">
        <div><span class="eyebrow">图纸设置</span><h2 data-settings-heading></h2></div>
      </div>
      <dl class="settings-list">
        <div><dt>色板</dt><dd data-settings-palette></dd></div>
        <div><dt>最多颜色</dt><dd data-settings-maximum></dd></div>
        <div><dt>格子取色</dt><dd data-settings-sampling></dd></div>
        <div><dt>颜色过渡</dt><dd data-settings-dithering></dd></div>
        <div><dt>成品大小</dt><dd data-settings-size></dd></div>
      </dl>
      <div class="panel-actions">
        <button class="secondary-button" type="button" data-matrix-mirror="horizontal">
          <i class="ph ph-arrows-left-right" aria-hidden="true"></i>左右镜像
        </button>
        <button class="secondary-button" type="button" data-matrix-mirror="vertical">
          <i class="ph ph-arrows-down-up" aria-hidden="true"></i>上下镜像
        </button>
      </div>
    `;
  }

  return `
    <div class="panel-heading">
      <div><span class="eyebrow">编辑工具</span><h2 data-tool-heading></h2></div>
    </div>
    <div class="current-color-row">
      <span class="selected-swatch" data-current-color-swatch aria-hidden="true"></span>
      <span>
        <strong data-current-color-label></strong>
        <small data-current-color-name></small>
      </span>
      <button class="text-button" type="button" data-panel-tab="palette">换颜色</button>
    </div>
    <div class="mobile-tool-grid">
      ${toolButtonMarkup('paint', '画笔', 'ph-pencil-simple')}
      ${toolButtonMarkup('erase', '橡皮', 'ph-eraser')}
      ${toolButtonMarkup('eyedropper', '吸管', 'ph-eyedropper')}
      ${toolButtonMarkup('fill', '填充', 'ph-paint-bucket')}
      ${toolButtonMarkup('select', '选择', 'ph-selection')}
    </div>
    <button class="secondary-button full-width" type="button" data-clear-selection>
      <i class="ph ph-trash" aria-hidden="true"></i>清空选中区域
    </button>
    <p class="panel-note">画笔可连续拖动；选择后可拖动移动，按住 Option / Alt 拖动复制。键盘方向键定位，空格应用工具。</p>
  `;
}

function updateInspectorDynamicContent(): void {
  const project = currentProject;
  if (!project) {
    return;
  }
  const selected = PALETTE_COLORS.find((color) => color.id === selectedColorId);
  setTextAll('[data-tool-heading]', toolCustomerLabel(activeTool));
  setTextAll(
    '[data-current-color-heading]',
    selected ? `色号 ${selected.paletteId.toUpperCase()} ${selected.code}` : '选择颜色',
  );
  setTextAll(
    '[data-current-color-label]',
    selected ? `${selected.paletteId.toUpperCase()} ${selected.code}` : '尚未选择颜色',
  );
  setTextAll('[data-current-color-name]', selected?.name ?? '点击“颜色”选择拼豆色号');
  for (const swatch of patternWorkspace.querySelectorAll<HTMLElement>(
    '[data-current-color-swatch]',
  )) {
    swatch.style.setProperty('--swatch', selected?.displayHex ?? 'transparent');
  }
  for (const swatch of patternWorkspace.querySelectorAll<HTMLButtonElement>('[data-color-id]')) {
    const isSelected = swatch.dataset.colorId === selectedColorId;
    swatch.classList.toggle('is-selected', isSelected);
    swatch.setAttribute('aria-pressed', String(isSelected));
  }
  for (const button of patternWorkspace.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
    const isActive = button.dataset.tool === activeTool;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  }

  const statistics = calculateStatistics(project.cells);
  const layout = calculatePhysicalLayout(project);
  setTextAll(
    '[data-material-heading]',
    `${String(statistics.nonEmptyBeadCount)} 颗 · ${String(statistics.usedColorCount)} 色`,
  );
  setTextAll(
    '[data-material-size]',
    `${(layout.widthMm / 10).toFixed(1)} × ${(layout.heightMm / 10).toFixed(1)} cm`,
  );
  setTextAll('[data-material-boards]', `${String(layout.boardCount)} 块`);
  setTextAll('[data-material-blanks]', `${String(statistics.blankCount)} 格`);
  const materialRows = Object.entries(statistics.perColorCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([colorId, count]) => {
      const color = PALETTE_COLORS.find((entry) => entry.id === colorId);
      return color
        ? `
            <li>
              <span class="material-swatch" style="--swatch:${color.displayHex}" aria-hidden="true"></span>
              <span>
                <strong>${color.paletteId.toUpperCase()} ${color.code}</strong>
                <small>${color.name ?? '实物颜色以拼豆为准'}</small>
              </span>
              <b>${String(count)} 颗</b>
            </li>
          `
        : '';
    })
    .join('');
  for (const list of patternWorkspace.querySelectorAll<HTMLElement>('[data-material-list]')) {
    if (list.innerHTML !== materialRows) {
      list.innerHTML = materialRows;
    }
  }

  setTextAll(
    '[data-settings-heading]',
    `${String(project.grid.columns)} 列 × ${String(project.grid.rows)} 行`,
  );
  setTextAll('[data-settings-palette]', project.palette.paletteId.toUpperCase());
  setTextAll('[data-settings-maximum]', String(project.palette.maximumColors ?? '不限'));
  setTextAll(
    '[data-settings-sampling]',
    project.generation.sampling === 'average' ? '平均取色' : '保留像素',
  );
  setTextAll(
    '[data-settings-dithering]',
    project.generation.dithering === 'none' ? '干净色块' : '细腻过渡',
  );
  setTextAll(
    '[data-settings-size]',
    `${(layout.widthMm / 10).toFixed(1)} × ${(layout.heightMm / 10).toFixed(1)} cm`,
  );
  updateSelectionActions();
  if (activePanel === 'palette') {
    applyPaletteFilters();
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
  for (const select of patternWorkspace.querySelectorAll<HTMLSelectElement>(
    '[data-color-series-filter]',
  )) {
    const fragment = document.createDocumentFragment();
    const all = document.createElement('option');
    all.value = '';
    all.textContent = '全部系列';
    fragment.append(all);
    for (const value of series) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = `${value} 系列`;
      fragment.append(option);
    }
    select.replaceChildren(fragment);
  }
  syncPaletteControls();
  applyPaletteFilters();
}

function syncPaletteControls(source?: HTMLInputElement | HTMLSelectElement): void {
  for (const input of patternWorkspace.querySelectorAll<HTMLInputElement>('[data-color-search]')) {
    if (input !== source) {
      input.value = paletteQuery;
    }
  }
  for (const input of patternWorkspace.querySelectorAll<HTMLInputElement>('[data-color-filter]')) {
    input.checked = input.value === paletteScope;
  }
  for (const select of patternWorkspace.querySelectorAll<HTMLSelectElement>(
    '[data-color-series-filter]',
  )) {
    if (select !== source) {
      select.value = paletteSeries;
    }
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
  for (const swatch of patternWorkspace.querySelectorAll<HTMLButtonElement>('[data-color-id]')) {
    swatch.hidden = !visibleIds.has(swatch.dataset.colorId ?? '');
  }
  for (const group of patternWorkspace.querySelectorAll<HTMLElement>(
    '[data-palette-series-group]',
  )) {
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
  for (const element of patternWorkspace.querySelectorAll<HTMLElement>(selector)) {
    element.textContent = text;
  }
}

async function downloadExport(format: string): Promise<void> {
  if (!currentProject || !['png', 'pdf', 'csv', 'json'].includes(format)) {
    return;
  }
  const capabilityFormat = format === 'json' ? 'projectJson' : format;
  if (
    !appCapabilities.exports.includes(capabilityFormat as 'png' | 'pdf' | 'csv' | 'projectJson')
  ) {
    announce('当前服务不支持这种导出格式。');
    return;
  }
  const project = captureProjectRevision(currentProject);
  const statusElements = patternWorkspace.querySelectorAll<HTMLElement>(
    '[data-export-inline-status], [data-export-status]',
  );
  const setStatus = (message: string): void => {
    for (const status of statusElements) {
      status.textContent = message;
    }
  };
  exportController?.abort();
  const controller = new AbortController();
  exportController = controller;
  setStatus(`正在准备矩阵版本 r${String(project.revision)} 的下载文件…`);
  const baseName = safeDownloadBaseName(project.source.fileName);
  const template =
    patternWorkspace.querySelector<HTMLInputElement>('input[name="export-template"]:checked')
      ?.value === 'pure'
      ? 'pure'
      : 'annotated';

  try {
    let blob: Blob;
    const extension = format;
    if (format === 'json') {
      blob = new Blob([exportProjectJson(project)], { type: 'application/json;charset=utf-8' });
    } else if (format === 'csv' && !navigator.onLine) {
      blob = new Blob([exportProjectCsv(project)], { type: 'text/csv;charset=utf-8' });
    } else {
      try {
        blob = await exportPattern(
          project,
          format as 'png' | 'pdf' | 'csv',
          template,
          controller.signal,
        );
      } catch (error) {
        if (
          format === 'csv' &&
          error instanceof PatternApiError &&
          error.code === 'SERVICE_UNREACHABLE'
        ) {
          blob = new Blob([exportProjectCsv(project)], { type: 'text/csv;charset=utf-8' });
        } else {
          throw error;
        }
      }
    }
    if (controller.signal.aborted) {
      return;
    }
    downloadBlob(blob, `${baseName}-pattern-r${String(project.revision)}.${extension}`);
    setStatus(`矩阵版本 r${String(project.revision)} 的下载已开始。`);
    announce(
      `${extension.toUpperCase()} 文件已准备完成，内容来自矩阵版本 r${String(project.revision)}。`,
    );
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      setStatus('导出已取消。');
      return;
    }
    setStatus(error instanceof PatternApiError ? error.message : '导出失败，请稍后重试。');
  } finally {
    if (exportController === controller) {
      exportController = null;
    }
  }
}

function abortActiveExport(message: string): void {
  if (!exportController) {
    return;
  }
  exportController.abort();
  exportController = null;
  for (const status of patternWorkspace.querySelectorAll<HTMLElement>(
    '[data-export-inline-status], [data-export-status]',
  )) {
    status.textContent = message;
  }
}

function syncExportTemplateControls(source: HTMLInputElement): void {
  const template: AppPngTemplate = source.matches('[data-export-grid]')
    ? source.checked
      ? 'annotated'
      : 'pure'
    : source.value === 'pure'
      ? 'pure'
      : 'annotated';
  for (const input of patternWorkspace.querySelectorAll<HTMLInputElement>(
    '[data-export-template]',
  )) {
    input.checked = input.value === template;
  }
  const includeGrid = patternWorkspace.querySelector<HTMLInputElement>('[data-export-grid]');
  if (includeGrid) {
    includeGrid.checked = template === 'annotated';
  }
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
  headerReplace.addEventListener('click', confirmReplaceImage);
}

function confirmReplaceImage(): void {
  if (
    currentProject &&
    (sourceGenerationRevision === null || currentProject.revision !== sourceGenerationRevision) &&
    !window.confirm('更换图片会结束当前编辑。请先导出项目 JSON，以便以后继续。确定更换吗？')
  ) {
    return;
  }
  resetToUpload();
}

function resetToUpload(): void {
  loadRevision += 1;
  generationController?.abort();
  exportController?.abort();
  chartMirrorController?.abort();
  canvasController?.destroy();
  canvasController = null;
  history = null;
  currentProject = null;
  sourceGenerationRevision = null;
  selectedImage = null;
  currentSelection = null;
  renderedInspectorPanel = null;
  recentColorIds = Object.freeze([]);
  gridContract = null;
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

function setSheetState(nextState: SheetState): void {
  sheetState = nextState;
  const sheet = required(patternWorkspace, '[data-workspace-sheet]', HTMLElement);
  const handle = required(patternWorkspace, '[data-sheet-handle]', HTMLButtonElement);
  sheet.dataset.sheetState = nextState;
  handle.setAttribute(
    'aria-label',
    nextState === 'peek'
      ? '展开控制面板'
      : nextState === 'half'
        ? '展开全部控制面板'
        : '收起控制面板',
  );
}

function updateSamplingDefault(): void {
  const value = mode === 'pixelArt' ? 'nearest' : 'average';
  const input = prepareWorkspace.querySelector<HTMLInputElement>(
    `input[name="sampling"][value="${value}"]`,
  );
  if (input) {
    input.checked = true;
  }
}

function setFileStatus(message: string, state: 'ready' | 'loading' | 'error'): void {
  fileStatus.textContent = message;
  fileStatus.dataset.state = state;
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
  const presetId = required(prepareWorkspace, '[data-board-preset]', HTMLSelectElement).value;
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
  const availableHeight = Math.max(240, patternWorkspace.clientHeight || window.innerHeight);
  const full = Math.max(220, availableHeight - 8);
  const peek = Math.min(112, Math.max(72, full * 0.28));
  const half = Math.min(full - 1, Math.max(peek + 1, full * 0.48));
  return Object.freeze({ peek, half, full });
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

function toolButtonMarkup(tool: EditorTool, label: string, icon: string): string {
  return `
    <button class="tool-button ${tool === activeTool ? 'is-active' : ''}" type="button" data-tool="${tool}" aria-pressed="${String(
      tool === activeTool,
    )}">
      <i class="ph ${icon}" aria-hidden="true"></i><span>${label}</span>
    </button>
  `;
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

function isProjectMode(value: string): value is ProjectMode {
  return value === 'photo' || value === 'pixelArt' || value === 'existingChart';
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
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
  generationController?.abort();
  exportController?.abort();
  chartMirrorController?.abort();
  canvasController?.destroy();
  clearChartResult();
  objectUrls.revokeAll();
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
