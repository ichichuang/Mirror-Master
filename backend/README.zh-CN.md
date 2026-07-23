# Mirror Master Python 镜像后端

本目录是 `PY-BACKEND-MIRROR-001` 的独立后端节点。当前前端的
OpenCV.js 检测器和 Canvas 镜像处理器保持冻结；本节点不删除、不调用，也不改写它们。

后端仅提供两个接口：

- `GET /api/health`
- `POST /api/grid/mirror`

交互式 API 文档默认关闭。服务没有数据库、认证、远程存储、分析 SDK 或第三方图片服务。

## 本地开发

要求 Python 3.12。仓库使用 `mise` 时可在仓库根目录执行：

```bash
mise exec python@3.12.10 -- python -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
cd backend
.venv/bin/python -m uvicorn app.main:app --reload
```

`--reload` 只用于本地开发。生产运行不得启用自动重载，并应由反向代理配置 HTTPS、
可信 Host、请求体上限和速率限制。

## API 合同

### `GET /api/health`

成功响应：

```json
{ "status": "ok" }
```

### `POST /api/grid/mirror`

请求类型为 `multipart/form-data`，且只包含以下业务字段：

- `file`：一个 JPEG、PNG 或 WebP 图片文件。
- `contract`：一个 JSON 字符串。

合同示例：

```json
{
  "imageSha256": "64 位小写十六进制 SHA-256",
  "naturalWidth": 8,
  "naturalHeight": 6,
  "cellSize": 2,
  "columns": 2,
  "rows": 2,
  "xBoundaries": [2, 4, 6],
  "yBoundaries": [1, 3, 5],
  "confirmed": true
}
```

所有数值字段必须是 JSON 整数，`columns`、`rows`、`cellSize` 和自然尺寸必须为正数。
`confirmed` 必须显式等于布尔值 `true`。未知字段会被拒绝。

服务器按以下顺序执行约束检查：

1. 合同大小、JSON 结构和严格字段类型；
2. MIME 白名单，以及声明 MIME 与实际解码格式的一致性；
3. 20 MiB 上传字节上限；
4. 原始上传字节的 SHA-256 与合同一致性；
5. EXIF 方向归一化；
6. 2500 万解码像素上限和归一化后的自然尺寸；
7. 边界数量、严格递增、严格等距、正方形单元、半开坐标范围；
8. 边界跨度、`cellSize`、行数和列数完全一致。

服务不推断网格、不吸附边界，也不接受谐波猜测。边界合同必须由上游明确确认。
成功时直接返回内存中的 `image/png`；不产生持久文件。

镜像算法只使用 Pillow：先将 EXIF 归一化图片转换为 RGBA，再复制完整图片；随后始终从
未修改的源图用 `crop((left, top, right, bottom))` 读取每个完整单元（包括空白单元），
并粘贴到 `columns - 1 - sourceColumn`。网格外像素不参与写入。

错误响应均为中文结构化 JSON，且不回显文件名、哈希、边界或请求内容：

```json
{
  "error": {
    "code": "GRID_IMAGE_HASH_MISMATCH",
    "message": "网格合同与当前上传图片不匹配，可能已经过期。"
  }
}
```

## 隐私变化

引入后端后，图片会离开浏览器并上传到运行该服务的服务器，因此不再是纯本地处理。
本节点采取以下控制：

- 不写入持久目录，结果只在内存中编码；
- 每次请求结束始终关闭 `UploadFile`；
- 不记录文件名、请求体、图片哈希、图片字节或边界数组；
- 所有响应设置 `Cache-Control: no-store`；
- 不连接数据库、对象存储、分析平台或第三方图片服务；
- 对上传字节、合同大小和解码像素实施上限。

部署方仍必须使用 HTTPS，并确认反向代理、平台访问日志和错误采集没有额外记录请求体。

## 验证命令

生成式测试直接运行：

```bash
cd backend
.venv/bin/python -m pytest
```

所有者真实样本必须只作为本地未跟踪文件放在：

```text
backend/tests/fixtures/owner-grid.jpg
```

该目录由 Git 忽略。真实样本验收合同固定为：

```text
(left, top) = (40, 101)
(right, bottom) = (1400, 1181)
cellSize = 40
columns × rows = 34 × 27
```

若未提供该文件，真实样本用例会明确报告跳过；提供后会验证 Python/NumPy 独立参考零
RGBA 差异、网格外零差异、918 个单元全部正确。完整仓库验收：

```bash
backend/.venv/bin/python -m pytest -q backend/tests
pnpm run check
git diff --check
```
