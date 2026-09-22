import {
  calculateDeviation,
  parseAreaRows,
  parseContourText,
  summarizeByNozzle,
} from "./calculation-core.js";
import { buildRoundnessChart, nozzleColor } from "./chart.js";
import { axisDraftError } from "./axis-settings.js";

const STORAGE_KEY = "pelton-roundness-axes-v1";
const SKIN_KEY = "pelton-toolbox-skin-v1";
const VALID_SKINS = new Set(["fresh-cartoon", "watercolor", "tech-neon", "mechanical-cartoon"]);

const contourFile = document.getElementById("contour-file");
const areaFile = document.getElementById("area-file");
const contourMeta = document.getElementById("contour-meta");
const areaMeta = document.getElementById("area-meta");
const axisList = document.getElementById("axis-list");
const axisHint = document.getElementById("axis-hint");
const calculateButton = document.getElementById("calculate-button");
const exportXlsxButton = document.getElementById("export-xlsx");
const exportCsvButton = document.getElementById("export-csv");
const status = document.getElementById("status");
const messagesPanel = document.getElementById("messages-panel");
const messagesList = document.getElementById("messages");
const resultsPanel = document.getElementById("results-panel");
const summary = document.getElementById("summary");
const nozzleFilter = document.getElementById("nozzle-filter");
const resultCount = document.getElementById("result-count");
const resultsBody = document.getElementById("results-body");
const chartPanel = document.getElementById("chart-panel");
const chartContainer = document.getElementById("chart-container");
const chartMode = document.getElementById("chart-mode");
const chartNozzles = document.getElementById("chart-nozzles");
const chartNote = document.getElementById("chart-note");
const chartStatus = document.getElementById("chart-status");
const exportChartPngButton = document.getElementById("export-chart-png");
const exportChartSvgButton = document.getElementById("export-chart-svg");
let chartSvg = "";
let chartExportBusy = false;
const axisEdits = new Map();

const state = {
  contours: [],
  areas: [],
  contourName: "",
  areaName: "",
  contourWarnings: [],
  areaWarnings: [],
  axes: readStoredAxes(),
  restoredAxisDraft: false,
  results: [],
  resultWarnings: [],
  resultErrors: [],
};
state.restoredAxisDraft = Object.values(state.axes).some((axis) =>
  axis && Object.values(axis).some((value) => String(value ?? "").trim() !== "")
);

function readStoredAxes() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function saveAxes() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.axes));
    return true;
  } catch {
    // 浏览器禁止本地存储时仍可在本次会话内计算。
    return false;
  }
}

function normalizeSkin(value) {
  return VALID_SKINS.has(value) ? value : "tech-neon";
}

function readSkin() {
  try {
    if (window.parent && window.parent !== window) {
      const parentSkin = window.parent.document.documentElement.dataset.peltonSkin;
      if (VALID_SKINS.has(parentSkin)) return parentSkin;
    }
  } catch {
    // 独立页面或跨域嵌入时使用本地主题。
  }
  try { return normalizeSkin(localStorage.getItem(SKIN_KEY)); } catch { return "tech-neon"; }
}

function applySkin() {
  document.documentElement.dataset.peltonSkin = readSkin();
}

