# 豆图设计台产品规范（Mirror Master 仓库唯一权威）

- 状态：重建中
- 规范版本：`1.0.0-draft.1`
- 基线日期：2026-07-24
- 语言：简体中文

## 0. 文档权威与变更规则

本文件是“豆图设计台”（Mirror Master 仓库）的产品目标、领域模型、用户体验、算法合同、接口边界、验收标准和实施顺序的**唯一规范性权威**。

- `README.md` 只提供项目入口和本地启动摘要。
- `backend/README.zh-CN.md` 只描述后端实现与运维入口。
- `docs/DEPLOYMENT.zh-CN.md` 只描述本地、Docker、VPS 和历史部署操作。
- 代码、测试、示例、设计稿或部署文档与本文件冲突时，以本文件为准，并在同一变更中修正冲突项。
- 不得新增 `SPEC`、`PRD`、`产品需求`、`产品规范` 等竞争性权威文档；补充材料必须链接本文件并明确为非规范性说明。
- 规范字段、算法和验收标准的变化必须先修改本文件，再修改代码。

### 0.1 重建基线

| 项目                                   | 值                                              |
| -------------------------------------- | ----------------------------------------------- |
| 重建前基线 HEAD / `origin/main`        | `d29ff36d3849aa54ec689a231694d7358c05d478`      |
| owner seed 提交后 HEAD / `origin/main` | `134491221451bf52a492fa2c4ccfcc96bdb579eb`      |
| owner seed                             | `拼豆颜色对照表.txt`                            |
| 分支                                   | `main`                                          |
| 重命名                                 | 禁止仓库、package、本地目录和域名重命名         |
| 部署                                   | 重建期间禁止 Vercel、VPS、Docker 或其他生产部署 |

## 1. 产品定义

“豆图设计台”是面向普通拼豆顾客的完整拼豆图纸设计工具。产品把照片、像素画或已有图纸转换为可编辑、可核算材料、可镜像、可导出的拼豆工程，并在后续提供从空白画布直接创作的入口。

当前顾客可见名称为**豆图设计台**，英文工作标识为 `Bean Pattern Studio`，简称“豆图”，描述为“简单、准确的拼豆图纸设计工具”。这是开发阶段暂定名称，不是最终商标结论。名称单一来源为 `src/brand/brand.config.json`，由 `scripts/generate-brand-config.mjs` 生成前端 `brand.config.ts` 和后端 `generated_brand.py`；组件、标题、导出内容和运行时文案不得写死产品名称。仓库名、package 名、本地目录和远程设置保持不变。

产品的唯一业务真相是**结构化拼豆颜色矩阵**，不是预览图片、Canvas 像素、上传原图或导出的 PNG。任何视图、统计、材料清单和导出必须从同一个项目模型及其 `cells` 矩阵派生。

现有基于 OpenCV/Pillow 的网格感知镜像能力不再代表整个产品；它仅作为“已有图纸 → 智能镜像”的保留模块存在。

### 1.1 目标用户

- 第一次把照片制作成拼豆图纸的顾客。
- 已有像素画，希望映射到真实可购买色号的顾客。
- 已有带坐标、色号标签或图例的拼豆图纸，希望安全镜像的顾客。
- 需要准确材料数量、拼板布局和打印/交付文件的手作爱好者或小型工作室。

### 1.2 核心结果

用户应能在手机上完成：

1. 选择模式并上传图片。
2. 裁剪、旋转并设定行列、板型与实际尺寸。
3. 选择真实色板、可用颜色、采样和抖动方式。
4. 生成确定性的拼豆矩阵。
5. 用触控编辑、撤销、重做、镜像和复核统计。
6. 导出 PNG、PDF、CSV 和项目 JSON。

桌面端提供更高密度的编辑和检查能力，但不得成为完成核心流程的必要条件。

### 1.3 当前产品边界

当前产品只建设顾客创作能力，不建设或预留商家经营系统。以下范围明确禁止进入当前模型、页面、API 和占位模块：

- 商城、商品目录、购物车、收藏和会员套餐。
- 支付、充值、优惠券、发票、订单、退款、售后和物流。
- 门店预约、桌号、计时、收银、经营报表、员工和角色权限。
- 材料库存、入库、出库、盘点、余量、安全库存、补货和采购。
- CRM、顾客标签、营销触达、商家入驻、佣金和结算。

“这次只使用这些颜色”只是当前图纸的临时颜色过滤条件，不记录拥有量、消耗量、剩余量或库存预警。

### 1.4 顾客能力路线

本轮 Stage 3 交付照片、像素画、已有图纸三种输入，结构化矩阵、尺寸与材料计算、编辑、镜像和导出。下列能力已纳入产品路线，但必须按文档优先、独立验收的后续阶段实施，不得以假按钮或 mock 结果提前出现：

- 从空白画布开始设计。
- 原图与拼豆结果滑动对比、逐色制作、单色高亮和制作进度。
- 小区域杂色检测、孤立色点清理、相近色合并和全局颜色替换。
- 缺失颜色近似推荐、自定义色板导入和多品牌色号转换。
- 分板打印、1:1 实际尺寸打印和高分辨率导出。
- 本地草稿、离线使用、快捷键、触控笔和只读项目分享。

## 2. 重建期部署状态

Vercel 状态为：**暂停（PAUSED）**。

- `vercel.json` 必须包含 `"git": { "deploymentEnabled": false }`。
- 该配置不得改变 Vite 本地开发、FastAPI、本地统一服务、Docker 或 VPS 运行方式。
- 不得触发部署。
- Vercel 项目、域名、部署历史不得删除。
- owner 需在 Vercel Dashboard 的项目 `Settings → Git` 中执行 `Disconnect`，只断开 Git 仓库。
- 未完成重建验收和 owner 明确批准前，不得重新连接 Git 或恢复自动部署。

