import './styles/tokens.css';
import './styles/base.css';
import './styles/page.css';

import { renderApp } from './app';
import {
  mirrorGrid,
  MirrorMasterApiError,
  type GridDetectionContract,
} from './features/grid-api/client';
import { mountGridEditor, type GridEditorController } from './features/grid-editor/gridEditor';
import { mountLocalImageInput } from './features/local-image-input/localImageInput';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Mirror Master bootstrap failed: missing #app element.');
}

app.innerHTML = renderApp();

const redetectButton = getRequiredElement(app, '[data-redetect]', HTMLButtonElement);
const resetSelectionButton = getRequiredElement(app, '[data-reset-selection]', HTMLButtonElement);
const generateButtons = [
  getRequiredElement(app, '[data-generate]', HTMLButtonElement),
  getRequiredElement(app, '[data-mobile-generate]', HTMLButtonElement),
];
const downloadButtons = [
  getRequiredElement(app, '[data-download]', HTMLButtonElement),
  getRequiredElement(app, '[data-mobile-download]', HTMLButtonElement),
];

let currentFile: File | null = null;
let currentFileHash: string | null = null;
let currentContract: GridDetectionContract | null = null;
let contractFile: File | null = null;
let generationVersion = 0;
let fileHashVersion = 0;
let generating = false;
let detecting = false;
let resultObjectUrl: string | null = null;

const editor: GridEditorController = mountGridEditor(app, {
  onContractChange(contract, file) {
    generationVersion += 1;
    generating = false;
    currentContract = contract;
    contractFile = file;
    clearGeneratedResult();
    updateActions();
  },
  onDetectionChange(isDetecting) {
    detecting = isDetecting;
    updateActions();
  },
});

mountLocalImageInput(app, {
  onImageReady(payload) {
    generationVersion += 1;
    fileHashVersion += 1;
    const hashVersion = fileHashVersion;
    currentFile = payload.file;
    currentFileHash = null;
    currentContract = null;
    contractFile = null;
    generating = false;
    detecting = false;
    clearGeneratedResult();
    editor.setImage({
      file: payload.file,
      fileName: payload.image.fileName,
      objectUrl: payload.image.objectUrl,
      naturalImage: payload.dimensions,
    });
    updateActions();

    void sha256File(payload.file)
      .then((hash) => {
        if (hashVersion !== fileHashVersion || currentFile !== payload.file) {
          return;
        }

        currentFileHash = hash;
        updateActions();
      })
      .catch(() => {
        if (hashVersion !== fileHashVersion || currentFile !== payload.file) {
          return;
        }

        currentFileHash = null;
        editor.setMessage('无法校验当前图片，请重新选择图片。');
        updateActions();
      });
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
  generationVersion += 1;
  fileHashVersion += 1;
  editor.clearResult();
  revokeResultObjectUrl();
});

async function generateMirror(): Promise<void> {
  const file = currentFile;
  const contract = currentContract;

  if (
    file === null ||
    contract === null ||
    !canGenerate(file, contract) ||
    generating ||
    detecting
  ) {
    return;
  }

  generationVersion += 1;
  const currentVersion = generationVersion;
  generating = true;
  clearGeneratedResult();
  editor.setMessage('正在由 Mirror Master 服务生成镜像…');
  updateActions();

  try {
    const blob = await mirrorGrid(file, contract);

    if (currentVersion !== generationVersion || currentFile !== file) {
      return;
    }

    generating = false;
    const objectUrl = URL.createObjectURL(blob);

    if (currentVersion !== generationVersion || currentFile !== file) {
      URL.revokeObjectURL(objectUrl);
      return;
    }

    resultObjectUrl = objectUrl;
    editor.showResult(objectUrl);
    editor.setMessage(
      `镜像已生成：${String(contract.columns)} 列 × ${String(
        contract.rows,
      )} 行，单元 ${String(contract.cellSize)} px`,
    );
    updateActions();
  } catch (error) {
    if (currentVersion !== generationVersion || currentFile !== file) {
      return;
    }

    generating = false;
    editor.setMessage(
      error instanceof MirrorMasterApiError ? error.message : '镜像生成失败，请重新识别后再试。',
    );
    updateActions();
  }
}

function updateActions(): void {
  const hasImage = currentFile !== null;
  const hasResult = resultObjectUrl !== null;
  const canStartGeneration = canGenerate(currentFile, currentContract) && !detecting && !generating;

  redetectButton.disabled = !hasImage || detecting || generating;
  resetSelectionButton.disabled = !hasImage || detecting || generating;

  for (const button of generateButtons) {
    button.disabled = !canStartGeneration;
    button.textContent = generating ? '生成中…' : '生成镜像';
  }

  for (const button of downloadButtons) {
    button.hidden = !hasResult;
    button.disabled = !hasResult;
  }
}

function canGenerate(file: File | null, contract: GridDetectionContract | null): boolean {
  return (
    file !== null &&
    contract !== null &&
    contractFile === file &&
    currentFileHash !== null &&
    contract.imageSha256 === currentFileHash
  );
}

function clearGeneratedResult(): void {
  editor.clearResult();
  revokeResultObjectUrl();
}

function downloadResult(): void {
  if (!resultObjectUrl) {
    return;
  }

  const link = document.createElement('a');
  const sourceName = currentFile?.name.replace(/\.[^.]+$/, '') || 'mirror-master';
  link.href = resultObjectUrl;
  link.download = `${sourceName}-mirror.png`;
  document.body.append(link);
  link.click();
  link.remove();
}

function revokeResultObjectUrl(): void {
  if (!resultObjectUrl) {
    return;
  }

  URL.revokeObjectURL(resultObjectUrl);
  resultObjectUrl = null;
}

async function sha256File(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
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
