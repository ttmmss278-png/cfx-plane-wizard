import { calculateDeviation, sectionKey } from "./calculation-core.js";

export const PROJECT_FORMAT = "pelton-roundness-project";
export const PROJECT_VERSION = 1;
export const MAX_PROJECT_BYTES = 256 * 1024 * 1024;
const axisKeys = ["ax", "ay", "az", "bx", "by", "bz"];

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function object(value, label) {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value), `${label}格式无效。`);
  return value;
}

function text(value, label) {
  requireValue(typeof value === "string", `${label}应为文本。`);
  return value;
}

function number(value, label) {
  requireValue(typeof value === "number" && Number.isFinite(value), `${label}应为有效数值。`);
  return value;
}

function integer(value, minimum, label) {
  requireValue(Number.isSafeInteger(value) && value >= minimum, `${label}无效。`);
  return value;
}

function list(value, label) {
  requireValue(Array.isArray(value), `${label}应为数组。`);
  return value;
}

function messages(value, label) {
  return list(value, label).map(item => text(item, label));
}

function sectionIdentity(value, label) {
  object(value, label);
  const nozzle = integer(value.nozzle, 1, `${label}喷嘴号`);
  const section = number(value.section, `${label}截面位置`);
  const key = sectionKey(nozzle, section);
  requireValue(value.key === key, `${label}的喷嘴、截面与匹配编号不一致。`);
  return { key, nozzle, section };
}

// Compare the saved calculation with a fresh calculation; do not trust cached
// radii/percentages from a manually edited or damaged project file.
function sameValue(saved, calculated) {
  if (typeof calculated === "number") {
    return typeof saved === "number" && Number.isFinite(saved) && Number.isFinite(calculated) &&
      Math.abs(saved - calculated) <= Number.EPSILON * 32 * Math.max(1, Math.abs(calculated));
  }
  if (Array.isArray(calculated)) {
    return Array.isArray(saved) && saved.length === calculated.length && calculated.every((item, index) => sameValue(saved[index], item));
  }
  if (calculated && typeof calculated === "object") {
    return saved && typeof saved === "object" && !Array.isArray(saved) &&
      Object.keys(calculated).every(key => Object.hasOwn(saved, key) && sameValue(saved[key], calculated[key]));
  }
  return saved === calculated;
}

