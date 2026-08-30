const SECTION_FRAME_SELECTOR =
  'iframe[src*="/modules/section-normalizer/"][src*="embedded=1"]';
const SECTION_STYLE_ID = "pelton-section-normalizer-polish";
const SECTION_STYLE_HREF = new URL(
  "section-normalizer-polish.css?v=1.2",
  document.baseURI,
).href;

const observedDocuments = new WeakSet<Document>();
const pendingDocuments = new WeakSet<Document>();

function keepSectionStyleLast(doc: Document) {
  const link = doc.getElementById(SECTION_STYLE_ID) as HTMLLinkElement | null;
  if (!link || doc.head.lastElementChild === link) return;
  doc.head.appendChild(link);
}

function queueStyleOrderCheck(doc: Document) {
  if (pendingDocuments.has(doc)) return;
  pendingDocuments.add(doc);
  queueMicrotask(() => {
    pendingDocuments.delete(doc);
    keepSectionStyleLast(doc);
  });
}

function installSectionPolish(frame: HTMLIFrameElement) {
  try {
    const doc = frame.contentDocument;
    if (!doc?.head || !doc.body) return;

    let link = doc.getElementById(SECTION_STYLE_ID) as HTMLLinkElement | null;
    if (!link) {
      link = doc.createElement("link");
      link.id = SECTION_STYLE_ID;
      link.rel = "stylesheet";
    }
    link.href = SECTION_STYLE_HREF;
    doc.head.appendChild(link);

    if (!observedDocuments.has(doc)) {
      const Observer = doc.defaultView?.MutationObserver || MutationObserver;
      const observer = new Observer(() => queueStyleOrderCheck(doc));
      observer.observe(doc.head, { childList: true });
      observedDocuments.add(doc);

      doc.defaultView?.setTimeout(() => observer.disconnect(), 20000);
    }

    [0, 100, 400, 1200, 3000].forEach((delay) => {
      doc.defaultView?.setTimeout(() => keepSectionStyleLast(doc), delay);
    });
  } catch {
    // Same-origin production modules are expected; fail open when access is blocked.
  }
}

function registerSectionFrame(frame: HTMLIFrameElement) {
  if (frame.dataset.peltonSectionPolish === "1") return;
  frame.dataset.peltonSectionPolish = "1";
  frame.addEventListener("load", () => installSectionPolish(frame));

  try {
    if (frame.contentDocument?.readyState === "complete") {
      installSectionPolish(frame);
    }
  } catch {
    // Keep the original embedded module usable if access is restricted.
  }
}

function scanSectionFrames(root: ParentNode = document) {
  root
    .querySelectorAll<HTMLIFrameElement>(SECTION_FRAME_SELECTOR)
    .forEach(registerSectionFrame);
}

function startSectionPolish() {
  scanSectionFrames();

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (
          node instanceof HTMLIFrameElement &&
          node.matches(SECTION_FRAME_SELECTOR)
        ) {
          registerSectionFrame(node);
        }
        scanSectionFrames(node);
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startSectionPolish, {
    once: true,
  });
} else {
  startSectionPolish();
}

export {};
