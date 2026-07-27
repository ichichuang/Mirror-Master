# 方案 A：客户交互层系统重建实施计划

> 状态：已获 owner 批准，可直接实施
> 日期：2026-07-24
> 唯一规范来源：`docs/PRODUCT_SPEC.zh-CN.md` draft.4
> 说明：本文件只拆解实施与验证步骤，不新增产品规则；若与产品规范冲突，以产品规范为准。

## 实施约束

- 在当前 `main` 工作区实施，保留未提交 diff。
- 不创建分支或 worktree，不提交、不推送、不部署。
- 采用红—绿—重构：每个行为先写失败测试，确认失败原因正确，再实现最小代码并复测。
- 保留现有领域模型、API 客户端和 Canvas 渲染/手势引擎；只在明确接口处扩展。
- 不重新选择视觉方向，沿用已锁定的“暖白专业材料工作台”。
- 不使用 Playwright；浏览器验收使用 Codex 应用内浏览器。
- 不以 mock 替代产品主流程；浏览器 QA 使用真实本地前后端和真实图片文件。

## 目标架构

```text
app.ts：一次性挂载静态、持久的应用壳
  ├─ customer-flow：任务、自动推荐、预设映射
  ├─ ui-select：桌面浮层 / 移动端同层选择器 / 颜色组合框
  ├─ workspace-layout：响应式布局与单 WorkspaceSheet 状态
  ├─ workspace-panels：材料、颜色、工具、选择上下文的增量更新
  ├─ export-completion：同层导出与完成任务
  └─ main.ts：组合器、请求生命周期、项目边界

domain/*、pattern-api/*、grid-api/*：继续作为稳定契约
pattern-editor/*：保留 Canvas 引擎，仅扩展显式选择移动/复制模式
backend/app/pattern_export.py：输出客户可读中文文案
```

## Task 1：测试环境、任务模式、自动推荐与客户预设

### 文件

- 修改：`package.json`
- 修改：`pnpm-lock.yaml`
- 新增：`src/features/customer-flow/modeRecommendation.ts`
- 新增：`src/features/customer-flow/presets.ts`
- 新增：`tests/customer-mode.test.ts`
- 新增：`tests/customer-presets.test.ts`

### 1.1 先写自动推荐失败测试

`tests/customer-mode.test.ts` 覆盖：

- JPEG 直接推荐照片模式，不扫描颜色。
- PNG/WebP 只统计 `alpha > 0` 的唯一 RGBA。
- 唯一非透明颜色为 256 时推荐像素模式。
- 扫描发现第 257 个唯一颜色后立即停止并推荐照片模式。
- 完全透明像素不参与颜色数量。
- 自动推荐不写入用户偏好。
- 用户显式选择照片或像素后始终覆盖推荐。
- “镜像已有图纸”始终解析为 `existingChart`，不受推荐影响。

运行并确认因模块不存在或行为缺失而失败：

```bash
pnpm exec tsx --test tests/customer-mode.test.ts
```

### 1.2 实现自动推荐纯函数

导出稳定接口：

```ts
export type CustomerTask = 'newPattern' | 'mirrorExistingChart';
export type NewPatternMode = 'photo' | 'pixelArt';
export type ModePreference = 'auto' | NewPatternMode;

export function recommendProjectMode(
  mimeType: string,
  rgbaChunks: Iterable<ArrayLike<number>>,
): NewPatternMode;

export function resolveProjectMode(
  task: CustomerTask,
  preference: ModePreference,
  recommendation: NewPatternMode,
): 'photo' | 'pixelArt' | 'existingChart';
```

颜色键包含 RGBA；扫描在第 257 种非透明颜色处短路。JPEG 不遍历输入。通过后运行：

```bash
pnpm exec tsx --test tests/customer-mode.test.ts
```

### 1.3 先写预设映射失败测试

`tests/customer-presets.test.ts` 覆盖：

- “小巧 / 推荐 / 细致”图案预设严格映射到长边 29 / 48 / 72 颗。
- 根据当前裁剪区域的宽高比，以稳定四舍五入推导短边，并限制到 1–300。
- 与 29 / 48 / 72 不相等的尺寸被识别为自定义。
- 豆子尺寸预设为 5×5 mm、2.6×2.6 mm、自定义。
- “简单 / 推荐 / 细致”颜色预设严格映射到 12 / 24 / 48 色，并受当前可用颜色数上限约束。
- “容易制作”映射为无抖动；“模拟渐变”映射为 Floyd–Steinberg。
- 物理尺寸由棋盘颗数与豆子尺寸计算，不保存第二份可漂移状态。
- 手动修改任一 `columns/rows` 后立即标记为自定义，不偷偷吸附回预设。

