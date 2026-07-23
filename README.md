# Mirror Master

Mirror Master 是一个 Pixelanim 网格镜像工具。前端负责上传、预览、选区交互、结果展示和下载；FastAPI 服务使用 OpenCV/NumPy 识别网格，并使用 Pillow 按完整单元列生成 PNG。浏览器不会推断单元尺寸、行列数或边界。

## 使用流程

1. 上传一张 PNG、JPEG 或 WebP 图片。
2. 服务自动识别主网格，前端只渲染服务返回的完整边界。
3. 如需调整，可移动或缩放一个矩形；松开后服务按完整手动选区重新识别和吸附。
4. 点击“生成镜像”明确确认当前合同，由 Python 返回最终 PNG。
5. 在“原图 / 镜像结果”间切换、缩放预览或下载结果。

自动识别会寻找横纵一致的最小基础格距，并排除标题区、外围坐标标签、图例、水印、短线段和大段空白。手动模式保留用户矩形的完整范围，只允许每条边在 `max(3, round(cellSize * 0.25))` 内吸附；不能形成完整整数正方形单元时会拒绝请求。

## 架构

- `POST /api/grid/detect`：Python/OpenCV/NumPy 权威网格识别。
- `POST /api/grid/mirror`：Python/Pillow 权威单元列镜像和 PNG 编码。
- Vite/TypeScript：上传、预览、一个可编辑矩形、API 调用、结果和下载。
- FastAPI 在生产环境同时提供 `/api` 和已构建的 `dist` 静态前端。

镜像结果与原图尺寸完全相同。每个源单元会移动到对称目标列，单元内部不会翻转、缩放、OCR 或重绘；网格外像素保持不变。

## 本地启动

要求 Python 3.12，以及 pnpm 或 Corepack。脚本会创建或复用 `backend/.venv`、安装依赖、构建前端，并在不启用 reload 的情况下启动统一服务：

```bash
./scripts/start-local.sh
```

应用地址：`http://127.0.0.1:8000`

健康检查：`http://127.0.0.1:8000/api/health`

仅开发前端时，Vite 会把 `/api` 代理到 `http://127.0.0.1:8000`。

## Docker 部署

```bash
docker compose up -d --build
```

容器通过 `0.0.0.0:8000` 提供统一前后端服务，宿主机映射端口为 `8000`。

## 隐私

图片会上传到用户控制的 Mirror Master 服务，在内存中完成解码、识别、镜像和 PNG 编码，不写入持久存储，也不发送给第三方。服务不记录文件名、图片字节、哈希或边界合同，并为响应设置 `Cache-Control: no-store`。部署方仍应使用 HTTPS，并确认代理和平台日志不会记录请求体。
