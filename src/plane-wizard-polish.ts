const PLANE_FRAME_SELECTOR =
  'iframe[src*="/modules/plane-wizard/"][src*="embedded=1"]';
const POLISH_STYLE_ID = "pelton-plane-wizard-polish-v4";
const POLISH_STYLE_HREF = new URL(
  "plane-wizard-polish-v4.css?v=4.0",
  document.baseURI,
).href;

const documentObservers = new WeakMap<Document, MutationObserver>();
const queuedDocuments = new WeakSet<Document>();

function parseRgb(value: string) {
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const channels = match[1]
    .split(",")
    .slice(0, 3)
    .map((channel) => Number.parseFloat(channel.trim()));
  return channels.length === 3 && channels.every(Number.isFinite)
    ? channels
    : null;
}

function relativeLuminance(rgb: number[]) {
  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function hasLightBackground(element: HTMLElement, view: Window) {
  let node: HTMLElement | null = element;
  for (let depth = 0; node && depth < 3; depth += 1) {
    const background = view.getComputedStyle(node).backgroundColor;
    const rgb = parseRgb(background);
    if (rgb && relativeLuminance(rgb) > 0.72) return true;
    node = node.parentElement;
  }
  return false;
}

function markRemainingLightRows(doc: Document) {
  const view = doc.defaultView;
  if (!view || !doc.body) return;

  const bodyRect = doc.body.getBoundingClientRect();
  const maxLeft = bodyRect.left + bodyRect.width * 0.42;

  const candidates = Array.from(
    doc.body.querySelectorAll<HTMLElement>(
      'button, [role="button"], summary, div, section',
    ),
  )
    .filter((element) => {
      if (
        element.classList.contains("pelton-pw-collapse-row") ||
        element.classList.contains("pelton-pw-light-collapse-row") ||
        element.closest(".pelton-pw-geometry-viewport") ||
        element.querySelector("input, textarea, select, canvas")
      ) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      const text = (element.textContent || "").replace(/\s+/g, " ").trim();
      return (
        rect.left <= maxLeft &&
        rect.width >= 210 &&
        rect.width <= Math.min(520, bodyRect.width * 0.42) &&
        rect.height >= 28 &&
        rect.height <= 62 &&
        text.length <= 90 &&
        hasLightBackground(element, view)
      );
    })
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return rightRect.top - leftRect.top || rightRect.width - leftRect.width;
    });

  // The remaining offenders are shallow, full-width collapsible rows in the left pane.
  candidates.slice(0, 6).forEach((element) => {
    element.classList.add("pelton-pw-light-collapse-row");
  });
}

function markGeometryViewport(doc: Document) {
  const existing = doc.querySelector<HTMLElement>(
    ".pelton-pw-geometry-viewport",
  );
  if (existing) {
    existing.classList.add("pelton-pw-geometry-polished");
    return;
  }

  const graphics = Array.from(
    doc.body.querySelectorAll<HTMLElement>("canvas, svg"),
  )
    .map((element) => ({
      element,
      rect: element.getBoundingClientRect(),
    }))
    .filter(({ rect }) => rect.width > 420 && rect.height > 100)
    .sort(
      (left, right) =>
        right.rect.width * right.rect.height -
        left.rect.width * left.rect.height,
    );

  let parent = graphics[0]?.element.parentElement;
  for (let depth = 0; parent && depth < 4; depth += 1) {
    const rect = parent.getBoundingClientRect();
    if (rect.width > 440 && rect.height > 110 && rect.height < 520) {
      parent.classList.add("pelton-pw-geometry-polished");
      return;
    }
    parent = parent.parentElement;
  }
}

function decorate(doc: Document) {
  markRemainingLightRows(doc);
  markGeometryViewport(doc);
}

function scheduleDecoration(doc: Document) {
  if (queuedDocuments.has(doc)) return;
  queuedDocuments.add(doc);
  const view = doc.defaultView;
  const schedule = view?.requestAnimationFrame.bind(view) || requestAnimationFrame;
  schedule(() => {
    queuedDocuments.delete(doc);
    decorate(doc);
  });
}

function install(frame: HTMLIFrameElement) {
  try {
    const doc = frame.contentDocument;
    if (!doc?.head || !doc.body) return;

    let style = doc.getElementById(POLISH_STYLE_ID) as HTMLLinkElement | null;
    if (!style) {
      style = doc.createElement("link");
      style.id = POLISH_STYLE_ID;
      style.rel = "stylesheet";
      style.href = POLISH_STYLE_HREF;
    }
    doc.head.appendChild(style);

    decorate(doc);
    if (documentObservers.has(doc)) return;

    const Observer = doc.defaultView?.MutationObserver || MutationObserver;
    const observer = new Observer(() => scheduleDecoration(doc));
    observer.observe(doc.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-state"],
    });
    documentObservers.set(doc, observer);

    doc.defaultView?.setTimeout(() => {
      observer.disconnect();
      documentObservers.delete(doc);
    }, 20000);
  } catch {
    // The production module is same-origin; fail open if browser access is blocked.
  }
}

function register(frame: HTMLIFrameElement) {
  if (frame.dataset.peltonPlanePolish === "1") return;
  frame.dataset.peltonPlanePolish = "1";
  frame.addEventListener("load", () => install(frame));
  if (frame.contentDocument?.readyState === "complete") install(frame);
}

function scan(root: ParentNode = document) {
  root
    .querySelectorAll<HTMLIFrameElement>(PLANE_FRAME_SELECTOR)
    .forEach(register);
}

function start() {
  scan();
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (
          node instanceof HTMLIFrameElement &&
          node.matches(PLANE_FRAME_SELECTOR)
        ) {
          register(node);
        }
        scan(node);
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
