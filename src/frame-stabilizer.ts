const READY_CLASS = "pelton-frame-ready";
const EMBEDDED_PARAM = "embedded";
const DARK_THEME_ID = "pelton-embedded-dark-theme";
const PLANE_THEME_ID = "pelton-plane-wizard-dark-fix";
const PLANE_THEME_V2_ID = "pelton-plane-wizard-dark-fix-v2";
const DARK_THEME_HREF = new URL(
  "embedded-modules-dark.css?v=1.1",
  document.baseURI,
).href;
const PLANE_THEME_HREF = new URL(
  "plane-wizard-dark-fix.css?v=1.0",
  document.baseURI,
).href;
const PLANE_THEME_V2_HREF = new URL(
  "plane-wizard-dark-fix-v2.css?v=2.0",
  document.baseURI,
).href;
const DARK_THEME_MODULES = new Set([
  "post-exporter",
  "case-queue",
  "section-normalizer",
  "plane-wizard",
  "def-converter",
]);

function isEmbeddedModuleFrame(frame: HTMLIFrameElement) {
  try {
    const url = new URL(frame.src, window.location.href);
    return url.searchParams.get(EMBEDDED_PARAM) === "1";
  } catch {
    return false;
  }
}

function moduleIdFromFrame(frame: HTMLIFrameElement) {
  try {
    const pathname = new URL(frame.src, window.location.href).pathname;
    return pathname.match(/\/modules\/([^/]+)\//)?.[1] || "";
  } catch {
    return "";
  }
}

function appendStylesheet(
  doc: Document,
  id: string,
  href: string,
): HTMLLinkElement {
  let link = doc.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = doc.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
  }

  // Appending an existing node moves it behind styles inserted later by a module.
  doc.head.appendChild(link);
  return link;
}

function installDarkTheme(frame: HTMLIFrameElement) {
  const moduleId = moduleIdFromFrame(frame);
  if (!DARK_THEME_MODULES.has(moduleId)) return;

  try {
    const doc = frame.contentDocument;
    if (!doc?.head || !doc.body) return;

    doc.documentElement.dataset.peltonEmbedded = "true";
    doc.body.classList.add("toolbox-embedded", `toolbox-module-${moduleId}`);

    appendStylesheet(doc, DARK_THEME_ID, DARK_THEME_HREF);
    if (moduleId === "plane-wizard") {
      appendStylesheet(doc, PLANE_THEME_ID, PLANE_THEME_HREF);
      appendStylesheet(doc, PLANE_THEME_V2_ID, PLANE_THEME_V2_HREF);
    }
  } catch {
    // Same-origin production modules are expected; fail open if access is blocked.
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

    installDarkTheme(frame);

    if (doc.documentElement.dataset.peltonEmbedded !== "true") return false;
    if (!doc.body.classList.contains("toolbox-embedded")) return false;
    if (!stylesheetApplied(doc, "pelton-embedded-layout")) return false;

    const moduleId = moduleIdFromFrame(frame);
    const isPlaneWizard = moduleId === "plane-wizard";
    if (isPlaneWizard && !stylesheetApplied(doc, "plane-layout-optimization")) {
      return false;
    }

    if (
      DARK_THEME_MODULES.has(moduleId) &&
      !stylesheetApplied(doc, DARK_THEME_ID)
    ) {
      return false;
    }

    if (
      isPlaneWizard &&
      (!stylesheetApplied(doc, PLANE_THEME_ID) ||
        !stylesheetApplied(doc, PLANE_THEME_V2_ID))
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function revealWhenStable(frame: HTMLIFrameElement) {
  const startedAt = performance.now();
  const timeoutMs = 2600;

  const check = () => {
    if (!frame.isConnected) return;

    installDarkTheme(frame);

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
    installDarkTheme(frame);
    revealWhenStable(frame);
  });

  try {
    if (frame.contentDocument?.readyState === "complete") {
      installDarkTheme(frame);
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
