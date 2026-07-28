export function renderStartWorkspace(): string {
  return `
    <section class="start-workspace stage-panel" data-start-workspace aria-labelledby="start-title">
      <div class="start-intro">
        <h1 id="start-title">把图片变成可制作的拼豆图纸</h1>
        <p>自动匹配色号、计算材料，还可以继续修改。</p>
      </div>

      <label class="primary-upload" for="image-file-input" data-drop-zone data-new-pattern-entry>
        <i class="ph ph-upload-simple" aria-hidden="true"></i>
        <span>
          <strong>选择图片</strong>
          <small data-upload-constraints>PNG / JPEG / WebP，最大 20 MB</small>
        </span>
      </label>

      <div class="upload-secondary-actions">
        <span>或</span>
        <label class="secondary-upload" for="project-file-input" data-open-project>
          <i class="ph ph-brackets-curly" aria-hidden="true"></i>
          <span>
            <strong>打开已保存项目</strong>
            <small>支持豆图项目文件（JSON）</small>
          </span>
        </label>
      </div>

      <details class="more-ways" data-more-ways>
        <summary>
          <span>
            <strong>更多制作方式</strong>
            <small>处理已有的拼豆图纸</small>
          </span>
          <i class="ph ph-caret-down" aria-hidden="true"></i>
        </summary>
        <button class="secondary-upload more-ways-item" type="button" data-mirror-existing-chart>
          <i class="ph ph-squares-four" aria-hidden="true"></i>
          <span>
            <strong>镜像已有图纸</strong>
            <small>只翻转拼豆格，保留坐标和图例。</small>
          </span>
        </button>
      </details>

      <p class="privacy-note">
        <i class="ph ph-shield-check" aria-hidden="true"></i>
        图片只用于生成当前图纸，不会发送给第三方图片服务。
      </p>
      <p class="file-status" data-file-status role="status"></p>
      <p
        class="project-file-status"
        data-project-file-status
        role="status"
        aria-live="polite"
      ></p>
      <p
        class="capabilities-status"
        data-capabilities-status
        role="status"
        aria-live="polite"
        hidden
      ></p>
    </section>
  `;
}
