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
            <p class="eyebrow">INPUT-001</p>
            <h1 id="page-title">Mirror Master</h1>
            <p class="hero-description">
              现在可以选择一张本地 PNG、JPEG 或 WebP 图片，并在浏览器内查看原图预览与真实尺寸信息。
              网格识别、镜像处理和图片导出仍未开放。
            </p>
            <p class="foundation-note">
              图片只在当前浏览器本地解码预览；本节点不包含 OCR、OpenCV、Canvas 处理、自动选择或远程上传。
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
              <p>本地单图选择、拖放输入、格式校验、原图预览、文件元数据展示，以及资源清理。</p>
            </article>
            <article>
              <h3>尚未实现</h3>
              <p>网格识别、用户校正、自动选择、镜像处理、Canvas 流程、OCR、OpenCV 和导出能力。</p>
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
            对象 URL 和本地图片解码来生成预览与尺寸信息。
          </p>
        </section>

        <section id="roadmap" class="content-section" aria-labelledby="roadmap-title">
          <div class="section-heading">
            <p class="eyebrow">计划</p>
            <h2 id="roadmap-title">计划方向</h2>
          </div>
          <ol class="roadmap-list">
            <li>完善本地图片输入与原图预览。</li>
            <li>探索自动网格检测，并保留用户修正 fallback。</li>
            <li>实现网格单元位置镜像，避免把内部标签做整图像素翻转。</li>
            <li>补充本地导出流程和核心处理逻辑测试。</li>
          </ol>
        </section>
      </main>

      <footer class="site-footer">
        <p>Mirror Master 当前仅支持本地原图预览。网格识别、镜像处理和导出功能尚未实现。</p>
      </footer>
    </div>
  `;
}
