# Mirror Master 本地运行与运维移交合同

> [产品规范](PRODUCT_SPEC.zh-CN.md) 是唯一产品权威。本文件只记录本地运行方式和平台中立的运维移交合同，不定义产品需求或生产基础设施方案。

部署不属于当前产品开发范围。开发阶段不选择托管商、服务器、域名、证书、反向代理、容器编排、监控或发布系统，也不创建相应配置。owner 完成本地运行时验收后，运维根据本合同独立决定最终基础设施和发布方式。

## 1. 开发交付边界

开发交付物包括：

- Vite/TypeScript 前端源码，以及由 `pnpm run build` 生成的 `dist`。
- FastAPI 后端源码和锁定的生产、测试依赖。
- `./scripts/start-local.sh` 本地统一启动入口。
- 前端生成物检查、自动化测试、类型检查、lint、格式检查和生产构建。
- 后端完整 pytest。
- `Dockerfile` 与 `compose.yaml` 平台中立容器材料。
- 健康检查、接口、限制、隐私、环境变量、反向代理、日志、监控、升级、回滚和验收合同。

开发完成不依赖生产 URL、托管商构建、域名、远程日志、远程项目状态或任何基础设施发布结果。

## 2. 运行架构合同

Mirror Master 是统一的前后端应用，不是可独立交付的纯静态页面：

```text
浏览器
  └─ HTTP(S)
      └─ FastAPI / Uvicorn
          ├─ /api/* → Python 图片处理与项目接口
          └─ /*      → dist 静态前端
```

FastAPI 在 `dist` 存在时通过根路径提供前端静态文件。运维必须保持完整 `/api/*` 路径，不得把前端和后端拆成会改变同源 API 合同的独立产品。

稳定接口：

- `GET /api/health`
- `GET /api/capabilities`
- `GET /api/palettes`
- `POST /api/pattern/generate`
- `POST /api/pattern/export`
- `POST /api/grid/detect`
- `POST /api/grid/mirror`

健康检查的稳定成功响应为：

```json
{ "status": "ok" }
```

## 3. 版本与锁定依赖

| 范围         | 合同                                                                |
| ------------ | ------------------------------------------------------------------- |
| Python       | 3.12；`.python-version` 与 `backend/pyproject.toml` 是仓库版本权威  |
| Node.js      | `Dockerfile` 使用 Node 24；本地 Node 必须能运行当前 Vite/TypeScript |
| pnpm         | `package.json` 固定 `pnpm@10.28.2`                                  |
| 前端依赖     | `package.json` + `pnpm-lock.yaml`，安装时使用 `--frozen-lockfile`   |
| 后端生产依赖 | `backend/requirements.txt`，版本全部精确锁定                        |
| 后端测试依赖 | `backend/requirements-dev.txt`，版本全部精确锁定                    |

不得在运维环境使用未锁定依赖替代仓库合同。

## 4. 本地统一运行

在仓库根目录执行：

```bash
./scripts/start-local.sh
```

脚本会：

1. 创建或复用 `backend/.venv`。
2. 使用 Python 3.12 安装 `backend/requirements.txt`。
3. 使用 pnpm 或 Corepack 按锁文件安装前端依赖。
4. 运行前端生产构建。
5. 在 `127.0.0.1:8000` 启动统一 FastAPI 服务。

本地地址：

```text
http://127.0.0.1:8000
```

使用 `Ctrl-C` 停止本地统一服务。仅开发前端时可运行 `pnpm run dev`；Vite 会把 `/api` 代理到 `http://127.0.0.1:8000`，因此后端仍需单独运行。

## 5. 容器移交材料

`Dockerfile` 构建前端 `dist`，安装 FastAPI 生产依赖，并以 Uvicorn 提供统一服务。`compose.yaml` 只提供单服务容器验收入口，没有数据库、持久卷或生产基础设施决策。

本地容器验收命令：

```bash
docker compose build
docker compose up -d
curl --fail --silent --show-error http://127.0.0.1:8000/api/health
docker compose stop
```

需要移除本地验收容器时可执行：

```bash
docker compose down
```

这些文件和命令是可移交运行材料，不表示开发阶段执行生产部署。最终网络暴露、进程调度、镜像仓库、编排、资源限制和高可用策略由运维决定。

## 6. 请求、响应与资源限制

