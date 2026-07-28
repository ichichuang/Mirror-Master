# 豆图设计台产品设计与 Codex 实施蓝图

> 文档类型：非规范性产品设计与实施蓝图  
> 目标仓库：`ichichuang/Mirror-Master`  
> 远端基线：`main@d8f38d5829cdc63bf9e69837481d5b37a7e281cd`  
> 设计日期：2026-07-27  
> 适用产品：移动端优先的拼豆图纸创作 Web 应用  
> 建议仓库路径：`docs/plans/2026-07-27-mirror-master-product-design-codex-blueprint.zh-CN.md`

## 0. 权威关系与执行规则

本文件不是新的 PRD，也不是第二份产品规范。

`docs/PRODUCT_SPEC.zh-CN.md` 继续作为产品目标、领域模型、算法合同、接口边界、用户体验和验收标准的唯一规范性权威。本文件只负责把当前仓库状态、已确认的产品问题和后续设计方案整理成可供 Codex 分阶段执行的蓝图。

执行任何阶段前必须遵循以下顺序：

1. 读取 `docs/PRODUCT_SPEC.zh-CN.md`、`README.md`、`src/brand/brand.config.json`、设计 Token、当前相关实现和测试。
2. 将本阶段新增或改变的规范性合同先合并进 `docs/PRODUCT_SPEC.zh-CN.md`。
3. 再修改代码、测试、基准和 QA 证据。
4. 若本文件与 `docs/PRODUCT_SPEC.zh-CN.md` 冲突，以后者为准，并在同一变更中修正本文件。
5. 不创建新的 `PRD`、`SPEC`、产品规范或竞争性权威文档。
6. 不执行部署，不新增托管平台绑定，不修改仓库名、package 名、本地目录或远程设置。
7. 不以重写现有领域、Canvas、生成算法、色板资产、智能镜像或导出系统作为默认方案。
8. 未经 owner 明确授权，不提交、不推送、不创建分支或 Pull Request。

---

## 1. 当前产品基线

### 1.1 已经具备的核心资产

当前仓库并不是从零开始。以下能力已经存在并应作为后续升级的稳定底座：

- Vite、TypeScript 和模块化 feature 目录。
- FastAPI、OpenCV 和 Pillow 后端。
- 结构化 `cells` 拼豆颜色矩阵，作为生成、编辑、统计、镜像和导出的唯一业务真相。
- 照片模式、像素画模式和已有图纸智能镜像模式。
- 裁剪、旋转、图案行列、拼豆尺寸、拼板规格、色板筛选和颜色数量控制。
- 默认 39 色与 MARD 221 色的生成型色板资产。
- Lab 与 CIEDE2000 颜色匹配、透明处理和抖动。
- Canvas 画笔、橡皮、吸管、填充、矩形选择、复制、移动和清空。
- 差异型撤销与重做。
- 正面、反面、水平镜像和垂直镜像。
- 材料统计、分色数量、实际尺寸和拼板布局。
- PNG、制作级 PDF、CSV 和项目 JSON。
- Vaadin Button、Select、RadioGroup、Checkbox、TextField、Dialog 和 ConfirmDialog 的类型化适配。
- 移动端三态 bottom sheet、桌面工具 rail 与 inspector。
- 品牌配置和三层设计 Token 生成体系。

### 1.2 当前主要问题

当前问题集中在产品体验，不在底层能力数量：

| 编号  | 问题                                                                        | 对普通用户的影响                       |
| ----- | --------------------------------------------------------------------------- | -------------------------------------- |
| UX-01 | 上传前先要求理解“制作新图纸 / 镜像已有图纸”任务                             | 第一次使用时增加决策负担               |
| UX-02 | 上传、裁剪、设置、生成和编辑被拆成多个明显阶段                              | 用户不能快速看到自己的图片会变成什么样 |
| UX-03 | 必须理解图案大小、拼豆规格、色板、颜色细节和制作方式后才能生成              | 认知成本高，容易放弃                   |
| UX-04 | 设置变化主要围绕正式生成，不是持续可见的即时预览                            | 用户难以通过试错找到满意结果           |
| UX-05 | “容易制作、模拟渐变、自然图片、清晰像素、取色方式、抖动”分散在不同控制中    | 普通用户无法理解这些参数之间的关系     |
| UX-06 | 编辑能力虽然完整，但高频修图任务仍需逐格完成                                | 清理杂点、减少颜色和替换错误色效率低   |
| UX-07 | 产品在导出结束，但没有覆盖真实拼豆制作过程                                  | 用户仍需自行逐色、逐板和记录进度       |
| UX-08 | 项目默认只保存在当前会话                                                    | 刷新、误关闭或隔日继续会丢失进度       |
| UX-09 | 现有色板范围有限，缺少多品牌转换和自定义导入                                | 无法覆盖更多真实材料使用场景           |
| UX-10 | 功能分布在顶部栏、Canvas 工具、inspector、bottom sheet、Dialog 和导出状态中 | 用户难以形成稳定心智模型               |

### 1.3 产品升级判断

产品不应复制其他拼豆网站的功能表，而应吸收其低学习成本和即时反馈：

```text
上传图片
→ 自动给出第一个可制作结果
→ 调整少量可理解选项
→ 快速修图
→ 按颜色和拼板完成制作
→ 导出或继续保存
```

Mirror-Master 的长期优势应是：

```text
即时生成体验
+ 严格结构化矩阵
+ 真实色号与材料统计
+ 专业编辑
+ 已有图纸智能镜像
+ 制作级导出
+ 逐色制作流程
```

---

## 2. 产品设计目标

### 2.1 产品愿景

让没有图像处理知识、没有像素画经验、第一次做拼豆的人，也能在手机上把一张普通图片快速变成准确、可编辑、可备料、可跟做和可保存的拼豆项目。

### 2.2 北极星任务

第一次使用的用户应能在不打开“专业设置”的情况下完成：

1. 选择一张图片。
2. 在短时间内看到自动生成的拼豆预览。
3. 理解图案大小、颜色数量、成品尺寸和材料数量。
4. 调整一个视觉风格并立即看到变化。
5. 修正明显错误。
6. 开始逐色制作或导出图纸。

### 2.3 成功指标

以下指标用于产品验收，不要求当前阶段接入远程分析平台：

| 指标                         | 目标                               |
| ---------------------------- | ---------------------------------- |
| 从首页到首次预览所需主要点击 | 不超过 2 次                        |
| 首次预览前必答设置           | 0 项                               |
| 默认流程中可见核心设置组     | 不超过 4 组                        |
| 移动端完成核心流程           | 不依赖桌面端                       |
| 上传后首次可理解反馈         | 立即显示解码、分析或预览状态       |
| 设置变化反馈                 | 自动更新，不要求再次寻找“生成”按钮 |
| 主操作数量                   | 每个阶段同时只存在 1 个视觉主操作  |
| 触控目标                     | 不小于 44 × 44 CSS px              |
| 顾客界面技术术语             | 0 个未解释的内部名词               |
| 未保存状态                   | 始终可见且可恢复                   |
| 键盘与读屏基础流程           | 可完成                             |
| 320–1440 px 横向页面溢出     | 0 px                               |

---

## 3. 用户与任务模型

### 3.1 核心用户

#### 用户 A：第一次做拼豆的普通用户

- 不知道色号体系。
- 不理解像素采样、抖动和色差。
- 关心“好不好看、要多少豆、做出来多大”。
- 需要系统自动推荐，不希望先学习工具。

#### 用户 B：已有拼豆经验的爱好者

- 手边有固定品牌和色号。
- 关心成品尺寸、颜色数量、材料清单和图案可制作性。
- 需要快速减少杂色、替换缺色和分板制作。

#### 用户 C：手作工作室或高频制作者

- 需要精确行列、拼板、色号、PDF 和 CSV。
- 需要可重复编辑、项目恢复、快捷键和高密度桌面工作区。
- 不需要商城、库存、订单或客户关系系统。

#### 用户 D：已有图纸需要镜像的用户

- 已有带坐标、标题、图例或色号的图纸。
- 只希望翻转拼豆格，不破坏图纸外信息。
- 需要确认识别网格并导出镜像结果。

### 3.2 核心 Jobs to Be Done

