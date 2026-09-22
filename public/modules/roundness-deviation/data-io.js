import { parseAreaRows, parseContourText, sectionKey, sectionValueFromNameToken } from "./calculation-core.js";

const namePattern = /\bpz\s*(\d+)\s+([0-9]+(?:\.[0-9]+)?)/i;
const text = value => String(value ?? "").trim();
const number = value => (typeof value === "number" || typeof value === "string") && text(value) !== "" && Number.isFinite(Number(value)) ? Number(value) : null;

// Excel can contain the original CFX blocks or a point table with explicit labels.
export function parseContourRows(rows, sheetName = "") {
  if (rows.some(row => /^\[name\]$/i.test(text(row[0])))) {
    return parseContourText(rows.map(row => {
      const values = [...row];
      while (values.length && text(values.at(-1)) === "") values.pop();
      return values.join(",");
    }).join("\n"));
  }
  const warnings = [];
  const headerIndex = rows.findIndex(row => ["X", "Y", "Z"].every(axis =>
    row.some(value => new RegExp(`^${axis}(?:$|\\s|\\[|\\()`, "i").test(text(value)))
  ));
  if (headerIndex < 0) return { contours: [], warnings: ["未找到轮廓数据块或 X/Y/Z 坐标表头。"] };
  const header = rows[headerIndex].map(text);
  const xyz = ["X", "Y", "Z"].map(axis => header.findIndex(value => new RegExp(`^${axis}(?:$|\\s|\\[|\\()`, "i").test(value)));
  const nameColumn = header.findIndex(value => /^(轮廓名称|轮廓|name|polyline)$/i.test(value));
  const nozzleColumn = header.findIndex(value => /^(喷嘴|喷嘴号|nozzle|pz)$/i.test(value));
  const sectionColumn = header.findIndex(value => /^(截面|截面位置(?:D|\s*X\/D)?|section|X\/D)$/i.test(value));
  const sheetMatch = namePattern.exec(sheetName);
  if (nameColumn < 0 && !(nozzleColumn >= 0 && sectionColumn >= 0) && !sheetMatch) {
    return { contours: [], warnings: ["坐标表需包含“轮廓名称”列（如 Polyline pz1 05），或“喷嘴”和“截面”列。"] };
  }
  const groups = new Map();
  let unknownRows = 0;
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.some(value => text(value))) continue;
    let name = nameColumn >= 0 ? text(row[nameColumn]) : sheetName;
    const match = nameColumn >= 0 ? namePattern.exec(name) : sheetMatch;
    const nozzle = match ? Number(match[1]) : Number(text(row[nozzleColumn]).replace(/^PZ\s*/i, ""));
    // A dedicated section column stores X/D directly: 10 means 10D, not 1D.
    const section = match ? sectionValueFromNameToken(match[2]) : number(text(row[sectionColumn]).replace(/D$/i, ""));
    if (!Number.isInteger(nozzle) || nozzle <= 0 || section === null || section < 0 || (nameColumn >= 0 && !match)) {
      unknownRows += 1;
      continue;
    }
    if (!match) name = `Polyline pz${nozzle} ${section.toFixed(1)}`;
    const key = sectionKey(nozzle, section);
    // Distinct names for the same section are duplicates, not extra points to merge.
    const groupKey = `${key}\0${name}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { key, name, nozzle, section, sectionToken: match?.[2] ?? String(section), points: [], invalidRows: 0 });
    const group = groups.get(groupKey);
    const point = xyz.map(column => number(row[column]));
    if (point.every(value => value !== null)) group.points.push(point);
    else group.invalidRows += 1;
  }
  const contours = [], seen = new Set();
  for (const group of groups.values()) {
    if (group.points.length < 3) warnings.push(`“${group.name}”仅有 ${group.points.length} 个有效点，至少需要 3 个点，已跳过。`);
    else {
      if (seen.has(group.key)) warnings.push(`喷嘴 ${group.nozzle} 的 ${group.section}D 截面重复。`);
      seen.add(group.key);
      contours.push(group);
      if (group.invalidRows) warnings.push(`“${group.name}”有 ${group.invalidRows} 行无效坐标，已忽略。`);
    }
  }
  if (unknownRows) warnings.push(`${unknownRows} 行无法识别喷嘴号或截面位置，已跳过。`);
  if (!contours.length) warnings.push("未读取到有效轮廓点。");
  return { contours, warnings };
}

export async function readDataFile(file, kind, XLSX) {
  if (!XLSX) throw new Error("文件解析组件未加载，请刷新页面重试。");
  const isExcel = /\.xlsx?$/i.test(file.name);
  let workbook;
  if (isExcel) {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: true, cellText: false });
  } else {
    const source = (await file.text()).replace(/^\uFEFF/, "");
    if (kind === "contour" && !source.includes('"') && /^\s*\[Name\]\s*$/im.test(source)) return parseContourText(source);
    // SheetJS handles quoting and comma/tab/semicolon delimiters; plain TXT may use spaces.
    if (!/[,;\t]/.test(source)) {
      const rows = source.split(/\r?\n/).filter(line => line.trim()).map(line => line.trim().split(/\s+/));
      return kind === "area" ? parseAreaRows(rows) : parseContourRows(rows);
    }
    workbook = XLSX.read(source, { type: "string", raw: true, cellText: false });
  }
  if (kind === "contour") {
    const contours = [], warnings = [], seen = new Set();
    for (const sheetName of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });
      if (!rows.some(row => row.some(value => text(value)))) continue;
      const parsed = parseContourRows(rows, sheetName);
      for (const contour of parsed.contours) {
        if (seen.has(contour.key)) warnings.push(`喷嘴 ${contour.nozzle} 的 ${contour.section}D 截面跨工作表重复。`);
        seen.add(contour.key);
        contours.push(contour);
      }
      warnings.push(...parsed.warnings.map(warning => `${sheetName}：${warning}`));
    }
    if (!contours.length && !warnings.length) warnings.push("文件中没有有效轮廓数据。");
    return { contours, warnings };
  }
  let best = { entries: [], warnings: ["没有找到有效的面积工作表。"] };
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });
    const parsed = parseAreaRows(rows);
    if (parsed.entries.length > best.entries.length) best = { ...parsed, sheetName: isExcel ? sheetName : "" };
  }
  return best;
}

export function chartCoordinateRows(results, visibleNozzles) {
  const selected = new Set(visibleNozzles);
  const rows = results.filter(row => selected.has(row.nozzle) && Number.isFinite(row.section) && Number.isFinite(row.deviationPct));
  const nozzles = [...new Set(rows.map(row => row.nozzle))].sort((a, b) => a - b);
  if (!nozzles.length) return [];
  const sections = [...new Set(rows.map(row => row.section))].sort((a, b) => a - b);
  const values = new Map(rows.map(row => [sectionKey(row.nozzle, row.section), row.deviationPct / 100]));
  return [["截面 X/D", ...nozzles.map(nozzle => `PZ${nozzle}`)], ...sections.map(section =>
    [section, ...nozzles.map(nozzle => values.get(sectionKey(nozzle, section)) ?? null)]
  )];
}

export function chartCoordinateWorkbook(results, visibleNozzles, XLSX) {
  const rows = chartCoordinateRows(results, visibleNozzles);
  if (!rows.length) return null;
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = rows[0].map((_, index) => ({ wch: index ? 18 : 16 }));
  for (let r = 1; r < rows.length; r += 1) {
    for (let c = 0; c < rows[0].length; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.z = c === 0 ? "0.0########" : "0.000000#########";
    }
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "曲线坐标_C");
  return workbook;
}
