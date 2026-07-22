# Mirror Master

Mirror Master 是一个面向 Pixelanim 风格网格图片的前端项目。当前仓库只完成项目基础初始化，实际图片处理能力尚未实现。

## 项目目的

Mirror Master 计划成为一个完全在浏览器本地运行的工具，用于处理由规则网格组成的 Pixelanim 风格图片。未来目标是识别图片中的网格单元，把单元格的位置关系做镜像变换，同时保留单元格内部的可读标签。

典型场景是：图片里某个格子包含 `H7` 这样的标签。Mirror Master 计划移动这个格子在网格中的位置，但不把 `H7` 本身当作像素内容左右翻转成不可读的反向文字。

## 整图像素翻转与网格单元位置镜像的区别

普通的整图像素翻转会把图片每一个像素按左右方向反转。这样虽然视觉上完成了镜像，但图片中的文字、标签和内部标记也会一起被反向翻转，例如 `H7` 会变成镜像文字。

Mirror Master 计划实现的是网格单元位置镜像：先理解图片由哪些网格单元组成，再把这些单元在网格坐标中的位置做镜像排列。每个单元内部的图像内容和标签保持原始方向，因此标签仍应可读。

## 计划的网格识别方式

未来实现会优先尝试自动检测网格边界、行列数量和单元格区域。考虑到不同图片可能存在边框粗细、分辨率、留白或扫描质量差异，项目也计划提供用户校正 fallback，让用户能修正自动检测结果。

当前版本没有实现自动检测，也没有实现用户校正界面。

## 隐私与本地处理原则

- 图片处理计划在浏览器本地完成。
- 上传的图片不应离开用户设备。
- 项目不计划依赖后端服务来处理图片。
- 当前版本不包含分析埋点、远程图片、API key、OCR、OpenCV、Canvas 处理、网格检测、手动选择、图片上传、镜像处理或导出功能。

## 当前实现状态

已完成：

- Vite vanilla TypeScript 工程基础。
- 严格 TypeScript 配置。
- ESLint flat config 与 Prettier 配置。
- 响应式中文说明页。
- 基础设计 token、全局样式和页面样式分层。

未完成：

- 图片上传。
- 网格检测。
- 用户校正。
- 网格单元镜像。
- 图片导出。
- 任何真实图像处理功能。

## 技术栈

- Vite
- TypeScript
- 原生浏览器 API
- 语义化 HTML
- 现代 CSS
- ESLint flat config
- Prettier
- pnpm

项目当前没有运行时依赖。

## 环境要求

- Node.js：建议使用当前 LTS 或项目工具链支持的版本。
- pnpm：本项目使用 pnpm 管理依赖。

## 开发命令

```bash
pnpm install
pnpm run dev
pnpm run typecheck
pnpm run lint
pnpm run format
pnpm run format:check
pnpm run build
pnpm run preview
pnpm run check
```

`pnpm run check` 会按顺序执行类型检查、ESLint、Prettier 格式校验和生产构建。

## 项目结构

```text
.
├── index.html
├── package.json
├── pnpm-lock.yaml
├── README.md
├── eslint.config.js
├── prettier.config.js
├── tsconfig.json
└── src
    ├── main.ts
    ├── vite-env.d.ts
    └── styles
        ├── base.css
        ├── page.css
        └── tokens.css
```

## 计划里程碑

1. 完成项目基础、说明页和代码质量工具链。
2. 设计图片输入与本地文件读取边界。
3. 实现网格自动检测原型。
4. 增加用户校正 fallback。
5. 实现网格单元位置镜像，并保持内部标签方向不变。
6. 增加本地导出流程。
7. 补充针对核心处理逻辑的测试。

## 贡献说明

- 不要提交构建产物、依赖目录、缓存、日志、本地环境文件或编辑器工作区文件。
- 新功能应先明确隐私边界，避免把用户图片发送到远程服务。
- 涉及图像处理的实现必须区分“整图像素翻转”和“网格单元位置镜像”。
- 文档和界面不能声称尚未实现的功能已经可用。

## 功能状态声明

实际图片处理功能尚未实现。当前版本只是 Mirror Master 的前端工程基础。
