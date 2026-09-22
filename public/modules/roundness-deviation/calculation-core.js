const EPSILON = 1e-12;

function finiteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function splitDelimited(line) {
  if (line.includes(",")) return line.split(",");
  if (line.includes("\t")) return line.split("\t");
  if (line.includes(";")) return line.split(";");
  return line.trim().split(/\s+/);
}

export function sectionValueFromNameToken(rawToken) {
  const token = String(rawToken ?? "").trim();
  const value = Number(token);
  if (!Number.isFinite(value)) return null;
  if (token.includes(".")) return value;
  return token.length >= 2 || token.startsWith("0") ? value / 10 : value;
}

export function sectionKey(nozzle, section) {
  return `${Number(nozzle)}:${Number(section).toFixed(9)}`;
}

export function parseContourText(sourceText) {
  const lines = String(sourceText ?? "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const contours = [];
  const warnings = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim().toLowerCase() !== "[name]") continue;

    let nameIndex = index + 1;
    while (nameIndex < lines.length && !lines[nameIndex].trim()) nameIndex += 1;
    const name = lines[nameIndex]?.trim() || "";
    let dataIndex = nameIndex + 1;
    while (dataIndex < lines.length && lines[dataIndex].trim().toLowerCase() !== "[data]") {
      if (lines[dataIndex].trim().toLowerCase() === "[name]") break;
      dataIndex += 1;
    }
    if (dataIndex >= lines.length || lines[dataIndex].trim().toLowerCase() !== "[data]") {
      warnings.push(`“${name || `第 ${index + 1} 行`}”缺少 [Data] 标记，已跳过。`);
      continue;
    }

    let headerIndex = dataIndex + 1;
    while (headerIndex < lines.length && !lines[headerIndex].trim()) headerIndex += 1;
    const headerParts = splitDelimited(lines[headerIndex] || "").map((item) => item.trim().toUpperCase());
    const coordinateIndex = ["X", "Y", "Z"].map((axis, fallback) => {
      const found = headerParts.findIndex((item) => new RegExp(`^${axis}(?:\\s|\\[|$)`).test(item));
      return found >= 0 ? found : fallback;
    });

    const nameMatch = /\bpz\s*(\d+)\s+([0-9]+(?:\.[0-9]+)?)/i.exec(name);
    if (!nameMatch) {
      warnings.push(`名称“${name}”无法识别喷嘴号和截面位置，已跳过。`);
      continue;
    }
    const nozzle = Number(nameMatch[1]);
    const section = sectionValueFromNameToken(nameMatch[2]);
    if (!Number.isFinite(nozzle) || section === null) {
      warnings.push(`名称“${name}”中的喷嘴号或截面位置无效，已跳过。`);
      continue;
    }

    const points = [];
    let invalidRows = 0;
    let row = headerIndex + 1;
    for (; row < lines.length; row += 1) {
      const trimmed = lines[row].trim();
      if (/^\[name\]$/i.test(trimmed)) break;
      if (!trimmed || trimmed.startsWith("[")) continue;
      const parts = splitDelimited(trimmed);
      const point = coordinateIndex.map((column) => finiteNumber(parts[column]));
      if (point.every((value) => value !== null)) points.push(point);
      else invalidRows += 1;
    }

    if (points.length < 3) {
      warnings.push(`“${name}”仅有 ${points.length} 个有效点，至少需要 3 个点，已跳过。`);
    } else {
      contours.push({
        name,
        nozzle,
        section,
        sectionToken: nameMatch[2],
        points,
        invalidRows,
        key: sectionKey(nozzle, section),
      });
      if (invalidRows > 0) warnings.push(`“${name}”有 ${invalidRows} 行无效坐标，已忽略。`);
    }
    index = Math.max(index, row - 1);
  }

  const seen = new Set();
  contours.forEach((contour) => {
    if (seen.has(contour.key)) warnings.push(`喷嘴 ${contour.nozzle} 的 ${contour.section}D 截面重复。`);
    seen.add(contour.key);
  });

  if (contours.length === 0) warnings.push("未识别到有效的 [Name] / [Data] 轮廓数据块。");
  return { contours, warnings };
}

function parseSectionCell(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const match = /[-+]?\d*\.?\d+/.exec(value.replace(/D/gi, ""));
  return match ? finiteNumber(match[0]) : null;
}

