export const keyOf = (nozzle, section) => `${nozzle}:${section}`;
export const sectionLabel = value => Number.isInteger(value * 10) ? value.toFixed(1) : String(value);
const fail = message => { throw new Error(message); };
const numeric = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value));

export function validateRows(rows, kind) {
  if (!Array.isArray(rows)) fail('数据应为数组。');
  const seen = new Set();
  return rows.map(row => {
    if (!row || !Number.isSafeInteger(row.nozzle) || row.nozzle < 1 || !Number.isFinite(row.section) || row.section < 0 || !Number.isFinite(row.value) || row.value < 0) fail('喷嘴、截面或数值无效。');
    if (kind === 'uniformity' && row.value > 1) fail(`PZ${row.nozzle} / ${row.section}：速度均匀性应为 0～1 的系数，不是百分数。`);
    const key = keyOf(row.nozzle, row.section);
    if (seen.has(key)) fail(`PZ${row.nozzle} / ${row.section} 截面重复。`);
    seen.add(key);
    return {nozzle:row.nozzle, section:row.section, value:row.value};
  }).sort((a,b) => a.section-b.section || a.nozzle-b.nozzle);
}

export function parseMetricRows(rows, kind, sheet = '') {
  const headerIndex = rows.findIndex(row => row.some(value => /^PZ\s*\d+$/i.test(String(value ?? '').trim())));
  if (headerIndex < 0) fail(`${sheet}：未找到 PZ1、PZ2… 喷嘴表头。`);
  if (/^PZ\s*\d+$/i.test(String(rows[headerIndex][0]).trim())) rows = rows.map((row,i)=>i===headerIndex?['',...row]:row);
  const columns = [];
  const nozzles = new Set();
  rows[headerIndex].forEach((value, index) => {
    if (index === 0 || value == null || String(value).trim() === '') return;
    const match = /^PZ\s*([1-9]\d*)$/i.exec(String(value).trim());
    if (!match) fail(`${sheet}：第 ${index+1} 列不是喷嘴表头。`);
    const nozzle = Number(match[1]);
    if (nozzles.has(nozzle)) fail(`${sheet}：PZ${nozzle} 表头重复。`);
    nozzles.add(nozzle); columns.push({index,nozzle});
  });
  const result = [];
  for (let r = headerIndex+1; r < rows.length; r++) {
    const row = rows[r];
    if (!row.some(value => value != null && String(value).trim() !== '')) continue;
    if (!numeric(row[0]) || Number(row[0]) < 0) fail(`${sheet}：第 ${r+1} 行截面 X/D 无效。`);
    if (row.some((value,index)=>index>0 && value!=null && String(value).trim()!=='' && !columns.some(column=>column.index===index))) fail(`${sheet}：第 ${r+1} 行有未对应喷嘴表头的数据列。`);
    for (const {index,nozzle} of columns) {
      if (!numeric(row[index])) fail(`${sheet}：第 ${r+1} 行 PZ${nozzle} 缺少有效数值，不能按 0 处理。`);
      result.push({nozzle,section:Number(row[0]),value:Number(row[index])});
    }
  }
  if (!result.length) fail(`${sheet}：没有有效截面数据。`);
  return validateRows(result,kind);
}

export async function readMetricFile(file, kind, XLSX) {
  if (file.size > 32*1024*1024) fail('指标文件超过 32 MB，请分组导入。');
  let book;
  if (/\.xlsx?$/i.test(file.name)) book = XLSX.read(await file.arrayBuffer(), {type:'array', raw:true});
  else {
    const source = (await file.text()).replace(/^\uFEFF/,'');
    if (!/[,;\t]/.test(source)) return parseMetricRows(source.split(/\r?\n/).map(line=>line.trim().split(/\s+/)),kind,file.name);
    book = XLSX.read(source,{type:'string',raw:true});
  }
  const rows = [];
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null});
    if (!data.some(row=>row.some(value=>value != null && String(value).trim() !== ''))) continue;
    // These source files contain raw metres / coefficients, never formatted percentages.
    if (Object.entries(sheet).some(([key,cell]) => !key.startsWith('!') && cell?.t === 'e')) fail(`${name} 包含 Excel 错误单元格。`);
    rows.push(...parseMetricRows(data,kind,name));
  }
  if (!rows.length) fail('文件没有有效数据。');
  return validateRows(rows,kind);
}