## 3. 设计原则

### 3.1 移动端优先

- 设计基准宽度为 390 CSS px，并验证 320、375、390、430、768 和 1440 px。
- 主要操作触控目标最小 44 × 44 CSS px；相邻危险操作保持至少 8 px 间距。
- 使用安全区变量处理刘海屏与底部手势区。
- 移动端以单列任务流、固定底部主操作和可拖拽 bottom sheet 承载参数、色板与材料信息。
- bottom sheet 至少支持收起、半屏、全屏三态；键盘出现时主操作不得被遮挡。
- Canvas 手势与页面滚动必须有明确边界：单指绘制、双指平移/缩放；非编辑区域保持正常页面滚动。
- 不依赖 hover、右键、鼠标滚轮或精细光标才能完成任务。

### 3.2 输入事件兼容

- 编辑器优先使用 Pointer Events，并使用 `setPointerCapture` / `releasePointerCapture` 管理连续手势。
- 需要支持触控笔、鼠标、单指触控和键盘；不得同时注册会造成双触发的并行 mouse/touch 逻辑。
- 对不支持 Pointer Events 的环境提供受控 touch/mouse fallback，并抑制合成 click。
- 非被动 `touchmove` 监听仅可用于 Canvas 手势区域，必须有清理逻辑。
- 处理 `pointercancel`、窗口失焦、页面隐藏、方向变化和组件销毁，避免卡住的绘制状态。
- 所有图标按钮必须有中文可访问名称；焦点可见；关键状态通过 `aria-live` 宣告。

### 3.3 可预期与可恢复

- 任何生成、智能识别和导出都必须显示中文进行中、成功、空状态、取消和失败状态。
- 更换图片、重新生成或载入项目时，如会覆盖未保存编辑，必须先明确告知影响。
- 网络请求使用 `AbortController`；新请求取消旧请求；取消不是错误 toast。
- 编辑历史存在于当前项目会话；刷新后不自动恢复上传图片或未显式下载的项目。

### 3.4 已选视觉方向：专业材料工作台

2026-07-24 已选定 Product Design 视觉方案 2，并按 owner 反馈锁定为下述实现合同。此方向取代方案原稿中的深色主工作区：产品必须是克制、专业、移动端优先的拼豆创作工作室，不能像儿童玩具，也不能退化为只能在桌面使用的密集专家工具。

**视觉 thesis**：暖白工作台上的专业手作工具，安静、准确，让真实拼豆图案和材料数据成为唯一视觉焦点。

**内容计划**：

1. 上传：一个占主导的“选择图片”操作，以及照片、像素画、已有图纸三个清楚分开的入口。
2. 准备：以图片和裁剪区域为主，逐步展开行列、拼板、色板和生成选项。
3. 编辑：Canvas 占据主要视口，工具、颜色、材料和设置围绕 Canvas 服务。
4. 完成：从当前矩阵直接查看材料、检查正反面并导出，不增加营销式完成页。

**交互 thesis**：

- 阶段切换用短距离淡入/位移帮助用户理解“上传 → 准备 → 编辑”，不制造表演感。
- 移动端唯一 bottom sheet 在收起、半屏、全屏三态之间平稳吸附，始终保留 Canvas 上下文。
- 工具按下、cell 修改和撤销/重做使用短促的 pressed/selection 反馈，确认操作已发生。

#### 3.4.1 颜色 tokens

常规产品 UI 只能使用中性色与青绿色交互色。MARD/默认色板颜色只可出现在图案 Canvas、palette swatch、当前颜色反馈、图例和材料统计中。

| 语义 Token                  | 值        | 用途                     |
| --------------------------- | --------- | ------------------------ |
| `color.background.page`     | `#F7F8F5` | 暖白应用背景             |
| `color.background.panel`    | `#FFFFFF` | 工具栏、sheet、inspector |
| `color.background.subtle`   | `#EEF2EF` | 次级区域                 |
| `canvas.background`         | `#E7E3DA` | Canvas 外围工作区        |
| `color.text.primary`        | `#1F2933` | 主文字与主要图标         |
| `color.text.secondary`      | `#5F6B66` | 次要说明                 |
| `color.border.default`      | `#DCE2DE` | 分隔与输入边界           |
| `color.action.primary`      | `#0F766E` | 主操作与 active 状态     |
| `color.action.primaryHover` | `#115E59` | pressed/hover 主操作     |
| `color.action.primarySoft`  | `#D9EEEA` | active 背景与选择反馈    |
| `color.focus.ring`          | `#14B8A6` | 2 px 可见焦点环          |
| `color.status.error`        | `#B42318` | 仅用于错误和破坏性警告   |
| `color.status.warning`      | `#9A5B13` | 仅用于需复核状态         |

禁止把 `color.status.error`、`color.status.warning` 或 palette 颜色当作装饰性强调色。界面不得使用彩虹渐变、品牌渐变、玻璃拟态、强光晕或彩色页面纹理。

#### 3.4.1.1 可替换主题架构

当前主题名为“薄荷工作台”，运行时 ID 为 `mint-studio`。主题必须使用三层 Token，且由一个确定性生成脚本产出 CSS/TypeScript 资产：

1. 基础层：`src/design/tokens/core.tokens.json`，只记录原始颜色、间距、圆角、阴影、字体与动效值。
2. 语义层：`src/design/tokens/semantic.tokens.json` 与 `themes/mint-studio.tokens.json`，把当前主题映射为 action、background、text、border、status、focus。
3. 组件层：`src/design/tokens/component.tokens.json`，只引用语义 Token，定义 button、sheet、toolbar、canvas、inspector、swatch、grid。

