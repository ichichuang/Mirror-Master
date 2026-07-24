import { ACCEPTED_IMAGE_ACCEPT } from './features/local-image-input/types';
import { brandConfig } from './brand/brand.config';

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

        ${renderUploadWorkspace()}
        ${renderPrepareWorkspace()}
        ${renderPatternWorkspace()}
        ${renderChartWorkspace()}
      </main>

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
        <span class="eyebrow">新建图纸</span>
        <h1 id="upload-title">从一张图片开始</h1>
        <p>选择图片类型，我们会给出合适的默认设置。</p>
      </div>

      <div class="mode-selector" role="radiogroup" aria-label="图片类型">
        ${renderModeOption('photo', '照片', '适合人物、宠物与插画', 'ph-image', true)}
        ${renderModeOption('pixelArt', '像素画', '保留清晰的像素边缘', 'ph-grid-nine')}
        ${renderModeOption(
          'existingChart',
          '已有图纸',
          '镜像拼豆格，保留坐标和图例',
          'ph-squares-four',
        )}
      </div>

      <label class="primary-upload" for="image-file-input" data-drop-zone>
        <i class="ph ph-upload-simple" aria-hidden="true"></i>
        <span>
          <strong>选择图片</strong>
          <small>PNG、JPEG 或 WebP，最大 20 MB</small>
        </span>
      </label>

      <p class="privacy-note">
        <i class="ph ph-shield-check" aria-hidden="true"></i>
        图片只在内存中处理，不会保存，也不会发送给第三方图片服务。
      </p>
      <p class="file-status" data-file-status role="status"></p>
    </section>
  `;
}

function renderModeOption(
  value: string,
  title: string,
  description: string,
  icon: string,
  checked = false,
): string {
  return `
    <label class="mode-option">
      <input type="radio" name="input-mode" value="${value}" ${checked ? 'checked' : ''} />
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
              <span class="eyebrow">准备图片</span>
              <h1 id="prepare-title">确定图案范围</h1>
            </div>
            <button class="text-button" type="button" data-prepare-replace>更换图片</button>
          </div>

          <div class="crop-frame" data-crop-frame>
            <canvas data-crop-canvas aria-label="待裁剪的图片"></canvas>
            <div class="crop-mask" aria-hidden="true"></div>
            <div class="crop-selection" data-crop-selection aria-hidden="true">
              <span class="crop-handle crop-handle-nw"></span>
              <span class="crop-handle crop-handle-ne"></span>
              <span class="crop-handle crop-handle-sw"></span>
              <span class="crop-handle crop-handle-se"></span>
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

        <aside class="prepare-settings" aria-label="生成设置">
          <div class="settings-section">
            <div class="section-heading">
              <div>
                <span class="step-number">1</span>
                <h2>图纸大小</h2>
              </div>
              <span data-size-summary></span>
            </div>
            <div class="dimension-inputs">
              <label>
                <span>列</span>
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
                <span>行</span>
                <input type="number" min="1" max="300" value="48" inputmode="numeric" data-rows />
              </label>
            </div>
            <label class="field-row">
              <span>
                <strong>拼板</strong>
                <small data-board-summary>约需 4 块拼板</small>
              </span>
              <select data-board-preset>
                <option value="standardSquare">29 × 29 标准方板</option>
                <option value="smallSquare">14 × 14 小方板</option>
                <option value="custom">自定义拼板</option>
              </select>
            </label>
          </div>

          <div class="settings-section">
            <div class="section-heading">
              <div>
                <span class="step-number">2</span>
                <h2>选择颜色</h2>
              </div>
            </div>
            <label class="field-row">
              <span>
                <strong>色板</strong>
                <small>按手边可用的拼豆选择</small>
              </span>
              <select data-palette-id>
                <option value="mard">MARD · 221 色</option>
                <option value="default">默认色板 · 39 色</option>
              </select>
            </label>
            <label class="field-row">
              <span>
                <strong>最多使用颜色</strong>
                <small>减少备料种类，更容易完成</small>
              </span>
              <input type="number" min="1" max="221" value="24" inputmode="numeric" data-maximum-colors />
            </label>
            <details class="available-color-filter" data-available-color-filter>
              <summary>
                <span>
                  <strong>手边有的颜色</strong>
                  <small data-available-color-summary>已选择 221 色</small>
                </span>
                <i class="ph ph-caret-down" aria-hidden="true"></i>
              </summary>
              <div class="available-color-filter-content">
                <div class="available-color-filter-heading">
                  <p>取消没有的色号，生成时就不会使用它。</p>
                  <button class="text-button" type="button" data-select-all-colors>全部选中</button>
                </div>
                <div
                  class="available-color-grid"
                  data-available-color-grid
                  aria-label="选择手边有的拼豆颜色"
                ></div>
              </div>
            </details>
          </div>

          <details class="advanced-settings" data-advanced-settings>
            <summary>
              <span>
                <strong>更多生成设置</strong>
                <small>默认设置适合大多数照片</small>
              </span>
              <i class="ph ph-caret-down" aria-hidden="true"></i>
            </summary>
            <div class="advanced-settings-content">
              <fieldset>
                <legend>格子取色方式</legend>
                <label>
                  <input type="radio" name="sampling" value="average" checked />
                  <span>平均取色<small>照片更自然</small></span>
                </label>
                <label>
                  <input type="radio" name="sampling" value="nearest" />
                  <span>保留像素<small>像素画更清晰</small></span>
                </label>
              </fieldset>
              <label class="field-row">
                <span>
                  <strong>颜色过渡</strong>
                  <small>关闭时色块更干净</small>
                </span>
                <select data-dithering>
                  <option value="none">干净色块</option>
                  <option value="floydSteinberg">细腻过渡</option>
                </select>
              </label>
              <label class="field-row">
                <span>
                  <strong>透明区域</strong>
                  <small>透明像素会保留为空格</small>
                </span>
                <input type="range" min="0" max="1" step="0.05" value="0.1" data-alpha-threshold />
              </label>
              <label class="field-row">
                <span>
                  <strong>单颗拼豆直径</strong>
                  <small>用于估算成品大小，常见为 5 mm</small>
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
                  <small>不能小于单颗直径，常见为 5 mm</small>
                </span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  step="0.1"
                  value="5"
                  inputmode="decimal"
                  data-bead-pitch
                />
              </label>
            </div>
          </details>

          <button class="primary-button prepare-primary" type="button" data-generate-pattern>
            <span>生成图纸</span>
            <i class="ph ph-arrow-right" aria-hidden="true"></i>
          </button>
          <p class="inline-status" data-generate-status role="status"></p>
        </aside>
      </div>
    </section>
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
            <button class="text-button" type="button" data-zoom-fit>适合窗口</button>
            <button class="icon-button" type="button" data-zoom-in aria-label="放大">
              <i class="ph ph-plus" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="pattern-canvas-frame">
          <canvas
            class="pattern-canvas"
            data-pattern-canvas
            tabindex="0"
            aria-label="拼豆矩阵编辑画布。使用方向键移动，空格键应用当前工具。"
          ></canvas>
        </div>
      </div>

      <aside class="workspace-inspector" data-workspace-inspector>
        ${renderInspectorTabs('desktop')}
        <div class="inspector-content" data-inspector-content></div>
        <div class="inspector-primary">
          <button class="primary-button" type="button" data-open-export>
            <i class="ph ph-export" aria-hidden="true"></i>
            完成并导出
          </button>
        </div>
      </aside>

      <section class="workspace-sheet" data-workspace-sheet data-sheet-state="peek" aria-label="编辑控制面板">
        <button class="sheet-handle" type="button" data-sheet-handle aria-label="展开控制面板">
          <span aria-hidden="true"></span>
        </button>
        ${renderInspectorTabs('mobile')}
        <div class="sheet-content" data-sheet-content></div>
        <div class="sheet-primary">
          <button class="primary-button" type="button" data-mobile-export>
            <i class="ph ph-export" aria-hidden="true"></i>
            完成并导出
          </button>
        </div>
      </section>

      <div class="export-popover" data-export-popover hidden>
        <div class="export-heading">
          <div>
            <span class="eyebrow">导出当前图纸</span>
            <h2>选择文件格式</h2>
          </div>
          <button class="icon-button" type="button" data-close-export aria-label="关闭导出选项">
            <i class="ph ph-x" aria-hidden="true"></i>
          </button>
        </div>
        <label class="export-grid-option">
          <input type="checkbox" checked data-export-grid />
          <span>包含网格、坐标和材料图例</span>
        </label>
        <div class="export-actions">
          ${renderExportButton('png', 'PNG 图纸', '适合查看与分享', 'ph-image-square')}
          ${renderExportButton('pdf', 'PDF 打印稿', '按页打印和分板', 'ph-file-pdf')}
          ${renderExportButton('csv', 'CSV 材料表', '颜色数量与逐格明细', 'ph-table')}
          ${renderExportButton('json', '项目 JSON', '以后继续编辑', 'ph-brackets-curly')}
        </div>
        <p class="inline-status" data-export-status role="status"></p>
      </div>
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
  return `
    <div class="inspector-tabs" role="tablist" aria-label="图案信息" data-tab-surface="${surface}">
      <button type="button" role="tab" aria-selected="true" data-panel-tab="tools">工具</button>
      <button type="button" role="tab" aria-selected="false" data-panel-tab="palette">颜色</button>
      <button type="button" role="tab" aria-selected="false" data-panel-tab="materials">材料</button>
      <button type="button" role="tab" aria-selected="false" data-panel-tab="settings">设置</button>
    </div>
  `;
}