export function parseAreaRows(rows) {
  const matrix = Array.isArray(rows) ? rows : [];
  const warnings = [];
  let headerRow = -1;
  let nozzleColumns = [];

  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const candidates = (matrix[rowIndex] || []).map((value, column) => {
      const match = /^\s*PZ\s*(\d+)\s*$/i.exec(String(value ?? ""));
      return match ? { column, nozzle: Number(match[1]) } : null;
    }).filter(Boolean);
    if (candidates.length > 0) {
      headerRow = rowIndex;
      nozzleColumns = candidates;
      break;
    }
  }

  if (headerRow < 0) {
    return { entries: [], warnings: ["面积表中未找到 PZ1、PZ2…喷嘴列。"] };
  }

  const occupiedColumns = new Set(nozzleColumns.map((item) => item.column));
  let sectionColumn = (matrix[headerRow] || []).findIndex((_, column) => !occupiedColumns.has(column));
  if (sectionColumn < 0) sectionColumn = 0;

  const entries = [];
  const seen = new Set();
  for (let rowIndex = headerRow + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    const section = parseSectionCell(row[sectionColumn]);
    if (section === null) {
      if (row.some((value) => String(value ?? "").trim() !== "")) {
        warnings.push(`面积表第 ${rowIndex + 1} 行无法识别截面位置，已跳过。`);
      }
      continue;
    }

    nozzleColumns.forEach(({ column, nozzle }) => {
      const area = finiteNumber(row[column]);
      if (area === null) return;
      const key = sectionKey(nozzle, section);
      if (seen.has(key)) warnings.push(`面积表中喷嘴 ${nozzle} 的 ${section}D 截面重复。`);
      seen.add(key);
      entries.push({ key, nozzle, section, area, row: rowIndex + 1, column: column + 1 });
    });
  }

  if (entries.length === 0) warnings.push("面积表中没有读取到有效面积数值。");
  return { entries, warnings };
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(vector) {
  return Math.sqrt(dot(vector, vector));
}

