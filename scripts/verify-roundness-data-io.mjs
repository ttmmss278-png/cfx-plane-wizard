import assert from "node:assert/strict";
import XLSX from "xlsx";
import { readDataFile, parseContourRows, chartCoordinateRows, chartCoordinateWorkbook } from "../public/modules/roundness-deviation/data-io.js";

const points = [[2, 0, 0], [0, 1, 0], [-2, 0, 0], [0, -1, 0]];
const namedRows = [["轮廓名称", "X [m]", "Y [m]", "Z [m]"], ...points.map(point => ["Polyline pz1 05", ...point])];
const splitRows = [["喷嘴", "截面", "X", "Y", "Z"], ...points.map(point => ["PZ1", 10, ...point])];
assert.equal(parseContourRows(splitRows).contours[0].section, 10);
assert.equal(parseContourRows(namedRows).contours[0].section, 0.5);
assert.equal(parseContourRows([["X", "Y", "Z"], ...points], "Polyline pz2 30").contours[0].section, 3);
assert.equal(parseContourRows([["X", "Y", "Z"], ...points]).contours.length, 0);
assert.equal(parseContourRows([...namedRows, ["Polyline pz1 05", "", 1, 2]]).contours[0].invalidRows, 1);
assert.equal(parseContourRows([...namedRows, ...points.map(point => ["Polyline pz1 0.5", ...point])]).contours.length, 2);

const blocks = [["[Name]"], ["Polyline pz1 05"], ["[Data]"], ["X [ m ]", "Y [ m ]", "Z [ m ]"], ...points];
const areaRows = [[null, "PZ1", "PZ2"], [0.5, 3.125, 2], [1, 3, 4]];
function fileFromRows(rows, extension) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "数据");
  if (/xls/.test(extension)) {
    const bytes = XLSX.write(workbook, { type: "array", bookType: extension });
    return { name: `data.${extension}`, arrayBuffer: async () => bytes };
  }
  const content = XLSX.utils.sheet_to_csv(sheet, { FS: extension === "txt" ? "\t" : "," });
  return { name: `data.${extension}`, text: async () => content };
}

for (const extension of ["csv", "txt", "xlsx", "xls"]) {
  for (const rows of [namedRows, blocks]) {
    const parsed = await readDataFile(fileFromRows(rows, extension), "contour", XLSX);
    assert.equal(parsed.contours.length, 1, `${extension} contour`);
    assert.deepEqual(parsed.contours[0].points, points);
    assert.equal(parsed.contours[0].section, 0.5);
  }
  const parsed = await readDataFile(fileFromRows(areaRows, extension), "area", XLSX);
  assert.equal(parsed.entries.length, 4, `${extension} area`);
  assert.equal(parsed.entries[0].area, 3.125);
}
for (const delimiter of [" ", ";", "\t", ","]) {
  const content = [["截面", "PZ1", "PZ2"], [0.5, 3, 4]].map(row => row.join(delimiter)).join("\n");
  assert.equal((await readDataFile({ name: "area.txt", text: async () => content }, "area", XLSX)).entries.length, 2);
}
const quoted = '"轮廓名称","X","Y","Z"\n' + points.map(point => `"Polyline pz1 05",${point.join(",")}`).join("\n");
assert.equal((await readDataFile({ name: "quoted.csv", text: async () => quoted }, "contour", XLSX)).contours.length, 1);
const quotedBlocks = '[Name]\nPolyline pz1 05\n[Data]\nX,Y,Z\n' + points.map(point => point.map(value => `"${value}"`).join(',')).join('\n');
assert.equal((await readDataFile({ name: "quoted-blocks.csv", text: async () => quotedBlocks }, "contour", XLSX)).contours[0].points.length, 4);

const results = [
  { nozzle: 2, section: 1, deviationPct: 30 },
  { nozzle: 1, section: 0.5, deviationPct: 0 },
  { nozzle: 1, section: 1, deviationPct: 12.3456789 },
];
const rows = chartCoordinateRows(results, [2, 1]);
assert.deepEqual(rows, [["截面 X/D", "PZ1", "PZ2"], [0.5, 0, null], [1, 0.123456789, 0.3]]);
assert.deepEqual(chartCoordinateRows(results, [2]), [["截面 X/D", "PZ2"], [1, 0.3]]);
assert.deepEqual(chartCoordinateRows(results, []), []);
assert.equal(chartCoordinateWorkbook(results, [], XLSX), null);
const workbook = chartCoordinateWorkbook(results, [2, 1], XLSX);
const roundtrip = XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), { cellNF: true, cellStyles: true });
assert.deepEqual(roundtrip.SheetNames, ["曲线坐标_C"]);
const sheet = roundtrip.Sheets[roundtrip.SheetNames[0]];
assert.equal(sheet.A3.w, "1.0");
assert.equal(sheet.A3.t, "n");
assert.equal(sheet.B2.v, 0);
assert.equal(sheet.C2, undefined);
assert.equal(sheet.C3.v, 0.3);
assert.ok(!sheet.C3.z.includes("%"));
assert.ok(sheet["!cols"].every(col => col.wch >= 16));
assert.deepEqual(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }), rows);
console.log("Roundness data IO: CSV/TXT/XLSX/XLS contours + areas; blocks/tables; numeric C export; missing/zero/precision/column widths passed.");