运行并确认失败：

```bash
pnpm exec tsx --test tests/customer-presets.test.ts
```

### 1.4 实现预设纯函数

导出稳定接口：

```ts
export type PatternSizePreset = 29 | 48 | 72 | 'custom';
export type ColorCountPreset = 12 | 24 | 48 | 'custom';
export type BeadSizePreset = 5 | 2.6 | 'custom';
export type ProcessingPreset = 'easy' | 'gradient';

export function dimensionsForLongEdge(
  preset: Exclude<PatternSizePreset, 'custom'>,
  croppedColumns: number,
  croppedRows: number,
): { columns: number; rows: number };

export function resolveColorLimit(
  requested: Exclude<ColorCountPreset, 'custom'>,
  availableColorCount: number,
): number;
```

`columns` 对应横向格数、`rows` 对应纵向格数；长边按当前裁剪方向确定，正方形固定得到相同
`columns/rows`。短边使用 `Math.round` 后限制到 1–300。预设到内部
`maximumColors` / `dithering` 与内部值到当前选中卡片都使用同一组双向映射；实现
`resolvePatternSizePreset`、`resolveBeadSizePreset`、`resolveColorCountPreset` 与
`resolveProcessingPreset` 处理既有/导入项目的反解和自定义状态。

实现后运行：

```bash
pnpm exec tsx --test tests/customer-presets.test.ts
pnpm test
```

## Task 2：统一可访问选择器组件族

### 文件

- 新增：`src/features/ui-select/state.ts`
- 新增：`src/features/ui-select/position.ts`
- 新增：`src/features/ui-select/uiSelect.ts`
- 新增：`src/features/ui-select/colorCombobox.ts`
- 新增：`tests/ui-select-state.test.ts`
- 新增：`tests/ui-select-popover.test.ts`
- 新增：`tests/color-combobox.test.ts`
- 新增：`tests/mobile-picker.test.ts`
- 修改：`src/styles/base.css`
- 修改：`src/styles/page.css`

### 2.1 引入真实 DOM 测试环境

将 `happy-dom@20.11.0` 加入开发依赖。测试直接操作真实 DOM 节点、焦点、键盘事件和滚动事件，不手写 DOM mock。

### 2.2 先写状态机与 ARIA 失败测试

覆盖：

- `selectedIndex` 与临时 `activeIndex` 分离。
- 打开时活动项从已选项开始。
- ArrowUp/ArrowDown/Home/End 只移动活动项。
- Enter/Space 提交活动项。
- Escape 取消变更并恢复触发器焦点。
- Tab 关闭后沿自然焦点顺序离开，不截留焦点。
- 触发器使用 `aria-haspopup="listbox"`、`aria-expanded`、`aria-controls`。
- 列表使用 `role="listbox"`；选项使用 `role="option"` 和 `aria-selected`。
- 禁用项不能成为活动项或被提交。

运行并确认失败：

```bash
pnpm exec tsx --test tests/ui-select-state.test.ts tests/ui-select-popover.test.ts
```

### 2.3 实现桌面 UiSelect 浮层

- 浮层 portal 到应用级 overlay root。
- 使用 `position: fixed`，以 `getBoundingClientRect()` 锚定触发器。
- 最小宽度等于触发器宽度；水平与垂直方向都 clamp 到视口安全边距；下方空间不足时向上翻转。
- 打开时把 selected/active option 滚入可见区。
- 打开期间监听任意滚动祖先、document capture scroll、window resize，以及
  `visualViewport` resize/scroll；浏览器 zoom 后同样重定位，关闭时完整清理。
- option ID 在更新后保持稳定，触发器通过 `aria-activedescendant` 指向活动项。
- pointer 选择后恢复触发器焦点。
- 外部 pointerdown 关闭并保留自然焦点行为。
- 组件只更新现有节点，不通过 `innerHTML` 重建。

运行：

```bash
pnpm exec tsx --test tests/ui-select-state.test.ts tests/ui-select-popover.test.ts
```

### 2.4 先写颜色组合框与移动选择器失败测试

覆盖：