function scale(vector, factor) {
  return vector.map((value) => value * factor);
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function distancePointToLine(point, lineA, lineB) {
  const direction = subtract(lineB, lineA);
  const directionLength = length(direction);
  if (directionLength <= EPSILON) return null;
  return length(cross(subtract(point, lineA), direction)) / directionLength;
}

export function polygonStats(points) {
  if (!Array.isArray(points) || points.length < 3) return null;
  let areaVector = [0, 0, 0];
  let center = [0, 0, 0];
  points.forEach((point, index) => {
    center = add(center, point);
    areaVector = add(areaVector, cross(point, points[(index + 1) % points.length]));
  });
  center = scale(center, 1 / points.length);
  areaVector = scale(areaVector, 0.5);
  const area = length(areaVector);
  const normal = area > EPSILON ? scale(areaVector, 1 / area) : null;
  let maxPlaneResidual = null;
  if (normal) {
    maxPlaneResidual = 0;
    points.forEach((point) => {
      const residual = Math.abs(dot(subtract(point, center), normal));
      if (residual > maxPlaneResidual) maxPlaneResidual = residual;
    });
  }
  return { area, normal, center, maxPlaneResidual };
}

function normalizeAxis(rawAxis) {
  const values = [rawAxis?.ax, rawAxis?.ay, rawAxis?.az, rawAxis?.bx, rawAxis?.by, rawAxis?.bz]
    .map((value) => finiteNumber(value));
  if (values.some((value) => value === null)) return null;
  return { a: values.slice(0, 3), b: values.slice(3, 6) };
}

export function calculateDeviation(contours, areaEntries, axes) {
  const areaMap = new Map((areaEntries || []).map((entry) => [entry.key, entry]));
  const contourCounts = new Map();
  const areaCounts = new Map();
  (contours || []).forEach((contour) => contourCounts.set(contour.key, (contourCounts.get(contour.key) || 0) + 1));
  (areaEntries || []).forEach((entry) => areaCounts.set(entry.key, (areaCounts.get(entry.key) || 0) + 1));
  const results = [];
  const warnings = [];
  const errors = [];
  const usedAreaKeys = new Set();

  (contours || []).forEach((contour) => {
    if (contourCounts.get(contour.key) > 1 || areaCounts.get(contour.key) > 1) {
      errors.push(`PZ${contour.nozzle} 的 ${contour.section}D 截面存在重复轮廓或面积，已跳过。`);
      usedAreaKeys.add(contour.key);
      return;
    }
    const areaEntry = areaMap.get(contour.key);
    if (!areaEntry) {
      warnings.push(`“${contour.name}”没有匹配的截面面积。`);
      return;
    }
    usedAreaKeys.add(contour.key);
    if (!(areaEntry.area > 0)) {
      errors.push(`“${contour.name}”的截面面积必须大于 0。`);
      return;
    }

    const axis = normalizeAxis(axes?.[contour.nozzle]);
    if (!axis) {
      errors.push(`PZ${contour.nozzle} 的轴线坐标未填写完整。`);
      return;
    }
    const direction = subtract(axis.b, axis.a);
    const directionLength = length(direction);
    if (directionLength <= EPSILON) {
      errors.push(`PZ${contour.nozzle} 的轴线两点重合。`);
      return;
    }

    let rMax = -Infinity;
    let rMin = Infinity;
    contour.points.forEach((point) => {
      const radius = distancePointToLine(point, axis.a, axis.b);
      if (radius > rMax) rMax = radius;
      if (radius < rMin) rMin = radius;
    });
    const deltaR = rMax - rMin;
    const equivalentRadius = Math.sqrt(areaEntry.area / Math.PI);
    const deviationPct = deltaR / equivalentRadius * 100;
    const geometry = polygonStats(contour.points);
    const contourAreaDifferencePct = geometry?.area > EPSILON
      ? (geometry.area / areaEntry.area - 1) * 100
      : null;
    const directionUnit = scale(direction, 1 / directionLength);
    const axisPlaneAngleDeg = geometry?.normal
      ? Math.acos(Math.min(1, Math.abs(dot(directionUnit, geometry.normal)))) * 180 / Math.PI
      : null;
    const rowWarnings = [];
    if (contourAreaDifferencePct !== null && Math.abs(contourAreaDifferencePct) > 5) {
      rowWarnings.push(`轮廓闭合面积与导入面积相差 ${Math.abs(contourAreaDifferencePct).toFixed(2)}%`);
    }
    if (axisPlaneAngleDeg !== null && axisPlaneAngleDeg > 2) {
      rowWarnings.push(`轴线与截面法向夹角偏差 ${axisPlaneAngleDeg.toFixed(2)}°`);
    }
    if (contour.invalidRows > 0) rowWarnings.push(`忽略 ${contour.invalidRows} 行无效坐标`);

    results.push({
      key: contour.key,
      name: contour.name,
      nozzle: contour.nozzle,
      section: contour.section,
      pointCount: contour.points.length,
      area: areaEntry.area,
      rMax,
      rMin,
      dMax: 2 * rMax,
      dMin: 2 * rMin,
      deltaR,
      equivalentRadius,
      deviationPct,
      contourArea: geometry?.area ?? null,
      contourAreaDifferencePct,
      axisPlaneAngleDeg,
      warnings: rowWarnings,
    });
  });

  const uniqueErrors = [...new Set(errors)];
  (areaEntries || []).forEach((entry) => {
    if (!usedAreaKeys.has(entry.key)) warnings.push(`PZ${entry.nozzle} 的 ${entry.section}D 面积没有匹配的轮廓。`);
  });
  results.sort((a, b) => a.nozzle - b.nozzle || a.section - b.section || a.name.localeCompare(b.name));
  return { results, warnings: [...new Set(warnings)], errors: uniqueErrors };
}

export function summarizeByNozzle(results) {
  const groups = new Map();
  (results || []).forEach((row) => {
    if (!groups.has(row.nozzle)) groups.set(row.nozzle, []);
    groups.get(row.nozzle).push(row);
  });
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([nozzle, rows]) => ({
    nozzle,
    count: rows.length,
    averageDeviationPct: rows.reduce((sum, row) => sum + row.deviationPct, 0) / rows.length,
    maxDeviationPct: Math.max(...rows.map((row) => row.deviationPct)),
    maxSection: rows.reduce((best, row) => row.deviationPct > best.deviationPct ? row : best).section,
  }));
}
