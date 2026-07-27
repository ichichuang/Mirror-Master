import { ACCEPTED_IMAGE_ACCEPT } from './features/local-image-input/types';
import { brandConfig } from './brand/brand.config';
import { EXPORT_TASKS, type ExportTaskDefinition } from './features/export-completion/exportState';
import { FIRST_USE_HINT_MESSAGE } from './features/pattern-editor/firstUseHint';

export function renderApp(): string {
  return `
    <a class="skip-link" href="#main-workspace">跳到主要工作区</a>
    <div class="app-shell" data-app-shell data-stage="upload">
      <header class="app-header">
        <div class="brand-lockup">
          <span class="brand-mark" aria-hidden="true">${brandConfig.shortName.slice(0, 1)}</span>
          <div>
            <strong>${brandConfig.productName}</strong>
            <span data-header-context>创建拼豆图纸</span>
          </div>
        </div>
        <div class="header-actions">
          <span class="session-status" data-session-status>仅保存在本次会话</span>
          <button class="icon-button" type="button" data-replace-image hidden aria-label="更换图片">
            <i class="ph ph-arrow-counter-clockwise" aria-hidden="true"></i>
          </button>
        </div>
      </header>

      <main id="main-workspace" class="main-workspace" tabindex="-1">
        <input
          class="visually-hidden"
          id="image-file-input"
          type="file"
          accept="${ACCEPTED_IMAGE_ACCEPT}"
          data-file-input
        />
        <input
          class="visually-hidden"
          id="project-file-input"
          type="file"
          accept="application/json,.json"
          data-project-file-input
        />

        ${renderUploadWorkspace()}
        ${renderPrepareWorkspace()}
        ${renderPatternWorkspace()}
        ${renderChartWorkspace()}
      </main>

      ${renderConfirmationSurface()}
      <div class="app-overlay-root" data-overlay-root></div>
      <p
        class="app-live visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-app-live
      ></p>
    </div>
  `;
}

