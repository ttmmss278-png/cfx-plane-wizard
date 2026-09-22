const COLORS = ["#555555", "#ed4448", "#2371dd", "#30a96a", "#aa6bd8", "#c79700"];

export function nozzleColor(nozzle) {
  return COLORS[nozzle - 1] || `hsl(${(nozzle * 137.508) % 360} 62% 40%)`;
}

export function chartSeries(results, mode = "percent", visibleNozzles = null) {
  const selected = visibleNozzles == null ? null : new Set(visibleNozzles);
  const grouped = new Map();
  for (const row of results) {
    if (!Number.isFinite(row.section) || !Number.isFinite(row.deviationPct) ||
        !Number.isInteger(row.nozzle) || row.nozzle < 1 || row.section < 0 || row.deviationPct < 0 ||
        (selected && !selected.has(row.nozzle))) continue;
    if (!grouped.has(row.nozzle)) grouped.set(row.nozzle, []);
    grouped.get(row.nozzle).push({
      x: row.section,
      y: mode === "coefficient" ? row.deviationPct / 100 : row.deviationPct,
      percent: row.deviationPct,
      warnings: row.warnings || [],
    });
  }
  return [...grouped.entries()].sort((a, b) => a[0] - b[0]).map(([nozzle, points]) => ({
    nozzle,
    color: nozzleColor(nozzle),
    points: points.sort((a, b) => a.x - b.x),
  }));
}

function niceStep(span, target = 6) {
  const raw = span / target;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  return ([1, 2, 2.5, 5, 10].find(value => value >= fraction) || 10) * power;
}

function numberLabel(value, step) {
  if (value === 0) return "0";
  if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-4) return value.toExponential(1);
  const decimals = Math.max(0, Math.min(6, 1 - Math.floor(Math.log10(step))));
  return Number(value.toFixed(decimals)).toString();
}

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
}

/** Standalone SVG with explicit styles: independent of app skins and suitable for export. */
export function buildRoundnessChart(results, { mode = "percent", visibleNozzles = null } = {}) {
  const series = chartSeries(results, mode, visibleNozzles);
  if (!series.length) return "";
  const width = 1120;
  const legendColumns = Math.min(series.length, 6);
  const legendRows = Math.ceil(series.length / legendColumns);
  const top = 40 + legendRows * 36;
  const height = 660 + legendRows * 36;
  const plot = { x: 110, y: top, width: 968, height: height - top - 86 };
  let maxX = 0;
  let maxY = 0;
  let pointCount = 0;
  for (const group of series) {
    for (const point of group.points) {
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
      pointCount++;
    }
  }
  const xStep = niceStep(maxX || 1);
  const xMax = (maxX || 1) + xStep * 0.35;
  const yStep = niceStep(maxY > 0 ? maxY * 1.1 : mode === "coefficient" ? 0.01 : 1);
  const yMax = maxY > 0 ? Math.ceil(maxY * 1.1 / yStep) * yStep : yStep * 5;
  const x = value => plot.x + value / xMax * plot.width;
  const y = value => plot.y + plot.height - value / yMax * plot.height;
  const coordinate = value => value.toFixed(3);
  const yTitle = mode === "coefficient" ? "偏离圆度 C" : "偏离圆度 (%)";
  const unit = mode === "coefficient" ? "" : "%";
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="roundness-chart" role="img" aria-labelledby="roundness-chart-title roundness-chart-description">`,
    `<title id="roundness-chart-title">偏离圆度随截面位置变化</title>`,
    `<desc id="roundness-chart-description">横轴 X/D，纵轴${yTitle}。${series.length} 个喷嘴，${pointCount} 个截面数据点；按截面位置连接原始计算结果，不进行平滑或插值。详细数据见下方结果表。</desc>`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<g fill="#151515" font-family="Times New Roman, Microsoft YaHei, serif" font-size="23">`,
  ];
  series.forEach((group, index) => {
    const lx = plot.x + (index % legendColumns) * (plot.width / legendColumns);
    const ly = 30 + Math.floor(index / legendColumns) * 36;
    svg.push(`<g class="chart-legend" data-nozzle="${group.nozzle}"><line x1="${lx}" y1="${ly}" x2="${lx + 48}" y2="${ly}" stroke="${group.color}" stroke-width="3"/><circle cx="${lx + 24}" cy="${ly}" r="5.5" fill="${group.color}"/><text x="${lx + 57}" y="${ly + 7}" fill="#151515">PZ${group.nozzle}</text></g>`);
  });
  for (let i = 0; i <= Math.floor(xMax / xStep); i++) {
    const value = i * xStep;
    const px = coordinate(x(value));
    svg.push(`<line x1="${px}" y1="${plot.y + plot.height}" x2="${px}" y2="${plot.y + plot.height - 11}" stroke="#151515" stroke-width="2"/><text x="${px}" y="${plot.y + plot.height + 34}" text-anchor="middle" fill="#151515">${numberLabel(value, xStep)}</text>`);
    if (value + xStep / 2 < xMax) {
      const minor = coordinate(x(value + xStep / 2));
      svg.push(`<line x1="${minor}" y1="${plot.y + plot.height}" x2="${minor}" y2="${plot.y + plot.height - 6}" stroke="#151515" stroke-width="1.5"/>`);
    }
  }
  for (let i = 0; i <= Math.round(yMax / yStep); i++) {
    const value = i * yStep;
    const py = coordinate(y(value));
    svg.push(`<line x1="${plot.x}" y1="${py}" x2="${plot.x + 11}" y2="${py}" stroke="#151515" stroke-width="2"/><text x="${plot.x - 16}" y="${Number(py) + 8}" text-anchor="end" fill="#151515">${numberLabel(value, yStep)}</text>`);
  }
  svg.push(`<rect x="${plot.x}" y="${plot.y}" width="${plot.width}" height="${plot.height}" fill="none" stroke="#151515" stroke-width="2.5"/>`);
  for (const group of series) {
    const points = group.points.map(point => `${coordinate(x(point.x))},${coordinate(y(point.y))}`).join(" ");
    svg.push(`<g class="chart-series" data-nozzle="${group.nozzle}"><polyline points="${points}" fill="none" stroke="${group.color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`);
    for (const point of group.points) {
      const warning = point.warnings.length ? `；检查：${point.warnings.join("；")}` : "";
      const title = `PZ${group.nozzle} · ${point.x}D：${point.y.toPrecision(6)}${unit}${warning}`;
      svg.push(`<circle class="curve-point" data-section="${point.x}" data-value="${point.y}" cx="${coordinate(x(point.x))}" cy="${coordinate(y(point.y))}" r="5.5" fill="${group.color}"><title>${escapeText(title)}</title></circle>`);
    }
    svg.push("</g>");
  }
  svg.push(`<text x="${plot.x + plot.width / 2}" y="${height - 18}" text-anchor="middle" font-size="30" fill="#151515">X/D</text>`);
  svg.push(`<text transform="translate(32 ${plot.y + plot.height / 2}) rotate(-90)" text-anchor="middle" font-size="27" fill="#151515">${yTitle}</text>`);
  svg.push("</g></svg>");
  return svg.join("");
}