`scripts/generate-design-tokens.mjs` 是生成入口，产出 `src/design/generated/tokens.css` 与 `tokens.ts`；`pnpm check:tokens` 必须阻止生成资产漂移。运行时根元素必须标记 `data-theme="mint-studio"`。后续换主题只允许新增/替换主题映射和品牌配置，不得改写业务组件。

产品主题颜色与拼豆材料颜色必须彻底分离。用户切换 MARD、默认或未来品牌色板时，不得改变页面主题；MARD/默认色只进入 Canvas、swatch、选中色反馈、图例和材料统计。

#### 3.4.2 字体、尺寸与表面

- 字体只使用系统无衬线：`system-ui`、`-apple-system`、`BlinkMacSystemFont`、`Segoe UI`、`PingFang SC`、`Microsoft YaHei`。
- 顾客可见正文 14–16 px；输入值 16 px 以上以避免移动端自动缩放；页面/阶段标题 20–24 px；不使用营销式超大标题。
- 常规圆角 10 px，强调输入/主按钮 12 px，bottom sheet 顶角 18 px；不得把所有元素做成胶囊。
- 常规边界为 1 px；阴影仅用于 sheet 与浮动菜单，最大为 `0 12px 32px rgb(29 37 35 / 10%)`。
- 空间基准 4 px，常用间距为 8、12、16、24、32 px。
- 所有可点击/触控控件的命中区域不得小于 44 × 44 CSS px。
- hover、focus-visible、pressed、disabled 和 selected 状态必须视觉可分；状态不能只依赖颜色。

#### 3.4.3 顾客语言

- 顾客界面使用“颜色接近方式”“格子取色方式”“最多使用颜色”“拼板”等任务语言，不直接显示 Lab、CIEDE2000、alpha、schema、revision、contract 等实现名词。
- 必须显示色板品牌与色号，因为它们用于购买和配料；首次出现用“色板 / 色号”解释，例如“色号 MARD A14”。
- “已有图纸智能镜像”可简称“镜像已有图纸”，辅助说明为“只翻转拼豆格，保留坐标和图例”。
- 每个设置的默认值应能直接完成任务；高级解释放在同一 sheet 的展开说明中，不创建阻塞式教学弹窗。
- 按钮使用具体动作：“选择图片”“生成图纸”“应用颜色”“完成并导出”，避免“提交”“处理”“执行”等内部语言。

#### 3.4.4 响应式布局

`320–767 px`：

- 使用全屏单任务工作区，顶部栏 52–56 px，固定主操作计入 `env(safe-area-inset-bottom)`。
- 上传页不放空洞 hero；一个主上传按钮占视觉中心，三个模式使用并列或分行的单选入口明确区分。
- 准备阶段先显示裁剪，行列与拼板为默认设置，色板与算法设置按需展开；不得一次展示所有专家参数。
- 编辑阶段 Canvas 使用 sheet 之外的最大可用空间；不得让控制条、toast 或 sheet 持续遮挡当前编辑区域。
- 只允许一个非模态 bottom sheet，并承载设置、颜色、材料和工具；任何时刻不得叠加第二个 sheet、drawer 或 modal。
- sheet 三态为：收起（仅显示 drag handle、当前工具/颜色与主操作）、半屏（约 44–52 svh）、全屏（顶部栏以下可用高度）。
- 主操作固定在 sheet 或视口底部安全区内；展开软键盘后仍可见或明确随内容滚动到可见位置。

`768–1023 px`：

- Canvas 仍为主表面；工具可成为窄侧栏，inspector 使用同一个可收起面板，不出现双面板叠加。

`≥1024 px`：

- 左侧为 56–64 px 紧凑工具 rail。
- 中央 Canvas 占剩余宽度且不得小于主内容的 55%。
- 右侧 304–344 px inspector 常驻，按设置、颜色、材料组织；不再使用覆盖 Canvas 的 bottom sheet。
- 顶部栏与主操作保持紧凑；不得把移动内容机械放大成大量空白，也不得把所有设置同时展开成密集控制墙。

#### 3.4.5 组件层级

```text
AppShell
├─ AppHeader
├─ UploadWorkspace
│  ├─ ModeSelector
│  ├─ PrimaryUploadAction
│  └─ PrivacyNote
├─ PrepareWorkspace
│  ├─ CropCanvas
│  ├─ EssentialSettings
│  └─ AdvancedSettingsDisclosure
└─ EditorWorkspace
   ├─ ToolRail (desktop/tablet)
   ├─ PatternCanvas
   ├─ ViewAndHistoryControls
   ├─ WorkspaceInspector (desktop)
   └─ WorkspaceSheet (mobile, single instance)
      ├─ SheetHandle
      ├─ SettingsPanel
      ├─ PalettePanel
      ├─ MaterialsPanel
      ├─ ToolsPanel
      └─ SafeAreaPrimaryAction
```

- 同一时刻只有一个主工作区可见。
- 组件以任务和数据边界拆分，不为视觉卡片机械拆组件。
- Canvas 是编辑阶段唯一 dominant surface；inspector、sheet、工具栏均为次级。
- 主操作在每个阶段只有一个，次级动作不得与其同权竞争。

#### 3.4.6 动效规则

