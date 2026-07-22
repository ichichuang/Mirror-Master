export function renderGridMirrorPanel(): string {
  return `
    <section
      class="mirror-panel"
      aria-labelledby="grid-mirror-title"
      data-grid-mirror
      data-state="waiting-for-confirmation"
    >
      <div class="mirror-heading">
        <h3 id="grid-mirror-title">网格单元镜像预览</h3>
        <p data-grid-mirror-message>等待确认精确整数像素网格。</p>
      </div>

      <p
        class="mirror-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-grid-mirror-live
      >
        等待确认
      </p>

      <dl class="mirror-details" data-grid-mirror-details>
        <div>
          <dt>源尺寸</dt>
          <dd data-grid-mirror-source-size>未就绪</dd>
        </div>
        <div>
          <dt>结果尺寸</dt>
          <dd data-grid-mirror-result-size>未生成</dd>
        </div>
        <div>
          <dt>网格原点</dt>
          <dd data-grid-mirror-origin>未确认</dd>
        </div>
        <div>
          <dt>单元尺寸</dt>
          <dd data-grid-mirror-cell-size>未确认</dd>
        </div>
        <div>
          <dt>网格结构</dt>
          <dd data-grid-mirror-grid-size>34 列 × 27 行</dd>
        </div>
        <div>
          <dt>处理范围</dt>
          <dd data-grid-mirror-scope>仅等待精确确认；不会提前生成镜像。</dd>
        </div>
      </dl>

      <div class="mirror-actions" aria-label="网格单元镜像操作">
        <button class="button button-primary" type="button" data-grid-mirror-generate disabled>
          生成镜像预览
        </button>
        <button class="button button-primary" type="button" data-grid-mirror-regenerate hidden>
          重新生成预览
        </button>
        <button class="button button-secondary" type="button" data-grid-mirror-return-precision hidden>
          返回精修调整
        </button>
      </div>

      <div class="preview-toolbar" data-grid-mirror-zoom-controls hidden aria-label="镜像预览缩放">
        <button class="button button-secondary" type="button" data-grid-mirror-zoom-fit>适合</button>
        <button class="button button-secondary" type="button" data-grid-mirror-zoom-out>缩小</button>
        <button class="button button-secondary" type="button" data-grid-mirror-zoom-actual>100%</button>
        <button class="button button-secondary" type="button" data-grid-mirror-zoom-in>放大</button>
        <span class="zoom-status" data-grid-mirror-zoom-status>适合</span>
      </div>

      <div
        class="mirror-comparison"
        aria-label="原图与镜像结果对比"
        data-grid-mirror-comparison
        hidden
      >
        <figure class="mirror-pane">
          <figcaption>原图</figcaption>
          <div class="mirror-preview-frame" data-grid-mirror-source-frame>
            <div class="mirror-stage" data-grid-mirror-source-stage>
              <img class="mirror-image" alt="" data-grid-mirror-source-image />
            </div>
          </div>
        </figure>

        <figure class="mirror-pane">
          <figcaption>镜像结果</figcaption>
          <div class="mirror-preview-frame" data-grid-mirror-result-frame>
            <div class="mirror-stage" data-grid-mirror-result-stage></div>
          </div>
        </figure>
      </div>
    </section>
  `;
}
