import { ACCEPTED_IMAGE_ACCEPT } from './features/local-image-input/types';

export function renderApp(): string {
  return `
    <a class="skip-link" href="#workspace-main">跳到编辑区</a>
    <div class="app-shell" data-app-shell data-state="empty">
      <header class="workspace-toolbar" aria-label="Mirror Master 工具栏">
        <div class="toolbar-brand">
          <span class="brand-mark" aria-hidden="true">MM</span>
          <span>Mirror Master</span>
        </div>

        <div class="toolbar-actions" aria-label="图片与网格操作">
          <button class="button button-secondary" type="button" data-change-image>
            更换图片
          </button>
          <button class="button button-secondary" type="button" data-redetect disabled>
            重新识别
          </button>
          <button class="button button-secondary" type="button" data-reset-selection disabled>
            重置选区
          </button>
          <button class="button button-primary desktop-generate" type="button" data-generate disabled>
            生成镜像
          </button>
          <button
            class="button button-secondary desktop-download"
            type="button"
            data-download
            hidden
            disabled
          >
            下载结果 PNG
          </button>
        </div>
      </header>

      <main id="workspace-main" class="workspace-main" tabindex="-1">
        <input
          class="visually-hidden"
          id="image-file-input"
          type="file"
          accept="${ACCEPTED_IMAGE_ACCEPT}"
          aria-describedby="file-status"
          data-file-input
        />

        <section class="upload-view" data-upload-view aria-labelledby="upload-title">
          <label class="drop-zone" for="image-file-input" data-drop-zone>
            <span class="upload-mark" aria-hidden="true">34 × 27</span>
            <span class="drop-zone-title" id="upload-title">上传图片开始</span>
            <span class="drop-zone-copy">选择或拖入 Pixelanim PNG、JPEG、WebP 图片</span>
          </label>
          <p
            id="file-status"
            class="file-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-file-status
          >
            图片只在当前浏览器中处理。
          </p>
        </section>

        <section class="editor-workspace" data-editor-workspace hidden aria-label="网格镜像工作区">
          <div class="editor-chrome">
            <div class="view-tabs" role="tablist" aria-label="预览内容">
              <button
                class="view-tab"
                type="button"
                role="tab"
                aria-selected="true"
                data-view-original
              >
                原图
              </button>
              <button
                class="view-tab"
                type="button"
                role="tab"
                aria-selected="false"
                data-view-result
                disabled
              >
                镜像结果
              </button>
            </div>

            <p class="editor-hint" data-editor-hint>正在准备图片…</p>

            <div class="zoom-controls" aria-label="预览缩放">
              <button class="button button-compact" type="button" data-zoom-fit>Fit</button>
              <button class="button button-compact" type="button" data-zoom-out aria-label="缩小">
                −
              </button>
              <button class="button button-compact" type="button" data-zoom-actual>100%</button>
              <button class="button button-compact" type="button" data-zoom-in aria-label="放大">
                ＋
              </button>
              <span class="zoom-status" data-zoom-status>适合</span>
            </div>
          </div>

          <div class="editor-frame" data-editor-frame>
            <div class="editor-stage" data-editor-stage>
              <img class="editor-image" alt="" data-editor-image />
              <svg
                class="grid-overlay"
                data-editor-overlay
                aria-label="34 × 27 网格选区编辑区"
              ></svg>
            </div>
          </div>

          <div class="result-return">
            <button class="button button-secondary" type="button" data-return-adjust hidden>
              返回调整
            </button>
          </div>

          <details class="image-details">
            <summary>图片详情</summary>
            <div class="details-content">
              <span data-selected-file-name>未选择</span>
              <span data-selected-dimensions>未选择</span>
              <span>全程本地处理，不上传图片。</span>
            </div>
          </details>

          <p
            class="visually-hidden"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-editor-live
          ></p>
        </section>
      </main>

      <div class="mobile-action-bar" aria-label="镜像操作">
        <button class="button button-primary" type="button" data-mobile-generate disabled>
          生成镜像
        </button>
        <button
          class="button button-secondary"
          type="button"
          data-mobile-download
          hidden
          disabled
        >
          下载结果 PNG
        </button>
      </div>
    </div>
  `;
}
