# Mirror Master 生产部署指南

本文面向需要自行运营 Mirror Master 的管理员，说明如何在一台可运行容器的服务器上部署、启用 HTTPS、验证、升级、回滚和排障。

Mirror Master 不是纯静态前端。浏览器负责上传、预览、选区和下载；Python 服务负责图片解码、网格识别、合同校验、单元镜像和 PNG 编码。图片会上传到部署者控制的 Mirror Master 服务，在内存中处理，不由应用持久化，也不会由应用发送给第三方。

## 紧急部署清单

有经验的管理员可先按本节完成最短部署，再回到后文逐项核对安全和运维要求。

1. 准备一台 Debian 12 VPS、一个解析到该 VPS 的域名，以及 Docker Engine、Docker Compose v2、Git 和 Caddy。
2. 只在 UFW 中放行实际 SSH 端口、`80/tcp` 和 `443/tcp`，不要放行 `8000/tcp`。
3. 克隆仓库并确认分支：

   ```bash
   sudo install -d -o "$USER" -g "$USER" /opt/mirror-master
   git clone https://github.com/ichichuang/Mirror-Master.git /opt/mirror-master
   cd /opt/mirror-master
   git switch main
   git pull --ff-only origin main
   ```

4. 创建仅用于服务器、不要提交到仓库的 `/etc/mirror-master/compose.production.yaml`，把宿主机端口限制为 `127.0.0.1:8000`：

   ```yaml
   services:
     mirror-master:
       ports: !override
         - target: 8000
           published: '8000'
           host_ip: 127.0.0.1
           protocol: tcp
   ```

   `!override` 需要 Docker Compose 2.24.4 或更高版本。

5. 校验并启动：

   ```bash
   cd /opt/mirror-master
   docker compose \
     -f compose.yaml \
     -f /etc/mirror-master/compose.production.yaml \
     config
   docker compose \
     -f compose.yaml \
     -f /etc/mirror-master/compose.production.yaml \
     up -d --build
   curl --fail --silent --show-error http://127.0.0.1:8000/api/health
   ```

   健康检查的稳定成功响应是：

   ```text
   {"status":"ok"}
   ```

6. 将 Caddy 或 Nginx 反向代理到 `127.0.0.1:8000`，启用 HTTPS，并将代理请求体上限设置为至少 `25 MB`、图片处理响应超时设置为约 `120` 秒。
7. 从外网完成页面加载、上传、识别、调整、镜像生成和 PNG 下载全流程。

## 1. 部署决策

### 1.1 为什么不能只部署到静态 Vercel 站点

前端构建产物虽然是静态文件，但核心能力不在浏览器中：

- `POST /api/grid/detect` 由 FastAPI 调用 OpenCV 和 NumPy 识别网格。
- `POST /api/grid/mirror` 由 FastAPI 调用 Pillow 生成 PNG。
- Python 服务负责上传限制、图片解码、合同校验和隐私响应头。
- 生产服务由 Uvicorn 运行，并由 FastAPI 同时提供 `/api` 和构建后的 `dist` 前端。

因此，把 `dist` 单独放到 Vercel 静态托管会得到一个无法完成识别和镜像的前端。Mirror Master 必须部署到能够运行 Python、原生图像依赖和 HTTP API 的容器服务器或等价的容器平台。这里否定的是“仅静态前端部署”，不是对某个云厂商全部产品形态的评价。

### 1.2 推荐拓扑

```text
浏览器
  │ HTTPS :443
  ▼
Caddy 或 Nginx
  │ HTTP 127.0.0.1:8000
  ▼
Docker 容器
  └─ Uvicorn + FastAPI
       ├─ /api/grid/detect → OpenCV + NumPy
       ├─ /api/grid/mirror → Pillow
       ├─ /api/health
       └─ / → dist 静态前端
```

TLS 在 Caddy 或 Nginx 终止。容器内 Uvicorn 监听 `0.0.0.0:8000`，但宿主机只应发布到 `127.0.0.1:8000`，使公网流量必须经过 HTTPS 反向代理。

## 2. 实际架构和运行边界

### 2.1 构建与运行

仓库当前的容器构建分为两阶段：

1. `node:24-bookworm-slim` 使用 Corepack 和 `pnpm@10.28.2` 安装前端依赖，执行 `pnpm run build`。该命令先运行 TypeScript 类型检查，再由 Vite 生成 `dist`。
2. `python:3.12-slim-bookworm` 安装 `libglib2.0-0`、`libgomp1` 和锁定版本的 Python 依赖，复制 FastAPI 应用与 `dist`。

容器的实际启动命令是：