function renderExportButton(
  format: string,
  title: string,
  description: string,
  icon: string,
): string {
  return `
    <button class="export-option" type="button" data-export-format="${format}">
      <i class="ph ${icon}" aria-hidden="true"></i>
      <span><strong>${title}</strong><small>${description}</small></span>
      <i class="ph ph-arrow-down" aria-hidden="true"></i>
    </button>
  `;
}

function renderChartWorkspace(): string {
  return `
    <section class="chart-workspace stage-panel" data-chart-workspace hidden aria-label="已有图纸智能镜像">
      <div class="chart-toolbar">
        <div>
          <span class="eyebrow">已有图纸</span>
          <h1>确认拼豆网格</h1>
        </div>
        <div class="chart-actions">
          <button class="secondary-button" type="button" data-chart-redetect>重新识别</button>
          <button class="secondary-button" type="button" data-chart-reset>重置选区</button>
        </div>
      </div>
      <div class="editor-chrome">
        <div class="view-tabs" role="tablist" aria-label="图纸视图">
          <button class="view-tab" type="button" role="tab" aria-selected="true" data-view-original>
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
      <div class="editor-frame" data-editor-frame>
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
          下载 PNG
        </button>
      </div>
      <p class="visually-hidden" role="status" aria-live="polite" data-editor-live></p>
    </section>
  `;
}
