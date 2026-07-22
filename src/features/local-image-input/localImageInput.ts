import { decodeImageFromObjectUrl } from './imageDecoder';
import { createObjectUrlStore } from './objectUrlStore';
import { toDecodedImage, validateSingleImageFile } from './fileValidation';
import {
  ACCEPTED_IMAGE_ACCEPT,
  type ImageInputState,
  type LocalImageInputLifecycle,
} from './types';
import {
  renderGridDetectionOverlay,
  renderGridDetectionPanel,
} from '../grid-detection/gridDetectionPanel';

const EMPTY_MESSAGE = '尚未选择图片。请选择一张本地 PNG、JPEG 或 WebP 图片。';

interface LocalImageInputElements {
  readonly input: HTMLInputElement;
  readonly dropZone: HTMLLabelElement;
  readonly replaceButton: HTMLButtonElement;
  readonly resetButton: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly previewFrame: HTMLElement;
  readonly previewStage: HTMLElement;
  readonly previewImage: HTMLImageElement;
  readonly emptyPreview: HTMLElement;
  readonly loadingPreview: HTMLElement;
  readonly loadingFileName: HTMLElement;
  readonly metadataList: HTMLElement;
  readonly selectedFileName: HTMLElement;
  readonly selectedFormat: HTMLElement;
  readonly selectedDimensions: HTMLElement;
  readonly selectedSize: HTMLElement;
}

export function renderLocalImageInput(): string {
  return `
    <section id="input" class="content-section input-section" aria-labelledby="input-title">
      <div class="section-heading">
        <p class="eyebrow">本地输入</p>
        <h2 id="input-title">本地图片输入</h2>
      </div>

      <div class="input-workspace" data-local-image-input>
        <div class="input-panel">
          <label class="drop-zone" for="image-file-input" data-drop-zone>
            <input
              class="file-input"
              id="image-file-input"
              type="file"
              accept="${ACCEPTED_IMAGE_ACCEPT}"
              aria-describedby="image-input-help image-status"
              data-file-input
            />
            <span class="drop-zone-title">选择一张本地图片</span>
            <span id="image-input-help" class="drop-zone-copy">
              支持 PNG、JPEG、WebP；也可以把单个文件拖放到这里。
            </span>
            <span class="drop-zone-privacy">文件只在当前浏览器本地解码，不会上传。</span>
          </label>

          <div
            id="image-status"
            class="status-message"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-status
          >
            ${EMPTY_MESSAGE}
          </div>

          <div class="input-actions" aria-label="图片操作">
            <button class="button button-primary" type="button" data-replace-button>选择图片</button>
            <button class="button button-secondary" type="button" data-reset-button disabled>
              移除图片
            </button>
          </div>
        </div>

        <figure class="preview-panel" aria-labelledby="preview-title">
          <figcaption id="preview-title" class="preview-title">原图预览</figcaption>
          <div class="preview-frame" data-preview-frame>
            <p class="preview-empty" data-empty-preview>未选择图片时不会显示预览。</p>
            <p class="preview-loading" data-loading-preview hidden>
              正在本地解码 <span data-loading-file-name></span>...
            </p>
            <div class="preview-stage" data-preview-stage hidden>
              <img class="preview-image" alt="" data-preview-image />
              ${renderGridDetectionOverlay()}
            </div>
          </div>
        </figure>

        <section class="metadata-panel" aria-labelledby="metadata-title">
          <h3 id="metadata-title">图片信息</h3>
          <dl class="metadata-list" data-metadata-list>
            <div>
              <dt>文件名</dt>
              <dd data-selected-file-name>未选择</dd>
            </div>
            <div>
              <dt>格式</dt>
              <dd data-selected-format>未选择</dd>
            </div>
            <div>
              <dt>尺寸</dt>
              <dd data-selected-dimensions>未选择</dd>
            </div>
            <div>
              <dt>大小</dt>
              <dd data-selected-size>未选择</dd>
            </div>
          </dl>
        </section>

        ${renderGridDetectionPanel()}
      </div>
    </section>
  `;
}

