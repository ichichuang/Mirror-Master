# Mirror Master Python 服务

Python 是网格识别、边界验证、单元镜像和 PNG 编码的唯一权威。前端只提交图片、识别模式、可选手动矩形，以及服务已返回并由用户确认的网格合同。

生产服务同时提供：

- `GET /api/health`
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

Docker 部署：

```bash
docker compose up -d --build
```

容器内 Uvicorn 监听 `0.0.0.0:8000`，不启用 reload，也不输出访问日志。

## `POST /api/grid/detect`

请求为 `multipart/form-data`：

- `file`：JPEG、PNG 或 WebP。
- `mode`：`auto` 或 `manual`。
- `rectangle`：手动模式必需的 JSON 字符串，使用自然图片半开整数坐标：

```json
{ "left": 40, "top": 101, "right": 1400, "bottom": 1181 }
```

服务校验 MIME、20 MiB 字节上限、2500 万解码像素上限，并只执行一次 EXIF 方向归一化。原始上传字节的 SHA-256 会进入返回合同。

自动模式通过自适应阈值、形态学线段和必要时的 `HoughLinesP` 提取横纵证据；比较基础格距与 2–6 倍谐波，优先选择能解释至少同等贯通证据和更多边界的最小基础格距。候选网格会排除标题带、外围坐标标签、图例、水印、短内部线段和大段空白尾部。

手动模式不搜索或替换为更短的内部子网格。用户矩形是完整范围，每条边只允许在 `max(3, round(cellSize * 0.25))` 内吸附。吸附后的完整矩形必须形成整数个正方形单元；线条较弱但完整矩形仍满足合同条件时，会返回中文复核警告。

成功响应示例：

```json
{
  "imageSha256": "64 位小写十六进制 SHA-256",
  "naturalWidth": 1440,
  "naturalHeight": 1526,
  "left": 40,
  "top": 101,
  "right": 1400,
  "bottom": 1181,
  "cellSize": 40,
  "columns": 34,
  "rows": 27,
  "xBoundaries": [40, 80, 120],
  "yBoundaries": [101, 141, 181],
  "confidence": 0.8438,
  "warning": null
}
```

示例边界数组为缩写；真实响应始终包含 `columns + 1` 个 X 边界和 `rows + 1` 个 Y 边界。

## `POST /api/grid/mirror`

请求为 `multipart/form-data`：

- `file`：与识别时完全相同的图片。
- `contract`：`/api/grid/detect` 的完整响应加上 `"confirmed": true`。

服务严格验证哈希、EXIF 归一化尺寸、范围、边界数量、严格递增、严格等距、正方形格距、跨度和行列数。未知字段会被拒绝。

Pillow 先复制归一化 RGBA 原图，再始终从未修改源图读取每个完整单元，并粘贴到 `columns - 1 - sourceColumn`。网格外像素不参与写入。成功响应直接返回内存中的 `image/png`。

## 错误与隐私

错误为中文结构化 JSON，不回显文件名、哈希、边界或请求内容：

```json
{
  "error": {
    "code": "GRID_RECTANGLE_NOT_COMPLETE_SQUARES",
    "message": "手动选区无法在允许吸附距离内形成完整的整数正方形单元。"
  }
}
```

图片上传到用户控制的 Mirror Master 服务，仅在内存中处理，不写入持久目录，也不发送给第三方。请求结束会关闭 `UploadFile`；服务不记录文件名、请求体、图片哈希、图片字节或边界数组；所有响应设置 `Cache-Control: no-store`。

## 验证

```bash
backend/.venv/bin/python -m pytest -q backend/tests
pnpm run build
```

所有者真实样本只作为未跟踪文件放在 `backend/tests/fixtures/owner-grid.jpg`。自动识别固定验收合同为：

```text
[40, 1400) × [101, 1181)
cellSize = 40
columns × rows = 34 × 27
35 个 X 边界，28 个 Y 边界
```
