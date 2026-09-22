import assert from "node:assert/strict";
import { buildRoundnessChart, chartSeries, nozzleColor } from "../public/modules/roundness-deviation/chart.js";
import { axisDraftError } from "../public/modules/roundness-deviation/axis-settings.js";
import {
  calculateDeviation,
  distancePointToLine,
  parseAreaRows,
  parseContourText,
  sectionValueFromNameToken,
  summarizeByNozzle,
} from "../public/modules/roundness-deviation/calculation-core.js";

assert.equal(sectionValueFromNameToken("05"), 0.5);
assert.match(axisDraftError({}), /六个/);
assert.match(axisDraftError({ ax: "", ay: 0, az: 0, bx: 0, by: 0, bz: 1 }), /六个/);
assert.match(axisDraftError({ ax: Infinity, ay: 0, az: 0, bx: 0, by: 0, bz: 1 }), /六个/);
assert.match(axisDraftError({ ax: 1, ay: 2, az: 3, bx: 1, by: 2, bz: 3 }), /重合/);
assert.equal(axisDraftError({ ax: "0", ay: "0", az: "0", bx: "0", by: "0", bz: "1" }), "");
assert.equal(sectionValueFromNameToken("30"), 3);
assert.equal(sectionValueFromNameToken("3"), 3);
assert.equal(sectionValueFromNameToken("3.5"), 3.5);

const contourText = `
[Name]
Polyline pz1 05

[Data]
X [ m ], Y [ m ], Z [ m ]
1, 0, 0
0, 1, 0
-1, 0, 0
0, -1, 0

[Name]
Polyline pz2 30

[Data]
X [ m ], Y [ m ], Z [ m ]
2, 0, 0
0, 1, 0
-2, 0, 0
0, -1, 0
`;

const parsedContours = parseContourText(contourText);
assert.equal(parsedContours.contours.length, 2);
assert.equal(parsedContours.contours[0].section, 0.5);
assert.equal(parsedContours.contours[1].section, 3);
assert.equal(parsedContours.contours[1].points.length, 4);

const parsedAreas = parseAreaRows([
  [null, "PZ1", "PZ2"],
  [0.5, Math.PI, 4],
  [3, 7, Math.PI],
]);
assert.equal(parsedAreas.entries.length, 4);

const axes = {
  1: { ax: 0, ay: 0, az: -1, bx: 0, by: 0, bz: 1 },
  2: { ax: 0, ay: 0, az: -1, bx: 0, by: 0, bz: 1 },
};
const calculation = calculateDeviation(parsedContours.contours, parsedAreas.entries, axes);
assert.equal(calculation.errors.length, 0);
assert.equal(calculation.results.length, 2);
assert.ok(Math.abs(calculation.results[0].deviationPct) < 1e-10);
assert.ok(Math.abs(calculation.results[1].rMax - 2) < 1e-10);
assert.ok(Math.abs(calculation.results[1].rMin - 1) < 1e-10);
assert.ok(Math.abs(calculation.results[1].deviationPct - 100) < 1e-10);
assert.ok(Math.abs(distancePointToLine([1, 0, 0], [0, 0, -2], [0, 0, 2]) - 1) < 1e-10);

const summary = summarizeByNozzle(calculation.results);
assert.equal(summary.length, 2);
assert.equal(summary[1].maxSection, 3);

const invalidAxis = calculateDeviation(parsedContours.contours, parsedAreas.entries, {
  1: { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 },
});
assert.ok(invalidAxis.errors.some((message) => message.includes("两点重合")));
assert.ok(invalidAxis.errors.some((message) => message.includes("PZ2")));

const repeated = calculateDeviation(
  [parsedContours.contours[0], parsedContours.contours[0]],
  parsedAreas.entries,
  axes,
);
assert.equal(repeated.results.length, 0);
assert.ok(repeated.errors.some((message) => message.includes("重复轮廓或面积")));

const manyPoints = Array.from({ length: 150000 }, (_, index) => {
  const angle = index * 2 * Math.PI / 150000;
  return [Math.cos(angle), Math.sin(angle), 0];
});
const largeContour = { ...parsedContours.contours[0], points: manyPoints };
const largeResult = calculateDeviation([largeContour], parsedAreas.entries, axes);
assert.equal(largeResult.results[0].pointCount, 150000);
assert.ok(Math.abs(largeResult.results[0].deviationPct) < 1e-8);

console.log("roundness-deviation core verification passed");

const chartRows = [
  { nozzle: 2, section: 3, deviationPct: 46, warnings: [] },
  { nozzle: 1, section: 2, deviationPct: 20, warnings: ["<script>bad</script>"] },
  { nozzle: 1, section: 0.5, deviationPct: 5, warnings: [] },
];
const percentSeries = chartSeries(chartRows);
assert.deepEqual(percentSeries.map(group => group.nozzle), [1, 2]);
assert.deepEqual(percentSeries[0].points.map(point => point.x), [0.5, 2]);
assert.deepEqual(percentSeries[0].points.map(point => point.y), [5, 20]);
assert.equal(chartRows[0].nozzle, 2, "chart rendering must not mutate source order");
assert.equal(chartSeries(chartRows, "coefficient")[1].points[0].y, 0.46);
assert.equal(chartSeries(chartRows, "percent", [2]).length, 1);
assert.equal(chartSeries(chartRows, "percent", []).length, 0);
assert.equal(buildRoundnessChart(chartRows, { visibleNozzles: [] }), "");
const chartSvg = buildRoundnessChart(chartRows);
assert.equal((chartSvg.match(/class="chart-series"/g) || []).length, 2);
assert.equal((chartSvg.match(/class="curve-point"/g) || []).length, 3);
assert.ok(chartSvg.includes("&lt;script&gt;bad&lt;/script&gt;"));
assert.ok(!chartSvg.includes("<script>"));
assert.ok(chartSvg.includes("偏离圆度 (%)"));
const coefficientSvg = buildRoundnessChart(chartRows, { mode: "coefficient" });
assert.ok(coefficientSvg.includes('data-value="0.46"'));
assert.ok(coefficientSvg.includes("偏离圆度 C"));
for (const mode of ["percent", "coefficient"]) {
  for (const value of [0, 1e-9, 0.025, 10, 1e7]) {
    const svg = buildRoundnessChart([{ nozzle: 1, section: 0, deviationPct: value }], { mode });
    assert.ok(!/NaN|Infinity/.test(svg), `invalid chart scale: ${mode}, ${value}`);
    assert.equal((svg.match(/class="curve-point"/g) || []).length, 1);
  }
}
const futureSections = Array.from({ length: 2400 }, (_, i) => ({ nozzle: i % 8 + 1, section: Math.floor(i / 8) / 2 + 0.5, deviationPct: i / 50 }));
assert.equal(chartSeries(futureSections).length, 8);
assert.equal((buildRoundnessChart(futureSections).match(/class="curve-point"/g) || []).length, 2400);
assert.notEqual(nozzleColor(1), nozzleColor(7));
console.log("roundness-deviation chart verification passed (sorting, percent/C, filters, SVG escaping, zero/small/large values, 2400 points)");