| 任务         | 用户表达                                     |
| ------------ | -------------------------------------------- |
| 快速生成     | “我只想上传一张图，先看看能不能做成拼豆。”   |
| 调整效果     | “颜色太杂或脸不像，我想简单调一下。”         |
| 使用现有材料 | “我手边只有这些色号，不要生成我没有的颜色。” |
| 快速修图     | “把零散杂点清掉，把这个颜色全部换掉。”       |
| 准备材料     | “告诉我每个色号需要多少颗，一共多大。”       |
| 实际制作     | “我现在要照着图一块一块做，并记住做到哪里。” |
| 保存继续     | “我今天没做完，下次打开继续。”               |
| 打印交付     | “给我一份可以打印、按拼板制作的 PDF。”       |
| 镜像图纸     | “翻转已有图纸中的拼豆格，但保留坐标和图例。” |

---

## 4. 设计原则

### 4.1 结果先于设置

用户上传后先看到结果，再理解设置。设置是用来修正结果的，不是进入结果前的考试。

### 4.2 自动推荐默认可用

每个必需参数必须有可靠默认值。用户不打开专业设置也能得到可制作结果。

### 4.3 使用任务语言

普通界面使用：

- 图案大小
- 成品尺寸
- 颜色数量
- 效果风格
- 拼豆品牌
- 手边有的颜色
- 清理杂点
- 替换颜色
- 开始制作
- 保存项目

普通界面禁止直接出现：

- Lab
- CIEDE2000
- alpha
- schema
- revision
- contract
- enum
- raster budget
- worker token
- sampling algorithm

### 4.4 同一个项目、同一份矩阵

预览、编辑、统计、制作进度和导出都必须围绕同一结构化项目模型。不得用截图、Canvas 像素或派生图片替代 `cells`。

### 4.5 主操作唯一

任何时刻只突出一个下一步：

- 首页：选择图片
- 预览：编辑图纸
- 编辑：开始制作
- 制作：继续下一颜色或下一拼板
- 导出：下载当前选择
- 项目库：继续编辑

### 4.6 高级能力渐进展示

普通用户先看到最少控制。专业用户通过展开、键盘和桌面 inspector 获得完整能力。

### 4.7 所有自动操作可预览、可撤销

批量替色、杂点清理、相近色合并、裁剪、重新生成和镜像都必须：

1. 显示影响范围。
2. 提供前后对比。
3. 作为单个 undo transaction 提交。
4. 允许取消，不产生部分写入。

### 4.8 不牺牲移动端

桌面端可以更密集，但不得成为完成核心任务的必要条件。移动端优先验证 390 × 844，并覆盖 320、375、430 px。

---

## 5. 产品范围

### 5.1 本蓝图包含

- 单入口上传与自动首个预览。
- 结果优先的预览工作台。
- 原图与拼豆结果对比。
- 可理解的效果风格预设。
- 自动重新生成与旧任务取消。
- 快速清理、全局替色和相近色合并。
- 单色高亮和逐色制作。
- 逐板制作与制作进度。
- 本地项目、自动草稿和最近项目。
- 多品牌色板、缺色替代和自定义色板导入。
- 空白画布和 CSV 矩阵导入的后续入口。
- 现有导出体验优化。
- 现有图纸智能镜像流程优化。
- 移动端、平板和桌面完整响应式设计。

### 5.2 明确不包含

- 商城、购物车、支付、订单和物流。
- 会员套餐、积分、营销和广告。
- 库存、入库、出库、采购和补货。
- CRM、顾客标签、员工和角色权限。
- 社区动态、评论、关注和公开内容审核。
- 未经授权的版权图案库。
- 3D 拼豆、立体拆件和复杂建模。
- 生产部署、域名、证书或托管商集成。
- 用 AI 云服务替代当前确定性颜色匹配。
- 为追求视觉效果而更换当前技术栈或重写稳定领域层。

---

## 6. 总体信息架构

```text
AppShell
├─ StartWorkspace
│  ├─ PrimaryImageUpload
│  ├─ RecentProjects
│  ├─ OpenSavedProject
│  └─ MoreTasks
│     ├─ MirrorExistingChart
│     ├─ ImportPatternCSV
│     └─ StartBlankCanvas
├─ PreviewWorkspace
│  ├─ SourceCrop
│  ├─ PatternPreview
│  ├─ OriginalComparison
│  ├─ EssentialControls
│  ├─ AdvancedSettings
│  └─ PreviewSummary
├─ EditorWorkspace
│  ├─ PatternCanvas
│  ├─ ToolRail
│  ├─ ColorPanel
│  ├─ CleanupPanel
│  ├─ MaterialsPanel
│  ├─ ProjectSettings
│  └─ HistoryAndViewControls
├─ MakingWorkspace
│  ├─ BoardNavigator
│  ├─ ColorNavigator
│  ├─ MakingCanvas
│  ├─ ProgressSummary
│  └─ SessionControls
├─ ExportWorkspace
│  ├─ ShareImage
│  ├─ PrintPDF
│  ├─ MaterialsCSV
│  └─ ProjectJSON
├─ ProjectLibrary
│  ├─ DraftList
│  ├─ ProjectPreview
│  ├─ Duplicate
│  ├─ Rename
│  ├─ ExportBackup
│  └─ Delete
└─ ChartMirrorWorkspace
   ├─ GridDetection
   ├─ GridCorrection
   ├─ OriginalAndResult
   └─ MirrorExport
```

### 6.1 顶层阶段

前端的用户阶段建议收敛为：

```ts
type AppStage = 'start' | 'preview' | 'editor' | 'making' | 'export' | 'projects' | 'chartMirror';
```

内部照片或像素模式仍是生成参数，不成为顶层页面。

### 6.2 返回行为

| 当前阶段     | 返回结果                                           |
| ------------ | -------------------------------------------------- |
| Preview      | 返回 Start，保留当前源图直到确认更换               |
| Editor       | 返回 Preview，保留当前矩阵；重新生成前提示覆盖编辑 |
| Making       | 返回 Editor，保留全部制作进度                      |
| Export       | 返回来源阶段，恢复原 tab、焦点和滚动位置           |
| Projects     | 返回 Start                                         |
| Chart Mirror | 返回 Start；未导出结果时提示                       |

浏览器后退和应用内返回应遵循同一状态机，不允许直接丢弃未保存编辑。

---

## 7. 全局应用框架

### 7.1 顶部栏

#### 移动端

- 高度 52–56 px。
- 左侧：返回按钮，仅在非 Start 阶段显示。
- 中间：当前任务标题，不显示营销文案。
- 右侧：保存状态或更多菜单。
- 不同时放置超过两个图标操作。
- 顶部栏不承担颜色、工具或生成设置。

#### 桌面端

- 高度 56–60 px。
- 左侧：品牌和当前项目名。
- 中间：阶段导航摘要，例如“预览图纸”或“逐色制作”。
- 右侧：保存状态、项目入口和更多操作。
- 不显示无意义的大型品牌区域。

### 7.2 保存状态

统一显示以下状态之一：

- 已自动保存
- 正在保存…
- 有未保存更改
- 仅保存在本机
- 保存失败，点击重试

不得使用 revision、同步 token 或内部错误码作为主文案。

### 7.3 通知

- 非阻塞成功使用稳定状态区或短时 toast。
- 错误必须说明“发生了什么”和“用户接下来能做什么”。
- 取消不是错误。
- 同类通知同一时刻只显示一条。
- 影响当前任务的错误不得在 2 秒后自动消失。

### 7.4 ConfirmDialog 使用场景

仅用于不可逆或覆盖性操作：

- 更换源图片。
- 重新生成并替换已编辑矩阵。
- 删除本地项目。
- 放弃未保存修改。
- 清除全部制作进度。
- 导入项目覆盖当前项目。

按钮顺序固定为：

1. 主安全选项。
2. 明确的破坏性选项。
3. 取消。

---

## 8. 屏幕设计

## 8.1 StartWorkspace：开始页

### 目标

让普通用户不用理解模式，直接上传图片并开始。

### 移动端布局

