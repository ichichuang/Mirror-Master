# Mirror Master Python 服务

> [产品规范](../docs/PRODUCT_SPEC.zh-CN.md) 是唯一产品权威。本文件只描述后端实现和运行方式，不得独立定义产品需求。

结构化项目 `cells` 矩阵是产品业务权威。Python 服务负责图片解码、确定性图案生成、项目校验、统计与导出；现有网格识别、边界验证和单元镜像保留为已有图纸智能镜像模块。

部署不属于产品开发范围。本地运行、容器材料和平台中立运维移交边界参见[完整中文合同](../docs/DEPLOYMENT.zh-CN.md)。

统一服务提供：

- `GET /api/health`
- `GET /api/capabilities`
- `GET /api/palettes`
- `POST /api/image/remove-background`
- `POST /api/pattern/generate`
- `POST /api/pattern/export`
- `POST /api/grid/detect`
- `POST /api/grid/mirror`
- 根路径下的已构建 `dist` 前端

交互式 API 文档默认关闭。服务没有数据库、远程存储、分析 SDK 或第三方图片服务。

## 启动

从仓库根目录执行：

```bash
./scripts/start-local.sh
```

统一服务地址为 `http://127.0.0.1:8000`，健康检查为：

```text
http://127.0.0.1:8000/api/health
```

容器材料验收：

```bash
docker compose up -d --build
```

容器内 Uvicorn 监听 `0.0.0.0:8000`，不启用 reload，也不输出访问日志。最终网络和发布方式由运维在 owner 本地验收后决定。

## `POST /api/image/remove-background`

该接口只接受一个 `multipart/form-data` 的 `file` 字段，支持经过真实 MIME 验证的 JPEG、PNG 或 WebP。上传仍使用全局 20 MiB 字节上限，但模型推理使用独立的 1200 万解码像素上限与 1 个并发槽位。EXIF 方向只归一化一次；成功响应为与归一化源图同尺寸的内存 RGBA PNG，并设置 `Cache-Control: no-store`。

推理引擎固定为 `rembg==2.0.76`、`onnxruntime==1.23.2` CPU 与项目 manifest 中的 `isnet-general-use`。进程内只建立并复用一个 session，同步 ONNX 推理在线程池中执行，不阻塞 FastAPI event loop。模型不会在用户请求期间下载，也不读取 `~/.u2net`。

模型权重不进入 Git 或 Docker build context。本地运行前，维护者需要显式执行：

```bash
backend/.venv/bin/python scripts/fetch-background-removal-model.py
```

脚本根据 `backend/models/background-removal-model.json` 下载到同目录临时 `.part` 文件，逐字节校验大小和 SHA-256 后原子安装。容器构建会在独立阶段运行同一脚本，并只把校验通过的 manifest 与 ONNX 权重复制进最终运行镜像；下载或校验失败会终止构建。模型缺失、校验失败或 session 初始化失败时，`GET /api/capabilities` 的 `backgroundRemoval.available` 为 `false`，接口返回稳定的 `503 BACKGROUND_REMOVAL_UNAVAILABLE`，不会回退到第三方服务或伪结果；前端会保留禁用入口并显示错误状态。

## `POST /api/grid/detect`

请求为 `multipart/form-data`：

- `file`：JPEG、PNG 或 WebP。
- `mode`：`auto` 或 `manual`。
- `rectangle`：手动模式可选的自然图片半开整数矩形。
- `quad`：手动模式可选，按左上、右上、右下、左下排列的四个自然图片坐标点。
- `expectedColumns`、`expectedRows`：手动模式成对提供的实际列数与行数。

```json
{ "left": 40, "top": 101, "right": 1400, "bottom": 1181 }
```

服务校验 MIME、20 MiB 字节上限、2500 万解码像素上限，并只执行一次 EXIF 方向归一化。原始上传字节的 SHA-256 会进入返回合同。

自动模式组合形态学/Hough 线条、圆环或色块连通域、RGB 变化周期和显著四边形透视校正。
所有证据拟合到同一个全局格阵；颜色只在几何固定后按格位取样。横纵格距独立，图例和
文字只有在形成主格阵内点时才可能进入候选。周期或占用范围不能唯一证明外边界时，候选
标记为 `review`，不会伪造高置信度。

手动矩形或四角与实际行列数直接定义权威区域。后端在规范化平面重建边界并重新提取
格位摘要，不搜索或替换为更短的内部子网格。

成功响应示例：

