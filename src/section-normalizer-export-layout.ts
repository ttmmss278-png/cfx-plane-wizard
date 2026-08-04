const SECTION_NORMALIZER_FRAME_SELECTOR =
  'iframe[src*="/modules/section-normalizer/"][src*="embedded=1"]';
const PATCH_ID = 'pelton-section-normalizer-horizontal-export';
const PATCH_SRC = new URL(
  'section-normalizer-horizontal-export.js?v=1.0.1',
  document.baseURI,
).href;

function installPatch(frame: HTMLIFrameElement) {
  try {
    const doc = frame.contentDocument;
    if (!doc?.head || !doc.body) return;

    let script = doc.getElementById(PATCH_ID) as HTMLScriptElement | null;
    if (!script) {
      script = doc.createElement('script');
      script.id = PATCH_ID;
      script.src = PATCH_SRC;
      script.async = false;
      script.dataset.peltonInjected = 'true';
    }

    if (!script.isConnected) doc.body.appendChild(script);
  } catch {
    // Production module frames are same-origin. Fail open if browser access is blocked.
  }
}

function registerFrame(frame: HTMLIFrameElement) {
  if (frame.dataset.peltonSectionExportLayout === '1') return;
  frame.dataset.peltonSectionExportLayout = '1';
  frame.addEventListener('load', () => installPatch(frame));

  try {
    if (frame.contentDocument?.readyState === 'complete') installPatch(frame);
  } catch {
    // Ignore inaccessible frames.
  }
}

function scanFrames(root: ParentNode = document) {
  root
    .querySelectorAll<HTMLIFrameElement>(SECTION_NORMALIZER_FRAME_SELECTOR)
    .forEach(registerFrame);
}

function start() {
  scanFrames();

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (
          node instanceof HTMLIFrameElement &&
          node.matches(SECTION_NORMALIZER_FRAME_SELECTOR)
        ) {
          registerFrame(node);
        }
        scanFrames(node);
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}

export {};
