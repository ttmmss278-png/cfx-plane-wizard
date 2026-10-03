"use strict";

(() => {
  let dirty = false;

  function notifyDirty(next) {
    dirty = Boolean(next);
    if (window.parent === window) return;
    try {
      window.parent.postMessage(
        { type: "pelton-toolbox-dirty", dirty },
        window.location.origin,
      );
    } catch {
      // Standalone file/opaque origins are protected by beforeunload below.
    }
  }

  function buttonText(button) {
    return String(button.textContent || "").replace(/\s+/g, " ").trim();
  }

  // Mark pending edits before React handles the event. React's persistence effect
  // can run before bubbling reaches document, so a bubbling listener would undo
  // the successful-save notification and show a false unsaved prompt.
  document.addEventListener("input", () => notifyDirty(true), true);
  document.addEventListener("change", () => notifyDirty(true), true);
  window.addEventListener("plane-parameter-persisted", event => notifyDirty(!event.detail?.saved));

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest("button")
      : null;
    if (!button) return;
    const text = buttonText(button);

    if (button.hasAttribute("data-plane-nozzle-naming") || button.hasAttribute("data-plane-reverse-rotation") || ["三点", "圆心+两点", "Q1/Q2/Q3", "C2 圆心"].includes(text)) {
      notifyDirty(true);
    }
  }, true);

  notifyDirty(false);

  window.addEventListener("beforeunload", (event) => {
    if (window.parent !== window || !dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
})();