```json
{
  "contractVersion": "2.0",
  "imageSha256": "64 位小写十六进制 SHA-256",
  "naturalWidth": 1440,
  "naturalHeight": 1526,
  "selectedCandidateId": "line-服务端签名",
  "candidates": [
    {
      "candidateId": "line-服务端签名",
      "detector": "line",
      "style": "line-grid",
      "mirrorFrame": "explicit-grid",
      "sourceQuad": [
        { "x": 40, "y": 101 },
        { "x": 1400, "y": 101 },
        { "x": 1400, "y": 1181 },
        { "x": 40, "y": 1181 }
      ],
      "rectifiedWidth": 1360,
      "rectifiedHeight": 1080,
      "pitchX": 40,
      "pitchY": 40,
      "columns": 34,
      "rows": 27,
      "xBoundaries": [0, 40, 80],
      "yBoundaries": [0, 40, 80],
      "confidence": 0.8438,
      "review": "ready",
      "metrics": { "lineCoverage": 0.84 },
      "cellSummary": {
        "totalCellCount": 918,
        "occupiedCellCount": 0,
        "colorClusterCount": 0,
        "uncertainCellCount": 0,
        "matrixDigest": "64 位小写十六进制 SHA-256"
      },
      "warnings": []
    }
  ]
}
```

示例边界和 metrics 为缩写；真实响应最多三个候选，每个候选始终包含完整证据指标、
`columns + 1` 个 X 边界和 `rows + 1` 个 Y 边界。

## `POST /api/grid/mirror`

请求为 `multipart/form-data`：

- `file`：与识别时完全相同的图片。
- `contract`：前端从选中候选显式构造的 V2 最小执行合同，包含图片身份、候选 ID、四角、
  规范化尺寸、独立格距、行列、边界、`matrixDigest`、`confirmed` 和镜像轴。

服务严格验证哈希、EXIF 归一化尺寸、凸四边形、规范化资源上限、边界数量与跨度、独立
格距、行列数、进程内候选签名，并从当前图片重新计算格位摘要。未知字段、过期服务签名和
客户端篡改均被拒绝；服务重启后旧候选需要重新识别。

轴对齐且镜像配对尺寸一致时，Pillow 从未修改源图读取每个完整单元并无插值粘贴；权威
矩形外逐像素不变，同轴两次逐像素恢复。旋转、透视或取整尺寸不对称时，OpenCV 先整体
校正，在规范化平面重排完整单元，再只把四边形 mask 内逆投影回原图；四边形外逐像素
不变。成功响应直接返回内存中的 `image/png`。

## 小红书公开图文图片提取

该能力复用公开分享页 HTML 中的图片元数据，不接收登录 Cookie，不调用第三方解析服务，也不执行验证码或风控绕过。

### `POST /api/xhs/extractions`

请求为 JSON：

```json
{
  "shareText": "小红书分享文字或链接"
}
```

成功响应只返回临时 UUID 和同源预览地址，不返回小红书 CDN URL：

```json
{
  "extractionId": "123e4567-e89b-12d3-a456-426614174000",
  "images": [
    {
      "id": 0,
      "previewUrl": "/api/xhs/extractions/123e4567-e89b-12d3-a456-426614174000/images/0"
    }
  ]
}
```

### `GET /api/xhs/extractions/{extraction_id}/images/{image_id}`

按需代理一张已验证的 JPEG、PNG 或 WebP。`download=true` 时增加附件文件名；默认用于同源预览和“作为拼豆图纸”。

### `POST /api/xhs/extractions/{extraction_id}/download`

请求为 JSON：

```json
{
  "imageIds": [0, 2]
}
```

单张直接返回图片，多张返回 `xiaohongshu-images.zip`。一次最多 20 张，单图最多 20 MiB，总下载最多 100 MiB。

提取会话只保存在当前 Uvicorn 进程内存中，10 分钟后过期，最多 128 个。当前实现要求单 worker；多 worker 部署必须提供粘滞会话或共享短期存储。服务重启后用户可重新识别链接。只支持无需登录的公开图文笔记；视频、实况视频、私密、删除、过期或受风控限制的页面会返回结构化错误，并提示改用本地上传。

## 错误与隐私

错误为中文结构化 JSON，不回显文件名、哈希、边界或请求内容：

```json
{
  "error": {
    "code": "GRID_LATTICE_NOT_FOUND",
    "message": "没有找到可验证的全局格阵；请框选完整区域并填写实际行列数。"
  }
}
```

本地图片上传到用户控制的 Mirror Master 服务，仅在内存中处理，不写入持久目录，也不发送给第三方图片服务。使用小红书链接提取时，服务会访问对应的公开分享页和 `xhscdn.com` 图片；分享文本不持久化，上游 URL 只保留在 10 分钟进程内会话中，图片字节不缓存。请求结束会关闭 `UploadFile`；服务不记录文件名、请求体、完整分享链接、图片哈希、图片字节或边界数组；所有响应设置 `Cache-Control: no-store`。

## 验证

```bash
backend/.venv/bin/python -m pytest -q backend/tests
pnpm run build
```

所有者真实样本只作为未跟踪文件放在 `backend/tests/fixtures/owner-grid.jpg`。自动识别固定验收候选为：

```text
sourceQuad = [40,101] → [1400,101] → [1400,1181] → [40,1181]
pitchX = pitchY = 40
columns × rows = 34 × 27
35 个 X 边界，28 个 Y 边界
```
