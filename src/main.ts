import './styles/tokens.css';
import './styles/base.css';
import './styles/page.css';

import { renderApp } from './app';
import { mountLocalImageInput } from './features/local-image-input/localImageInput';
import { mountGridDetection } from './features/grid-detection/gridDetectionPanel';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Mirror Master bootstrap failed: missing #app element.');
}

app.innerHTML = renderApp();

const imageInputRoot = app.querySelector<HTMLElement>('[data-local-image-input]');
const gridDetectionRoot = app.querySelector<HTMLElement>('[data-grid-detection]');
const gridOverlay = app.querySelector<SVGSVGElement>('[data-grid-overlay]');

if (!imageInputRoot) {
  throw new Error('Mirror Master bootstrap failed: missing local image input root.');
}

if (!gridDetectionRoot) {
  throw new Error('Mirror Master bootstrap failed: missing grid detection root.');
}

if (!gridOverlay) {
  throw new Error('Mirror Master bootstrap failed: missing grid detection overlay.');
}

const gridDetection = mountGridDetection(gridDetectionRoot, gridOverlay);

mountLocalImageInput(imageInputRoot, {
  onImageReady(payload) {
    gridDetection.detect({
      file: payload.file,
      fileName: payload.image.fileName,
      width: payload.dimensions.width,
      height: payload.dimensions.height,
    });
  },
  onImageCleared() {
    gridDetection.clear();
  },
});
