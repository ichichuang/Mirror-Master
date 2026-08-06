import { DEFAULT_PREVIEW_RENDER_MODE, PREVIEW_RENDER_MODES } from './previewMode';
import { HIGHLIGHT_PRESETS } from '../mask-editor/maskEditCanvas';

export function renderPreviewWorkspace(): string {
  return `
    <section class="preview-workspace stage-panel" data-preview-workspace hidden aria-labelledby="preview-title">
      <h1 id="preview-title" class="visually-hidden">预览图纸</h1>
      <div class="preview-layout">
        <div class="preview-canvas-column">
          <div class="preview-toolbar">
            <div class="preview-compare-bar">
              <vaadin-radio-group
                class="compare-switch"
                aria-label="在原图和拼豆预览之间切换"
                data-compare-switch
              >
                <vaadin-radio-button value="pattern" checked>
                  <label slot="label">拼豆</label>
                </vaadin-radio-button>
                <vaadin-radio-button value="original">
                  <label slot="label">原图</label>
                </vaadin-radio-button>
              </vaadin-radio-group>
              <button class="secondary-button hold-original-button" type="button" data-hold-original>
                <i class="ph ph-eye" aria-hidden="true"></i>
                按住对比
              </button>
              <div class="preview-image-actions" data-preview-image-actions>
                <button
                  class="secondary-button preview-image-action adjust-source-button"
                  type="button"
                  aria-label="调整原图"
                  data-adjust-source
                >
                  <i class="ph ph-crop" aria-hidden="true"></i>
                  <span data-action-label-short>裁剪</span>
                  <span data-action-label-long>调整原图</span>
                </button>
                <div class="background-removal-control" data-background-removal-control>
                  <button
                    class="secondary-button preview-image-action background-removal-button"
                    type="button"
                    aria-label="一键去背景"
                    data-background-removal-action
                    disabled
                  >
                    <i class="ph ph-person-simple-circle" aria-hidden="true"></i>
                    <span data-background-removal-label-short>去背</span>
                    <span data-background-removal-label-long>一键去背景</span>
                  </button>
                </div>
                <button
                  class="secondary-button preview-image-action mask-reedit-button"
                  type="button"
                  aria-label="调整去背景选区"
                  data-mask-reedit
                  hidden
                >
                  <i class="ph ph-selection" aria-hidden="true"></i>
                  <span data-action-label-short>选区</span>
                  <span data-action-label-long>调整选区</span>
                </button>
                <button
                  class="secondary-button preview-image-action replace-source-button"
                  type="button"
                  aria-label="更换图片"
                  data-prepare-replace
                >
                  <i class="ph ph-image" aria-hidden="true"></i>
                  <span data-action-label-short>换图</span>
                  <span data-action-label-long>更换图片</span>
                </button>
              </div>
            </div>
            <p
              class="background-removal-status"
              data-background-removal-status
              data-state="ready"
              hidden
              role="status"
              aria-live="polite"
            >
              <i
                class="ph ph-check-circle"
                data-background-removal-status-icon="ready"
                aria-hidden="true"
              ></i>
              <i
                class="ph ph-circle-notch spin"
                data-background-removal-status-icon="loading"
                aria-hidden="true"
              ></i>
              <i
                class="ph ph-warning-circle"
                data-background-removal-status-icon="error"
                aria-hidden="true"
              ></i>
              <span data-background-removal-status-message></span>
            </p>
            <div class="preview-mode-control">
              <div
                class="preview-mode-strip"
                role="group"
                aria-label="切换拼豆预览样式"
                data-preview-mode-strip
              >
                ${renderPreviewModeButtons()}
              </div>
              <p class="preview-mode-note" data-preview-mode-note aria-live="polite">
                模拟带中心孔的实体拼豆外观
              </p>
            </div>
          </div>

          <div class="preview-canvas-slot" data-preview-canvas-slot>
            <div class="preview-canvas-stack" data-preview-canvas-stack>
              <div class="preview-pattern-view" data-preview-pattern-view>
                <canvas
                  class="preview-canvas"
                  data-preview-canvas
                  role="img"
                  aria-label="当前拼豆预览"
                ></canvas>
                <p class="preview-empty-hint" data-preview-empty>正在读取图片…</p>
                <span class="preview-status-badge" data-preview-badge hidden
                  >正在更新拼豆预览…</span
                >
              </div>
              <div class="preview-original-view" data-preview-original-view hidden>
                <canvas
                  class="preview-canvas preview-original-canvas"
                  data-preview-original-canvas
                  role="img"
                  aria-label="与拼豆预览严格对齐的原图"
                ></canvas>
              </div>
              <div class="preview-adjust-view" data-preview-adjust-view hidden>
                <div class="crop-frame" data-crop-frame>
                  <canvas data-crop-canvas aria-label="待裁剪的图片"></canvas>
                  <div class="crop-mask" aria-hidden="true"></div>
                  <div
                    class="crop-selection"
                    data-crop-selection
                    data-crop-keyboard-target
                    aria-describedby="crop-keyboard-help"
                    aria-label="裁剪范围。使用方向键移动，按住 Alt 加方向键调整大小。"
                    role="group"
                    tabindex="0"
                  >
                    <span class="crop-handle crop-handle-nw" aria-hidden="true"></span>
                    <span class="crop-handle crop-handle-ne" aria-hidden="true"></span>
                    <span class="crop-handle crop-handle-sw" aria-hidden="true"></span>
                    <span class="crop-handle crop-handle-se" aria-hidden="true"></span>
                  </div>
                </div>
                <div class="crop-actions" aria-label="图片方向">
                  <button class="secondary-button" type="button" data-rotate-left>
                    <i class="ph ph-arrow-counter-clockwise" aria-hidden="true"></i>
                    向左旋转
                  </button>
                  <button class="secondary-button" type="button" data-rotate-right>
                    <i class="ph ph-arrow-clockwise" aria-hidden="true"></i>
                    向右旋转
                  </button>
                  <span data-image-summary></span>
                  <button class="primary-button" type="button" data-finish-source-adjust>
                    完成调整
                  </button>
                </div>
              </div>
              <div class="preview-mask-edit-view" data-preview-mask-edit-view hidden>
                <header class="mask-edit-header">
                  <button class="secondary-button" type="button" data-mask-edit-cancel>
                    <i class="ph ph-arrow-left" aria-hidden="true"></i>
                    取消
                  </button>
                  <div class="mask-edit-heading">
                    <strong data-mask-editor-title>去背景选区</strong>
                    <small>橙色区域将被去除</small>
                  </div>
                  <div class="mask-edit-header-actions">
                    <button
                      class="icon-button"
                      type="button"
                      data-mask-edit-undo
                      disabled
                      aria-label="撤销涂抹"
                    >
                      <i class="ph ph-arrow-u-up-left" aria-hidden="true"></i>
                    </button>
                    <button class="primary-button" type="button" data-mask-edit-apply>
                      完成去背景
                    </button>
                  </div>
                </header>
                <div class="mask-edit-stage">
                  <aside class="mask-edit-tools" aria-label="去背景工具">
                    <div class="mask-edit-tool-group" role="group" aria-label="笔刷模式">
                      <button
                        class="mask-edit-tool-button"
                        type="button"
                        data-mask-tool="remove"
                        aria-pressed="true"
                      >
                        <i class="ph ph-eraser" aria-hidden="true"></i>
                        <span>涂抹去除</span>
                      </button>
                      <button
                        class="mask-edit-tool-button"
                        type="button"
                        data-mask-tool="keep"
                        aria-pressed="false"
                      >
                        <i class="ph ph-paint-brush" aria-hidden="true"></i>
                        <span>涂抹恢复</span>
                      </button>
                    </div>
                    <label class="mask-brush-size-field">
                      <span>笔刷大小</span>
                      <input
                        type="range"
                        min="1"
                        max="100"
                        step="1"
                        value="20"
                        aria-label="笔刷大小"
                        data-mask-brush-size
                      />
                    </label>
                    <div
                      class="mask-highlight-control"
                      role="group"
                      aria-label="高亮颜色"
                      data-mask-highlight-control
                    >
                      <span class="mask-highlight-label">高亮</span>
                      ${renderHighlightSwatches()}
                      <label class="mask-highlight-custom" aria-label="自定义高亮颜色">
                        <input
                          type="color"
                          value="#E77B35"
                          aria-label="自定义高亮颜色"
                          data-mask-highlight-custom
                        />
                      </label>
                    </div>
                  </aside>
                  <div class="mask-edit-frame" data-mask-edit-frame>
                    <canvas
                      class="mask-edit-canvas"
                      data-mask-edit-canvas
                      role="img"
                      tabindex="0"
                      aria-label="去背景选区画布。使用笔刷调整选区，滚轮缩放，按住空格拖动画布。"
                    ></canvas>
                    <p
                      class="mask-edit-status"
                      data-mask-edit-status
                      role="status"
                      aria-live="polite"
                    ></p>
                  </div>
                  <div class="mask-edit-zoom" role="group" aria-label="画布缩放">
                    <button type="button" data-mask-zoom-out aria-label="缩小画布">
                      <i class="ph ph-minus" aria-hidden="true"></i>
                    </button>
                    <output data-mask-zoom-value aria-live="polite">100%</output>
                    <button type="button" data-mask-zoom-in aria-label="放大画布">
                      <i class="ph ph-plus" aria-hidden="true"></i>
                    </button>
                    <button type="button" data-mask-zoom-fit>
                      <i class="ph ph-arrows-out" aria-hidden="true"></i>
                      适应窗口
                    </button>
                    <button type="button" data-mask-zoom-actual>100%</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p class="preview-status" data-preview-status role="status" aria-live="polite"></p>
          <p class="preview-summary" data-preview-summary hidden></p>
          <div class="pattern-trust preview-trust" data-preview-trust hidden>
            <p data-preview-trust-summary></p>
            <p
              class="pattern-trust-verification"
              data-preview-trust-verification
              role="status"
              aria-live="polite"
            ></p>
          </div>
        </div>

        <aside
          class="preview-control-surface"
          data-preview-control-surface
          data-preview-sheet-state="peek"
          aria-label="预览设置"
        >
          <header class="preview-sheet-header" data-preview-sheet-drag-region>
            <button
              class="preview-sheet-toggle"
              type="button"
              data-preview-panel-toggle
              aria-controls="preview-settings-scroll"
              aria-expanded="false"
              aria-label="展开预览设置"
            >
              <span class="preview-sheet-handle" aria-hidden="true"></span>
              <span class="preview-sheet-heading">
                <strong>设置</strong>
                <small data-preview-sheet-summary>调整图案大小、颜色与风格</small>
              </span>
              <i class="ph ph-caret-up" aria-hidden="true"></i>
            </button>
          </header>
          <div
            id="preview-settings-scroll"
            class="preview-controls-scroll"
            data-preview-controls-scroll
            hidden
          >
            ${renderPreviewControlsPanel()}
          </div>
          ${renderPreviewActions()}
        </aside>
      </div>
    </section>
  `;
}

