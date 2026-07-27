(() => {
  'use strict';

  const CUSTOM_HASH = '#/tool/cfx-post-library-custom';
  const LIBRARY_URL = 'modules/cfx-post-library/index.html';
  const PLANE_ENHANCED_URL = 'modules/plane-wizard/enhanced.html';

  function baseUrl(path) {
    return new URL(path, document.baseURI).href;
  }

  function commandIcon(size = 18) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17l6-5-6-5"/><path d="M12 19h8"/></svg>`;
  }

  function addStyles() {
    if (document.getElementById('toolbox-enhancement-style')) return;
    const style = document.createElement('style');
    style.id = 'toolbox-enhancement-style';
    style.textContent = `
      .toolbox-custom-workspace{min-height:0;}
      .toolbox-custom-workspace .frame-shell{min-height:0;}
      .toolbox-custom-workspace iframe{width:100%;height:100%;border:0;}
      .toolbox-custom-nav .nav-icon{color:#176b87;}
      .toolbox-custom-card .card-icon{color:#176b87;}
      .toolbox-custom-card .action-arrow svg{transform:rotate(180deg);}
    `;
    document.head.appendChild(style);
  }

  function updateCounts() {
    const meta = document.querySelectorAll('.hero-meta strong');
    if (meta[0]) meta[0].textContent = '6';
    if (meta[1]) meta[1].textContent = '5';
    const count = document.querySelector('.nav-section-title .count-chip');
    if (count) count.textContent = '6';
  }

  function openCustomModule() {
    window.location.hash = CUSTOM_HASH;
    queueMicrotask(renderCustomWorkspace);
  }

  function addHomeCard() {
    const grid = document.querySelector('.tool-grid');
    if (!grid || grid.querySelector('.toolbox-custom-card')) return;
    const card = document.createElement('article');
    card.className = 'tool-card tone-blue toolbox-custom-card';
    card.innerHTML = `
      <button class="card-hit-area" aria-label="打开 CFX-Post 公式与命令库"></button>
      <div class="card-topline"><span class="sequence">06</span><span class="runtime-badge browser">${commandIcon(13)}纯浏览器</span></div>
      <div class="card-icon">${commandIcon(25)}</div>
      <div class="card-body"><span class="category">后处理</span><h3>CFX-Post 公式与命令库</h3><p>集中管理 CEL 表达式、CCL 对象、文件夹与加载包，并通过私有 GitHub 数据仓库跨设备同步。</p></div>
      <div class="feature-row"><span>CEL / CCL</span><span>文件夹管理</span><span>GitHub 同步</span></div>
      <div class="card-action"><span>进入工具</span><span class="action-arrow">${commandIcon(16)}</span></div>`;
    card.querySelector('.card-hit-area')?.addEventListener('click', openCustomModule);
    grid.appendChild(card);
  }

  function addSidebarItem() {
    const nav = document.querySelector('.module-nav');
    if (!nav || nav.querySelector('.toolbox-custom-nav')) return;
    const button = document.createElement('button');
    button.className = 'nav-item module-link toolbox-custom-nav';
    button.title = 'CFX-Post 公式与命令库';
    button.innerHTML = `<span class="nav-icon tone-blue">${commandIcon(18)}</span><span class="nav-label"><span>公式命令库</span><small>后处理</small></span>`;
    button.addEventListener('click', openCustomModule);
    nav.appendChild(button);
  }

  function removeCustomWorkspace() {
    document.querySelector('.toolbox-custom-workspace')?.remove();
    const home = document.querySelector('.home-view');
    if (home) home.style.display = '';
    document.querySelector('.toolbox-custom-nav')?.classList.remove('active');
  }

  function renderCustomWorkspace() {
    if (window.location.hash !== CUSTOM_HASH) {
      removeCustomWorkspace();
      return;
    }
    const main = document.querySelector('.main-area');
    if (!main) return;
    const home = main.querySelector('.home-view');
    if (home) home.style.display = 'none';
    document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
    document.querySelector('.toolbox-custom-nav')?.classList.add('active');
    if (main.querySelector('.toolbox-custom-workspace')) return;

    const section = document.createElement('section');
    section.className = 'workspace-view toolbox-custom-workspace';
    section.innerHTML = `
      <div class="workspace-heading">
        <div class="workspace-title">
          <button class="back-button" type="button" aria-label="返回工具总览">←</button>
          <span class="workspace-icon tone-blue">${commandIcon(21)}</span>
          <div><div class="workspace-title-row"><h1>CFX-Post 公式与命令库</h1><span class="runtime-badge browser">${commandIcon(13)}纯浏览器</span></div><p>管理 CEL、CCL、文件夹和加载包，并与私有 GitHub 数据仓库同步。</p></div>
        </div>
        <div class="workspace-actions">
          <button class="toolbar-button toolbox-refresh" type="button">刷新</button>
          <button class="toolbar-button toolbox-open" type="button">独立打开</button>
          <button class="toolbar-button toolbox-fullscreen" type="button">全屏</button>
        </div>
      </div>
      <div class="frame-shell">
        <div class="frame-statusbar"><span><span class="live-dot"></span>模块已加载</span><span>后处理</span></div>
        <iframe title="CFX-Post 公式与命令库" src="${baseUrl(LIBRARY_URL)}" loading="eager" allow="clipboard-read; clipboard-write; fullscreen"></iframe>
      </div>`;

    section.querySelector('.back-button')?.addEventListener('click', () => { window.location.hash = '#/'; });
    section.querySelector('.toolbox-refresh')?.addEventListener('click', () => {
      const iframe = section.querySelector('iframe');
      if (iframe) iframe.src = iframe.src;
    });
    section.querySelector('.toolbox-open')?.addEventListener('click', () => window.open(baseUrl(LIBRARY_URL), '_blank', 'noopener,noreferrer'));
    section.querySelector('.toolbox-fullscreen')?.addEventListener('click', async () => {
      try { await section.querySelector('.frame-shell')?.requestFullscreen(); } catch (_) {}
    });
    main.appendChild(section);
  }

  function enhancePlaneWizardFrame() {
    document.querySelectorAll('.frame-shell iframe').forEach(frame => {
      const src = frame.getAttribute('src') || '';
      if (src.includes('/modules/plane-wizard/index.html') && !src.includes('enhanced.html')) {
        frame.src = baseUrl(PLANE_ENHANCED_URL);
      }
    });
  }

  function apply() {
    addStyles();
    updateCounts();
    addHomeCard();
    addSidebarItem();
    enhancePlaneWizardFrame();
    renderCustomWorkspace();
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('button');
    if (!button || !button.textContent.includes('独立打开')) return;
    const title = document.querySelector('.workspace-title h1')?.textContent || '';
    if (!title.includes('圆截面')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.open(baseUrl(PLANE_ENHANCED_URL), '_blank', 'noopener,noreferrer');
  }, true);

  window.addEventListener('hashchange', () => setTimeout(apply, 0));
  const observer = new MutationObserver(() => requestAnimationFrame(apply));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('DOMContentLoaded', apply);
  setTimeout(apply, 300);
})();