```text
┌──────────────────────────────┐
│ 豆图设计台          本机保存 │
├──────────────────────────────┤
│ 把图片变成可制作的拼豆图纸   │
│ 自动匹配色号、计算材料，可继续编辑 │
│                              │
│ [ 选择图片 ]                 │
│ PNG / JPEG / WebP，最大 20 MB│
│                              │
│ 最近项目                     │
│ [项目缩略图] 项目名  65%     │
│                              │
│ 打开已保存项目               │
│ 更多制作方式                 │
└──────────────────────────────┘
```

### 桌面端布局

- 页面中心为 560–680 px 的主任务区域。
- 左侧或上方为简短标题与说明。
- 选择图片是唯一实心主按钮。
- 最近项目最多显示 3 个。
- “镜像已有图纸”“导入 CSV”“空白画布”放入“更多制作方式”，不得与上传同权。

### 控件

1. `选择图片`
2. 拖放区域，仅桌面增强，不作为唯一入口
3. 最近项目
4. `打开已保存项目`
5. `更多制作方式`
6. 隐私与本地保存说明

### 文案

- 标题：`把图片变成可制作的拼豆图纸`
- 说明：`自动匹配色号、计算材料，还可以继续修改。`
- 主按钮：`选择图片`
- 更多任务：`镜像已有图纸`、`导入图案数据`、`从空白画布开始`
- 隐私：`图片只用于生成当前图纸，不会发送给第三方图片服务。`

### 状态

| 状态           | 表现                           |
| -------------- | ------------------------------ |
| 初始           | 显示主上传                     |
| 拖放悬停       | 边界和背景增强，不改变布局     |
| 文件不支持     | 就地显示支持格式               |
| 文件过大       | 显示最大尺寸及重新选择         |
| 最近项目为空   | 不显示空白卡片区域             |
| 本地存储不可用 | 显示“当前浏览器无法保存草稿”   |
| 服务能力不可用 | 仍允许进入兼容模式，并说明限制 |

### 验收

- 首屏不要求选择“照片 / 像素画”。
- 首屏不要求选择“制作新图纸 / 镜像已有图纸”。
- 选择图片后自动进入 Preview。
- 用户可以在 320 px 宽度下看见主按钮和格式说明。
- 无最近项目时页面不出现大面积空容器。

---

## 8.2 PreviewWorkspace：即时预览与准备

### 目标

上传后立即给出第一个结果，让用户通过少量设置快速调整。

### 核心行为

1. 文件解码成功后立即进入 Preview。
2. 使用默认裁剪和自动推荐参数启动首个预览。
3. 先显示低成本占位或渐进预览，再替换为权威矩阵。
4. 设置变化自动触发预览更新。
5. 新任务取消旧任务。
6. 用户不需要再点击“生成图纸”。
7. 只有进入 Editor 时才将当前预览结果确认为编辑基线。

### 移动端布局

```text
顶部栏：预览图纸 / 保存状态

[原图 | 拼豆]  [按住看原图]
┌──────────────────────────────┐
│                              │
│       当前拼豆预览           │
│                              │
└──────────────────────────────┘

摘要：48 × 63 颗 · 24 色 · 约 24 × 31.5 cm

底部面板（单一）
- 图案大小
- 颜色数量
- 效果风格
- 拼豆品牌
- 专业设置
[ 编辑图纸 ]
```

### 桌面端布局

```text
┌──────────────┬────────────────────────┬────────────────┐
│ 原图与裁剪   │ 拼豆结果               │ 调整           │
│              │                        │ 图案大小       │
│              │                        │ 颜色数量       │
│              │                        │ 效果风格       │
│              │                        │ 拼豆品牌       │
│              │                        │ 专业设置       │
│              │                        │ [编辑图纸]     │
└──────────────┴────────────────────────┴────────────────┘
```

中央结果区域宽度优先，右侧控制为 304–344 px。

### 核心设置

#### 图案大小

显示方式：

- 小巧：长边约 29 颗
- 推荐：长边约 48 颗
- 细致：长边约 72 颗
- 自定义：宽 × 高

同时显示：

- 行列数
- 预计成品尺寸
- 预计拼板数量

不要把预设和宽高输入同时以同等视觉权重展开。默认显示预设，选择“自定义”后才展开输入。

#### 颜色数量

建议改为预设加滑杆：

- 简单：12 色
- 推荐：24 色
- 细致：48 色
- 自定义：1–当前色板上限

实时显示：

`当前预计使用 18 色`

#### 效果风格

将现有分散参数映射为四个顾客预设：

| 顾客预设 | 适合                 | 内部映射原则                   |
| -------- | -------------------- | ------------------------------ |
| 清晰色块 | 图标、卡通、简单图案 | 像素优先、无抖动、较少颜色     |
| 自然还原 | 人像、照片、插画     | 平均取色、无抖动、推荐颜色数   |
| 鲜艳突出 | 颜色偏灰或主体不突出 | 轻度饱和与对比增强后匹配       |
| 细腻渐变 | 天空、阴影、渐变     | Floyd-Steinberg 或等价现有抖动 |

这些只属于 UI preset，不进入 project schema 作为新的领域模式。最终仍解析到现有生成合同。

每个预设使用当前图片的小型真实预览，不使用通用插画占位。

#### 拼豆品牌

显示：

- 品牌名称
- 色板颜色数量
- 当前可用色数量
- 当前预计匹配警告

默认使用当前已批准色板。未来多品牌加入后保持同一控件合同。

#### 专业设置

默认折叠，包含：

- 图片处理方式
- 格子取色方式
- 颜色接近方式
- 透明区域
- 拼豆直径与间距
- 拼板规格
- 手边可用色
- 自定义行列
- 原始裁剪数值

### 原图对比

提供三种方式，但同一端只暴露最适合的两种：

- 分段按钮：原图 / 拼豆
- 按住查看原图
- 滑动对比线

移动端默认使用“原图 / 拼豆”和“按住查看原图”。桌面允许滑动对比。

### 生成状态

| 状态             | 文案                                           |
| ---------------- | ---------------------------------------------- |
| 解码             | 正在读取图片…                                  |
| 分析             | 正在为这张图片选择合适设置…                    |
| 预览             | 正在更新拼豆预览…                              |
| 完成             | 已更新：48 × 63 颗，18 色                      |
| 取消             | 不显示错误                                     |
| 服务失败但可降级 | 当前使用兼容模式生成预览                       |
| 失败             | 无法生成预览。保留当前结果，可重试或调整图片。 |

预览更新时保留旧结果并在其上显示轻量状态，不把 Canvas 清空成加载页。

### 主操作

`编辑图纸`

进入 Editor 后：

- 当前权威矩阵成为编辑历史基线。
- 原图片、裁剪和生成设置继续保存在会话或本地草稿中。
- 用户可返回 Preview 调整设置。
- 如存在生成后编辑，重新生成前使用 ConfirmDialog。

### 验收

- 上传后不要求点击额外生成按钮。
- 旧预览在新预览生成期间保持可见。
- 快速连续改变设置时只有最后一次结果生效。
- 普通设置总数不超过 4 组。
- 专业设置默认关闭。
- 390 × 844 下 Canvas、摘要和主操作均可访问。
- 任何设置改变不重建整个面板节点，不丢失焦点、输入法和滚动位置。

---

## 8.3 EditorWorkspace：图案编辑

### 目标

让普通用户快速修正明显问题，让专业用户完成精细编辑。

### 布局原则

- Canvas 是唯一 dominant surface。
- 工具和信息围绕 Canvas，不与其竞争。
- 移动端使用一个 app-level bottom sheet。
- 桌面端使用左侧 tool rail 和右侧 inspector。
- 视图、历史和缩放操作保持紧凑。

### 工具分组

#### 基础工具

- 画笔
- 橡皮
- 吸管
- 填充
- 选择

#### 快速修图

- 替换颜色
- 清理杂点
- 合并相近颜色
- 修剪空白边缘
- 图案居中

#### 视图

- 适应画布
- 100%
- 放大
- 缩小
- 原图参考
- 正面
- 反面

#### 历史

- 撤销
- 重做

### 移动端 bottom sheet

#### Peek

始终显示：

- 当前工具
- 当前颜色 swatch 与色号
- 未保存状态
- `工具与颜色`
- 主操作 `开始制作`

#### Half

Tab：

- 工具
- 颜色
- 清理
- 材料
- 设置

