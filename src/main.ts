import './generated/phosphor-icons.css';
import './design/generated/tokens.css';
import './styles/base.css';
import './styles/page.css';

import { renderApp } from './app';
import { brandConfig } from './brand/brand.config';
import { exportProjectCsv, exportProjectJson, safeDownloadBaseName } from './domain/export';
import { MatrixHistory } from './domain/history';
import {
  BOARD_PRESETS,
  calculatePhysicalLayout,
  calculateStatistics,
  mirrorCells,
  withProjectCells,
  type BeadProject,
  type ImageRotation,
  type ProjectMode,
} from './domain/project';
import { PALETTE_COLORS, PALETTES } from './generated/palettes';
import {
  mirrorGrid,
  MirrorMasterApiError,
  type GridDetectionContract,
} from './features/grid-api/client';
import { mountGridEditor, type GridEditorController } from './features/grid-editor/gridEditor';
import { decodeImageFromObjectUrl } from './features/local-image-input/imageDecoder';
import { validateSingleImageFile } from './features/local-image-input/fileValidation';
import { createObjectUrlStore } from './features/local-image-input/objectUrlStore';
import {
  mountPatternCanvas,
  type EditorTool,
  type PatternCanvasController,
} from './features/pattern-editor/canvasEditor';
import {
  exportPattern,
  generatePattern,
  PatternApiError,
  type PatternGenerationSettings,
} from './features/pattern-api/client';

type AppStage = 'upload' | 'prepare' | 'editor' | 'chart';
type InspectorPanel = 'tools' | 'palette' | 'materials' | 'settings' | 'export';
type SheetState = 'peek' | 'half' | 'full';

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
const dropZone = required(app, '[data-drop-zone]', HTMLLabelElement);
const fileStatus = required(app, '[data-file-status]', HTMLElement);
const appLive = required(app, '[data-app-live]', HTMLElement);
const sessionStatus = required(app, '[data-session-status]', HTMLElement);
const headerContext = required(app, '[data-header-context]', HTMLElement);
const headerReplace = required(app, '[data-replace-image]', HTMLButtonElement);

const objectUrls = createObjectUrlStore();
let stage: AppStage = 'upload';
let mode: ProjectMode = 'photo';
let selectedImage: SelectedImage | null = null;
let rotation: ImageRotation = 0;
let cropPercent: CropPercent = { x: 0, y: 0, width: 100, height: 100 };
let aspectLocked = true;
let currentProject: BeadProject | null = null;
let history: MatrixHistory | null = null;
let canvasController: PatternCanvasController | null = null;
let gridContract: GridDetectionContract | null = null;
let activePanel: InspectorPanel = 'tools';
let sheetState: SheetState = 'peek';
let selectedColorId = 'mard:A1';
let availableColorIds = new Set(getPalette('mard').colorIds);
let activeTool: EditorTool = 'paint';
let generationController: AbortController | null = null;
let exportController: AbortController | null = null;
let chartMirrorController: AbortController | null = null;
let chartResultUrl: string | null = null;
let chartAxis: 'horizontal' | 'vertical' = 'horizontal';

