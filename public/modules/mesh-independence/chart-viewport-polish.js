(() => {
  "use strict";

  const viewport = document.getElementById("mi-chart-viewport");
  const emptyState = document.getElementById("mi-chart-empty-state");
  const variableList = document.getElementById("mi-variable-list");
  const activeSelect = document.getElementById("mi-active-variable-select");
  const footVariable = document.getElementById("mi-chart-foot-variable");
  const footStatus = document.getElementById("mi-chart-foot-status");

  if (!viewport) return;

  const gridInputs = [
    document.getElementById("mi-coarse-count"),
    document.getElementById("mi-medium-count"),
    document.getElementById("mi-fine-count"),
  ];

  function numberValue(input) {
    const raw = input?.value?.trim() || "";
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function gridsReady() {
    const values = gridInputs.map(numberValue);
    return values.every((value) => Number.isInteger(value) && value > 0) &&
      values[0] < values[1] && values[1] < values[2];
  }

  function activeCard() {
    const activeId = activeSelect?.value;
    if (!activeId || !variableList) return null;
    try {
      return variableList.querySelector(`[data-var-id="${CSS.escape(activeId)}"]`);
    } catch {
      return null;
    }
  }

  function currentVariableState() {
    const card = activeCard();
    if (!card) return { ready: false, name: "当前变量" };

    const name = card.querySelector('[data-field="name"]')?.value?.trim() ||
      card.querySelector(".mi-variable-title")?.textContent?.trim() ||
      "当前变量";
    const values = ["coarse", "medium", "fine"].map((level) =>
      numberValue(card.querySelector(`[data-level="${level}"]`)),
    );

    return {
      name,
      ready: gridsReady() && values.every((value) => value !== null),
    };
  }

  function refresh() {
    const state = currentVariableState();
    viewport.classList.toggle("is-ready", state.ready);
    if (emptyState) emptyState.setAttribute("aria-hidden", state.ready ? "true" : "false");
    if (footVariable) footVariable.textContent = `当前变量：${state.name}`;
    if (footStatus) {
      footStatus.textContent = state.ready
        ? "已生成原始收敛趋势，GCI / Richardson 将在正式模型接入后叠加"
        : "等待完整网格规模与当前变量三组结果";
    }
  }

  function queueRefresh() {
    queueMicrotask(refresh);
  }

  document.addEventListener("input", queueRefresh);
  document.addEventListener("change", queueRefresh);
  document.addEventListener("click", queueRefresh);

  const observer = new MutationObserver(queueRefresh);
  observer.observe(variableList || document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  [0, 100, 400].forEach((delay) => window.setTimeout(refresh, delay));
})();