- 颜色搜索框使用 `role="combobox"`、`aria-autocomplete="list"`、`aria-activedescendant`。
- 输入法 composition 期间不提交选项。
- 键盘可浏览并选择过滤后的颜色。
- 组合框以 live status 宣告结果数量和无结果状态。
- 移动端不打开桌面浮层，而把同一组选项呈现在当前 `WorkspaceSheet` 内容区。
- 移动端提交或取消后回到原面板与原触发器。
- 选择器打开时页面上仍只有一个应用级 sheet。
- 移动 picker 将焦点限制在当前 picker，Escape/取消后恢复触发器。
- `visualViewport` 或软键盘变化后，搜索框、活动项和确认操作均保持可见。

运行并确认失败：

```bash
pnpm exec tsx --test tests/color-combobox.test.ts tests/mobile-picker.test.ts
```

实现并运行：

```bash
pnpm exec tsx --test tests/color-combobox.test.ts tests/mobile-picker.test.ts
pnpm test
```

## Task 3：上传与准备流程重建

### 文件

- 新增：`src/features/customer-flow/imageRecommendation.ts`
- 新增：`src/features/customer-flow/prepareState.ts`
- 修改：`src/app.ts`
- 修改：`src/main.ts`
- 修改：`src/features/local-image-input/imageDecoder.ts`
- 修改：`src/styles/page.css`
- 新增：`tests/image-recommendation.test.ts`
- 新增：`tests/prepare-state.test.ts`
- 修改：`tests/app-markup.test.ts`

### 3.1 先写上传任务与专业覆盖失败测试

`tests/app-markup.test.ts` 与 `tests/prepare-state.test.ts` 覆盖：

- 首屏主任务只有“制作新图纸”和“镜像已有图纸”。
- JSON 导入保持次级入口。
- 上传前不要求用户选择照片/像素。
- 新图上传后显示自动推荐结论与简短原因。
- “专业设置”默认折叠，包含自动/照片/像素三种偏好。
- 专业设置中的照片/像素始终可切换，不因推荐结果禁用。
- 应用运行时只持久保存用户偏好与最终解析模式，不把推荐写成锁定状态。

先运行并确认失败：

```bash
pnpm exec tsx --test tests/app-markup.test.ts tests/prepare-state.test.ts
```

### 3.2 实现分块图片分析

`imageRecommendation.ts` 只负责把同一次解码得到的图片资源通过小型离屏 Canvas 异步分块读取为
RGBA chunks，再调用 `modeRecommendation.ts` 的增量扫描器；阈值、JPEG 分支和最终模式决策只存在于
后者：

- JPEG 由策略层直接返回照片推荐。
- PNG/WebP 分块统计非透明 RGBA。
- 达到 257 个唯一颜色立即停止。
- 不创建与整张高分辨率图片等大的第二份 RGBA 缓冲。
- 每个有限批次后让出事件循环，并在 tile 前后检查 `AbortSignal` 和来源 token；换图、切任务或手动覆盖
  可取消扫描，取消必须向上传播，不能转成照片推荐。
- Canvas 读取失败时安全降级为照片推荐，并保留手动覆盖。
- 真实浏览器 adapter 使用 detached canvas 与
  `getContext('2d', { willReadFrequently: true })`，只在 tile 尺寸实际变化时调整 backing store。
- `PrepareState` 使用 `newPattern` / `mirrorExistingChart` 判别联合；镜像任务不携带虚假的照片偏好或推荐。

`imageDecoder.ts` 返回并复用已解码元素/资源与尺寸，不改变对象 URL 生命周期，也不为推荐重复解码。

运行：

```bash
pnpm exec tsx --test tests/image-recommendation.test.ts tests/customer-mode.test.ts
```

### 3.3 先写准备页默认层级失败测试

覆盖：

- 默认区显示图案尺寸卡、物理尺寸、豆子尺寸卡、色卡系列、颜色数量卡、处理方式卡、主生成按钮。
- 图案尺寸卡严格为“小巧 / 推荐 / 细致”，分别映射 29 / 48 / 72 颗。
- 豆子尺寸卡严格为 5 mm / 2.6 mm / 自定义。
- 颜色细节卡严格为“简单 / 推荐 / 细致”，分别映射 12 / 24 / 48 色。
- 制作方式卡严格为“容易制作 / 模拟渐变”。
- 色卡系列使用 UiSelect；页面不出现可见原生 `<select>`。
- 自定义宽高、可用颜色、采样、透明度、像素间距等只在一个“专业设置”中。
- 当前图案颗数、豆子尺寸或自定义值变化时，物理尺寸同步更新。