#### Full

用于：

- 长色板
- 清理结果列表
- 材料统计
- 高级项目设置
- 导出

不得在 sheet 上叠加第二个 drawer 或 picker。颜色选择继续使用批准的 Vaadin Dialog 合同；移动端可使用全屏 theme。

### 颜色面板

显示顺序：

1. 当前颜色
2. 最近使用
3. 已使用颜色
4. 全部可用颜色

支持：

- 搜索色号或名称
- 系列筛选
- 全部 / 已使用 / 最近
- 按数量排序
- 按色号排序
- 按颜色族排序
- 单色高亮
- 全局替换入口

每个 swatch 至少显示：

- 颜色
- 品牌与色号
- 使用数量
- selected 状态
- 缺色或替代警告

不得仅靠颜色区分 selected 和不可用状态。

### 原图参考

模式：

- 关闭
- 轮廓
- 半透明覆盖
- 左右对比

参考层只用于视图，不写入矩阵。

### 选择工具

保留矩形选择、复制、移动、清空和取消，并增加：

- 选区内替换颜色
- 选区内清理杂点
- 选区内只保留指定颜色

任何批量操作作为一个 undo transaction。

### Canvas 输入

- 单指：当前工具。
- 双指：平移与缩放。
- 触控笔：当前工具。
- 鼠标滚轮：缩放。
- 空格键或中键：平移。
- 键盘方向键：移动焦点 cell。
- Enter 或 Space：应用当前工具。
- Escape：取消选区或待落位状态。

### 主操作

默认：`开始制作`

次级：

- 调整生成效果
- 完成并导出
- 保存项目

`开始制作`是完成实物的主路径，导出不再是唯一完成动作。

---

## 8.4 CleanupPanel：智能清理

### 目标

用少量可理解操作解决自动生成后的典型问题。

### 功能一：孤立色点检测

定义：

- 一个颜色区域的连通单元数量小于阈值。
- 默认只扫描 1–3 个 cell 的四邻域连通块。
- empty 不作为颜色。
- 只建议，不自动写入。

界面显示：

- `发现 14 处零散颜色`
- Canvas 高亮建议区域。
- 列表按影响 cell 数排序。
- 每项显示当前位置、原色和建议替代色。

操作：

- 应用全部
- 逐项应用
- 忽略
- 调整范围

### 功能二：小区域杂色清理

选项：

- 轻度：仅 1 cell
- 推荐：1–2 cell
- 强力：1–4 cell
- 自定义

替代色选择依据：

1. 相邻占比。
2. 色差。
3. 保持边缘连续性。
4. 不使用 `availableColorIds` 之外的颜色。

提交前显示：

- 将改变多少格
- 颜色数变化
- 前后对比

### 功能三：相近色合并

界面展示候选颜色对：

`MARD A14 42 颗 → MARD A15 13 颗`

同时显示：

- 两色 swatch
- 色差等级：很接近 / 接近 / 差异明显
- 合并后颜色数
- 合并后材料变化

默认不自动合并颜色数较多的一方到颜色数较少的一方；建议依据总视觉误差决定。

### 功能四：全局替换颜色

步骤：

1. 选择原颜色。
2. 选择目标颜色。
3. 显示影响数量。
4. 选择范围：全部图案或当前选区。
5. 预览。
6. 应用。

目标颜色必须属于项目 `availableColorIds`。

### 功能五：修剪与居中

- 修剪空白边缘只删除四周连续 empty 行列。
- 图案居中只在当前矩阵内移动有效区域。
- 改变行列尺寸前明确显示新尺寸和成品尺寸变化。
- 两者均可撤销。

### 状态与验收

- 扫描期间不阻塞现有编辑。
- 新扫描取消旧扫描。
- 清理建议不修改矩阵。
- 应用时生成一个 bounded diff transaction。
- 清理后统计、材料和制作进度同步更新。
- 已完成制作进度对应的 cell 发生变化时，必须提示重新核对受影响格子。

---

## 8.5 MakingWorkspace：逐色制作模式

### 目标

让用户直接照着图案制作，并记录完成状态。

### 进入方式

Editor 主操作：`开始制作`

首次进入显示非阻塞说明：

`选择一种颜色，按图中高亮位置摆放。完成后切换下一种颜色。`

不使用多页 onboarding 弹窗。

### 核心模式

#### 按颜色制作

- 一次突出一种颜色。
- 其他颜色可选择变灰、轮廓显示或隐藏。
- 显示当前色号、总数量、已完成和剩余。
- 下一颜色默认按材料数量降序，也支持色号排序。

#### 按拼板制作

- 显示整体拼板地图。
- 当前板有清晰位置，例如“第 2 行第 3 块”。
- 只显示当前板或在整体图中突出当前板。
- 每块板显示局部行列坐标。

#### 按行列制作

- 可选逐行或逐列高亮。
- 适合大图和纸面制作习惯。
- 不作为默认模式。

### 制作 Canvas

每个 cell 状态：

```ts
type MakingCellState = 'pending' | 'completed';
```

交互：

- 点击当前目标颜色 cell：标记完成。
- 再次点击：撤销。
- 拖动：连续标记同色 cell。
- 非当前颜色默认不可标记，避免误操作。
- 提供“允许标记全部颜色”高级选项。

### 进度信息

- 整体完成率。
- 当前颜色进度。
- 当前拼板进度。
- 已完成颜色数。
- 剩余拼豆数量。
- 最近操作时间。

### 控件

- 上一种颜色
- 下一种颜色
- 当前颜色选择
- 上一块拼板
- 下一块拼板
- 显示方式
- 撤销本次标记
- 重置当前颜色
- 结束制作并返回编辑
- 导出当前制作状态

### 屏幕常亮

制作模式可请求 Screen Wake Lock：

- 首次使用时说明用途。
- 页面隐藏或系统撤销时正确释放。
- 不支持时不显示错误阻断任务。
- 返回前台时可重新请求。

### 本地保存

制作进度必须自动保存在本地项目中，包括：

```ts
interface MakingProgress {
  projectId: string;
  projectRevision: number;
  completedCellKeys: string[];
  activeColorId: string | null;
  activeBoardIndex: number;
  navigationMode: 'color' | 'board' | 'row' | 'column';
  displayMode: 'dimOthers' | 'outlineOthers' | 'hideOthers';
  updatedAt: string;
}
```

`completedCellKeys` 的实际存储应使用压缩或分块结构，不能对大型矩阵使用无界字符串数组；上面只描述语义。

### 编辑后的进度一致性

- 单纯视图变化不影响制作进度。
- cell 颜色发生变化时，该 cell 的完成状态重置为 pending。
- 行列或矩阵整体重建时，旧进度不得静默保留。
- 镜像、移动和复制需要定义确定性进度映射；首个版本可在操作前要求确认并清除受影响进度。
- 导入项目时校验进度所引用的 cell 和 revision。

### 移动端布局

```text
顶部：当前板 / 整体进度
主区：制作 Canvas
浮动摘要：MARD A14 · 剩余 38 颗
底部：
[上一色] [完成 42/80] [下一色]
[颜色] [拼板] [显示] [返回编辑]
```

控件不能持续遮挡当前板。

### 验收

- 用户可在 390 × 844 完成逐色制作。
- 刷新后恢复当前颜色、当前板和进度。
- 制作状态与矩阵 revision 不匹配时明确阻止错误恢复。
- 不需要导出 PDF 才能完成制作。
- 进度标记不写入 `cells`。
- 制作模式只读图案内容，不提供画笔类编辑。

---

## 8.6 ExportWorkspace：导出与交付

### 目标

保持现有专业导出能力，同时降低用户选择成本。

### 四个任务

1. 分享图片
2. 打印制作
3. 材料清单
4. 保存项目

### 分享图片

模板调整为：

- 纯图案
- 网格图
- 色号图
- 分享卡片

其中：

- `纯图案`保持透明背景。
- `网格图`包含网格与坐标。
- `色号图`包含网格、坐标和 cell 色号或符号。
- `分享卡片`包含图案预览、尺寸、颜色数和总珠数。

实现时需判断现有 `pure / annotated` 枚举是否扩展。若扩展属于规范性合同，先修改 canonical spec、API capabilities 和导出测试。

