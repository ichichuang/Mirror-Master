import './styles/tokens.css';
import './styles/base.css';
import './styles/page.css';

import { renderApp } from './app';
import { mountLocalImageInput } from './features/local-image-input/localImageInput';
import {
  mountGridDetection,
  type GridDetectionController,
} from './features/grid-detection/gridDetectionPanel';
import {
  mountGridCorrectionEditor,
  type GridCorrectionController,
} from './features/grid-correction/gridCorrectionEditor';
import { mountGridMirrorController } from './features/grid-mirror/gridMirrorController';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Mirror Master bootstrap failed: missing #app element.');
}

app.innerHTML = renderApp();

const imageInputRoot = app.querySelector<HTMLElement>('[data-local-image-input]');
const gridDetectionRoot = app.querySelector<HTMLElement>('[data-grid-detection]');
const gridMirrorRoot = app.querySelector<HTMLElement>('[data-grid-mirror]');

if (!imageInputRoot) {
  throw new Error('Mirror Master bootstrap failed: missing local image input root.');
}

if (!gridDetectionRoot) {
  throw new Error('Mirror Master bootstrap failed: missing grid detection root.');
}

if (!gridMirrorRoot) {
  throw new Error('Mirror Master bootstrap failed: missing grid mirror root.');
}

let gridDetection: GridDetectionController | null = null;
let gridCorrection: GridCorrectionController | null = null;

const gridMirror = mountGridMirrorController(gridMirrorRoot, {
  onReturnToPrecisionAdjustment() {
    gridCorrection?.returnToPrecisionAdjustment();
  },
});

gridCorrection = mountGridCorrectionEditor(imageInputRoot, {
  onSelectionApplied(selection) {
    gridDetection?.showAppliedSelection(selection);
    gridMirror.invalidate('粗校正选择已改变，镜像预览已失效；请重新完成精修确认。');
  },
  onSelectionCleared() {
    gridMirror.invalidate('粗校正选择已清除，镜像预览已失效。');
  },
  onPrecisionConfirmed(payload) {
    gridMirror.setReady(payload);
  },
  onPrecisionInvalidated(message) {
    gridMirror.invalidate(message);
  },
});

gridDetection = mountGridDetection(gridDetectionRoot, gridCorrection);

mountLocalImageInput(imageInputRoot, {
  onImageReady(payload) {
    gridMirror.setImage({
      file: payload.file,
      fileName: payload.image.fileName,
      objectUrl: payload.image.objectUrl,
      naturalImage: payload.dimensions,
    });
    gridCorrection.setImage(payload.file, payload.dimensions);
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
    gridMirror.clearImage();
  },
});