- 阶段进入：160–220 ms，`opacity` + 不超过 8 px 的 `translateY`。
- sheet 吸附：180–240 ms，标准 ease-out；拖拽期间跟手，不使用弹跳或 overshoot。
- pressed/selected：80–140 ms，使用背景、边界或不超过 0.98 的 scale；不得造成布局抖动。
- Canvas 缩放和平移只响应直接手势，不做自动漂移、景深或装饰性视差。
- loading 使用文字和低干扰进度反馈，不使用彩色旋转玩具或持续闪烁。
- `prefers-reduced-motion: reduce` 时，取消位移、scale、平滑滚动和 sheet 动画，仅保留即时状态变化。

#### 3.4.7 硬性拒绝标准

出现任一项即视为视觉验收失败：

- 玩具化插画、卡通吉祥物、儿童贴纸感图标或游戏式奖励。
- 彩虹/装饰性渐变、玻璃拟态、强 glow、彩色阴影或 bead-pattern 页面背景。
- dashboard 卡片马赛克、cards inside cards、每个设置都独立成卡片。
- 上传页使用超大空白营销 hero、口号或与任务无关的装饰图。
- 控件、toast、sheet 或工具条持续遮挡主要 Canvas。
- 同时出现多个 sheet、sheet 上再开 drawer，或移动端用阻塞式设置 modal。
- 小于 44 px 的触控目标、只依赖 hover 的操作、不可见焦点或没有 pressed 状态。
- 在常规 UI chrome 中使用 palette 颜色，导致材料颜色与操作状态混淆。
- 桌面端堆满所有高级参数，或移动端只是缩小的桌面三栏界面。
- 顾客界面直接暴露算法、API、schema、contract、hash 或 revision 等术语。

## 4. 输入模式

### 4.1 照片模式 `photo`

用于照片、插画或非像素化图片。

- 必须先提供裁剪、90° 旋转和尺寸设置。
- 默认采样为单元平均，默认色差为 CIEDE2000，默认不抖动。
- 允许透明背景、最大颜色数和可用颜色过滤。

### 4.2 像素画模式 `pixelArt`

用于边缘明确、每个源像素有语义的图片。

- 默认保持宽高比。
- 默认采样为最近邻。
- 不得通过平滑插值污染像素边界。
- 用户可把一个源像素映射为一个或多个拼豆单元。

### 4.3 已有图纸模式 `existingChart`

用于带网格、坐标、编号、图例、文字标签或装饰边框的图纸。

- OpenCV 网格检测输出可复核的网格合同。
- 用户确认网格后才能执行智能图纸镜像。
- 智能镜像只重排完整拼豆单元；网格外标签、坐标、图例、标题和边框保持原位置与像素内容。
- 此模式可进一步抽取矩阵，但抽取失败不得阻断图纸镜像。

## 5. owner 调色板 seed 与资产合同

### 5.1 来源与校验

`拼豆颜色对照表.txt` 是 owner 提供的种子证据，不直接作为运行时解析格式。

已确认：

| 色板     | 系列计数                                             | 总数 |
| -------- | ---------------------------------------------------- | ---: |
| 默认色板 | A:6、B:6、C:6、D:7、E:7、F:7                         |   39 |
| MARD     | A:26、B:32、C:29、D:26、E:24、F:25、G:21、H:23、M:15 |  221 |

可见的 `MRAD` 必须统一修正为 `MARD`。除非在本文件“已证明的数据修正”中记录证据，否则不得更改 seed 提供的 code 或 HEX。

### 5.2 命名空间与记录字段

原始 code 不能单独作为全局 ID，因为默认色板的 `A01` 与 MARD 的 `A1` 在补零或数值化后会碰撞。

每条颜色必须记录：

```json
{
  "id": "mard:A1",
  "source": "owner-seed",
  "version": "2026-07-24",
  "paletteId": "mard",
  "series": "A",
  "code": "A1",
  "displayHex": "#FAF4C8",
  "name": null
}
```

- 默认色示例 ID：`default:A01`。
- MARD 示例 ID：`mard:A1`。
- `id` 区分大小写但资产中统一为小写 palette ID 加原始 code。
- `code` 与 `displayHex` 必须逐字保留 seed 值。
- `name` 仅在 seed 提供时记录，不为 MARD 颜色编造名称。
- `displayHex` 只是屏幕近似，不是熔融后、不同批次、不同光源或相机下的实物色保证。

### 5.3 单一来源与生成物

- owner seed `拼豆颜色对照表.txt` 是唯一可编辑颜色来源；不得在 TypeScript、Python、JSON 或文档中手工复制或修正颜色值。
- 结构化 JSON、前端 TypeScript 资产、后端 Python 资产和人类可读清单必须由同一生成脚本同时产生。
- 生成必须可重复、排序稳定并带 source version。
- CI/本地检查必须验证 39、221、260、ID 唯一、code 系列一致、HEX 格式和生成物无漂移。

已证明的数据修正：当前无 code 或 HEX 修正。

## 6. 项目模型与矩阵权威

### 6.1 项目 schema

项目 JSON 顶层使用：

```ts
interface BeadProject {
  schemaVersion: '1.0';
  id: string;
  createdAt: string;
  updatedAt: string;
  mode: 'photo' | 'pixelArt' | 'existingChart';
  source: {
    fileName: string;
    mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
    naturalWidth: number;
    naturalHeight: number;
    sha256: string;
    crop: { x: number; y: number; width: number; height: number };
    rotation: 0 | 90 | 180 | 270;
  };
  grid: {
    rows: number;
    columns: number;
    aspectLocked: boolean;
    beadDiameterMm: number;
    beadPitchMm: number;
    boardPresetId: string;
  };
  palette: {
    paletteId: 'default' | 'mard';
    paletteVersion: string;
    availableColorIds: string[];
    maximumColors: number | null;
  };
  generation: {
    sampling: 'average' | 'nearest';
    colorDistance: 'ciede2000';
    dithering: 'none' | 'floydSteinberg';
    alphaEmptyThreshold: number;
  };
  cells: BeadCell[][];
  revision: number;
}

type BeadCell = { kind: 'empty' } | { kind: 'bead'; colorId: string };
```

