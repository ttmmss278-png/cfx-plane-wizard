(() => {
  "use strict";

  const VERSION = "2.1.0";
  const EPSILON = 1e-12;
  const MODES = new Set(["relative", "reference", "fixed"]);
  const WEIGHT_METHODS = new Set(["equal", "manual", "entropy"]);
  const DIRECTIONS = new Set(["benefit", "cost"]);
  const valueKey = (sectionId, indicatorId) => `${sectionId}:${indicatorId}`;
  const clamp01 = (value) => Math.max(0, Math.min(1, value));

  function parseFiniteNumber(rawValue) {
    if (typeof rawValue === "number") {
      return Number.isFinite(rawValue) ? rawValue : null;
    }
    if (typeof rawValue !== "string" || rawValue.trim() === "") return null;
    const value = Number(rawValue);
    return Number.isFinite(value) ? value : null;
  }

  function validate(config) {
    const errors = [];
    const invalidValueKeys = [];
    const indicators = Array.isArray(config?.indicators) ? config.indicators : [];
    const sections = Array.isArray(config?.sections) ? config.sections : [];
    const alternatives = Array.isArray(config?.alternatives) ? config.alternatives : [];

    const addError = (code, path, message) => errors.push({ code, path, message });
    const requireNonEmptyCollection = (items, path, label) => {
      if (items.length === 0) addError("collection.empty", path, `至少需要一个${label}`);
    };
    const requireUniqueIds = (items, path, label) => {
      const ids = new Set();
      items.forEach((item, index) => {
        const id = typeof item?.id === "string" ? item.id.trim() : "";
        if (!id) {
          addError("id.missing", `${path}[${index}].id`, `${label} ${index + 1} 缺少标识`);
        } else if (ids.has(id)) {
          addError("id.duplicate", `${path}[${index}].id`, `${label}标识“${id}”重复`);
        } else {
          ids.add(id);
        }
      });
    };
    const readNumber = (rawValue, path, label) => {
      const value = parseFiniteNumber(rawValue);
      if (value === null) addError("number.invalid", path, `${label}必须是有限数值`);
      return value;
    };
    const readWeight = (rawValue, path, label) => {
      const value = readNumber(rawValue, path, label);
      if (value !== null && value < 0) addError("weight.negative", path, `${label}不能小于 0`);
      return value;
    };

    requireNonEmptyCollection(indicators, "indicators", "评价指标");
    requireNonEmptyCollection(sections, "sections", "评价截面");
    requireNonEmptyCollection(alternatives, "alternatives", "评价对象");
    requireUniqueIds(indicators, "indicators", "评价指标");
    requireUniqueIds(sections, "sections", "评价截面");
    requireUniqueIds(alternatives, "alternatives", "评价对象");

    if (!MODES.has(config?.mode)) addError("mode.invalid", "mode", "评价模式无效");
    if (!WEIGHT_METHODS.has(config?.level1WeightMethod)) {
      addError("weightMethod.invalid", "level1WeightMethod", "一级赋权方法无效");
    }
    if (!WEIGHT_METHODS.has(config?.level2WeightMethod)) {
      addError("weightMethod.invalid", "level2WeightMethod", "二级赋权方法无效");
    }

    const indicatorWeights = indicators.map((indicator, index) => {
      const path = `indicators[${index}]`;
      if (!DIRECTIONS.has(indicator?.direction)) {
        addError("direction.invalid", `${path}.direction`, `指标“${indicator?.name || index + 1}”方向必须为正向或负向`);
      }
      const worst = readNumber(indicator?.worst, `${path}.worst`, `指标“${indicator?.name || index + 1}”最差值`);
      const best = readNumber(indicator?.best, `${path}.best`, `指标“${indicator?.name || index + 1}”优良值`);
      const weight = readWeight(indicator?.weight, `${path}.weight`, `指标“${indicator?.name || index + 1}”权重`);
      if (worst !== null && best !== null && DIRECTIONS.has(indicator?.direction)) {
        const consistent = indicator.direction === "benefit" ? best > worst : best < worst;
        if (!consistent) {
          addError(
            "benchmark.directionMismatch",
            path,
            `指标“${indicator?.name || index + 1}”的优良值与${indicator.direction === "benefit" ? "正向" : "负向"}方向不一致`,
          );
        }
      }
      return weight;
    });

    const sectionWeights = sections.map((section, index) =>
      readWeight(section?.weight, `sections[${index}].weight`, `截面“${section?.name || index + 1}”权重`),
    );

    if (
      config?.level1WeightMethod === "manual"
      && indicatorWeights.every((weight) => weight === null || weight <= EPSILON)
    ) {
      addError("weight.allZero", "indicators", "自主赋权时，至少一个一级指标权重大于 0");
    }
    if (
      config?.level2WeightMethod === "manual"
      && sectionWeights.every((weight) => weight === null || weight <= EPSILON)
    ) {
      addError("weight.allZero", "sections", "自主赋权时，至少一个二级截面权重大于 0");
    }

    let validValueCount = 0;
    alternatives.forEach((alternative, alternativeIndex) => {
      const values = alternative?.values && typeof alternative.values === "object"
        ? alternative.values
        : {};
      sections.forEach((section) => indicators.forEach((indicator) => {
        const key = valueKey(section.id, indicator.id);
        const rawValue = values[key];
        const cellPath = `alternatives[${alternativeIndex}].values.${key}`;
        if (rawValue === null || rawValue === undefined || (typeof rawValue === "string" && rawValue.trim() === "")) {
          addError(
            "data.missing",
            cellPath,
            `“${alternative?.name || `评价对象 ${alternativeIndex + 1}`} / ${section?.name || "截面"} / ${indicator?.name || "指标"}”缺少数值`,
          );
          invalidValueKeys.push(`${alternative?.id}:${key}`);
          return;
        }
        if (parseFiniteNumber(rawValue) === null) {
          addError(
            "data.nonFinite",
            cellPath,
            `“${alternative?.name || `评价对象 ${alternativeIndex + 1}`} / ${section?.name || "截面"} / ${indicator?.name || "指标"}”不是有限数值`,
          );
          invalidValueKeys.push(`${alternative?.id}:${key}`);
          return;
        }
        validValueCount += 1;
      }));
    });

    if (config?.mode === "reference") {
      const reference = alternatives.find((alternative) => alternative?.id === config?.referenceId);
      if (!reference) {
        addError("reference.missing", "referenceId", "请选择当前数据中存在的优良基准喷嘴");
      } else {
        sections.forEach((section) => indicators.forEach((indicator, indicatorIndex) => {
          const referenceValue = parseFiniteNumber(reference.values?.[valueKey(section.id, indicator.id)]);
          const worst = parseFiniteNumber(indicator.worst);
          if (referenceValue === null || worst === null || !DIRECTIONS.has(indicator.direction)) return;
          const consistent = indicator.direction === "benefit"
            ? referenceValue > worst
            : referenceValue < worst;
          if (!consistent) {
            addError(
              "reference.directionMismatch",
              `reference.${section.id}.${indicator.id}`,
              `基准喷嘴在“${section?.name || "截面"} / ${indicator?.name || `指标 ${indicatorIndex + 1}`}”上的数值必须优于最差基准`,
            );
          }
        }));
      }
    }

    const expectedValueCount = alternatives.length * sections.length * indicators.length;
    const firstMessage = errors[0]?.message ?? "数据校验通过";
    return {
      valid: errors.length === 0,
      errors,
      invalidValueKeys,
      summary: errors.length > 1 ? `${firstMessage}（另有 ${errors.length - 1} 项）` : firstMessage,
      stats: { expectedValueCount, validValueCount, errorCount: errors.length },
    };
  }

  function normalizeWeights(values) {
    const positive = values.map((value) => Number.isFinite(value) && value > 0 ? value : 0);
    const total = positive.reduce((sum, value) => sum + value, 0);
    return total > 0
      ? positive.map((value) => value / total)
      : positive.map(() => 1 / Math.max(positive.length, 1));
  }

  function entropyWeights(matrix) {
    const rowCount = matrix.length;
    const columnCount = matrix[0]?.length ?? 0;
    if (rowCount <= 1 || columnCount === 0) {
      return Array(columnCount).fill(1 / Math.max(columnCount, 1));
    }
    const divergence = [];
    for (let column = 0; column < columnCount; column += 1) {
      const values = matrix.map((row) => Math.max(0, row[column] ?? 0));
      const total = values.reduce((sum, value) => sum + value, 0);
      const probabilities = total > 0
        ? values.map((value) => value / total)
        : values.map(() => 1 / rowCount);
      let entropy = 0;
      for (const probability of probabilities) {
        if (probability > 0) entropy -= probability * Math.log(probability) / Math.log(rowCount);
      }
      divergence.push(Math.max(0, 1 - entropy));
    }
    return normalizeWeights(divergence);
  }

  function resolveWeights(method, commonMatrix, configuredWeights) {
    if (method === "entropy") return entropyWeights(commonMatrix);
    if (method === "manual") return normalizeWeights(configuredWeights);
    return Array(configuredWeights.length).fill(1 / Math.max(configuredWeights.length, 1));
  }

  function relativeNormalize(matrix, indicators) {
    return matrix.map((row) => row.map((value, column) => {
      const values = matrix.map((candidate) => candidate[column]);
      const minimum = Math.min(...values);
      const maximum = Math.max(...values);
      if (Math.abs(maximum - minimum) < EPSILON) return 1;
      return indicators[column].direction === "benefit"
        ? (value - minimum) / (maximum - minimum)
        : (maximum - value) / (maximum - minimum);
    }));
  }

  function standardNormalize(matrix, indicators, referenceValues) {
    return matrix.map((row) => row.map((value, column) => {
      const indicator = indicators[column];
      const best = referenceValues?.[column] ?? parseFiniteNumber(indicator.best);
      const worst = parseFiniteNumber(indicator.worst);
      return clamp01((value - worst) / (best - worst));
    }));
  }

  function topsis(normalizedMatrix, weights, fixedIdeal) {
    const weighted = normalizedMatrix.map((row) => row.map((value, column) => value * weights[column]));
    const ideal = weights.map((weight, column) =>
      fixedIdeal ? weight : Math.max(...weighted.map((row) => row[column])),
    );
    const antiIdeal = weights.map((_, column) =>
      fixedIdeal ? 0 : Math.min(...weighted.map((row) => row[column])),
    );
    return weighted.map((row) => {
      const distanceToIdeal = Math.sqrt(row.reduce(
        (sum, value, column) => sum + (value - ideal[column]) ** 2,
        0,
      ));
      const distanceToAntiIdeal = Math.sqrt(row.reduce(
        (sum, value, column) => sum + (value - antiIdeal[column]) ** 2,
        0,
      ));
      const distance = distanceToIdeal + distanceToAntiIdeal;
      return distance < EPSILON ? 1 : distanceToAntiIdeal / distance;
    });
  }

  function readDecisionMatrix(alternatives, section, indicators) {
    return alternatives.map((alternative) => indicators.map((indicator) =>
      parseFiniteNumber(alternative.values[valueKey(section.id, indicator.id)]),
    ));
  }

  function invalidResult(config, validation) {
    return {
      valid: false,
      validation,
      rows: [],
      level1WeightsBySection: {},
      level2Weights: [],
      rankingMode: "relative",
      scoreMode: config?.mode,
    };
  }

  function calculate(config) {
    const validation = validate(config);
    if (!validation.valid) return invalidResult(config, validation);

    const { indicators, sections, alternatives } = config;
    const reference = alternatives.find((alternative) => alternative.id === config.referenceId) ?? alternatives[0];
    const rankingSectionScores = {};
    const modeSectionScores = {};
    const level1WeightsBySection = {};

    for (const section of sections) {
      const rawMatrix = readDecisionMatrix(alternatives, section, indicators);
      const commonMatrix = relativeNormalize(rawMatrix, indicators);
      const level1Weights = resolveWeights(
        config.level1WeightMethod,
        commonMatrix,
        indicators.map((indicator) => parseFiniteNumber(indicator.weight)),
      );
      level1WeightsBySection[section.id] = level1Weights;
      rankingSectionScores[section.id] = topsis(commonMatrix, level1Weights, false);

      const referenceValues = indicators.map((indicator) =>
        parseFiniteNumber(reference.values[valueKey(section.id, indicator.id)]),
      );
      const modeMatrix = config.mode === "relative"
        ? commonMatrix
        : standardNormalize(rawMatrix, indicators, config.mode === "reference" ? referenceValues : undefined);
      modeSectionScores[section.id] = topsis(modeMatrix, level1Weights, config.mode !== "relative");
    }

    const sectionIndicators = sections.map((section) => ({
      ...section,
      direction: "benefit",
      worst: 0,
      best: 1,
    }));
    const rankingSectionMatrix = alternatives.map((_, alternativeIndex) =>
      sections.map((section) => rankingSectionScores[section.id][alternativeIndex]),
    );
    const commonLevel2Matrix = relativeNormalize(rankingSectionMatrix, sectionIndicators);
    const level2Weights = resolveWeights(
      config.level2WeightMethod,
      commonLevel2Matrix,
      sections.map((section) => parseFiniteNumber(section.weight)),
    );
    const rankingScores = topsis(commonLevel2Matrix, level2Weights, false);
    const ranks = rankingScores.map((score) =>
      1 + rankingScores.filter((candidate) => candidate > score + 1e-9).length,
    );

    const modeSectionMatrix = alternatives.map((_, alternativeIndex) =>
      sections.map((section) => modeSectionScores[section.id][alternativeIndex]),
    );
    const modeLevel2Matrix = config.mode === "relative"
      ? commonLevel2Matrix
      : modeSectionMatrix.map((row) => row.map(clamp01));
    const modeScores = topsis(modeLevel2Matrix, level2Weights, config.mode !== "relative");

    return {
      valid: true,
      validation,
      rows: alternatives.map((alternative, alternativeIndex) => ({
        id: alternative.id,
        name: alternative.name,
        sectionScores: Object.fromEntries(sections.map((section) => [
          section.id,
          modeSectionScores[section.id][alternativeIndex],
        ])),
        rankingSectionScores: Object.fromEntries(sections.map((section) => [
          section.id,
          rankingSectionScores[section.id][alternativeIndex],
        ])),
        overall: modeScores[alternativeIndex],
        rankScore: rankingScores[alternativeIndex],
        rank: ranks[alternativeIndex],
      })),
      level1WeightsBySection,
      level2Weights,
      rankingMode: "relative",
      scoreMode: config.mode,
    };
  }

  const scope = typeof window === "undefined" ? globalThis : window;
  scope.JetQualityCalculation = Object.freeze({
    calculate,
    parseFiniteNumber,
    validate,
    version: VERSION,
  });
})();
