(() => {
  'use strict';

  const MODULE_ROUTE = '#/tool/def-converter';

  function currentGitHubReturnUrl() {
    return `${window.location.origin}${window.location.pathname}${MODULE_ROUTE}`;
  }

  function invokeLocalProtocol() {
    const protocolUrl = `pelton-toolbox://start?return=${encodeURIComponent(currentGitHubReturnUrl())}`;
    const launcher = document.createElement('iframe');
    launcher.setAttribute('aria-hidden', 'true');
    launcher.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;border:0;opacity:0;pointer-events:none';
    launcher.src = protocolUrl;
    document.body.appendChild(launcher);
    window.setTimeout(() => launcher.remove(), 5000);
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('.local-launch-button');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    invokeLocalProtocol();
  }, true);

  function extendFramePermissions(root = document) {
    root.querySelectorAll('iframe').forEach((frame) => {
      const allow = frame.getAttribute('allow') || '';
      const permissions = ['local-network-access', 'local-network', 'loopback-network'];
      let next = allow;
      for (const permission of permissions) {
        if (!next.includes(permission)) next += `${next.trim() ? '; ' : ''}${permission}`;
      }
      frame.setAttribute('allow', next);
    });
  }

  const observer = new MutationObserver(() => extendFramePermissions());
  window.addEventListener('DOMContentLoaded', () => {
    extendFramePermissions();
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();