```bash
python -m uvicorn app.main:app \
  --app-dir backend \
  --host 0.0.0.0 \
  --port 8000 \
  --no-access-log
```

仓库的 `compose.yaml` 当前包含一个 `mirror-master` 服务，设置 `restart: unless-stopped`，没有数据库、持久卷、容器级 `healthcheck`、CPU 限制或内存限制。

### 2.2 接口与限制

| 项目             | 当前值                             |
| ---------------- | ---------------------------------- |
| 健康检查         | `GET /api/health`                  |
| 自动/手动识别    | `POST /api/grid/detect`            |
| 镜像生成         | `POST /api/grid/mirror`            |
| 支持图片         | JPEG、PNG、WebP                    |
| 单个上传文件上限 | 20 MiB，即 `20 * 1024 * 1024` 字节 |
| 解码像素上限     | 25,000,000 像素                    |
| 镜像合同上限     | 64 KiB                             |
| 上传读取块       | 64 KiB                             |
| 生成格式         | PNG                                |
| 容器端口         | `8000`                             |

代理的请求体限制必须大于 20 MiB，因为 `multipart/form-data` 还包含边界和表单字段。本文示例使用 `25 MB`/`25m`，让接近应用文件上限的请求不会先被代理误拒绝；最终文件和像素限制仍由应用执行。

### 2.3 隐私行为

应用的行为边界如下：

- 图片会上传到运营者控制的 Mirror Master 服务，而不是只在浏览器内处理。
- 应用的图片解码、OpenCV/NumPy 识别、Pillow 镜像和 PNG 编码在内存中完成。
- 应用代码不把图片写入持久目录，没有数据库、对象存储、分析 SDK 或第三方图片服务。
- 应用不把图片发送给第三方。
- 请求结束时会关闭 FastAPI `UploadFile`。
- Uvicorn 启动时使用 `--no-access-log`。
- 所有响应设置 `Cache-Control: no-store` 和 `X-Content-Type-Options: nosniff`。

这些保证只覆盖应用本身。multipart 框架可能在操作系统管理的临时区域暂存较大的上传，`UploadFile` 关闭后由框架清理；有严格数据驻留要求时，应把主机临时目录视为敏感数据面，并使用受控、加密或易失性存储。反向代理、CDN/WAF、云平台、系统交换空间、核心转储和管理员新增的监控也必须单独配置和审计。

## 3. 支持环境与所需软件

### 3.1 操作系统

- **本文主要生产路径**：Debian 12 x86_64。
- **其他 Linux 服务器**：只要能够运行较新的 Docker Engine 和 Docker Compose v2，通常可使用同一镜像；上线前必须实际验证 Python/OpenCV wheel 与服务器架构兼容。
- **本地统一启动脚本**：面向带 POSIX shell 的 macOS 或 Linux，需要 Python 3.12，以及 pnpm 或 Corepack。
- **Windows**：可通过 WSL2 或 Docker Desktop 进行本地评估；仓库没有原生 PowerShell 启动脚本，不建议把桌面 Windows 作为本文的生产基线。

### 3.2 软件

生产服务器需要：

- Git。
- Docker Engine。
- Docker Compose v2；使用本文端口覆盖文件时需 2.24.4 或更高版本。
- `curl`，用于健康检查。
- Caddy 2.10.0 或更高版本，或 Nginx，二选一。本文 Caddy 请求体限制使用 2.10.0 引入的 `request_body` 指令。
- 域名和可管理的 DNS；仅内网部署时可省略公网域名，但仍建议使用内部 TLS。

本地非容器启动需要：

- Python 3.12，或已安装 `mise`，以便脚本使用 Python 3.12.10。
- Node.js 和 `pnpm@10.28.2`，或能够提供该 pnpm 的 Corepack。

### 3.3 服务器规格：实践估算

以下数值是用于起步的**实践估算，不是吞吐或延迟保证**。图片内容、像素数、并发量、OpenCV 路径和 Docker 构建都会改变资源需求。

| 场景               | vCPU |    内存 | 可用磁盘 | 说明                               |
| ------------------ | ---: | ------: | -------: | ---------------------------------- |
| 单人验收、低频使用 |    1 | 1–2 GiB |   10 GiB | 构建或处理接近上限的图片时余量较小 |
| 小团队、低并发生产 |    2 | 2–4 GiB |   20 GiB | 推荐起点                           |
| 多用户或较高并发   |   4+ |  8 GiB+ |  30 GiB+ | 必须按实际压测增加限流、队列或副本 |

