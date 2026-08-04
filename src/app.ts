import { ACCEPTED_IMAGE_ACCEPT } from './features/local-image-input/types';
import { brandConfig } from './brand/brand.config';
import { EXPORT_TASKS, type ExportTaskDefinition } from './features/export-completion/exportState';
import { PNG_EXPORT_PRESETS } from './features/export-completion/pngExportConfiguration';
import { FIRST_USE_HINT_MESSAGE } from './features/pattern-editor/firstUseHint';
import { renderPreviewWorkspace } from './features/preview-workspace/previewWorkspace';
import { renderStartWorkspace } from './features/start-workspace/startWorkspace';
import { renderXhsImportWorkspace } from './features/xhs-import/xhsImportWorkspace';

export function renderApp(): string {
  return `
    <a class="skip-link" href="#main-workspace">跳到主要工作区</a>
    <div class="app-shell" data-app-shell data-stage="start">
      <header class="app-header">
        <div class="brand-lockup">
          <span class="brand-mark" aria-hidden="true">${brandConfig.shortName.slice(0, 1)}</span>
          <div>
            <strong>${brandConfig.productName}</strong>
            <span data-header-context>${brandConfig.shortName}</span>
          </div>
        </div>
        <div class="header-actions">
          <span class="session-status" data-session-status>仅保存在本次会话</span>
          <button
            class="icon-button"
            type="button"
            data-replace-image
            data-chart-detection-lock
            hidden
            aria-label="更换图片"
          >
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
          data-chart-detection-lock
        />
        <input
          class="visually-hidden"
          id="project-file-input"
          type="file"
          accept="application/json,.json"
          data-project-file-input
          data-chart-detection-lock
        />

        ${renderStartWorkspace()}
        ${renderXhsImportWorkspace()}
        ${renderPreviewWorkspace()}
        ${renderPatternWorkspace()}
        ${renderChartWorkspace()}
      </main>

      <vaadin-dialog data-available-color-dialog theme="color-picker"></vaadin-dialog>
      <vaadin-confirm-dialog data-confirmation-dialog theme="destructive-confirmation"></vaadin-confirm-dialog>
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
            <button type="button" aria-pressed="false" data-reverse-view>查看反面</button>
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
        <div
          class="first-use-hint imported-project-notice"
          data-imported-project-notice
          role="status"
          hidden
        >
          <i class="ph ph-info" aria-hidden="true"></i>
          <span>
            此项目来自文件，不包含原始图片；你可以继续编辑和导出，如需重新生成请重新选择图片。
          </span>
          <button
            class="icon-button"
            type="button"
            data-dismiss-imported-project-notice
            aria-label="关闭项目来源说明"
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
        <section
          class="export-live-stage"
          data-export-preview-stage
          aria-labelledby="export-live-stage-title"
          hidden
        >
          <div class="export-live-heading">
            <div>
              <span class="eyebrow">最终导出效果</span>
              <h2 id="export-live-stage-title">图片实时预览</h2>
            </div>
            <span
              class="export-live-badge"
              data-export-preview-workspace-status
              role="status"
              aria-live="polite"
            >正在生成预览…</span>
          </div>
          <div class="export-preview-frame" data-export-preview-frame>
            <canvas
              data-export-preview-canvas="workspace"
              aria-label="最终导出的 PNG 图片实时预览"
            ></canvas>
          </div>
        </section>
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
              返回预览
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
          data-tabpanel-surface="mobile"
        ></div>
        <div class="sheet-primary">
          <div class="completion-actions">
            <button class="secondary-button" type="button" data-return-prepare>
              <i class="ph ph-arrow-counter-clockwise" aria-hidden="true"></i>
              返回预览
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
      <vaadin-text-field
        id="${searchId}"
        class="palette-search"
        label="搜索色号或名称"
        aria-label="搜索色号或名称"
        placeholder="例如 A14、海蓝"
        clear-button-visible
        data-color-search
      ></vaadin-text-field>
      <vaadin-radio-group
        class="palette-scope"
        aria-label="显示颜色"
        data-color-filter
      >
        <vaadin-radio-button value="all" checked>
          <label slot="label">全部</label>
        </vaadin-radio-button>
        <vaadin-radio-button value="used">
          <label slot="label">已使用</label>
        </vaadin-radio-button>
        <vaadin-radio-button value="recent">
          <label slot="label">最近</label>
        </vaadin-radio-button>
      </vaadin-radio-group>
      <vaadin-select
        class="palette-series"
        label="系列"
        data-color-series-filter
        aria-label="筛选${surface === 'desktop' ? '桌面' : '移动端'}颜色系列"
        value="__all__"
      ></vaadin-select>
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
      <div class="pattern-trust export-pattern-trust">
        <p class="export-summary" data-export-summary data-export-trust-summary>
          当前图纸已可分享、打印或继续保存。
        </p>
        <p
          class="pattern-trust-verification"
          data-export-trust-verification
          role="status"
          aria-live="polite"
        ></p>
      </div>
      <section class="export-mobile-preview" aria-label="最终导出图片实时预览">
        <div class="export-preview-caption">
          <strong>最终导出效果</strong>
          <span data-export-preview-status role="status" aria-live="polite">正在生成预览…</span>
        </div>
        <div class="export-preview-frame" data-export-preview-frame>
          <canvas
            data-export-preview-canvas="${surface}"
            aria-label="最终导出的 PNG 图片实时预览"
          ></canvas>
        </div>
      </section>
      <div class="export-task-grid" role="group" aria-label="导出任务">
        ${EXPORT_TASKS.map((task) => renderExportTask(task)).join('')}
      </div>
      <div class="export-png-controls" data-export-png-controls>
        <div class="export-config-heading">
          <div>
            <strong>图片样式</strong>
            <span data-export-preset-match>带标注</span>
          </div>
          <small>修改任一选项，预览会立即更新</small>
        </div>
        <vaadin-radio-group
          class="export-template-options export-preset-options"
          data-export-preset-options
          label="常用样式"
        >
          ${PNG_EXPORT_PRESETS.map(
            (preset) => `
              <vaadin-radio-button
                value="${preset.id}"
                data-export-preset="${preset.id}"
                ${preset.id === 'annotated' ? 'checked' : ''}
              >
                <label slot="label">
                  <span>${preset.label}<small>${preset.description}</small></span>
                </label>
              </vaadin-radio-button>
            `,
          ).join('')}
        </vaadin-radio-group>
        <div class="export-option-groups">
          <vaadin-radio-group
            class="export-compact-options"
            data-export-background-options
            label="背景"
          >
            <vaadin-radio-button value="transparent">
              <label slot="label">透明</label>
            </vaadin-radio-button>
            <vaadin-radio-button value="white" checked>
              <label slot="label">白色</label>
            </vaadin-radio-button>
          </vaadin-radio-group>
          <vaadin-radio-group
            class="export-compact-options"
            data-export-appearance-options
            label="豆粒外观"
          >
            <vaadin-radio-button value="bead" checked>
              <label slot="label">圆形豆粒</label>
            </vaadin-radio-button>
            <vaadin-radio-button value="solidSquare">
              <label slot="label">实心方格</label>
            </vaadin-radio-button>
            <vaadin-radio-button value="roundedSquare">
              <label slot="label">圆角方格</label>
            </vaadin-radio-button>
          </vaadin-radio-group>
        </div>
        <fieldset class="export-content-options">
          <legend>导出内容</legend>
          <vaadin-checkbox data-export-content-option="includeGrid" checked>
            <label slot="label">网格线</label>
          </vaadin-checkbox>
          <vaadin-checkbox data-export-content-option="includeCoordinates" checked>
            <label slot="label">行列坐标</label>
          </vaadin-checkbox>
          <vaadin-checkbox data-export-content-option="includeCellCodes">
            <label slot="label">格内色号</label>
          </vaadin-checkbox>
          <vaadin-checkbox data-export-content-option="includeStatistics" checked>
            <label slot="label">图纸统计</label>
          </vaadin-checkbox>
          <vaadin-checkbox data-export-content-option="includeMaterialCounts" checked>
            <label slot="label">材料数量</label>
          </vaadin-checkbox>
          <vaadin-checkbox data-export-content-option="includeColorLegend" checked>
            <label slot="label">色块图例</label>
          </vaadin-checkbox>
        </fieldset>
        <p class="export-configuration-summary" data-export-configuration-summary></p>
      </div>
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
    <section
      class="chart-workspace stage-panel"
      data-chart-workspace
      hidden
      aria-label="已有图纸智能镜像"
      aria-busy="false"
    >
      <div class="chart-toolbar">
        <div>
          <span class="eyebrow">已有图纸</span>
          <h1>确认拼豆网格</h1>
          <p>只调整红色网格范围；网格外的坐标、标题和图例不会改变。</p>
        </div>
        <div class="chart-actions">
          <button
            class="secondary-button"
            type="button"
            data-chart-redetect
            data-chart-detection-lock
          >
            重新识别
          </button>
          <button
            class="secondary-button"
            type="button"
            data-chart-reset
            data-chart-detection-lock
          >
            重置选区
          </button>
        </div>
      </div>
      <div class="chart-confirmation-summary" data-chart-confirmation>
        <div class="chart-confirmation-status">
          <strong data-chart-dimensions>尚未检测到有效网格</strong>
          <span data-chart-confidence data-state="insufficient">网格置信度：不足</span>
        </div>
        <div class="chart-candidate-controls" data-chart-candidates hidden>
          <button
            class="secondary-button"
            type="button"
            data-chart-candidate="previous"
            data-chart-detection-lock
            aria-label="查看上一个网格候选"
          >
            上一个
          </button>
          <span data-chart-candidate-status aria-live="polite"></span>
          <button
            class="secondary-button"
            type="button"
            data-chart-candidate="next"
            data-chart-detection-lock
            aria-label="查看下一个网格候选"
          >
            下一个
          </button>
        </div>
        <p data-chart-warning role="status" aria-live="polite" hidden></p>
        <form class="chart-dimension-form" data-chart-dimension-form>
          <label>
            <span>列数</span>
            <input
              type="number"
              data-chart-columns
              data-chart-detection-lock
              inputmode="numeric"
              min="2"
              max="300"
              step="1"
              disabled
            />
          </label>
          <label>
            <span>行数</span>
            <input
              type="number"
              data-chart-rows
              data-chart-detection-lock
              inputmode="numeric"
              min="2"
              max="300"
              step="1"
              disabled
            />
          </label>
          <button
            class="secondary-button"
            type="submit"
            data-chart-apply-dimensions
            data-chart-detection-lock
            disabled
          >
            修改行列数
          </button>
        </form>
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
      <div
        class="chart-detection-loading"
        data-chart-detection-loading
        hidden
        aria-hidden="true"
      >
        <div class="chart-detection-loading-card">
          <i class="ph ph-circle-notch spin" aria-hidden="true"></i>
          <strong>正在识别拼豆网格</strong>
          <span>请稍候，完成后即可继续调整。</span>
        </div>
      </div>
      <div class="chart-primary-bar">
        <div class="chart-axis" role="group" aria-label="镜像方向">
          <button
            type="button"
            class="is-active"
            aria-pressed="true"
            data-chart-axis="horizontal"
            data-chart-detection-lock
          >
            水平镜像
          </button>
          <button
            type="button"
            aria-pressed="false"
            data-chart-axis="vertical"
            data-chart-detection-lock
          >
            垂直镜像
          </button>
        </div>
        <button class="secondary-button" type="button" data-return-adjust hidden>返回调整</button>
        <button
          class="primary-button"
          type="button"
          data-chart-generate
          data-chart-detection-lock
          disabled
        >
          确认并镜像
        </button>
        <button
          class="secondary-button"
          type="button"
          data-chart-download
          data-chart-detection-lock
          hidden
          disabled
        >
          下载镜像图纸
        </button>
      </div>
      <p class="visually-hidden" role="status" aria-live="polite" data-editor-live></p>
    </section>
  `;
}