/** Fully validate and recalculate before the UI replaces any current state. */
export function readRoundnessProject(source, { allowDraft = false } = {}) {
  let project;
  try { project = JSON.parse(String(source).replace(/^\uFEFF/, "")); }
  catch { throw new Error("文件不是有效的计算项目 JSON，可能已损坏。请打开“保存计算项目”生成的文件。"); }
  object(project, "项目");
  requireValue(project.format === PROJECT_FORMAT, "这不是偏离圆度计算项目。Excel/CSV 结果表不能恢复项目，请选择 .roundness.json 文件。");
  requireValue(project.version === PROJECT_VERSION && project.calculationVersion === 1, "项目版本不受支持，请使用相应版本的工具箱打开，或刷新页面后重试。");
  requireValue(project.units?.coordinates === "m" && project.units?.area === "m²", "项目坐标/面积单位不正确，要求 m / m²。");
  text(project.savedAt, "保存时间");
  requireValue(Number.isFinite(Date.parse(project.savedAt)), "项目保存时间无效。");
  const sources = object(project.sources, "来源文件");
  const data = object(project.data, "项目数据");
  const contours = list(data.contours, "轮廓数据").map((raw, index) => {
    const label = `第 ${index + 1} 个轮廓`;
    const identity = sectionIdentity(raw, label);
    requireValue(identity.section >= 0, `${label}截面位置不能为负数。`);
    const points = list(raw.points, `${label}坐标`);
    requireValue(points.length >= 3, `${label}至少需要三个点。`);
    return {
      ...identity,
      name: text(raw.name, `${label}名称`),
      sectionToken: text(raw.sectionToken, `${label}截面标记`),
      invalidRows: integer(raw.invalidRows, 0, `${label}无效行数`),
      points: points.map(point => {
        requireValue(Array.isArray(point) && point.length === 3, `${label}的点必须包含 X/Y/Z 三个坐标。`);
        return point.map(value => number(value, `${label}坐标`));
      }),
    };
  });
  const areas = list(data.areas, "面积数据").map((raw, index) => {
    const label = `第 ${index + 1} 个面积`;
    return {
      ...sectionIdentity(raw, label),
      area: number(raw.area, label),
      row: integer(raw.row, 1, `${label}行号`),
      column: integer(raw.column, 1, `${label}列号`),
    };
  });
  const draft = project.draft === true && allowDraft;
  requireValue(draft || (contours.length > 0 && areas.length > 0), "计算项目缺少轮廓或面积数据。");
  const axes = {};
  for (const [nozzle, axis] of Object.entries(object(data.axes, "轴线设置"))) {
    requireValue(/^[1-9]\d*$/.test(nozzle) && Number.isSafeInteger(Number(nozzle)), "轴线喷嘴编号无效。");
    object(axis, `PZ${nozzle} 轴线`);
    axes[nozzle] = {};
    for (const key of axisKeys) {
      if (!Object.hasOwn(axis, key)) continue;
      const value = axis[key];
      requireValue(value === null || (typeof value === "string" && (value.trim() === "" || Number.isFinite(Number(value)))) ||
        (typeof value === "number" && Number.isFinite(value)), `PZ${nozzle} 轴线坐标无效。`);
      axes[nozzle][key] = value;
    }
  }
  const calculation = draft ? {results: [], warnings: [], errors: []} : calculateDeviation(contours, areas, axes);
  requireValue(draft || calculation.results.length > 0, "项目中没有可恢复的有效计算结果，请核对轴线和数据。");
  requireValue(sameValue(project.calculation, calculation), "保存的结果与轮廓、面积或轴线不一致，项目可能已被修改或损坏，未覆盖当前数据。");
  const sourceWarnings = object(project.sourceWarnings, "导入检查信息");
  const view = object(project.view, "绘图设置");
  requireValue(["percent", "coefficient"].includes(view.chartMode), "项目纵轴显示方式无效。");
  const nozzles = new Set(calculation.results.map(row => row.nozzle));
  const visibleNozzles = list(view.visibleNozzles, "显示喷嘴");
  requireValue(visibleNozzles.every(nozzle => nozzles.has(nozzle)) && new Set(visibleNozzles).size === visibleNozzles.length, "项目显示喷嘴设置无效。");
  requireValue(view.nozzleFilter === "all" || (typeof view.nozzleFilter === "string" && String(Number(view.nozzleFilter)) === view.nozzleFilter && nozzles.has(Number(view.nozzleFilter))), "项目结果筛选设置无效。");
  return {
    savedAt: project.savedAt,
    state: {
      contours, areas, axes,
      contourName: text(sources.contourName, "轮廓文件名"),
      areaName: text(sources.areaName, "面积文件名"),
      areaSheetName: text(sources.areaSheetName, "面积工作表名"),
      contourWarnings: messages(sourceWarnings.contours, "轮廓检查信息"),
      areaWarnings: messages(sourceWarnings.areas, "面积检查信息"),
      results: calculation.results,
      resultWarnings: calculation.warnings,
      resultErrors: calculation.errors,
    },
    view: { chartMode: view.chartMode, visibleNozzles: [...visibleNozzles], nozzleFilter: view.nozzleFilter },
  };
}

export function serializeRoundnessProject(state, view, savedAt = new Date().toISOString(), { allowDraft = false } = {}) {
  const draft = allowDraft && !state.results.length;
  const project = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    ...(draft ? {draft:true} : {}),
    calculationVersion: 1,
    savedAt,
    units: { coordinates: "m", area: "m²" },
    sources: { contourName: state.contourName, areaName: state.areaName, areaSheetName: state.areaSheetName || "" },
    data: { contours: state.contours, areas: state.areas, axes: state.axes },
    sourceWarnings: { contours: state.contourWarnings, areas: state.areaWarnings },
    calculation: draft ? {results:[],warnings:[],errors:[]} : { results: state.results, warnings: state.resultWarnings, errors: state.resultErrors },
    view,
  };
  const serialized = JSON.stringify(project);
  // Save only a self-contained, restorable state. This also detects stale results.
  readRoundnessProject(serialized, {allowDraft});
  requireValue(new Blob([serialized]).size <= MAX_PROJECT_BYTES, "项目文件超过 256 MB，请按喷嘴或截面分组保存。");
  return serialized;
}