一张 25,000,000 像素的 RGBA 图像本身约占 100 MB；解码副本、RGB/灰度 NumPy 数组、OpenCV 中间结果和输出图会使单请求瞬时占用达到数百 MB。应用当前没有并发队列或容器资源限制，不应把上表当作高并发承诺。

## 4. 本地开发与生产命令必须分开

### 4.1 本地统一启动

以下命令用于本地开发和验收，不是 VPS 上的推荐守护方式：

```bash
cd "/path/to/Mirror-Master"
./scripts/start-local.sh
```

脚本会：

1. 创建或复用 `backend/.venv`。
2. 使用 Python 3.12 安装 `backend/requirements.txt`。
3. 使用 pnpm 或 Corepack 执行 `pnpm install --frozen-lockfile`。
4. 执行前端构建。
5. 在 `127.0.0.1:8000` 启动不带 reload、关闭访问日志的 Uvicorn。

本地验证：

```bash
curl --fail --silent --show-error http://127.0.0.1:8000/api/health
```

预期：

```text
{"status":"ok"}
```

如果只运行 Vite 开发服务器，`vite.config.ts` 会把浏览器对 `/api` 的请求代理到 `http://127.0.0.1:8000`。Vite 开发服务器本身不提供 Python 识别服务。

### 4.2 仓库原始 Docker Compose 命令

仓库提供的基本命令是：

```bash
docker compose up -d --build
```

它会按当前 `compose.yaml` 把宿主机 `8000` 映射到容器 `8000`。当前映射写作 `8000:8000`，Docker 默认会在所有宿主机接口上发布该端口。

> **生产警告**：不要在公网 VPS 上把原始映射误当作“仅本机可访问”。Docker 发布端口可能绕过常见的 UFW 预期。本文的生产命令使用额外 Compose 文件，把端口明确绑定到 `127.0.0.1`。

### 4.3 推荐生产命令

先创建目录：

```bash
sudo install -d -m 0755 /etc/mirror-master
```

将下面内容保存为 `/etc/mirror-master/compose.production.yaml`：

```yaml
services:
  mirror-master:
    ports: !override
      - target: 8000
        published: '8000'
        host_ip: 127.0.0.1
        protocol: tcp
```

验证最终合并配置：

```bash
cd /opt/mirror-master
docker compose \
  -f compose.yaml \
  -f /etc/mirror-master/compose.production.yaml \
  config
```

确认输出中的发布地址是 `127.0.0.1` 后启动：

```bash
docker compose \
  -f compose.yaml \
  -f /etc/mirror-master/compose.production.yaml \
  up -d --build
```

查看状态：

```bash
docker compose \
  -f compose.yaml \
  -f /etc/mirror-master/compose.production.yaml \
  ps
```

由于仓库没有定义容器级 `healthcheck`，`docker compose ps` 只能证明容器在运行，不能替代 HTTP 健康检查。继续执行：

```bash
curl --fail --silent --show-error http://127.0.0.1:8000/api/health
sudo ss -ltnp | grep ':8000'
```

稳定健康响应应为 `{"status":"ok"}`；`ss` 输出应显示 `127.0.0.1:8000`，不应显示 `0.0.0.0:8000` 或 `[::]:8000`。

重启服务：

```bash
docker compose \
  -f compose.yaml \
  -f /etc/mirror-master/compose.production.yaml \
  restart mirror-master
```

停止服务：

```bash
docker compose \
  -f compose.yaml \
  -f /etc/mirror-master/compose.production.yaml \
  stop mirror-master
```

## 5. 首次准备 Debian 12 VPS

以下命令假设使用具有 `sudo` 权限的非 root 管理员账户。

### 5.1 更新系统和安装基础工具

```bash
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl git gnupg ufw
```

如果升级了内核，先按维护窗口重启，再继续部署：

```bash
sudo reboot
```

### 5.2 安装 Docker Engine 和 Compose 插件

使用 Docker 官方 Debian 软件源：

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

