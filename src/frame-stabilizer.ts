const READY_CLASS = "pelton-frame-ready";
const EMBEDDED_PARAM = "embedded";
const DARK_THEME_ID = "pelton-embedded-dark-theme";
const SKIN_THEME_ID = "pelton-embedded-skin-theme";
const PLANE_THEME_ID = "pelton-plane-wizard-dark-fix";
const PLANE_THEME_V2_ID = "pelton-plane-wizard-dark-fix-v2";
const PLANE_THEME_V3_ID = "pelton-plane-wizard-dark-fix-v3";
const JET_QUALITY_THEME_ID = "pelton-jet-quality-evaluator-integration";
const DARK_THEME_HREF = new URL(
  "embedded-modules-dark.css?v=1.1",
  document.baseURI,
).href;
const SKIN_THEME_HREF = new URL(
  "embedded-skins.css?v=1.5",
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
const PLANE_THEME_V3_HREF = new URL(
  "plane-wizard-dark-fix-v3.css?v=3.0",
  document.baseURI,
).href;
const JET_QUALITY_THEME_HREF = new URL(
  "jet-quality-evaluator-integration.css?v=1.0.0",
  document.baseURI,
).href;
const DARK_THEME_MODULES = new Set([
  "post-exporter",
  "case-queue",
  "section-normalizer",
  "plane-wizard",
  "def-converter",
]);

const planeDecoratorObservers = new WeakMap<Document, MutationObserver>();
const planeDecorationQueued = new WeakSet<Document>();

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

function normalizeText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function directText(element: HTMLElement) {
  return normalizeText(
    Array.from(element.childNodes)
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent || "")
      .join(" "),
  );
}

function visibleArea(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect.width * rect.height : 0;
}

function findTextElements(doc: Document, target: string) {
  const matches = Array.from(doc.body.querySelectorAll<HTMLElement>("*"))
    .filter((element) => {
      const direct = directText(element);
      const full = normalizeText(element.textContent);
      return direct === target || full === target;
    })
    .filter((element) => visibleArea(element) > 0);

  return matches.sort((left, right) => visibleArea(left) - visibleArea(right));
}

function markClosestBar(
  start: HTMLElement,
  className: string,
  requiredLabels: string[],
) {
  let node: HTMLElement | null = start;
  let fallback: HTMLElement | null = null;

  for (let depth = 0; node && depth < 8; depth += 1) {
    const rect = node.getBoundingClientRect();
    const text = normalizeText(node.textContent);
    const containsLabels = requiredLabels.every((label) => text.includes(label));

    if (
      containsLabels &&
      rect.width >= 160 &&
      rect.height >= 24 &&
      rect.height <= 90
    ) {
      node.classList.add(className);
      return node;
    }

    if (
      containsLabels &&
      !fallback &&
      rect.width >= 120 &&
      rect.height >= 22 &&
      rect.height <= 110
    ) {
      fallback = node;
    }

    node = node.parentElement;
  }

  fallback?.classList.add(className);
  return fallback;
}

function markClosestCard(start: HTMLElement) {
  let node: HTMLElement | null = start.parentElement;
  let fallback: HTMLElement | null = null;

  for (let depth = 0; node && depth < 7; depth += 1) {
    const rect = node.getBoundingClientRect();
    if (
      rect.width >= 74 &&
      rect.width <= 360 &&
      rect.height >= 44 &&
      rect.height <= 190
    ) {
      fallback = node;
      if (node.childElementCount >= 2 || normalizeText(node.textContent).length > 8) {
        node.classList.add("pelton-pw-stat-card");
        return node;
      }
    }
    node = node.parentElement;
  }

  fallback?.classList.add("pelton-pw-stat-card");
  return fallback;
}

function markPanelFromBar(bar: HTMLElement | null, className: string) {
  if (!bar) return;

  let node = bar.parentElement;
  const barRect = bar.getBoundingClientRect();
  for (let depth = 0; node && depth < 4; depth += 1) {
    const rect = node.getBoundingClientRect();
    if (
      rect.width >= barRect.width * 0.92 &&
      rect.height >= barRect.height + 70
    ) {
      node.classList.add(className);
      return;
    }
    node = node.parentElement;
  }
}

function markSharedToolbar(doc: Document, labels: string[]) {
  const candidates = findTextElements(doc, labels[0]);
  for (const candidate of candidates) {
    let node: HTMLElement | null = candidate;
    for (let depth = 0; node && depth < 8; depth += 1) {
      const rect = node.getBoundingClientRect();
      const text = normalizeText(node.textContent);
      if (
        labels.every((label) => text.includes(label)) &&
        rect.width >= 300 &&
        rect.height >= 26 &&
        rect.height <= 88
      ) {
        node.classList.add("pelton-pw-output-toolbar");
        markPanelFromBar(node, "pelton-pw-output-panel");
        return node;
      }
      node = node.parentElement;
    }
  }
  return null;
}

function markGeometryViewport(doc: Document) {
  const graphics = Array.from(
    doc.body.querySelectorAll<HTMLElement>("canvas, svg"),
  )
    .map((element) => ({ element, area: visibleArea(element) }))
    .filter(({ element, area }) => {
      const rect = element.getBoundingClientRect();
      return area > 50000 && rect.width > 420 && rect.height > 100;
    })
    .sort((left, right) => right.area - left.area);

  const graphic = graphics[0]?.element;
  if (!graphic) return;

  let node: HTMLElement | null = graphic.parentElement;
  for (let depth = 0; node && depth < 4; depth += 1) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 440 && rect.height > 110 && rect.height < 520) {
      node.classList.add("pelton-pw-geometry-viewport");
      return;
    }
    node = node.parentElement;
  }
}

