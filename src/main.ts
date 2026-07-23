import './styles/tokens.css';
import './styles/base.css';
import './styles/page.css';

import { renderApp } from './app';
import {
  mountGridEditor,
  type GridEditorController,
} from './features/grid-editor/gridEditor';
import { mirrorGridCells } from './features/grid-mirror/processor';
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

let currentFile: File | null = null;
let generationVersion = 0;
let generating = false;
let editor: GridEditorController;

editor = mountGridEditor(app, {
  onSelectionChange() {
    generationVersion += 1;
    generating = false;
    editor.clearResult();
    updateActions();
  },
});

mountLocalImageInput(app, {
  onImageReady(payload) {
    generationVersion += 1;
    currentFile = payload.file;
    generating = false;
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
  editor.clearResult();
  editor.redetect();
  updateActions();
});

resetSelectionButton.addEventListener('click', () => {
  generationVersion += 1;
  editor.clearResult();
  editor.resetSelection();
  updateActions();
});

for (const button of generateButtons) {
  button.addEventListener('click', () => {
    void generateMirror();
  });
}

async function generateMirror(): Promise<void> {
  const file = currentFile;
  const selection = editor.getSelection();

  if (!file || !selection?.confirmedByInteraction || generating) {
    return;
  }

  generationVersion += 1;
  const currentVersion = generationVersion;
  generating = true;
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

  editor.showResult(outcome.result.outputCanvas);
  editor.setMessage('镜像结果已生成。');
  updateActions();
}

function updateActions(): void {
  const hasImage = currentFile !== null;
  const selection = editor.getSelection();
  const canGenerate = hasImage && selection?.confirmedByInteraction === true && !generating;

  redetectButton.disabled = !hasImage || generating;
  resetSelectionButton.disabled = !hasImage || generating;

  for (const button of generateButtons) {
    button.disabled = !canGenerate;
    button.textContent = generating ? '生成中…' : '生成镜像';
  }
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
