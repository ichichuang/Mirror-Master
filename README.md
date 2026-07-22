# Mirror Master

Mirror Master 是一个面向 Pixelanim 风格网格图片的前端项目。当前版本完成了 INPUT-001：选择一张本地图片并显示原图预览与真实元数据。

## 项目目的

Mirror Master 计划成为一个完全在浏览器本地运行的工具，用于处理由规则网格组成的 Pixelanim 风格图片。未来目标是识别图片中的网格单元，把单元格的位置关系做镜像变换，同时保留单元格内部的可读标签。

典型场景是：图片里某个格子包含 `H7` 这样的标签。Mirror Master 计划移动这个格子在网格中的位置，但不把 `H7` 本身当作像素内容左右翻转成不可读的反向文字。

## 已完成能力：本地图片输入与原图预览

当前应用支持：

- 通过可见的点击区域选择一张本地图片。
- 将一张本地图片拖放到指定区域。
- 只接受单个 PNG、JPEG 或 WebP 文件。
- 拒绝多文件拖放，并显示清晰的中文错误。
- 使用浏览器本地图片解码读取真实像素宽度和高度。
- 使用对象 URL 显示响应式原图预览，保持宽高比，不做不必要的放大。
- 显示真实文件名、格式、尺寸和人类可读文件大小。
- 支持更换图片、移除图片，并允许移除后再次选择同一个文件。

## 使用步骤

1. 运行开发服务后打开页面。
2. 点击“选择一张本地图片”，或把单个图片文件拖放到该区域。
3. 查看原图预览和图片信息。
4. 需要换图时点击“更换图片”；需要清空状态时点击“移除图片”。

## 支持格式

- PNG：`image/png`
- JPEG：`image/jpeg`
- WebP：`image/webp`

其他格式会被拒绝。一次只能处理一张图片。

## 隐私与本地处理原则

- 当前图片输入、格式校验、图片解码和预览都在浏览器本地完成。
- 应用使用对象 URL 预览图片，不把图片转成 base64。
- 被替换、移除或页面卸载时，对象 URL 会被撤销。
- 页面没有后端、远程存储、分析埋点、远程图片、API key 或网络上传逻辑。
- 选中文件的字节和元数据不会由应用发送到网络。

## 当前限制

当前版本仍未实现：

- 网格识别。
- 自动选择。
- 用户手动校正。
- Canvas 图像处理。
- OCR。
- OpenCV。
- 网格单元镜像。
- 图片导出。

也就是说，当前版本只提供“本地选择并预览原图”，不声称已经完成网格检测或镜像处理。

## 整图像素翻转与网格单元位置镜像的区别

普通的整图像素翻转会把图片每一个像素按左右方向反转。这样虽然视觉上完成了镜像，但图片中的文字、标签和内部标记也会一起被反向翻转，例如 `H7` 会变成镜像文字。

Mirror Master 计划实现的是网格单元位置镜像：先理解图片由哪些网格单元组成，再把这些单元在网格坐标中的位置做镜像排列。每个单元内部的图像内容和标签保持原始方向，因此标签仍应可读。

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
    ├── app.ts
    ├── main.ts
    ├── vite-env.d.ts
    ├── features
    │   └── local-image-input
    │       ├── fileValidation.ts
    │       ├── imageDecoder.ts
    │       ├── localImageInput.ts
    │       ├── objectUrlStore.ts
    │       └── types.ts
    └── styles
        ├── base.css
        ├── page.css
        └── tokens.css
```

## 计划里程碑

1. 已完成：项目基础、说明页和代码质量工具链。
2. 已完成：本地图片输入、格式校验、原图预览、元数据展示和对象 URL 清理。
3. 未开始：网格自动检测原型。
4. 未开始：用户校正 fallback。
5. 未开始：网格单元位置镜像，并保持内部标签方向不变。
6. 未开始：本地导出流程。
7. 未开始：针对核心处理逻辑的测试。

## 贡献说明

- 不要提交构建产物、依赖目录、缓存、日志、本地环境文件或编辑器工作区文件。
- 新功能应先明确隐私边界，避免把用户图片发送到远程服务。
- 涉及图像处理的实现必须区分“整图像素翻转”和“网格单元位置镜像”。
- 文档和界面不能声称尚未实现的功能已经可用。
