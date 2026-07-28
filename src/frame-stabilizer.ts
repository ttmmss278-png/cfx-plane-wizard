const READY_CLASS = "pelton-frame-ready";
const EMBEDDED_PARAM = "embedded";

function isEmbeddedModuleFrame(frame: HTMLIFrameElement) {
  try {
    const url = new URL(frame.src, window.location.href);
    return url.searchParams.get(EMBEDDED_PARAM) === "1";
  } catch {
    return false;
  }
}

function stylesheetApplied(doc: Document, id: string) {
  const link = doc.getElementById(id) as HTMLLinkElement | null;
  return Boolean(link?.sheet);
}

function embeddedLayoutReady(frame: HTMLIFrameElement) {
  try {
    const doc = frame.contentDocument;
    if (!doc?.documentElement || !doc.body) return false;

    if (doc.documentElement.dataset.peltonEmbedded !== "true") return false;
    if (!doc.body.classList.contains("toolbox-embedded")) return false;
    if (!stylesheetApplied(doc, "pelton-embedded-layout")) return false;

    const isPlaneWizard = frame.src.includes("/plane-wizard/");
    if (isPlaneWizard && !stylesheetApplied(doc, "plane-layout-optimization")) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function revealWhenStable(frame: HTMLIFrameElement) {
  const startedAt = performance.now();
  const timeoutMs = 1800;

  const check = () => {
    if (!frame.isConnected) return;

    if (embeddedLayoutReady(frame) || performance.now() - startedAt >= timeoutMs) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => frame.classList.add(READY_CLASS));
      });
      return;
    }

    requestAnimationFrame(check);
  };

  check();
}

function registerFrame(frame: HTMLIFrameElement) {
  if (!isEmbeddedModuleFrame(frame) || frame.dataset.peltonStabilizer === "1") {
    return;
  }

  frame.dataset.peltonStabilizer = "1";
  frame.classList.remove(READY_CLASS);

  frame.addEventListener("load", () => {
    frame.classList.remove(READY_CLASS);
    revealWhenStable(frame);
  });

  try {
    if (frame.contentDocument?.readyState === "complete") {
      revealWhenStable(frame);
    }
  } catch {
    frame.classList.add(READY_CLASS);
  }
}

function scanFrames(root: ParentNode = document) {
  root
    .querySelectorAll<HTMLIFrameElement>('iframe[src*="embedded=1"]')
    .forEach(registerFrame);
}

function startFrameStabilizer() {
  scanFrames();

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node instanceof HTMLIFrameElement) registerFrame(node);
        scanFrames(node);
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startFrameStabilizer, { once: true });
} else {
  startFrameStabilizer();
}
