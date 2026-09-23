const cleanName = value => String(value ?? '').trim();

function requireNames(values, label) {
  const names = values.map(cleanName);
  if (names.some(name => !name)) throw new Error(`${label}名称不能为空。`);
  if (new Set(names).size !== names.length) throw new Error(`${label}名称不能重复。`);
  return names;
}

export function normalizeTemplateSettings(settings) {
  const objectNames = requireNames(settings.objectNames ?? [], '评价对象');
  const sectionNames = requireNames(settings.sectionNames ?? [], '子对象');
  const variableNames = requireNames(settings.variableNames ?? [], '评价变量');
  if (!objectNames.length || objectNames.length > 200) throw new Error('评价对象数量应为 1～200。');
  if (!sectionNames.length || sectionNames.length > 100) throw new Error('子对象数量应为 1～100。');
  if (!variableNames.length || variableNames.length > 50) throw new Error('评价变量数量应为 1～50。');
  if (sectionNames.length * variableNames.length > 1000) throw new Error('子对象与评价变量组合不能超过 1000 列。');
  return {objectNames, sectionNames, variableNames};
}

export function buildTemplateGrid(settings) {
  const normalized = normalizeTemplateSettings(settings);
  const headers = ['评价对象', ...normalized.sectionNames.flatMap(section =>
    normalized.variableNames.map(variable => `${section}-${variable}`))];
  const rows = normalized.objectNames.map(name => [name, ...Array(headers.length - 1).fill(null)]);
  return {normalized, headers, rows};
}

export function buildTemplateConfig(settings, previous = {}) {
  const {normalized} = buildTemplateGrid(settings);
  const previousIndicators = Array.isArray(previous.indicators) ? previous.indicators : [];
  const previousSections = Array.isArray(previous.sections) ? previous.sections : [];
  const indicators = normalized.variableNames.map((name, index) => {
    const old = previousIndicators.find(item => item.name === name);
    const isPercentageCost = /偏离圆度|偏移度|射流偏移/.test(name);
    const isUniformity = /速度均匀性/.test(name);
    const preserveBenchmarks = old && (!isPercentageCost || old.direction === 'cost');
    return {
      id: old?.id ?? `template-indicator-${index + 1}`,
      name,
      direction: isPercentageCost ? 'cost' : old?.direction ?? 'benefit',
      worst: preserveBenchmarks && Number.isFinite(Number(old.worst)) ? Number(old.worst) : isPercentageCost ? 1 : 0,
      best: preserveBenchmarks && Number.isFinite(Number(old.best)) ? Number(old.best) : isPercentageCost ? 0 : 1,
      weight: Number.isFinite(Number(old?.weight)) ? Number(old.weight) : 1,
      unit: old?.unit && old.unit !== '—' ? old.unit : isPercentageCost ? '无量纲小数' : isUniformity ? '系数' : '—'
    };
  });
  const sections = normalized.sectionNames.map((name, index) => {
    const old = previousSections.find(item => item.name === name);
    return {
      id: old?.id ?? `template-section-${index + 1}`,
      name,
      position: old?.position ?? name,
      weight: Number.isFinite(Number(old?.weight)) ? Number(old.weight) : 1
    };
  });
  const alternatives = normalized.objectNames.map((name, index) => ({
    id: `template-object-${index + 1}`,
    name,
    values: Object.fromEntries(sections.flatMap(section =>
      indicators.map(indicator => [`${section.id}:${indicator.id}`, 0])))
  }));
  return {
    projectName: previous.projectName || '通用综合评价',
    mode: previous.mode || 'relative',
    indicators,
    sections,
    alternatives,
    referenceId: alternatives[0].id,
    level1WeightMethod: previous.level1WeightMethod || 'equal',
    level2WeightMethod: previous.level2WeightMethod || 'equal'
  };
}