### 6.2 矩阵不变量

- `cells.length === rows`。
- 每行 `cells[row].length === columns`。
- bead cell 的 `colorId` 必须存在于项目记录的 palette version。
- empty cell 不得计入用珠数量。
- `sum(perColorCounts) === nonEmptyBeadCount` 必须在运行时、导出前和测试中成立。
- `nonEmptyBeadCount + blankCount === rows * columns`。
- 所有统计、预览、镜像和导出必须从当前矩阵 revision 派生。
- 项目 JSON 不嵌入原始图片字节；重新编辑裁剪时需要用户重新选择图片。

## 7. 图片、裁剪与尺寸

### 7.1 上传与隐私限制

- 支持 PNG、JPEG、WebP。
- 单文件上限 20 MiB。
- 解码像素上限 25,000,000。
- 空文件、MIME 不匹配、无法解码、尺寸超限必须返回稳定中文错误码与提示。
- 图片只发送到用户控制的 FastAPI 服务并在内存中处理；不得使用第三方图片服务。
- 应用不得持久化上传图片、文件名、图片字节、哈希或生成中间图。
- 响应使用 `Cache-Control: no-store`；生产代理和平台日志属于部署方责任边界。

### 7.2 裁剪与旋转

- 裁剪框默认覆盖完整方向归一化图片。
- 支持拖动、边角缩放、数值输入和 90° 顺/逆时针旋转。
- 裁剪坐标使用方向归一化图片上的半开整数矩形。
- 旋转后重新计算裁剪边界；不得产生负尺寸或越界。
- 更换图片必须取消检测、生成和导出请求，释放 Object URL 并清空旧矩阵。

### 7.3 行列与宽高比

- `rows`、`columns` 范围均为 1–300。
- 默认启用宽高比锁定；修改一维时按裁剪比例确定另一维，并使用稳定的四舍五入规则。
- 解锁后允许独立设置。
- 像素画模式提供“一源像素一拼豆”快捷设置，但仍受 300 × 300 上限约束。

### 7.4 拼豆与拼板尺寸

- `beadDiameterMm` 范围 1–10 mm，默认 5 mm。
- `beadPitchMm` 范围 1–12 mm，默认 5 mm，且不得小于 bead diameter。
- 物理宽度：`(columns - 1) * beadPitchMm + beadDiameterMm`。
- 物理高度：`(rows - 1) * beadPitchMm + beadDiameterMm`。
- 预设至少包含：小方板 14 × 14、标准方板 29 × 29、自定义。
- 拼板数：`ceil(columns / boardColumns) * ceil(rows / boardRows)`。
- 拼板布局显示板编号、每板行列范围和边界分隔；末板允许不满。

## 8. 生成算法

### 8.1 坐标映射

- 先应用 EXIF 方向归一化、项目 rotation 与 crop。
- 输出矩阵每个 cell 对应裁剪图中的确定性半开像素区域。
- 不允许因为设备像素比、Canvas 缩放或浏览器插值改变采样结果。

### 8.2 采样

`average`：

- 对 cell 覆盖区域做 alpha 加权的线性 sRGB 平均。
- alpha 小于阈值的像素不贡献颜色。
- 有效 alpha 总量低于 cell 覆盖量乘 `alphaEmptyThreshold` 时生成 empty。

`nearest`：

- 采样 cell 几何中心对应的最近源像素。
- 坐标落在两个像素之间时选择较小的整数索引。
- 像素 alpha 小于阈值时生成 empty。

### 8.3 透明度

- `alphaEmptyThreshold` 范围 0–1，默认 `0.1`。
- empty 在编辑器中显示棋盘格，不自动映射为白色。
- JPEG 没有 alpha，所有裁剪内 cell 均为非空。

### 8.4 Lab 与 CIEDE2000

- `displayHex` 按 IEC sRGB 传递函数转线性 RGB。
- 使用 D65 白点转换到 CIE XYZ，再转 CIE L\*a\*b\*。
- 使用标准 CIEDE2000，参数 `kL = kC = kH = 1`。
- 仅与 `availableColorIds` 中的真实 palette color 比较。
- 色差相同到实现精度时，按 namespaced `id` 升序选择，保证跨运行稳定。
- 前后端如都实现匹配，必须共用 golden fixtures 并得到相同 ID。

### 8.5 最大颜色数

- `maximumColors` 为 `null` 时不额外约束；否则范围为 1 到当前可用颜色数。
- 先在完整可用色集合上匹配。
- 按已分配 cell 数降序、累计色差升序、namespaced ID 升序选出前 K 个真实颜色。
- 再把全部非空 cell 重映射到这 K 个颜色。
- 不得创建、混合或显示 palette 中不存在的“虚拟颜色”。

### 8.6 抖动

- `none` 为默认。
- `floydSteinberg` 使用线性 RGB 误差，固定从左到右、从上到下，不使用蛇形扫描。
- 误差权重为 7/16、3/16、5/16、1/16；empty cell 不传播或接收误差。
- 同一输入、项目参数和 palette version 必须逐 cell 产生相同结果。

## 9. 编辑器

### 9.1 Canvas

- Canvas 仅是矩阵的渲染与交互层，不保存独立真相。
- 需要处理 devicePixelRatio，但命中测试使用 CSS 坐标转换到 row/column。
- 放大时保持单元边界清晰；缩小时允许聚合预览但不得改变数据。
- 提供适合窗口、100%、放大、缩小、平移。