### 打印制作 PDF

保留制作级多页 PDF，界面增加下载前摘要：

- 总页数
- 拼板数量
- 页面尺寸
- 打印比例
- 是否包含材料总表
- 是否包含局部色号图例

不允许把 PDF 退化为单张图片。

### 材料清单

下载前直接显示：

- 总珠数
- 颜色数
- 每色数量
- 按数量 / 品牌 / 系列 / 色号排序
- 复制纯文本
- 复制表格
- 下载 CSV

### 保存项目

- 保存到本机项目库。
- 下载 JSON 备份。
- 导入后继续编辑。
- 可选择是否包含制作进度；若 schema 变化必须先更新 canonical spec。
- 原始图片字节默认不进入项目 JSON。

### 导出预览

- PNG 显示缩略图。
- PDF 显示摘要与第一页预览。
- CSV 显示前若干行。
- JSON 显示项目摘要，不展示原始 schema 内容。

### 验收

- 所有导出引用同一不可变 project snapshot。
- 编辑时旧导出失效。
- 下载前用户理解将获得什么。
- 移动端不叠加第二层 modal。
- 导出失败不产生半成品。
- 用户能返回原阶段并恢复原焦点、tab 和滚动位置。

---

## 8.7 ProjectLibrary：本地项目

### 目标

让用户隔日继续，不依赖云端账户。

### 存储边界

使用 IndexedDB 保存：

- 项目模型。
- 项目名称。
- 缩略图。
- 生成设置。
- 源图片可选工作副本或可恢复引用策略。
- 制作进度。
- 创建时间和更新时间。
- 本地 schema version。

不得保存：

- 用户账户。
- 远程同步 token。
- 文件系统绝对路径。
- 与项目无关的浏览记录。
- 原始上传文件名作为公开项目标识。

### 项目列表

每项显示：

- 缩略图。
- 项目名。
- 行列尺寸。
- 颜色数。
- 制作进度。
- 更新时间。
- 本机保存标记。

操作：

- 继续
- 重命名
- 复制
- 导出备份
- 删除

删除必须 ConfirmDialog。

### 自动草稿

触发：

- 矩阵 transaction 完成。
- 生成设置确认。
- 制作进度变化。
- 项目名称变化。

策略：

- 防抖保存。
- 页面隐藏时尝试 flush。
- 保存失败不阻塞编辑，但持续显示。
- 不能在每个 pointer sample 上写 IndexedDB。
- 需要 schema migration 和失败恢复。

### 本地项目 ID

使用稳定、无业务含义的 ID。项目名由用户编辑，默认可为：

`未命名图纸 2026-07-27`

### 源图片策略

首个版本可以：

- 将处理后的工作位图以 Blob 保存到 IndexedDB。
- 设置明确大小预算。
- 超预算时只保存矩阵和设置，并提示重新生成需要重新选择图片。
- 不把大图 base64 写入 JSON 或 localStorage。

### 验收

- 刷新后可继续编辑。
- 同一项目的矩阵、统计和制作进度一致。
- 存储配额不足时保留当前内存项目并提供 JSON 备份。
- private browsing 或 IndexedDB 不可用时明确降级为会话模式。
- 自动草稿不造成 Canvas 卡顿。

---

## 8.8 ChartMirrorWorkspace：镜像已有图纸

### 目标

保留当前独有能力，并将其从首页主决策降为明确的高级任务。

### 入口

Start → 更多制作方式 → 镜像已有图纸

辅助说明：

`只翻转拼豆格，保留坐标、标题和图例。`

### 流程

```text
选择图纸
→ 自动识别网格
→ 用户确认或调整
→ 选择水平 / 垂直
→ 预览原图与结果
→ 导出镜像图
```

### 布局

移动端：

- 顶部步骤摘要。
- 主区显示图纸与红色网格。
- 底部单一控制面板：识别结果、重置、方向和导出。

桌面端：

- 中央大图。
- 右侧识别摘要和方向控制。
- 原图 / 镜像结果切换。

### 改进

- 识别置信度使用顾客语言：
  - 网格识别清晰
  - 建议检查网格边缘
  - 未能可靠识别，请手动选择
- 明确显示行列和单格大小。
- 手动调整提供四边和整体框，不要求用户输入内部边界数组。
- 镜像结果必须显示“坐标和图例保持原位”的说明。
- 识别失败保留用户已选择的图片。
- 重新识别不自动覆盖用户确认过的有效网格。

### 验收

- 网格外像素逐像素保持。
- 同轴镜像两次恢复原图。
- 移动端可完成网格确认和导出。
- 该流程不引入项目矩阵时，也不能破坏现有镜像能力。

---

## 8.9 BlankCanvas：空白画布

此阶段在即时预览、清理、制作模式和本地项目稳定后实施。

### 入口

Start → 更多制作方式 → 从空白画布开始

### 初始设置

- 宽 × 高
- 拼豆规格
- 拼豆品牌
- 背景：透明或指定颜色
- 拼板规格

### 进入结果

直接创建合法结构化项目并进入 Editor。

### 模板

首批只提供通用尺寸：

- 29 × 29
- 48 × 48
- 72 × 72
- 自定义

不建设未经授权的角色图案库。

---

## 8.10 CSV 图案导入

### 用途

导入结构化行列或色号数据，不与材料清单 CSV 混淆。

### 入口

Start → 更多制作方式 → 导入图案数据

### 合同要求

在实现前先定义独立导入格式：

- 格式版本。
- 行列。
- palette ID。
- cell 类型。
- colorId 或品牌色号。
- empty 表示。
- 编码和分隔符。
- 错误定位。

不得把现有导出 CSV 直接当作唯一导入合同，除非 canonical spec 明确规定可逆格式。

---

## 9. 响应式设计

### 9.1 断点

| 范围        | 布局                                         |
| ----------- | -------------------------------------------- |
| 320–767 px  | 全屏单任务 + 单一 bottom sheet               |
| 768–1023 px | Canvas 主区 + 窄工具 rail + 可收起 inspector |
| ≥1024 px    | 左工具 rail + 中央 Canvas + 右常驻 inspector |

### 9.2 移动端

- 使用 `100svh` / `100dvh` 兼容策略。
- 顶部栏固定。
- 主 Canvas 使用除顶部栏和 sheet peek 外的最大空间。
- sheet 三态：peek、half、full。
- sheet 高度计算包含 safe area 和软键盘。
- sheet 拖动期间跟手，释放后按位置和速度吸附。
- 主操作位于 sheet 安全区。
- 不允许页面整体与 Canvas 同时争抢单指手势。
- 颜色或材料长列表仅在 sheet 内滚动。
- Dialog 打开时由 Vaadin 负责焦点和 modality。

### 9.3 平板

- 竖屏保持移动工作流，但可显示窄工具 rail。
- 横屏优先双栏：Canvas + inspector。
- 不同时显示 tool rail、双 inspector 和 bottom sheet。
- 软键盘出现时输入区域滚动到可见位置。

### 9.4 桌面

- Tool rail：56–64 px。
- Inspector：304–344 px。
- Canvas 不小于剩余主内容 55%。
- 使用鼠标、键盘和滚轮增强，但不改变移动端核心合同。
- 窗口变窄时 inspector 优先折叠，不压缩 Canvas 到不可用。
- 色板 Dialog 支持搜索、筛选和虚拟或分块渲染。

### 9.5 横屏手机

- 顶部栏缩小到 48–52 px。
- bottom sheet 可变为右侧 sheet，或使用更低 peek。
- 主操作仍可见。
- 不出现横向页面滚动。
- 颜色 Dialog 使用双列：筛选区 + 颜色区。

---

## 10. 视觉系统

### 10.1 视觉方向

继续使用“暖白专业材料工作台”：

- 安静。
- 准确。
- 工具感强但不冰冷。
- 拼豆图案和真实色板是唯一丰富色彩来源。
- 不像儿童玩具。
- 不像后台管理系统。
- 不使用营销式大标题和大面积装饰。

### 10.2 现有语义色

继续保留当前批准值：