export function mountLocalImageInput(
  root: HTMLElement,
  lifecycle: LocalImageInputLifecycle = {},
): void {
  const elements = getLocalImageInputElements(root);
  const objectUrls = createObjectUrlStore();

  let state: ImageInputState = {
    status: 'empty',
    selectedImage: null,
    message: EMPTY_MESSAGE,
    pendingFileName: null,
  };
  let selectionVersion = 0;

  const setState = (nextState: ImageInputState): void => {
    state = nextState;
    renderState(elements, state);
  };

  const setError = (message: string): void => {
    setState({
      status: 'error',
      selectedImage: state.selectedImage,
      message,
      pendingFileName: null,
    });
  };

  const handleFiles = async (files: readonly File[]): Promise<void> => {
    const validation = validateSingleImageFile(files);
    elements.input.value = '';

    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    const { file, format, mimeType } = validation;
    selectionVersion += 1;
    const currentSelectionVersion = selectionVersion;
    const objectUrl = objectUrls.create(file);
    const previousImage = state.selectedImage;

    lifecycle.onImageCleared?.({
      previousImage,
      reason: 'replacement-started',
    });

    setState({
      status: 'loading',
      selectedImage: previousImage,
      message: `正在本地解码 ${file.name}...`,
      pendingFileName: file.name,
    });

    try {
      const dimensions = await decodeImageFromObjectUrl(objectUrl);

      if (currentSelectionVersion !== selectionVersion) {
        objectUrls.revoke(objectUrl);
        return;
      }

      if (previousImage) {
        objectUrls.revoke(previousImage.objectUrl);
      }

      const decodedImage = toDecodedImage(
        file,
        mimeType,
        format,
        dimensions.width,
        dimensions.height,
        objectUrl,
      );

      setState({
        status: 'ready',
        selectedImage: decodedImage,
        message: `已载入 ${file.name}，尺寸 ${String(dimensions.width)} × ${String(
          dimensions.height,
        )} 像素。`,
        pendingFileName: null,
      });

      lifecycle.onImageReady?.({
        file,
        image: decodedImage,
        dimensions,
      });
    } catch {
      objectUrls.revoke(objectUrl);

      if (currentSelectionVersion !== selectionVersion) {
        return;
      }

      setError(`无法解码 ${file.name}。请确认文件是有效的 PNG、JPEG 或 WebP 图片。`);
    }
  };

  const resetImage = (): void => {
    selectionVersion += 1;

    if (state.selectedImage) {
      objectUrls.revoke(state.selectedImage.objectUrl);
    }

    lifecycle.onImageCleared?.({
      previousImage: state.selectedImage,
      reason: 'reset',
    });

    elements.input.value = '';

    setState({
      status: 'empty',
      selectedImage: null,
      message: '已移除图片。可以重新选择同一个文件。',
      pendingFileName: null,
    });
  };

  elements.input.addEventListener('change', () => {
    void handleFiles(Array.from(elements.input.files ?? []));
  });

  elements.replaceButton.addEventListener('click', () => {
    elements.input.click();
  });

  elements.resetButton.addEventListener('click', resetImage);

  elements.dropZone.addEventListener('dragenter', (event) => {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    elements.dropZone.classList.add('is-dragging');
  });

  elements.dropZone.addEventListener('dragover', (event) => {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    elements.dropZone.classList.add('is-dragging');
  });

  elements.dropZone.addEventListener('dragleave', () => {
    elements.dropZone.classList.remove('is-dragging');
  });

  elements.dropZone.addEventListener('drop', (event) => {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    elements.dropZone.classList.remove('is-dragging');
    void handleFiles(Array.from(event.dataTransfer?.files ?? []));
  });

  const preventExternalFileDrop = (event: DragEvent): void => {
    if (isFileDrag(event)) {
      event.preventDefault();
    }
  };

  window.addEventListener('dragover', preventExternalFileDrop);
  window.addEventListener('drop', preventExternalFileDrop);
  window.addEventListener('beforeunload', objectUrls.revokeAll);

  renderState(elements, state);
}

