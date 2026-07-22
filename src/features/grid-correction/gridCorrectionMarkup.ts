export function renderGridCorrectionOverlay(): string {
  return '<svg class="grid-overlay" data-grid-overlay hidden aria-hidden="true"></svg>';
}

export function renderGridCorrectionControls(): string {
  return `
    <div class="preview-toolbar" data-grid-zoom-controls hidden aria-label="预览缩放">
      <button class="button button-secondary" type="button" data-grid-zoom-fit>适合</button>
      <button class="button button-secondary" type="button" data-grid-zoom-out>缩小</button>
      <button class="button button-secondary" type="button" data-grid-zoom-actual>100%</button>
      <button class="button button-secondary" type="button" data-grid-zoom-in>放大</button>
      <span class="zoom-status" data-grid-zoom-status>适合</span>
    </div>

    <div class="correction-controls" data-grid-correction-controls hidden aria-label="网格校正操作">
      <button class="button button-primary" type="button" data-grid-correction-apply>
        应用
      </button>
      <button class="button button-secondary" type="button" data-grid-correction-cancel>
        取消
      </button>
      <button class="button button-secondary" type="button" data-grid-correction-start-over>
        重新开始
      </button>
      <button class="button button-secondary" type="button" data-grid-correction-reset-detected>
        重置为检测结果
      </button>
      <button class="button button-secondary" type="button" data-grid-correction-ratio>
        校正为 34:27
      </button>
      <button class="button button-secondary" type="button" data-grid-correction-edit>
        编辑已应用区域
      </button>
    </div>

    <div class="correction-readout" data-grid-correction-readout hidden>
      <p data-grid-correction-coordinates>自然坐标：未选择</p>
      <p data-grid-correction-cell-size>单元尺寸：未选择</p>
      <p data-grid-correction-validation>校验状态：未选择</p>
    </div>

    <section
      class="precision-panel"
      aria-labelledby="grid-precision-title"
      data-grid-precision-panel
      hidden
    >
      <div class="precision-heading">
        <h3 id="grid-precision-title">整数像素精修</h3>
        <p data-grid-precision-message>等待粗校正选择。</p>
      </div>

      <dl class="precision-details">
        <div>
          <dt>状态</dt>
          <dd data-grid-precision-state>空闲</dd>
        </div>
        <div>
          <dt>X</dt>
          <dd data-grid-precision-x-readout>未设置</dd>
        </div>
        <div>
          <dt>Y</dt>
          <dd data-grid-precision-y-readout>未设置</dd>
        </div>
        <div>
          <dt>单元</dt>
          <dd data-grid-precision-cell-readout>未设置</dd>
        </div>
        <div>
          <dt>右边界</dt>
          <dd data-grid-precision-right-readout>未设置</dd>
        </div>
        <div>
          <dt>下边界</dt>
          <dd data-grid-precision-bottom-readout>未设置</dd>
        </div>
        <div>
          <dt>网格</dt>
          <dd data-grid-precision-size>34 列 × 27 行</dd>
        </div>
        <div>
          <dt>证据</dt>
          <dd data-grid-precision-evidence>未评分</dd>
        </div>
        <div>
          <dt>就绪</dt>
          <dd data-grid-precision-readiness>未就绪</dd>
        </div>
      </dl>

      <div class="precision-adjustments" aria-label="整数像素精修调整">
        <label class="precision-field">
          <span>X</span>
          <span class="precision-stepper">
            <button
              class="button button-secondary"
              type="button"
              data-grid-precision-step-axis="x"
              data-grid-precision-step-delta="-1"
            >
              -1
            </button>
            <input
              type="number"
              inputmode="numeric"
              step="1"
              data-grid-precision-input="x"
              aria-label="精修 X 坐标"
            />
            <button
              class="button button-secondary"
              type="button"
              data-grid-precision-step-axis="x"
              data-grid-precision-step-delta="1"
            >
              +1
            </button>
          </span>
        </label>

        <label class="precision-field">
          <span>Y</span>
          <span class="precision-stepper">
            <button
              class="button button-secondary"
              type="button"
              data-grid-precision-step-axis="y"
              data-grid-precision-step-delta="-1"
            >
              -1
            </button>
            <input
              type="number"
              inputmode="numeric"
              step="1"
              data-grid-precision-input="y"
              aria-label="精修 Y 坐标"
            />
            <button
              class="button button-secondary"
              type="button"
              data-grid-precision-step-axis="y"
              data-grid-precision-step-delta="1"
            >
              +1
            </button>
          </span>
        </label>

        <label class="precision-field">
          <span>单元</span>
          <span class="precision-stepper">
            <button
              class="button button-secondary"
              type="button"
              data-grid-precision-step-axis="cell"
              data-grid-precision-step-delta="-1"
            >
              -1
            </button>
            <input
              type="number"
              inputmode="numeric"
              min="4"
              step="1"
              data-grid-precision-input="cell"
              aria-label="精修单元尺寸"
            />
            <button
              class="button button-secondary"
              type="button"
              data-grid-precision-step-axis="cell"
              data-grid-precision-step-delta="1"
            >
              +1
            </button>
          </span>
        </label>
      </div>

      <div class="precision-actions" aria-label="整数像素精修操作">
        <button class="button button-primary" type="button" data-grid-precision-refine>
          自动精修
        </button>
        <button class="button button-primary" type="button" data-grid-precision-confirm>
          确认精确网格
        </button>
        <button class="button button-secondary" type="button" data-grid-precision-cancel>
          取消精修
        </button>
        <button class="button button-secondary" type="button" data-grid-precision-return-rough>
          返回粗校正
        </button>
      </div>
    </section>

    <p
      class="correction-live"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-grid-correction-live
      hidden
    ></p>
  `;
}
