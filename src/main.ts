import './styles/tokens.css';
import './styles/base.css';
import './styles/page.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Mirror Master bootstrap failed: missing #app element.');
}

app.innerHTML = `
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <div class="site-shell">
    <header class="site-header" aria-label="Mirror Master 项目页眉">
      <nav class="site-nav" aria-label="页面导航">
        <a class="brand" href="#top" aria-label="Mirror Master 首页">Mirror Master</a>
        <div class="nav-links">
          <a href="#scope">当前边界</a>
          <a href="#privacy">隐私原则</a>
          <a href="#roadmap">计划方向</a>
        </div>
      </nav>
    </header>

    <main id="main-content" class="page-main" tabindex="-1">
      <section id="top" class="hero" aria-labelledby="page-title">
        <div class="hero-copy">
          <p class="eyebrow">前端工程基础</p>
          <h1 id="page-title">Mirror Master</h1>
          <p class="hero-description">
            未来工具将用于在浏览器本地处理 Pixelanim 风格的网格图片：镜像网格单元的位置，
            同时保留每个单元内部的标签方向，例如 <code>H7</code> 仍保持可读。
          </p>
          <p class="foundation-note">
            当前版本只建立项目基础；尚未提供上传、检测、镜像、导出或任何已完成的图像处理控制。
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

      <section id="scope" class="content-section" aria-labelledby="scope-title">
        <div class="section-heading">
          <p class="eyebrow">Scope</p>
          <h2 id="scope-title">当前边界</h2>
        </div>
        <div class="status-grid">
          <article>
            <h3>已经完成</h3>
            <p>项目骨架、严格 TypeScript、代码检查、格式化配置，以及一页清晰的中文说明界面。</p>
          </article>
          <article>
            <h3>尚未实现</h3>
            <p>图片上传、网格检测、用户校正、镜像处理、Canvas 流程、OCR、OpenCV 和导出能力。</p>
          </article>
        </div>
      </section>

      <section id="privacy" class="content-section split-section" aria-labelledby="privacy-title">
        <div class="section-heading">
          <p class="eyebrow">Privacy</p>
          <h2 id="privacy-title">本地处理原则</h2>
        </div>
        <p>
          后续功能将以浏览器本地处理为边界设计。用户选择的图片应保留在自己的设备上，
          不依赖后端服务、分析埋点、远程图片或 API key。
        </p>
      </section>

      <section id="roadmap" class="content-section" aria-labelledby="roadmap-title">
        <div class="section-heading">
          <p class="eyebrow">Roadmap</p>
          <h2 id="roadmap-title">计划方向</h2>
        </div>
        <ol class="roadmap-list">
          <li>定义图片输入与本地文件读取边界。</li>
          <li>探索自动网格检测，并保留用户修正 fallback。</li>
          <li>实现网格单元位置镜像，避免把内部标签做整图像素翻转。</li>
          <li>补充本地导出流程和核心处理逻辑测试。</li>
        </ol>
      </section>
    </main>

    <footer class="site-footer">
      <p>Mirror Master 当前仅为项目基础。真实图像处理功能尚未实现。</p>
    </footer>
  </div>
`;