applySkin();
window.addEventListener("storage", (event) => {
  if (event.key === SKIN_KEY) applySkin();
});
try {
  if (window.parent && window.parent !== window) {
    window.parent.addEventListener("pelton-skin-change", applySkin);
  }
} catch {
  // 跨域嵌入时没有父页面主题事件。
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function uniqueNozzles() {
  return [...new Set(state.contours.map((contour) => contour.nozzle))].sort((a, b) => a - b);
}

function updateAxisEditingControls() {
  const editing = axisEdits.size > 0;
  calculateButton.disabled = editing;
  exportXlsxButton.disabled = editing || state.results.length === 0;
  exportCsvButton.disabled = editing || state.results.length === 0;
  exportChartPngButton.disabled = editing || !chartSvg || chartExportBusy;
  exportChartSvgButton.disabled = editing || !chartSvg;
}

function finishAxisEdit(nozzle, save, errorNode) {
  if (!axisEdits.has(nozzle)) return;
  const draft = axisEdits.get(nozzle);
  if (save) {
    const error = axisDraftError(draft);
    if (error) {
      errorNode.textContent = error;
      errorNode.hidden = false;
      return;
    }
    state.axes[nozzle] = { ...draft };
    const persisted = saveAxes();
    invalidateResults(`PZ${nozzle} 轴线已保存并锁定${persisted ? "" : "（仅本次页面有效，浏览器未允许本地保存）"}。${state.contours.length && state.areas.length ? "请重新计算。" : "可继续设置其他喷嘴或导入文件。"}`);
  } else {
    status.textContent = `已取消 PZ${nozzle} 的修改，恢复原坐标并锁定。`;
  }
  axisEdits.delete(nozzle);
  renderAxes();
  axisList.querySelector(`[data-nozzle-card="${nozzle}"] .axis-edit-actions button`)?.focus({ preventScroll: true });
}

function renderAxes() {
  axisList.replaceChildren();
  // Six nozzle axes can be prepared before any file is imported. Keep saved
  // extra nozzles too, and add newly discovered nozzles without resetting drafts.
  const savedNozzles = Object.keys(state.axes).map(Number).filter(nozzle => Number.isInteger(nozzle) && nozzle > 0);
  const nozzles = [...new Set([1, 2, 3, 4, 5, 6, ...savedNozzles, ...uniqueNozzles(), ...axisEdits.keys()])].sort((a, b) => a - b);
  axisHint.textContent = axisEdits.size
    ? `PZ${[...axisEdits.keys()].join("、PZ")} 正在编辑，请保存或取消。编辑期间暂停计算和导出；已有结果仍对应上次保存的轴线。`
    : `${state.restoredAxisDraft ? "已恢复上次保存的坐标，请核对。" : "可在导入前设置。"}坐标默认锁定，点击各喷嘴“编辑”后修改，“保存”生效，“取消”恢复原值；导入文件不会覆盖坐标。`;

  nozzles.forEach((nozzle) => {
    const editing = axisEdits.has(nozzle);
    const values = editing ? axisEdits.get(nozzle) : state.axes[nozzle] || {};
    const card = element("div", `axis-card${editing ? " editing" : ""}`);
    card.dataset.nozzleCard = String(nozzle);
    const head = element("div", "axis-head");
    const copy = element("div", "axis-head-copy");
    const name = element("strong", "", `PZ${nozzle}`);
    name.append(element("span", "axis-lock-state", editing ? "编辑中" : "已锁定"));
    copy.append(name);
    const contourCount = state.contours.filter((item) => item.nozzle === nozzle).length;
    copy.append(element("small", "", contourCount ? `${contourCount} 个轮廓截面` : state.contours.length ? "当前文件无此喷嘴轮廓" : "待导入轮廓"));
    const editActions = element("div", "axis-edit-actions");
    const errorNode = element("p", "axis-error");
    errorNode.hidden = true;
    errorNode.setAttribute("role", "alert");
    if (editing) {
      [true, false].forEach(save => {
        const button = element("button", `button ${save ? "primary" : "secondary"}`, save ? "保存" : "取消");
        button.type = "button";
        button.setAttribute("aria-label", `${save ? "保存" : "取消编辑"} PZ${nozzle} 轴线`);
        button.addEventListener("click", () => finishAxisEdit(nozzle, save, errorNode));
        editActions.append(button);
      });
    } else {
      const button = element("button", "button secondary", "编辑");
      button.type = "button";
      button.setAttribute("aria-label", `编辑 PZ${nozzle} 轴线`);
      button.addEventListener("click", () => {
        axisEdits.set(nozzle, { ...state.axes[nozzle] });
        renderAxes();
        status.textContent = `正在编辑 PZ${nozzle}，请保存或取消后再计算。`;
        axisList.querySelector(`[data-nozzle-card="${nozzle}"] input`)?.focus({ preventScroll: true });
      });
      editActions.append(button);
    }
    head.append(copy, editActions);
    const grid = element("div", "axis-grid");
    grid.append(element("span"));
    ["X (m)", "Y (m)", "Z (m)"].forEach((label) => {
      grid.append(element("span", "coordinate-label", label));
    });
    ["A", "B"].forEach((pointLabel) => {
      grid.append(element("span", "", pointLabel));
      ["X", "Y", "Z"].forEach((coordinate) => {
        const key = `${pointLabel.toLowerCase()}${coordinate.toLowerCase()}`;
        const input = element("input");
        input.type = "number";
        input.step = "any";
        input.inputMode = "decimal";
        input.placeholder = coordinate;
        input.setAttribute("aria-label", `PZ${nozzle} 轴线 ${pointLabel} 点 ${coordinate} 坐标，米`);
        input.dataset.nozzle = String(nozzle);
        input.dataset.coordinate = key;
        input.value = values[key] ?? "";
        input.readOnly = !editing;
        input.tabIndex = editing ? 0 : -1;
        input.title = editing ? input.value : `${input.value || "未设置"}（点击“编辑”修改）`;
        input.addEventListener("input", () => {
          if (!axisEdits.has(nozzle)) return;
          axisEdits.get(nozzle)[key] = input.value;
          input.title = input.value;
          errorNode.hidden = true;
        });
        grid.append(input);
      });
    });
    card.append(head, grid, errorNode);
    axisList.append(card);
  });
  updateAxisEditingControls();
}

function invalidateResults(message) {
  state.results = [];
  state.resultWarnings = [];
  state.resultErrors = [];
  resultsPanel.hidden = true;
  chartPanel.hidden = true;
  chartSvg = "";
  chartContainer.replaceChildren();
  exportXlsxButton.disabled = true;
  exportCsvButton.disabled = true;
  status.textContent = message;
  renderMessages();
  updateAxisEditingControls();
}

function renderMessages() {
  messagesList.replaceChildren();
  const items = [
    ...state.contourWarnings.map((message) => ({ message, error: false })),
    ...state.areaWarnings.map((message) => ({ message, error: false })),
    ...state.resultWarnings.map((message) => ({ message, error: false })),
    ...state.resultErrors.map((message) => ({ message, error: true })),
  ];
  messagesPanel.hidden = items.length === 0;
  items.forEach(({ message, error }) => {
    messagesList.append(element("li", error ? "error" : "", message));
  });
}

function formatNumber(value, digits = 6) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function updateFilter() {
  const selected = nozzleFilter.value;
  nozzleFilter.replaceChildren(new Option("全部喷嘴", "all"));
  [...new Set(state.results.map((row) => row.nozzle))].sort((a, b) => a - b).forEach((nozzle) => {
    nozzleFilter.add(new Option(`PZ${nozzle}`, String(nozzle)));
  });
  nozzleFilter.value = [...nozzleFilter.options].some((option) => option.value === selected) ? selected : "all";
}

function renderResults() {
  const summaries = summarizeByNozzle(state.results);
  summary.replaceChildren();
  summaries.forEach((item) => {
    const card = element("div", "summary-card");
    card.append(element("strong", "", `PZ${item.nozzle} · ${item.count} 个截面`));
    card.append(element("span", "", `平均 ${formatNumber(item.averageDeviationPct, 3)}%`));
    card.append(element("span", "", `最大 ${formatNumber(item.maxDeviationPct, 3)}% · ${item.maxSection}D`));
    summary.append(card);
  });

  updateFilter();
  renderTable();
  resultsPanel.hidden = state.results.length === 0;
  exportXlsxButton.disabled = state.results.length === 0;
  exportCsvButton.disabled = state.results.length === 0;
  renderChartControls();
}

function renderChartControls() {
  chartPanel.hidden = state.results.length === 0;
  chartNozzles.replaceChildren();
  [...new Set(state.results.map(row => row.nozzle))].sort((a, b) => a - b).forEach(nozzle => {
    const label = element("label", "chart-nozzle-option");
    const input = element("input");
    input.type = "checkbox";
    input.checked = true;
    input.value = String(nozzle);
    input.addEventListener("change", renderChart);
    const swatch = element("span", "chart-swatch");
    swatch.style.backgroundColor = nozzleColor(nozzle);
    swatch.setAttribute("aria-hidden", "true");
    label.append(input, swatch, element("span", "", `PZ${nozzle}`));
    chartNozzles.append(label);
  });
  renderChart();
}

function renderChart() {
  const visibleNozzles = [...chartNozzles.querySelectorAll("input:checked")].map(input => Number(input.value));
  chartSvg = buildRoundnessChart(state.results, { mode: chartMode.value, visibleNozzles });
  // The renderer escapes warning text and accepts numeric coordinates only.
  chartContainer.innerHTML = chartSvg;
  if (!chartSvg) chartContainer.append(element("p", "chart-empty", "请至少勾选一个喷嘴以显示曲线。"));
  updateAxisEditingControls();
  const warningCount = state.results.filter(row => visibleNozzles.includes(row.nozzle) && row.warnings.length).length;
  chartNote.textContent = `${chartMode.value === "coefficient" ? "C = (rmax − rmin) / √(S/π)，未乘 100%。" : "百分比 = C × 100%；切换为无量纲 C 可使用示例图的纵轴形式。"}仅显示已成功计算的截面，不补点、不平滑。${warningCount ? `当前曲线中 ${warningCount} 个截面有检查提示，请核对下方结果表。` : ""}`;
  chartStatus.textContent = "";
}

async function exportChartPng() {
  if (!chartSvg || axisEdits.size || chartExportBusy) return;
  chartExportBusy = true;
  updateAxisEditingControls();
  chartStatus.textContent = "正在生成高清图片…";
  const url = URL.createObjectURL(new Blob([chartSvg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("曲线图加载失败"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth * 2;
    canvas.height = image.naturalHeight * 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器不支持图片导出");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("图片生成失败");
    downloadBlob(blob, `${makeBaseName()}_曲线_${chartMode.value === "coefficient" ? "C" : "百分比"}.png`);
    chartStatus.textContent = `已导出 ${canvas.width} × ${canvas.height} PNG；SVG 可用于无损缩放。`;
  } catch (error) {
    chartStatus.textContent = `图片导出失败：${error.message}。可尝试导出 SVG。`;
  } finally {
    URL.revokeObjectURL(url);
    chartExportBusy = false;
    updateAxisEditingControls();
  }
}

function renderTable() {
  const selected = nozzleFilter.value;
  const visible = state.results.filter((row) => selected === "all" || String(row.nozzle) === selected);
  resultsBody.replaceChildren();
  visible.forEach((row) => {
    const tr = element("tr");
    const values = [
      `PZ${row.nozzle}`,
      `${row.section}D`,
      String(row.pointCount),
      formatNumber(row.area),
      formatNumber(row.rMax),
      formatNumber(row.rMin),
      formatNumber(row.deltaR),
      formatNumber(row.equivalentRadius),
      formatNumber(row.deviationPct, 4),
      row.warnings.length ? row.warnings.join("；") : "—",
    ];
    values.forEach((value, index) => tr.append(element("td", index === values.length - 1 && row.warnings.length ? "issue" : "", value)));
    resultsBody.append(tr);
  });
  resultCount.textContent = `显示 ${visible.length} / ${state.results.length} 个截面`;
}

async function readContourFile(file) {
  invalidateResults("正在读取轮廓数据…");
  const parsed = parseContourText(await file.text());
  state.contours = parsed.contours;
  state.contourWarnings = state.restoredAxisDraft && parsed.contours.length
    ? [...parsed.warnings, "已恢复浏览器中上次输入的轴线坐标；更换模型后请逐个喷嘴核对。"]
    : parsed.warnings;
  state.contourName = file.name;
  contourMeta.textContent = `${file.name} · ${state.contours.length} 个轮廓 · ${uniqueNozzles().length} 个喷嘴`;
  renderAxes();
  renderMessages();
  status.textContent = state.contours.length
    ? `已读取 ${state.contours.length} 个轮廓。${state.areas.length ? "可以设置轴线并计算。" : "请继续导入面积文件。"}`
    : "未读取到有效轮廓，请检查文件格式。";
}

async function readAreaFile(file) {
  invalidateResults("正在读取面积数据…");
  if (!window.XLSX) throw new Error("Excel 文件解析组件未加载，请刷新页面重试。");
  const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", raw: true, cellText: false });
  let best = { entries: [], warnings: ["没有找到有效的面积工作表。"] };
  let selectedSheet = "";
  workbook.SheetNames.forEach((sheetName) => {
    const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });
    const parsed = parseAreaRows(rows);
    if (parsed.entries.length > best.entries.length) {
      best = parsed;
      selectedSheet = sheetName;
    }
  });
  state.areas = best.entries;
  state.areaWarnings = best.warnings;
  state.areaName = file.name;
  areaMeta.textContent = `${file.name}${selectedSheet ? ` · ${selectedSheet}` : ""} · ${state.areas.length} 个面积值`;
  renderMessages();
  status.textContent = state.areas.length
    ? `已读取 ${state.areas.length} 个面积值。${state.contours.length ? "可以设置轴线并计算。" : "请继续导入轮廓文件。"}`
    : "未读取到有效面积，请检查工作表和表头。";
}

function calculate() {
  if (axisEdits.size) {
    status.textContent = "请先保存或取消正在编辑的轴线。";
    return;
  }
  if (!state.contours.length || !state.areas.length) {
    status.textContent = "请先导入有效的轮廓文件和面积文件。";
    return;
  }
  const calculation = calculateDeviation(state.contours, state.areas, state.axes);
  state.results = calculation.results;
  state.resultWarnings = calculation.warnings;
  state.resultErrors = calculation.errors;
  renderMessages();
  renderResults();
  status.textContent = state.results.length
    ? `已计算 ${state.results.length} 个截面${state.resultErrors.length ? `；${state.resultErrors.length} 个输入问题待处理` : ""}。`
    : "未完成计算，请检查轴线和数据提示。";
}

function resultRows() {
  return state.results.map((row) => ({
    喷嘴: `PZ${row.nozzle}`,
    截面位置D: row.section,
    轮廓名称: row.name,
    轮廓点数: row.pointCount,
    截面面积_m2: row.area,
    最大半径_m: row.rMax,
    最小半径_m: row.rMin,
    最大直径_m: row.dMax,
    最小直径_m: row.dMin,
    半径差_m: row.deltaR,
    等面积圆半径_m: row.equivalentRadius,
    偏离圆度_百分比: row.deviationPct,
    轮廓闭合面积_m2: row.contourArea,
    轮廓与导入面积差_百分比: row.contourAreaDifferencePct,
    轴线与截面法向偏角_deg: row.axisPlaneAngleDeg,
    数据检查: row.warnings.join("；"),
  }));
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function makeBaseName() {
  const name = state.contourName.replace(/\.[^.]+$/, "") || "射流截面";
  return `${name}_偏离圆度结果`;
}

function exportExcel() {
  if (!state.results.length || axisEdits.size) return;
  const XLSX = window.XLSX;
  const workbook = XLSX.utils.book_new();
  const detail = XLSX.utils.json_to_sheet(resultRows());
  detail["!cols"] = [
    { wch: 10 }, { wch: 13 }, { wch: 23 }, { wch: 12 },
    ...Array.from({ length: 8 }, () => ({ wch: 19 })),
    { wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 58 },
  ];
  XLSX.utils.book_append_sheet(workbook, detail, "截面结果");

  const grouped = summarizeByNozzle(state.results).map((item) => ({
    喷嘴: `PZ${item.nozzle}`,
    截面数量: item.count,
    平均偏离圆度_百分比: item.averageDeviationPct,
    最大偏离圆度_百分比: item.maxDeviationPct,
    最大值所在截面_D: item.maxSection,
  }));
  const groupSheet = XLSX.utils.json_to_sheet(grouped);
  groupSheet["!cols"] = [{ wch: 10 }, { wch: 13 }, { wch: 25 }, { wch: 25 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, groupSheet, "喷嘴汇总");

  const axisRows = uniqueNozzles().map((nozzle) => {
    const axis = state.axes[nozzle] || {};
    const row = { 喷嘴: `PZ${nozzle}` };
    ["ax", "ay", "az", "bx", "by", "bz"].forEach((key) => {
      const raw = axis[key];
      row[key] = raw === undefined || String(raw).trim() === "" ? null : Number(raw);
    });
    return row;
  });
  const sourceRows = [
    ["轮廓文件", state.contourName],
    ["面积文件", state.areaName],
    ["计算公式", "偏离圆度 = (rmax-rmin) / sqrt(S/pi) * 100%"],
    ["坐标单位", "m"],
    ["面积单位", "m²"],
    ["轴线说明", "每个喷嘴的 A/B 坐标是实际中心轴线上的两点"],
  ];
  const sourceSheet = XLSX.utils.aoa_to_sheet(sourceRows);
  sourceSheet["!cols"] = [{ wch: 16 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(workbook, sourceSheet, "计算说明");
  const axesSheet = XLSX.utils.json_to_sheet(axisRows);
  axesSheet["!cols"] = Array.from({ length: 7 }, () => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(workbook, axesSheet, "轴线坐标");

  const excelBytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  downloadBlob(new Blob([excelBytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${makeBaseName()}.xlsx`);
}

function exportCsv() {
  if (!state.results.length || axisEdits.size) return;
  const text = window.XLSX.utils.sheet_to_csv(window.XLSX.utils.json_to_sheet(resultRows()));
  downloadBlob(new Blob(["\uFEFF", text], { type: "text/csv;charset=utf-8" }), `${makeBaseName()}.csv`);
}

document.getElementById("select-contour").addEventListener("click", () => contourFile.click());
document.getElementById("select-area").addEventListener("click", () => areaFile.click());

contourFile.addEventListener("change", async () => {
  const file = contourFile.files?.[0];
  if (!file) return;
  try { await readContourFile(file); }
  catch (error) {
    state.contours = [];
    state.contourWarnings = [String(error?.message || error)];
    contourMeta.textContent = "读取失败";
    renderAxes();
    renderMessages();
    status.textContent = "轮廓文件读取失败。";
  }
});

areaFile.addEventListener("change", async () => {
  const file = areaFile.files?.[0];
  if (!file) return;
  try { await readAreaFile(file); }
  catch (error) {
    state.areas = [];
    state.areaWarnings = [String(error?.message || error)];
    areaMeta.textContent = "读取失败";
    renderMessages();
    status.textContent = "面积文件读取失败。";
  }
});

calculateButton.addEventListener("click", calculate);
nozzleFilter.addEventListener("change", renderTable);
exportXlsxButton.addEventListener("click", exportExcel);
exportCsvButton.addEventListener("click", exportCsv);
chartMode.addEventListener("change", renderChart);
exportChartPngButton.addEventListener("click", exportChartPng);
exportChartSvgButton.addEventListener("click", () => {
  if (!chartSvg || axisEdits.size) return;
  downloadBlob(new Blob([chartSvg], { type: "image/svg+xml;charset=utf-8" }), `${makeBaseName()}_曲线_${chartMode.value === "coefficient" ? "C" : "百分比"}.svg`);
  chartStatus.textContent = "已导出 SVG 矢量图。";
});

renderAxes();
status.textContent = state.restoredAxisDraft
  ? "已恢复上次的轴线设置，请核对坐标并导入数据文件。"
  : "点击各喷嘴“编辑”预设轴线；保存后导入轮廓和面积文件即可计算。";
