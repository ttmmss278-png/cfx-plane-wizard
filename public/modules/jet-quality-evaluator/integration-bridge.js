"use strict";

(() => {
  const PROJECT_KEY = "pelton-jet-quality-project";
  let dirty = false;
  let modalBaselineDirty = false;
  let labelFrame = 0;

  function notifyDirty(next) {
    dirty = Boolean(next);
    if (window.parent === window) return;
    try {
      window.parent.postMessage(
        { type: "pelton-toolbox-dirty", dirty },
        window.location.origin,
      );
    } catch {
      // The standalone page can have an opaque origin; the local unload guard
      // below still protects edits in that case.
    }
  }

  function projectWasSaved() {
    try {
      const raw = window.localStorage.getItem(PROJECT_KEY);
      return Boolean(raw && JSON.parse(raw));
    } catch {
      return false;
    }
  }

  function compactText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function actionFromButton(button) {
    const iconClass = button.querySelector("svg")?.getAttribute("class") || "";
    if (iconClass.includes("trash")) return "删除";
    if (iconClass.includes("pencil")) return "编辑";
    return "操作";
  }

  function labelRowActions() {
    document.querySelectorAll(".row-actions").forEach((actions) => {
      const sectionCard = actions.closest(".section-item");
      const row = actions.closest("tr");
      const table = actions.closest("table");
      const firstCell = row?.querySelector("th, td");
      const name = compactText(
        sectionCard?.querySelector("strong")?.textContent ||
          firstCell?.querySelector("strong")?.textContent ||
          firstCell?.textContent ||
          "当前项目",
      ) || "当前项目";
      const kind = sectionCard
        ? "截面"
        : table?.classList.contains("indicator-table")
          ? "指标"
          : "喷嘴";

      actions.querySelectorAll("button").forEach((button) => {
        button.setAttribute(
          "aria-label",
          `${actionFromButton(button)}${kind} ${name}`,
        );
      });
    });

    document.querySelectorAll('[role="dialog"] button').forEach((button) => {
      if (compactText(button.textContent) || button.getAttribute("aria-label")) return;
      const iconClass = button.querySelector("svg")?.getAttribute("class") || "";
      if (iconClass.includes("lucide-x")) {
        button.setAttribute("aria-label", "关闭编辑对话框");
      }
    });
  }

  function scheduleLabels() {
    if (labelFrame) return;
    labelFrame = window.requestAnimationFrame(() => {
      labelFrame = 0;
      labelRowActions();
    });
  }

  document.addEventListener("input", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type === "file") return;
    notifyDirty(true);
  });

  document.addEventListener("change", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type === "file") {
      // Imported Excel remains the reproducible source baseline. Any edit made
      // after the import will mark the project dirty again.
      window.setTimeout(() => notifyDirty(false), 0);
      return;
    }
    notifyDirty(true);
  });

  document.addEventListener("mousedown", (event) => {
    if (
      event.target instanceof Element &&
      event.target.classList.contains("modal-backdrop")
    ) {
      // React closes the editor from the backdrop's pointer-down handler.
      // Inputs inside the modal have already emitted dirty events, so restore
      // the state that existed before the modal was opened once it is gone.
      window.setTimeout(() => notifyDirty(modalBaselineDirty), 0);
    }
  });

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest("button")
      : null;
    if (!button) return;

    const text = compactText(button.textContent);
    const iconClass = button.querySelector("svg")?.getAttribute("class") || "";
    const opensEditor = /^(新增截面|新增指标|新增喷嘴)$/.test(text) ||
      iconClass.includes("lucide-pencil");

    if (opensEditor) {
      modalBaselineDirty = dirty;
      return;
    }

    if (button.closest('[role="dialog"]')) {
      if (text === "保存设置") {
        notifyDirty(true);
      } else if (text === "取消" || iconClass.includes("lucide-x")) {
        notifyDirty(modalBaselineDirty);
      }
      return;
    }

    if (text === "保存项目") {
      window.setTimeout(() => {
        if (projectWasSaved()) notifyDirty(false);
      }, 0);
      return;
    }

    if (
      iconClass.includes("lucide-trash") ||
      button.classList.contains("mode-option") ||
      ["等权", "自主赋权", "熵权法"].includes(text)
    ) {
      notifyDirty(true);
    }
  });

  const observer = new MutationObserver(scheduleLabels);
  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  scheduleLabels();
  notifyDirty(false);

  window.addEventListener("beforeunload", (event) => {
    if (window.parent !== window || !dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
})();
