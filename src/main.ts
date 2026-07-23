import './styles/tokens.css';
import './styles/base.css';
import './styles/page.css';

import { renderApp } from './app';
import {
  mountGridEditor,
  type GridEditorController,
} from './features/grid-editor/gridEditor';
import { mirrorGridCells } from './features/grid-mirror/processor';
import { isValidIntegerGridSelection } from './features/grid-selection/geometry';
import { mountLocalImageInput } from './features/local-image-input/localImageInput';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Mirror Master bootstrap failed: missing #app element.');
}

app.innerHTML = renderApp();

const redetectButton = getRequiredElement(app, '[data-redetect]', HTMLButtonElement);
const resetSelectionButton = getRequiredElement(
  app,
  '[data-reset-selection]',
  HTMLButtonElement,
);
const generateButtons = [
  getRequiredElement(app, '[data-generate]', HTMLButtonElement),
  getRequiredElement(app, '[data-mobile-generate]', HTMLButtonElement),
];
const downloadButtons = [
  getRequiredElement(app, '[data-download]', HTMLButtonElement),
  getRequiredElement(app, '[data-mobile-download]', HTMLButtonElement),
];

let currentFile: File | null = null;
let generationVersion = 0;
let downloadVersion = 0;
let generating = false;
let resultCanvas: HTMLCanvasElement | null = null;
let downloadObjectUrl: string | null = null;
let editor: GridEditorController;

editor = mountGridEditor(app, {
  onSelectionChange() {
    generationVersion += 1;
    generating = false;
    clearGeneratedResult();
    updateActions();
  },
});

mountLocalImageInput(app, {
  onImageReady(payload) {
    generationVersion += 1;
    currentFile = payload.file;
    generating = false;
    clearGeneratedResult();
    editor.setImage({
      file: payload.file,
      fileName: payload.image.fileName,
      objectUrl: payload.image.objectUrl,
      naturalImage: payload.dimensions,
    });
    updateActions();
  },
});

redetectButton.addEventListener('click', () => {
  generationVersion += 1;
  clearGeneratedResult();
  editor.redetect();
  updateActions();
});

resetSelectionButton.addEventListener('click', () => {
  generationVersion += 1;
  clearGeneratedResult();
  editor.resetSelection();
  updateActions();
});

for (const button of generateButtons) {
  button.addEventListener('click', () => {
    void generateMirror();
  });
}

for (const button of downloadButtons) {
  button.addEventListener('click', downloadResult);
}

window.addEventListener('beforeunload', () => {
  downloadVersion += 1;
  revokeDownloadObjectUrl();
});

async function generateMirror(): Promise<void> {
  const file = currentFile;
  const selection = editor.getSelection();

  if (!file || !selection || !isValidIntegerGridSelection(selection) || generating) {
    return;
  }

  generationVersion += 1;
  const currentVersion = generationVersion;
  generating = true;
  clearGeneratedResult();
  editor.setMessage('正在本地生成镜像…');
  updateActions();

  const outcome = await mirrorGridCells({
    file,
    selection,
  });

  if (currentVersion !== generationVersion || currentFile !== file) {
    if (outcome.ok) {
      outcome.result.outputCanvas.width = 0;
      outcome.result.outputCanvas.height = 0;
    }

    return;
  }

  generating = false;

  if (!outcome.ok) {
    editor.setMessage(outcome.message);
    updateActions();
    return;
  }

  resultCanvas = outcome.result.outputCanvas;
  editor.showResult(resultCanvas);
  editor.setMessage(
    `镜像结果已生成：34列×27行，单元格 ${String(outcome.result.cellSize)}px。`,
  );
  prepareDownload(resultCanvas);
  updateActions();
}

function updateActions(): void {
  const hasImage = currentFile !== null;
  const hasResult = resultCanvas !== null;
  const selection = editor.getSelection();
  const canGenerate =
    hasImage && selection !== null && isValidIntegerGridSelection(selection) && !generating;

  redetectButton.disabled = !hasImage || generating;
  resetSelectionButton.disabled = !hasImage || generating;

  for (const button of generateButtons) {
    button.disabled = !canGenerate;
    button.textContent = generating ? '生成中…' : '生成镜像';
  }

  for (const button of downloadButtons) {
    button.hidden = !hasResult;
    button.disabled = !hasResult || downloadObjectUrl === null;
  }
}

function clearGeneratedResult(): void {
  downloadVersion += 1;
  resultCanvas = null;
  revokeDownloadObjectUrl();
  editor.clearResult();
}

function prepareDownload(canvas: HTMLCanvasElement): void {
  downloadVersion += 1;
  const currentVersion = downloadVersion;
  revokeDownloadObjectUrl();
  updateActions();

  canvas.toBlob((blob) => {
    if (
      !blob ||
      currentVersion !== downloadVersion ||
      resultCanvas !== canvas
    ) {
      return;
    }

    const objectUrl = URL.createObjectURL(blob);

    if (currentVersion !== downloadVersion || resultCanvas !== canvas) {
      URL.revokeObjectURL(objectUrl);
      return;
    }

    downloadObjectUrl = objectUrl;
    updateActions();
  }, 'image/png');
}

function downloadResult(): void {
  if (!downloadObjectUrl || !resultCanvas) {
    return;
  }

  const link = document.createElement('a');
  const sourceName = currentFile?.name.replace(/\.[^.]+$/, '') || 'mirror-master';
  link.href = downloadObjectUrl;
  link.download = `${sourceName}-mirror.png`;
  document.body.append(link);
  link.click();
  link.remove();
}

function revokeDownloadObjectUrl(): void {
  if (!downloadObjectUrl) {
    return;
  }

  URL.revokeObjectURL(downloadObjectUrl);
  downloadObjectUrl = null;
}

function getRequiredElement<ElementType extends HTMLElement>(
  root: ParentNode,
  selector: string,
  elementType: { new (): ElementType },
): ElementType {
  const element = root.querySelector(selector);

  if (!(element instanceof elementType)) {
    throw new Error(`Missing expected element: ${selector}`);
  }

  return element;
}

updateActions();
