# 超级镜像 V2 设计

- 状态：当前请求已批准直接实施
- 日期：2026-07-28
- 权威来源：[豆图设计台产品规范](../../PRODUCT_SPEC.zh-CN.md)
- 范围：已有图纸几何识别、候选确认、完整单元镜像

本文定义“镜像已有图纸”的 V2 行为。它替换单一正方形线网格假设，但不改变结构化
`BeadProject.cells` 的业务权威地位。

## 1. 结论

镜像以全局格位坐标为主键：

```text
识别图纸区域
→ 拟合一个全局格型
→ 为每个格位提取 CellRecord
→ 对 CellRecord 矩阵做行列映射
→ 搬运完整单元图块
→ 校验结构与图纸外区域
```

不得按颜色分别寻找、裁剪或建立镜像轴。颜色只是格位属性。按颜色分别处理会把图例、
抗锯齿、JPEG 色漂、文字、白色背景和同色相邻区域误当作独立几何对象。

## 2. 可证明的能力边界

自动识别覆盖：

- 有清晰或淡网格线的方格图；
- 没有完整网格线的圆环、圆点或独立豆粒图；
- 有间隙、色号文字或重复矩形的色块图；
- X/Y 格距不同、轻微旋转或透视的截图与照片；
- 带标题、坐标、图例、材料清单和大面积空白的分享图。

任何纯像素算法都无法从完全无边界的同色平面唯一恢复格距和相位。系统在外边界或基础
周期证据不足时必须返回可操作的复核状态，不能伪造高置信度。用户通过候选切换、完整区域、
四角和实际行列数提供约束后，后端重新生成合同。

OCR、品牌色号映射和导入为可编辑 `BeadProject` 不属于原样镜像的必要条件。本轮记录代表
色与聚类统计，但不引入 OCR 运行时或大型视觉模型。

## 3. 后端架构

### 3.1 归一化

继续复用上传 MIME、字节上限、解码像素上限、EXIF 方向归一化、RGBA 转换和原始上传
SHA-256。原图 RGBA 只用于取色与最终重建；检测使用派生的灰度、梯度、阈值、形态学和
alpha 证据，不覆盖原图。

分析图最长边限制为 2,000 像素，所有候选几何最终映射回方向归一化后的自然图坐标。

### 3.2 多证据候选

后端并行生成并统一排序以下候选：

1. `line`：保留现有自适应阈值、形态学横纵线和 Hough 证据，作为清晰表格检测器。
2. `component`：从多阈值连通域和轮廓提取圆环、圆点与矩形中心，按面积、宽高比、
   圆度和重复尺寸过滤。
3. `periodic`：在去均值的梯度与颜色变化投影上计算线性自相关，基础周期和整数倍都作为
   假设；周期证据不得单独证明外边界。
4. `rectified`：从显著四边形区域生成透视校正视图，在校正视图中复用前三类检测器。
5. `manual`：使用用户确认的四边形与行列约束直接建立格型，仍执行边界、内容和单元校验。

自动相关峰按“到更高峰的支配距离”和多周期支持排序，不按原始峰高排序。组件格型按全局
格点内点、归一化残差、跨行列覆盖和最大连通格位组排序。图例中的同色块不能凭颜色进入
主格型。

### 3.3 全局格型

每个候选只定义一个全局格型：

```ts
interface GridCandidateV2 {
  candidateId: string;
  detector: 'line' | 'component' | 'periodic' | 'rectified' | 'manual';
  style: 'line-grid' | 'ring-grid' | 'filled-cell-grid' | 'mixed';
  mirrorFrame: 'explicit-grid' | 'occupied-bounds' | 'manual-region';
  sourceQuad: readonly [Point, Point, Point, Point];
  rectifiedWidth: number;
  rectifiedHeight: number;
  pitchX: number;
  pitchY: number;
  columns: number;
  rows: number;
  xBoundaries: readonly number[];
  yBoundaries: readonly number[];
  confidence: number;
  review: 'ready' | 'review';
  metrics: GridEvidenceMetrics;
  cellSummary: CellSummary;
  warnings: readonly string[];
}
```

`sourceQuad` 顺序固定为左上、右上、右下、左下。`xBoundaries` 和 `yBoundaries` 位于
`[0, rectifiedWidth] × [0, rectifiedHeight]` 的规范化平面，允许 X/Y 格距不同以及取整后
相邻步长相差 1 像素。候选行列均为 2–300。

### 3.4 CellRecord

几何固定后，每个规范化格位提取内部记录：

```ts
interface CellRecord {
  row: number;
  column: number;
  occupied: boolean;
  representativeLab: readonly [number, number, number] | null;
  colorClusterId: number | null;
  confidence: number;
}
```

单元图块只存在请求内存中，不进入 JSON。代表色从避开边界的原图内部区域取中位数，
转到 Lab 后按格位样本聚类；不得对全图像素聚类。检测响应只返回汇总和矩阵摘要：

