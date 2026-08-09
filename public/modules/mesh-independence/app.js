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
  const resultsTableHead = document.getElementById("mi-results-table-head");
  const resultsTableBody = document.getElementById("mi-results-table-body");
  const chartViewport = document.getElementById("mi-chart-viewport");
  const chartFootVariable = document.getElementById("mi-chart-foot-variable");
  const chartFootStatus = document.getElementById("mi-chart-foot-status");
  const exportChartButton = document.getElementById("mi-export-chart");

  const GCI_DIMENSION = 3;
  const GCI_SAFETY_FACTOR = 1.25;
  const GCI_THRESHOLD = 5;
  const ASYMPTOTIC_MIN = 0.95;
  const ASYMPTOTIC_MAX = 1.05;

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
        ea21: 0,
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
      phi1, phi2, phi3, epsilon21, epsilon32, r21, r32, p, phiExt,
      ea21, eExt21, gciFine21, gciCoarse32, asymptoticRatio,
      convergenceRatio, convergence,
      valid: [p, phiExt, ea21, eExt21, gciFine21, gciCoarse32, asymptoticRatio]
        .every(Number.isFinite),
    };
  }

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
      resultsTableHead.innerHTML = "<tr><th>参数</th><th>等待变量数据</th></tr>";
      resultsTableBody.innerHTML = "<tr><th>状态</th><td>尚未计算</td></tr>";
      return;
    }

    resultsTableHead.innerHTML = `<tr><th>参数</th>${analyses
      .map(({ variable, index }) => `<th>${escapeAttr(variableLabel(variable, index))}${variable.unit?.trim() ? ` / ${escapeAttr(variable.unit.trim())}` : ""}</th>`)
      .join("")}</tr>`;

    const rows = [
      ["φ₁（细网格）", (r) => formatNumber(r.phi1, 7)],
      ["φ₂（中网格）", (r) => formatNumber(r.phi2, 7)],
      ["φ₃（粗网格）", (r) => formatNumber(r.phi3, 7)],
      ["ε²¹=φ₂−φ₁", (r) => formatNumber(r.epsilon21, 6)],
      ["ε³²=φ₃−φ₂", (r) => formatNumber(r.epsilon32, 6)],
      ["表观阶次 p", (r) => Number.isFinite(r.p) ? formatNumber(r.p, 5) : "∞"],
      ["φ²¹ext", (r) => formatNumber(r.phiExt, 7)],
      ["e²¹a（%）", (r) => formatNumber(r.ea21, 5)],
      ["e²¹ext（%）", (r) => formatNumber(r.eExt21, 5)],
      ["GCI²¹fine（%）", (r) => formatNumber(r.gciFine21, 5)],
      ["渐近区比值", (r) => formatNumber(r.asymptoticRatio, 5)],
    ];

    resultsTableBody.innerHTML = rows.map(([label, formatter]) =>
      `<tr><th>${label}</th>${analyses.map(({ result }) =>
        `<td>${result?.valid ? formatter(result) : "—"}</td>`).join("")}</tr>`).join("");
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
    renderResultsTable(analyses);

    if (!countsReady) {
      if (recommendTitle) recommendTitle.textContent = "等待网格规模";
      if (recommendText) recommendText.textContent = "请先填写有效的粗、中、细网格单元数，再补充各监测变量的三组计算结果。";
      if (decisionNotes) {
        decisionNotes.innerHTML = `
          <span>○ 三套网格规模尚未通过检查</span>
          <span>${completeCount ? "✓" : "○"} 已完整填写 ${completeCount} 个监测变量</span>
          <span>○ 等待执行三维 Celik / ASME GCI 计算</span>`;
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
          <span>○ 等待全部变量后统一确定控制变量</span>`;
      }
      return;
    }

    const decision = decisionFromAnalyses(analyses);
    const counts = readGridCounts();
    const controlLabel = decision.control
      ? variableLabel(decision.control.variable, decision.control.index)
      : "—";
    const maxGci = decision.control?.result?.gciFine21;
    const gridLabel = decision.level === "medium"
      ? `中网格（${formatCells(counts.medium)}）`
      : decision.level === "fine" ? `细网格（${formatCells(counts.fine)}）` : "暂不判定";

    if (decisionGrid) decisionGrid.textContent = gridLabel;
    if (decisionVariable) decisionVariable.textContent = controlLabel;
    if (decisionGci) decisionGci.textContent = Number.isFinite(maxGci) ? `${formatNumber(maxGci, 5)} %` : "—";
    if (recommendTitle) {
      recommendTitle.textContent = decision.level === "medium"
        ? "推荐采用中网格"
        : decision.level === "fine" ? "暂用细网格并继续复核" : "尚不能确认网格无关性";
    }
    if (recommendText) recommendText.textContent = decision.reason;
    if (decisionNotes) {
      const valid = analyses.filter((item) => item.result?.valid);
      const convergentCount = valid.filter((item) => item.result.convergence !== "divergent").length;
      const asymptoticCount = valid.filter((item) =>
        item.result.asymptoticRatio >= ASYMPTOTIC_MIN &&
        item.result.asymptoticRatio <= ASYMPTOTIC_MAX).length;
      decisionNotes.innerHTML = `
        <span>✓ 已按三维 h∝N<sup>−1/3</sup>、F<sub>s</sub>=${GCI_SAFETY_FACTOR} 完成计算</span>
        <span>${convergentCount === valid.length ? "✓" : "○"} 趋稳（含振荡趋稳）${convergentCount} / ${valid.length} 个变量</span>
        <span>${asymptoticCount === valid.length ? "✓" : "○"} 渐近区比值 0.95–1.05：${asymptoticCount} / ${valid.length}</span>
        <span>${Number.isFinite(maxGci) && maxGci <= GCI_THRESHOLD ? "✓" : "○"} 最大细网格 GCI：${Number.isFinite(maxGci) ? `${formatNumber(maxGci, 5)}%` : "—"}</span>`;
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
    const W = 760;
    const H = 420;
    const left = 120;
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
    const left = 120;
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
      svgElement("text", { x: left + plotW, y: 24, "text-anchor": "end", class: "mi-paper-note" }, "数据完整后自动叠加 GCI / Richardson 外推点"),
    );
  }

  function drawArticleChart(variable) {
    const counts = readGridCounts();
    const result = calculateGci(variable, counts);
    const name = variable?.name?.trim() || "监测物理量";
    const unit = variable?.unit?.trim();
    const yTitle = unit ? `${name} / ${unit}` : name;

    if (!result?.valid || !trendChart) {
      drawChartBase("输入完整数据后生成文献图 4 式 GCI / Richardson 外推图", yTitle);
      chartViewport?.removeAttribute("data-analysis-ready");
      return;
    }

    clearChart();
    const W = 760;
    const H = 420;
    const left = 120;
    const right = 30;
    const top = 48;
    const bottom = 82;
    const plotW = W - left - right;
    const plotH = H - top - bottom;
    const relative = {
      coarse: 1,
      medium: counts.medium / counts.coarse,
      fine: counts.fine / counts.coarse,
    };
    relative.ext = relative.fine + Math.max((relative.fine - relative.medium) * 0.32, relative.fine * 0.08);
    const xMin = Math.max(0, relative.coarse - (relative.medium - relative.coarse) * 0.22);
    const xMax = relative.ext + (relative.ext - relative.fine) * 0.35;
    const values = [result.phi3, result.phi2, result.phi1, result.phiExt];
    let yMin = Math.min(...values);
    let yMax = Math.max(...values);
    const yRange = yMax - yMin;
    const yPad = yRange === 0 ? Math.max(Math.abs(yMax) * 0.04, 1) : yRange * 0.18;
    yMin -= yPad;
    yMax += yPad;
    const x = (value) => left + ((value - xMin) / Math.max(xMax - xMin, 1e-12)) * plotW;
    const y = (value) => top + (1 - (value - yMin) / Math.max(yMax - yMin, 1e-12)) * plotH;
    const midCoarseMedium = (relative.coarse + relative.medium) / 2;
    const midMediumFine = (relative.medium + relative.fine) / 2;
    const analyses = completedAnalyses();
    const decision = decisionFromAnalyses(analyses);
    const selected = decision.level;

    trendChart.appendChild(svgElement("style", {}, `
      text{font-family:"Times New Roman","SimSun",serif;fill:#111}
      .axis{stroke:#111;stroke-width:1.15}.grid{stroke:#d7dce1;stroke-width:.8;stroke-dasharray:3 5}
      .curve{fill:none;stroke:#222;stroke-width:1.7;stroke-dasharray:7 5}.extline{stroke:#777;stroke-width:1;stroke-dasharray:5 4}
      .tick{font-size:11.5px}.small{font-size:10px;fill:#555}.label{font-size:14px}.title{font-size:15px;font-weight:600}
      .value{font-size:11.5px;font-weight:600}.zone{font-size:12px;font-weight:600}.note{font-size:10px;fill:#555}
    `));
    trendChart.appendChild(svgElement("rect", { x: 0, y: 0, width: W, height: H, fill: "#fff" }));

    const zones = [
      { level: "coarse", from: xMin, to: midCoarseMedium, label: "粗网格", fill: "#f2f3f4" },
      { level: "medium", from: midCoarseMedium, to: midMediumFine, label: "中网格", fill: "#eef5f2" },
      { level: "fine", from: midMediumFine, to: xMax, label: "细网格", fill: "#fbefef" },
    ];
    zones.forEach((zone) => {
      trendChart.appendChild(svgElement("rect", {
        x: x(zone.from), y: top, width: Math.max(0, x(zone.to) - x(zone.from)), height: plotH,
        fill: zone.fill, opacity: selected === zone.level ? 0.95 : 0.58,
        stroke: selected === zone.level ? "#d94b45" : "none",
        "stroke-width": selected === zone.level ? 1.4 : 0,
        "stroke-dasharray": selected === zone.level ? "7 5" : "none",
      }));
      trendChart.appendChild(svgElement("text", {
        x: (x(zone.from) + x(zone.to)) / 2, y: top + 18, "text-anchor": "middle", class: "zone",
        fill: selected === zone.level ? "#c63630" : "#444",
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
      svgElement("line", { x1: x(relative.fine), y1: y(result.phiExt), x2: x(relative.ext), y2: y(result.phiExt), class: "extline" }),
      svgElement("text", { x: left, y: 24, class: "title" }, `${name}网格无关性验证`),
      svgElement("text", { x: left + plotW, y: 24, "text-anchor": "end", class: "note" }, `p=${formatNumber(result.p, 4)}  GCI²¹fine=${formatNumber(result.gciFine21, 4)}%`),
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
      const marker = index === 0
        ? svgElement("circle", { cx: px, cy: py, r: 5.5, fill: "#111", stroke: "#fff", "stroke-width": 1 })
        : index === 1
          ? svgElement("rect", { x: px - 5, y: py - 5, width: 10, height: 10, fill: "#d8271f", stroke: "#fff", "stroke-width": 1 })
          : svgElement("path", { d: `M${px},${py - 6} L${px - 6},${py + 5} L${px + 6},${py + 5} Z`, fill: "#24a33a", stroke: "#fff", "stroke-width": 1 });
      trendChart.append(
        svgElement("line", { x1: px, y1: top + plotH, x2: px, y2: top + plotH + 6, class: "axis" }),
        marker,
        svgElement("text", { x: px, y: py - 12, "text-anchor": "middle", class: "value" }, formatNumber(point.value, 7)),
        svgElement("text", { x: px, y: top + plotH + 23, "text-anchor": "middle", class: "tick" }, `${point.label}：${formatNumber(point.xr, 4)}`),
        svgElement("text", { x: px, y: top + plotH + 40, "text-anchor": "middle", class: "small" }, formatCells(point.cells)),
      );
    });

    const extX = x(relative.ext);
    const extY = y(result.phiExt);
    trendChart.append(
      svgElement("line", { x1: extX - 6, y1: extY - 6, x2: extX + 6, y2: extY + 6, stroke: "#d8271f", "stroke-width": 2 }),
      svgElement("line", { x1: extX - 6, y1: extY + 6, x2: extX + 6, y2: extY - 6, stroke: "#d8271f", "stroke-width": 2 }),
      svgElement("text", { x: extX, y: extY - 13, "text-anchor": "middle", class: "value", fill: "#c91f18" }, formatNumber(result.phiExt, 7)),
      svgElement("text", { x: extX, y: top + plotH + 23, "text-anchor": "middle", class: "tick" }, "EXT"),
      svgElement("text", { x: extX, y: top + plotH + 40, "text-anchor": "middle", class: "small" }, "Richardson"),
      svgElement("text", { x: left + plotW / 2, y: H - 17, "text-anchor": "middle", class: "label" }, "相对网格数量 N / N粗"),
      svgElement("text", { x: 24, y: top + plotH / 2, "text-anchor": "middle", transform: `rotate(-90 24 ${top + plotH / 2})`, class: "label" }, yTitle),
    );

    chartViewport?.setAttribute("data-analysis-ready", "true");
  }

  function exportChartPng() {
    if (!trendChart || !chartViewport?.hasAttribute("data-analysis-ready")) {
      setStatus("请先完成当前变量的 GCI / Richardson 计算，再导出图片。", "warn");
      return;
    }
    const clone = trendChart.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", "1520");
    clone.setAttribute("height", "840");
    const source = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1520;
      canvas.height = 840;
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((png) => {
        if (!png) return;
        const link = document.createElement("a");
        const name = variableLabel(activeVariable()).replace(/[\\/:*?"<>|]+/g, "_");
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
    renderFormalMetrics(result);
    drawArticleChart(variable);
    if (chartFootVariable) chartFootVariable.textContent = `当前变量：${label}`;
    if (chartFootStatus) {
      chartFootStatus.textContent = result?.valid
        ? `细网格 GCI ${formatNumber(result.gciFine21, 5)}%，渐近区比值 ${formatNumber(result.asymptoticRatio, 5)}`
        : "等待完整网格规模与当前变量三组结果";
    }
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
  exportChartButton?.addEventListener("click", exportChartPng);

  bulkModal?.querySelectorAll("[data-modal-close]").forEach((button) => {
    button.addEventListener("click", closeBulkModal);
  });

  window.addEventListener("keydown", (event) => {
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
})();