| Token                       | 值        | 用途            |
| --------------------------- | --------- | --------------- |
| `color.background.page`     | `#F7F8F5` | 页面背景        |
| `color.background.panel`    | `#FFFFFF` | 面板            |
| `color.background.subtle`   | `#EEF2EF` | 次级区域        |
| `canvas.background`         | `#E7E3DA` | Canvas 外围     |
| `color.text.primary`        | `#1F2933` | 主文字          |
| `color.text.secondary`      | `#5F6B66` | 次文字          |
| `color.border.default`      | `#DCE2DE` | 边界            |
| `color.action.primary`      | `#0F766E` | 主操作          |
| `color.action.primaryHover` | `#115E59` | hover / pressed |
| `color.action.primarySoft`  | `#D9EEEA` | selected 背景   |
| `color.focus.ring`          | `#14B8A6` | 焦点            |
| `color.status.error`        | `#B42318` | 错误            |
| `color.status.warning`      | `#9A5B13` | 警告            |

新增状态不得直接在组件中写死颜色，应通过现有 Token 生成链扩展。

### 10.3 排版

- 系统无衬线字体。
- 页面标题 20–24 px。
- 面板标题 16–18 px。
- 正文 14–16 px。
- 输入值至少 16 px。
- 辅助文字不小于 12 px。
- 色号使用等宽数字特征或系统等宽字体时，必须保证中文回退。
- 不使用超大 hero 标题。

### 10.4 圆角与表面

- 常规表面 10 px。
- 主按钮和强调输入 12 px。
- bottom sheet 顶角 18 px。
- 不把所有按钮做成 pill。
- 常规边界 1 px。
- 阴影只用于 sheet、Dialog 和浮动上下文栏。
- 卡片不使用多层阴影和玻璃拟态。

### 10.5 图标

继续使用生成型 Phosphor Icons 资产：

- 图标必须配中文可访问名称。
- 仅图标按钮至少 44 × 44。
- active 不只改变图标颜色，还需要背景、边界或文字。
- 不混用不同线宽和不同图标风格。

### 10.6 动效

| 场景               | 时长       | 规则                     |
| ------------------ | ---------- | ------------------------ |
| 阶段进入           | 160–220 ms | opacity + ≤8 px 位移     |
| sheet 吸附         | 180–240 ms | ease-out，无弹跳         |
| pressed / selected | 80–140 ms  | 背景、边界或 ≤0.98 scale |
| 对比滑杆           | 跟手       | 不补间延迟               |
| Canvas 平移缩放    | 跟手       | 不做装饰性动画           |
| 批量清理预览       | 120–180 ms | 高亮淡入，不闪烁         |

支持 `prefers-reduced-motion`，减少非必要位移。

---

## 11. 组件设计

### 11.1 继续使用 Vaadin 的场景

- Button
- Select
- RadioGroup
- Checkbox
- TextField
- Dialog
- ConfirmDialog

不得重新引入自研焦点陷阱、选择器、模态底层或浏览器原生 confirm。

### 11.2 项目自有组件

建议建立或扩展以下 feature-owned 组件/控制器：

| 组件                          | 责任                           |
| ----------------------------- | ------------------------------ |
| `PrimaryImageUpload`          | 上传、拖放、状态和格式限制     |
| `RecentProjectCard`           | 本地项目摘要                   |
| `PatternPreviewSurface`       | 当前权威预览与更新状态         |
| `OriginalComparisonControl`   | 原图 / 拼豆切换和按住对比      |
| `EssentialGenerationControls` | 四组普通设置                   |
| `StylePresetPreview`          | 当前图片的风格小预览           |
| `ProjectSummaryStrip`         | 行列、颜色、尺寸、拼板、总珠数 |
| `CleanupSuggestionList`       | 清理建议和批量应用             |
| `ColorReplacementFlow`        | 全局或选区替色                 |
| `MakingColorNavigator`        | 当前颜色和前后切换             |
| `MakingBoardNavigator`        | 拼板地图与位置                 |
| `MakingProgressSummary`       | 制作进度                       |
| `LocalProjectLibrary`         | 草稿列表和操作                 |
| `SaveStatusIndicator`         | 自动保存状态                   |
| `ExportPreview`               | PNG/PDF/CSV/JSON 摘要          |
| `WorkspaceStageController`    | 顶层阶段与返回行为             |

组件按任务和数据边界拆分，不因为视觉卡片机械拆分。

### 11.3 持久节点要求

以下节点不得在普通状态变化时通过 `innerHTML` 整体重建：

- Preview controls
- Workspace inspector
- Workspace sheet
- Palette panel
- Cleanup panel
- Materials panel
- Making controls
- Export panel
- Local project list容器

更新必须保留：

- DOM identity
- focus
- selection range
- IME composition
- scroll position
- expanded state
- sheet state
- active tab

---

## 12. 数据与领域扩展

### 12.1 不变合同

以下仍为强制权威：

- `cells` 是图案真相。
- palette color 必须存在于项目允许集合。
- 材料统计从矩阵派生。
- Canvas 不保存独立矩阵。
- 导出捕获不可变项目快照。
- 镜像结果保持确定性。
- undo/redo 使用 bounded diff history。

### 12.2 UI 会话状态

建议建立：

```ts
interface ProductSessionState {
  stage: AppStage;
  activeProjectId: string | null;
  sourceImageAvailable: boolean;
  previewStatus: PreviewStatus;
  saveStatus: SaveStatus;
  activeInspectorPanel: InspectorPanel;
  mobileSheetState: 'peek' | 'half' | 'full';
  returnFocusTarget: string | null;
}
```

### 12.3 预览状态

```ts
type PreviewStatus =
  | { kind: 'idle' }
  | { kind: 'decoding' }
  | { kind: 'analyzing' }
  | { kind: 'generating'; requestId: string }
  | { kind: 'ready'; requestId: string }
  | { kind: 'fallback'; message: string }
  | { kind: 'error'; message: string; recoverable: boolean };
```

### 12.4 清理建议

```ts
interface CleanupSuggestion {
  id: string;
  kind: 'isolatedCluster' | 'similarColorMerge' | 'globalReplacement';
  affectedCells: readonly CellCoordinate[];
  sourceColorIds: readonly string[];
  targetColorId: string;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
}
```

建议不是项目模型的一部分。只有用户应用后才产生矩阵 transaction。

### 12.5 本地项目记录

```ts
interface LocalProjectRecord {
  id: string;
  name: string;
  schemaVersion: string;
  project: BeadProject;
  previewBlob?: Blob;
  sourceWorkBlob?: Blob;
  makingProgress?: MakingProgress;
  createdAt: string;
  updatedAt: string;
}
```

实际持久化结构必须可迁移、可校验并满足存储预算。

### 12.6 项目 JSON

若需要把制作进度纳入 JSON：

- 先更新 canonical spec。
- 增加明确 schema version。
- 旧版本导入保持兼容或给出稳定错误。
- 制作进度不得影响矩阵和材料统计校验。
- 原始图片仍不默认进入 JSON。

---

## 13. 预览与性能架构

### 13.1 混合处理原则

不删除后端。采用：

- 前端快速视觉预览。
- 后端权威矩阵生成。
- OpenCV 智能镜像继续后端处理。
- 导出继续使用现有稳定路径。

### 13.2 前端快速预览

可评估：

- Web Worker
- OffscreenCanvas
- 降采样工作位图
- 局部预览缓存

前端预览不得产生与后端权威结果不可解释的明显差异。若无法保证一致，优先显示旧权威结果和生成状态，而不是展示误导性临时矩阵。

### 13.3 任务协调

每次生成任务使用：

- 唯一 request ID。
- `AbortController`。
- 最新任务令牌。
- 参数稳定序列化。
- 迟到结果丢弃。
- 可选短期结果缓存。

### 13.4 缓存键

至少包含：

- 源工作位图标识。
- 裁剪。
- 旋转。
- rows / columns。
- palette version。
- availableColorIds。
- maximumColors。
- mode。
- sampling。
- dithering。
- alpha threshold。
- 风格预处理参数。

不得使用原始文件名作为缓存身份。

### 13.5 性能预算

