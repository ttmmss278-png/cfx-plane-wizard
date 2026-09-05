(() => {
  'use strict';

  const LOCAL_API_BASE = 'http://127.0.0.1:62356';
  const CONNECT_TIMEOUT_MS = 1800;
  const CONNECT_RETRY_COUNT = 18;
  const CONNECT_RETRY_DELAY_MS = 650;
  const SESSION_HEADER = 'X-Pelton-Session';
  let localSessionToken = '';
  const REQUIRED_FRAME_PERMISSIONS = [
    'local-network-access',
    'local-network',
    'loopback-network',
  ];

  function frameNeedsLocalService(frame, candidateSrc = '') {
    const src = String(candidateSrc || frame.getAttribute('src') || frame.src || '');
    return /\/modules\/(post-exporter|def-converter)\//i.test(src);
  }

  function mergeFramePermissions(value = '', needsLocalNetwork = false) {
    const parts = String(value)
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .filter(
        (part) =>
          !REQUIRED_FRAME_PERMISSIONS.some(
            (permission) => part === permission || part.startsWith(`${permission} `),
          ),
      );

    if (needsLocalNetwork) {
      for (const permission of REQUIRED_FRAME_PERMISSIONS) {
        parts.push(permission);
      }
    }
    return parts.join('; ');
  }

  const nativeSetAttribute = Element.prototype.setAttribute;

  function ensureFramePermissions(frame, candidateSrc = '') {
    if (!(frame instanceof HTMLIFrameElement)) return;
    const current = frame.getAttribute('allow') || '';
    const next = mergeFramePermissions(
      current,
      frameNeedsLocalService(frame, candidateSrc),
    );
    if (next !== current) {
      nativeSetAttribute.call(frame, 'allow', next);
    }
  }

  // React creates the module iframe dynamically. Edge applies Local Network
  // Access permissions when iframe navigation starts, so permissions must be
  // present before src is assigned rather than being added after onload.
  Element.prototype.setAttribute = function patchedSetAttribute(name, value) {
    const attributeName = String(name).toLowerCase();
    if (this instanceof HTMLIFrameElement && attributeName === 'allow') {
      return nativeSetAttribute.call(
        this,
        name,
        mergeFramePermissions(
          value == null ? '' : String(value),
          frameNeedsLocalService(this),
        ),
      );
    }
    if (this instanceof HTMLIFrameElement && attributeName === 'src') {
      ensureFramePermissions(this, value == null ? '' : String(value));
    }
    return nativeSetAttribute.call(this, name, value);
  };

  const nativeCreateElement = Document.prototype.createElement;
  Document.prototype.createElement = function patchedCreateElement() {
    const element = Reflect.apply(nativeCreateElement, this, arguments);
    if (element instanceof HTMLIFrameElement) ensureFramePermissions(element);
    return element;
  };

  const srcDescriptor = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype,
    'src',
  );
  if (srcDescriptor?.get && srcDescriptor?.set && srcDescriptor.configurable) {
    Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
      configurable: true,
      enumerable: srcDescriptor.enumerable,
      get: srcDescriptor.get,
      set(value) {
        ensureFramePermissions(this, value == null ? '' : String(value));
        srcDescriptor.set.call(this, value);
      },
    });
  }

  const allowDescriptor = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype,
    'allow',
  );
  if (
    allowDescriptor?.get &&
    allowDescriptor?.set &&
    allowDescriptor.configurable
  ) {
    Object.defineProperty(HTMLIFrameElement.prototype, 'allow', {
      configurable: true,
      enumerable: allowDescriptor.enumerable,
      get: allowDescriptor.get,
      set(value) {
        allowDescriptor.set.call(
          this,
          mergeFramePermissions(
            value == null ? '' : String(value),
            frameNeedsLocalService(this),
          ),
        );
      },
    });
  }

  function currentGitHubReturnUrl() {
    const route = /^#\/tool\/[a-z0-9-]+/i.test(window.location.hash)
      ? window.location.hash
      : '#/';
    return `${window.location.origin}${window.location.pathname}${route}`;
  }

  function invokeLocalProtocol() {
    const protocolUrl = `pelton-toolbox://start?return=${encodeURIComponent(currentGitHubReturnUrl())}`;
    const launcher = document.createElement('iframe');
    launcher.setAttribute('aria-hidden', 'true');
    launcher.style.cssText =
      'position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;border:0;opacity:0;pointer-events:none';
    launcher.src = protocolUrl;
    document.body.appendChild(launcher);
    window.setTimeout(() => launcher.remove(), 5000);
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function openLocalSession(signal) {
    const response = await fetch(`${LOCAL_API_BASE}/api/session`, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal,
      targetAddressSpace: 'loopback',
    });
    if (!response.ok) throw new Error(`Session bootstrap failed: ${response.status}`);
    const data = await response.json();
    if (data?.ok !== true || typeof data.token !== 'string' || data.token.length < 32) {
      throw new Error('Session bootstrap returned an invalid token');
    }
    localSessionToken = data.token;
    return localSessionToken;
  }

  async function probeLocalService() {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
    try {
      const sessionToken = await openLocalSession(controller.signal);
      const response = await fetch(`${LOCAL_API_BASE}/api/health`, {
        mode: 'cors',
        cache: 'no-store',
        headers: { [SESSION_HEADER]: sessionToken },
        signal: controller.signal,
        targetAddressSpace: 'loopback',
      });
      if (!response.ok) return false;
      const data = await response.json();
      if (data?.ok !== true) return false;
      const features = Array.isArray(data.features) ? data.features : [];
      if (window.location.hash.includes('/tool/post-exporter')) {
        return features.includes('select-result-files');
      }
      if (window.location.hash.includes('/tool/def-converter')) {
        return features.includes('def-conversion');
      }
      return false;
    } catch {
      localSessionToken = '';
      return false;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function readLoopbackPermission() {
    if (!navigator.permissions?.query) return 'unknown';
    for (const name of ['local-network-access', 'loopback-network']) {
      try {
        const status = await navigator.permissions.query({ name });
        if (status?.state) return status.state;
      } catch {
        // Browser versions use different names for this evolving permission.
      }
    }
    return 'unknown';
  }

  function notifyModuleFrames(connected) {
    document.querySelectorAll('.frame-shell iframe').forEach((frame) => {
      try {
        frame.contentWindow?.postMessage(
          {
            type: 'pelton-local-service-status',
            connected,
            sessionToken: connected ? localSessionToken : '',
          },
          window.location.origin,
        );
      } catch {
        // A module opened from another origin can continue independently.
      }
    });
  }

  function ensureConnectionNotice() {
    let notice = document.getElementById('pelton-local-connection-notice');
    if (notice) return notice;
    notice = document.createElement('div');
    notice.id = 'pelton-local-connection-notice';
    notice.setAttribute('role', 'status');
    notice.style.cssText = [
      'display:none',
      'margin:0 12px 10px',
      'padding:9px 12px',
      'border:1px solid color-mix(in srgb, var(--accent, #22d3ee) 48%, transparent)',
      'border-radius:10px',
      'background:color-mix(in srgb, var(--panel, #0b2237) 92%, var(--accent, #22d3ee) 8%)',
      'color:var(--text, #e6f6ff)',
      'font-size:13px',
      'line-height:1.55',
    ].join(';');
    const workspace = document.querySelector('.workspace-view-v3');
    const header = workspace?.querySelector('.module-commandbar');
    if (workspace && header) header.insertAdjacentElement('afterend', notice);
    else document.body.appendChild(notice);
    return notice;
  }

  function showConnectionNotice(message, tone = 'info') {
    const notice = ensureConnectionNotice();
    notice.textContent = message;
    notice.style.display = 'block';
    notice.dataset.tone = tone;
    if (tone === 'success' && notice.dataset.persistent !== 'true') {
      window.setTimeout(() => {
        if (notice.dataset.tone === 'success') notice.style.display = 'none';
      }, 3500);
    }
  }

  function setLauncherState(button, state) {
    const label = button.querySelector('span');
    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = label?.textContent || '启动本地服务';
    }
    button.disabled = state === 'connecting';
    button.setAttribute('aria-busy', state === 'connecting' ? 'true' : 'false');
    button.dataset.state = state;
    if (label) {
      label.textContent =
        state === 'connecting'
          ? '正在连接…'
          : state === 'connected'
            ? '本地服务已连接'
            : button.dataset.defaultLabel;
    }
  }

  let connectionGeneration = 0;

  function beginConnection(button) {
    return {
      generation: ++connectionGeneration,
      route: window.location.hash,
      button,
    };
  }

  function isCurrentConnection(operation) {
    return (
      operation.generation === connectionGeneration &&
      operation.route === window.location.hash &&
      operation.button.isConnected &&
      document.querySelector('.local-service-actions .local-launch-button') ===
        operation.button
    );
  }

  function connectedMessage(route = window.location.hash) {
    return route.includes('/tool/def-converter')
      ? '本地服务已连接，可以选择本机 CFX 文件并执行批量转换。'
      : '本地服务已连接，可以导入结果文件并自动识别完整路径。';
  }

  async function connectLocalService(button) {
    const operation = beginConnection(button);
    setLauncherState(button, 'connecting');

    const initiallyConnected = await probeLocalService();
    if (!isCurrentConnection(operation)) return;
    if (initiallyConnected) {
      notifyModuleFrames(true);
      setLauncherState(button, 'connected');
      showConnectionNotice(connectedMessage(operation.route), 'success');
      return;
    }

    const initialPermission = await readLoopbackPermission();
    if (!isCurrentConnection(operation)) return;
    if (initialPermission === 'denied') {
      notifyModuleFrames(false);
      setLauncherState(button, 'idle');
      showConnectionNotice(
        '浏览器已阻止本地连接。请打开地址栏左侧的“网站设置”，将“本地网络访问”设为“允许”，再点击“启动本地服务”。',
        'error',
      );
      return;
    }

    invokeLocalProtocol();
    showConnectionNotice('正在启动并连接本地服务；浏览器询问本地网络访问时，请选择“允许”。');

    for (let index = 0; index < CONNECT_RETRY_COUNT; index += 1) {
      await delay(CONNECT_RETRY_DELAY_MS);
      if (!isCurrentConnection(operation)) return;
      const connected = await probeLocalService();
      if (!isCurrentConnection(operation)) return;
      if (connected) {
        notifyModuleFrames(true);
        setLauncherState(button, 'connected');
        showConnectionNotice(connectedMessage(operation.route), 'success');
        return;
      }
    }

    notifyModuleFrames(false);
    setLauncherState(button, 'idle');
    const permission = await readLoopbackPermission();
    if (!isCurrentConnection(operation)) return;
    if (permission === 'denied') {
      showConnectionNotice(
        '本地服务已启动，但浏览器阻止了连接。请打开地址栏左侧的“网站设置”，将“本地网络访问”设为“允许”，再点击“启动本地服务”。',
        'error',
      );
      return;
    }
    showConnectionNotice(
      '暂未检测到本地服务。若是第一次在这台电脑使用，请先点击“下载服务包”并完成安装；已安装时请确认服务窗口保持开启。',
      'error',
    );
  }

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('.local-launch-button');
      if (!button || button.disabled) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      void connectLocalService(button);
    },
    true,
  );

  function extendFramePermissions(root = document) {
    root.querySelectorAll('iframe').forEach(ensureFramePermissions);
  }

  let lastSyncedLauncher = null;
  async function syncVisibleLauncher(force = false) {
    const button = document.querySelector('.local-service-actions .local-launch-button');
    if (!button) {
      if (lastSyncedLauncher) {
        lastSyncedLauncher = null;
        connectionGeneration += 1;
      }
      return;
    }
    if (force && button.dataset.state === 'connecting') return;
    if (!force && button === lastSyncedLauncher) return;
    lastSyncedLauncher = button;
    const operation = beginConnection(button);
    setLauncherState(button, 'connecting');
    const connected = await probeLocalService();
    if (!isCurrentConnection(operation)) return;
    if (connected) {
      notifyModuleFrames(true);
      setLauncherState(button, 'connected');
      showConnectionNotice(connectedMessage(operation.route), 'success');
    } else {
      notifyModuleFrames(false);
      setLauncherState(button, 'idle');
    }
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof HTMLIFrameElement) {
        ensureFramePermissions(record.target);
      }
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node instanceof HTMLIFrameElement) ensureFramePermissions(node);
        extendFramePermissions(node);
      }
    }
    void syncVisibleLauncher();
  });

  window.addEventListener('DOMContentLoaded', () => {
    extendFramePermissions();
    void syncVisibleLauncher();
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['allow', 'src'],
    });
  });

  window.addEventListener('focus', () => {
    void syncVisibleLauncher(true);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncVisibleLauncher(true);
  });

  window.addEventListener('hashchange', () => {
    connectionGeneration += 1;
    lastSyncedLauncher = null;
    window.requestAnimationFrame(() => void syncVisibleLauncher());
  });
})();