sudo apt-get update
sudo apt-get install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin
```

验证：

```bash
sudo docker run --rm hello-world
docker compose version
```

`hello-world` 成功时会包含 `Hello from Docker!`。确认 Compose 版本不低于 2.24.4。

如需让当前用户直接执行 Docker：

```bash
sudo usermod -aG docker "$USER"
```

重新登录后生效。Docker 组近似拥有 root 权限，只应授予可信管理员。

### 5.3 配置 UFW

> **防锁定警告**：启用 UFW 前，必须先放行服务器真实 SSH 端口，并保持一个现有 SSH 会话用于回退。若 SSH 使用自定义端口，请用真实端口替换 OpenSSH 规则。

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

不要执行 `sudo ufw allow 8000/tcp`。同时必须按前文把 Docker 端口绑定到 `127.0.0.1`；仅配置 UFW 不能可靠修正一个已经向所有接口发布的 Docker 端口。

## 6. 克隆和更新仓库

### 6.1 首次克隆

优先使用已配置 GitHub SSH 密钥的地址：

```bash
sudo install -d -o "$USER" -g "$USER" /opt/mirror-master
git clone git@github.com:ichichuang/Mirror-Master.git /opt/mirror-master
cd /opt/mirror-master
git switch main
```

如果服务器没有 GitHub SSH 权限，使用 HTTPS：

```bash
git clone https://github.com/ichichuang/Mirror-Master.git /opt/mirror-master
cd /opt/mirror-master
git switch main
```

记录部署版本：

```bash
git remote -v
git status --short --branch
git rev-parse HEAD
```

在继续之前，`git status --short` 应为空。

### 6.2 常规更新仓库

先检查现场是否有未提交修改：

```bash
cd /opt/mirror-master
git status --short
```

如果有输出，停止更新并确认修改归属，不要用 `git reset --hard` 覆盖现场配置。工作区干净时：

```bash
git fetch origin main
git switch main
git pull --ff-only origin main
git rev-parse HEAD
```

服务器专用配置应保存在 `/etc/mirror-master`、`/etc/caddy` 或 `/etc/nginx`，不要混入 Git 工作区。

## 7. 域名和 DNS

在申请证书前完成：

1. 为 `<MIRROR_DOMAIN>` 创建指向 VPS 公网 IPv4 的 `A` 记录。
2. 只有服务器真实配置了公网 IPv6 时才创建 `AAAA` 记录；错误的 AAAA 会导致部分客户端连接失败。
3. 如果使用 CDN 代理，先了解其请求体、超时、缓存和日志策略。排障时可临时切到仅 DNS，但不要绕过必要的访问控制。
4. 等待 DNS 生效：

   ```bash
   dig +short A <MIRROR_DOMAIN>
   dig +short AAAA <MIRROR_DOMAIN>
   ```

5. 确认返回地址属于目标服务器，并确保公网 `80`、`443` 能到达 VPS。

下文示例使用占位符 `<MIRROR_DOMAIN>`，例如 `mirror.example.com`。应用配置前必须替换全部尖括号占位符。

## 8. 推荐方案：Caddy 自动 HTTPS

Caddy 适合单机部署，因为它可以自动申请和续期证书。

### 8.1 安装

为确保支持本文使用的 `request_body` 指令，使用 Caddy 官方 Debian 稳定版软件源：

```bash
sudo apt-get install -y \
  debian-keyring \
  debian-archive-keyring \
  apt-transport-https \
  curl

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor \
  -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list

sudo chmod o+r \
  /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
  /etc/apt/sources.list.d/caddy-stable.list

sudo apt-get update
sudo apt-get install -y caddy
caddy version
```

确认版本不低于 2.10.0。`request_body` 在 Caddy 2.10.0 起提供，官方文档仍把它标记为实验性指令；要求避免实验性指令的组织应改用第 9 节的 Nginx 配置，或删除 Caddy 中的 `request_body` 块并仅依赖 FastAPI 的 20 MiB 应用限制。

### 8.2 完整 Caddyfile 示例

将 `<MIRROR_DOMAIN>` 替换为真实域名，把以下内容写入 `/etc/caddy/Caddyfile`：

```caddyfile
<MIRROR_DOMAIN> {
    encode zstd gzip

    # 后端文件上限是 20 MiB；25 MB 为 multipart 元数据留出空间。
    request_body {
        max_size 25MB
    }

    reverse_proxy 127.0.0.1:8000 {
        transport http {
            dial_timeout 5s
            response_header_timeout 120s
        }

        header_up Host {host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
    }
}
```

此示例没有启用 Caddy 访问日志，避免默认增加请求路径和客户端地址的留存面。若运营要求访问日志，应设置最短必要保留期、限制权限，并确认不会记录请求头、Cookie、查询参数或请求体。

格式化、校验和加载：

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

成功校验应包含配置有效信息，`systemctl status` 应显示 `active (running)`。随后验证：

```bash
curl --fail --silent --show-error https://<MIRROR_DOMAIN>/api/health
```

预期：

```text
{"status":"ok"}
```

查看错误日志：

```bash
sudo journalctl -u caddy --since "15 minutes ago" --no-pager
```

## 9. 等价方案：Nginx HTTPS

不要同时让 Caddy 和 Nginx 占用 `80`/`443`。选择 Nginx 时，先停止并禁用其他反向代理。

### 9.1 安装 Nginx 和 Certbot

```bash
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo systemctl enable --now nginx
```

在新建的专用主机上，先移除 Debian 的示例站点符号链接。若主机已经承载其他站点，停止并把后续默认拒绝块合并到现有配置，不要直接删除共享默认站点。

```bash
sudo rm -f /etc/nginx/sites-enabled/default
```

把 `<MIRROR_DOMAIN>` 替换为真实域名，创建只包含 HTTP 转发的临时站点：

```bash
sudo tee /etc/nginx/sites-available/mirror-master >/dev/null <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 444;
}