function renderState(elements: LocalImageInputElements, state: ImageInputState): void {
  elements.status.textContent = state.message;
  elements.status.dataset.state = state.status;
  elements.previewFrame.dataset.state = state.status;
  elements.input.ariaInvalid = state.status === 'error' ? 'true' : 'false';
  elements.loadingFileName.textContent = state.pendingFileName ?? '';
  elements.loadingPreview.hidden = state.status !== 'loading';

  const selectedImage = state.selectedImage;
  const hasImage = selectedImage !== null;

  elements.resetButton.disabled = !hasImage;
  elements.replaceButton.textContent = hasImage ? '更换图片' : '选择图片';
  elements.emptyPreview.hidden = hasImage || state.status === 'loading';
  elements.previewStage.hidden = !hasImage || state.status === 'loading';
  elements.previewImage.hidden = !hasImage || state.status === 'loading';
  elements.metadataList.dataset.state = hasImage ? 'ready' : 'empty';

  if (!selectedImage) {
    elements.previewImage.removeAttribute('src');
    elements.previewImage.alt = '';
    elements.selectedFileName.textContent = '未选择';
    elements.selectedFormat.textContent = '未选择';
    elements.selectedDimensions.textContent = '未选择';
    elements.selectedSize.textContent = '未选择';
    return;
  }

  elements.previewImage.src = selectedImage.objectUrl;
  elements.previewImage.alt = `${selectedImage.fileName} 的本地原图预览`;
  elements.selectedFileName.textContent = selectedImage.fileName;
  elements.selectedFormat.textContent = selectedImage.format;
  elements.selectedDimensions.textContent = `${String(selectedImage.width)} × ${String(
    selectedImage.height,
  )} px`;
  elements.selectedSize.textContent = selectedImage.sizeText;
}

function getLocalImageInputElements(root: HTMLElement): LocalImageInputElements {
  return {
    input: getRequiredElement(root, '[data-file-input]', HTMLInputElement),
    dropZone: getRequiredElement(root, '[data-drop-zone]', HTMLLabelElement),
    replaceButton: getRequiredElement(root, '[data-replace-button]', HTMLButtonElement),
    resetButton: getRequiredElement(root, '[data-reset-button]', HTMLButtonElement),
    status: getRequiredElement(root, '[data-status]', HTMLElement),
    previewFrame: getRequiredElement(root, '[data-preview-frame]', HTMLElement),
    previewStage: getRequiredElement(root, '[data-preview-stage]', HTMLElement),
    previewImage: getRequiredElement(root, '[data-preview-image]', HTMLImageElement),
    emptyPreview: getRequiredElement(root, '[data-empty-preview]', HTMLElement),
    loadingPreview: getRequiredElement(root, '[data-loading-preview]', HTMLElement),
    loadingFileName: getRequiredElement(root, '[data-loading-file-name]', HTMLElement),
    metadataList: getRequiredElement(root, '[data-metadata-list]', HTMLElement),
    selectedFileName: getRequiredElement(root, '[data-selected-file-name]', HTMLElement),
    selectedFormat: getRequiredElement(root, '[data-selected-format]', HTMLElement),
    selectedDimensions: getRequiredElement(root, '[data-selected-dimensions]', HTMLElement),
    selectedSize: getRequiredElement(root, '[data-selected-size]', HTMLElement),
  };
}

function getRequiredElement<ElementType extends HTMLElement>(
  root: ParentNode,
  selector: string,
  elementType: {
    new (): ElementType;
  },
): ElementType {
  const element = root.querySelector(selector);

  if (!(element instanceof elementType)) {
    throw new Error(`Missing expected element: ${selector}`);
  }

  return element;
}

function isFileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}