| 场景           | 要求                                      |
| -------------- | ----------------------------------------- |
| 单 cell 编辑   | 不复制完整矩阵                            |
| 快速 stroke    | cell 插值完整，无漏格                     |
| Canvas 更新    | `requestAnimationFrame` 合并              |
| 清理扫描       | Worker 或分块，保持 UI 可交互             |
| IndexedDB 保存 | transaction 后防抖，不在 pointermove 写入 |
| 颜色列表       | 大色板避免一次性昂贵重排                  |
| 300 × 300      | 编辑、统计、保存和清理均有明确基准        |
| 导出           | 保留现有页数和 raster budget 防线         |

---

## 14. 可访问性

### 14.1 键盘

- Tab 顺序符合视觉顺序。
- RadioGroup 使用方向键。
- Select 和 Dialog 依赖 Vaadin 官方键盘合同。
- Tool rail 支持箭头或常规 Tab。
- Canvas 提供可发现的键盘替代。
- Escape 关闭非破坏性临时状态。
- 不使用键盘陷阱。

### 14.2 读屏

- 每个图标按钮有中文名称。
- 生成、保存、导出和清理状态使用 `aria-live`。
- swatch 读出品牌、色号、名称、数量和 selected 状态。
- 制作进度读出当前颜色和剩余数量。
- Canvas 提供可理解的总体描述和当前位置反馈。
- 颜色不作为唯一信息。

### 14.3 对比度

- 文本和控件达到 WCAG AA。
- focus ring 清晰。
- palette swatch 内文字根据颜色选择可读前景，或放在 swatch 外。
- error、warning 和 selected 同时使用图标、边界或文字。

### 14.4 减少动画

- 尊重 `prefers-reduced-motion`。
- 禁用非必要位移和缩放。
- 保留状态变化但缩短或去除动效。

---

## 15. 错误、空状态和恢复

### 15.1 文件错误

文案格式：

`无法打开这张图片。请选择 PNG、JPEG 或 WebP 文件。`

`这张图片超过 20 MB。请压缩后重新选择。`

### 15.2 生成错误

`无法更新预览。当前图纸已保留，可以重试或调整设置。`

### 15.3 色板错误

`当前图案包含此色板中不存在的颜色。请选择替代色后继续。`

### 15.4 本地保存错误

`无法保存到本机。当前编辑仍保留在页面中，建议下载项目备份。`

### 15.5 存储配额不足

显示：

- 当前项目仍可继续编辑。
- 下载项目 JSON。
- 删除旧项目。
- 不再保存源工作图片，只保存矩阵。

### 15.6 项目版本不兼容

`这个项目由更新版本创建，当前版本无法安全打开。请更新应用或保留文件。`

不得静默丢弃未知字段或颜色。

### 15.7 空状态

- 无最近项目：不显示空卡片。
- 无已使用颜色：说明“图案中还没有拼豆颜色”。
- 无清理建议：`没有发现明显的零散颜色。`
- 制作完成：显示总体完成，不强制进入营销完成页。

---

## 16. 文件与模块建议

以下是建议边界，不要求一次性移动所有文件。

```text
src/
├─ app/
│  ├─ appShell.ts
│  ├─ stageController.ts
│  ├─ sessionState.ts
│  └─ saveStatus.ts
├─ features/
│  ├─ start-workspace/
│  │  ├─ startWorkspace.ts
│  │  ├─ recentProjects.ts
│  │  └─ taskLauncher.ts
│  ├─ preview-workspace/
│  │  ├─ previewWorkspace.ts
│  │  ├─ previewCoordinator.ts
│  │  ├─ originalComparison.ts
│  │  ├─ generationPresets.ts
│  │  └─ previewSummary.ts
│  ├─ pattern-editor/
│  │  ├─ canvasEditor.ts
│  │  ├─ originalReference.ts
│  │  └─ editorWorkspace.ts
│  ├─ cleanup-tools/
│  │  ├─ isolatedClusters.ts
│  │  ├─ similarColorMerge.ts
│  │  ├─ colorReplacement.ts
│  │  ├─ trimAndCenter.ts
│  │  └─ cleanupPanel.ts
│  ├─ making-mode/
│  │  ├─ makingState.ts
│  │  ├─ makingCanvas.ts
│  │  ├─ colorNavigator.ts
│  │  ├─ boardNavigator.ts
│  │  ├─ progressPersistence.ts
│  │  └─ wakeLock.ts
│  ├─ local-projects/
│  │  ├─ projectStore.ts
│  │  ├─ projectMigrations.ts
│  │  ├─ draftCoordinator.ts
│  │  └─ projectLibrary.ts
│  ├─ palette-platform/
│  │  ├─ paletteImport.ts
│  │  ├─ paletteConversion.ts
│  │  └─ substituteColors.ts
│  ├─ export-completion/
│  └─ chart-mirror/
├─ domain/
│  ├─ project.ts
│  ├─ history.ts
│  ├─ makingProgress.ts
│  └─ localProject.ts
└─ workers/
   ├─ preview.worker.ts
   └─ cleanup.worker.ts
```

### 16.1 `main.ts` 收敛

目标：

- `main.ts` 只负责 bootstrap、全局依赖、顶层控制器创建和生命周期。
- 不继续累积页面模板、DOM 查询、业务算法、持久化和状态转换。
- 不做一次性大重写。
- 每个阶段以行为不变的窄迁移逐步抽离。
- 每次抽离后运行当前相关检查和真实浏览器验收。

### 16.2 `app.ts` 收敛

目标：

- 不继续成为所有阶段 HTML 的单文件模板。
- 先抽离 Start 和 Preview。
- 再抽离 Making 和 Projects。
- Editor 保持稳定，直到新 stage controller 可接管。
- 保留 data hook 的兼容迁移，避免一次修改所有控制器。

---

## 17. 分阶段实施路线

## Stage 4A：结果优先的核心流程

### 目标

消除首次使用的主要阻力。

### 必做

- Start 单一主上传入口。
- 更多任务降级。
- 上传后自动进入 Preview。
- 自动生成首个结果。
- Preview 结果优先布局。
- 原图 / 拼豆切换。
- 四组普通设置。
- 专业设置折叠。
- 设置变化自动生成。
- 旧任务取消和迟到结果丢弃。
- `编辑图纸`主操作。
- 现有 Editor、矩阵和导出行为保持。

### 暂不做

- Worker 临时矩阵。
- 清理工具。
- 制作进度。
- IndexedDB 项目库。
- 多品牌色板。

### 完成标准

普通用户不理解算法也能在移动端完成上传、查看预览和进入编辑。

---

## Stage 4B：实时预览性能与对比

### 目标

让调整过程快速且稳定。

### 必做

- Preview coordinator。
- 请求去重、取消、缓存。
- 旧结果保持。
- 渐进状态。
- 当前图片的风格预览。
- 滑动或按住原图对比。
- 性能基准。
- 大图工作位图策略。

### 完成标准

连续调节设置不闪空、不混入旧结果、不造成明显主线程卡顿。

---

## Stage 4C：快速清理与替色

### 目标

减少逐格修图成本。

### 必做

- 全局与选区替色。
- 孤立色点扫描。
- 小区域杂色清理。
- 相近色合并建议。
- 修剪空白边缘。
- 图案居中。
- 前后对比。
- 单 transaction 应用。
- 统计和材料同步。

### 完成标准

所有批量操作可预览、可取消、可撤销，不产生非法颜色。

---

## Stage 5A：逐色制作模式

### 目标

覆盖从图纸到实物的核心过程。

### 必做

- Making stage。
- 按颜色制作。
- 按拼板制作。
- cell 完成标记。
- 整体、颜色和拼板进度。
- 本地会话恢复。
- Wake Lock 降级。
- 编辑后进度一致性。

### 完成标准

用户不导出 PDF，也能用手机完成一件拼豆作品并恢复进度。

---

## Stage 5B：多品牌色板平台

### 目标

覆盖更多真实材料。

### 必做

- 定义品牌色板数据证据要求。
- Perler、Hama、Artkal 等独立命名空间。
- 同一生成脚本产出前后端资产。
- 品牌转换。
- 缺色替代。
- 自定义 CSV / JSON 色板导入。
- 色板版本和项目兼容。

### 完成标准

色号不冲突、来源可追溯、转换结果可复核，页面主题不受材料色板影响。

---

## Stage 5C：本地项目与离线草稿

### 目标

让项目可持续使用。

### 必做