server {
    listen 80;
    listen [::]:80;
    server_name <MIRROR_DOMAIN>;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

sudo ln -s /etc/nginx/sites-available/mirror-master \
  /etc/nginx/sites-enabled/mirror-master
sudo nginx -t
sudo systemctl reload nginx
```

确认 `http://<MIRROR_DOMAIN>/api/health` 可访问后申请证书：

```bash
sudo certbot --nginx -d <MIRROR_DOMAIN>
```

Certbot 成功后，证书通常位于：

```text
/etc/letsencrypt/live/<MIRROR_DOMAIN>/fullchain.pem
/etc/letsencrypt/live/<MIRROR_DOMAIN>/privkey.pem
```

### 9.2 完整 Nginx server 示例

将以下内容保存为 `/etc/nginx/sites-available/mirror-master`，替换所有 `<MIRROR_DOMAIN>`：

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    return 444;
}

server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_reject_handshake on;
}

server {
    listen 80;
    listen [::]:80;
    server_name <MIRROR_DOMAIN>;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name <MIRROR_DOMAIN>;

    ssl_certificate /etc/letsencrypt/live/<MIRROR_DOMAIN>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<MIRROR_DOMAIN>/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # 20 MiB 文件加 multipart 元数据；最终限制仍由 FastAPI 执行。
    client_max_body_size 25m;
    client_body_timeout 120s;

    # 隐私优先：不记录访问行。错误日志仍用于故障诊断。
    access_log off;
    error_log /var/log/nginx/mirror-master.error.log warn;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;

        proxy_connect_timeout 5s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
}
```

启用并验证：

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl status nginx --no-pager
```

第 9.1 节已经创建站点符号链接，不要重复创建。`nginx -t` 成功时会报告语法正确和测试成功。

验证证书续期：

```bash
sudo certbot renew --dry-run
```

验证应用：

```bash
curl --fail --silent --show-error https://<MIRROR_DOMAIN>/api/health
```

### 9.3 Host 与 HTTPS 注意事项

当前 FastAPI 应用没有配置 `TrustedHostMiddleware`，不会在应用层维护 Host 白名单。生产环境应：

- 只在 Caddy 站点标签或 Nginx `server_name` 中配置真实域名。
- 为未知域名配置代理层默认拒绝站点，避免其他 Host 意外落到应用。
- 保持容器端口只绑定 `127.0.0.1`。
- 只接受外部 HTTPS，并把 `X-Forwarded-Proto` 设为真实客户端协议。
- 不信任来自公网的任意转发头；只有本机反向代理应能访问 Uvicorn。

应用当前不生成依赖外部协议的登录回调或绝对 URL。如果未来增加此类功能，需要同时审查 Uvicorn 的受信代理设置和 FastAPI 的 Host/代理头策略，不能只复制本节配置。

## 10. 生产验证清单

部署或升级后按顺序完成。

### 10.1 服务端验证

```bash
cd /opt/mirror-master

docker compose \
  -f compose.yaml \
  -f /etc/mirror-master/compose.production.yaml \
  ps

curl --fail --silent --show-error \
  http://127.0.0.1:8000/api/health

curl --fail --silent --show-error \
  https://<MIRROR_DOMAIN>/api/health

sudo ss -ltnp | grep -E ':(80|443|8000)\b'
```

检查：

- `/api/health` 的内网和 HTTPS 响应均为 `{"status":"ok"}`。
- `8000` 只监听 `127.0.0.1`。
- `80` 和 `443` 由选择的反向代理监听。
- HTTP 访问会跳转到 HTTPS。

### 10.2 浏览器全流程

使用一张不含敏感信息的 JPEG、PNG 或 WebP 验收图：

