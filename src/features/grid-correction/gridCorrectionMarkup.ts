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
