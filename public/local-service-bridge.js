(() => {
  'use strict';

  const MODULE_ROUTE = '#/tool/def-converter';
  const REQUIRED_FRAME_PERMISSIONS = [
    'local-network-access',
    'local-network',
    'loopback-network',
  ];

  function mergeFramePermissions(value = '') {
    const parts = String(value)
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean);

    for (const permission of REQUIRED_FRAME_PERMISSIONS) {
      if (!parts.some((part) => part === permission || part.startsWith(`${permission} `))) {
        parts.push(permission);
      }
    }
    return parts.join('; ');
  }

  const nativeSetAttribute = Element.prototype.setAttribute;

  function ensureFramePermissions(frame) {
    if (!(frame instanceof HTMLIFrameElement)) return;
    const current = frame.getAttribute('allow') || '';
    const next = mergeFramePermissions(current);
    if (next !== current) {
      nativeSetAttribute.call(frame, 'allow', next);
    }
  }

  // React creates the module iframe dynamically. Edge applies Local Network
  // Access permissions when iframe navigation starts, so permissions must be
  // present before src is assigned rather than being added after onload.
  Element.prototype.setAttribute = function patchedSetAttribute(name, value) {
    if (
      this instanceof HTMLIFrameElement &&
      String(name).toLowerCase() === 'allow'
    ) {
      return nativeSetAttribute.call(
        this,
        name,
        mergeFramePermissions(value == null ? '' : String(value)),
      );
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
        ensureFramePermissions(this);
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
          mergeFramePermissions(value == null ? '' : String(value)),
        );
      },
    });
  }

  function currentGitHubReturnUrl() {
    return `${window.location.origin}${window.location.pathname}${MODULE_ROUTE}`;
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

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('.local-launch-button');
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      invokeLocalProtocol();
    },
    true,
  );

  function extendFramePermissions(root = document) {
    root.querySelectorAll('iframe').forEach(ensureFramePermissions);
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
  });

  window.addEventListener('DOMContentLoaded', () => {
    extendFramePermissions();
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['allow', 'src'],
    });
  });
})();