1. 打开 `https://<MIRROR_DOMAIN>/`，确认页面和样式完整加载。
2. 上传图片，确认服务开始识别。
3. 确认自动检测边界合理。
4. 移动或缩放矩形，确认松开后执行手动识别和吸附。
5. 明确确认当前网格并生成镜像。
6. 在原图和镜像结果间切换，确认网格外像素没有被改写。
7. 下载结果，确认文件名为 `mirrored.png` 且能作为 PNG 打开。
8. 在浏览器开发者工具 Network 中确认 API 走同一 HTTPS 域名的 `/api/grid/detect` 和 `/api/grid/mirror`，没有混合内容或第三方图片请求。

## 11. 日志和资源检查

### 11.1 应用容器日志

```bash
docker compose \
  -f compose.yaml \
  -f /etc/mirror-master/compose.production.yaml \
  logs --tail=200 mirror-master
```

持续跟踪：

```bash
docker compose \
  -f compose.yaml \
  -f /etc/mirror-master/compose.production.yaml \
  logs --tail=100 --follow mirror-master
```

Uvicorn 访问日志已关闭，因此正常请求不会逐条出现。不要为了排障直接记录 multipart 请求体、图片字节、文件名、哈希或完整合同。

### 11.2 代理日志

Caddy：

```bash
sudo journalctl -u caddy --since "30 minutes ago" --no-pager
```

Nginx：

```bash
sudo tail -n 200 /var/log/nginx/mirror-master.error.log
```

### 11.3 资源

```bash
docker stats --no-stream
docker system df
df -h
free -h
```

`docker stats` 用于观察当前容器内存和 CPU，不等同于历史监控。若要增加监控，优先记录资源指标和状态码，不采集图片、请求体或表单内容。

## 12. 升级

### 12.1 升级前

```bash
cd /opt/mirror-master
git status --short
git rev-parse HEAD
docker compose \
  -f compose.yaml \
  -f /etc/mirror-master/compose.production.yaml \
  config >/tmp/mirror-master-compose.before-upgrade.txt
```

保存当前 Git SHA、Compose 合并配置、代理配置和证书管理状态。若 `git status --short` 有输出，先处理现场修改。

### 12.2 拉取并重建

```bash
cd /opt/mirror-master
git fetch origin main
git switch main
git pull --ff-only origin main

docker compose \
  -f compose.yaml \
  -f /etc/mirror-master/compose.production.yaml \
  up -d --build

curl --fail --silent --show-error http://127.0.0.1:8000/api/health
curl --fail --silent --show-error https://<MIRROR_DOMAIN>/api/health
```

随后完成第 10 节的浏览器全流程。

### 12.3 零停机预期

当前部署是单容器、单 Uvicorn 实例。`docker compose up -d --build` 在替换容器时可能产生短暂中断；仓库没有负载均衡、滚动升级、就绪探针或多副本协调。因此，本指南不承诺零停机。

真正的零停机需要在应用外增加至少两个实例、就绪检查、负载均衡和蓝绿或滚动发布，并验证图片请求不会在处理中被切断。这属于额外平台设计，不是当前 Compose 文件的能力。

## 13. 回滚到已知 Git 提交

先确认目标提交可信、工作区干净，并记录当前 SHA：

```bash
cd /opt/mirror-master
git status --short
git rev-parse HEAD
git fetch --all --tags
git show --stat --oneline <KNOWN_GOOD_COMMIT_SHA>
```

> **警告**：以下操作会把部署切换到指定历史版本。它不删除提交，但会进入 detached HEAD。不要在工作区有未提交修改时执行。

```bash
git switch --detach <KNOWN_GOOD_COMMIT_SHA>

docker compose \
  -f compose.yaml \
  -f /etc/mirror-master/compose.production.yaml \
  up -d --build

curl --fail --silent --show-error http://127.0.0.1:8000/api/health
curl --fail --silent --show-error https://<MIRROR_DOMAIN>/api/health
```

完成浏览器全流程后，记录实际回滚 SHA。恢复跟踪 `main`：

```bash
git switch main
git pull --ff-only origin main
```

恢复到 `main` 后不会自动重建；需要再次执行生产 Compose 启动命令。

## 14. 备份与恢复边界

Mirror Master 当前：

- 没有数据库。
- 没有应用持久卷。
- 不持久保存用户上传或生成的图片。
- 不需要备份用户图片数据，因为应用没有此类存储。

仍应保存：

- 当前生产 Git 提交 SHA。
- `/etc/mirror-master/compose.production.yaml`。
- `/etc/caddy/Caddyfile`，或 Nginx 站点配置。
- DNS 记录和防火墙规则的可恢复记录。
- TLS 证书管理方式；Let’s Encrypt 私钥必须按安全策略保护，通常优先让 Certbot/Caddy 重新签发，而不是随意复制私钥。
- 运维流程、外部监控和任何部署平台配置。

