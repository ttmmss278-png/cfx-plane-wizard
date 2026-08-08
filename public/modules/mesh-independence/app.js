(() => {
  "use strict";

  const SKIN_KEY = "pelton-toolbox-skin-v1";
  const STORAGE_KEY = "mesh-independence-draft-v2";
  const VALID_SKINS = new Set([
    "fresh-cartoon",
    "watercolor",
    "tech-neon",
    "mechanical-cartoon",
  ]);

  const root = document.documentElement;
  const status = document.getElementById("mi-status");
  const variableCount = document.getElementById("mi-variable-count");
  const variableList = document.getElementById("mi-variable-list");
  const activeSelect = document.getElementById("mi-active-variable-select");
  const activeCaption = document.getElementById("mi-active-variable-caption");
  const addVariableButton = document.getElementById("mi-add-variable");
  const exampleButton = document.getElementById("mi-example-button");
  const clearButton = document.getElementById("mi-clear-button");
  const checkButton = document.getElementById("mi-check-button");
  const trendChart = document.getElementById("mi-trend-chart");
  const variableStatusList = document.getElementById("mi-variable-status-list");
  const diffCoarseMedium = document.getElementById("mi-diff-coarse-medium");
  const diffMediumFine = document.getElementById("mi-diff-medium-fine");

  const gridInputs = {
    coarse: document.getElementById("mi-coarse-count"),
    medium: document.getElementById("mi-medium-count"),
    fine: document.getElementById("mi-fine-count"),
  };

  function makeId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `mi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function makeVariable(seed = {}) {
    return {
      id: seed.id || makeId(),
      name: seed.name || "",
      unit: seed.unit || "",
      values: {
        coarse: seed.values?.coarse ?? "",
        medium: seed.values?.medium ?? "",
        fine: seed.values?.fine ?? "",
      },
    };
  }

  let state = {
    variables: [makeVariable()],
    activeId: "",
  };

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

  function escapeAttr(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function numericValue(valueOrInput) {
    const raw = typeof valueOrInput === "string"
      ? valueOrInput.trim()
      : valueOrInput?.value?.trim() ?? "";
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function formatNumber(value, digits = 6) {
    if (!Number.isFinite(value)) return "—";
    const abs = Math.abs(value);
    if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return value.toExponential(4);
    return Number(value.toPrecision(digits)).toString();
  }

  function formatCells(value) {
    return Number.isFinite(value) ? Math.round(value).toLocaleString("zh-CN") : "—";
  }

  function setStatus(message, type = "") {
    if (!status) return;
    status.textContent = message;
    status.className = `mi-status${type ? ` ${type}` : ""}`;
  }

  function activeVariable() {
    return state.variables.find((item) => item.id === state.activeId) || state.variables[0] || null;
  }

  function variableLabel(variable, index = 0) {
    return variable?.name?.trim() || `变量 ${index + 1}`;
  }

  function readGridCounts() {
    return {
      coarse: numericValue(gridInputs.coarse),
      medium: numericValue(gridInputs.medium),
      fine: numericValue(gridInputs.fine),
    };
  }

  function gridCountsAreValid(counts = readGridCounts()) {
    const values = [counts.coarse, counts.medium, counts.fine];
    return values.every((value) => Number.isInteger(value) && value > 0) &&
      counts.coarse < counts.medium && counts.medium < counts.fine;
  }

  function variableValuesAreValid(variable) {
    return ["coarse", "medium", "fine"].every(
      (level) => numericValue(String(variable?.values?.[level] ?? "")) !== null,
    );
  }

  function persistDraft() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          counts: {
            coarse: gridInputs.coarse?.value || "",
            medium: gridInputs.medium?.value || "",
            fine: gridInputs.fine?.value || "",
          },
          variables: state.variables,
          activeId: state.activeId,
        }),
      );
    } catch {
      // The module remains fully usable when storage is blocked.
    }
  }

  function restoreDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!draft || !Array.isArray(draft.variables) || !draft.variables.length) return false;
      gridInputs.coarse.value = draft.counts?.coarse || "";
      gridInputs.medium.value = draft.counts?.medium || "";
      gridInputs.fine.value = draft.counts?.fine || "";
      state.variables = draft.variables.map(makeVariable);
      state.activeId = state.variables.some((item) => item.id === draft.activeId)
        ? draft.activeId
        : state.variables[0].id;
      return true;
    } catch {
      return false;
    }
  }

  function renderVariables() {
    if (!variableList) return;
    if (!state.variables.length) state.variables = [makeVariable()];
    if (!state.variables.some((item) => item.id === state.activeId)) {
      state.activeId = state.variables[0].id;
    }

    variableList.innerHTML = state.variables
      .map((variable, index) => {
        const active = variable.id === state.activeId;
        return `
          <article class="mi-variable-card${active ? " active" : ""}" data-var-id="${escapeAttr(variable.id)}">
            <div class="mi-variable-topline">
              <button class="mi-variable-select${active ? " active" : ""}" type="button" data-action="select" aria-label="查看${escapeAttr(variableLabel(variable, index))}">${String(index + 1).padStart(2, "0")}</button>
              <label class="mi-variable-name">
                <span>物理量名称</span>
                <input data-field="name" type="text" value="${escapeAttr(variable.name)}" placeholder="例如：效率" autocomplete="off" />
              </label>
              <label class="mi-variable-unit">
                <span>单位</span>
                <input data-field="unit" type="text" value="${escapeAttr(variable.unit)}" placeholder="%、Pa、N·m" autocomplete="off" />
              </label>
              <button class="mi-variable-remove" type="button" data-action="remove" title="删除变量" aria-label="删除${escapeAttr(variableLabel(variable, index))}">×</button>
            </div>
            <div class="mi-variable-values">
              <label>
                <span>粗网格 <small>φ₃</small></span>
                <input data-level="coarse" type="number" step="any" inputmode="decimal" value="${escapeAttr(variable.values.coarse)}" placeholder="计算结果" />
              </label>
              <label>
                <span>中网格 <small>φ₂</small></span>
                <input data-level="medium" type="number" step="any" inputmode="decimal" value="${escapeAttr(variable.values.medium)}" placeholder="计算结果" />
              </label>
              <label>
                <span>细网格 <small>φ₁</small></span>
                <input data-level="fine" type="number" step="any" inputmode="decimal" value="${escapeAttr(variable.values.fine)}" placeholder="计算结果" />
              </label>
            </div>
          </article>`;
      })
      .join("");

    updateVariableMeta();
  }

  function updateVariableMeta() {
    if (variableCount) variableCount.textContent = `${state.variables.length} 个变量`;
    if (activeSelect) {
      activeSelect.innerHTML = state.variables
        .map((variable, index) => `<option value="${escapeAttr(variable.id)}">${escapeAttr(variableLabel(variable, index))}</option>`)
        .join("");
      activeSelect.value = state.activeId;
    }
    renderVariableStatusList();
    updateActiveView();
  }

  function selectVariable(id) {
    if (!state.variables.some((item) => item.id === id)) return;
    state.activeId = id;
    variableList?.querySelectorAll(".mi-variable-card").forEach((card) => {
      const active = card.dataset.varId === id;
      card.classList.toggle("active", active);
      card.querySelector(".mi-variable-select")?.classList.toggle("active", active);
    });
    if (activeSelect) activeSelect.value = id;
    persistDraft();
    updateActiveView();
  }

  function addVariable() {
    const variable = makeVariable();
    state.variables.push(variable);
    state.activeId = variable.id;
    renderVariables();
    persistDraft();
    requestAnimationFrame(() => {
      variableList?.querySelector(`[data-var-id="${CSS.escape(variable.id)}"] [data-field="name"]`)?.focus();
    });
    setStatus(`已添加第 ${state.variables.length} 个监测变量。`, "ok");
  }

  function removeVariable(id) {
    if (state.variables.length <= 1) {
      setStatus("至少保留一个监测变量。", "warn");
      return;
    }
    const index = state.variables.findIndex((item) => item.id === id);
    if (index < 0) return;
    state.variables.splice(index, 1);
    if (state.activeId === id) {
      state.activeId = state.variables[Math.min(index, state.variables.length - 1)].id;
    }
    renderVariables();
    persistDraft();
    setStatus(`已删除变量，当前共 ${state.variables.length} 个监测变量。`, "ok");
  }

  function relativeDiff(finer, coarser) {
    const a = numericValue(String(finer ?? ""));
    const b = numericValue(String(coarser ?? ""));
    if (a === null || b === null || a === 0) return null;
    return Math.abs((a - b) / a) * 100;
  }

  function updatePrecheck(variable) {
    const d32 = relativeDiff(variable?.values?.medium, variable?.values?.coarse);
    const d21 = relativeDiff(variable?.values?.fine, variable?.values?.medium);
    if (diffCoarseMedium) {
      diffCoarseMedium.textContent = `粗→中：${d32 === null ? "—" : `${formatNumber(d32, 4)} %`}`;
    }
    if (diffMediumFine) {
      diffMediumFine.textContent = `中→细：${d21 === null ? "—" : `${formatNumber(d21, 4)} %`}`;
    }
  }

  function renderVariableStatusList() {
    if (!variableStatusList) return;
    variableStatusList.innerHTML = state.variables
      .map((variable, index) => {
        const complete = variable.name.trim() && variableValuesAreValid(variable);
        return `<span class="${complete ? "ready" : ""}">${escapeAttr(variableLabel(variable, index))}<small>${complete ? "数据完整" : "待补充"}</small></span>`;
      })
      .join("");
  }

  function svgElement(name, attrs = {}, text = "") {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text) node.textContent = text;
    return node;
  }

  function clearChart() {
    if (trendChart) trendChart.replaceChildren();
  }

  function drawChartBase(message, yTitle = "监测物理量") {
    if (!trendChart) return;
    clearChart();
    const W = 760;
    const H = 420;
    const left = 92;
    const right = 28;
    const top = 38;
    const bottom = 72;
    const plotW = W - left - right;
    const plotH = H - top - bottom;

    trendChart.append(
      svgElement("rect", { x: 0, y: 0, width: W, height: H, fill: "#ffffff" }),
      svgElement("line", { x1: left, y1: top, x2: left, y2: top + plotH, class: "mi-paper-axis" }),
      svgElement("line", { x1: left, y1: top + plotH, x2: left + plotW, y2: top + plotH, class: "mi-paper-axis" }),
      svgElement("text", { x: left + plotW / 2, y: H - 24, "text-anchor": "middle", class: "mi-paper-label" }, "网格单元数 N"),
      svgElement("text", { x: 24, y: top + plotH / 2, "text-anchor": "middle", transform: `rotate(-90 24 ${top + plotH / 2})`, class: "mi-paper-label" }, yTitle),
      svgElement("text", { x: left + plotW / 2, y: top + plotH / 2, "text-anchor": "middle", class: "mi-paper-empty" }, message),
    );
  }

  function drawTrendChart(variable) {
    const counts = readGridCounts();
    const values = {
      coarse: numericValue(String(variable?.values?.coarse ?? "")),
      medium: numericValue(String(variable?.values?.medium ?? "")),
      fine: numericValue(String(variable?.values?.fine ?? "")),
    };
    const name = variable?.name?.trim() || "监测物理量";
    const unit = variable?.unit?.trim();
    const yTitle = unit ? `${name} / ${unit}` : name;

    if (!gridCountsAreValid(counts) || Object.values(values).some((value) => value === null)) {
      drawChartBase("输入完整的网格数量与当前变量结果后显示原始收敛趋势", yTitle);
      return;
    }

    if (!trendChart) return;
    clearChart();

    const W = 760;
    const H = 420;
    const left = 92;
    const right = 30;
    const top = 48;
    const bottom = 78;
    const plotW = W - left - right;
    const plotH = H - top - bottom;
    const levels = ["coarse", "medium", "fine"];
    const xRaw = levels.map((level) => Math.log10(counts[level]));
    const yRaw = levels.map((level) => values[level]);
    const xMin = Math.min(...xRaw);
    const xMax = Math.max(...xRaw);
    let yMin = Math.min(...yRaw);
    let yMax = Math.max(...yRaw);
    const rawRange = yMax - yMin;
    const yPad = rawRange === 0 ? Math.max(Math.abs(yMax) * 0.03, 1) : rawRange * 0.18;
    yMin -= yPad;
    yMax += yPad;

    const x = (value) => left + ((value - xMin) / Math.max(xMax - xMin, 1e-12)) * plotW;
    const y = (value) => top + (1 - (value - yMin) / Math.max(yMax - yMin, 1e-12)) * plotH;

    trendChart.appendChild(svgElement("rect", { x: 0, y: 0, width: W, height: H, fill: "#ffffff" }));
    trendChart.appendChild(svgElement("text", { x: left, y: 24, class: "mi-paper-title" }, `${name}网格收敛趋势（原始数据）`));

    for (let i = 0; i <= 4; i += 1) {
      const value = yMin + ((yMax - yMin) * i) / 4;
      const yy = y(value);
      trendChart.append(
        svgElement("line", { x1: left, y1: yy, x2: left + plotW, y2: yy, class: "mi-paper-grid" }),
        svgElement("text", { x: left - 12, y: yy + 4, "text-anchor": "end", class: "mi-paper-tick" }, formatNumber(value, 5)),
      );
    }

    trendChart.append(
      svgElement("line", { x1: left, y1: top, x2: left, y2: top + plotH, class: "mi-paper-axis" }),
      svgElement("line", { x1: left, y1: top + plotH, x2: left + plotW, y2: top + plotH, class: "mi-paper-axis" }),
    );

    const points = levels.map((level, index) => ({
      level,
      x: x(xRaw[index]),
      y: y(yRaw[index]),
      value: yRaw[index],
      cells: counts[level],
      label: ["粗网格", "中网格", "细网格"][index],
    }));

    const pathData = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
    trendChart.appendChild(svgElement("path", { d: pathData, class: "mi-paper-line", fill: "none" }));

    points.forEach((point) => {
      trendChart.append(
        svgElement("line", { x1: point.x, y1: top + plotH, x2: point.x, y2: top + plotH + 6, class: "mi-paper-axis" }),
        svgElement("circle", { cx: point.x, cy: point.y, r: 5.5, class: "mi-paper-point" }),
        svgElement("text", { x: point.x, y: top + plotH + 24, "text-anchor": "middle", class: "mi-paper-tick" }, point.label),
        svgElement("text", { x: point.x, y: top + plotH + 41, "text-anchor": "middle", class: "mi-paper-tick secondary" }, formatCells(point.cells)),
        svgElement("text", { x: point.x, y: point.y - 12, "text-anchor": "middle", class: "mi-paper-value" }, formatNumber(point.value, 6)),
      );
    });

    trendChart.append(
      svgElement("text", { x: left + plotW / 2, y: H - 17, "text-anchor": "middle", class: "mi-paper-label" }, "网格单元数 N"),
      svgElement("text", { x: 24, y: top + plotH / 2, "text-anchor": "middle", transform: `rotate(-90 24 ${top + plotH / 2})`, class: "mi-paper-label" }, yTitle),
      svgElement("text", { x: left + plotW, y: 24, "text-anchor": "end", class: "mi-paper-note" }, "GCI / Richardson 外推点将在数学模型接入后叠加"),
    );
  }

  function updateActiveView() {
    const variable = activeVariable();
    const index = Math.max(0, state.variables.findIndex((item) => item.id === variable?.id));
    const label = variableLabel(variable, index);
    if (activeCaption) activeCaption.textContent = `当前查看：${label}`;
    updatePrecheck(variable);
    drawTrendChart(variable);
  }

  function validateAll() {
    document.querySelectorAll(".mi-invalid").forEach((node) => node.classList.remove("mi-invalid"));
    const counts = readGridCounts();

    if (!gridCountsAreValid(counts)) {
      Object.values(gridInputs).forEach((input) => input?.classList.add("mi-invalid"));
      setStatus("网格单元数必须为正整数，且满足：粗网格 < 中网格 < 细网格。", "error");
      return false;
    }

    let firstInvalid = null;
    let invalidVariables = 0;
    state.variables.forEach((variable) => {
      const card = variableList?.querySelector(`[data-var-id="${CSS.escape(variable.id)}"]`);
      const nameInput = card?.querySelector('[data-field="name"]');
      const valueInputs = ["coarse", "medium", "fine"].map((level) => card?.querySelector(`[data-level="${level}"]`));
      let invalid = false;

      if (!variable.name.trim()) {
        nameInput?.classList.add("mi-invalid");
        firstInvalid ||= nameInput;
        invalid = true;
      }

      valueInputs.forEach((input) => {
        if (numericValue(input) === null) {
          input?.classList.add("mi-invalid");
          firstInvalid ||= input;
          invalid = true;
        }
      });

      if (invalid) invalidVariables += 1;
    });

    if (invalidVariables) {
      firstInvalid?.focus();
      setStatus(`有 ${invalidVariables} 个监测变量信息不完整，请填写名称及三组计算结果。`, "error");
      return false;
    }

    setStatus(
      `格式检查通过：3 套网格、${state.variables.length} 个监测变量均已完整。后续 GCI / Richardson 将逐变量计算，并以最严格变量控制最终推荐网格。`,
      "ok",
    );
    renderVariableStatusList();
    return true;
  }

  function clearAll() {
    Object.values(gridInputs).forEach((input) => {
      input.value = "";
      input.classList.remove("mi-invalid");
    });
    state.variables = [makeVariable()];
    state.activeId = state.variables[0].id;
    renderVariables();
    persistDraft();
    setStatus("已清空。请输入三组网格数量，并添加需要验证的监测物理量。");
  }

  function loadExample() {
    gridInputs.coarse.value = "1500000";
    gridInputs.medium.value = "3200000";
    gridInputs.fine.value = "6500000";
    state.variables = [
      makeVariable({ name: "效率", unit: "%", values: { coarse: "86.21", medium: "86.78", fine: "86.91" } }),
      makeVariable({ name: "压力", unit: "MPa", values: { coarse: "2.331", medium: "2.347", fine: "2.352" } }),
      makeVariable({ name: "流量", unit: "m³/s", values: { coarse: "1.842", medium: "1.851", fine: "1.853" } }),
    ];
    state.activeId = state.variables[0].id;
    renderVariables();
    persistDraft();
    setStatus("已载入 3 个物理量示例，可切换变量查看原始收敛趋势。", "ok");
  }

  variableList?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const card = target.closest("[data-var-id]");
    if (!card) return;
    const id = card.dataset.varId;
    const action = target.closest("[data-action]")?.dataset.action;
    if (action === "select") selectVariable(id);
    if (action === "remove") removeVariable(id);
  });

  variableList?.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    input.classList.remove("mi-invalid");
    const card = input.closest("[data-var-id]");
    const variable = state.variables.find((item) => item.id === card?.dataset.varId);
    if (!variable) return;

    if (input.dataset.field === "name") variable.name = input.value;
    if (input.dataset.field === "unit") variable.unit = input.value;
    if (input.dataset.level) variable.values[input.dataset.level] = input.value;

    if (input.dataset.field === "name") updateVariableMeta();
    else {
      renderVariableStatusList();
      updateActiveView();
    }
    persistDraft();
  });

  Object.values(gridInputs).forEach((input) => {
    input?.addEventListener("input", () => {
      input.classList.remove("mi-invalid");
      persistDraft();
      updateActiveView();
    });
  });

  activeSelect?.addEventListener("change", () => selectVariable(activeSelect.value));
  addVariableButton?.addEventListener("click", addVariable);
  exampleButton?.addEventListener("click", loadExample);
  clearButton?.addEventListener("click", clearAll);
  checkButton?.addEventListener("click", validateAll);

  const restored = restoreDraft();
  if (!state.activeId) state.activeId = state.variables[0].id;
  renderVariables();
  setStatus(
    restored
      ? `已恢复本机草稿：${state.variables.length} 个监测变量。`
      : "请输入三组网格数量，并至少保留一个监测变量。",
    restored ? "ok" : "",
  );
})();
