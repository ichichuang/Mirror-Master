import { renderLocalImageInput } from './features/local-image-input/localImageInput';

export function renderApp(): string {
  return `
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <div class="site-shell">
      <header class="site-header" aria-label="Mirror Master 项目页眉">
        <nav class="site-nav" aria-label="页面导航">
          <a class="brand" href="#top" aria-label="Mirror Master 首页">Mirror Master</a>
          <div class="nav-links">
            <a href="#input">图片输入</a>
            <a href="#scope">当前边界</a>
            <a href="#privacy">隐私原则</a>
            <a href="#roadmap">计划方向</a>
          </div>
        </nav>
      </header>

      <main id="main-content" class="page-main" tabindex="-1">
        <section id="top" class="hero" aria-labelledby="page-title">
          <div class="hero-copy">
            <p class="eyebrow">GRID-PRECISION-001</p>
            <h1 id="page-title">Mirror Master</h1>
            <p class="hero-description">
              现在可以选择一张本地 PNG、JPEG 或 WebP 图片，在浏览器内自动检测完整的
              34 × 27 Pixelanim 主网格，先进行粗校正，再生成严格整数像素精确校准。
            </p>
            <p class="foundation-note">
              检测、粗校正和精修只使用本地 Canvas 2D 与浏览器交互；本节点不包含 OCR、OpenCV、
              镜像处理、图片导出或远程上传。
            </p>
          </div>

          <figure class="grid-figure" aria-labelledby="grid-caption">
            <div class="sample-grid" aria-hidden="true">
              <span>A1</span>
              <span>B4</span>
              <span class="cell-strong">H7</span>
              <span>C2</span>
              <span>D5</span>
              <span>F8</span>
              <span>E3</span>
              <span>G6</span>
            </div>
            <figcaption id="grid-caption">静态概念示意，非处理结果</figcaption>
          </figure>
        </section>

        ${renderLocalImageInput()}

        <section id="scope" class="content-section" aria-labelledby="scope-title">
          <div class="section-heading">
            <p class="eyebrow">范围</p>
            <h2 id="scope-title">当前边界</h2>
          </div>
          <div class="status-grid">
            <article>
              <h3>已经完成</h3>
              <p>
                本地单图输入、原图预览、文件元数据展示、资源清理、34 × 27 自动检测、
                用户校正 fallback 和整数像素精确校准。
              </p>
            </article>
            <article>
              <h3>尚未实现</h3>
              <p>镜像处理、OCR、OpenCV、图片导出、下载，以及单元格位置变换。</p>
            </article>
          </div>
        </section>

        <section id="privacy" class="content-section split-section" aria-labelledby="privacy-title">
          <div class="section-heading">
            <p class="eyebrow">隐私</p>
            <h2 id="privacy-title">本地处理原则</h2>
          </div>
          <p>
            用户选择的图片不会被上传，也不会写入远程存储。当前实现只使用浏览器原生文件输入、
            对象 URL、本地图片解码和 Canvas 2D 像素读取来生成预览、尺寸信息与临时检测结果。
          </p>
        </section>

        <section id="roadmap" class="content-section" aria-labelledby="roadmap-title">
          <div class="section-heading">
            <p class="eyebrow">计划</p>
            <h2 id="roadmap-title">计划方向</h2>
          </div>
          <ol class="roadmap-list">
            <li>已完成本地图片输入与原图预览。</li>
            <li>已完成 34 × 27 主网格自动检测原型。</li>
            <li>已完成用户网格校正 fallback。</li>
            <li>已完成整数像素精确校准，确认后生成 processingReady 合同。</li>
            <li>下一步实现网格单元位置镜像，避免把内部标签做整图像素翻转。</li>
            <li>后续补充本地导出流程和更完整的核心处理逻辑测试。</li>
          </ol>
        </section>
      </main>

      <footer class="site-footer">
        <p>Mirror Master 当前支持本地预览、网格检测和手动校正。镜像处理和导出功能尚未实现。</p>
      </footer>
    </div>
  `;
}