setupUpload();
setupPrepare();
setupPatternWorkspace();
const gridController: GridEditorController = setupChartWorkspace();
setupReplacementActions();
window.addEventListener('beforeunload', cleanup);
showStage('upload');

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
  const result = validateSingleImageFile(files);
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
    setFileStatus('图片已载入。', 'ready');
    if (mode === 'existingChart') {
      openChartWorkspace();
    } else {
      openPrepareWorkspace();
    }
  } catch {
    objectUrls.revoke(objectUrl);
    selectedImage = null;
    setFileStatus('无法读取这张图片，请确认文件没有损坏。', 'error');
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
  const selectAllColors = required(prepareWorkspace, '[data-select-all-colors]', HTMLButtonElement);
  const availableColorGrid = required(prepareWorkspace, '[data-available-color-grid]', HTMLElement);
  const generateButton = required(prepareWorkspace, '[data-generate-pattern]', HTMLButtonElement);
  const cropFrame = required(prepareWorkspace, '[data-crop-frame]', HTMLElement);
  const cropSelection = required(prepareWorkspace, '[data-crop-selection]', HTMLElement);
  let cropGesture: {
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly initial: CropPercent;
    readonly handle: 'move' | 'nw' | 'ne' | 'sw' | 'se';
  } | null = null;

  prepareReplace.addEventListener('click', resetToUpload);
  rotateLeft.addEventListener('click', () => {
    rotation = normalizeRotation(rotation - 90);
    cropPercent = { x: 0, y: 0, width: 100, height: 100 };
    drawCropPreview();
    updatePrepareSummaries();
    announce('图片已向左旋转。');
  });
  rotateRight.addEventListener('click', () => {
    rotation = normalizeRotation(rotation + 90);
    cropPercent = { x: 0, y: 0, width: 100, height: 100 };
    drawCropPreview();
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
    clampNumberInput(columnsInput, 1, 300);
    if (aspectLocked) {
      updateRowsFromColumns();
    }
    updatePrepareSummaries();
  });
  rowsInput.addEventListener('input', () => {
    clampNumberInput(rowsInput, 1, 300);
    if (aspectLocked) {
      updateColumnsFromRows();
    }
    updatePrepareSummaries();
  });
  boardPreset.addEventListener('change', updatePrepareSummaries);
  beadDiameter.addEventListener('input', () => {
    clampDecimalInput(beadDiameter, 1, 10);
    if (Number(beadPitch.value) < Number(beadDiameter.value)) {
      beadPitch.value = beadDiameter.value;
    }
    updatePrepareSummaries();
  });
  beadPitch.addEventListener('input', () => {
    clampDecimalInput(beadPitch, Number(beadDiameter.value) || 1, 20);
    updatePrepareSummaries();
  });
  paletteSelect.addEventListener('change', () => {
    const palette = getPalette(paletteSelect.value);
    availableColorIds = new Set(palette.colorIds);
    maximumColors.max = String(palette.colorIds.length);
    maximumColors.value = String(Math.min(Number(maximumColors.value), palette.colorIds.length));
    selectedColorId = palette.colorIds[0] ?? selectedColorId;
    renderAvailableColorFilter();
  });
  selectAllColors.addEventListener('click', () => {
    availableColorIds = new Set(getPalette(paletteSelect.value).colorIds);
    renderAvailableColorFilter();
    announce('已选中当前色板的全部颜色。');
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
    if (cropSelection.hasPointerCapture(event.pointerId)) {
      cropSelection.releasePointerCapture(event.pointerId);
    }
    cropGesture = null;
    announce('裁剪范围已更新。');
  };
  cropSelection.addEventListener('pointerup', endCropGesture);
  cropSelection.addEventListener('pointercancel', endCropGesture);

  function updateRowsFromColumns(): void {
    const dimensions = rotatedDimensions();
    const cropWidth = dimensions.width * (cropPercent.width / 100);
    const cropHeight = dimensions.height * (cropPercent.height / 100);
    const columns = Number(columnsInput.value);
    rowsInput.value = String(
      Math.max(1, Math.min(300, Math.round(columns * (cropHeight / cropWidth)))),
    );
  }

  function updateColumnsFromRows(): void {
    const dimensions = rotatedDimensions();
    const cropWidth = dimensions.width * (cropPercent.width / 100);
    const cropHeight = dimensions.height * (cropPercent.height / 100);
    const rows = Number(rowsInput.value);
    columnsInput.value = String(
      Math.max(1, Math.min(300, Math.round(rows * (cropWidth / cropHeight)))),
    );
  }
}

function openPrepareWorkspace(): void {
  if (!selectedImage) {
    return;
  }
  showStage('prepare');
  const columnsInput = required(prepareWorkspace, '[data-columns]', HTMLInputElement);
  const rowsInput = required(prepareWorkspace, '[data-rows]', HTMLInputElement);
  columnsInput.value = mode === 'pixelArt' ? String(Math.min(128, selectedImage.width)) : '48';
  rowsInput.value = String(
    Math.max(
      1,
      Math.min(
        300,
        Math.round(Number(columnsInput.value) * (selectedImage.height / selectedImage.width)),
      ),
    ),
  );
  updateSamplingDefault();
  const palette = getPalette(
    required(prepareWorkspace, '[data-palette-id]', HTMLSelectElement).value,
  );
  if (![...availableColorIds].every((colorId) => palette.colorIds.includes(colorId))) {
    availableColorIds = new Set(palette.colorIds);
  }
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
  const boardId = required(prepareWorkspace, '[data-board-preset]', HTMLSelectElement)
    .value as keyof typeof BOARD_PRESETS;
  const board = BOARD_PRESETS[boardId];
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

  for (const colorId of palette.colorIds) {
    const color = PALETTE_COLORS.find((entry) => entry.id === colorId);
    if (!color) {
      continue;
    }
    const label = document.createElement('label');
    label.className = 'available-color-choice';
    label.title = `${color.paletteId.toUpperCase()} ${color.code}${color.name ? ` · ${color.name}` : ''}`;
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
    fragment.append(label);
  }

  grid.replaceChildren(fragment);
  updateAvailableColorSummary();
}

function updateAvailableColorSummary(): void {
  required(prepareWorkspace, '[data-available-color-summary]', HTMLElement).textContent =
    `已选择 ${String(availableColorIds.size)} 色`;
}

async function startPatternGeneration(): Promise<void> {
  const image = selectedImage;
  if (!image) {
    return;
  }
  generationController?.abort();
  const controller = new AbortController();
  generationController = controller;
  const generateButton = required(prepareWorkspace, '[data-generate-pattern]', HTMLButtonElement);
  const status = required(prepareWorkspace, '[data-generate-status]', HTMLElement);
  generateButton.disabled = true;
  generateButton.innerHTML =
    '<i class="ph ph-circle-notch spin" aria-hidden="true"></i><span>正在生成图纸…</span>';
  status.textContent = '正在按你选择的色板生成拼豆格，可以随时更换图片取消。';
  sessionStatus.textContent = '正在生成';

  try {
    const result = await generatePattern(image.file, buildGenerationSettings(), controller.signal);
    if (controller.signal.aborted) {
      return;
    }
    currentProject = result.project;
    selectedColorId =
      Object.keys(result.statistics.perColorCounts)[0] ??
      result.project.palette.availableColorIds[0] ??
      selectedColorId;
    history = new MatrixHistory(result.project.cells, 100, result.project.revision);
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
    generateButton.innerHTML =
      '<span>生成图纸</span><i class="ph ph-arrow-right" aria-hidden="true"></i>';
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
  const sheetHandle = required(patternWorkspace, '[data-sheet-handle]', HTMLButtonElement);
  let sheetGesture: { pointerId: number; startY: number } | null = null;

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
      activePanel = tab.dataset.panelTab;
      if (window.matchMedia('(max-width: 767px)').matches && sheetState === 'peek') {
        setSheetState('half');
      }
      renderInspector();
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
    if (target.closest('[data-clear-selection]')) {
      canvasController?.clearSelection();
      return;
    }
    const exportButton = target.closest<HTMLButtonElement>('[data-export-format]');
    if (exportButton?.dataset.exportFormat) {
      void downloadExport(exportButton.dataset.exportFormat);
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
  for (const selector of ['[data-open-export]', '[data-mobile-export]']) {
    required(patternWorkspace, selector, HTMLButtonElement).addEventListener('click', () => {
      activePanel = 'export';
      setSheetState('full');
      renderInspector();
    });
  }

  sheetHandle.addEventListener('click', () => {
    setSheetState(sheetState === 'peek' ? 'half' : sheetState === 'half' ? 'full' : 'peek');
  });
  sheetHandle.addEventListener('pointerdown', (event) => {
    sheetGesture = { pointerId: event.pointerId, startY: event.clientY };
    sheetHandle.setPointerCapture(event.pointerId);
  });
  sheetHandle.addEventListener('pointerup', (event) => {
    if (!sheetGesture || sheetGesture.pointerId !== event.pointerId) {
      return;
    }
    const distance = event.clientY - sheetGesture.startY;
    if (Math.abs(distance) > 38) {
      setSheetState(
        distance < 0
          ? sheetState === 'peek'
            ? 'half'
            : 'full'
          : sheetState === 'full'
            ? 'half'
            : 'peek',
      );
    }
    if (sheetHandle.hasPointerCapture(event.pointerId)) {
      sheetHandle.releasePointerCapture(event.pointerId);
    }
    sheetGesture = null;
  });
  sheetHandle.addEventListener('pointercancel', () => {
    sheetGesture = null;
  });
}

function openPatternEditor(project: BeadProject): void {
  showStage('editor');
  const canvas = required(patternWorkspace, '[data-pattern-canvas]', HTMLCanvasElement);
  canvasController?.destroy();
  canvasController = mountPatternCanvas(canvas, project, {
    onCommit(cells, message) {
      if (!currentProject || !history) {
        return;
      }
      const snapshot = history.commit(cells);
      currentProject = withProjectCells(
        currentProject,
        snapshot.cells,
        new Date().toISOString(),
        snapshot.revision,
      );
      canvasController?.setProject(currentProject);
      updateHistoryButtons();
      renderInspector();
      sessionStatus.textContent = '本次会话有新修改';
      announce(message);
    },
    onColorPick(colorId) {
      setSelectedColor(colorId);
    },
    onStatus: announce,
  });
  canvasController.setTool(activeTool);
  canvasController.setColor(selectedColorId);
  activePanel = 'tools';
  sheetState = 'peek';
  setSheetState('peek');
  updateHistoryButtons();
  renderInspector();
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
  renderInspector();
}

function setSelectedColor(colorId: string): void {
  if (!PALETTE_COLORS.some((color) => color.id === colorId)) {
    return;
  }
  selectedColorId = colorId;
  canvasController?.setColor(colorId);
  renderInspector();
}

function mirrorProject(axis: 'horizontal' | 'vertical'): void {
  if (!currentProject || !history) {
    return;
  }
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
  renderInspector();
  announce(axis === 'horizontal' ? '图案已左右镜像。' : '图案已上下镜像。');
}

function undo(): void {
  if (!history || !currentProject) {
    return;
  }
  const snapshot = history.undo();
  currentProject = withProjectCells(
    currentProject,
    snapshot.cells,
    new Date().toISOString(),
    snapshot.revision,
  );
  canvasController?.setProject(currentProject);
  updateHistoryButtons();
  renderInspector();
  announce(snapshot.canRedo ? '已撤销上一步。' : '没有可撤销的操作。');
}

function redo(): void {
  if (!history || !currentProject) {
    return;
  }
  const snapshot = history.redo();
  currentProject = withProjectCells(
    currentProject,
    snapshot.cells,
    new Date().toISOString(),
    snapshot.revision,
  );
  canvasController?.setProject(currentProject);
  updateHistoryButtons();
  renderInspector();
  announce(snapshot.canUndo ? '已重做上一步。' : '没有可重做的操作。');
}

function updateHistoryButtons(): void {
  const snapshot = history?.snapshot;
  required(patternWorkspace, '[data-undo]', HTMLButtonElement).disabled = !snapshot?.canUndo;
  required(patternWorkspace, '[data-redo]', HTMLButtonElement).disabled = !snapshot?.canRedo;
}

function renderInspector(): void {
  if (!currentProject) {
    return;
  }
  const desktopContent = required(patternWorkspace, '[data-inspector-content]', HTMLElement);
  const mobileContent = required(patternWorkspace, '[data-sheet-content]', HTMLElement);
  const markup = panelMarkup(currentProject, activePanel);
  desktopContent.innerHTML = markup;
  mobileContent.innerHTML = markup;

  for (const tab of patternWorkspace.querySelectorAll<HTMLButtonElement>('[data-panel-tab]')) {
    const isActive = tab.dataset.panelTab === activePanel;
    tab.setAttribute('aria-selected', String(isActive));
    tab.classList.toggle('is-active', isActive);
  }
}

function panelMarkup(project: BeadProject, panel: InspectorPanel): string {
  if (panel === 'palette') {
    const paletteColors = PALETTE_COLORS.filter(
      (color) => color.paletteId === project.palette.paletteId,
    );
    const selected = paletteColors.find((color) => color.id === selectedColorId);
    return `
      <div class="panel-heading">
        <div>
          <span class="eyebrow">当前颜色</span>
          <h2>${selected ? `色号 ${selected.paletteId.toUpperCase()} ${selected.code}` : '选择颜色'}</h2>
        </div>
        ${
          selected
            ? `<span class="selected-swatch" style="--swatch:${selected.displayHex}" aria-label="${selected.displayHex}"></span>`
            : ''
        }
      </div>
      <p class="panel-note">屏幕颜色是近似预览，备料时请以实物拼豆为准。</p>
      <div class="palette-grid" role="list" aria-label="可用拼豆颜色">
        ${paletteColors
          .map(
            (color) => `
              <button
                class="palette-swatch ${color.id === selectedColorId ? 'is-selected' : ''}"
                type="button"
                data-color-id="${color.id}"
                style="--swatch:${color.displayHex}"
                aria-label="色号 ${color.paletteId.toUpperCase()} ${color.code}${color.name ? `，${color.name}` : ''}"
              >
                <span aria-hidden="true"></span>
                <small>${color.code}</small>
              </button>
            `,
          )
          .join('')}
      </div>
    `;
  }

  if (panel === 'materials') {
    const statistics = calculateStatistics(project.cells);
    const layout = calculatePhysicalLayout(project);
    const rows = Object.entries(statistics.perColorCounts)
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
    return `
      <div class="panel-heading">
        <div><span class="eyebrow">材料清单</span><h2>${String(
          statistics.nonEmptyBeadCount,
        )} 颗 · ${String(statistics.usedColorCount)} 色</h2></div>
      </div>
      <dl class="material-summary">
        <div><dt>成品大小</dt><dd>${(layout.widthMm / 10).toFixed(1)} × ${(layout.heightMm / 10).toFixed(1)} cm</dd></div>
        <div><dt>拼板</dt><dd>${String(layout.boardCount)} 块</dd></div>
        <div><dt>空格</dt><dd>${String(statistics.blankCount)} 格</dd></div>
      </dl>
      <ul class="material-list">${rows}</ul>
    `;
  }

  if (panel === 'settings') {
    const layout = calculatePhysicalLayout(project);
    return `
      <div class="panel-heading">
        <div><span class="eyebrow">图纸设置</span><h2>${String(
          project.grid.columns,
        )} 列 × ${String(project.grid.rows)} 行</h2></div>
      </div>
      <dl class="settings-list">
        <div><dt>色板</dt><dd>${project.palette.paletteId.toUpperCase()}</dd></div>
        <div><dt>最多颜色</dt><dd>${String(project.palette.maximumColors ?? '不限')}</dd></div>
        <div><dt>格子取色</dt><dd>${project.generation.sampling === 'average' ? '平均取色' : '保留像素'}</dd></div>
        <div><dt>颜色过渡</dt><dd>${project.generation.dithering === 'none' ? '干净色块' : '细腻过渡'}</dd></div>
        <div><dt>成品大小</dt><dd>${(layout.widthMm / 10).toFixed(1)} × ${(layout.heightMm / 10).toFixed(1)} cm</dd></div>
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

  if (panel === 'export') {
    return `
      <div class="panel-heading">
        <div><span class="eyebrow">完成图纸</span><h2>选择导出格式</h2></div>
      </div>
      <label class="export-grid-option">
        <input type="checkbox" checked data-export-grid-inline />
        <span>PNG / PDF 包含网格、坐标和材料图例</span>
      </label>
      <div class="export-actions">
        ${exportButtonMarkup('png', 'PNG 图纸', '适合查看与分享', 'ph-image-square')}
        ${exportButtonMarkup('pdf', 'PDF 打印稿', '按页打印和分板', 'ph-file-pdf')}
        ${exportButtonMarkup('csv', 'CSV 材料表', '颜色数量与逐格明细', 'ph-table')}
        ${exportButtonMarkup('json', '项目 JSON', '以后继续编辑', 'ph-brackets-curly')}
      </div>
      <p class="inline-status" data-export-inline-status role="status"></p>
    `;
  }

  const selected = PALETTE_COLORS.find((color) => color.id === selectedColorId);
  return `
    <div class="panel-heading">
      <div><span class="eyebrow">编辑工具</span><h2>${toolCustomerLabel(activeTool)}</h2></div>
    </div>
    <div class="current-color-row">
      <span class="selected-swatch" style="--swatch:${selected?.displayHex ?? '#FFFFFF'}" aria-hidden="true"></span>
      <span>
        <strong>${selected ? `${selected.paletteId.toUpperCase()} ${selected.code}` : '尚未选择颜色'}</strong>
        <small>${selected?.name ?? '点击“颜色”选择拼豆色号'}</small>
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
    <p class="panel-note">画笔可连续拖动；选择工具可框选一块区域。键盘可用方向键移动，空格应用工具。</p>
  `;
}

async function downloadExport(format: string): Promise<void> {
  const project = currentProject;
  if (!project || !['png', 'pdf', 'csv', 'json'].includes(format)) {
    return;
  }
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
  setStatus('正在准备下载文件…');
  const baseName = safeDownloadBaseName(project.source.fileName);

  try {
    let blob: Blob;
    let extension: string;
    if (format === 'json') {
      blob = new Blob([exportProjectJson(project)], { type: 'application/json;charset=utf-8' });
      extension = 'json';
    } else if (format === 'csv' && !navigator.onLine) {
      blob = new Blob([exportProjectCsv(project)], { type: 'text/csv;charset=utf-8' });
      extension = 'csv';
    } else {
      const includeGrid =
        patternWorkspace.querySelector<HTMLInputElement>('[data-export-grid-inline]')?.checked ??
        true;
      blob = await exportPattern(
        project,
        format as 'png' | 'pdf' | 'csv',
        includeGrid,
        controller.signal,
      );
      extension = format;
    }
    if (controller.signal.aborted) {
      return;
    }
    downloadBlob(blob, `${baseName}-pattern.${extension}`);
    setStatus('下载已开始。');
    announce(`${extension.toUpperCase()} 文件已准备完成。`);
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
    currentProject.revision > 0 &&
    !window.confirm('更换图片会结束当前编辑。请先导出项目 JSON，以便以后继续。确定更换吗？')
  ) {
    return;
  }
  resetToUpload();
}

function resetToUpload(): void {
  generationController?.abort();
  exportController?.abort();
  chartMirrorController?.abort();
  canvasController?.destroy();
  canvasController = null;
  history = null;
  currentProject = null;
  selectedImage = null;
  gridContract = null;
  clearChartResult();
  objectUrls.revokeAll();
  fileInput.value = '';
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

function exportButtonMarkup(
  format: string,
  title: string,
  description: string,
  icon: string,
): string {
  return `
    <button class="export-option" type="button" data-export-format="${format}">
      <i class="ph ${icon}" aria-hidden="true"></i>
      <span><strong>${title}</strong><small>${description}</small></span>
      <i class="ph ph-arrow-down" aria-hidden="true"></i>
    </button>
  `;
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

function isEditorTool(value: string): value is EditorTool {
  return ['paint', 'erase', 'eyedropper', 'fill', 'select'].includes(value);
}

function isInspectorPanel(value: string): value is Exclude<InspectorPanel, 'export'> {
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
