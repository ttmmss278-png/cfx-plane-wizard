import assert from "node:assert/strict";
import fs from "node:fs/promises";
import XLSX from "xlsx";

const outputPath = process.argv[2];
if (!outputPath) {
  console.error("用法: node scripts/inspect-roundness-output.mjs <结果.xlsx>");
  process.exit(2);
}

const workbook = XLSX.read(await fs.readFile(outputPath), { type: "buffer", raw: true });
assert.deepEqual(workbook.SheetNames, ["截面结果", "喷嘴汇总", "计算说明", "轴线坐标"]);
const detail = XLSX.utils.sheet_to_json(workbook.Sheets["截面结果"], { raw: true });
const summary = XLSX.utils.sheet_to_json(workbook.Sheets["喷嘴汇总"], { raw: true });
const axes = XLSX.utils.sheet_to_json(workbook.Sheets["轴线坐标"], { raw: true });
assert.ok(detail.length > 0);
assert.ok(summary.length > 0);
assert.ok(axes.length > 0);
detail.forEach((row) => {
  assert.equal(typeof row.截面面积_m2, "number");
  assert.equal(typeof row.最大半径_m, "number");
  assert.equal(typeof row.最小半径_m, "number");
  assert.equal(typeof row.偏离圆度_百分比, "number");
  assert.ok(row.截面面积_m2 > 0);
  assert.ok(Math.abs((row.最大半径_m - row.最小半径_m) / row.等面积圆半径_m * 100 - row.偏离圆度_百分比) < 1e-9);
});
console.log(JSON.stringify({ sheets: workbook.SheetNames, detailRows: detail.length, summaryRows: summary.length, axisRows: axes.length, keyCell: detail[0] }, null, 2));