export function offsetRows(rows, diameter, unit) {
  if (!numeric(diameter) || Number(diameter) <= 0 || !['m','mm'].includes(unit)) fail('请输入大于 0 的喷嘴直径，并选择 m 或 mm。');
  const metres = Number(diameter) * (unit === 'mm' ? 0.001 : 1);
  return validateRows(rows,'offset').map(row => {
    const value = row.value / metres * 100;
    if (!Number.isFinite(value)) fail('偏移度超出数值范围，请核对直径。');
    return {...row, value};
  });
}

export function coordinateRows(rows, visible = null) {
  const filtered = visible == null ? rows : rows.filter(row=>visible.includes(row.nozzle));
  const nozzles = [...new Set(filtered.map(row=>row.nozzle))].sort((a,b)=>a-b);
  const sections = [...new Set(filtered.map(row=>row.section))].sort((a,b)=>a-b);
  const values = new Map(filtered.map(row=>[keyOf(row.nozzle,row.section),row.value]));
  return [['截面 X/D',...nozzles.map(n=>`PZ${n}`)],...sections.map(s=>[s,...nozzles.map(n=>values.get(keyOf(n,s)) ?? null)])];
}

export function mergeIndicators(roundness, offset, uniformity, previous = {}) {
  const datasets = [validateRows(uniformity,'uniformity'),validateRows(roundness,'roundness'),validateRows(offset,'offset')];
  const names = ['速度均匀性','偏离圆度','射流偏移度'];
  if (datasets.some(rows=>!rows.length)) fail('请先完成三个指标；或直接进入综合评价导入其他数据。');
  const nozzles = [...new Set(datasets.flatMap(rows=>rows.map(row=>row.nozzle)))].sort((a,b)=>a-b);
  const positions = [...new Set(datasets.flatMap(rows=>rows.map(row=>row.section)))].sort((a,b)=>a-b);
  const maps = datasets.map(rows=>new Map(rows.map(row=>[keyOf(row.nozzle,row.section),row.value])));
  for (const n of nozzles) for (const s of positions) maps.forEach((map,i)=>{if (!map.has(keyOf(n,s))) fail(`${names[i]}缺少 PZ${n} / ${s} 截面，请补齐后汇总。`);});
  const indicators = ['uniformity','deformation','offset'].map((id,i) => {
    const old = previous.indicators?.find(item=>item.id===id);
    return {id,name:names[i],direction:i===0?'benefit':'cost',worst:old?.worst ?? (i===0?0:1),best:old?.best ?? (i===0?1:0),weight:old?.weight ?? 1,unit:'—'};
  });
  const sections = positions.map(s => {
    const old = previous.sections?.find(item => Number(String(item.position).replace(/^.*?=\s*/,''))===s);
    return {id:`section-${s}`,name:`${sectionLabel(s)}D`,position:`X/D = ${s}`,weight:old?.weight ?? 1};
  });
  const alternatives = nozzles.map(n => ({id:`nozzle-${n}`,name:`PZ${n}`,values:Object.fromEntries(positions.flatMap((s,j)=>indicators.map((ind,i)=>[`${sections[j].id}:${ind.id}`,maps[i].get(keyOf(n,s)) / (i===0?1:100)])))}));
  return {projectName:previous.projectName || '射流质量评价',mode:previous.mode || 'relative',indicators,sections,alternatives,
    referenceId:alternatives.some(a=>a.id===previous.referenceId)?previous.referenceId:alternatives[0].id,
    level1WeightMethod:previous.level1WeightMethod || 'entropy',level2WeightMethod:previous.level2WeightMethod || 'equal'};
}