运行并确认失败：

```bash
pnpm exec tsx --test tests/app-markup.test.ts tests/prepare-state.test.ts
```

### 3.4 迁移准备页交互

- `app.ts` 只生成持久壳、稳定节点和无障碍语义。
- `main.ts` 组合 task、preference、recommendation、resolved mode 与现有 API 参数。
- 现有裁剪、色卡、生成、项目 JSON 导入能力继续工作。
- 所有客户可见状态不显示 revision/schema/内部 ID 术语。
- UiSelect 替换现有拼板预设、准备页色板、准备页可用颜色系列、抖动方式、编辑器颜色系列五个原生
  select；顾客主流程 DOM 中不存在原生 `<select>`，包括 visually-hidden 规避形式。

运行：

```bash
pnpm exec tsx --test tests/app-markup.test.ts tests/prepare-state.test.ts tests/customer-mode.test.ts tests/customer-presets.test.ts
pnpm test
```

## Task 4：持久化工作区、单 Sheet 与选择上下文

### 文件

- 新增：`src/features/workspace-layout/layout.ts`
- 新增：`src/features/workspace-panels/keyedList.ts`
- 新增：`src/features/workspace-panels/workspacePanels.ts`
- 修改：`src/features/mobile-sheet/sheetMath.ts`
- 修改：`src/features/pattern-editor/canvasEditor.ts`
- 修改：`src/features/pattern-editor/selection.ts`
- 修改：`src/app.ts`
- 修改：`src/main.ts`
- 修改：`src/styles/page.css`
- 新增：`tests/workspace-persistence.test.ts`
- 新增：`tests/responsive-layout.test.ts`
- 新增：`tests/selection-context.test.ts`
- 修改：`tests/mobile-sheet.test.ts`
- 修改：`tests/editor-canvas-controller.test.ts`

### 4.1 先写持久节点失败测试

使用 Happy DOM 覆盖：

- PrepareWorkspace 预设、工具、颜色、材料、MobilePickerPanel、ExportCompletionPanel 与 sheet
  面板在普通状态更新前后保持相同节点引用。
- 输入框焦点、选择范围、IME composition 与滚动位置不因数量/状态刷新丢失。
- keyed 颜色/材料行按稳定 key 更新，不清空整个容器。
- 只有明确切换项目时允许替换项目级集合。
- 有意移除当前焦点节点时，焦点迁移到最近的等价控制或所属面板标题。
- 初次 `renderApp()` 之后，目标面板更新路径不调用 `innerHTML`。

运行并确认失败：

```bash
pnpm exec tsx --test tests/workspace-persistence.test.ts
```

### 4.2 实现持久化面板更新器

- `app.ts` 一次性挂载 workspace、desktop inspector、mobile sheet、picker host、export host。
- `keyedList.ts` 复用、移动、更新或删除带稳定 key 的节点。
- `workspacePanels.ts` 只改文本、属性、类和必要子节点。
- `main.ts` 删除编辑器 inspector、mobile sheet、材料列表的运行时 `innerHTML` 重建。

运行：

```bash
pnpm exec tsx --test tests/workspace-persistence.test.ts
```

### 4.3 先写单 Sheet 与响应式失败测试

覆盖：

- 320–767：单个 app-level `WorkspaceSheet`，支持 peek/half/full。
- 768–1023：Canvas + 一个可折叠工作面板。
- ≥1024：56–64 px 工具轨、Canvas 至少 55%、304–344 px 检查器；desktop DOM
  不存在移动 sheet。
- sheet 节点在 peek/half/full、工具/颜色/材料/选择器/导出之间不被替换。
- peek 总结显示当前工具、当前颜色、“工具与颜色”入口和主操作。
- full header 是拖动区域；内部按钮、输入、滚动区不触发拖动。
- half 高度保持在约 44–52 svh；松手按位置和速度吸附；`pointercancel`
  恢复最近稳定态；旋转屏幕后保留等价命名状态。
- 处理键盘与 safe-area 后，320/375/430 宽度无页面级横向溢出。
- 320/375/430/768/1024/1440 每个主状态都满足
  `documentElement.scrollWidth <= documentElement.clientWidth`；另验证 200% 文本缩放、
  safe-area 与 reduced-motion。