### 9.2 工具

- 画笔：以当前 palette color 写入 bead。
- 橡皮：写入 empty。
- 吸管：从 bead cell 选择 colorId。
- 填充：对四邻域同值区域执行确定性 flood fill。
- 选择：矩形选择、移动、复制、清空；越界部分裁剪。
- 每个完整手势是一个 undo transaction。

### 9.3 撤销与重做

- 历史至少保留 100 个 transaction，内存不足时从最旧记录裁剪。
- 新编辑发生后清空 redo 栈。
- undo/redo 恢复矩阵、revision 和由其派生的统计。
- 生成新矩阵是一个可撤销 transaction；更换源图片会开启新项目，不跨项目撤销。

### 9.4 视图与镜像

- 正面视图：用户面对成品的结果。
- 反面视图：用于熨烫/拼放检查，是正面矩阵的水平可视变换；不得暗改矩阵。
- 水平镜像：反转每行的 cell 顺序。
- 垂直镜像：反转行顺序。
- 任一相同矩阵镜像连续执行两次必须逐 cell 恢复原矩阵。

## 10. 已有图纸智能镜像合同

### 10.1 保留能力

保留现有 `backend/app/detection.py` 的网格证据提取思路，以及 `backend/app/mirror.py` 从未修改源图读取完整 cell 再重排的原则。

### 10.2 检测合同

`POST /api/grid/detect` 返回：

- 原图 SHA-256、方向归一化宽高。
- 半开网格范围。
- cellSize、rows、columns。
- 完整、严格递增、等距的 X/Y boundaries。
- confidence 和可选中文 warning。

手动模式只能在用户完整矩形附近吸附，不得悄悄替换成内部子网格。

### 10.3 镜像合同

`POST /api/grid/mirror`：

- 要求用户确认的检测合同和同一图片。
- 水平镜像只把完整 cell 列 `sourceColumn` 移到 `columns - 1 - sourceColumn`。
- 垂直镜像只把完整 cell 行 `sourceRow` 移到 `rows - 1 - sourceRow`。
- 网格外所有像素保持逐像素不变，因此标题、坐标、行列标签、图例、说明和边框必须保留。
- 网格内单元内容整体移动，不翻转单元内部文字或符号。
- 同一轴连续镜像两次必须恢复原始 RGBA 像素。
- 检测/镜像失败不应破坏已确认的上一个有效合同。

## 11. 统计与材料

矩阵每次变更后派生：

- `totalCellCount = rows * columns`。
- `blankCount`。
- `nonEmptyBeadCount`。
- `perColorCounts: Record<colorId, number>`。
- 使用颜色数。
- 每个颜色的 palette、series、code、displayHex、名称（如有）和数量。
- 物理宽高、拼板数和拼板布局。

强制不变量：

```text
sum(perColorCounts) === nonEmptyBeadCount
nonEmptyBeadCount + blankCount === totalCellCount
```

材料 inspector 默认按数量降序、namespaced ID 升序显示，可切换按系列/code 排序。筛选只能改变展示，不改变统计。

## 12. 导出

所有导出必须捕获同一个不可变 project revision；导出期间发生编辑时，旧任务取消或明确标记为旧 revision。

### 12.1 PNG

- 从矩阵渲染，不截取页面 Canvas。
- 支持纯图案与带网格/坐标/图例两个模板。
- empty 保持透明或按用户选择背景色。
- 元数据不包含原始文件名、图片哈希或上传内容。

### 12.2 PDF

- 至少包含封面摘要、分板图、坐标、色号图例、总数、分色数量和实际尺寸。
- 分板图不得裁断 cell；页码和板编号可追溯。
- 使用 Pillow/FastAPI 或浏览器原生能力；新增 PDF 依赖前必须记录必要性。

### 12.3 CSV

- UTF-8 with BOM，便于中文表格软件打开。
- 包含项目摘要、每色材料清单与逐 cell 表。
- cell 至少包含 row、column、kind、colorId、palette、series、code。

### 12.4 项目 JSON

- 使用第 6 节 schema。
- 导入时严格验证版本、矩阵尺寸、colorId 与统计，不信任缓存统计。
- 不包含原始图片字节。

### 12.5 一致性

- PNG、PDF、CSV、项目 JSON 必须引用同一 revision、rows、columns 和 colorId。
- 每种导出的材料总数必须满足统计不变量。
- 导出失败返回中文错误，不留下半成品下载。

## 13. API 与运行状态

### 13.1 能力接口

`GET /api/capabilities`

- 返回 schema versions、上传限制、尺寸限制、支持模式、采样、抖动、导出与 grid mirror 轴。

### 13.2 调色板接口

`GET /api/palettes`

- 返回 palette 摘要、版本和颜色记录。
- 必须与前端生成资产的 source version 一致。

### 13.3 图案生成

`POST /api/pattern/generate`

- multipart image + JSON settings。
- 返回完整项目矩阵、统计与必要的规范化尺寸。
- 不持久化图片或结果。

### 13.4 导出

`POST /api/pattern/export`

- 接收严格验证的 project JSON、格式与模板设置。
- 返回 PNG、PDF 或 CSV。
- 项目 JSON 可由前端直接生成，但必须使用同一验证器。

### 13.5 保留接口

- `POST /api/grid/detect`
- `POST /api/grid/mirror`
- `GET /api/health`

### 13.6 中文状态

至少覆盖：

- 等待上传、正在读取、正在解码、正在裁剪。
- 正在生成、正在取消、已生成。
- 正在保存编辑、已撤销、已重做。
- 正在检测网格、等待确认、正在智能镜像。
- 正在导出、已下载、导出失败。
- 服务不可达、请求超时、图片不受支持、图片过大、像素过多、参数无效、调色板为空、生成取消、项目不兼容。

