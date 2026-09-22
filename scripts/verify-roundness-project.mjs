import assert from "node:assert/strict";
import { calculateDeviation, sectionKey } from "../public/modules/roundness-deviation/calculation-core.js";
import { readRoundnessProject, serializeRoundnessProject } from "../public/modules/roundness-deviation/project-file.js";

const contours = [1, 7].flatMap(nozzle => [0.5, 1].map(section => ({
  key: sectionKey(nozzle, section), nozzle, section, name: `Polyline pz${nozzle} ${section.toFixed(1)}`,
  sectionToken: section.toFixed(1), invalidRows: 0,
  points: [[2, 0, section], [0, 1, section], [-2, 0, section], [0, -1, section]],
})));
const areas = contours.map((contour, index) => ({ key: contour.key, nozzle: contour.nozzle, section: contour.section, area: 4, row: index + 2, column: 2 }));
const axes = { 1: { ax: "0", ay: "0", az: "0", bx: "0", by: "0", bz: "1" }, 7: { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 1 } };
const calculation = calculateDeviation(contours, areas, axes);
const state = { contours, areas, axes, contourName: "轮廓.csv", areaName: "面积.xlsx", areaSheetName: "Sheet1", contourWarnings: ["测试提示"], areaWarnings: [], results: calculation.results, resultWarnings: calculation.warnings, resultErrors: calculation.errors };
const view = { chartMode: "coefficient", visibleNozzles: [7], nozzleFilter: "1" };
const serialized = serializeRoundnessProject(state, view, "2026-09-22T00:00:00.000Z");
const restored = readRoundnessProject(serialized);
assert.deepEqual(restored.state, state);
assert.deepEqual(restored.view, view);
assert.deepEqual(readRoundnessProject("\uFEFF" + serialized).state, state);
const blankChart = { ...view, visibleNozzles: [], nozzleFilter: "all" };
assert.deepEqual(readRoundnessProject(serializeRoundnessProject(state, blankChart)).view, blankChart);

function rejects(mutate, expected) {
  const project = JSON.parse(serialized);
  mutate(project);
  assert.throws(() => readRoundnessProject(JSON.stringify(project)), expected);
}
assert.throws(() => readRoundnessProject("not json"), /有效的计算项目/);
assert.throws(() => readRoundnessProject("{}"), /不是偏离圆度/);
rejects(p => p.version = 100, /版本不受支持/);
rejects(p => p.calculationVersion = 100, /版本不受支持/);
rejects(p => p.units.area = "mm²", /单位/);
rejects(p => p.savedAt = "yesterday", /保存时间/);
rejects(p => p.data.contours[0].key = "7:1.0", /匹配编号不一致/);
rejects(p => p.data.contours[0].points[0] = [0, null, 1], /有效数值/);
rejects(p => p.data.contours[0].points[0] = [0, 1], /三个坐标/);
rejects(p => p.data.contours[0].points = [[0, 0, 0]], /至少需要三个点/);
rejects(p => p.data.areas[0].area = "4", /有效数值/);
rejects(p => p.data.axes[1].ax = false, /轴线坐标无效/);
rejects(p => p.data.axes = JSON.parse('{"__proto__":{"polluted":true}}'), /轴线喷嘴编号/);
assert.equal({}.polluted, undefined);
rejects(p => p.data.axes[1].bx = 20, /结果与轮廓、面积或轴线不一致/);
rejects(p => p.calculation.results[0].deviationPct += 1, /结果与轮廓、面积或轴线不一致/);
rejects(p => p.calculation.errors.push("fake"), /结果与轮廓、面积或轴线不一致/);
rejects(p => p.view.chartMode = "ratio", /纵轴/);
rejects(p => p.view.visibleNozzles = [3], /显示喷嘴/);
rejects(p => p.view.visibleNozzles = [1, 1], /显示喷嘴/);
rejects(p => p.view.nozzleFilter = "3", /结果筛选/);
assert.throws(() => serializeRoundnessProject({ ...state, results: [] }, view), /结果与轮廓、面积或轴线不一致/);

// Partially calculated sessions retain their unavailable inputs and diagnostics.
const partialAxes = { ...axes, 7: { ax: "", ay: null } };
const partialCalculation = calculateDeviation(contours, areas, partialAxes);
const partialState = { ...state, axes: partialAxes, results: partialCalculation.results, resultWarnings: partialCalculation.warnings, resultErrors: partialCalculation.errors };
assert.deepEqual(readRoundnessProject(serializeRoundnessProject(partialState, { ...view, visibleNozzles: [1] })).state, partialState);

// A growing contour is not truncated when saved/restored.
const densePoints = Array.from({ length: 150000 }, (_, index) => {
  const angle = index / 150000 * Math.PI * 2;
  return [2 * Math.cos(angle), Math.sin(angle), 0.5];
});
const denseContours = [{ ...contours[0], points: densePoints }];
const denseCalculation = calculateDeviation(denseContours, [areas[0]], axes);
const denseState = { ...state, contours: denseContours, areas: [areas[0]], results: denseCalculation.results, resultWarnings: denseCalculation.warnings, resultErrors: denseCalculation.errors };
const dense = readRoundnessProject(serializeRoundnessProject(denseState, { ...view, visibleNozzles: [1] }));
assert.equal(dense.state.contours[0].points.length, 150000);
assert.deepEqual(dense.state.contours[0].points[149999], densePoints[149999]);
assert.deepEqual(dense.state.results, denseState.results);
console.log("Roundness project: complete/partial/empty-chart round trips, extra nozzles, 150000 points, schema/units/version/tamper/prototype checks passed.");
