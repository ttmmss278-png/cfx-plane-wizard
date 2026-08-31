const SECTION_FRAME_SELECTOR =
  'iframe[src*="/modules/section-normalizer/"][src*="embedded=1"]';
const SECTION_STYLE_ID = "pelton-section-normalizer-polish";
const SECTION_STYLE_HREF = new URL(
  "section-normalizer-polish.css?v=1.3",
  document.baseURI,
).href;

function installSectionPolish(frame: HTMLIFrameElement) {
  try {
    const doc = frame.contentDocument;
    if (!doc?.head || !doc.body) return;

    let link = doc.getElementById(SECTION_STYLE_ID) as HTMLLinkElement | null;
    if (!link) {
      link = doc.createElement("link");
      link.id = SECTION_STYLE_ID;
      link.rel = "stylesheet";
      link.href = SECTION_STYLE_HREF;
      doc.head.appendChild(link);
      return;
    }
    link.href = SECTION_STYLE_HREF;
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