运行并确认失败：

```bash
pnpm exec tsx --test tests/mobile-sheet.test.ts tests/responsive-layout.test.ts
```

实现后运行同一命令。

### 4.4 先写选择上下文失败测试

覆盖：

- 选择存在时显示宽×高、复制、移动、清除、取消。
- “复制”或“移动”设置下一次显式拖动的传输模式，触摸设备无需 Alt。
- 进入待落位后，下一次从选区内开始的拖动以落点 delta 执行；复制保留 source，移动清空
  source；重叠使用源快照确定结果，越界按领域选择规则稳定裁剪。
- 传输成功、取消选择、切换工具或切换项目后模式复位；越界导致零有效目标时不写历史并复位。
- “取消”退出选择但不修改矩阵；“清除”只清空所选区域并进入历史。
- 跳转表单默认隐藏，点击“跳到坐标”后才显示并聚焦。
- 首次进入编辑器显示一次简短提示；只用当前页面内存 session 标记，同一页面后续进入不重复，
  刷新后回到真实空状态，不写 localStorage/IndexedDB。
- 上下文栏不遮挡 Canvas 当前选区，并避让 sheet、软键盘和 safe-area。

给 `PatternCanvasController` 增加最小接口：

```ts
type SelectionTransferMode = "move" | "copy" | null;
setSelectionTransferMode(mode: SelectionTransferMode): void;
cancelSelection(): void;
```

运行并确认失败：

```bash
pnpm exec tsx --test tests/selection-context.test.ts tests/editor-canvas-controller.test.ts
```

实现后运行：

```bash
pnpm exec tsx --test tests/selection-context.test.ts tests/editor-canvas-controller.test.ts tests/selection-operations.test.ts
pnpm test
```

## Task 5：同层导出/完成体验与中文客户输出

### 文件

- 新增：`src/features/export-completion/exportState.ts`
- 新增：`src/features/export-completion/exportCoordinator.ts`
- 修改：`src/domain/export.ts`
- 修改：`src/app.ts`
- 修改：`src/main.ts`
- 修改：`src/styles/page.css`
- 新增：`tests/export-completion.test.ts`
- 新增：`tests/export-coordinator.test.ts`
- 新增：`tests/customer-language.test.ts`
- 修改：`tests/app-markup.test.ts`
- 修改：`backend/app/pattern_export.py`
- 修改：`backend/tests/test_pattern_export.py`
- 修改：`Dockerfile`

### 5.1 先写同层导出状态失败测试

覆盖：

- 导出是当前 desktop inspector / `WorkspaceSheet` 内的 `ExportCompletionPanel`，不是 modal/dialog。
- 页面上不会同时出现 sheet 与第二个 `aria-modal`。
- 四个客户任务固定为“分享图片 / 打印制作 / 材料清单 / 保存项目”。
- PNG 仅提供“纯图案”和“带标注”两张单选卡。
- PDF 不出现重复模板开关。
- 关闭导出回到打开前的面板、sheet 高度和触发器焦点。

先运行并确认失败：

```bash
pnpm exec tsx --test tests/export-completion.test.ts tests/app-markup.test.ts
```

### 5.2 先写请求生命周期失败测试

覆盖：

- 每次导出持有递增 token 与 `AbortController`。
- 用户关闭、切换项目或发起新导出时取消旧请求。
- 旧请求即使晚到也不能触发下载、成功提示或覆盖新状态。
- coordinator 输入是在操作开始时捕获的 immutable project snapshot 与 monotonically
  increasing request token；关闭、编辑、换图、项目导入和新请求统一使旧 token 失效。
- 响应转 Blob 后、创建 object URL 前和触发下载前都再次检查 token；任一检查失效即释放资源并退出。
- 浏览器文件名由品牌配置、客户任务和本地日期组成，经过文件名安全化。
- 文件名不包含源文件名、revision、schema 或内部模式名。

运行并确认失败：

```bash
pnpm exec tsx --test tests/export-coordinator.test.ts
```

实现后运行：

```bash
pnpm exec tsx --test tests/export-completion.test.ts tests/export-coordinator.test.ts
```

### 5.3 先写中文导出失败测试

前端和后端测试覆盖：

- CSV 客户列名使用“颜色标识”，不显示 schema/revision。
- PNG 从 immutable project matrix 渲染，不读取页面 Canvas；pure 的空格 alpha=0，
  annotated 包含网格、中文行列坐标、中文材料图例，全部统计来自同一捕获 revision。
