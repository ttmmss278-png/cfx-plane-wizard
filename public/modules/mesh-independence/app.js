(() => {
  "use strict";

  const SKIN_KEY = "pelton-toolbox-skin-v1";
  const VALID_SKINS = new Set([
    "fresh-cartoon",
    "watercolor",
    "tech-neon",
    "mechanical-cartoon",
  ]);

  const root = document.documentElement;
  const status = document.getElementById("mi-status");
  const progress = document.getElementById("mi-input-progress");
  const clearButton = document.getElementById("mi-clear-button");
  const checkButton = document.getElementById("mi-check-button");
  const numberInputs = Array.from(
    document.querySelectorAll("[data-required-number]"),
  );

  const countInputs = [
    document.getElementById("mi-coarse-count"),
    document.getElementById("mi-medium-count"),
    document.getElementById("mi-fine-count"),
  ];

  function normalizeSkin(value) {
    return VALID_SKINS.has(value) ? value : "tech-neon";
  }

  function readParentSkin() {
    try {
      const parentSkin = window.parent?.document?.documentElement?.dataset?.peltonSkin;
      if (VALID_SKINS.has(parentSkin)) return parentSkin;
    } catch {
      // Standalone or cross-origin use falls back to local storage.
    }

    try {
      return normalizeSkin(localStorage.getItem(SKIN_KEY));
    } catch {
      return "tech-neon";
    }
  }

  function applySkin(value) {
    root.dataset.peltonSkin = normalizeSkin(value);
  }

  applySkin(readParentSkin());

  window.addEventListener("storage", (event) => {
    if (event.key === SKIN_KEY) applySkin(event.newValue);
  });

  try {
    if (window.parent && window.parent !== window) {
      window.parent.addEventListener("pelton-skin-change", (event) => {
        applySkin(event?.detail?.skinId || readParentSkin());
      });
    }
  } catch {
    // Same-origin production embedding supports this; standalone use does not need it.
  }

  function numericValue(input) {
    const raw = input?.value?.trim() ?? "";
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function isFilledNumber(input) {
    return numericValue(input) !== null;
  }

  function setStatus(message, type = "") {
    if (!status) return;
    status.textContent = message;
    status.className = `mi-status${type ? ` ${type}` : ""}`;
  }

  function updateProgress() {
    const filled = numberInputs.filter(isFilledNumber).length;
    if (progress) progress.textContent = `${filled} / ${numberInputs.length}`;
    numberInputs.forEach((input) => input.classList.remove("mi-invalid"));
    if (filled === 0) setStatus("等待输入三组网格数据。");
    else if (filled < numberInputs.length) {
      setStatus(`已填写 ${filled} 项，还需补充 ${numberInputs.length - filled} 项。`, "warn");
    } else {
      setStatus("六项数值已填写，可进行输入检查。", "ok");
    }
  }

  function validateInputs() {
    numberInputs.forEach((input) => input.classList.remove("mi-invalid"));

    const missing = numberInputs.filter((input) => !isFilledNumber(input));
    if (missing.length) {
      missing.forEach((input) => input.classList.add("mi-invalid"));
      missing[0]?.focus();
      setStatus(`还有 ${missing.length} 项数值未填写或格式无效。`, "error");
      return false;
    }

    const counts = countInputs.map(numericValue);
    const invalidCounts = countInputs.filter((input, index) => {
      const value = counts[index];
      return value === null || value <= 0 || !Number.isInteger(value);
    });

    if (invalidCounts.length) {
      invalidCounts.forEach((input) => input.classList.add("mi-invalid"));
      invalidCounts[0]?.focus();
      setStatus("网格单元数必须为大于 0 的整数。", "error");
      return false;
    }

    const [coarse, medium, fine] = counts;
    if (!(coarse < medium && medium < fine)) {
      countInputs.forEach((input) => input.classList.add("mi-invalid"));
      setStatus("网格数量应满足：粗网格 < 中网格 < 细网格。", "error");
      return false;
    }

    const quantity = document.getElementById("mi-quantity-name")?.value?.trim();
    const label = quantity ? `“${quantity}”` : "当前监测量";
    setStatus(
      `${label}的三组数据格式检查通过。GCI / Richardson 数学模型将在下一阶段确认后接入。`,
      "ok",
    );
    return true;
  }

  function clearInputs() {
    document
      .querySelectorAll(".mi-module-page input")
      .forEach((input) => {
        input.value = "";
        input.classList.remove("mi-invalid");
      });
    updateProgress();
    document.getElementById("mi-quantity-name")?.focus();
  }

  numberInputs.forEach((input) => {
    input.addEventListener("input", updateProgress);
    input.addEventListener("blur", () => {
      if (input.value.trim() && !isFilledNumber(input)) input.classList.add("mi-invalid");
    });
  });

  clearButton?.addEventListener("click", clearInputs);
  checkButton?.addEventListener("click", validateInputs);

  updateProgress();
})();