function renderUploadWorkspace(): string {
  return `
    <section class="upload-workspace stage-panel" data-upload-workspace aria-labelledby="upload-title">
      <div class="upload-intro">
        <h1 id="upload-title">开始制作拼豆图纸</h1>
        <p>先选择要完成的事情，再上传一张图片。</p>
      </div>

      <div class="mode-selector task-selector" role="radiogroup" aria-label="制作任务">
        ${renderTaskOption(
          'newPattern',
          '制作新图纸',
          '上传照片、插画或像素图片，自动选择合适的处理方式',
          'ph-image-square',
          true,
        )}
        ${renderTaskOption(
          'mirrorExistingChart',
          '镜像已有图纸',
          '镜像拼豆格，保留坐标和图例',
          'ph-squares-four',
        )}
      </div>

      <label class="primary-upload" for="image-file-input" data-drop-zone>
        <i class="ph ph-upload-simple" aria-hidden="true"></i>
        <span>
          <strong>选择图片</strong>
          <small data-upload-constraints>PNG、JPEG 或 WebP，最大 20 MB</small>
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

      <p class="privacy-note">
        <i class="ph ph-shield-check" aria-hidden="true"></i>
        图片只在内存中处理，不会保存，也不会发送给第三方图片服务。
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

function renderTaskOption(
  value: string,
  title: string,
  description: string,
  icon: string,
  checked = false,
): string {
  return `
    <label class="mode-option">
      <input type="radio" name="customer-task" value="${value}" ${checked ? 'checked' : ''} />
      <span class="mode-icon" aria-hidden="true"><i class="ph ${icon}"></i></span>
      <span>
        <strong>${title}</strong>
        <small>${description}</small>
      </span>
      <i class="ph ph-check mode-check" aria-hidden="true"></i>
    </label>
  `;
}

function renderPrepareWorkspace(): string {
  return `
    <section class="prepare-workspace stage-panel" data-prepare-workspace hidden aria-labelledby="prepare-title">
      <div class="prepare-layout">
        <div class="crop-column">
          <div class="stage-heading">
            <div>
              <span class="eyebrow">制作新图纸</span>
              <h1 id="prepare-title">裁剪并设置图案</h1>
            </div>
            <button class="text-button" type="button" data-prepare-replace>更换图片</button>
          </div>

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
          </div>
        </div>

        <aside
          class="prepare-settings"
          aria-label="生成设置"
          data-prepare-picker-surface
        >
          <div data-prepare-settings-panel>
            <section class="settings-section customer-setting">
              <div class="section-heading">
                <div>
                  <span class="step-number">1</span>
                  <h2>图案大小</h2>
                </div>
              </div>
              <fieldset class="preset-cards preset-cards-three">
                <legend class="visually-hidden">选择图案大小</legend>
                ${renderPresetCard('pattern-size-preset', '29', '小巧', '长边 29 颗', false)}
                ${renderPresetCard('pattern-size-preset', '48', '推荐', '长边 48 颗', true)}
                ${renderPresetCard('pattern-size-preset', '72', '细致', '长边 72 颗', false)}
              </fieldset>
              <div class="dimension-inputs">
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
              <p class="custom-pattern-size-state" data-pattern-size-custom hidden>
                <strong>自定义</strong>
                <span data-custom-pattern-size>48 × 48 颗</span>
              </p>
              <div class="physical-size-summary">
                <span>预计成品尺寸</span>
                <strong data-physical-size data-size-summary>约 24.0 × 24.0 cm</strong>
              </div>
            </section>

            <section class="settings-section customer-setting">
              <div class="section-heading">
                <div>
                  <span class="step-number">2</span>
                  <h2>拼豆规格</h2>
                </div>
              </div>
              <fieldset class="preset-cards preset-cards-three">
                <legend class="visually-hidden">选择拼豆规格</legend>
                ${renderPresetCard('bead-size-preset', '5', '常规', '5 mm', true)}
                ${renderPresetCard('bead-size-preset', '2.6', '迷你', '2.6 mm', false)}
                ${renderPresetCard('bead-size-preset', 'custom', '自定义', '按实际尺寸', false)}
              </fieldset>
            </section>

            <section class="settings-section customer-setting">
              <div class="section-heading">
                <div>
                  <span class="step-number">3</span>
                  <h2>色板与颜色细节</h2>
                </div>
              </div>
              <div class="field-row">
                <span>
                  <strong>色板</strong>
                  <small>按手边可用的拼豆选择</small>
                </span>
                ${renderSelectTrigger('data-palette-id', 'mard', 'MARD · 221 色', '选择色板')}
              </div>
              <fieldset class="preset-cards preset-cards-three">
                <legend class="visually-hidden">选择颜色细节</legend>
                ${renderPresetCard('color-count-preset', '12', '简单', '最多 12 色', false)}
                ${renderPresetCard('color-count-preset', '24', '推荐', '最多 24 色', true)}
                ${renderPresetCard('color-count-preset', '48', '细致', '最多 48 色', false)}
              </fieldset>
            </section>

            <section class="settings-section customer-setting">
              <div class="section-heading">
                <div>
                  <span class="step-number">4</span>
                  <h2>制作方式</h2>
                </div>
              </div>
              <fieldset class="preset-cards preset-cards-two processing-cards">
                <legend class="visually-hidden">选择制作方式</legend>
                ${renderPresetCard('processing-preset', 'easy', '容易制作', '色块清楚，备料更直接', true)}
                ${renderPresetCard(
                  'processing-preset',
                  'gradient',
                  '模拟渐变',
                  '用相邻颜色交错表现过渡',
                  false,
                )}
              </fieldset>
            </section>

            <details class="advanced-settings" data-professional-settings>
            <summary>
              <span>
                  <strong>专业设置</strong>
                  <small>处理方式、拼板和精细参数</small>
              </span>
              <i class="ph ph-caret-down" aria-hidden="true"></i>
            </summary>
            <div class="advanced-settings-content">
                <fieldset class="mode-preference">
                  <legend>图片处理方式</legend>
                  <label>
                    <input
                      type="radio"
                      name="mode-preference"
                      value="auto"
                      data-mode-preference="auto"
                      checked
                    />
                    <span>自动推荐<small>根据图片格式和颜色给出建议</small></span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="mode-preference"
                      value="photo"
                      data-mode-preference="photo"
                    />
                    <span>自然图片<small>适合照片与插画</small></span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="mode-preference"
                      value="pixelArt"
                      data-mode-preference="pixelArt"
                    />
                    <span>清晰像素<small>保留明确的像素边缘</small></span>
                  </label>
                </fieldset>
                <p
                  class="recommendation-status"
                  role="status"
                  aria-live="polite"
                  data-mode-recommendation
                >正在分析图片并准备建议…</p>

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

                <div class="field-row">
                  <span>
                    <strong>拼板</strong>
                    <small data-board-summary>约需 4 块拼板</small>
                  </span>
                  ${renderSelectTrigger(
                    'data-board-preset',
                    'standardSquare',
                    '29 × 29 标准方板',
                    '选择拼板',
                  )}
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

                <label class="field-row">
                  <span>
                    <strong>最多使用颜色</strong>
                    <small>与上方“颜色细节”保持同步</small>
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

                <button
                  class="secondary-button available-color-mobile-trigger"
                  type="button"
                  data-open-available-colors
                >
                  选择手边有的颜色
                  <i class="ph ph-caret-right" aria-hidden="true"></i>
                </button>
                <section class="available-color-filter" data-available-color-filter>
                  <div class="available-color-filter-heading">
                    <span>
                      <strong>手边有的颜色</strong>
                      <small data-available-color-summary>已选择 221 色</small>
                    </span>
                    <div>
                      <button class="text-button" type="button" data-select-all-colors>全部选中</button>
                      <button class="text-button" type="button" data-clear-all-colors>清除选择</button>
                    </div>
                  </div>
                  <p>取消没有的色号，生成时就不会使用它。</p>
                  <div class="available-color-controls" role="search" aria-label="筛选可用颜色">
                    <label>
                      <span>搜索色号或名称</span>
                      <input
                        type="search"
                        autocomplete="off"
                        placeholder="例如 A14、海蓝"
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded="true"
                        aria-controls="available-color-listbox"
                        aria-describedby="available-color-filter-status"
                        data-available-color-search
                      />
                    </label>
                    <div class="selector-field">
                      <span>系列</span>
                      ${renderSelectTrigger(
                        'data-available-color-series',
                        '',
                        '全部系列',
                        '筛选颜色系列',
                      )}
                    </div>
                  </div>
                  <div
                    id="available-color-listbox"
                    class="available-color-grid"
                    role="listbox"
                    aria-multiselectable="true"
                    data-available-color-grid
                    aria-label="选择手边有的拼豆颜色"
                  ></div>
                  <p
                    id="available-color-filter-status"
                    class="color-filter-status"
                    role="status"
                    aria-live="polite"
                    data-available-color-filter-status
                  ></p>
                </section>

              <fieldset class="sampling-options">
                  <legend>格子取色方式</legend>
                <label>
                  <input type="radio" name="sampling" value="average" checked />
                    <span>平均取色<small>自然图片更平滑</small></span>
                </label>
                <label>
                  <input type="radio" name="sampling" value="nearest" />
                    <span>保留像素<small>清晰像素更锐利</small></span>
                </label>
              </fieldset>

                <div class="field-row">
                <span>
                    <strong>颜色接近方式</strong>
                    <small>与上方“制作方式”保持同步</small>
                </span>
                  ${renderSelectTrigger('data-dithering', 'none', '干净色块', '选择颜色接近方式')}
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
            </div>
          </details>

          <div class="prepare-action-dock">
            <div class="prepare-completion-actions">
              <button class="secondary-button" type="button" data-return-editor hidden>
                返回编辑
              </button>
              <button
                class="primary-button prepare-primary"
                type="button"
                data-generate-pattern
                data-regenerate-pattern
              >
                <span data-generate-label>生成图纸</span>
                <i class="ph ph-arrow-right" aria-hidden="true"></i>
              </button>
            </div>
            <p class="inline-status" data-generate-status role="status"></p>
          </div>
          </div>
        </aside>
      </div>
    </section>
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
    <label class="preset-card">
      <input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''} />
      <span><strong>${title}</strong><small>${description}</small></span>
      <i class="ph ph-check" aria-hidden="true"></i>
    </label>
  `;
}

function renderSelectTrigger(
  dataAttribute: string,
  value: string,
  label: string,
  accessibleLabel: string,
): string {
  return `
    <button
      class="ui-select-trigger"
      type="button"
      ${dataAttribute}
      data-value="${value}"
      aria-label="${accessibleLabel}"
    >
      <span data-select-label>${label}</span>
      <i class="ph ph-caret-down" aria-hidden="true"></i>
    </button>
  `;
}

function renderPatternWorkspace(): string {
  return `
    <section class="pattern-workspace stage-panel" data-pattern-workspace hidden aria-label="拼豆图案编辑器">
      <nav class="tool-rail" aria-label="编辑工具" data-tool-rail>
        ${renderToolButton('paint', '画笔', 'ph-pencil-simple', true)}
        ${renderToolButton('erase', '橡皮', 'ph-eraser')}
        ${renderToolButton('eyedropper', '吸管', 'ph-eyedropper')}
        ${renderToolButton('fill', '填充', 'ph-paint-bucket')}
        ${renderToolButton('select', '选择', 'ph-selection')}
      </nav>

      <div class="canvas-workspace">
        <div class="canvas-toolbar">
          <div class="view-switch" role="group" aria-label="图案视图">
            <button type="button" class="is-active" aria-pressed="true" data-front-view>正面</button>
            <button type="button" aria-pressed="false" data-reverse-view>反面</button>
          </div>
          <div class="canvas-toolbar-group" aria-label="编辑历史">
            <button class="icon-button" type="button" data-undo disabled aria-label="撤销">
              <i class="ph ph-arrow-u-up-left" aria-hidden="true"></i>
            </button>
            <button class="icon-button" type="button" data-redo disabled aria-label="重做">
              <i class="ph ph-arrow-u-up-right" aria-hidden="true"></i>
            </button>
          </div>
          <div class="canvas-toolbar-group zoom-group" aria-label="画布缩放">
            <button class="icon-button" type="button" data-zoom-out aria-label="缩小">
              <i class="ph ph-minus" aria-hidden="true"></i>
            </button>
            <button class="text-button" type="button" data-zoom-fit data-canvas-zoom-fit>
              适合窗口
            </button>
            <button
              class="icon-button"
              type="button"
              data-canvas-zoom-actual
              aria-label="以 100% 显示画布"
            >
              <i class="ph ph-number-circle-one" aria-hidden="true"></i>
            </button>
            <button class="icon-button" type="button" data-zoom-in aria-label="放大">
              <i class="ph ph-plus" aria-hidden="true"></i>
            </button>
          </div>
          <button
            class="text-button canvas-jump-toggle"
            type="button"
            data-toggle-canvas-jump
            aria-expanded="false"
            aria-controls="canvas-jump-panel"
          >
            <i class="ph ph-crosshair" aria-hidden="true"></i>
            <span>定位格子</span>
          </button>
        </div>
        <div class="first-use-hint" data-first-use-hint role="status" hidden>
          <i class="ph ph-hand-pointing" aria-hidden="true"></i>
          <span>${FIRST_USE_HINT_MESSAGE}</span>
          <button
            class="icon-button"
            type="button"
            data-dismiss-first-use-hint
            aria-label="关闭操作提示"
          >
            <i class="ph ph-x" aria-hidden="true"></i>
          </button>
        </div>
        <div class="pattern-canvas-frame">
          <form
            id="canvas-jump-panel"
            class="canvas-jump-form"
            data-canvas-jump-form
            aria-label="跳转到指定拼豆格"
            hidden
          >
            <label>
              <span>行</span>
              <input
                data-canvas-jump-row
                min="1"
                max="300"
                step="1"
                value="1"
                type="number"
                inputmode="numeric"
                aria-label="目标行"
              />
            </label>
            <label>
              <span>列</span>
              <input
                data-canvas-jump-column
                min="1"
                max="300"
                step="1"
                value="1"
                type="number"
                inputmode="numeric"
                aria-label="目标列"
              />
            </label>
            <button class="text-button" type="submit" data-canvas-jump-submit>
              跳转
            </button>
            <button class="text-button" type="button" data-canvas-jump-cancel>
              取消
            </button>
          </form>
          <div
            class="selection-context-bar"
            role="toolbar"
            aria-label="选中区域操作"
            data-selection-context
            hidden
          >
            <strong data-selection-description>已选 1 × 1</strong>
            <div class="selection-context-actions">
              <button type="button" data-selection-action="copy" aria-pressed="false">
                <i class="ph ph-squares-four" aria-hidden="true"></i>
                <span>复制</span>
              </button>
              <button type="button" data-selection-action="move" aria-pressed="false">
                <i class="ph ph-arrows-out-simple" aria-hidden="true"></i>
                <span>移动</span>
              </button>
              <button
                class="selection-destructive"
                type="button"
                data-selection-action="clear"
                data-clear-selection
              >
                <i class="ph ph-trash" aria-hidden="true"></i>
                <span>清空</span>
              </button>
              <button type="button" data-selection-action="cancel">
                <i class="ph ph-x" aria-hidden="true"></i>
                <span>取消</span>
              </button>
            </div>
          </div>
          <canvas
            class="pattern-canvas"
            data-pattern-canvas
            tabindex="0"
            aria-label="拼豆矩阵编辑画布。使用方向键移动，空格键应用当前工具；也可使用画布上方的行列输入跳转。"
          ></canvas>
        </div>
      </div>

      <aside class="workspace-inspector" data-workspace-inspector>
        ${renderInspectorTabs('desktop')}
        ${renderPaletteControls('desktop')}
        <div
          id="inspector-desktop-tabpanel"
          class="inspector-content"
          role="tabpanel"
          aria-labelledby="inspector-desktop-tab-tools"
          tabindex="0"
          data-inspector-content
          data-tabpanel-surface="desktop"
        ></div>
        <div class="inspector-primary">
          <div class="completion-actions">
            <button class="secondary-button" type="button" data-return-prepare>
              <i class="ph ph-arrow-counter-clockwise" aria-hidden="true"></i>
              调整设置
            </button>
            <button class="primary-button" type="button" data-open-export>
              <i class="ph ph-export" aria-hidden="true"></i>
              完成并导出
            </button>
          </div>
        </div>
        ${renderExportCompletionPanel('desktop')}
      </aside>

      <section class="workspace-sheet" data-workspace-sheet data-sheet-state="peek" aria-label="编辑控制面板">
        <header class="sheet-header" data-sheet-drag-region>
          <button class="sheet-handle" type="button" data-sheet-handle aria-label="展开控制面板">
            <span aria-hidden="true"></span>
          </button>
          <div class="sheet-peek-summary" data-sheet-peek-summary>
            <span class="sheet-peek-item">
              <i class="ph ph-pencil-simple" aria-hidden="true"></i>
              <span data-sheet-current-tool>画笔</span>
            </span>
            <span class="sheet-peek-item">
              <span
                class="sheet-summary-swatch"
                data-sheet-current-color-swatch
                aria-hidden="true"
              ></span>
              <strong data-sheet-current-color>MARD A1</strong>
            </span>
            <button class="text-button" type="button" data-sheet-open-tools>
              工具与颜色
            </button>
          </div>
        </header>
        ${renderInspectorTabs('mobile')}
        ${renderPaletteControls('mobile')}
        <div
          id="inspector-mobile-tabpanel"
          class="sheet-content"
          role="tabpanel"
          aria-labelledby="inspector-mobile-tab-tools"
          tabindex="0"
          data-sheet-content
          data-mobile-picker-panel
          data-tabpanel-surface="mobile"
        ></div>
        <div class="sheet-primary">
          <div class="completion-actions">
            <button class="secondary-button" type="button" data-return-prepare>
              <i class="ph ph-arrow-counter-clockwise" aria-hidden="true"></i>
              调整设置
            </button>
            <button class="primary-button" type="button" data-mobile-export>
              <i class="ph ph-export" aria-hidden="true"></i>
              完成并导出
            </button>
          </div>
        </div>
        ${renderExportCompletionPanel('mobile')}
      </section>
    </section>
  `;
}

function renderToolButton(tool: string, label: string, icon: string, active = false): string {
  return `
    <button
      class="tool-button ${active ? 'is-active' : ''}"
      type="button"
      data-tool="${tool}"
      aria-pressed="${active ? 'true' : 'false'}"
    >
      <i class="ph ${icon}" aria-hidden="true"></i>
      <span>${label}</span>
    </button>
  `;
}

function renderInspectorTabs(surface: 'desktop' | 'mobile'): string {
  const panelId = `inspector-${surface}-tabpanel`;
  return `
    <div
      class="inspector-tabs"
      id="inspector-${surface}-tabs"
      role="tablist"
      aria-label="图案信息"
      aria-orientation="horizontal"
      data-tab-surface="${surface}"
    >
      ${renderInspectorTab(surface, panelId, 'tools', '工具', true)}
      ${renderInspectorTab(surface, panelId, 'palette', '颜色')}
      ${renderInspectorTab(surface, panelId, 'materials', '材料')}
      ${renderInspectorTab(surface, panelId, 'settings', '设置')}
    </div>
  `;
}

function renderInspectorTab(
  surface: 'desktop' | 'mobile',
  panelId: string,
  panel: string,
  label: string,
  selected = false,
): string {
  return `
    <button
      id="inspector-${surface}-tab-${panel}"
      type="button"
      role="tab"
      aria-controls="${panelId}"
      aria-selected="${String(selected)}"
      tabindex="${selected ? '0' : '-1'}"
      data-panel-tab="${panel}"
      data-panel-id="${panelId}"
    >${label}</button>
  `;
}

function renderPaletteControls(surface: 'desktop' | 'mobile'): string {
  const searchId = `color-search-${surface}`;
  return `
    <div
      class="palette-controls"
      role="search"
      data-palette-controls="${surface}"
      aria-label="颜色筛选"
    >
      <label class="palette-search" for="${searchId}">
        <span>搜索色号或名称</span>
        <span class="search-input">
          <input
            id="${searchId}"
            type="search"
            autocomplete="off"
            placeholder="例如 A14、海蓝"
            aria-describedby="color-filter-status-${surface}"
            data-color-search
          />
        </span>
      </label>
      <fieldset class="palette-scope">
        <legend>显示颜色</legend>
        <label>
          <input type="radio" name="color-scope-${surface}" value="all" data-color-filter="all" checked />
          <span>全部</span>
        </label>
        <label>
          <input type="radio" name="color-scope-${surface}" value="used" data-color-filter="used" />
          <span>已使用</span>
        </label>
        <label>
          <input type="radio" name="color-scope-${surface}" value="recent" data-color-filter="recent" />
          <span>最近</span>
        </label>
      </fieldset>
      <label class="palette-series">
        <span>系列</span>
        ${renderSelectTrigger(
          'data-color-series-filter',
          '',
          '全部系列',
          `筛选${surface === 'desktop' ? '桌面' : '移动端'}颜色系列`,
        )}
      </label>
      <p
        id="color-filter-status-${surface}"
        class="color-filter-status"
        role="status"
        aria-live="polite"
        data-color-filter-status
      ></p>
    </div>
  `;
}

function renderExportCompletionPanel(surface: 'desktop' | 'mobile'): string {
  return `
    <section
      class="export-completion"
      aria-labelledby="export-${surface}-title"
      data-export-completion
      data-export-surface="${surface}"
      hidden
    >
      <div class="export-heading">
        <div>
          <span class="eyebrow">完成当前图纸</span>
          <h2 id="export-${surface}-title">选择接下来要做的事</h2>
        </div>
        <button class="icon-button" type="button" data-close-export aria-label="返回编辑">
          <i class="ph ph-arrow-left" aria-hidden="true"></i>
        </button>
      </div>
      <p class="export-summary" data-export-summary>当前图纸已可分享、打印或继续保存。</p>
      <div class="export-task-grid" role="group" aria-label="导出任务">
        ${EXPORT_TASKS.map((task) => renderExportTask(task)).join('')}
      </div>
      <fieldset class="export-template-options" data-export-template-options>
        <legend>分享图片样式</legend>
        <label>
          <input
            type="radio"
            name="export-template-${surface}"
            value="pure"
            data-export-template="pure"
          />
          <span>纯图案<small>透明背景，只保留拼豆图案</small></span>
        </label>
        <label>
          <input
            type="radio"
            name="export-template-${surface}"
            value="annotated"
            data-export-template="annotated"
            checked
          />
          <span>带标注<small>包含网格、坐标和材料图例</small></span>
        </label>
      </fieldset>
      <button class="primary-button export-run" type="button" data-export-run>
        下载分享图片
      </button>
      <p class="inline-status" data-export-status role="status" aria-live="polite"></p>
    </section>
  `;
}

function renderExportTask(task: ExportTaskDefinition): string {
  return `
    <button
      class="export-task ${task.id === 'shareImage' ? 'is-active' : ''}"
      type="button"
      data-export-task="${task.id}"
      data-export-format="${task.format}"
      aria-pressed="${task.id === 'shareImage' ? 'true' : 'false'}"
    >
      <i class="ph ${exportTaskIcon(task.id)}" aria-hidden="true"></i>
      <span><strong>${task.label}</strong><small>${task.description}</small></span>
    </button>
  `;
}

function exportTaskIcon(task: ExportTaskDefinition['id']): string {
  if (task === 'shareImage') return 'ph-image-square';
  if (task === 'printMaking') return 'ph-file-pdf';
  if (task === 'materialsList') return 'ph-table';
  return 'ph-brackets-curly';
}

function renderChartWorkspace(): string {
  return `
    <section class="chart-workspace stage-panel" data-chart-workspace hidden aria-label="已有图纸智能镜像">
      <div class="chart-toolbar">
        <div>
          <span class="eyebrow">已有图纸</span>
          <h1>确认拼豆网格</h1>
          <p>只调整红色网格范围；网格外的坐标、标题和图例不会改变。</p>
        </div>
        <div class="chart-actions">
          <button class="secondary-button" type="button" data-chart-redetect>重新识别</button>
          <button class="secondary-button" type="button" data-chart-reset>重置选区</button>
        </div>
      </div>
      <div class="editor-chrome">
        <div class="view-tabs" role="tablist" aria-label="图纸视图" aria-orientation="horizontal">
          <button
            id="chart-tab-original"
            class="view-tab"
            type="button"
            role="tab"
            aria-controls="chart-view-tabpanel"
            aria-selected="true"
            tabindex="0"
            data-view-original
          >
            原图
          </button>
          <button
            id="chart-tab-result"
            class="view-tab"
            type="button"
            role="tab"
            aria-controls="chart-view-tabpanel"
            aria-selected="false"
            tabindex="-1"
            data-view-result
            disabled
          >
            镜像结果
          </button>
        </div>
        <p class="editor-hint" data-editor-hint>正在准备图片…</p>
        <div class="zoom-controls" aria-label="预览缩放">
          <button class="icon-button" type="button" data-zoom-fit aria-label="适合窗口">
            <i class="ph ph-arrows-out-simple" aria-hidden="true"></i>
          </button>
          <button class="icon-button" type="button" data-zoom-out aria-label="缩小">
            <i class="ph ph-minus" aria-hidden="true"></i>
          </button>
          <button class="icon-button" type="button" data-zoom-actual aria-label="实际大小">
            <i class="ph ph-number-circle-one" aria-hidden="true"></i>
          </button>
          <button class="icon-button" type="button" data-zoom-in aria-label="放大">
            <i class="ph ph-plus" aria-hidden="true"></i>
          </button>
          <span class="zoom-status" data-zoom-status>适合</span>
        </div>
      </div>
      <div
        id="chart-view-tabpanel"
        class="editor-frame"
        role="tabpanel"
        aria-labelledby="chart-tab-original"
        tabindex="0"
        data-editor-frame
      >
        <div class="editor-stage" data-editor-stage>
          <img class="editor-image" alt="" data-editor-image />
          <img class="result-image" alt="" data-editor-result hidden />
          <svg class="grid-overlay" data-editor-overlay aria-label="网格选区编辑区"></svg>
        </div>
      </div>
      <div class="chart-primary-bar">
        <div class="chart-axis" role="group" aria-label="镜像方向">
          <button type="button" class="is-active" aria-pressed="true" data-chart-axis="horizontal">
            左右镜像
          </button>
          <button type="button" aria-pressed="false" data-chart-axis="vertical">
            上下镜像
          </button>
        </div>
        <button class="secondary-button" type="button" data-return-adjust hidden>返回调整</button>
        <button class="primary-button" type="button" data-chart-generate disabled>
          智能镜像图纸
        </button>
        <button class="secondary-button" type="button" data-chart-download hidden disabled>
          下载镜像图纸
        </button>
      </div>
      <p class="visually-hidden" role="status" aria-live="polite" data-editor-live></p>
    </section>
  `;
}

function renderConfirmationSurface(): string {
  return `
    <section
      class="app-confirmation"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirmation-title"
      aria-describedby="confirmation-description"
      data-confirmation-surface
      hidden
    >
      <div
        class="confirmation-backdrop"
        data-confirmation-cancel
        aria-hidden="true"
      ></div>
      <div class="confirmation-panel">
        <div class="confirmation-heading">
          <span class="confirmation-icon" aria-hidden="true">
            <i class="ph ph-shield-check"></i>
          </span>
          <div>
            <span class="eyebrow">尚未保存的修改</span>
            <h2 id="confirmation-title" data-confirmation-title>要继续吗？</h2>
          </div>
        </div>
        <p id="confirmation-description" data-confirmation-description></p>
        <p class="inline-status" role="status" aria-live="polite" data-confirmation-status></p>
        <div class="confirmation-actions">
          <button class="secondary-button" type="button" data-confirmation-save>
            <i class="ph ph-export" aria-hidden="true"></i>
            先保存项目
          </button>
          <button class="danger-button" type="button" data-confirmation-continue>
            放弃修改并继续
          </button>
          <button class="text-button" type="button" data-confirmation-cancel>取消</button>
        </div>
      </div>
    </section>
  `;
}