错误响应：

```json
{
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "可操作的中文提示。"
  }
}
```

不得回显文件名、哈希、矩阵内容或请求体。

## 14. 性能目标

在推荐本地开发设备、单用户、无网络节流条件下：

- 10 MiB 内图片选取后 500 ms 内显示本地预览或加载状态。
- 100 × 100 矩阵编辑保持目标 50–60 FPS；单个普通画笔 transaction 的 UI 反馈低于 50 ms。
- 100 × 100、260 色、无抖动生成目标 3 秒内；超出时持续显示可取消状态。
- 300 × 300 为硬上限；不得因预览创建 90,000 个 DOM cell。
- Canvas 只重绘脏区或在 requestAnimationFrame 合并更新。
- 大计算不得阻塞输入；优先后端执行，纯前端派生统计应为线性复杂度。

这些是验收目标，不是生产吞吐承诺；真实结果必须在报告中记录设备与命令。

## 15. 隐私与安全

- 不使用第三方图片服务、分析 SDK 或远程字体请求。
- 不持久化上传或生成图片。
- 不把项目自动写入 localStorage、IndexedDB 或服务端。
- Object URL 在替换图片、离开项目和页面卸载时释放。
- FastAPI 校验 MIME、实际格式、字节、像素、JSON 大小和所有矩阵维度。
- SVG/HTML 不作为图片输入，避免主动内容。
- 下载文件名清理控制字符和路径分隔符。
- 所有 API 响应禁止缓存并设置 `nosniff`。

## 16. 信息架构与关键流程

### 16.1 移动端

1. 顶部：返回/项目状态/帮助。
2. 主画布：随阶段展示上传、裁剪或矩阵。
3. 底部固定主操作：下一步、生成、完成编辑或导出。
4. bottom sheet：
   - 设置：模式、行列、比例、拼豆/拼板。
   - 色板：色板、可用色、最大颜色、采样、抖动。
   - 材料：总数、分色数、实际尺寸、拼板。
   - 编辑：工具、颜色、撤销/重做、视图、镜像。

### 16.2 桌面端

- 顶部应用栏。
- 左侧任务/工具。
- 中央大画布。
- 右侧设置、palette 与材料 inspector。
- 底部或顶部明确的生成/导出主操作。

### 16.3 结果与重新开始

- 生成后直接进入可编辑矩阵，不创建虚假“完成页”。
- 导出入口显示当前 revision 和统计摘要。
- “更换图片”回到上传阶段并清理旧图；“重新生成”保留设置但创建可撤销的新矩阵。
- 刷新后显示明确空状态，不暗示项目已云端保存。

## 17. 无障碍

- 文本和关键控件满足 WCAG 2.2 AA 对比度。
- 错误不能只用颜色表达。
- 键盘可完成上传、参数设置、工具选择、单 cell 编辑、undo/redo、镜像和导出。
- Canvas 提供当前行列、选中颜色和操作说明的可访问状态；提供行列跳转输入作为键盘替代。
- `prefers-reduced-motion` 下禁用非必要 sheet 弹性和画布过渡。
- 200% 文本缩放不遮挡主操作或造成横向页面滚动。

## 18. 验收标准

### 18.1 Palette

- 自动校验默认 39、MARD 221、总计 260。
- 所有 namespaced ID 唯一；`default:A01` 与 `mard:A1` 同时存在且不碰撞。
- source/version/series/code/displayHex 完整。
- 生成资产无漂移。

### 18.2 Schema、算法与统计

- 非法矩阵、未知 colorId、版本不兼容被稳定拒绝。
- 相同输入与设置两次生成得到逐 cell 相同矩阵。
- average 与 nearest fixtures 得到预期差异。
- 透明度阈值正确生成 empty。
- 最大颜色数只使用真实 palette 颜色。
- `sum(perColorCounts) === nonEmptyBeadCount`。
- 物理尺寸与拼板计算正确。

### 18.3 编辑与镜像

- 画笔、橡皮、吸管、填充、选择在鼠标、触控和触控笔下无重复事件。
- undo/redo 精确恢复矩阵与统计。
- 水平镜像两次、垂直镜像两次均恢复原矩阵。
- 正/反面切换不修改矩阵。
- 智能图纸镜像保留标签、坐标、图例和网格外像素；同轴两次恢复原 RGBA。

### 18.4 导出与 API

- PNG/PDF/CSV/项目 JSON 的 revision、尺寸、矩阵和材料统计一致。
- API 错误均为稳定 code + 可操作中文 message。
- 请求取消不会覆盖新项目状态。
- 上传内容未写入持久存储。

### 18.5 响应式与恢复

- 320–430 px 可完成上传、裁剪、生成、编辑、统计、镜像和导出。
- bottom sheet 不遮挡选中 cell 与主操作，旋转屏幕后状态不丢失。
- 更换图片清理旧结果和 Object URL。
- 刷新显示真实空状态；服务失败后可重试并恢复流程。

## 19. 仓库实施计划

### 19.1 模块分类

