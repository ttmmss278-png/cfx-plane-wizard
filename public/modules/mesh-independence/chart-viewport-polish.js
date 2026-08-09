(() => {
  "use strict";

  const viewport = document.getElementById("mi-chart-viewport");
  const emptyState = document.getElementById("mi-chart-empty-state");
  const variableList = document.getElementById("mi-variable-list");
  const activeSelect = document.getElementById("mi-active-variable-select");

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
    const cards = variableList ? [...variableList.querySelectorAll("[data-var-id]")] : [];
    const readyCount = cards.filter((item) => {
      const name = item.querySelector('[data-field="name"]')?.value?.trim();
      const values = ["coarse", "medium", "fine"].map((level) =>
        numberValue(item.querySelector(`[data-level="${level}"]`)),
      );
      return Boolean(name) && values.every((value) => value !== null);
    }).length;
    if (!card) return { ready: gridsReady() && readyCount > 0 };

    return {
      ready: gridsReady() && readyCount > 0,
    };
  }

  function refresh() {
    const state = currentVariableState();
    viewport.classList.toggle("is-ready", state.ready);
    if (emptyState) emptyState.setAttribute("aria-hidden", state.ready ? "true" : "false");
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
