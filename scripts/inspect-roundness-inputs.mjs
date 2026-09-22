import fs from "node:fs/promises";
import XLSX from "xlsx";
import { parseAreaRows, parseContourText, polygonStats } from "../public/modules/roundness-deviation/calculation-core.js";

const [contourPath, areaPath] = process.argv.slice(2);
if (!contourPath || !areaPath) {
  console.error("用法: node scripts/inspect-roundness-inputs.mjs <轮廓.csv> <面积.xlsx>");
  process.exit(2);
}

const contours = parseContourText(await fs.readFile(contourPath, "utf8"));
const workbook = XLSX.read(await fs.readFile(areaPath), { type: "buffer", raw: true });
const candidates = workbook.SheetNames.map((name) => ({
  name,
  parsed: parseAreaRows(XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: null })),
}));
candidates.sort((a, b) => b.parsed.entries.length - a.parsed.entries.length);
const selected = candidates[0];
const areaByKey = new Map(selected.parsed.entries.map((entry) => [entry.key, entry.area]));
const unmatchedContours = contours.contours.filter((item) => !areaByKey.has(item.key));
const contourKeys = new Set(contours.contours.map((item) => item.key));
const unmatchedAreas = selected.parsed.entries.filter((item) => !contourKeys.has(item.key));
const areaDifferenceOverFivePct = contours.contours.flatMap((item) => {
  const listedArea = areaByKey.get(item.key);
  if (!(listedArea > 0)) return [];
  const polygonArea = polygonStats(item.points)?.area;
  const deltaPct = (polygonArea / listedArea - 1) * 100;
  return Math.abs(deltaPct) > 5
    ? [{ name: item.name, polygonArea, listedArea, deltaPct }]
    : [];
});

console.log(JSON.stringify({
  contourCount: contours.contours.length,
  nozzleCount: new Set(contours.contours.map((item) => item.nozzle)).size,
  areaCount: selected.parsed.entries.length,
  areaSheet: selected.name,
  minPoints: Math.min(...contours.contours.map((item) => item.points.length)),
  maxPoints: Math.max(...contours.contours.map((item) => item.points.length)),
  unmatchedContours: unmatchedContours.map((item) => item.name),
  unmatchedAreas: unmatchedAreas.map((item) => `PZ${item.nozzle} ${item.section}D`),
  areaDifferenceOverFivePct,
  parseWarnings: [...contours.warnings, ...selected.parsed.warnings],
}, null, 2));

if (!contours.contours.length || !selected.parsed.entries.length || unmatchedContours.length || unmatchedAreas.length) {
  process.exitCode = 1;
}