恢复时先重建干净仓库 checkout，再恢复服务器专用配置，校验代理与 Compose，最后完成生产验证。不要把用户图片备份需求虚构成应用能力。

## 15. 隐私和安全加固

### 15.1 代理与平台日志风险

应用不记录图片内容，并不代表整个链路无日志。以下组件可能记录客户端 IP、URL、User-Agent、Cookie、请求头、查询参数、状态码，甚至在错误捕获或 WAF 中缓存请求体：

- Caddy 或 Nginx。
- CDN、WAF、负载均衡器和云平台。
- 主机级 APM、抓包和崩溃转储。
- 浏览器、企业代理和终端安全软件。

建议：

- 不在 URL 查询参数中放文件名、哈希、合同或用户数据。
- 禁止记录请求体和 multipart 表单。
- 采用最小日志字段和最短保留期。
- 对日志目录实施最小权限和轮转。
- 审查 CDN/WAF 的上传检查、缓存、故障采样和跨境处理策略。
- 对敏感使用场景禁用不必要的第三方代理层。
- 注意 Nginx 可能为较大请求使用 `client_body_temp_path` 下的临时文件；限制该目录权限、确保请求后清理，并按数据驻留要求选择加密或易失性文件系统。

### 15.2 主机和容器

- 及时安装 Debian、Docker、Caddy/Nginx 安全更新。
- 只授予可信管理员 Docker 组权限。
- SSH 使用密钥，禁用密码和 root 远程登录前先验证备用登录路径。
- UFW 只开放 SSH、HTTP 和 HTTPS。
- 宿主机 `8000` 只绑定 `127.0.0.1`。
- 不把 Docker socket 挂载进应用容器。
- 不向容器注入无关凭据；当前应用不需要 API 密钥。
- 定期检查 `docker system df`，避免构建缓存耗尽磁盘。
- 根据实测为容器增加 CPU、内存和并发限制；当前仓库未预设这些限制。
- 若主机允许核心转储或交换空间，按数据敏感度评估关闭、加密或限制访问。

## 16. 故障恢复

按从小到大的顺序处理：

1. 检查 HTTP 健康：

   ```bash
   curl --fail --silent --show-error \
     http://127.0.0.1:8000/api/health
   ```

2. 检查容器状态和最近日志：

   ```bash
   docker compose \
     -f compose.yaml \
     -f /etc/mirror-master/compose.production.yaml \
     ps
   docker compose \
     -f compose.yaml \
     -f /etc/mirror-master/compose.production.yaml \
     logs --tail=200 mirror-master
   ```

3. 重启单个服务：

   ```bash
   docker compose \
     -f compose.yaml \
     -f /etc/mirror-master/compose.production.yaml \
     restart mirror-master
   ```

4. 检查端口和反向代理：

   ```bash
   sudo ss -ltnp | grep -E ':(80|443|8000)\b'
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo nginx -t
   ```

   只执行实际安装的代理命令。

5. 检查内存、磁盘和 Docker 空间：

   ```bash
   free -h
   df -h
   docker system df
   docker stats --no-stream
   ```

6. 若当前版本明确故障，按第 13 节回滚到已知提交。

应用没有数据库或用户图片卷，因此故障恢复重点是代码版本、容器镜像、代理、DNS、防火墙和主机容量，而不是数据迁移。

## 17. 排障表

