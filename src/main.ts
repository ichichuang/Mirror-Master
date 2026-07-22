import './styles/tokens.css';
import './styles/base.css';
import './styles/page.css';

import { renderApp } from './app';
import { mountLocalImageInput } from './features/local-image-input/localImageInput';
import {
  mountGridDetection,
  type GridDetectionController,
} from './features/grid-detection/gridDetectionPanel';
import { mountGridCorrectionEditor } from './features/grid-correction/gridCorrectionEditor';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Mirror Master bootstrap failed: missing #app element.');
}

app.innerHTML = renderApp();

const imageInputRoot = app.querySelector<HTMLElement>('[data-local-image-input]');
const gridDetectionRoot = app.querySelector<HTMLElement>('[data-grid-detection]');

if (!imageInputRoot) {
  throw new Error('Mirror Master bootstrap failed: missing local image input root.');
}

if (!gridDetectionRoot) {
  throw new Error('Mirror Master bootstrap failed: missing grid detection root.');
}

let gridDetection: GridDetectionController | null = null;

const gridCorrection = mountGridCorrectionEditor(imageInputRoot, {
  onSelectionApplied(selection) {
    gridDetection?.showAppliedSelection(selection);
  },
});

gridDetection = mountGridDetection(gridDetectionRoot, gridCorrection);

mountLocalImageInput(imageInputRoot, {
  onImageReady(payload) {
    gridCorrection.setImage(payload.dimensions);
    gridDetection.detect({
      file: payload.file,
      fileName: payload.image.fileName,
      width: payload.dimensions.width,
      height: payload.dimensions.height,
    });
  },
  onImageCleared() {
    gridCorrection.clearImage();
    gridDetection.clear();
  },
});