```ts
interface CellSummary {
  totalCellCount: number;
  occupiedCellCount: number;
  colorClusterCount: number;
  uncertainCellCount: number;
  matrixDigest: string;
}
```

`matrixDigest` 绑定行列、占用位与量化代表色，用于发现合同或实现漂移，不替代图片哈希。

### 3.5 候选评分和拒绝

响应公开指标，不把 OpenCV 求解器的参数命名为业务概率：

- `lineCoverage`；
- `latticeInlierRatio`；
- `normalizedResidual`；
- `periodicityScore`；
- `harmonicMargin`；
- `boundarySupport`；
- `cellConsistency`；
- `hypothesisAgreement`。

后端把指标解析为 `ready` 或 `review`。以下情况至少为 `review`：

- 外边界由占用范围推断；
- 候选前两名分差不足；
- 透视校正；
- 基础周期与整数倍证据接近；
- 单元不确定比例过高；
- 只有周期证据而没有线条、组件或用户约束。

没有可形成至少 2 × 2 格位的候选时返回稳定的 `GRID_LATTICE_NOT_FOUND`。外边界不可唯一
判断但存在占用格型时返回候选并附 `GRID_BOUNDARY_UNCERTAIN` 警告，不静默扩展空白行列。

## 4. API V2

### 4.1 检测

`POST /api/grid/detect` 保留路径和 multipart 上传，返回：

```ts
interface GridDetectionResultV2 {
  contractVersion: '2.0';
  imageSha256: string;
  naturalWidth: number;
  naturalHeight: number;
  selectedCandidateId: string;
  candidates: readonly GridCandidateV2[];
}
```

最多返回三个去重候选。自动模式不接受人工区域。手动模式接受 `rectangle` 或 `quad`，
并可接受 `expectedColumns`、`expectedRows`；行列约束必须同时提供。

### 4.2 镜像

前端显式序列化图片身份、合同版本、选中候选和轴，不把显示 envelope 展开后原样提交。
后端重新验证：

- 图片 SHA-256 与方向归一化尺寸；
- 由进程内密钥对图片身份、执行几何和矩阵摘要签发的 candidate ID；服务重启后旧候选
  必须重新识别；
- 四边形顺序、凸性、面积和图片边界；
- 规范化平面尺寸、边界数量、严格递增和完整跨度；
- 平均格距与 `pitchX`/`pitchY`；
- 行列上限、候选 ID 和矩阵摘要格式。

轴对齐、整数边界且镜像配对格宽/格高相等的候选走无插值路径，从未修改源图裁取并粘贴
完整单元；网格外 RGBA 逐像素不变，同轴两次逐像素恢复。规范化取整后若镜像配对尺寸
不相等，必须进入插值路径，不能声称无损。

旋转或透视候选先用 homography 校正到规范化平面，在该平面重排完整单元，再投影回
`sourceQuad`。四边形外 RGBA 逐像素不变；矩阵同轴两次完全恢复，但插值路径不承诺图片
逐像素恒等。

## 5. 前端确认流

确认页继续是单一工作区，不增加 modal：

- 展示行列、检测方式、镜像范围、已识别格位/颜色聚类和后端复核状态；
- 多候选时提供“上一个/下一个候选”和 `候选 N / M`；
- 每次候选或几何变化都重置 warning 确认；
- 网格以单个 SVG path 绘制投影网格，不能为 300 × 300 创建 90,000 个 DOM cell；
- 允许拖动完整区域和四角，松开后提交后端重新识别；
- 修改行列数提交后端约束，不再在浏览器伪造新合同；
- 错误使用可换行的独立状态区域，保留稳定错误码对应的可操作说明。

检测由独立 coordinator 管理。新检测实际 abort 旧请求；加载和失败期间保留上一个有效
候选、覆盖层和镜像结果。只有成功的新候选才使旧镜像结果失效。

## 6. 测试与验收

自动化固定覆盖：

- X/Y 格距不同的圆环图；
- 无贯通网格线、带文字和图例干扰的色块图；
- 每五格粗线的基础周期选择；
- 轻微透视图的四边形校正；
- 多候选排序、谐波警告和无格型拒绝；
- 候选合同篡改、过期图片和越界四边形拒绝；
- 完整 cell 搬运、单元内部文字方向、网格外像素和双镜像；
- 候选切换、warning 重置、真实 abort、失败保留上次结果；
- 320、390 和 1440 CSS px 的候选与确认操作可达。

所有真实 owner 样例和新增合法公开/自制回归图必须记录金标准行列、镜像范围和允许的
置信状态。缺少原始样例时不得声称已经校准其具体行列。

## 7. 研究依据

- OpenCV 形态学横纵线、连通域、SimpleBlobDetector、Hough、RANSAC homography、
  `warpPerspective`、Lab 和 k-means 官方文档。
- Liu、Collins、Tsin（2004）关于自动相关格型峰与谐波假峰的主论文。
- CIEDE2000 官方颜色标准；本轮只保留未来品牌色匹配边界，不作为镜像寻址。
