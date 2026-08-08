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
  const bulkButton = document.getElementById("mi-bulk-button");
  const bulkModal = document.getElementById("mi-bulk-modal");
  const bulkText = document.getElementById("mi-bulk-text");
  const bulkImportButton = document.getElementById("mi-bulk-import");
  const bulkMessage = document.getElementById("mi-bulk-message");
  const exampleButton = document.getElementById("mi-example-button");
  const clearButton = document.getElementById("mi-clear-button");
  const checkButton = document.getElementById("mi-check-button");
  const trendChart = document.getElementById("mi-trend-chart");
  const variableStatusList = document.getElementById("mi-variable-status-list");
  const diffCoarseMedium = document.getElementById("mi-diff-coarse-medium");
  const diffMediumFine = document.getElementById("mi-diff-medium-fine");
  const trendStatus = document.getElementById("mi-trend-status");

  const recommendTitle = document.getElementById("mi-recommend-title");
  const recommendText = document.getElementById("mi-recommend-text");
  const decisionGrid = document.getElementById("mi-decision-grid");
  const decisionVariable = document.getElementById("mi-decision-variable");
  const decisionGci = document.getElementById("mi-decision-gci");
  const decisionReady = document.getElementById("mi-decision-ready");
  const decisionNotes = document.getElementById("mi-decision-notes");

  const metricP = document.getElementById("mi-metric-p");
  const metricExt = document.getElementById("mi-metric-ext");
  const metricGci = document.getElementById("mi-metric-gci");
  const metricRatio = document.getElementById("mi-metric-ratio");

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

  function variableIndex(variable) {
    return Math.max(0, state.variables.findIndex((item) => item.id === variable?.id));
  }

  function variableLabel(variable, index = variableIndex(variable)) {
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

  function variableIsComplete(variable) {
    return Boolean(variable?.name?.trim()) && variableValuesAreValid(variable);
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
      // The module remains usable if browser storage is blocked.
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
        const label = variableLabel(variable, index);
        return `
          <article class="mi-variable-card${active ? " active" : ""}" data-var-id="${escapeAttr(variable.id)}">
            <div class="mi-variable-topline">
              <button class="mi-variable-select${active ? " active" : ""}" type="button" data-action="select" aria-label="查看${escapeAttr(label)}">${String(index + 1).padStart(2, "0")}</button>
              <strong class="mi-variable-title">${escapeAttr(label)}</strong>
              <button class="mi-variable-remove" type="button" data-action="remove" title="删除变量" aria-label="删除${escapeAttr(label)}">×</button>
            </div>
            <div class="mi-variable-meta">
              <label class="mi-variable-name">
                <span>物理量名称</span>
                <input data-field="name" type="text" value="${escapeAttr(variable.name)}" placeholder="例如：效率" autocomplete="off" />
              </label>
              <label class="mi-variable-unit">
                <span>单位</span>
                <input data-field="unit" type="text" value="${escapeAttr(variable.unit)}" placeholder="%、Pa、N·m" autocomplete="off" />
              </label>
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

    syncVariableLabels();
  }

  function syncVariableLabels() {
    if (variableCount) variableCount.textContent = `${state.variables.length} 个变量`;

    variableList?.querySelectorAll("[data-var-id]").forEach((card) => {
      const variable = state.variables.find((item) => item.id === card.dataset.varId);
      if (!variable) return;
      const index = variableIndex(variable);
      const label = variableLabel(variable, index);
      const title = card.querySelector(".mi-variable-title");
      const selectButton = card.querySelector(".mi-variable-select");
      const removeButton = card.querySelector(".mi-variable-remove");
      if (title) title.textContent = label;
      if (selectButton) selectButton.setAttribute("aria-label", `查看${label}`);
      if (removeButton) removeButton.setAttribute("aria-label", `删除${label}`);
    });

    if (activeSelect) {
      const previous = state.activeId;
      activeSelect.innerHTML = state.variables
        .map((variable, index) => `<option value="${escapeAttr(variable.id)}">${escapeAttr(variableLabel(variable, index))}</option>`)
        .join("");
      activeSelect.value = previous;
    }

    renderVariableStatusList();
    updateDecisionPreview();
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

  function addVariable(seed = null) {
    const variable = makeVariable(seed || {});
    state.variables.push(variable);
    state.activeId = variable.id;
    renderVariables();
    persistDraft();
    requestAnimationFrame(() => {
      variableList
        ?.querySelector(`[data-var-id="${CSS.escape(variable.id)}"] [data-field="name"]`)
        ?.focus();
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

  function rawTrendAssessment(variable) {
    const coarse = numericValue(String(variable?.values?.coarse ?? ""));
    const medium = numericValue(String(variable?.values?.medium ?? ""));
    const fine = numericValue(String(variable?.values?.fine ?? ""));
    if ([coarse, medium, fine].some((value) => value === null)) {
      return { label: "等待数据", type: "neutral" };
    }

    const d32 = medium - coarse;
    const d21 = fine - medium;
    const a32 = Math.abs(d32);
    const a21 = Math.abs(d21);
    const eps = Math.max(Math.abs(coarse), Math.abs(medium), Math.abs(fine), 1) * 1e-12;

    if (a32 <= eps && a21 <= eps) {
      return { label: "三组结果一致", type: "stable" };
    }

    if (Math.abs(d32) <= eps || Math.abs(d21) <= eps) {
      return a21 <= a32
        ? { label: "变化趋缓", type: "stable" }
        : { label: "需继续检查", type: "warn" };
    }

    if (d32 * d21 > 0) {
      if (a21 < a32 * 0.95) return { label: "单调趋稳", type: "stable" };
      if (a21 <= a32 * 1.05) return { label: "单调近等幅", type: "neutral" };
      return { label: "单调变化增强", type: "warn" };
    }

    if (a21 < a32) return { label: "振荡趋稳", type: "stable" };
    return { label: "振荡需检查", type: "warn" };
  }

  function updatePrecheck(variable) {
    const d32 = relativeDiff(variable?.values?.medium, variable?.values?.coarse);
    const d21 = relativeDiff(variable?.values?.fine, variable?.values?.medium);
    const trend = rawTrendAssessment(variable);

    if (diffCoarseMedium) {
      diffCoarseMedium.textContent = `粗→中：${d32 === null ? "—" : `${formatNumber(d32, 4)} %`}`;
    }
    if (diffMediumFine) {
      diffMediumFine.textContent = `中→细：${d21 === null ? "—" : `${formatNumber(d21, 4)} %`}`;
    }
    if (trendStatus) {
      trendStatus.textContent = trend.label;
      trendStatus.className = `mi-trend-status ${trend.type}`;
    }
  }

  function renderVariableStatusList() {
    if (!variableStatusList) return;
    variableStatusList.innerHTML = state.variables
      .map((variable, index) => {
        const complete = variableIsComplete(variable);
        return `<span class="${complete ? "ready" : ""}">${escapeAttr(variableLabel(variable, index))}<small>${complete ? "数据完整" : "待补充"}</small></span>`;
      })
      .join("");
  }

  function updateDecisionPreview() {
    const countsReady = gridCountsAreValid();
    const completeCount = state.variables.filter(variableIsComplete).length;
    const allReady = countsReady && completeCount === state.variables.length && state.variables.length > 0;

    if (decisionReady) decisionReady.textContent = `${completeCount} / ${state.variables.length}`;
    if (decisionGrid) decisionGrid.textContent = "—";
    if (decisionVariable) decisionVariable.textContent = "—";
    if (decisionGci) decisionGci.textContent = "—";

    if (!countsReady) {
      if (recommendTitle) recommendTitle.textContent = "等待网格规模";
      if (recommendText) recommendText.textContent = "请先填写有效的粗、中、细网格单元数，再补充各监测变量的三组计算结果。";
      if (decisionNotes) {
        decisionNotes.innerHTML = `
          <span>○ 三套网格规模尚未通过检查</span>
          <span>${completeCount ? "✓" : "○"} 已完整填写 ${completeCount} 个监测变量</span>
          <span>○ GCI / Richardson 正式判据待接入</span>`;
      }
      return;
    }

    if (!allReady) {
      if (recommendTitle) recommendTitle.textContent = "等待变量数据";
      if (recommendText) recommendText.textContent = `网格规模有效，当前已有 ${completeCount} / ${state.variables.length} 个变量数据完整。`;
      if (decisionNotes) {
        decisionNotes.innerHTML = `
          <span>✓ 三套网格规模有效</span>
          <span>${completeCount === state.variables.length ? "✓" : "○"} 已完整填写 ${completeCount} / ${state.variables.length} 个监测变量</span>
          <span>○ GCI / Richardson 正式判据待接入</span>`;
      }
      return;
    }

    if (recommendTitle) recommendTitle.textContent = "数据已就绪，待正式判定";
    if (recommendText) {
      recommendText.textContent = `${state.variables.length} 个监测变量均已完整，可逐变量计算 GCI / Richardson，并由最严格变量确定最终网格。`;
    }
    if (decisionNotes) {
      decisionNotes.innerHTML = `
        <span>✓ 三套网格规模有效</span>
        <span>✓ ${state.variables.length} 个监测变量数据完整</span>
        <span>○ 待接入 GCI / Richardson 与综合推荐判据</span>`;
    }
  }

  function resetFormalMetrics() {
    [metricP, metricExt, metricGci, metricRatio].forEach((node) => {
      if (node) node.textContent = "—";
    });
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
    trendChart.appendChild(
      svgElement("text", { x: left, y: 24, class: "mi-paper-title" }, `${name}网格收敛趋势（原始数据）`),
    );

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

    const pathData = points
      .map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(" ");
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
      svgElement("text", { x: left + plotW, y: 24, "text-anchor": "end", class: "mi-paper-note" }, "GCI / Richardson 外推点将在正式模型接入后叠加"),
    );
  }

  function updateActiveView() {
    const variable = activeVariable();
    const label = variableLabel(variable);
    if (activeCaption) activeCaption.textContent = `当前查看：${label}`;
    updatePrecheck(variable);
    resetFormalMetrics();
    drawTrendChart(variable);
  }

  function validateAll() {
    document.querySelectorAll(".mi-invalid").forEach((node) => node.classList.remove("mi-invalid"));
    const counts = readGridCounts();

    if (!gridCountsAreValid(counts)) {
      Object.values(gridInputs).forEach((input) => input?.classList.add("mi-invalid"));
      setStatus("网格单元数必须为正整数，且满足：粗网格 < 中网格 < 细网格。", "error");
      updateDecisionPreview();
      return false;
    }

    let firstInvalid = null;
    let invalidVariables = 0;

    state.variables.forEach((variable) => {
      const card = variableList?.querySelector(`[data-var-id="${CSS.escape(variable.id)}"]`);
      const nameInput = card?.querySelector('[data-field="name"]');
      const valueInputs = ["coarse", "medium", "fine"].map(
        (level) => card?.querySelector(`[data-level="${level}"]`),
      );
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
      updateDecisionPreview();
      return false;
    }

    setStatus(
      `格式检查通过：3 套网格、${state.variables.length} 个监测变量均已完整。后续 GCI / Richardson 将逐变量计算，并以最严格变量控制最终推荐网格。`,
      "ok",
    );
    renderVariableStatusList();
    updateDecisionPreview();
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
    setStatus("已载入 3 个物理量示例，可切换变量查看原始趋势与相对变化率。", "ok");
  }

  function openBulkModal() {
    if (!bulkModal) return;
    bulkModal.classList.remove("hidden");
    if (bulkText) bulkText.value = "";
    if (bulkMessage) {
      bulkMessage.textContent = "支持从 Excel 直接复制；也支持 Tab、逗号或连续空格分隔。";
      bulkMessage.className = "mi-bulk-message";
    }
    requestAnimationFrame(() => bulkText?.focus());
  }

  function closeBulkModal() {
    bulkModal?.classList.add("hidden");
  }

  function splitBulkLine(line) {
    if (line.includes("\t")) return line.split("\t").map((item) => item.trim());
    if (line.includes(",")) return line.split(/\s*,\s*/).map((item) => item.trim());
    if (line.includes(";")) return line.split(/\s*;\s*/).map((item) => item.trim());
    return line.trim().split(/\s{2,}/).map((item) => item.trim());
  }

  function parseBulkVariables(text) {
    const rows = [];
    const errors = [];

    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line, index) => {
        const cells = splitBulkLine(line);
        if (!cells.length) return;

        const headerText = cells.join(" ");
        if (index === 0 && /(物理量|变量|名称|name)/i.test(headerText) &&
            cells.slice(-3).some((value) => numericValue(String(value)) === null)) {
          return;
        }

        let name = "";
        let unit = "";
        let coarse = "";
        let medium = "";
        let fine = "";

        if (cells.length >= 5) {
          [name, unit, coarse, medium, fine] = cells;
        } else if (cells.length === 4) {
          [name, coarse, medium, fine] = cells;
        } else {
          errors.push(`第 ${index + 1} 行列数不足`);
          return;
        }

        if (!name.trim()) {
          errors.push(`第 ${index + 1} 行缺少物理量名称`);
          return;
        }

        if ([coarse, medium, fine].some((value) => numericValue(String(value)) === null)) {
          errors.push(`第 ${index + 1} 行三组结果包含无效数值`);
          return;
        }

        rows.push(
          makeVariable({
            name: name.trim(),
            unit: unit.trim(),
            values: {
              coarse: String(coarse).trim(),
              medium: String(medium).trim(),
              fine: String(fine).trim(),
            },
          }),
        );
      });

    return { rows, errors };
  }

  function importBulkVariables() {
    const text = bulkText?.value?.trim() || "";
    if (!text) {
      if (bulkMessage) {
        bulkMessage.textContent = "请先粘贴至少一行数据。";
        bulkMessage.className = "mi-bulk-message error";
      }
      return;
    }

    const { rows, errors } = parseBulkVariables(text);
    if (errors.length) {
      if (bulkMessage) {
        bulkMessage.textContent = errors.slice(0, 3).join("；");
        bulkMessage.className = "mi-bulk-message error";
      }
      return;
    }

    if (!rows.length) {
      if (bulkMessage) {
        bulkMessage.textContent = "未识别到可导入的数据。";
        bulkMessage.className = "mi-bulk-message error";
      }
      return;
    }

    const onlyBlank =
      state.variables.length === 1 &&
      !state.variables[0].name.trim() &&
      !state.variables[0].unit.trim() &&
      !variableValuesAreValid(state.variables[0]) &&
      ["coarse", "medium", "fine"].every((level) => !String(state.variables[0].values[level] || "").trim());

    state.variables = onlyBlank ? rows : [...state.variables, ...rows];
    state.activeId = rows[0].id;
    renderVariables();
    persistDraft();
    closeBulkModal();
    setStatus(`已批量导入 ${rows.length} 个监测变量。`, "ok");
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

    if (input.dataset.field === "name") {
      const title = card?.querySelector(".mi-variable-title");
      if (title) title.textContent = variableLabel(variable);
      syncVariableLabels();
    } else {
      renderVariableStatusList();
      updateDecisionPreview();
      if (variable.id === state.activeId) updateActiveView();
    }

    persistDraft();
  });

  Object.values(gridInputs).forEach((input) => {
    input?.addEventListener("input", () => {
      input.classList.remove("mi-invalid");
      persistDraft();
      updateDecisionPreview();
      updateActiveView();
    });
  });

  activeSelect?.addEventListener("change", () => selectVariable(activeSelect.value));
  addVariableButton?.addEventListener("click", () => addVariable());
  bulkButton?.addEventListener("click", openBulkModal);
  bulkImportButton?.addEventListener("click", importBulkVariables);
  exampleButton?.addEventListener("click", loadExample);
  clearButton?.addEventListener("click", clearAll);
  checkButton?.addEventListener("click", validateAll);

  bulkModal?.querySelectorAll("[data-modal-close]").forEach((button) => {
    button.addEventListener("click", closeBulkModal);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && bulkModal && !bulkModal.classList.contains("hidden")) {
      closeBulkModal();
    }
  });

  if (!restoreDraft()) {
    state.activeId = state.variables[0].id;
  }
  renderVariables();
  updateDecisionPreview();
  updateActiveView();
})();