- IndexedDB store。
- 自动草稿。
- 最近项目。
- 项目列表。
- 制作进度持久化。
- schema migration。
- 配额和 private mode 降级。
- JSON 备份。
- 可选 PWA 应用壳。

### 完成标准

刷新后可继续，保存失败有恢复路径，不影响编辑性能。

---

## Stage 6：创作入口扩展

### 目标

从图片转换器升级为通用拼豆创作工具。

### 必做

- 空白画布。
- CSV 图案导入。
- 常用尺寸模板。
- 文字生成器可作为独立后续设计。
- 只读分享必须单独设计权限和隐私合同。

### 暂不做

- 社区。
- 商城。
- 3D 建模。
- 云端账户系统。

---

## 18. Stage 4A Codex 任务拆分

| 顺序 | 类型     | 任务                                    | 主要文件                        | 验收                       |
| ---: | -------- | --------------------------------------- | ------------------------------- | -------------------------- |
|    1 | 审计     | 锁定远端、本地和规范基线                | repo、canonical spec            | 无未解释漂移               |
|    2 | 文档     | 将 Stage 4A 合同合并进 canonical spec   | `docs/PRODUCT_SPEC.zh-CN.md`    | 无竞争文档                 |
|    3 | 重构     | 建立顶层 stage controller               | `src/main.ts`、新 app 模块      | 现有流程仍可进入           |
|    4 | 重构     | Start 单一主上传入口                    | `src/app.ts` 或新 Start feature | 首屏无必答模式             |
|    5 | 新增     | 上传后自动 Preview                      | Preview feature                 | 无额外生成点击             |
|    6 | 重构     | Prepare 改为结果优先 Preview            | Preview、prepare controls       | Canvas 为 dominant surface |
|    7 | 新增     | 原图 / 拼豆对比                         | comparison feature              | 移动端可用                 |
|    8 | 重构     | 四组普通设置                            | presets、Vaadin controls        | 专业设置默认关闭           |
|    9 | 新增     | 自动重新生成协调器                      | pattern API client、coordinator | 旧任务取消                 |
|   10 | 优化     | 保留旧预览和稳定状态                    | Preview renderer                | 无闪空                     |
|   11 | 重构     | `编辑图纸`确认编辑基线                  | stage controller、history       | 矩阵和 undo 正确           |
|   12 | 响应式   | 320–1440 px 几何                        | styles、tokens                  | 0 横向溢出                 |
|   13 | 可访问性 | 键盘、焦点、aria-live                   | controls、markup                | 基础流程可完成             |
|   14 | 验证     | 定向测试、完整 `pnpm check`、浏览器验收 | tests、QA docs                  | 全部通过                   |

---

## 19. 验收矩阵

### 19.1 视口

- 320 × 700
- 375 × 812
- 390 × 844
- 430 × 932
- 768 × 1024
- 1024 × 768
- 1440 × 900
- 740 × 390 横屏手机

### 19.2 输入

- 鼠标
- 触控板
- 单指触控
- 双指触控
- 触控笔
- 键盘
- 读屏基础路径

### 19.3 核心流程

1. 图片上传。
2. 自动预览。
3. 快速连续调节设置。
4. 返回和重新生成。
5. 编辑单格。
6. 撤销和重做。
7. 批量替色。
8. 清理建议。
9. 开始制作。
10. 制作进度恢复。
11. 导出四种任务。
12. 本地项目保存与恢复。
13. 已有图纸网格识别与镜像。
14. 错误和取消。

### 19.4 数据不变量

```text
sum(perColorCounts) === nonEmptyBeadCount
nonEmptyBeadCount + blankCount === rows * columns
all non-empty cells reference availableColorIds
all exports use one immutable project snapshot
making progress never changes cells
cleanup suggestions never change cells before apply
```

### 19.5 性能

- 100 × 100 编辑基准。
- 300 × 300 编辑基准。
- 300 × 300 清理扫描。
- IndexedDB 自动草稿。
- 快速连续预览请求。
- 大色板搜索和筛选。
- 大型 PDF 预算边界。

---

## 20. Codex 执行合同

Codex 必须遵守：

1. Read the repository, canonical product specification, current implementation, generated assets, tests, and recent commit history before editing.
2. Treat `docs/PRODUCT_SPEC.zh-CN.md` as the sole normative product authority.
3. Update the canonical specification before implementing any new normative behavior.
4. Preserve the structured project matrix as the single business truth.
5. Preserve the current generation algorithms, palette generation pipeline, Canvas engine, smart chart mirroring, material invariants, and production-grade exports unless a proven defect requires a narrow repair.
6. Do not replace Vite, TypeScript, FastAPI, OpenCV, Pillow, Vaadin, Phosphor Icons, or the generated token architecture.
7. Do not add a second product specification, PRD, competing design authority, or deployment plan.
8. Do not add fake controls, mock results, placeholder project data, non-functional buttons, or speculative APIs.
9. Keep customer-visible language in Simplified Chinese and keep internal technical terms out of the customer interface.
10. Use existing Vaadin components for supported controls and overlays; do not recreate focus traps, select menus, radio groups, dialogs, or confirm surfaces.
11. Make mobile completion possible at 390 × 844 and verify all required viewports.
12. Preserve focus, input values, IME composition, scroll positions, active tabs, and sheet state during UI updates.
13. Use typed state, typed events, AbortController, latest-request guards, bounded history, and deterministic transformations.
14. Run generated-asset checks whenever palette, icon, token, or brand sources change.
15. Run targeted checks during implementation and the complete `pnpm check` before claiming completion.
16. Perform real rendered browser acceptance for the affected flows.
17. Do not deploy.
18. Do not commit, push, create a branch, or modify remote state unless the owner explicitly authorizes it in the execution request.
19. Report exact baseline, changed files, preserved contracts, validation results, remaining risks, and final workspace state.
20. Stop and report a blocker rather than silently weakening a product invariant.

---

## 21. 首个 Codex 执行范围

首个实现任务只执行 Stage 4A，不同时开始 Stage 4B、4C、5A、5B、5C 或 Stage 6。

### 必须保持

- 当前项目 schema。
- 当前 palette IDs 和 seed。
- 当前 Lab / CIEDE2000。
- 当前 Canvas 工具。
- 当前 undo / redo。
- 当前正反面和矩阵镜像。
- 当前已有图纸智能镜像。
- 当前 PNG / PDF / CSV / JSON。
- 当前 Vaadin 适配。
- 当前品牌与 Token。
- 当前后端 API，除非 Stage 4A 的请求协调需要兼容性扩展。

### Stage 4A 输出

- canonical spec 更新。
- Start 单入口。
- Preview stage。
- 自动首个预览。
- 原图对比。
- 四组普通设置。
- 专业设置折叠。
- 自动更新与旧请求取消。
- `编辑图纸`主操作。
- 响应式与可访问性修复。
- 定向测试、完整检查、浏览器验收和 QA 证据。

### Stage 4A 不得输出

- 假的制作模式。
- 假的项目库。
- 假的多品牌色板。
- 没有算法支持的“AI 优化”按钮。
- 仅视觉存在但无数据合同的清理入口。
- 新部署配置。
- 新产品规范文件。
- 全量重写。

---

## 22. 推荐本地存放位置

将本文件放入：

```text
/Users/cc/Work/neobv/Mirror Master/Mirror-Master/docs/plans/2026-07-27-mirror-master-product-design-codex-blueprint.zh-CN.md
```

该文件必须在顶部保留“非规范性产品设计与实施蓝图”声明，并链接仓库中的 canonical specification。

---

## 23. 可直接发送给 Codex 的启动指令

```text
Work only in /Users/cc/Work/neobv/Mirror Master/Mirror-Master on the current main baseline, read docs/PRODUCT_SPEC.zh-CN.md and docs/plans/2026-07-27-mirror-master-product-design-codex-blueprint.zh-CN.md in full, execute Stage 4A only using a docs-first approach, preserve the current matrix/domain/Canvas/palette/mirroring/export contracts, do not deploy or modify Git history or remote state, run all required generated-asset checks, targeted checks, the complete pnpm check, and real rendered browser acceptance, then report the exact baseline, changed files, validations, preserved contracts, remaining risks, and final clean workspace state.
```
