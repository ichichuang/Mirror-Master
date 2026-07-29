# 多模式预览与严格原图对比设计

- 日期：2026-07-28
- 状态：已实施并验证
- 范围：预览工作区，不改变项目 schema、生成接口或导出文件合同

## 1. 目标

预览阶段必须同时解决两个问题：

1. 用户可以在同一份权威矩阵上切换多种视觉呈现，不必等到导出页才知道不同模板的大致效果。
2. “原图”和“拼豆结果”必须使用完全相同的外框、宽高、纵横比与缩放基准；切换或按住对比时，不允许出现上下左右位移。

## 2. 预览模式

增加五种预览模式：

| 模式 ID     | 顾客文案 | 用途                                                 |
| ----------- | -------- | ---------------------------------------------------- |
| `pure`      | 纯图案   | 连续色块，不显示网格或文字                           |
| `annotated` | 带标注   | 显示单元边界、5 格与 10 格辅助线                     |
| `numbered`  | 色号图纸 | 单元内显示色号；格子过小时自动隐藏文字，保留清晰色块 |
| `rounded`   | 圆角方格 | 使用带间隔的圆角色块，接近分享图片效果               |
| `ring`      | 圆环豆粒 | 使用带中心孔的圆形豆粒，作为仅预览的实体拼豆效果     |

前四种与现有 PNG 导出模板同名对应；`ring` 是额外的仅预览模式。默认模式为 `ring`，保留当前顾客熟悉的拼豆观感。

模式切换只重绘当前矩阵，不重新请求生成接口，不修改项目矩阵、revision、统计、材料数量、撤销历史或导出默认值。

“带标注”预览只在矩阵内部展示网格与强弱辅助线。完整坐标、图例和页面排版仍以正式导出为准，界面固定说明“导出时会补充完整坐标与图例”。

## 3. 严格对齐合同

`preview-canvas-stack` 是原图、拼豆结果和裁剪调整的唯一几何容器。

- 外框尺寸只由当前矩阵 `columns / rows` 和可用槽位计算一次。
- 拼豆 Canvas 与原图 Canvas 位于同一 CSS Grid 区域，并统一使用 `position: absolute; inset: 0; width: 100%; height: 100%`，不存在独立几何计算或内在尺寸竞争。
- 两个 Canvas 使用相同 CSS 像素宽高和相同 device pixel ratio backing store。
- 原图对比显示旋转及裁剪后的有效内容，并精确缩放到整个矩阵外框。
- 原图切换不得展示整张源图、额外留白、裁剪遮罩、旋转按钮或不同尺寸容器。
- 切换模式、切换原图、按住对比和窗口缩放后，两张画布的边界必须逐项相等。

原图对比和裁剪编辑分离：

- “拼豆 / 原图”分段控件始终可见。
- 桌面“按住对比”继续存在。
- 新增次级操作“调整原图”，临时进入现有裁剪编辑层；退出调整后恢复进入前的拼豆或原图视图。
- 裁剪和旋转仍触发普通预览再生成，但不会改变比较外框。

## 4. 组件与数据流

新增 `previewMode.ts` 负责模式枚举、顾客文案、解析和默认值。`previewRenderer.ts` 负责五种矩阵绘制；`previewCrop.ts` 增加对齐原图绘制函数。

`PreviewViewController` 新增：

```ts
type PreviewRenderMode = 'pure' | 'annotated' | 'numbered' | 'rounded' | 'ring';

setRenderMode(mode: PreviewRenderMode): void;
drawAlignedOriginal(input: {
  image: HTMLImageElement;
  rotation: ImageRotation;
  crop: CropPercent;
}): void;
applyCompareView(view: 'original' | 'pattern' | 'adjust'): void;
```

`main.ts` 只保存会话级 `previewRenderMode`，绑定模式按钮和“调整原图”，并在预览结果、裁剪、旋转及 ResizeObserver 变化时重绘相应 Canvas。

## 5. 视觉与无障碍

- 模式选择使用可横向滚动的单行分段工具栏，桌面完整显示，移动端不压缩为多行。
- 每个模式按钮至少 44 px 高，使用 `aria-pressed` 表达当前状态。
- “原图”按钮不得因加载、生成、失败、去背景状态或移动端断点而隐藏。
- 模式切换和视图切换通过既有稳定状态区宣告，不增加 toast。
- 不新增图片资产，不改变现有 mint studio 色彩、圆角和字体系统。

## 6. 验收

- 五种模式均从同一矩阵绘制，切换后统计和项目 revision 不变。
- `numbered` 在足够大的单元内显示色号，在小单元内不出现不可读重叠。
- 原图 Canvas 与拼豆 Canvas 的 `getBoundingClientRect()` 在 `x/y/width/height` 上完全相等。
- 旋转、裁剪、重新生成、桌面/移动端断点切换后仍满足严格对齐。
- 原图分段按钮始终存在且可用；调整原图不会替换或隐藏该按钮。
- 320、390、768、1440 宽度无横向页面溢出；模式工具栏允许自身横向滚动。

## 7. 实施与验证记录

- 自动化：前端 271 项测试、TypeScript、ESLint、生产构建、后端 102 项测试和 `git diff --check` 均通过。
- TDD：模式合同、色号显示阈值、辅助线强度、旋转裁剪几何和界面合同均经过先失败后通过的验证。
- Browser/IAB：使用真实 `owner-grid.jpg` 在 390 × 844 和 1440 × 900 完成五种模式切换、原图切换与原图调整往返；未发现应用错误或框架错误层。
- 几何：Browser/IAB 在 320、768、1440 px 宽度下确认拼豆 Canvas 和原图 Canvas 的 `x/y/width/height` 逐项相等，页面横向溢出均为 0。390 px 首次绘制验收发现并定位了 2 px 内在尺寸竞争，随后统一改为绝对定位 `inset: 0`，并由界面合同测试锁定两张 Canvas 的同一定位规则。
- 视觉：390 px 下五个模式完整显示；320 px 下模式条只在自身内部滚动。桌面 45 列图纸的 13 px 单格可显示色号，7 px 单格仍隐藏文字以避免重叠。
- 已知仓库基线：全仓 Prettier 检查仍只报告本轮未修改的 `pnpm-lock.yaml`、`src/features/pattern-editor/canvasEditor.ts` 和 `src/features/prepare-workspace/availableColorDialog.ts`。