| 现象                      | 检查                                                                                        | 常见原因                                                   | 处理                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/api/health` 失败        | `docker compose ... ps`、容器日志、`curl 127.0.0.1:8000/api/health`                         | 容器退出、端口冲突、构建未完成                             | 查看第一条 Python 错误；释放冲突端口；重新执行 `up -d --build`                               |
| 容器构建失败              | `docker compose ... build --progress=plain`、磁盘空间、网络                                 | Docker Hub/包源网络、磁盘不足、前端类型检查失败            | 修复明确错误，不要跳过类型检查；释放无关空间后重建                                           |
| Python 依赖安装失败       | Docker 构建日志或本地 `backend/.venv/bin/python -m pip install -r backend/requirements.txt` | Python 版本错误、包源不可达、架构缺少 wheel                | 使用 Python 3.12；确认网络和架构；生产优先使用仓库 Dockerfile                                |
| OpenCV 导入失败           | `docker compose ... exec mirror-master python -c "import cv2; print(cv2.__version__)"`      | 镜像层损坏、架构/依赖不兼容                                | 预期版本为 `4.13.0`；重新无缓存构建，并检查 `libglib2.0-0`、`libgomp1` 安装日志              |
| 上传返回 413              | 代理错误日志、响应 JSON、文件字节数和像素数                                                 | 代理限制低于 20 MiB、文件超过 20 MiB、解码超过 2500 万像素 | 代理设为 25 MB；压缩或缩小图片；不要绕过应用安全上限                                         |
| 代理返回 502              | 本机健康检查、代理错误日志、`ss`                                                            | 容器未运行、代理目标或端口错误                             | 保持代理目标为 `127.0.0.1:8000`；先恢复本机健康，再重载代理                                  |
| 浏览器 API 失败           | DevTools Network、HTTPS 健康检查、Console                                                   | 混合内容、错误子路径、代理未转发 `/api`、请求超时          | 使用同源 `/api`；代理整个 `/` 到 FastAPI；超时设约 120 秒                                    |
| 域名或 HTTPS 异常         | `dig A/AAAA`、`curl -v`、Caddy/Nginx日志                                                    | DNS 未生效、错误 AAAA、证书域名不符、80/443 被阻断         | 修正 DNS，删除无效 AAAA，开放 80/443，重新校验证书                                           |
| 内存过高或容器被 OOM 杀死 | `docker stats --no-stream`、`free -h`、内核日志                                             | 接近 2500 万像素的图片、并发处理、多份图像中间数据         | 降低图片尺寸和并发；增加内存；按实测增加外部限流/队列                                        |
| 前端仍是旧版本            | 浏览器 Network、容器创建时间、构建日志                                                      | 浏览器缓存、旧容器未替换、构建缓存                         | 先强制刷新；确认响应有 `Cache-Control: no-store`；执行 `up -d --build`，必要时再做无缓存构建 |

表中的 `docker compose ...` 表示本文统一使用的两个 `-f` 参数。完整形式为：

```bash
docker compose \
  -f compose.yaml \
  -f /etc/mirror-master/compose.production.yaml
```

无缓存重建会更慢，并重新下载依赖，只在正常重建不能解释旧产物时使用：

```bash
docker compose \
  -f compose.yaml \
  -f /etc/mirror-master/compose.production.yaml \
  build --no-cache mirror-master

docker compose \
  -f compose.yaml \
  -f /etc/mirror-master/compose.production.yaml \
  up -d
```

## 18. 完整卸载和清理

> **破坏性操作警告**：本节会停止服务、删除容器和本地构建镜像，并可永久删除仓库和站点配置。先记录当前 Git SHA、备份 `/etc/mirror-master` 与代理配置，确认该域名不再承载服务。不要复制尚未理解的删除命令。

### 18.1 停止并删除应用容器

```bash
cd /opt/mirror-master
docker compose \
  -f compose.yaml \
  -f /etc/mirror-master/compose.production.yaml \
  down --rmi local --remove-orphans
```

仓库当前没有持久卷，因此无需删除应用数据卷。不要使用全局 `docker system prune`，它可能影响同一主机上的其他项目。

### 18.2 移除反向代理站点

Caddy：先从 `/etc/caddy/Caddyfile` 删除 Mirror Master 站点块，再验证和重载：

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Nginx：

```bash
sudo rm /etc/nginx/sites-enabled/mirror-master
sudo rm /etc/nginx/sites-available/mirror-master
sudo nginx -t
sudo systemctl reload nginx
```

只有确认该证书不再被任何服务使用时，才删除 Certbot 证书：

```bash
sudo certbot delete --cert-name <MIRROR_DOMAIN>
```

### 18.3 删除服务器文件

先核对精确目标：

```bash
git -C /opt/mirror-master rev-parse --show-toplevel
sudo find /etc/mirror-master -maxdepth 1 -type f -print
```

为保留短期恢复能力，可先移动：

```bash
sudo mv /opt/mirror-master /opt/mirror-master.removed
sudo mv /etc/mirror-master /etc/mirror-master.removed
```

确认服务、域名和备份无误后，以下命令会永久删除已移动目录：

```bash
sudo rm -rf /opt/mirror-master.removed
sudo rm -rf /etc/mirror-master.removed
```

最后删除 DNS 的 `A`/`AAAA` 记录，并复查：

```bash
sudo ss -ltnp | grep -E ':(80|443|8000)\b' || true
sudo ufw status verbose
```

如果这是一台不再承载任何 Web 服务的专用主机，可删除 HTTP/HTTPS 防火墙规则：

```bash
sudo ufw delete allow 80/tcp
sudo ufw delete allow 443/tcp
sudo ufw status verbose
```

不要为了卸载 Mirror Master 而删除共享 Docker、Caddy、Nginx 或 UFW，除非已经确认主机上没有其他服务依赖它们。
