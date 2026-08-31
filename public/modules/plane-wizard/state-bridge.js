"use strict";

(() => {
  const SAVED_DATA_KEY = "cst-circle-section-gen-v1";
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

  function hasValidSavedData() {
    try {
      const raw = window.localStorage.getItem(SAVED_DATA_KEY);
      return Boolean(raw && JSON.parse(raw));
    } catch {
      return false;
    }
  }

  function buttonText(button) {
    return String(button.textContent || "").replace(/\s+/g, " ").trim();
  }

  document.addEventListener("input", () => notifyDirty(true));
  document.addEventListener("change", () => notifyDirty(true));

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest("button")
      : null;
    if (!button) return;
    const text = buttonText(button);

    if (text === "保存") {
      window.setTimeout(() => {
        if (hasValidSavedData()) notifyDirty(false);
      }, 0);
      return;
    }

    if (text === "恢复") {
      window.setTimeout(() => {
        if (hasValidSavedData()) notifyDirty(false);
      }, 0);
      return;
    }

    if (text === "示例") {
      window.setTimeout(() => notifyDirty(false), 0);
      return;
    }

    if (["三点", "圆心+两点", "Q1/Q2/Q3", "C2 圆心"].includes(text)) {
      notifyDirty(true);
    }
  });

  notifyDirty(false);

  window.addEventListener("beforeunload", (event) => {
    if (window.parent !== window || !dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
})();