function decoratePlaneWizard(doc: Document) {
  if (!doc.body) return;

  let decoratedCount = 0;
  const sectionTitles = ["参数", "基准圆定义", "沿方向批量生成"];
  for (const title of sectionTitles) {
    for (const label of findTextElements(doc, title)) {
      label.classList.add("pelton-pw-heading-label");
      if (markClosestBar(label, "pelton-pw-section-heading", [title])) {
        decoratedCount += 1;
      }
    }
  }

  for (const label of findTextElements(doc, "截面预览")) {
    label.classList.add("pelton-pw-heading-label");
    const bar = markClosestBar(label, "pelton-pw-preview-heading", [
      "截面预览",
    ]);
    markPanelFromBar(bar, "pelton-pw-preview-panel");
    if (bar) decoratedCount += 1;
  }

  const statLabels = ["基准圆心", "半径", "法向量", "移动方向"];
  for (const title of statLabels) {
    for (const label of findTextElements(doc, title)) {
      label.classList.add("pelton-pw-stat-label");
      if (markClosestCard(label)) decoratedCount += 1;
    }
  }

  if (markSharedToolbar(doc, ["PLANE", "CSV", "JSON"])) {
    decoratedCount += 1;
  }

  const aside = doc.body.querySelector<HTMLElement>("aside");
  if (aside) {
    const asideWidth = aside.getBoundingClientRect().width;
    aside.querySelectorAll<HTMLElement>("button").forEach((button) => {
      const rect = button.getBoundingClientRect();
      if (
        rect.width >= asideWidth * 0.72 &&
        rect.height >= 28 &&
        rect.height <= 66
      ) {
        button.classList.add("pelton-pw-collapse-row");
        decoratedCount += 1;
      }
    });
  }

  markGeometryViewport(doc);
  doc.documentElement.dataset.peltonPlaneSemantic =
    decoratedCount > 0 ? "ready" : "waiting";
}

function schedulePlaneDecoration(doc: Document) {
  if (planeDecorationQueued.has(doc)) return;
  planeDecorationQueued.add(doc);

  const view = doc.defaultView;
  const schedule = view?.requestAnimationFrame.bind(view) || requestAnimationFrame;
  schedule(() => {
    planeDecorationQueued.delete(doc);
    decoratePlaneWizard(doc);
  });
}

function ensurePlaneDecorator(doc: Document) {
  decoratePlaneWizard(doc);
  if (planeDecoratorObservers.has(doc) || !doc.body) return;

  const Observer = doc.defaultView?.MutationObserver || MutationObserver;
  const observer = new Observer(() => schedulePlaneDecoration(doc));
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  planeDecoratorObservers.set(doc, observer);

  doc.defaultView?.setTimeout(() => {
    observer.disconnect();
    planeDecoratorObservers.delete(doc);
  }, 15000);
}

function currentSkin() {
  return document.documentElement.dataset.peltonSkin || "tech-neon";
}

function installFrameTheme(frame: HTMLIFrameElement) {
  const moduleId = moduleIdFromFrame(frame);
  if (!moduleId) return;

  try {
    const doc = frame.contentDocument;
    if (!doc?.head || !doc.body) return;

    doc.documentElement.dataset.peltonEmbedded = "true";
    doc.documentElement.dataset.peltonSkin = currentSkin();
    doc.body.classList.add("toolbox-embedded", `toolbox-module-${moduleId}`);

    if (DARK_THEME_MODULES.has(moduleId)) {
      appendStylesheet(doc, DARK_THEME_ID, DARK_THEME_HREF);
    }
    if (moduleId === "plane-wizard" && DARK_THEME_MODULES.has(moduleId)) {
      appendStylesheet(doc, PLANE_THEME_ID, PLANE_THEME_HREF);
      appendStylesheet(doc, PLANE_THEME_V2_ID, PLANE_THEME_V2_HREF);
      appendStylesheet(doc, PLANE_THEME_V3_ID, PLANE_THEME_V3_HREF);
      ensurePlaneDecorator(doc);
    }
    appendStylesheet(doc, SKIN_THEME_ID, SKIN_THEME_HREF);
    if (moduleId === "jet-quality-evaluator") {
      appendStylesheet(doc, JET_QUALITY_THEME_ID, JET_QUALITY_THEME_HREF);
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

    installFrameTheme(frame);

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

    if (!stylesheetApplied(doc, SKIN_THEME_ID)) return false;

    if (
      moduleId === "jet-quality-evaluator" &&
      !stylesheetApplied(doc, JET_QUALITY_THEME_ID)
    ) {
      return false;
    }

    if (
      isPlaneWizard &&
      (!stylesheetApplied(doc, PLANE_THEME_ID) ||
        !stylesheetApplied(doc, PLANE_THEME_V2_ID) ||
        !stylesheetApplied(doc, PLANE_THEME_V3_ID))
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
  const timeoutMs = 3000;

  const check = () => {
    if (!frame.isConnected) return;

    installFrameTheme(frame);

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
    installFrameTheme(frame);
    revealWhenStable(frame);
  });

  try {
    if (frame.contentDocument?.readyState === "complete") {
      installFrameTheme(frame);
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

  window.addEventListener("pelton-skin-change", () => {
    document
      .querySelectorAll<HTMLIFrameElement>('iframe[src*="embedded=1"]')
      .forEach(installFrameTheme);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startFrameStabilizer, { once: true });
} else {
  startFrameStabilizer();
}
