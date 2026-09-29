import assert from 'node:assert/strict';
import XLSX from 'xlsx';

const filename = process.argv[2];
if (!filename) throw new Error('Provide an exported .xlsx file path.');

const workbook = XLSX.readFile(filename);
assert.deepEqual(workbook.SheetNames, ['喷针开度']);
const sheet = workbook.Sheets['喷针开度'];
assert.equal(sheet['!ref'], 'A1:E3');
assert.equal(sheet['!autofilter']?.ref, 'A1:E3');
assert.deepEqual(
  ['A1', 'B1', 'C1', 'D1', 'E1'].map((address) => sheet[address].v),
  ['序号', '最大移动距离 (mm)', '移动距离 (mm)', '喷针开度 (%)', '开度系数'],
);
assert.deepEqual(
  ['A2', 'B2', 'C2', 'D2', 'E2'].map((address) => sheet[address].v),
  [1, 80, 36, 45, 0.45],
);
assert.deepEqual(
  ['A3', 'B3', 'C3', 'D3', 'E3'].map((address) => sheet[address].v),
  [2, 80, 50, 62.5, 0.625],
);
for (const address of ['A2', 'B2', 'C2', 'D2', 'E2', 'A3', 'B3', 'C3', 'D3', 'E3']) {
  assert.equal(sheet[address].t, 'n', `${address} should be numeric`);
}
for (const column of sheet['!cols'] ?? []) assert.ok(column.wch > 0);

console.log('Exported Excel: sheet, headers, column widths, autofilter, numeric types and both calculations passed.');