| 分类         | 当前模块                               | 决策                                                                                 |
| ------------ | -------------------------------------- | ------------------------------------------------------------------------------------ |
| 保留 retain  | `backend/app/detection.py`             | 保留网格证据提取和自动/手动检测，补充合同测试与轴能力。                              |
| 保留 retain  | `backend/app/mirror.py`                | 保留从原始 cell 读取并重排的实现原则，扩展垂直轴与双镜像恒等。                       |
| 保留 retain  | `src/features/grid-selection/*`        | 保留自然图坐标与半开矩形几何，纳入已有图纸模式。                                     |
| 保留 retain  | `src/features/local-image-input/*`     | 保留本地预览、验证和 Object URL 生命周期，修正为三模式入口。                         |
| 修复 repair  | `backend/app/service.py`               | 拆出上传解码、生成、导出服务；移除 Vercel 专属业务分支。                             |
| 修复 repair  | `backend/app/models.py`                | 增加 capabilities、palette、project、generation、statistics、export 严格模型。       |
| 修复 repair  | `backend/app/main.py`                  | 增加新接口、统一错误与取消安全；保留静态前端挂载和 health。                          |
| 修复 repair  | `src/features/grid-api/client.ts`      | 改为通用 API client，接受 `AbortSignal`，保留 grid 合同解析。                        |
| 替换 replace | `src/app.ts`、`src/main.ts`            | 替换 Pixelanim 单流程，建立 upload → crop/settings → generate → edit/export 状态机。 |
| 替换 replace | `src/styles/page.css`、`tokens.css`    | 替换旧镜像工具视觉，建立移动端优先 tokens、safe area、sheet 和桌面 inspector。       |
| 替换 replace | README 中产品定义                      | 改为完整拼豆生成器，并只指向本文件作为产品权威。                                     |
| 新增 new     | owner seed、palette 生成脚本与生成资产 | 从唯一 owner seed 同时生成 JSON、TypeScript、Python 和人类清单，并执行 39/221 验证。 |
| 新增 new     | `src/domain/project/*`                 | 项目 schema、矩阵不变量、统计、物理尺寸和拼板。                                      |
| 新增 new     | `src/domain/palette/*`                 | palette 查询、可用色过滤、Lab/CIEDE2000 与匹配。                                     |
| 新增 new     | `src/features/pattern-generation/*`    | crop 映射、采样、透明度、最大颜色和抖动。                                            |
| 新增 new     | `src/features/pattern-editor/*`        | Canvas、工具、命中测试、Pointer Events、历史和视图变换。                             |
| 新增 new     | `src/features/pattern-export/*`        | PNG/CSV/JSON client 导出与 PDF API。                                                 |
| 新增 new     | backend pattern/palette/export 模块    | 后端权威生成、校验、统计与 Pillow 导出。                                             |

### 19.2 合同边界

`capabilities`：

- 前端不得硬编码后端上传、尺寸或格式上限。
- 后端返回稳定 schema 和 feature flags。

`palettes`：

- 前后端资产 source version 不一致时阻止生成并显示中文升级提示。

`pattern generate`：

- 输入是图片与 generation settings；输出是经 schema 验证的矩阵和派生统计。
- 前端不接受只有 preview URL 的“结果”。

`pattern export`：

- 输入是不可变项目 revision；输出格式必须带可验证的尺寸与材料数据。

`grid detect/mirror`：

- 独立于 pattern generate，不得被新矩阵模型弱化。
- 保持哈希、边界、网格外像素和双镜像恒等合同。

### 19.3 迁移顺序

1. 暂停 Vercel Git 部署并记录 dashboard 断连动作。
2. 建立本规范、README 入口和文档权威边界。
3. 固化 palette source、生成脚本和 39/221 测试。
4. 建立 project schema、矩阵不变量、统计、尺寸和算法 golden tests。
5. 新增后端 capabilities、palettes、generate、export，不先删除 grid API。
6. 建立移动端任务状态机、crop workspace、Canvas editor、inspector 和 exports。
7. 把旧网格 UI 收敛到 existingChart 模式。
8. 移除 Pixelanim-only 文案和 Vercel runtime 假设。
9. 完成前端检查、后端测试、构建、健康检查和手动浏览器验收。

### 19.4 回滚边界

- 在新 generate/export 验收前，不删除 `grid/detect`、`grid/mirror` 或其测试。
- palette seed 永久保留为 owner 证据；生成资产可由 source 重建。
- 每一步必须保持 `pnpm build` 与已有后端 grid tests 可运行。
- 新 UI 未达到核心流程验收时，可恢复旧 `src/app.ts`、`src/main.ts` 与样式，但不得回退本规范、palette source 或 Vercel pause。
- 不执行破坏性数据库迁移；本产品不引入数据库或持久上传存储。
- 不更改 package、仓库目录、域名、Git remote 或部署项目。
- 发现 palette 数量不匹配、文档权威冲突、需要删除用户数据、需要重命名或需要新持久化服务时立即停止并请求 owner 决策。

## 20. 验证矩阵

必须添加且运行：

- 前端：palette validation、schema、deterministic mapping、transparency、statistics、dimensions、undo/redo、horizontal/vertical double mirror、export consistency。
- 后端：palette parity、project validation、generate determinism、API errors、existing-chart label/coordinate/legend preservation、double mirror RGBA identity、PNG/PDF/CSV consistency。
- 不添加 Playwright。
- 运行 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm build`。
- 运行后端 pytest。
- 启动统一 FastAPI 服务并检查 `/api/health`、`/api/capabilities`、`/api/palettes`。
- 使用应用内浏览器手动检查：上传、裁剪、生成、编辑、统计、镜像、导出、更换图片、刷新和错误恢复。

## 21. owner 最终检查清单

- 在 Vercel Dashboard 断开 Git repository，保留项目、域名与历史。
- 确认三套移动端视觉方向中的选定方案。
- 复核 MARD 显示色仅为屏幕近似的声明。
- 用真实照片、真实像素画和真实已有图纸各验收一次。
- 核对常用拼豆直径、pitch 和拼板预设是否符合实际库存。
- 明确批准后，才可决定是否提交、推送或恢复任何部署。
