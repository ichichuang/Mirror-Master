export function renderXhsImportWorkspace(): string {
  return `
    <section
      class="xhs-import-workspace stage-panel"
      data-xhs-import-workspace
      hidden
      aria-labelledby="xhs-import-title"
    >
      <header class="xhs-import-header">
        <button class="text-button" type="button" data-xhs-import-back>
          <i class="ph ph-arrow-left" aria-hidden="true"></i>
          返回首页
        </button>
        <div>
          <h1 id="xhs-import-title">从小红书提取图片</h1>
          <p>在小红书点击“分享 → 复制链接”，然后粘贴到这里。</p>
        </div>
      </header>

      <form class="xhs-import-form" data-xhs-import-form>
        <label for="xhs-share-text">小红书分享链接</label>
        <textarea
          id="xhs-share-text"
          data-xhs-share-text
          rows="3"
          maxlength="4096"
          placeholder="粘贴小红书分享文字或链接"
        ></textarea>
        <div class="xhs-import-form-actions">
          <button class="secondary-button" type="button" data-xhs-read-clipboard>
            <i class="ph ph-clipboard-text" aria-hidden="true"></i>
            读取剪贴板
          </button>
          <button class="primary-button" type="submit" data-xhs-extract-submit>
            识别链接
          </button>
        </div>
      </form>

      <p class="xhs-import-status" data-xhs-import-status role="status" aria-live="polite"></p>
      <div class="xhs-image-grid" data-xhs-image-grid aria-label="提取的图片"></div>

      <div class="xhs-action-bar" data-xhs-action-bar hidden>
        <div class="xhs-selection-summary">
          <strong data-xhs-selected-count>已选 0 张</strong>
          <button class="text-button" type="button" data-xhs-toggle-all>全选</button>
          <small data-xhs-pattern-disabled-reason>只能选择 1 张图片</small>
        </div>
        <div class="xhs-selection-actions">
          <button class="secondary-button" type="button" data-xhs-save-selected disabled>
            保存所选
          </button>
          <button class="secondary-button" type="button" data-xhs-save-all disabled>
            全部保存
          </button>
          <button class="primary-button" type="button" data-xhs-use-as-pattern disabled>
            作为拼豆图纸
          </button>
        </div>
      </div>
    </section>
  `;
}