function renderPreviewModeButtons(): string {
  return PREVIEW_RENDER_MODES.map(
    ({ id, label }) => `
      <button
        class="preview-mode-button"
        type="button"
        data-preview-mode="${id}"
        aria-pressed="${String(id === DEFAULT_PREVIEW_RENDER_MODE)}"
      >
        ${label}
      </button>
    `,
  ).join('');
}

function renderHighlightSwatches(): string {
  return HIGHLIGHT_PRESETS.map(
    ({ id, label, hex }, index) => `
      <button
        class="mask-highlight-swatch"
        type="button"
        data-mask-highlight="${id}"
        data-mask-highlight-hex="${hex}"
        aria-pressed="${String(index === 0)}"
        aria-label="高亮颜色：${label}"
      >
        <span style="--swatch: ${hex}" aria-hidden="true"></span>
      </button>
    `,
  ).join('');
}

function renderPreviewControlsPanel(): string {
  return `
    <section class="settings-section customer-setting">
      <div class="section-heading">
        <div>
          <span class="step-number">1</span>
          <h2>图案大小</h2>
        </div>
      </div>
      <vaadin-radio-group
        class="preset-cards preset-cards-four"
        aria-label="选择图案大小"
        data-pattern-size-preset
      >
        ${renderPresetCard('pattern-size-preset', '29', '小巧', '长边 29 颗', false)}
        ${renderPresetCard('pattern-size-preset', '48', '推荐', '长边 48 颗', true)}
        ${renderPresetCard('pattern-size-preset', '72', '细致', '长边 72 颗', false)}
        ${renderPresetCard('pattern-size-preset', 'custom', '自定义', '输入宽和高', false)}
      </vaadin-radio-group>
      <div class="dimension-inputs" data-dimension-inputs hidden>
        <label>
          <span>宽（颗）</span>
          <input type="number" min="1" max="300" value="48" inputmode="numeric" data-columns />
        </label>
        <button
          class="aspect-lock is-active"
          type="button"
          aria-pressed="true"
          data-aspect-lock
          aria-label="保持图片比例"
        >
          <i class="ph ph-link" aria-hidden="true"></i>
        </button>
        <label>
          <span>高（颗）</span>
          <input type="number" min="1" max="300" value="48" inputmode="numeric" data-rows />
        </label>
      </div>
      <p class="preview-setting-live">
        <span data-grid-summary>48 × 48 颗</span>
        <span aria-hidden="true">·</span>
        <span data-physical-size data-size-summary>约 24.0 × 24.0 cm</span>
        <span aria-hidden="true">·</span>
        <span data-board-summary>约需 4 块拼板</span>
      </p>
    </section>

    <section class="settings-section customer-setting">
      <div class="section-heading">
        <div>
          <span class="step-number">2</span>
          <h2>颜色数量</h2>
        </div>
      </div>
      <vaadin-radio-group
        class="preset-cards preset-cards-four"
        aria-label="选择颜色数量"
        data-color-count-preset
      >
        ${renderPresetCard('color-count-preset', '12', '简单', '最多 12 色', false)}
        ${renderPresetCard('color-count-preset', '24', '推荐', '最多 24 色', true)}
        ${renderPresetCard('color-count-preset', '48', '细致', '最多 48 色', false)}
        ${renderPresetCard('color-count-preset', 'custom', '自定义', '自由选择', false)}
      </vaadin-radio-group>
      <label class="field-row maximum-colors-field" data-maximum-colors-field hidden>
        <span>
          <strong>最多使用颜色</strong>
          <small>范围 1 到当前可用颜色数</small>
        </span>
        <input
          type="number"
          min="1"
          max="221"
          value="24"
          inputmode="numeric"
          data-maximum-colors
        />
      </label>
      <p class="preview-setting-live" data-color-count-estimate>当前预计使用 24 色</p>
    </section>

    <section class="settings-section customer-setting">
      <div class="section-heading">
        <div>
          <span class="step-number">3</span>
          <h2>效果风格</h2>
        </div>
      </div>
      <vaadin-radio-group
        class="preset-cards preset-cards-two style-cards"
        aria-label="选择效果风格"
        data-visual-style-preset
      >
        ${renderPresetCard('visual-style-preset', 'clearBlocks', '清晰色块', '图标、卡通、简单图案', false)}
        ${renderPresetCard('visual-style-preset', 'natural', '自然还原', '人像、照片、插画', true)}
        ${renderPresetCard('visual-style-preset', 'vivid', '鲜艳突出', '颜色偏灰或主体不突出', false)}
        ${renderPresetCard('visual-style-preset', 'smoothGradient', '细腻渐变', '渐变更自然，制作难度更高', false)}
      </vaadin-radio-group>
      <p class="custom-style-state" data-visual-style-custom hidden>
        <strong>自定义</strong>
        <span>当前取色、过渡或增强组合与预设不一致</span>
      </p>
    </section>

    <section class="settings-section customer-setting">
      <div class="section-heading">
        <div>
          <span class="step-number">4</span>
          <h2>拼豆品牌</h2>
        </div>
      </div>
      <div class="short-choice-field">
        <span>
          <strong>色板</strong>
          <small data-palette-availability>已选 221 色可用</small>
        </span>
        <vaadin-select
          class="short-choice-control"
          data-palette-id
          aria-label="选择拼豆品牌"
          value="mard"
        ></vaadin-select>
      </div>
    </section>

    <details class="advanced-settings" data-professional-settings>
      <summary>
        <span>
          <strong>专业设置</strong>
          <small>处理方式、拼豆规格、拼板和精细参数</small>
        </span>
        <i class="ph ph-caret-down" aria-hidden="true"></i>
      </summary>
      <div class="advanced-settings-content">
        <vaadin-radio-group
          class="mode-preference"
          label="图片处理方式"
          data-mode-preference
        >
          <vaadin-radio-button value="auto" checked>
            <label slot="label">
            <span>自动推荐<small>根据图片格式和颜色给出建议</small></span>
            </label>
          </vaadin-radio-button>
          <vaadin-radio-button value="photo">
            <label slot="label">
            <span>自然图片<small>适合照片与插画</small></span>
            </label>
          </vaadin-radio-button>
          <vaadin-radio-button value="pixelArt">
            <label slot="label">
            <span>清晰像素<small>保留明确的像素边缘</small></span>
            </label>
          </vaadin-radio-button>
        </vaadin-radio-group>
        <p
          class="recommendation-status"
          role="status"
          aria-live="polite"
          data-mode-recommendation
        >正在分析图片并准备建议…</p>

        <vaadin-radio-group
          class="sampling-options"
          label="格子取色方式"
          data-sampling
        >
          <vaadin-radio-button value="average" checked>
            <label slot="label">
              <span>平均取色<small>自然图片更平滑</small></span>
            </label>
          </vaadin-radio-button>
          <vaadin-radio-button value="nearest">
            <label slot="label">
              <span>保留像素<small>清晰像素更锐利</small></span>
            </label>
          </vaadin-radio-button>
        </vaadin-radio-group>

        <div class="short-choice-field">
          <span>
            <strong>颜色接近方式</strong>
            <small>与“效果风格”保持同步</small>
          </span>
          <vaadin-select
            class="short-choice-control"
            data-dithering
            aria-label="选择颜色接近方式"
            value="none"
          ></vaadin-select>
        </div>

        <label class="field-row transparency-control">
          <span>
            <strong>透明区域</strong>
            <small id="alpha-threshold-help" data-alpha-threshold-description>
              推荐：保留主体，同时去除轻微透明边缘
            </small>
          </span>
          <span class="range-control">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value="0.1"
              aria-describedby="alpha-threshold-help"
              data-alpha-threshold
            />
            <span class="range-labels" aria-hidden="true">
              <span>低</span>
              <strong data-alpha-threshold-label>推荐</strong>
              <span>高</span>
            </span>
          </span>
        </label>

        <div class="short-choice-field bead-size-field">
          <span>
            <strong>拼豆规格</strong>
            <small>影响预计成品尺寸</small>
          </span>
          <vaadin-radio-group
            class="preset-cards preset-cards-three"
            aria-label="选择拼豆规格"
            data-bead-size-preset
          >
            ${renderPresetCard('bead-size-preset', '5', '常规', '5 mm', true)}
            ${renderPresetCard('bead-size-preset', '2.6', '迷你', '2.6 mm', false)}
            ${renderPresetCard('bead-size-preset', 'custom', '自定义', '按实际尺寸', false)}
          </vaadin-radio-group>
        </div>
        <fieldset class="custom-bead-fields" data-custom-bead-fields hidden disabled>
          <legend>自定义拼豆尺寸</legend>
          <label class="field-row">
            <span>
              <strong>单颗拼豆直径</strong>
              <small>用于估算成品大小</small>
            </span>
            <input
              type="number"
              min="1"
              max="10"
              step="0.1"
              value="5"
              inputmode="decimal"
              data-bead-diameter
            />
          </label>
          <label class="field-row">
            <span>
              <strong>相邻拼豆间距</strong>
              <small>不能小于单颗直径</small>
            </span>
            <input
              type="number"
              min="1"
              max="12"
              step="0.1"
              value="5"
              inputmode="decimal"
              data-bead-pitch
            />
          </label>
        </fieldset>

        <div class="short-choice-field">
          <span>
            <strong>拼板</strong>
            <small>默认 29 × 29 标准方板</small>
          </span>
          <vaadin-select
            class="short-choice-control"
            data-board-preset
            aria-label="选择拼板"
            value="standardSquare"
          ></vaadin-select>
        </div>
        <fieldset class="custom-board-fields" data-custom-board-fields hidden disabled>
          <legend>自定义拼板格数</legend>
          <label>
            <span>每块列数</span>
            <input
              type="number"
              min="1"
              max="300"
              value="29"
              inputmode="numeric"
              aria-describedby="custom-board-help"
              data-custom-board-columns
            />
          </label>
          <label>
            <span>每块行数</span>
            <input
              type="number"
              min="1"
              max="300"
              value="29"
              inputmode="numeric"
              aria-describedby="custom-board-help"
              data-custom-board-rows
            />
          </label>
          <small id="custom-board-help">按实际拼板孔位填写，材料估算会按行列分板。</small>
        </fieldset>

        <vaadin-button
          class="available-color-trigger"
          theme="secondary"
          data-open-available-colors
        >
          选择手边有的颜色
        </vaadin-button>
        <template data-available-color-dialog-template>
          <section
            class="available-color-filter available-color-dialog-content"
            data-available-color-filter
          >
            <div class="available-color-filter-heading">
              <span>
                <strong>选择可用色号</strong>
                <small data-available-color-summary>已选择 221 色</small>
              </span>
              <div>
                <vaadin-button theme="tertiary" data-select-all-colors>全部选中</vaadin-button>
                <vaadin-button theme="tertiary" data-clear-all-colors>清除选择</vaadin-button>
              </div>
            </div>
            <p>取消没有的色号，生成时就不会使用它。</p>
            <div class="available-color-controls" role="search" aria-label="筛选可用颜色">
              <vaadin-text-field
                label="搜索色号或名称"
                placeholder="例如 A14、海蓝"
                clear-button-visible
                data-available-color-search
              ></vaadin-text-field>
              <vaadin-select
                label="系列"
                data-available-color-series
                value="__all__"
              ></vaadin-select>
            </div>
            <div
              class="available-color-grid"
              role="group"
              data-available-color-grid
              aria-label="选择手边有的拼豆颜色"
            ></div>
            <div class="available-color-dialog-footer">
              <p
                class="color-filter-status"
                role="status"
                aria-live="polite"
                data-available-color-filter-status
              ></p>
              <vaadin-button theme="primary" data-close-available-colors>完成</vaadin-button>
            </div>
          </section>
        </template>

        <fieldset class="crop-numeric-controls" data-crop-numeric-controls>
          <legend>裁剪位置与大小（%）</legend>
          <label>
            <span>左侧</span>
            <input
              type="number"
              min="0"
              max="92"
              step="0.1"
              value="0"
              inputmode="decimal"
              aria-describedby="crop-keyboard-help"
              data-crop-x
            />
          </label>
          <label>
            <span>顶部</span>
            <input
              type="number"
              min="0"
              max="92"
              step="0.1"
              value="0"
              inputmode="decimal"
              aria-describedby="crop-keyboard-help"
              data-crop-y
            />
          </label>
          <label>
            <span>宽度</span>
            <input
              type="number"
              min="8"
              max="100"
              step="0.1"
              value="100"
              inputmode="decimal"
              aria-describedby="crop-keyboard-help"
              data-crop-width
            />
          </label>
          <label>
            <span>高度</span>
            <input
              type="number"
              min="8"
              max="100"
              step="0.1"
              value="100"
              inputmode="decimal"
              aria-describedby="crop-keyboard-help"
              data-crop-height
            />
          </label>
        </fieldset>
        <p id="crop-keyboard-help" class="control-help">
          聚焦裁剪框后，用方向键移动；按住 Shift 每次移动 5%；按住 Option / Alt 加方向键调整宽高。
        </p>
      </div>
    </details>

  `;
}

function renderPreviewActions(): string {
  return `
    <div class="preview-action-dock">
      <div class="preview-completion-actions">
        <button class="secondary-button" type="button" data-return-editor hidden>
          返回图纸
        </button>
        <button
          class="primary-button preview-primary"
          type="button"
          data-edit-pattern
          disabled
        >
          <span>编辑图纸</span>
          <i class="ph ph-arrow-right" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  `;
}

function renderPresetCard(
  name: string,
  value: string,
  title: string,
  description: string,
  checked: boolean,
): string {
  return `
    <vaadin-radio-button
      class="preset-card"
      theme="card"
      data-choice-group="${name}"
      value="${value}"
      ${checked ? 'checked' : ''}
    >
      <label class="preset-card-content" slot="label">
        <span><strong>${title}</strong><small>${description}</small></span>
        <i class="ph ph-check" aria-hidden="true"></i>
      </label>
    </vaadin-radio-button>
  `;
}