- PDF 摘要、页面、打印比例和颜色清单使用中文客户语言；包含摘要页与每板页，完整 cell
  不跨页，每页带页码、坐标、图例与打印比例。
- capabilities 返回 PDF 500 页与 1,100,000,000 raster pixels 上限；任一超限在规划拼板页
  前以 `PDF_EXPORT_LIMIT_EXCEEDED` 拒绝，不开始渲染、不留下半成品。
- 前端离线与后端在线 CSV 都包含项目摘要、每色材料清单、逐 cell 表，段落、列顺序与逐字节输出一致。
- JSON 保留内部版本字段，UI 将其描述为“可继续编辑的项目文件”。
- JSON 导出→导入保持矩阵、revision、生成设置、统计和拼板布局。
- 客户可见文案不存在 revision、schema、matrixVersion、grid/image/path、DPI 误导或“编号显示/隐藏”等被禁术语。
- 中文字体解析优先使用系统 CJK 字体，开发机与 Debian 容器都有确定回退。

运行并确认失败：

```bash
pnpm exec tsx --test tests/customer-language.test.ts
cd backend && .venv/bin/python -m pytest tests/test_pattern_export.py
```

实现：

- `pattern_export.py` 增加平台无关字体候选解析，macOS 使用系统 CJK 字体，Linux 使用 Noto CJK。
- 根目录 `Dockerfile` 安装 `fonts-noto-cjk`；该文件修改只用于本地构建验证，不触发部署。
- PNG/PDF/CSV 的客户可见标签全部中文化；内部响应头可继续保留 revision。

运行：

```bash
pnpm exec tsx --test tests/customer-language.test.ts tests/export-completion.test.ts tests/export-coordinator.test.ts
cd backend && .venv/bin/python -m pytest tests/test_pattern_export.py
```

## Task 6：暖白专业工作台视觉与响应式收口

### 文件

- 修改：`src/styles/base.css`
- 修改：`src/styles/page.css`
- 仅在现有 token 无法表达时修改：
  - `src/design/tokens/component.tokens.json`
  - `src/design/tokens/semantic.tokens.json`
- 仅在 token 源变化时机械生成：
  - `src/design/generated/tokens.css`
  - `src/design/generated/tokens.ts`
  - `backend/app/generated_design_tokens.py`
- 修改：`tests/responsive-layout.test.ts`
- 修改：`tests/app-markup.test.ts`

### 6.1 先写静态视觉约束失败测试

覆盖：

- 使用锁定的暖白背景、白色面板、暖灰 Canvas、青绿色主操作。
- 图标来自现有 Phosphor 图标库，不使用文本符号、emoji、手绘 SVG 或 CSS 图案伪装资产。
- 所有触摸目标最小 44×44 px。
- focus-visible 清楚可见。
- reduced-motion 下移除非必要过渡。
- 客户流程没有桌面专属左侧导航复制，也没有深色主题漂移。
- 320/375/430/768/1024/1440 的布局契约由同一断点解析器与 CSS 对齐。

运行并确认失败：

```bash
pnpm exec tsx --test tests/responsive-layout.test.ts tests/app-markup.test.ts
```

### 6.2 实现与复测

只调整支持方案 A 的样式，不重构无关 token。若 token 源改变，运行：

```bash
pnpm run generate:tokens
```

然后运行：

```bash
pnpm exec tsx --test tests/responsive-layout.test.ts tests/app-markup.test.ts
pnpm run check:tokens
```

## Task 7：集成清理与自动化验证

### 文件

- 修改：`src/main.ts`
- 修改：`src/app.ts`
- 修改：相关测试
- 不改变公开 API 契约，除非 draft.4 明确要求。

### 7.1 集成检查

- `main.ts` 只保留状态组合、事件编排、API/导出生命周期和项目边界。
- 客户规则落在 `customer-flow`，UI 组件行为落在各 feature，不复制魔法数字。
- 删除被替代的 modal、重复导出开关、原生 select 绑定和运行时 panel `innerHTML`。
- 保留内部 revision 用于并发控制，但从客户 UI、PNG、PDF、CSV 和文件名移除。
- 对 `TODO|FIXME|TBD|placeholder`、禁用术语、可见 `<select>`、目标路径 `innerHTML` 做定向扫描。

### 7.2 前端验证阶梯

依次运行，任一步失败先修复再继续：

