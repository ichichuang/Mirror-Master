import {
  createXhsExtraction,
  downloadXhsImages,
  fetchXhsImage,
  XhsImportApiError,
  type XhsExtraction,
} from './client';
import { deriveXhsSelectionState } from './selection';

export interface XhsImportControllerOptions {
  readonly root: HTMLElement;
  readonly clipboard?: Pick<Clipboard, 'readText'> | null;
  readonly createExtraction?: typeof createXhsExtraction;
  readonly fetchImage?: typeof fetchXhsImage;
  readonly downloadImages?: typeof downloadXhsImages;
  readonly onBack: () => void;
  readonly onUseImage: (file: File) => void | Promise<void>;
}

export interface XhsImportController {
  open(): void;
  reset(): void;
  destroy(): void;
}

export function createXhsImportController(
  options: XhsImportControllerOptions,
): XhsImportController {
  const { root } = options;
  const document = root.ownerDocument;
  const form = required(root, '[data-xhs-import-form]', 'form');
  const shareText = required(root, '[data-xhs-share-text]', 'textarea');
  const clipboardButton = required(root, '[data-xhs-read-clipboard]', 'button');
  const submitButton = required(root, '[data-xhs-extract-submit]', 'button');
  const backButton = required(root, '[data-xhs-import-back]', 'button');
  const status = required(root, '[data-xhs-import-status]', 'p');
  const grid = required(root, '[data-xhs-image-grid]', 'div');
  const actionBar = required(root, '[data-xhs-action-bar]', 'div');
  const selectedCount = required(root, '[data-xhs-selected-count]', 'strong');
  const toggleAll = required(root, '[data-xhs-toggle-all]', 'button');
  const saveSelected = required(root, '[data-xhs-save-selected]', 'button');
  const saveAll = required(root, '[data-xhs-save-all]', 'button');
  const useAsPattern = required(root, '[data-xhs-use-as-pattern]', 'button');
  const disabledReason = required(root, '[data-xhs-pattern-disabled-reason]', 'small');
  const browserClipboard = (
    globalThis.navigator as {
      readonly clipboard?: Pick<Clipboard, 'readText'>;
    }
  ).clipboard;
  const clipboard =
    options.clipboard === undefined ? (browserClipboard ?? null) : options.clipboard;
  const requestExtraction = options.createExtraction ?? createXhsExtraction;
  const requestImage = options.fetchImage ?? fetchXhsImage;
  const requestDownload = options.downloadImages ?? downloadXhsImages;
  let extraction: XhsExtraction | null = null;
  let selectedIds = new Set<number>();
  let requestController: AbortController | null = null;
  let busy = false;
  let destroyed = false;

  const handleBack = (): void => {
    reset();
    options.onBack();
  };
  const handleClipboard = (): void => {
    void readClipboard();
  };
  const handleSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    void extractImages();
  };
  const handleToggleAll = (): void => {
    if (!extraction || busy) return;
    const imageIds = extraction.images.map((image) => image.id);
    const state = deriveXhsSelectionState(imageIds, selectedIds);
    selectedIds = state.allSelected ? new Set() : new Set(imageIds);
    for (const checkbox of grid.querySelectorAll<HTMLInputElement>('[data-xhs-image-checkbox]')) {
      checkbox.checked = selectedIds.has(Number(checkbox.value));
    }
    syncSelection();
  };
  const handleSaveSelected = (): void => {
    if (!extraction) return;
    const imageIds = extraction.images
      .map((image) => image.id)
      .filter((imageId) => selectedIds.has(imageId));
    void saveImages(imageIds);
  };
  const handleSaveAll = (): void => {
    if (!extraction) return;
    void saveImages(extraction.images.map((image) => image.id));
  };
  const handleUseAsPattern = (): void => {
    void useSelectedImage();
  };

  backButton.addEventListener('click', handleBack);
  clipboardButton.addEventListener('click', handleClipboard);
  form.addEventListener('submit', handleSubmit);
  toggleAll.addEventListener('click', handleToggleAll);
  saveSelected.addEventListener('click', handleSaveSelected);
  saveAll.addEventListener('click', handleSaveAll);
  useAsPattern.addEventListener('click', handleUseAsPattern);

  async function readClipboard(): Promise<void> {
    if (busy) return;
    if (!clipboard) {
      showError('无法读取剪贴板，请手动粘贴链接。');
      shareText.focus();
      return;
    }
    try {
      const value = (await clipboard.readText()).trim();
      if (!value) {
        showError('剪贴板中没有可识别的链接，请手动粘贴。');
        shareText.focus();
        return;
      }
      shareText.value = value;
      setStatus('已读取剪贴板，可以识别链接。', 'ready');
      shareText.focus();
    } catch {
      showError('无法读取剪贴板，请手动粘贴链接。');
      shareText.focus();
    }
  }

  async function extractImages(): Promise<void> {
    const value = shareText.value.trim();
    if (!value) {
      showError('请先粘贴小红书分享链接。');
      shareText.focus();
      return;
    }
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    setBusy(true);
    setStatus('正在识别链接并读取图片…', 'loading');
    try {
      const result = await requestExtraction(value, controller.signal);
      if (destroyed || requestController !== controller) return;
      extraction = result;
      selectedIds = new Set();
      renderImages(result);
      actionBar.hidden = false;
      setStatus(`已找到 ${String(result.images.length)} 张图片。`, 'ready');
    } catch (error) {
      if (controller.signal.aborted) return;
      showError(messageForError(error));
    } finally {
      if (requestController === controller) {
        requestController = null;
        setBusy(false);
      }
    }
  }

  function renderImages(result: XhsExtraction): void {
    grid.replaceChildren();
    for (const [index, image] of result.images.entries()) {
      const card = document.createElement('label');
      card.className = 'xhs-image-card';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = String(image.id);
      checkbox.dataset.xhsImageCheckbox = '';
      checkbox.setAttribute('aria-label', `选择第 ${String(index + 1)} 张图片`);
      const preview = document.createElement('img');
      preview.src = image.previewUrl;
      preview.alt = `小红书图片 ${String(index + 1)}`;
      preview.loading = 'lazy';
      const number = document.createElement('span');
      number.textContent = String(index + 1);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedIds.add(image.id);
        else selectedIds.delete(image.id);
        syncSelection();
      });
      card.append(preview, checkbox, number);
      grid.append(card);
    }
    syncSelection();
  }

  function syncSelection(): void {
    const imageIds = extraction?.images.map((image) => image.id) ?? [];
    const state = deriveXhsSelectionState(imageIds, selectedIds);
    selectedCount.textContent = `已选 ${String(state.selectedCount)} 张`;
    toggleAll.textContent = state.allSelected ? '取消全选' : '全选';
    saveSelected.disabled = busy || !state.canSaveSelected;
    saveAll.disabled = busy || imageIds.length === 0;
    useAsPattern.disabled = busy || !state.canUseAsPattern;
    disabledReason.textContent = state.patternDisabledReason;
    disabledReason.hidden = state.patternDisabledReason === '';
    for (const checkbox of grid.querySelectorAll<HTMLInputElement>('[data-xhs-image-checkbox]')) {
      checkbox.disabled = busy;
    }
  }

  async function saveImages(imageIds: readonly number[]): Promise<void> {
    if (!extraction || imageIds.length === 0 || busy) return;
    setBusy(true);
    setStatus('正在准备下载…', 'loading');
    try {
      await requestDownload(extraction.extractionId, imageIds);
      setStatus(imageIds.length === 1 ? '图片已开始下载。' : '图片压缩包已开始下载。', 'ready');
    } catch (error) {
      showError(messageForError(error));
    } finally {
      setBusy(false);
    }
  }

  async function useSelectedImage(): Promise<void> {
    if (!extraction || busy) return;
    const imageId = extraction.images
      .map((image) => image.id)
      .find((candidate) => selectedIds.has(candidate));
    if (imageId === undefined || selectedIds.size !== 1) return;
    setBusy(true);
    setStatus('正在读取所选图片…', 'loading');
    try {
      const file = await requestImage(extraction.extractionId, imageId);
      await options.onUseImage(file);
    } catch (error) {
      showError(messageForError(error));
    } finally {
      setBusy(false);
    }
  }

  function setBusy(nextBusy: boolean): void {
    busy = nextBusy;
    root.setAttribute('aria-busy', String(nextBusy));
    shareText.disabled = nextBusy;
    clipboardButton.disabled = nextBusy;
    submitButton.disabled = nextBusy;
    backButton.disabled = nextBusy;
    toggleAll.disabled = nextBusy || extraction === null;
    syncSelection();
  }

  function setStatus(message: string, state: 'ready' | 'loading' | 'error'): void {
    status.textContent = message;
    status.dataset.state = state;
  }

  function showError(message: string): void {
    setStatus(message, 'error');
  }

  function reset(): void {
    requestController?.abort();
    requestController = null;
    extraction = null;
    selectedIds = new Set();
    busy = false;
    shareText.value = '';
    grid.replaceChildren();
    actionBar.hidden = true;
    setStatus('', 'ready');
    setBusy(false);
  }

  return Object.freeze({
    open() {
      if (destroyed) return;
      setStatus('', 'ready');
      shareText.focus();
    },
    reset,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      requestController?.abort();
      backButton.removeEventListener('click', handleBack);
      clipboardButton.removeEventListener('click', handleClipboard);
      form.removeEventListener('submit', handleSubmit);
      toggleAll.removeEventListener('click', handleToggleAll);
      saveSelected.removeEventListener('click', handleSaveSelected);
      saveAll.removeEventListener('click', handleSaveAll);
      useAsPattern.removeEventListener('click', handleUseAsPattern);
    },
  });
}

function messageForError(error: unknown): string {
  if (error instanceof XhsImportApiError) return error.message;
  return '图片提取失败，请检查链接后重试。';
}

function required<K extends keyof HTMLElementTagNameMap>(
  root: ParentNode,
  selector: string,
  tagName: K,
): HTMLElementTagNameMap[K] {
  const element = root.querySelector(selector);
  if (!element || element.localName !== tagName) {
    throw new Error(`缺少小红书提取控件：${selector}`);
  }
  return element as HTMLElementTagNameMap[K];
}
