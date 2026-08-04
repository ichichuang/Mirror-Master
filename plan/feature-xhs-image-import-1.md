---
goal: 在首页增加最小可用的小红书公开图文图片提取、选择、保存和转为拼豆图纸功能
version: 1.0
date_created: 2026-08-03
last_updated: 2026-08-03
owner: Mirror Master
status: 'Implemented — awaiting authorized live-link acceptance'
tags: [feature, xiaohongshu, image-import, fastapi, frontend]
---

# Introduction

![Status: Awaiting live-link acceptance](https://img.shields.io/badge/status-Awaiting_live--link_acceptance-orange)

本计划以用户已经验证可用的快捷指令为基准：服务端读取小红书公开分享页，在 HTML `meta` 标签中提取 `xhscdn.com` 图片地址。实现仅覆盖公开图文笔记，不引入数据库、登录、Cookie、验证码处理、第三方解析服务或 AI 水印擦除。前端新增一个独立图片选择工作区；单选图片复用现有 `acceptFiles()` 链路，多图下载由后端使用 Python 标准库生成 ZIP。

预计完成时间为 5 至 8 个工程日。最短可验证路径是先完成 TASK-001 至 TASK-006，在本地用获得授权的真实链接验通提取、预览和单图进入拼豆流程，再完成下载、测试和文档任务。

## Implementation Status

- **Completed 2026-08-03**: TASK-001 至 TASK-016；后端、前端、响应式 UI、安全边界、自动化测试和文档均已实现。
- **Automated portion of TASK-018 completed 2026-08-03**: 后端 140 项和前端 338 项测试通过，类型检查、ESLint、Prettier、生产构建和浏览器控制台检查通过。
- **Pending TASK-017**: 仍需用户提供本人拥有或已获授权的 10 个真实公开笔记链接，才能执行不留存链接内容的线上兼容性验收，并据此把本计划状态改为 `Completed`。

## 1. Requirements & Constraints

- **REQ-001**: 在首页主上传入口下增加按钮“从小红书提取图片”，辅助文字固定为“请先在小红书分享并复制文章链接”。
- **REQ-002**: 点击入口后打开独立 `xhs` 工作区，提供分享文本输入框、“读取剪贴板”、“识别链接”和“返回首页”操作；剪贴板读取失败时必须保留手动粘贴路径。
- **REQ-003**: 服务端只解析输入文本中的第一个受支持小红书 HTTP(S) URL，跟随受控重定向后读取公开分享页 HTML，并从 `meta` 标签及兜底 CDN 正则中提取图片地址。
- **REQ-004**: 提取成功后按页面顺序展示最多 20 张图片，默认不选中；图片卡片必须包含复选框、序号和延迟加载的同源预览图。
- **REQ-005**: 选择 0 张时“保存所选”和“作为拼豆图纸”均禁用；选择 1 张时两者均启用；选择 2 张及以上时“保存所选”启用且“作为拼豆图纸”禁用，并显示“只能选择 1 张图片”。
- **REQ-006**: 提供“全选/取消全选”“保存所选”和“全部保存”；保存 1 张返回原图片，保存多张返回单个 ZIP，文件名按 `xiaohongshu-01.ext` 顺序生成。
- **REQ-007**: 点击“作为拼豆图纸”时，通过同源图片接口取得 `Blob`，构造 `File`，切回 `start` 工作区并调用现有 `acceptFiles([file])`，继续使用现有 MIME、20 MiB 和解码像素检查。
- **REQ-008**: 明确区分本地上传和链接提取的隐私行为；首页说明必须指出链接提取会由本服务访问小红书公开图片，且不会持久化链接或图片。
- **REQ-009**: 对空剪贴板、无效链接、页面不可访问、未找到图片、提取会话过期、单图下载失败和下载总量超限分别显示中文错误，不把上游 URL 或内部异常文本直接暴露给用户。
- **REQ-010**: MVP 不支持视频笔记、实况照片的视频部分、私密或删除笔记、需要登录的笔记、Cookie、验证码绕过、反风控、批量账号采集或对原图内嵌水印做像素擦除。
- **SEC-001**: 初始 URL 和每次重定向只允许 `xiaohongshu.com`、`www.xiaohongshu.com`、`xhslink.com`、`www.xhslink.com`、`xhslink.cn`、`www.xhslink.cn`、`rednote.com`、`www.rednote.com`；拒绝用户名密码、非 80/443 端口和非 HTTP(S) 协议。
- **SEC-002**: 图片 URL 只允许 HTTPS 且主机名等于 `xhscdn.com` 或以 `.xhscdn.com` 结尾；HTML 中的 HTTP 图片地址必须升级为 HTTPS 后再保存到会话。
- **SEC-003**: 禁用自动重定向并逐跳验证，最多允许 4 次跳转；公开页 HTML 最大 2 MiB，单张图片最大 20 MiB，一次下载最大 100 MiB，请求连接超时 5 秒、读取超时 10 秒。
- **SEC-004**: 后端不得接受前端提交的任意图片 URL；前端只提交服务端生成的 UUID `extractionId` 和整数图片 ID，所有上游 URL 仅存在于服务端内存。
- **SEC-005**: 返回图片前必须验证 HTTP 状态、`Content-Type` 为 JPEG、PNG 或 WebP，并在流式读取过程中执行字节上限；所有新接口继续使用全局 `Cache-Control: no-store`。
- **CON-001**: 提取会话使用进程内字典，TTL 固定为 600 秒，最多保存 128 个会话；每次访问时清除过期会话，达到上限时先删除最早创建的会话。
- **CON-002**: 不缓存图片字节；预览、单图使用和 ZIP 下载按需从已验证的 CDN URL 读取，因此部署仍保持无数据库、无持久文件状态。
- **CON-003**: 该进程内方案只保证单 Uvicorn worker；扩展到多 worker 前必须改为共享短期存储或配置会话粘滞，本 MVP 不处理该扩展。
- **GUD-001**: UI 文案使用“提取图片”而不是“去水印”或“提取原图”，避免承诺像素去水印或绝对原始质量。
- **GUD-002**: 前端图片网格使用原生 `<input type="checkbox">`、`<img loading="lazy">` 和按钮，不新增 UI 组件或状态管理依赖。
- **PAT-001**: 沿用 `renderStartWorkspace()`、`renderApp()`、`showStage()` 和控制器回调模式；网络访问封装在功能目录的 client 中，DOM 操作封装在 controller 中。

## 2. Implementation Steps

### Implementation Phase 1 — 后端最小解析与下载接口

- **GOAL-001**: 建立不依赖第三方解析服务的公开图文提取、同源图片读取和多图 ZIP 下载能力。

| Task     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                | Completed | Date |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---- |
| TASK-001 | 在 `backend/app/xhs_import.py` 实现常量、数据结构和纯解析函数：`extract_share_url(share_text)` 限制输入为 4096 字符并返回第一个允许域名 URL；`parse_image_urls(html_text)` 使用标准库 `html.parser.HTMLParser` 收集所有 `meta` 的 `content` 属性，执行 `html.unescape()`，保留合法 `xhscdn.com` URL，再用正则 `https?://[^\"'<>\\s]+\\.xhscdn\\.com[^\"'<>\\s]*` 兜底；统一升级 HTTPS、按首次出现顺序去重并截断为 20 张。                  |           | Yes  | 2026-08-03 |
| TASK-002 | 在 `backend/app/xhs_import.py` 实现异步上游客户端，使用 `httpx.AsyncClient(follow_redirects=False)`、固定浏览器 User-Agent、连接超时 5 秒和读取超时 10 秒；实现 `fetch_note_html(url)`，每次跳转调用 SEC-001 校验，最多 4 跳，按块读取并在超过 2 MiB 时中止；实现 `fetch_image_bytes(url, remaining_budget)`，按 SEC-002 和 SEC-005 校验并返回 bytes、MIME 和扩展名。                                                                      |           | Yes  | 2026-08-03 |
| TASK-003 | 在 `backend/app/xhs_import.py` 实现进程内 `XhsExtractionStore`：`create(image_urls)` 返回 UUID；`get(extraction_id)` 对不存在或超过 600 秒的会话抛出 410 `XHS_EXTRACTION_EXPIRED`；容量固定 128；每次 `create/get` 执行惰性清理；会话仅保存创建时间和不可变 URL 元组。                                                                                                                                                                     |           | Yes  | 2026-08-03 |
| TASK-004 | 在 `backend/app/models.py` 增加严格 Pydantic 模型 `XhsExtractionRequest`（别名 `shareText`，1..4096 字符）、`XhsExtractionImage`（`id`、`previewUrl`）和 `XhsDownloadRequest`（唯一整数 `imageIds`，1..20 项）；禁止额外字段。                                                                                                                                                                                                             |           | Yes  | 2026-08-03 |
| TASK-005 | 在 `backend/app/main.py` 增加三个路由：`POST /api/xhs/extractions` 调用 TASK-001 至 TASK-003 并返回 `{extractionId, images}`；`GET /api/xhs/extractions/{extraction_id}/images/{image_id}` 返回同源图片并支持布尔查询参数 `download`；`POST /api/xhs/extractions/{extraction_id}/download` 校验图片 ID，单张直接返回图片，多张使用 `io.BytesIO` 和 `zipfile.ZipFile` 返回 `application/zip`。不得在 JSON、响应头或错误信息中返回上游 URL。 |           | Yes  | 2026-08-03 |
| TASK-006 | 在 `backend/app/xhs_import.py` 固定错误映射：400 `XHS_LINK_INVALID`，413 `XHS_LIMIT_EXCEEDED`，410 `XHS_EXTRACTION_EXPIRED`，422 `XHS_IMAGES_NOT_FOUND`，502 `XHS_FETCH_FAILED` 和 502 `XHS_IMAGE_FAILED`；在 `backend/requirements.txt` 增加 `httpx==0.28.1`。                                                                                                                                                                            |           | Yes  | 2026-08-03 |

Phase 1 completion criteria: 使用测试夹具中的快捷指令型 HTML 可返回有序图片列表；三个接口全部通过测试；任意非小红书页面 URL 和非 `xhscdn.com` 图片 URL 均在发起对应请求前被拒绝。

### Implementation Phase 2 — 首页入口、提取工作区与现有上传链路复用

- **GOAL-002**: 完成用户从复制链接到预览、选择、保存以及单图进入拼豆制作的完整交互。

| Task     | Description                                                                                                                                                                                                                                                                                                                                                                                             | Completed | Date |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---- |
| TASK-007 | 新建 `src/features/xhs-import/xhsImportWorkspace.ts` 并导出 `renderXhsImportWorkspace()`；渲染独立 `<section data-xhs-import-workspace hidden>`，包含返回按钮、说明、`textarea data-xhs-share-text`、剪贴板按钮、提交按钮、状态区、图片网格、全选按钮、已选数量、保存所选、全部保存和作为拼豆图纸按钮。                                                                                                 |           | Yes  | 2026-08-03 |
| TASK-008 | 新建 `src/features/xhs-import/client.ts`，声明 `XhsExtraction` 和 `XhsExtractionImage`；实现 `createXhsExtraction(shareText, signal)`、`fetchXhsImage(extractionId, imageId, signal)` 和 `downloadXhsImages(extractionId, imageIds, signal)`；统一解析现有 `{error:{code,message}}` 错误结构，下载函数从 `Content-Disposition` 读取文件名并通过临时对象 URL 触发一次浏览器下载。                        |           | Yes  | 2026-08-03 |
| TASK-009 | 新建 `src/features/xhs-import/controller.ts` 并导出 `createXhsImportController(options)`；控制器管理 `AbortController`、当前 extraction、`Set<number>` 选择状态、加载状态和 DOM 更新。`open()` 只重置可见错误并聚焦输入框；`reset()` 取消请求并清空会话；`destroy()` 取消请求并移除事件。剪贴板按钮调用 `navigator.clipboard.readText()`，失败时显示“无法读取剪贴板，请手动粘贴链接”并聚焦输入框。      |           | Yes  | 2026-08-03 |
| TASK-010 | 在 `src/app.ts` 导入并把 `renderXhsImportWorkspace()` 插入 start 与 preview 工作区之间；在 `src/features/start-workspace/startWorkspace.ts` 的次级操作区顶部增加 `button[data-xhs-import-entry]`，并将隐私说明改为“本地图片只在本服务处理；链接提取会访问小红书公开图片，链接和图片不会持久化。”                                                                                                        |           | Yes  | 2026-08-03 |
| TASK-011 | 修改 `src/main.ts`：把 `AppStage` 增加 `xhs` 成员；注册 `xhsImportWorkspace` 和控制器；在 `setupStart()` 中绑定入口并调用 `showStage('xhs')`；更新 `showStage()` 的当前工作区、hidden、headerContext、headerReplace 和 sessionStatus 分支；控制器的 `onBack` 执行 `reset()` 后返回 start；`onUseImage` 取得 `File` 后先返回 start，再 `await acceptFiles([file])`；`cleanup()` 调用控制器 `destroy()`。 |           | Yes  | 2026-08-03 |
| TASK-012 | 在 `src/features/xhs-import/selection.ts` 实现纯函数 `deriveXhsSelectionState(imageIds, selectedIds)`，输出 `selectedCount`、`allSelected`、`canSaveSelected`、`canUseAsPattern` 和 `patternDisabledReason`；controller 只能使用该函数决定按钮状态，保证 REQ-005 可独立单测。                                                                                                                           |           | Yes  | 2026-08-03 |
| TASK-013 | 在 `src/styles/page.css` 增加 `.xhs-import-workspace`、`.xhs-import-form`、`.xhs-image-grid`、`.xhs-image-card` 和 `.xhs-action-bar`；移动端使用 2 列网格，`min-width: 768px` 使用 3 列，`min-width: 1200px` 使用 4 列；底部操作栏使用 `position: sticky; bottom: 0`，图片容器使用 `aspect-ratio: 1` 和 `object-fit: cover`。不得改变主上传按钮的视觉优先级。                                           |           | Yes  | 2026-08-03 |

Phase 2 completion criteria: 用户可以从首页进入、手动粘贴或读取剪贴板、看到最多 20 张图片、切换选择、保存一张或 ZIP、且只有单选时可以进入现有预览工作区；返回首页和重复提取不会遗留旧请求或旧选择。

### Implementation Phase 3 — 自动化验证与交付说明

- **GOAL-003**: 用确定性测试覆盖解析、安全边界、选择规则和页面结构，并更新部署与隐私说明。

| Task     | Description                                                                                                                                                                                                                                             | Completed | Date                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------ |
| TASK-014 | 新建 `backend/tests/test_xhs_import.py`，使用本地 HTML 字符串和 `httpx.MockTransport` 覆盖 TEST-001 至 TEST-005；更新 `backend/tests/test_health.py::test_no_unrequested_api_routes_exist` 的精确路由集合。测试不得访问公网。                           |           | Yes                                        | 2026-08-03 |
| TASK-015 | 新建 `tests/xhs-import.test.ts`，使用 `happy-dom` 和注入式 fetch/clipboard stub 覆盖 TEST-006 至 TEST-009；更新 `tests/app-markup.test.ts` 对首页入口、独立工作区和新隐私文案的断言，同时继续断言主上传入口唯一且位于小红书入口之前。                   |           | Yes                                        | 2026-08-03 |
| TASK-016 | 更新 `README.md` 和 `backend/README.zh-CN.md`：记录公开图文限定、链接提取的数据流、不持久化行为、单 worker 会话约束、失败兜底“保存图片后本地上传”以及不支持 Cookie/验证码/视频；列出三个新 API 的请求和响应字段。                                       |           | Yes                                        | 2026-08-03 |
| TASK-017 | 使用用户拥有或获授权的 10 个真实公开图文链接完成手工验收：至少包含 3 个短链接、3 个多图笔记、1 个单图笔记、1 个视频笔记、1 个已删除或不可见笔记和 1 个过期链接；不提交链接、HTML 或图片到仓库。记录每类结果，不记录完整 URL 查询参数。                  |           | Pending — requires authorized live links   | —          |
| TASK-018 | 依次运行 `backend/.venv/bin/python -m pytest -q backend/tests`、`pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm format:check` 和 `pnpm build`；只有所有命令退出码为 0 且 TASK-017 的新鲜公开图文链接成功率至少 90% 时，将计划状态更新为 `Completed`。 |           | Automated checks passed; awaiting TASK-017 | 2026-08-03 |

Phase 3 completion criteria: 所有自动化命令通过；公开图文真实样本达到最低成功率；视频、无效和不可见链接显示预期中文错误；README 与实际 API 完全一致。

## 3. Alternatives

- **ALT-001**: 直接集成 `JoeanAmier/XHS-Downloader`。未选择，因为功能范围远超 MVP、引入大量依赖与状态，并需要额外处理 GPL-3.0 许可证问题。
- **ALT-002**: 使用第三方在线去水印 API。未选择，因为会把用户链接和图片发送给额外第三方，增加隐私、费用和可用性风险。
- **ALT-003**: 仅在浏览器直接请求小红书页面和 CDN。未选择，因为浏览器 CORS、跨域读取和下载可靠性不足，且无法安全复用现有 `File` 上传链路。
- **ALT-004**: 第一版完整解析 `window.__INITIAL_STATE__`。未选择，因为用户快捷指令已证明 HTML `meta` 图片地址足以覆盖首个 MVP；只有真实样本成功率低于 90% 时，才单独制定第二版兼容计划。
- **ALT-005**: 在前端使用 JSZip 生成 ZIP。未选择，因为后端 Python 标准库已有 `zipfile`，服务端生成可避免新增前端依赖并减少浏览器多文件下载拦截。

## 4. Dependencies

- **DEP-001**: `httpx==0.28.1`，用于后端异步请求、手动重定向和流式大小限制；该版本与当前本地后端环境一致。
- **DEP-002**: Python 标准库 `html.parser`、`html`、`io`、`zipfile`、`uuid`、`time` 和 `urllib.parse`；不新增 HTML 解析或 ZIP 包。
- **DEP-003**: 浏览器原生 Clipboard、Fetch、Blob、File、URL 和 Download API；Clipboard 失败必须走手动输入兜底。
- **DEP-004**: 现有 `src/main.ts::acceptFiles()`、`validateSingleImageFile()` 和预览流程，作为单选图片进入拼豆图纸的唯一入口。

## 5. Files

- **FILE-001**: `backend/app/xhs_import.py` — 新增 URL 校验、HTML 解析、上游请求、内存会话、图片读取和 ZIP 构建。
- **FILE-002**: `backend/app/models.py` — 新增提取和下载请求/响应模型。
- **FILE-003**: `backend/app/main.py` — 注册三个小红书提取相关路由。
- **FILE-004**: `backend/requirements.txt` — 增加运行时 HTTP 客户端依赖。
- **FILE-005**: `backend/tests/test_xhs_import.py` — 新增后端解析和安全测试。
- **FILE-006**: `backend/tests/test_health.py` — 更新允许的 API 路由精确集合。
- **FILE-007**: `src/features/xhs-import/xhsImportWorkspace.ts` — 新增工作区静态标记。
- **FILE-008**: `src/features/xhs-import/client.ts` — 新增同源 API 客户端。
- **FILE-009**: `src/features/xhs-import/controller.ts` — 新增交互控制器。
- **FILE-010**: `src/features/xhs-import/selection.ts` — 新增确定性选择状态函数。
- **FILE-011**: `src/features/start-workspace/startWorkspace.ts` — 新增首页入口并修改隐私说明。
- **FILE-012**: `src/app.ts` — 挂载小红书提取工作区。
- **FILE-013**: `src/main.ts` — 注册新 stage、控制器和现有图片载入回调。
- **FILE-014**: `src/styles/page.css` — 新增响应式网格和底部操作栏样式。
- **FILE-015**: `tests/xhs-import.test.ts` — 新增前端行为测试。
- **FILE-016**: `tests/app-markup.test.ts` — 更新首页与工作区结构断言。
- **FILE-017**: `README.md` — 更新用户功能和隐私说明。
- **FILE-018**: `backend/README.zh-CN.md` — 更新部署限制和 API 文档。

## 6. Testing

- **TEST-001**: 解析含多个 `<meta content="http://sns-webpic-qc.xhscdn.com/...">`、`&amp;`、重复 URL 和非图片 meta 的 HTML，断言结果升级 HTTPS、正确反转义、按顺序去重且只保留 XHS CDN。
- **TEST-002**: 对允许的短链接执行 302 至公开笔记页，再返回 HTML；断言逐跳验证生效，并对跳到 `127.0.0.1`、其他域名、第五次重定向和非 HTTP 协议返回 `XHS_LINK_INVALID` 或 `XHS_FETCH_FAILED`。
- **TEST-003**: 对超过 2 MiB HTML、超过 20 MiB 单图、超过 100 MiB 下载集合、错误 MIME 和上游超时断言确定性错误码。
- **TEST-004**: 创建会话后读取图片和 ZIP，断言单图 MIME/文件名、多图 ZIP 顺序/文件名、非法图片 ID、过期 UUID 和未知 UUID 的响应。
- **TEST-005**: 断言所有提取接口不返回上游 URL，且响应包含 `Cache-Control: no-store` 和 `X-Content-Type-Options: nosniff`。
- **TEST-006**: 对选择数量 0、1、2 和全选调用 `deriveXhsSelectionState()`，断言 REQ-005 的按钮状态和提示文本完全匹配。
- **TEST-007**: 模拟剪贴板成功、权限拒绝和空文本；断言成功时填入输入框，失败时聚焦手动输入且不发起提取请求。
- **TEST-008**: 模拟提取成功、重复提取和返回首页；断言旧请求被取消、旧选择清空、图片顺序稳定且每张卡只有一个可访问复选框。
- **TEST-009**: 模拟单选“作为拼豆图纸”和多选保存；断言单选构造一个 File 并调用 `onUseImage`，多选时按钮禁用，保存时只提交已选 ID，全部保存提交完整 ID 列表。
- **TEST-010**: 在 390 px、768 px 和 1440 px 视口手工检查网格列数、底部操作栏、键盘焦点、加载状态和错误信息，确保按钮不会遮挡最后一张图片。

## 7. Risks & Assumptions

- **RISK-001**: 小红书可能改变公开页 HTML 或只提供封面 meta，导致提取数量下降；MVP 失败时必须提示用户保存图片后本地上传，不在本版本增加风控绕过。
- **RISK-002**: 小红书 CDN 域名可能新增；任何新增域名必须先经过代码审查和测试，不得改成接受任意主机。
- **RISK-003**: 多图 ZIP 会占用进程内存；通过 20 张、20 MiB 单图和 100 MiB 总量硬限制控制最坏情况，超过限制返回 413。
- **RISK-004**: 进程重启或请求落到不同 worker 会导致会话失效；MVP 假设单 worker，错误必须可恢复，用户可重新识别链接。
- **RISK-005**: 自动提取公开图片可能受平台条款和内容版权限制；发布前必须确认产品合规文案，仅允许用户处理本人拥有或已获授权的内容。
- **ASSUMPTION-001**: 当前用户快捷指令验证过的公开图文页面继续在 HTML `meta` 标签中提供多张 `xhscdn.com` 图片地址。
- **ASSUMPTION-002**: 生产环境使用 HTTPS，因此 Clipboard API 在用户授权后可用；手动粘贴仍是永久保留的主兜底。
- **ASSUMPTION-003**: 当前部署继续使用单进程 Uvicorn，并允许后端访问小红书和 `xhscdn.com` 公网地址。
- **ASSUMPTION-004**: 现有 `acceptFiles()` 对后端返回的 JPEG、PNG 和 WebP File 无需修改验证规则，仅需在进入前切回可显示错误的 start 工作区。

## 8. Related Specifications / Further Reading

- [当前首页实现](../src/features/start-workspace/startWorkspace.ts)
- [当前图片载入链路](../src/main.ts)
- [当前后端入口](../backend/app/main.py)
- [MDN Clipboard.readText](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/readText)
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
