import { decodeImageFromObjectUrl } from './imageDecoder';
import { toDecodedImage, validateSingleImageFile } from './fileValidation';
import { createObjectUrlStore } from './objectUrlStore';
import type { DecodedImage, LocalImageInputLifecycle } from './types';

interface LocalImageInputElements {
  readonly appShell: HTMLElement;
  readonly input: HTMLInputElement;
  readonly dropZone: HTMLLabelElement;
  readonly changeButton: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly uploadView: HTMLElement;
  readonly editorWorkspace: HTMLElement;
  readonly selectedFileName: HTMLElement;
  readonly selectedDimensions: HTMLElement;
}

export function mountLocalImageInput(
  root: HTMLElement,
  lifecycle: LocalImageInputLifecycle = {},
): void {
  const elements = getElements(root);
  const objectUrls = createObjectUrlStore();
  let selectedImage: DecodedImage | null = null;
  let selectionVersion = 0;

  const handleFiles = async (files: readonly File[]): Promise<void> => {
    const validation = validateSingleImageFile(files);
    elements.input.value = '';

    if (!validation.ok) {
      setStatus(validation.message, 'error');
      return;
    }

    const { file, format, mimeType } = validation;
    selectionVersion += 1;
    const currentVersion = selectionVersion;
    const objectUrl = objectUrls.create(file);
    const previousImage = selectedImage;

    elements.appShell.dataset.state = 'loading';
    elements.uploadView.hidden = false;
    elements.editorWorkspace.hidden = true;
    setStatus(`正在读取 ${file.name}…`, 'loading');

    try {
      const dimensions = await decodeImageFromObjectUrl(objectUrl);

      if (currentVersion !== selectionVersion) {
        objectUrls.revoke(objectUrl);
        return;
      }

      if (previousImage) {
        objectUrls.revoke(previousImage.objectUrl);
      }

      selectedImage = toDecodedImage(
        file,
        mimeType,
        format,
        dimensions.width,
        dimensions.height,
        objectUrl,
      );
      elements.appShell.dataset.state = 'ready';
      elements.uploadView.hidden = true;
      elements.editorWorkspace.hidden = false;
      elements.selectedFileName.textContent = selectedImage.fileName;
      elements.selectedDimensions.textContent = `${String(dimensions.width)} × ${String(
        dimensions.height,
      )} px`;
      setStatus('图片已载入。', 'ready');

      lifecycle.onImageReady?.({
        file,
        image: selectedImage,
        dimensions,
      });
    } catch {
      objectUrls.revoke(objectUrl);

      if (currentVersion !== selectionVersion) {
        return;
      }

      selectedImage = previousImage;
      elements.appShell.dataset.state = previousImage ? 'ready' : 'empty';
      elements.uploadView.hidden = Boolean(previousImage);
      elements.editorWorkspace.hidden = !previousImage;
      setStatus(`无法读取 ${file.name}，请确认图片格式有效。`, 'error');
    }
  };

  const openFilePicker = (): void => {
    elements.input.value = '';
    elements.input.click();
  };

  elements.input.addEventListener('change', () => {
    void handleFiles(Array.from(elements.input.files ?? []));
  });

  elements.changeButton.addEventListener('click', openFilePicker);

  elements.dropZone.addEventListener('dragenter', (event) => {
    if (isFileDrag(event)) {
      event.preventDefault();
      elements.dropZone.classList.add('is-dragging');
    }
  });

  elements.dropZone.addEventListener('dragover', (event) => {
    if (isFileDrag(event)) {
      event.preventDefault();
      elements.dropZone.classList.add('is-dragging');
    }
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

  function setStatus(message: string, state: 'loading' | 'ready' | 'error'): void {
    elements.status.textContent = message;
    elements.status.dataset.state = state;
  }
}

function getElements(root: HTMLElement): LocalImageInputElements {
  return {
    appShell: getRequiredElement(root, '[data-app-shell]', HTMLElement),
    input: getRequiredElement(root, '[data-file-input]', HTMLInputElement),
    dropZone: getRequiredElement(root, '[data-drop-zone]', HTMLLabelElement),
    changeButton: getRequiredElement(root, '[data-change-image]', HTMLButtonElement),
    status: getRequiredElement(root, '[data-file-status]', HTMLElement),
    uploadView: getRequiredElement(root, '[data-upload-view]', HTMLElement),
    editorWorkspace: getRequiredElement(root, '[data-editor-workspace]', HTMLElement),
    selectedFileName: getRequiredElement(root, '[data-selected-file-name]', HTMLElement),
    selectedDimensions: getRequiredElement(root, '[data-selected-dimensions]', HTMLElement),
  };
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

function isFileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}
