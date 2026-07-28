const EMBEDDED_THEME_ID = "pelton-embedded-dark-theme";
const EMBEDDED_THEME_HREF = new URL(
  "embedded-modules-dark.css?v=1.0",
  document.baseURI,
).href;

const DARK_THEME_MODULES = new Set([
  "post-exporter",
  "case-queue",
  "section-normalizer",
  "plane-wizard",
  "def-converter",
]);

function moduleIdFromFrame(frame: HTMLIFrameElement) {
  try {
    const source = frame.getAttribute("src") || frame.src;
    const pathname = new URL(source, document.baseURI).pathname;
    const match = pathname.match(/\/modules\/([^/]+)\//);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

function installTheme(frame: HTMLIFrameElement) {
  const moduleId = moduleIdFromFrame(frame);
  if (!DARK_THEME_MODULES.has(moduleId)) return;

  try {
    const doc = frame.contentDocument;
    if (!doc?.head || !doc.body) return;

    doc.documentElement.dataset.peltonEmbedded = "true";
    doc.body.classList.add("toolbox-embedded", `toolbox-module-${moduleId}`);

    let link = doc.getElementById(EMBEDDED_THEME_ID) as HTMLLinkElement | null;
    if (!link) {
      link = doc.createElement("link");
      link.id = EMBEDDED_THEME_ID;
      link.rel = "stylesheet";
      link.href = EMBEDDED_THEME_HREF;
    }

    // Appending an existing node moves it to the end of <head>. This is
    // intentional: the dark layer must load after each module's native CSS
    // and after plane-wizard/layout-optimization.css.
    doc.head.appendChild(link);
  } catch {
    // The toolbox modules are same-origin. Ignore inaccessible external frames
    // defensively so this presentation layer never affects application logic.
  }
}

function scheduleTheme(frame: HTMLIFrameElement) {
  // React's iframe onLoad handler adds the embedded layout layer. Re-append the
  // theme after that handler and once more after late stylesheet insertion.
  window.setTimeout(() => installTheme(frame), 0);
  window.setTimeout(() => installTheme(frame), 120);
  window.setTimeout(() => installTheme(frame), 420);
}

function watchFrame(frame: HTMLIFrameElement) {
  if (frame.dataset.peltonThemeWatched === "true") {
    scheduleTheme(frame);
    return;
  }

  frame.dataset.peltonThemeWatched = "true";
  frame.addEventListener("load", () => scheduleTheme(frame));
  scheduleTheme(frame);
}

function scanFrames(root: ParentNode = document) {
  root.querySelectorAll<HTMLIFrameElement>("iframe").forEach(watchFrame);
}

window.addEventListener(
  "load",
  (event) => {
    if (event.target instanceof HTMLIFrameElement) {
      scheduleTheme(event.target);
    }
  },
  true,
);

const observer = new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (node instanceof HTMLIFrameElement) watchFrame(node);
      scanFrames(node);
    }
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    scanFrames();
    observer.observe(document.body, { childList: true, subtree: true });
  });
} else {
  scanFrames();
  observer.observe(document.body, { childList: true, subtree: true });
}