```bash
pnpm test
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run build
pnpm run benchmark:editor
pnpm run check
git diff --check
```

### 7.3 后端验证

```bash
cd backend && .venv/bin/python -m pytest
```

### 7.4 真实本地 API 冒烟

启动真实服务：

```bash
./scripts/start-local.sh
```

验证：

- `/api/health`
- `/api/capabilities`
- `/api/palettes`
- 新图生成
- 已有图纸网格检测与镜像
- PNG/PDF/CSV/JSON 导出
- 失败响应和取消请求不会污染当前 UI

## Task 8：浏览器全流程、最新设计 QA 与 owner 交接

### 文件

- 新增真实 QA 输入：`artifacts/qa/fixtures/`
- 更新截图：`artifacts/qa/*.png`
- 更新：`design-qa.md`

### 8.1 QA 输入

- 新图照片：真实、可再分发图片。
- 像素图：真实 PNG/WebP，非透明唯一颜色不超过 256。
- 已有图纸：先验证当前本机的 `backend/tests/fixtures/owner-grid.jpg`
  是真实且可用于本地 QA 的 owner fixture；复制到受控 QA fixture 目录并记录来源，不依赖 ignored
  文件在其他环境必然存在。
- 项目 JSON：通过当前真实应用导出后再回导，不手写伪造。

每个外部 fixture 在 `design-qa.md` 记录来源、许可与下载日期。

### 8.2 应用内浏览器矩阵

使用 Codex 应用内浏览器，不使用 Playwright。至少验证并截图：

| 状态                            | 390 px | 1440 px |
| ------------------------------- | -----: | ------: |
| 两任务上传首页                  |     是 |      是 |
| 准备页默认层                    |     是 |      是 |
| 专业设置展开                    |     是 |      是 |
| 编辑器 peek / desktop inspector |     是 |      是 |
| 选择上下文                      |     是 |      是 |
| 导出完成面板                    |     是 |      是 |
| 已有图纸镜像                    |     是 |      是 |
| UiSelect / 移动选择器           |     是 |      是 |

另记录 320 / 375 / 430 / 768 / 1024 的：

- 页面和关键容器尺寸
- 是否横向溢出
- Canvas 可用比例
- sheet/panel 数量
- 键盘与 safe-area 行为

对主流程完成键盘、触摸等价操作、焦点恢复、滚动、上传、生成、编辑、撤销/重做、导出与项目回导。记录浏览器控制台错误；目标为零未解释错误。

### 8.3 同图对照设计复核

在同一次最终 QA 中查看：

- 锁定参考：`artifacts/qa/source-option-2-normalized.png`
- 最新实现截图：390 px 和 1440 px 的关键对应状态

逐项比较层级、留白、面板圆角、边框、字体、青绿主操作、Canvas 暖灰、sheet 密度、裁切和溢出。发现可见偏差后修复并重新截图，不以截图本身代替判断。

`design-qa.md` 为每张图记录：

- 文件名
- 视口、DPR、日期
- fixture 和界面状态
- 对照基线
- expected vs actual
- 控制台结果
- 是否通过以及必要例外

### 8.4 独立复核与最终验证

由未参与对应实现的 reviewer 对完整 diff 做：

1. 规范覆盖审查
2. 代码正确性与回归风险审查
3. 测试质量审查
4. 最新截图视觉审查

修复所有阻断和高优先级问题后，再运行：

```bash
pnpm run check
pnpm run benchmark:editor
cd backend && .venv/bin/python -m pytest
git diff --check
git status --short
```

最终保留本地预览运行，向 owner 提供可点击本地地址、改动文件、验证结果、设计 QA 位置和剩余风险。等待 owner 本地验收；不提交、不推送、不部署。

## 完成定义

仅当以下全部成立才可报告完成：

- draft.4 的任务、模式、预设、单 Sheet、持久节点、导出和中文客户语言规则均已实现。
- 自动推荐只用于推荐，专业设置始终可覆盖。
- 前端全套检查、构建、基准与后端全套测试通过。
- 真实本地 API 和两条客户主流程通过。
- 390/1440 关键状态与 320/375/430/768/1024 布局检查完成。
- 参考图与最新实现完成同图对照并更新 `design-qa.md`。
- 独立 reviewer 的阻断/高优先级问题已清零。
- 工作区没有 branch/commit/push/deploy 行为，所有改动留给 owner 本地验收。