| 项目             | 当前合同                  |
| ---------------- | ------------------------- |
| 支持图片         | PNG、JPEG、WebP           |
| 单个上传文件上限 | 20 MiB                    |
| 解码像素上限     | 25,000,000                |
| 网格合同上限     | 64 KiB                    |
| 图案设置合同上限 | 64 KiB                    |
| 最大图案行数     | 300                       |
| 最大图案列数     | 300                       |
| 输出             | PNG、PDF、CSV、项目 JSON  |
| API 缓存策略     | `Cache-Control: no-store` |

反向代理的请求体上限必须高于 20 MiB，以容纳 `multipart/form-data` 边界和其他字段；超时必须允许接近像素上限的图片完成解码、生成和导出。具体数值应由运维根据验收和压力测试决定，不得在产品代码中加入基础设施专属分支。

## 7. 环境变量合同

应用当前没有必需的业务环境变量，也不读取托管商身份变量来改变上传、生成、镜像或导出行为。

监听地址、端口、进程数、外部 URL、日志收集和监控连接属于运行命令或运维系统配置，不得改变产品 API、上传限制、矩阵权威或响应结构。若运维需要新增环境变量，必须在交付时记录名称、用途、默认值、敏感性、轮换方式和缺失行为。

## 8. 数据与隐私合同

- 图片由用户控制的 FastAPI 服务接收并在内存中处理。
- 应用不持久化上传图片、文件名、图片字节、哈希或生成中间图。
- 应用没有数据库、对象存储、分析 SDK 或第三方图片服务。
- 请求结束后关闭 `UploadFile`。
- 所有响应设置 `Cache-Control: no-store` 和 `X-Content-Type-Options: nosniff`。
- Uvicorn 默认以 `--no-access-log` 启动。

框架可能在操作系统管理的临时区域暂存较大的上传。运维必须把临时目录、交换空间、核心转储、反向代理、日志采集和监控系统视为独立的数据面，并确保它们不记录请求体或上传内容。

## 9. 反向代理与 HTTPS 合同

最终入口必须：

- 使用 HTTPS；证书和终止位置由运维决定。
- 原样转发方法、路径、查询、`Content-Type`、`Content-Length` 和响应头。
- 支持 `multipart/form-data` 上传和二进制下载。
- 不缓存 API 或用户生成文件。
- 不记录请求体、上传内容或导出内容。
- 只把通过验收的统一服务暴露给用户。

产品仓库不提供特定反向代理、DNS、证书或防火墙配置。

## 10. 日志与监控建议

运维至少应监控：

- 进程或容器存活。
- `/api/health` 的状态、延迟和连续失败。
- HTTP 4xx/5xx 比例，但不得采集请求体。
- CPU、内存、临时磁盘和文件描述符。
- 图片解码、生成、镜像和导出的耗时与失败码。

告警阈值、日志保留、脱敏、访问控制和审计方式由运维在生产方案中决定。不得记录上传图片、文件名、哈希、矩阵内容或导出内容。

## 11. 升级与回滚合同

运维发布前必须记录当前已验收的源码 revision 或不可变镜像标识。升级流程至少包括：

1. 从目标 revision 按锁定依赖重新构建前端和后端运行产物。
2. 在隔离环境运行前端检查、后端 pytest 和健康检查。
3. 完成真实照片、像素图、已有图纸、编辑、镜像、统计和导出浏览器验收。
4. 由运维选择发布机制并保留上一份已验收产物。
5. 发布后再次检查健康、核心流程和错误率。

回滚必须切换到上一份已验收的不可变源码 revision 或镜像，并重新执行健康与核心流程检查。由于应用不使用数据库或持久化上传，当前没有数据迁移回滚步骤；若以后引入持久化，必须先更新产品规范和本合同。

## 12. 验收清单

开发移交前必须提供并验证：

- `pnpm run check:palettes`
- `pnpm run check:brand`
- `pnpm run check:icons`
- `pnpm run check:tokens`
- `pnpm run test`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run format:check`
- `pnpm run build`
- `backend/.venv/bin/python -m pytest -q backend/tests`
- 本地统一服务的 `/api/health`、`/api/capabilities` 和 `/api/palettes`
- 真实照片、像素图和已有图纸的浏览器核心流程
- PNG、PDF、CSV、项目 JSON 的内容一致性

owner 接受本地运行结果后，运维接收源码、锁定依赖、构建方式、容器材料、健康检查、限制、隐私、环境变量、代理、HTTPS、日志、监控、升级、回滚和验收合同。最终基础设施选择和发布执行不回到产品开发范围。
