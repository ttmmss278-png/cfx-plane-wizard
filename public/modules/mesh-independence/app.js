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
  const demoEnabled = document.getElementById("mi-demo-enabled");
  const demoBody = document.getElementById("mi-demo-body");
  const demoAnchor = document.getElementById("mi-demo-anchor");
  const demoTrend = document.getElementById("mi-demo-trend");
  const demoGenerateButton = document.getElementById("mi-demo-generate");
  const demoHint = document.getElementById("mi-demo-hint");
  const trendChart = document.getElementById("mi-trend-chart");
  const variableStatusList = document.getElementById("mi-variable-status-list");
  const diffCoarseMedium = document.getElementById("mi-diff-coarse-medium");
  const diffMediumFine = document.getElementById("mi-diff-medium-fine");
  const trendStatus = document.getElementById("mi-trend-status");
  const resultsTableHead = document.getElementById("mi-results-table-head");
  const resultsTableBody = document.getElementById("mi-results-table-body");
  const chartViewport = document.getElementById("mi-chart-viewport");
  const chartFootVariable = document.getElementById("mi-chart-foot-variable");
  const chartFootStatus = document.getElementById("mi-chart-foot-status");
  const chartModeBadge = document.getElementById("mi-chart-mode-badge");
  const exportChartButton = document.getElementById("mi-export-chart");
  const chartPanel = document.querySelector(".mi-chart-panel");
  const expandChartButton = document.getElementById("mi-expand-chart");
  const resultsTablePanel = document.getElementById("mi-results-table-panel");
  const expandTableButton = document.getElementById("mi-expand-table");
  const toggleFormulasButton = document.getElementById("mi-toggle-formulas");
  const formulaPanel = document.getElementById("mi-formula-panel");
  const formulaList = document.getElementById("mi-formula-list");
  const chartViewButtons = [...document.querySelectorAll("[data-chart-view]")];

  const GCI_DIMENSION = 3;
  const GCI_SAFETY_FACTOR = 1.25;
  const GCI_THRESHOLD = 5;
  const ASYMPTOTIC_MIN = 0.95;
  const ASYMPTOTIC_MAX = 1.05;

  const recommendTitle = document.getElementById("mi-recommend-title");
  const recommendText = document.getElementById("mi-recommend-text");
  const recommendState = document.getElementById("mi-recommend-state");
  const decisionGrid = document.getElementById("mi-decision-grid");
  const decisionVariable = document.getElementById("mi-decision-variable");
  const decisionGci = document.getElementById("mi-decision-gci");
  const decisionAsymptotic = document.getElementById("mi-decision-asymptotic");
  const decisionReady = document.getElementById("mi-decision-ready");
  const decisionSaving = document.getElementById("mi-decision-saving");
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
  let chartViewMode = "engineering";
  let lastDemoAnchorLevel = "medium";

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
            <button class="mi-variable-select${active ? " active" : ""}" type="button" data-action="select" aria-label="查看${escapeAttr(label)}">${String(index + 1).padStart(2, "0")}</button>
            <strong class="mi-variable-title" title="${escapeAttr(label)}">${escapeAttr(label)}</strong>
            <label class="mi-variable-name"><span>物理量名称</span><input data-field="name" type="text" value="${escapeAttr(variable.name)}" placeholder="例如：效率" autocomplete="off" /></label>
            <label class="mi-variable-unit"><span>单位</span><input data-field="unit" type="text" value="${escapeAttr(variable.unit)}" placeholder="%、Pa" autocomplete="off" /></label>
            <label class="mi-variable-value"><span>粗网格 φ₃</span><input data-level="coarse" type="number" step="any" inputmode="decimal" value="${escapeAttr(variable.values.coarse)}" placeholder="结果" /></label>
            <label class="mi-variable-value"><span>中网格 φ₂</span><input data-level="medium" type="number" step="any" inputmode="decimal" value="${escapeAttr(variable.values.medium)}" placeholder="结果" /></label>
            <label class="mi-variable-value"><span>细网格 φ₁</span><input data-level="fine" type="number" step="any" inputmode="decimal" value="${escapeAttr(variable.values.fine)}" placeholder="结果" /></label>
            <button class="mi-variable-remove" type="button" data-action="remove" title="删除变量" aria-label="删除${escapeAttr(label)}">×</button>
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
    refreshDemoHint();
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

  function calculateGci(variable, counts = readGridCounts()) {
    if (!gridCountsAreValid(counts) || !variableValuesAreValid(variable)) return null;

    // Celik et al. notation: 1=fine, 2=medium, 3=coarse.
    const phi1 = numericValue(String(variable.values.fine));
    const phi2 = numericValue(String(variable.values.medium));
    const phi3 = numericValue(String(variable.values.coarse));
    const epsilon21 = phi2 - phi1;
    const epsilon32 = phi3 - phi2;
    const scale = Math.max(Math.abs(phi1), Math.abs(phi2), Math.abs(phi3), 1);
    const tiny = scale * 1e-13;
    const r21 = Math.pow(counts.fine / counts.medium, 1 / GCI_DIMENSION);
    const r32 = Math.pow(counts.medium / counts.coarse, 1 / GCI_DIMENSION);

    if (Math.abs(epsilon21) <= tiny && Math.abs(epsilon32) <= tiny) {
      return {
        phi1, phi2, phi3, epsilon21, epsilon32, r21, r32,
        p: Infinity,
        phiExt: phi1,
        phiExt32: phi2,
        ea21: 0,
        ea32: 0,
        eExt21: 0,
        gciFine21: 0,
        gciCoarse32: 0,
        asymptoticRatio: 1,
        convergenceRatio: 0,
        convergence: "constant",
        valid: true,
      };
    }

    if (Math.abs(phi1) <= tiny || Math.abs(phi2) <= tiny) return null;
    if (Math.abs(epsilon21) <= tiny || Math.abs(epsilon32) <= tiny) return null;

    const ratio = epsilon32 / epsilon21;
    const sign = ratio >= 0 ? 1 : -1;
    let p = Math.abs(Math.log(Math.abs(ratio)) / Math.log(r21));
    if (!Number.isFinite(p) || p < 1e-8) p = 1;

    for (let iteration = 0; iteration < 100; iteration += 1) {
      const numerator = Math.pow(r21, p) - sign;
      const denominator = Math.pow(r32, p) - sign;
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) ||
          Math.abs(numerator) <= 1e-14 || Math.abs(denominator) <= 1e-14) break;
      const q = Math.log(Math.abs(numerator / denominator));
      const next = Math.abs((Math.log(Math.abs(ratio)) + q) / Math.log(r21));
      if (!Number.isFinite(next)) break;
      if (Math.abs(next - p) < 1e-10) {
        p = next;
        break;
      }
      p = next;
    }

    const r21p = Math.pow(r21, p);
    const r32p = Math.pow(r32, p);
    if (!Number.isFinite(r21p) || !Number.isFinite(r32p) ||
        Math.abs(r21p - 1) <= 1e-12 || Math.abs(r32p - 1) <= 1e-12) return null;

    const phiExt = (r21p * phi1 - phi2) / (r21p - 1);
    const phiExt32 = (r32p * phi2 - phi3) / (r32p - 1);
    const ea21 = Math.abs((phi1 - phi2) / phi1) * 100;
    const ea32 = Math.abs((phi2 - phi3) / phi2) * 100;
    const eExt21 = Math.abs((phiExt - phi1) / (Math.abs(phiExt) > tiny ? phiExt : scale)) * 100;
    const gciFine21 = GCI_SAFETY_FACTOR * ea21 / Math.abs(r21p - 1);
    const gciCoarse32 = GCI_SAFETY_FACTOR * ea32 / Math.abs(r32p - 1);
    const asymptoticRatio = gciFine21 <= 1e-14
      ? 1
      : gciCoarse32 / (r21p * gciFine21);
    const convergenceRatio = epsilon21 / epsilon32;
    let convergence = "divergent";
    if (convergenceRatio > 0 && convergenceRatio < 1) convergence = "monotonic";
    else if (convergenceRatio < 0 && convergenceRatio > -1) convergence = "oscillatory";

    return {
      phi1, phi2, phi3, epsilon21, epsilon32, r21, r32, p, phiExt, phiExt32,
      ea21, ea32, eExt21, gciFine21, gciCoarse32, asymptoticRatio,
      convergenceRatio, convergence,
      valid: [p, phiExt, phiExt32, ea21, eExt21, gciFine21, gciCoarse32, asymptoticRatio]
        .every(Number.isFinite),
    };
  }

  const DEMO_LEVELS = ["coarse", "medium", "fine"];
  const DEMO_TREND_LABELS = {
    increasing: "粗→中→细逐渐增大",
    decreasing: "粗→中→细逐渐减小",
    "middle-min": "中网格结果最小",
    "middle-max": "中网格结果最大",
  };

  function setDemoHint(message, type = "") {
    if (!demoHint) return;
    demoHint.textContent = message;
    demoHint.className = `mi-demo-hint${type ? ` ${type}` : ""}`;
  }

  function demoCountsFromAnchor(level, rawCount) {
    const anchorCount = Math.round(Number(rawCount));
    if (!Number.isInteger(anchorCount) || anchorCount <= 0) return null;
    const cellRatio = 2.2;
    let coarse;
    let medium;
    let fine;

    if (level === "coarse") {
      coarse = anchorCount;
      medium = Math.max(coarse + 1, Math.round(coarse * cellRatio));
      fine = Math.max(medium + 1, Math.round(medium * cellRatio));
    } else if (level === "medium") {
      if (anchorCount < 2) return null;
      medium = anchorCount;
      coarse = Math.max(1, Math.min(medium - 1, Math.round(medium / cellRatio)));
      fine = Math.max(medium + 1, Math.round(medium * cellRatio));
    } else {
      if (anchorCount < 3) return null;
      fine = anchorCount;
      medium = Math.max(2, Math.min(fine - 1, Math.round(fine / cellRatio)));
      coarse = Math.max(1, Math.min(medium - 1, Math.round(medium / cellRatio)));
    }

    const counts = { coarse, medium, fine };
    return gridCountsAreValid(counts) ? counts : null;
  }

  function demoTrendMatches(values, mode) {
    const coarse = Number(values.coarse);
    const medium = Number(values.medium);
    const fine = Number(values.fine);
    if (![coarse, medium, fine].every(Number.isFinite)) return false;
    if (mode === "increasing") return coarse < medium && medium < fine;
    if (mode === "decreasing") return coarse > medium && medium > fine;
    if (mode === "middle-min") return medium < coarse && medium < fine;
    if (mode === "middle-max") return medium > coarse && medium > fine;
    return false;
  }

  function demoValueString(value) {
    if (!Number.isFinite(value)) return "";
    const rounded = Number(value.toPrecision(13));
    return Object.is(rounded, -0) ? "0" : String(rounded);
  }

  function demoValuesFromAnchor(counts, anchorLevel, anchorValue, mode, fraction) {
    const signs = mode === "increasing"
      ? { coarse: -1, medium: -1, fine: -1 }
      : mode === "decreasing"
        ? { coarse: 1, medium: 1, fine: 1 }
        : mode === "middle-min"
          ? { coarse: 1, medium: -1, fine: 1 }
          : { coarse: -1, medium: 1, fine: -1 };
    const order = 2;
    const coefficients = Object.fromEntries(DEMO_LEVELS.map((level) => {
      const h = Math.pow(counts[level], -1 / GCI_DIMENSION);
      return [level, signs[level] * Math.pow(h, order)];
    }));
    const anchorCoefficient = coefficients[anchorLevel];
    const delta = Math.abs(anchorValue) * fraction;
    const multiplier = delta / Math.abs(anchorCoefficient);
    const extrapolated = anchorValue - multiplier * anchorCoefficient;
    const values = Object.fromEntries(DEMO_LEVELS.map((level) => [
      level,
      demoValueString(extrapolated + multiplier * coefficients[level]),
    ]));
    values[anchorLevel] = demoValueString(anchorValue);
    return values;
  }

  function buildQualifiedDemoCandidate(counts, anchorLevel, anchorValue, mode) {
    for (const fraction of [0.004, 0.002, 0.001, 0.0005, 0.0002]) {
      const values = demoValuesFromAnchor(counts, anchorLevel, anchorValue, mode, fraction);
      const result = calculateGci({ values }, counts);
      const qualified = result?.valid &&
        result.convergence !== "divergent" &&
        result.gciFine21 <= GCI_THRESHOLD &&
        result.asymptoticRatio >= ASYMPTOTIC_MIN &&
        result.asymptoticRatio <= ASYMPTOTIC_MAX &&
        demoTrendMatches(values, mode);
      if (qualified) return { values, result, fraction };
    }
    return null;
  }

  function pairedDemoLevels(variable) {
    return DEMO_LEVELS.filter((level) => {
      const count = numericValue(gridInputs[level]);
      const value = numericValue(String(variable?.values?.[level] ?? ""));
      return Number.isInteger(count) && count > 0 && value !== null && value !== 0;
    });
  }

  function resolveDemoAnchor(variable) {
    const requested = demoAnchor?.value || "auto";
    const paired = pairedDemoLevels(variable);
    const level = requested === "auto"
      ? (paired.includes(lastDemoAnchorLevel) ? lastDemoAnchorLevel : paired[0])
      : requested;
    if (!level || !DEMO_LEVELS.includes(level)) return null;
    const count = numericValue(gridInputs[level]);
    const value = numericValue(String(variable?.values?.[level] ?? ""));
    if (!Number.isInteger(count) || count <= 0 || value === null || value === 0) return null;
    return { level, count, value };
  }

  function refreshDemoHint() {
    if (!demoEnabled?.checked) return;
    const variable = state.variables.find((item) => item.id === state.activeId);
    const anchor = resolveDemoAnchor(variable);
    if (!anchor) {
      setDemoHint("请在同一列填写网格数量和当前变量的非零结果值；也可在“锚点网格”中手动指定。", "");
      return;
    }
    const levelName = { coarse: "粗网格", medium: "中网格", fine: "细网格" }[anchor.level];
    setDemoHint(`已识别锚点：${levelName} N=${anchor.count}，φ=${anchor.value}。选择变化模式后即可生成。`, "ok");
  }

  function generateQualifiedDemoData() {
    const activeVariable = state.variables.find((item) => item.id === state.activeId);
    if (!activeVariable) return;
    const anchor = resolveDemoAnchor(activeVariable);
    if (!anchor) {
      setDemoHint("未找到有效锚点：网格数量须为正整数，物理量结果须为非零数值，并且两者位于同一列。", "error");
      setStatus("演示生成失败：请先填写一组对应的网格数量与非零物理量结果。", "error");
      return;
    }
    const counts = demoCountsFromAnchor(anchor.level, anchor.count);
    if (!counts) {
      const minimum = anchor.level === "medium" ? 2 : anchor.level === "fine" ? 3 : 1;
      setDemoHint(`该锚点无法生成三个递增的正整数网格；${anchor.level === "coarse" ? "" : `此位置至少输入 ${minimum}。`}`, "error");
      return;
    }
    const mode = demoTrend?.value || "increasing";
    const generated = [];
    for (const [index, variable] of state.variables.entries()) {
      const ownAnchor = numericValue(String(variable.values?.[anchor.level] ?? ""));
      const fallback = anchor.value * (1 + index * 0.08);
      const value = ownAnchor !== null && ownAnchor !== 0 ? ownAnchor : fallback;
      const candidate = buildQualifiedDemoCandidate(counts, anchor.level, value, mode);
      if (!candidate) {
        setDemoHint(`无法为“${variableLabel(variable, index)}”生成满足现有 GCI 判据的数据，请更换非零锚点值。`, "error");
        return;
      }
      generated.push({ variable, candidate });
    }

    Object.entries(counts).forEach(([level, value]) => { gridInputs[level].value = String(value); });
    generated.forEach(({ variable, candidate }, index) => {
      if (!variable.name.trim()) variable.name = `演示物理量 ${index + 1}`;
      variable.values = candidate.values;
    });
    renderVariables();
    persistDraft();
    const passed = validateAll();
    const label = DEMO_TREND_LABELS[mode] || mode;
    const worstGci = Math.max(...generated.map(({ candidate }) => candidate.result.gciFine21));
    setDemoHint(
      `已生成 ${state.variables.length} 个变量：${label}；最大细网格 GCI=${formatNumber(worstGci, 5)}%，并通过渐近区校核。`,
      passed ? "ok" : "error",
    );
    if (passed) setStatus("演示数据已生成并通过现有 GCI / Richardson 计算。仅供演示，不代表真实 CFD 结果。", "ok");
  }

  function runDemoGeneratorSelfTests() {
    const anchors = { coarse: 420000, medium: 930000, fine: 2050000 };
    const modes = Object.keys(DEMO_TREND_LABELS);
    const tests = [];
    DEMO_LEVELS.forEach((level) => {
      const counts = demoCountsFromAnchor(level, anchors[level]);
      if (!counts || counts[level] !== anchors[level]) throw new Error(`演示自检失败：${level} 网格锚点未保留`);
      modes.forEach((mode) => {
        const candidate = buildQualifiedDemoCandidate(counts, level, 87.65, mode);
        if (!candidate || !demoTrendMatches(candidate.values, mode)) throw new Error(`演示自检失败：${level}/${mode}`);
        if (Math.abs(Number(candidate.values[level]) - 87.65) > 1e-10) throw new Error(`演示自检失败：${level}/${mode} 物理量锚点未保留`);
        tests.push(`${level}/${mode}`);
      });
    });
    return { passed: tests.length, tests };
  }

  window.MeshIndependenceDemoDiagnostics = {
    version: "1.8.0",
    runSelfTests: runDemoGeneratorSelfTests,
    generateCandidate: (level, count, value, mode) => {
      const counts = demoCountsFromAnchor(level, count);
      const candidate = counts ? buildQualifiedDemoCandidate(counts, level, value, mode) : null;
      return candidate ? { counts, ...candidate } : null;
    },
  };

  function completedAnalyses() {
    const counts = readGridCounts();
    if (!gridCountsAreValid(counts)) return [];
    return state.variables
      .filter(variableIsComplete)
      .map((variable, index) => ({
        variable,
        index: state.variables.indexOf(variable),
        result: calculateGci(variable, counts),
      }));
  }

  function decisionFromAnalyses(analyses) {
    const valid = analyses.filter((item) => item.result?.valid);
    if (!valid.length || valid.length !== state.variables.length) {
      return { level: null, control: null, reason: "数据尚未形成可用的三网格解。" };
    }

    const control = valid.reduce((worst, item) =>
      !worst || item.result.gciFine21 > worst.result.gciFine21 ? item : worst, null);
    const convergent = valid.every((item) => item.result.convergence !== "divergent");
    const asymptotic = valid.every((item) =>
      item.result.asymptoticRatio >= ASYMPTOTIC_MIN &&
      item.result.asymptoticRatio <= ASYMPTOTIC_MAX);
    const withinThreshold = valid.every((item) => item.result.gciFine21 <= GCI_THRESHOLD);

    if (convergent && asymptotic && withinThreshold) {
      return {
        level: "medium",
        control,
        reason: `全部变量均已趋稳并满足渐近区判据和 GCI≤${GCI_THRESHOLD}%，按文献兼顾成本与精度选用中网格。`,
      };
    }
    if (!convergent) {
      return {
        level: null,
        control,
        reason: "存在振荡或发散变量，当前三套网格不足以确认无关性，建议增加更细网格复核。",
      };
    }
    return {
      level: "fine",
      control,
      reason: withinThreshold
        ? "GCI 已低于阈值，但尚未稳定进入渐近区，保守选用细网格并建议继续加密复核。"
        : `至少一个变量的细网格 GCI 超过 ${GCI_THRESHOLD}%，当前仅可保守使用细网格，仍需继续加密。`,
    };
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
    const countsReady = gridCountsAreValid();
    variableStatusList.innerHTML = state.variables
      .map((variable, index) => {
        const complete = variableIsComplete(variable);
        const result = complete && countsReady ? calculateGci(variable) : null;
        const detail = result?.valid
          ? `GCI ${formatNumber(result.gciFine21, 4)}%`
          : complete ? "待计算" : "待补充";
        return `<span class="${result?.valid ? "ready" : ""}">${escapeAttr(variableLabel(variable, index))}<small>${detail}</small></span>`;
      })
      .join("");
  }

  function renderResultsTable(analyses = completedAnalyses()) {
    if (!resultsTableHead || !resultsTableBody) return;
    if (!analyses.length) {
      resultsTableHead.innerHTML = "<tr><th>参数名称与符号</th><th>等待变量数据</th></tr>";
      resultsTableBody.innerHTML = "<tr><th>状态</th><td>尚未计算</td></tr>";
      renderFormulaProcess([]);
      return;
    }

    resultsTableHead.innerHTML = `<tr><th>参数名称与符号</th>${analyses
      .map(({ variable, index }) => `<th>${escapeAttr(variableLabel(variable, index))}${variable.unit?.trim() ? ` / ${escapeAttr(variable.unit.trim())}` : ""}</th>`)
      .join("")}</tr>`;

    const rows = [
      ["细网格计算结果", "φ₁", (r) => formatNumber(r.phi1, 7), "solution"],
      ["中网格计算结果", "φ₂", (r) => formatNumber(r.phi2, 7), "solution"],
      ["粗网格计算结果", "φ₃", (r) => formatNumber(r.phi3, 7), "solution"],
      ["细—中网格精细化比", "r₂₁", (r) => formatNumber(r.r21, 6), "mesh"],
      ["中—粗网格精细化比", "r₃₂", (r) => formatNumber(r.r32, 6), "mesh"],
      ["细—中网格离散差", "ε₂₁ = φ₂ − φ₁", (r) => formatNumber(r.epsilon21, 7), "difference"],
      ["中—粗网格离散差", "ε₃₂ = φ₃ − φ₂", (r) => formatNumber(r.epsilon32, 7), "difference"],
      ["相邻网格收敛比", "R = ε₂₁ / ε₃₂", (r) => {
        const ratio = Math.abs(r.epsilon32) > 1e-14 ? r.epsilon21 / r.epsilon32 : 0;
        return formatNumber(ratio, 6);
      }, "difference"],
      ["表观收敛阶次", "p", (r) => Number.isFinite(r.p) ? formatNumber(r.p, 5) : "∞", "order"],
      ["细—中 Richardson 外推值", "φ²¹ext", (r) => formatNumber(r.phiExt, 7), "richardson"],
      ["中—粗 Richardson 外推值", "φ³²ext", (r) => formatNumber(r.phiExt32, 7), "richardson32"],
      ["细—中近似相对误差", "e²¹a（%）", (r) => formatNumber(r.ea21, 5), "error21"],
      ["中—粗近似相对误差", "e³²a（%）", (r) => formatNumber(r.ea32, 5), "error32"],
      ["细—中外推相对误差", "e²¹ext（%）", (r) => formatNumber(r.eExt21, 5), "error21"],
      ["细网格收敛指数", "GCI²¹fine（%）", (r) => formatNumber(r.gciFine21, 5), "gci21"],
      ["粗网格收敛指数", "GCI³²coarse（%）", (r) => formatNumber(r.gciCoarse32, 5), "gci32"],
      ["渐近区校核比值", "AR = GCI³² / (r₂₁ᵖ · GCI²¹)", (r) => formatNumber(r.asymptoticRatio, 5), "criterion"],
    ];

    resultsTableBody.innerHTML = rows.map(([name, symbol, formatter, group]) =>
      `<tr data-parameter-group="${group}"><th><span class="mi-param-name">${name}</span><span class="mi-param-symbol">${symbol}</span></th>${analyses.map(({ result }) =>
        `<td>${result?.valid ? formatter(result) : "—"}</td>`).join("")}</tr>`).join("");
    renderFormulaProcess(analyses);
  }

  function formulaValue(value, digits = 7) {
    return Number.isFinite(value) ? formatNumber(value, digits) : "—";
  }

  function renderFormulaProcess(analyses = completedAnalyses()) {
    if (!formulaList) return;
    const valid = analyses.filter((item) => item.result?.valid);
    if (!valid.length) {
      formulaList.innerHTML = '<p class="mi-formula-empty">完成三套网格与变量数据后，这里将显示公式及逐项代入结果。</p>';
      return;
    }

    const counts = readGridCounts();
    formulaList.innerHTML = valid.map(({ variable, index, result }) => {
      const pText = Number.isFinite(result.p) ? formulaValue(result.p, 6) : "∞";
      const r21p = Number.isFinite(result.p) ? Math.pow(result.r21, result.p) : null;
      const r32p = Number.isFinite(result.p) ? Math.pow(result.r32, result.p) : null;
      const convergenceText = result.convergence === "monotonic"
        ? "单调收敛"
        : result.convergence === "oscillatory" ? "振荡收敛" : result.convergence === "constant" ? "结果一致" : "发散";
      const asymptoticPass = result.asymptoticRatio >= ASYMPTOTIC_MIN && result.asymptoticRatio <= ASYMPTOTIC_MAX;
      return `
        <article class="mi-formula-card">
          <header><strong>${escapeAttr(variableLabel(variable, index))}</strong><span>${convergenceText} · GCI ${formulaValue(result.gciFine21, 5)}%</span></header>
          <div class="mi-formula-grid">
            <div><b>网格比</b><code>r₂₁=(N₁/N₂)^(1/3)=(${formatCells(counts.fine)}/${formatCells(counts.medium)})^(1/3)=${formulaValue(result.r21, 6)}</code><code>r₃₂=(N₂/N₃)^(1/3)=${formulaValue(result.r32, 6)}</code></div>
            <div><b>表观阶次</b><code>p 由 Celik 非等比网格迭代式求解 = ${pText}</code><code>ε₂₁=${formulaValue(result.epsilon21, 7)}，ε₃₂=${formulaValue(result.epsilon32, 7)}</code></div>
            <div><b>Richardson 外推</b><code>φ²¹ext=(r₂₁^p·φ₁−φ₂)/(r₂₁^p−1)=${formulaValue(result.phiExt)}</code><code>φ³²ext=(r₃₂^p·φ₂−φ₃)/(r₃₂^p−1)=${formulaValue(result.phiExt32)}</code></div>
            <div><b>相对误差</b><code>eₐ²¹=|(φ₁−φ₂)/φ₁|×100%=${formulaValue(result.ea21, 6)}%</code><code>eext²¹=|(φext−φ₁)/φext|×100%=${formulaValue(result.eExt21, 6)}%</code></div>
            <div><b>网格收敛指数</b><code>GCI²¹fine=1.25×${formulaValue(result.ea21, 6)}/|${formulaValue(r21p, 6)}−1|=${formulaValue(result.gciFine21, 6)}%</code><code>GCI³²coarse=1.25×${formulaValue(result.ea32, 6)}/|${formulaValue(r32p, 6)}−1|=${formulaValue(result.gciCoarse32, 6)}%</code></div>
            <div><b>渐近区判据</b><code>GCI³²/(r₂₁^p·GCI²¹)=${formulaValue(result.gciCoarse32, 6)}/(${formulaValue(r21p, 6)}×${formulaValue(result.gciFine21, 6)})</code><code>=${formulaValue(result.asymptoticRatio, 6)} ${asymptoticPass ? "（通过 0.95–1.05）" : "（未进入 0.95–1.05）"}</code></div>
          </div>
        </article>`;
    }).join("");
  }

  function setRecommendState(label, tone = "neutral") {
    if (!recommendState) return;
    recommendState.textContent = label;
    recommendState.className = `mi-recommend-state ${tone}`;
  }

  function updateDecisionPreview() {
    const countsReady = gridCountsAreValid();
    const completeCount = state.variables.filter(variableIsComplete).length;
    const allReady = countsReady && completeCount === state.variables.length && state.variables.length > 0;
    const analyses = completedAnalyses();

    if (decisionReady) decisionReady.textContent = `${completeCount} / ${state.variables.length}`;
    if (decisionGrid) decisionGrid.textContent = "—";
    if (decisionVariable) decisionVariable.textContent = "—";
    if (decisionGci) decisionGci.textContent = "—";
    if (decisionAsymptotic) decisionAsymptotic.textContent = "—";
    if (decisionSaving) decisionSaving.textContent = "—";
    setRecommendState("等待计算");
    renderResultsTable(analyses);

    if (!countsReady) {
      if (recommendTitle) recommendTitle.textContent = "等待网格规模";
      setRecommendState("等待网格");
      if (recommendText) recommendText.textContent = "请先填写有效的粗、中、细网格单元数，再补充各监测变量的三组计算结果。";
      if (decisionNotes) {
        decisionNotes.innerHTML = `
          <span>○ 网格规模待检查</span>
          <span>${completeCount ? "✓" : "○"} 完整变量 ${completeCount} 个</span>
          <span>○ GCI 计算待执行</span>`;
      }
      return;
    }

    if (!allReady) {
      if (recommendTitle) recommendTitle.textContent = "等待变量数据";
      setRecommendState("数据待补");
      if (recommendText) recommendText.textContent = `网格规模有效，当前已有 ${completeCount} / ${state.variables.length} 个变量数据完整。`;
      if (decisionNotes) {
        decisionNotes.innerHTML = `
          <span>✓ 网格规模有效</span>
          <span>${completeCount === state.variables.length ? "✓" : "○"} 完整变量 ${completeCount} / ${state.variables.length}</span>
          <span>○ 控制变量待确定</span>`;
      }
      return;
    }

    const decision = decisionFromAnalyses(analyses);
    const counts = readGridCounts();
    const controlLabel = decision.control
      ? variableLabel(decision.control.variable, decision.control.index)
      : "—";
    const maxGci = decision.control?.result?.gciFine21;
    const valid = analyses.filter((item) => item.result?.valid);
    const asymptoticCount = valid.filter((item) =>
      item.result.asymptoticRatio >= ASYMPTOTIC_MIN &&
      item.result.asymptoticRatio <= ASYMPTOTIC_MAX).length;
    const passedCount = valid.filter((item) =>
      item.result.convergence !== "divergent" &&
      item.result.asymptoticRatio >= ASYMPTOTIC_MIN &&
      item.result.asymptoticRatio <= ASYMPTOTIC_MAX &&
      item.result.gciFine21 <= GCI_THRESHOLD).length;
    const recommendedCells = decision.level === "medium"
      ? counts.medium
      : decision.level === "fine" ? counts.fine : null;
    const savedCells = Number.isFinite(recommendedCells) ? Math.max(0, counts.fine - recommendedCells) : null;
    const savedPercent = Number.isFinite(savedCells) && counts.fine > 0 ? savedCells / counts.fine * 100 : null;
    const gridLabel = decision.level === "medium"
      ? `中网格 · ${formatCells(counts.medium)}`
      : decision.level === "fine" ? `细网格 · ${formatCells(counts.fine)}` : "暂不判定";

    if (decisionGrid) decisionGrid.textContent = gridLabel;
    if (decisionVariable) decisionVariable.textContent = controlLabel;
    if (decisionGci) decisionGci.textContent = Number.isFinite(maxGci) ? `${formatNumber(maxGci, 5)} %` : "—";
    if (decisionAsymptotic) decisionAsymptotic.textContent = `${asymptoticCount} / ${valid.length} 通过`;
    if (decisionReady) decisionReady.textContent = `${passedCount} / ${valid.length} 通过`;
    if (decisionSaving) {
      decisionSaving.textContent = Number.isFinite(savedCells)
        ? `${formatCells(savedCells)} 单元 · 约 ${formatNumber(savedPercent, 4)}%`
        : "—";
    }
    if (recommendTitle) {
      recommendTitle.textContent = decision.level === "medium"
        ? "推荐采用中网格"
        : decision.level === "fine" ? "暂用细网格并继续复核" : "尚不能确认网格无关性";
    }
    setRecommendState(
      decision.level === "medium" ? "验证通过" : decision.level === "fine" ? "建议复核" : "未通过",
      decision.level === "medium" ? "passed" : "warn",
    );
    if (recommendText) recommendText.textContent = decision.reason;
    if (decisionNotes) {
      const convergentCount = valid.filter((item) => item.result.convergence !== "divergent").length;
      decisionNotes.innerHTML = valid.map(({ variable, index, result }) => {
        const passed = result.convergence !== "divergent" &&
          result.asymptoticRatio >= ASYMPTOTIC_MIN && result.asymptoticRatio <= ASYMPTOTIC_MAX &&
          result.gciFine21 <= GCI_THRESHOLD;
        return `<span class="${passed ? "passed" : "review"}">${passed ? "✓" : "○"} ${escapeAttr(variableLabel(variable, index))}<small>GCI ${formatNumber(result.gciFine21, 4)}% · 渐近比 ${formatNumber(result.asymptoticRatio, 4)}</small></span>`;
      }).join("") || `<span>○ 趋稳 ${convergentCount} / ${valid.length}</span>`;
    }
  }

  function renderFormalMetrics(result) {
    if (!result?.valid) {
      [metricP, metricExt, metricGci, metricRatio].forEach((node) => {
        if (node) node.textContent = "—";
      });
      return;
    }
    if (metricP) metricP.textContent = Number.isFinite(result.p) ? formatNumber(result.p, 5) : "∞";
    if (metricExt) metricExt.textContent = formatNumber(result.phiExt, 7);
    if (metricGci) metricGci.textContent = `${formatNumber(result.gciFine21, 5)} %`;
    if (metricRatio) metricRatio.textContent = formatNumber(result.asymptoticRatio, 5);
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
    trendChart.setAttribute("viewBox", "0 0 960 420");
    const W = 960;
    const H = 420;
    const left = 94;
    const right = 34;
    const top = 38;
    const bottom = 72;
    const plotW = W - left - right;
    const plotH = H - top - bottom;

    trendChart.append(
      svgElement("rect", { x: 0, y: 0, width: W, height: H, fill: "#ffffff" }),
      svgElement("line", { x1: left, y1: top, x2: left, y2: top + plotH, class: "mi-paper-axis" }),
      svgElement("line", { x1: left, y1: top + plotH, x2: left + plotW, y2: top + plotH, class: "mi-paper-axis" }),
      svgElement("text", { x: left + plotW / 2, y: H - 24, "text-anchor": "middle", class: "mi-paper-label" }, "网格单元数 N"),
      svgElement("text", { x: 30, y: top + plotH / 2, "text-anchor": "middle", transform: `rotate(-90 30 ${top + plotH / 2})`, class: "mi-paper-label" }, yTitle),
      svgElement("text", { x: left + plotW / 2, y: top + plotH / 2, "text-anchor": "middle", class: "mi-paper-empty" }, message),
    );
  }

  function chartAxisDefinition(counts, extensionRatio = 0.28) {
    if (chartViewMode === "paper") {
      const relative = {
        ext: 0,
        fine: 1,
        medium: Math.pow(counts.fine / counts.medium, 1 / GCI_DIMENSION),
        coarse: Math.pow(counts.fine / counts.coarse, 1 / GCI_DIMENSION),
      };
      const fineMedium = (relative.fine + relative.medium) / 2;
      const mediumCoarse = (relative.medium + relative.coarse) / 2;
      const xMax = relative.coarse * 1.08;
      return {
        relative,
        xMin: 0,
        xMax,
        axisTitle: "相对网格尺度 h / h₁（h∝N⁻¹ᐟ³，连续极限 h→0）",
        zones: [
          { level: "fine", from: relative.fine / 2, to: fineMedium, label: "细网格", fill: "#fbf0f0" },
          { level: "medium", from: fineMedium, to: mediumCoarse, label: "中网格", fill: "#edf6f3" },
          { level: "coarse", from: mediumCoarse, to: xMax, label: "粗网格", fill: "#f1f3f4" },
        ],
      };
    }

    const relative = {
      coarse: 1,
      medium: counts.medium / counts.coarse,
      fine: counts.fine / counts.coarse,
    };
    relative.ext = relative.fine + Math.max(
      (relative.fine - relative.medium) * extensionRatio,
      relative.fine * 0.07,
    );
    const xMin = Math.max(0, relative.coarse - (relative.medium - relative.coarse) * 0.22);
    const xMax = relative.ext + (relative.ext - relative.fine) * 0.3;
    const midCoarseMedium = (relative.coarse + relative.medium) / 2;
    const midMediumFine = (relative.medium + relative.fine) / 2;
    return {
      relative,
      xMin,
      xMax,
      axisTitle: "相对网格数量 N / N粗",
      zones: [
        { level: "coarse", from: xMin, to: midCoarseMedium, label: "粗网格", fill: "#f1f3f4" },
        { level: "medium", from: midCoarseMedium, to: midMediumFine, label: "中网格", fill: "#edf6f3" },
        { level: "fine", from: midMediumFine, to: xMax, label: "细网格", fill: "#fbf0f0" },
      ],
    };
  }

  function drawMultiVariableChart(analyses, activeId, counts) {
    if (!trendChart) return;
    const valid = analyses.filter((item) => item.result?.valid);
    if (valid.length < 2) return;

    const activeAnalysis = valid.find((item) => item.variable.id === activeId);
    const visible = valid.slice(0, 3);
    if (activeAnalysis && !visible.some((item) => item.variable.id === activeId)) {
      visible[visible.length - 1] = activeAnalysis;
    }

    clearChart();
    const W = 1040;
    const H = 460;
    const left = 132;
    const right = 38;
    const top = 132;
    const bottom = 88;
    const plotW = W - left - right;
    const plotH = H - top - bottom;
    const plotRight = left + plotW;
    const colors = ["#17212b", "#d43b32", "#209a55"];
    const axisDefinition = chartAxisDefinition(counts, 0.28);
    const { relative, xMin, xMax } = axisDefinition;
    const x = (value) => left + ((value - xMin) / Math.max(xMax - xMin, 1e-12)) * plotW;
    const decision = decisionFromAnalyses(analyses);

    const series = visible.map((item, index) => {
      const values = [item.result.phi3, item.result.phi2, item.result.phi1, item.result.phiExt];
      let min = Math.min(...values);
      let max = Math.max(...values);
      const range = max - min;
      const pad = range === 0 ? Math.max(Math.abs(max) * 0.05, 1) : range * 0.2;
      min -= pad;
      max += pad;
      return {
        ...item,
        color: colors[index],
        min,
        max,
        active: item.variable.id === activeId,
        y: (value) => top + (1 - (value - min) / Math.max(max - min, 1e-12)) * plotH,
      };
    });

    const activeSeries = series.find((item) => item.active) || series[0];

    trendChart.setAttribute("viewBox", `0 0 ${W} ${H}`);
    trendChart.appendChild(svgElement("style", {}, `
      text{font-family:"Times New Roman","Microsoft YaHei UI","SimSun",serif;fill:#17212b}
      .axis{stroke-width:1.45}.grid{stroke:#cfd7dc;stroke-width:.9;stroke-dasharray:3 5}
      .tick{font-size:17px;font-variant-numeric:tabular-nums}.small{font-size:14.5px;fill:#59656d}
      .label{font-size:18px;font-weight:600}.title{font-size:23px;font-weight:700}.subtitle{font-size:14.5px;fill:#59656d}
      .zone{font-size:16.5px;font-weight:600}.legend{font-size:17.5px;font-weight:700}
      .legend-meta{font-size:14px;fill:#59656d}.point-value{font-size:15px;font-weight:700}
    `));
    trendChart.appendChild(svgElement("rect", { x: 0, y: 0, width: W, height: H, fill: "#fff" }));

    trendChart.append(
      svgElement("text", { x: 34, y: 30, class: "title" }, `多物理量网格无关性验证 · ${chartViewMode === "paper" ? "论文视图" : "工程视图"}`),
      svgElement("text", { x: 34, y: 52, class: "subtitle" }, `各变量采用独立量程；左侧纵轴显示当前高亮变量：${variableLabel(activeSeries.variable, activeSeries.index)}`),
      svgElement("text", { x: W - 34, y: 30, "text-anchor": "end", class: "subtitle" }, `完整变量 ${visible.length} / ${valid.length}`),
    );

    const legendGap = 10;
    const legendWidth = (plotW - legendGap * Math.max(series.length - 1, 0)) / series.length;
    series.forEach((item, index) => {
      const legendX = left + index * (legendWidth + legendGap);
      const legendName = variableLabel(item.variable, item.index);
      const displayName = legendName.length > 18 ? `${legendName.slice(0, 17)}…` : legendName;
      const legendUnit = item.variable.unit?.trim() ? ` / ${item.variable.unit.trim()}` : "";
      trendChart.append(
        svgElement("rect", {
          x: legendX, y: 66, width: legendWidth, height: 52, rx: 7,
          fill: item.active ? "#eef8f8" : "#f7f9fa",
          stroke: item.color, "stroke-width": item.active ? 2 : 1,
          opacity: item.active ? 1 : 0.82,
          class: `legend-card${item.active ? " active" : ""}`,
        }),
        svgElement("line", {
          x1: legendX + 12, y1: 84, x2: legendX + 42, y2: 84,
          stroke: item.color, "stroke-width": item.active ? 3.4 : 2.2,
          "stroke-dasharray": index === 0 ? "8 5" : index === 1 ? "4 4" : "10 4 2 4",
          class: `series-stroke-${index}`,
        }),
        svgElement("text", {
          x: legendX + 50, y: 89, class: `legend series-text-${index}`,
          fill: item.color,
        }, `${displayName}${legendUnit}${item.active ? "（当前）" : ""}`),
        svgElement("text", {
          x: legendX + 12, y: 108, class: "legend-meta",
        }, `GCI ${formatNumber(item.result.gciFine21, 4)}% · 细网格 ${formatNumber(item.result.phi1, 6)}`),
      );
    });

    axisDefinition.zones.forEach((zone) => {
      const selected = decision.level === zone.level;
      trendChart.appendChild(svgElement("rect", {
        x: x(zone.from), y: top, width: Math.max(0, x(zone.to) - x(zone.from)), height: plotH,
        fill: zone.fill, opacity: selected ? 0.96 : 0.68,
        stroke: selected ? "#0a9ca6" : "none", "stroke-width": selected ? 1.3 : 0,
        "stroke-dasharray": selected ? "7 5" : "none",
      }));
    });

    for (let i = 0; i <= 4; i += 1) {
      const yy = top + (plotH * i) / 4;
      trendChart.appendChild(svgElement("line", { x1: left, y1: yy, x2: plotRight, y2: yy, class: "grid" }));
    }

    trendChart.appendChild(svgElement("line", {
      x1: left, y1: top + plotH, x2: plotRight, y2: top + plotH,
      class: "axis", stroke: "#17212b",
    }));

    trendChart.appendChild(svgElement("line", {
      x1: left, y1: top, x2: left, y2: top + plotH,
      class: `axis series-stroke-${series.indexOf(activeSeries)}`,
      stroke: activeSeries.color,
    }));
    for (let i = 0; i <= 4; i += 1) {
      const value = activeSeries.max - ((activeSeries.max - activeSeries.min) * i) / 4;
      const yy = top + (plotH * i) / 4;
      trendChart.append(
        svgElement("line", {
          x1: left - 7, y1: yy, x2: left, y2: yy,
          stroke: activeSeries.color, "stroke-width": 1.2,
          class: `series-stroke-${series.indexOf(activeSeries)}`,
        }),
        svgElement("text", {
          x: left - 12, y: yy + 5.5, "text-anchor": "end",
          class: `tick series-text-${series.indexOf(activeSeries)}`,
          fill: activeSeries.color,
        }, formatNumber(value, 5)),
      );
    }
    const activeAxisTitle = activeSeries.variable.unit?.trim()
      ? `${variableLabel(activeSeries.variable, activeSeries.index)} / ${activeSeries.variable.unit.trim()}`
      : variableLabel(activeSeries.variable, activeSeries.index);
    trendChart.appendChild(svgElement("text", {
      x: 27, y: top + plotH / 2, "text-anchor": "middle",
      transform: `rotate(-90 27 ${top + plotH / 2})`,
      class: `label series-text-${series.indexOf(activeSeries)}`,
      fill: activeSeries.color,
    }, activeAxisTitle));

    series.forEach((item, index) => {
      const legendName = variableLabel(item.variable, item.index);
      const actual = [
        { level: "coarse", xr: relative.coarse, value: item.result.phi3 },
        { level: "medium", xr: relative.medium, value: item.result.phi2 },
        { level: "fine", xr: relative.fine, value: item.result.phi1 },
      ];
      trendChart.appendChild(svgElement("path", {
        d: actual.map((point, pointIndex) => `${pointIndex ? "L" : "M"}${x(point.xr).toFixed(2)},${item.y(point.value).toFixed(2)}`).join(" "),
        fill: "none", stroke: item.color, "stroke-width": item.active ? 3.6 : 2.25,
        "stroke-dasharray": index === 0 ? "8 5" : index === 1 ? "4 4" : "10 4 2 4",
        opacity: item.active ? 1 : 0.82,
        class: `series-stroke-${index}`,
      }));

      actual.forEach((point, pointIndex) => {
        const px = x(point.xr);
        const py = item.y(point.value);
        const group = svgElement("g");
        group.appendChild(svgElement("title", {}, `${legendName} · ${point.level}：${formatNumber(point.value, 7)}`));
        if (index === 0) {
          group.appendChild(svgElement("circle", { cx: px, cy: py, r: item.active ? 7 : 5.8, fill: item.color, stroke: "#fff", "stroke-width": 1.4, class: `series-fill-${index}` }));
        } else if (index === 1) {
          group.appendChild(svgElement("rect", { x: px - 6.2, y: py - 6.2, width: 12.4, height: 12.4, fill: item.color, stroke: "#fff", "stroke-width": 1.3, class: `series-fill-${index}` }));
        } else {
          group.appendChild(svgElement("path", { d: `M${px},${py - 7.5} L${px - 7.5},${py + 6.5} L${px + 7.5},${py + 6.5} Z`, fill: item.color, stroke: "#fff", "stroke-width": 1.3, class: `series-fill-${index}` }));
        }
        trendChart.appendChild(group);

        if (item.active) {
          const nearTop = py < top + 28;
          const labelY = nearTop ? py + 24 : py - 12;
          const labelX = pointIndex === 2 ? px - 10 : pointIndex === 0 ? px + 10 : px;
          const anchor = pointIndex === 2 ? "end" : pointIndex === 0 ? "start" : "middle";
          trendChart.appendChild(svgElement("text", {
            x: labelX, y: labelY, "text-anchor": anchor,
            class: `point-value series-text-${index}`,
            fill: item.color,
          }, formatNumber(point.value, 6)));
        }
      });

      const fineX = x(relative.fine);
      const fineY = item.y(item.result.phi1);
      const extX = x(relative.ext);
      const extY = item.y(item.result.phiExt);
      trendChart.append(
        svgElement("line", { x1: fineX, y1: fineY, x2: extX, y2: extY, stroke: item.color, "stroke-width": 1.3, "stroke-dasharray": "5 4", opacity: 0.78, class: `series-stroke-${index}` }),
        svgElement("line", { x1: extX - 5.5, y1: extY - 5.5, x2: extX + 5.5, y2: extY + 5.5, stroke: item.color, "stroke-width": item.active ? 2.8 : 1.9, class: `series-stroke-${index}` }),
        svgElement("line", { x1: extX - 5.5, y1: extY + 5.5, x2: extX + 5.5, y2: extY - 5.5, stroke: item.color, "stroke-width": item.active ? 2.8 : 1.9, class: `series-stroke-${index}` }),
      );
      if (item.active) {
        const extLabelY = extY < top + 28 ? extY + 24 : extY - 12;
        trendChart.appendChild(svgElement("text", {
          x: extX + 10, y: extLabelY, "text-anchor": "start",
          class: `point-value series-text-${index}`,
          fill: item.color,
        }, formatNumber(item.result.phiExt, 6)));
      }
    });

    const xLabels = [
      { xr: relative.coarse, title: `粗网格${decision.level === "coarse" ? " · 推荐" : ""}`, detail: formatCells(counts.coarse) },
      { xr: relative.medium, title: `中网格${decision.level === "medium" ? " · 推荐" : ""}`, detail: formatCells(counts.medium) },
      { xr: relative.fine, title: `细网格${decision.level === "fine" ? " · 推荐" : ""}`, detail: formatCells(counts.fine) },
      { xr: relative.ext, title: "EXT", detail: chartViewMode === "paper" ? "h→0" : "Richardson" },
    ];
    xLabels.forEach((item) => {
      const px = x(item.xr);
      trendChart.append(
        svgElement("line", { x1: px, y1: top + plotH, x2: px, y2: top + plotH + 6, stroke: "#17212b", "stroke-width": 1 }),
        svgElement("text", { x: px, y: top + plotH + 25, "text-anchor": "middle", class: "tick" }, item.title),
        svgElement("text", { x: px, y: top + plotH + 43, "text-anchor": "middle", class: "small" }, item.detail),
      );
    });
    trendChart.appendChild(svgElement("text", {
      x: left + plotW / 2, y: H - 18, "text-anchor": "middle", class: "label",
    }, axisDefinition.axisTitle));

    chartViewport?.setAttribute("data-analysis-ready", "true");
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

    const W = 960;
    const H = 420;
    const left = 94;
    const right = 34;
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
      svgElement("text", { x: 30, y: top + plotH / 2, "text-anchor": "middle", transform: `rotate(-90 30 ${top + plotH / 2})`, class: "mi-paper-label" }, yTitle),
      svgElement("text", { x: left + plotW, y: 24, "text-anchor": "end", class: "mi-paper-note" }, "数据完整后自动叠加 GCI / Richardson 外推点"),
    );
  }

  function drawArticleChart(variable) {
    const counts = readGridCounts();
    const analyses = completedAnalyses();
    const validAnalyses = analyses.filter((item) => item.result?.valid);
    if (gridCountsAreValid(counts) && validAnalyses.length >= 2) {
      drawMultiVariableChart(validAnalyses, variable?.id, counts);
      return;
    }
    const result = calculateGci(variable, counts);
    const name = variable?.name?.trim() || "监测物理量";
    const unit = variable?.unit?.trim();
    const yTitle = unit ? `${name} / ${unit}` : name;

    if (!result?.valid || !trendChart) {
      drawChartBase("输入完整数据后生成 GCI / Richardson 收敛图", yTitle);
      chartViewport?.removeAttribute("data-analysis-ready");
      return;
    }

    clearChart();
    const W = 960;
    const H = 440;
    const left = 104;
    const right = 48;
    const top = 70;
    const bottom = 90;
    const plotW = W - left - right;
    const plotH = H - top - bottom;
    const axisDefinition = chartAxisDefinition(counts, 0.32);
    const { relative, xMin, xMax } = axisDefinition;
    const values = [result.phi3, result.phi2, result.phi1, result.phiExt];
    let yMin = Math.min(...values);
    let yMax = Math.max(...values);
    const yRange = yMax - yMin;
    const yPad = yRange === 0 ? Math.max(Math.abs(yMax) * 0.04, 1) : yRange * 0.18;
    yMin -= yPad;
    yMax += yPad;
    const x = (value) => left + ((value - xMin) / Math.max(xMax - xMin, 1e-12)) * plotW;
    const y = (value) => top + (1 - (value - yMin) / Math.max(yMax - yMin, 1e-12)) * plotH;
    const decision = decisionFromAnalyses(analyses);
    const selected = decision.level;

    trendChart.appendChild(svgElement("style", {}, `
      text{font-family:"Times New Roman","SimSun",serif;fill:#111}
      .axis{stroke:#111;stroke-width:1.15}.grid{stroke:#d7dce1;stroke-width:.8;stroke-dasharray:3 5}
      .curve{fill:none;stroke:#222;stroke-width:1.7;stroke-dasharray:7 5}.extline{stroke:#777;stroke-width:1;stroke-dasharray:5 4}
      .tick{font-size:17px}.small{font-size:14.5px;fill:#555}.label{font-size:18px;font-weight:600}.title{font-size:22px;font-weight:700}
      .value{font-size:16px;font-weight:600}.zone{font-size:16px;font-weight:600}.note{font-size:14px;fill:#555}
    `));
    trendChart.setAttribute("viewBox", `0 0 ${W} ${H}`);
    trendChart.appendChild(svgElement("rect", { x: 0, y: 0, width: W, height: H, fill: "#fff" }));

    axisDefinition.zones.forEach((zone) => {
      trendChart.appendChild(svgElement("rect", {
        x: x(zone.from), y: top, width: Math.max(0, x(zone.to) - x(zone.from)), height: plotH,
        fill: zone.fill, opacity: selected === zone.level ? 0.95 : 0.58,
        stroke: selected === zone.level ? "#0a9ca6" : "none",
        "stroke-width": selected === zone.level ? 1.4 : 0,
        "stroke-dasharray": selected === zone.level ? "7 5" : "none",
      }));
      trendChart.appendChild(svgElement("text", {
        x: (x(zone.from) + x(zone.to)) / 2, y: top + 22, "text-anchor": "middle", class: "zone",
        fill: selected === zone.level ? "#087983" : "#444",
      }, `${zone.label}${selected === zone.level ? " · 最终选择" : ""}`));
    });

    for (let i = 0; i <= 4; i += 1) {
      const value = yMin + ((yMax - yMin) * i) / 4;
      const yy = y(value);
      trendChart.append(
        svgElement("line", { x1: left, y1: yy, x2: left + plotW, y2: yy, class: "grid" }),
        svgElement("text", { x: left - 12, y: yy + 4, "text-anchor": "end", class: "tick" }, formatNumber(value, 6)),
      );
    }

    trendChart.append(
      svgElement("line", { x1: left, y1: top, x2: left, y2: top + plotH, class: "axis" }),
      svgElement("line", { x1: left, y1: top + plotH, x2: left + plotW, y2: top + plotH, class: "axis" }),
      svgElement("line", { x1: x(relative.fine), y1: y(result.phi1), x2: x(relative.ext), y2: y(result.phiExt), class: "extline" }),
      svgElement("text", { x: left, y: 30, class: "title" }, `${name}网格无关性验证 · ${chartViewMode === "paper" ? "论文视图" : "工程视图"}`),
      svgElement("text", { x: left + plotW, y: 30, "text-anchor": "end", class: "note" }, `p=${formatNumber(result.p, 4)}  GCI²¹fine=${formatNumber(result.gciFine21, 4)}%`),
    );

    const actual = [
      { level: "coarse", label: "粗", cells: counts.coarse, xr: relative.coarse, value: result.phi3 },
      { level: "medium", label: "中", cells: counts.medium, xr: relative.medium, value: result.phi2 },
      { level: "fine", label: "细", cells: counts.fine, xr: relative.fine, value: result.phi1 },
    ];
    trendChart.appendChild(svgElement("path", {
      d: actual.map((point, index) => `${index ? "L" : "M"}${x(point.xr).toFixed(2)},${y(point.value).toFixed(2)}`).join(" "),
      class: "curve",
    }));

    actual.forEach((point, index) => {
      const px = x(point.xr);
      const py = y(point.value);
      const isSelected = point.level === selected;
      const valueY = py < top + 54 ? py + 34 : py - 14;
      const valueX = point.level === "fine" ? px - 10 : px;
      const valueAnchor = point.level === "fine" ? "end" : "middle";
      const markerFill = isSelected ? "#0a9ca6" : index === 0 ? "#111" : index === 1 ? "#d8271f" : "#24a33a";
      const marker = index === 0
        ? svgElement("circle", { cx: px, cy: py, r: 6.5, fill: markerFill, stroke: isSelected ? "#075e67" : "#fff", "stroke-width": isSelected ? 2 : 1 })
        : index === 1
          ? svgElement("rect", { x: px - 6, y: py - 6, width: 12, height: 12, fill: markerFill, stroke: isSelected ? "#075e67" : "#fff", "stroke-width": isSelected ? 2 : 1 })
          : svgElement("path", { d: `M${px},${py - 7} L${px - 7},${py + 6} L${px + 7},${py + 6} Z`, fill: markerFill, stroke: isSelected ? "#075e67" : "#fff", "stroke-width": isSelected ? 2 : 1 });
      trendChart.append(
        svgElement("line", { x1: px, y1: top + plotH, x2: px, y2: top + plotH + 6, class: "axis" }),
        ...(isSelected ? [svgElement("circle", { cx: px, cy: py, r: 11, fill: "none", stroke: "#0a9ca6", "stroke-width": 1.4, opacity: 0.72 })] : []),
        marker,
        svgElement("text", { x: valueX, y: valueY, "text-anchor": valueAnchor, class: "value" }, formatNumber(point.value, 7)),
        svgElement("text", { x: px, y: top + plotH + 23, "text-anchor": "middle", class: "tick" }, `${point.label}：${formatNumber(point.xr, 4)}`),
        svgElement("text", { x: px, y: top + plotH + 40, "text-anchor": "middle", class: "small" }, formatCells(point.cells)),
      );
    });

    const extX = x(relative.ext);
    const extY = y(result.phiExt);
    const extValueY = extY < top + 54 ? extY + 34 : extY - 14;
    trendChart.append(
      svgElement("line", { x1: extX - 6, y1: extY - 6, x2: extX + 6, y2: extY + 6, stroke: "#d8271f", "stroke-width": 2 }),
      svgElement("line", { x1: extX - 6, y1: extY + 6, x2: extX + 6, y2: extY - 6, stroke: "#d8271f", "stroke-width": 2 }),
      svgElement("text", { x: extX + 10, y: extValueY, "text-anchor": "start", class: "value", fill: "#c91f18" }, formatNumber(result.phiExt, 7)),
      svgElement("text", { x: extX, y: top + plotH + 23, "text-anchor": "middle", class: "tick" }, "EXT"),
      svgElement("text", { x: extX, y: top + plotH + 40, "text-anchor": "middle", class: "small" }, chartViewMode === "paper" ? "h→0" : "Richardson"),
      svgElement("text", { x: left + plotW / 2, y: H - 17, "text-anchor": "middle", class: "label" }, axisDefinition.axisTitle),
      svgElement("text", { x: 30, y: top + plotH / 2, "text-anchor": "middle", transform: `rotate(-90 30 ${top + plotH / 2})`, class: "label" }, yTitle),
    );

    chartViewport?.setAttribute("data-analysis-ready", "true");
  }

  function exportChartPng() {
    if (!trendChart || !chartViewport?.hasAttribute("data-analysis-ready")) {
      setStatus("请先完成变量的 GCI / Richardson 计算，再导出图片。", "warn");
      return;
    }
    const clone = trendChart.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", "1920");
    clone.setAttribute("height", "840");
    const source = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 840;
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((png) => {
        if (!png) return;
        const link = document.createElement("a");
        const completeCount = completedAnalyses().filter((item) => item.result?.valid).length;
        const name = (completeCount > 1 ? "多变量对比" : variableLabel(activeVariable())).replace(/[\\/:*?"<>|]+/g, "_");
        link.href = URL.createObjectURL(png);
        link.download = `网格无关性_${name}.png`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setStatus("图片导出失败，请刷新页面后重试。", "error");
    };
    image.src = url;
  }

  function updateActiveView() {
    const variable = activeVariable();
    const label = variableLabel(variable);
    if (activeCaption) activeCaption.textContent = `当前查看：${label}`;
    updatePrecheck(variable);
    const result = calculateGci(variable);
    const validAnalyses = completedAnalyses().filter((item) => item.result?.valid);
    renderFormalMetrics(result);
    drawArticleChart(variable);
    if (chartModeBadge) {
      const dataMode = validAnalyses.length > 1
        ? `${Math.min(validAnalyses.length, 3)} 变量同图`
        : validAnalyses.length === 1 ? "单变量视图" : "等待数据";
      chartModeBadge.textContent = `${chartViewMode === "paper" ? "论文" : "工程"} · ${dataMode}`;
    }
    if (chartFootVariable) {
      chartFootVariable.textContent = validAnalyses.length > 1
        ? `多变量同图 · 当前高亮：${label}`
        : `当前变量：${label}`;
    }
    if (chartFootStatus) {
      chartFootStatus.textContent = validAnalyses.length > 1
        ? `${validAnalyses.length > 3 ? `展示含当前变量的 3 / ${validAnalyses.length} 个变量；` : ""}${chartViewMode === "paper" ? "横坐标采用相对网格尺度 h/h₁，EXT 位于 h→0" : "横坐标按相对单元数量展示，便于工程比较"}`
        : result?.valid
          ? `细网格 GCI ${formatNumber(result.gciFine21, 5)}%，渐近区比值 ${formatNumber(result.asymptoticRatio, 5)}`
        : "等待完整网格规模与当前变量三组结果";
    }
  }

  function setChartView(mode) {
    chartViewMode = mode === "paper" ? "paper" : "engineering";
    chartViewButtons.forEach((button) => {
      const active = button.dataset.chartView === chartViewMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    updateActiveView();
  }

  function setFormulaMode(expanded) {
    if (!resultsTablePanel || !toggleFormulasButton || !formulaPanel) return;
    resultsTablePanel.classList.toggle("is-formula-mode", expanded);
    formulaPanel.hidden = !expanded;
    toggleFormulasButton.setAttribute("aria-expanded", String(expanded));
    toggleFormulasButton.textContent = expanded ? "返回结果表" : "查看公式过程";
  }

  function setResultsTableExpanded(expanded) {
    if (!resultsTablePanel || !expandTableButton) return;
    if (expanded) setChartExpanded(false);
    resultsTablePanel.classList.toggle("is-expanded", expanded);
    expandTableButton.setAttribute("aria-expanded", String(expanded));
    expandTableButton.textContent = expanded ? "收起表格" : "展开完整表格";
    document.body.classList.toggle("mi-focus-view-open", expanded);
  }

  function setChartExpanded(expanded) {
    if (!chartPanel || !expandChartButton) return;
    if (expanded && resultsTablePanel?.classList.contains("is-expanded")) {
      resultsTablePanel.classList.remove("is-expanded");
      expandTableButton?.setAttribute("aria-expanded", "false");
      if (expandTableButton) expandTableButton.textContent = "展开完整表格";
    }
    chartPanel.classList.toggle("is-expanded", expanded);
    expandChartButton.setAttribute("aria-expanded", String(expanded));
    expandChartButton.textContent = expanded ? "收起图表" : "放大图表";
    document.body.classList.toggle("mi-focus-view-open", expanded);
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
      `检查通过：已按 Celik / ASME 方法完成 ${state.variables.length} 个变量的 GCI / Richardson 计算，并由最大细网格 GCI 确定控制变量。`,
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
    refreshDemoHint();
  }

  function loadExample() {
    gridInputs.coarse.value = "431109";
    gridInputs.medium.value = "994004";
    gridInputs.fine.value = "2361740";
    state.variables = [
      makeVariable({ name: "阻力系数 C_D", unit: "", values: { coarse: "-0.00059", medium: "0.00702", fine: "0.00729" } }),
      makeVariable({ name: "升力系数 C_L", unit: "", values: { coarse: "0.51792", medium: "0.66469", fine: "0.68734" } }),
      makeVariable({ name: "俯仰力矩系数 C_M", unit: "", values: { coarse: "0.03316", medium: "0.06256", fine: "0.06116" } }),
    ];
    state.activeId = state.variables[0].id;
    renderVariables();
    persistDraft();
    setStatus("已载入参考文章表 I 数据；复算结果应为 GCI：0.150%、0.685%、0.128%。", "ok");
    refreshDemoHint();
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
    if (input.dataset.level) {
      variable.values[input.dataset.level] = input.value;
      lastDemoAnchorLevel = input.dataset.level;
    }

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
    refreshDemoHint();
  });

  Object.entries(gridInputs).forEach(([level, input]) => {
    input?.addEventListener("input", () => {
      lastDemoAnchorLevel = level;
      input.classList.remove("mi-invalid");
      persistDraft();
      updateDecisionPreview();
      updateActiveView();
      refreshDemoHint();
    });
  });

  activeSelect?.addEventListener("change", () => selectVariable(activeSelect.value));
  addVariableButton?.addEventListener("click", () => addVariable());
  bulkButton?.addEventListener("click", openBulkModal);
  bulkImportButton?.addEventListener("click", importBulkVariables);
  exampleButton?.addEventListener("click", loadExample);
  clearButton?.addEventListener("click", clearAll);
  checkButton?.addEventListener("click", validateAll);
  demoEnabled?.addEventListener("change", () => {
    if (demoBody) demoBody.hidden = !demoEnabled.checked;
    refreshDemoHint();
  });
  demoAnchor?.addEventListener("change", refreshDemoHint);
  demoTrend?.addEventListener("change", refreshDemoHint);
  demoGenerateButton?.addEventListener("click", generateQualifiedDemoData);
  exportChartButton?.addEventListener("click", exportChartPng);
  chartViewButtons.forEach((button) => {
    button.addEventListener("click", () => setChartView(button.dataset.chartView));
  });
  toggleFormulasButton?.addEventListener("click", () => {
    setFormulaMode(!resultsTablePanel?.classList.contains("is-formula-mode"));
  });
  expandChartButton?.addEventListener("click", () => {
    setChartExpanded(!chartPanel?.classList.contains("is-expanded"));
  });
  expandTableButton?.addEventListener("click", () => {
    setResultsTableExpanded(!resultsTablePanel?.classList.contains("is-expanded"));
  });

  bulkModal?.querySelectorAll("[data-modal-close]").forEach((button) => {
    button.addEventListener("click", closeBulkModal);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && chartPanel?.classList.contains("is-expanded")) {
      setChartExpanded(false);
      return;
    }
    if (event.key === "Escape" && resultsTablePanel?.classList.contains("is-expanded")) {
      setResultsTableExpanded(false);
      return;
    }
    if (event.key === "Escape" && bulkModal && !bulkModal.classList.contains("hidden")) {
      closeBulkModal();
    }
  });

  const restoredDraft = restoreDraft();
  if (!restoredDraft) {
    state.activeId = state.variables[0].id;
  }
  renderVariables();
  updateDecisionPreview();
  updateActiveView();
  if (restoredDraft) {
    const completeCount = state.variables.filter(variableIsComplete).length;
    setStatus(`已恢复上次草稿：${state.variables.length} 个变量，其中 ${completeCount} 个数据完整。`, "ok");
  }
  try {
    const demoTests = runDemoGeneratorSelfTests();
    console.info("[Mesh Demo Generator]", { version: "1.8.0", ...demoTests });
  } catch (error) {
    console.error(error);
  }
})();
