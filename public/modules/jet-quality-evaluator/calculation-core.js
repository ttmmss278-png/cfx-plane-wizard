(() => {
  "use strict";

  const EPSILON = 1e-12;
  const valueKey = (sectionId, indicatorId) => `${sectionId}:${indicatorId}`;
  const clamp01 = (value) => Math.max(0, Math.min(1, value));

  function normalizeWeights(values) {
    const positive = values.map((value) =>
      Number.isFinite(value) && value > 0 ? value : 0,
    );
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
        if (probability > 0) {
          entropy -= probability * Math.log(probability) / Math.log(rowCount);
        }
      }
      divergence.push(Math.max(0, 1 - entropy));
    }
    return normalizeWeights(divergence);
  }

  function resolveWeights(method, commonMatrix, configuredWeights) {
    if (method === "entropy") return entropyWeights(commonMatrix);
    if (method === "manual") return normalizeWeights(configuredWeights);
    return Array(configuredWeights.length).fill(
      1 / Math.max(configuredWeights.length, 1),
    );
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
      const best = referenceValues?.[column] ?? indicator.best;
      const denominator = best - indicator.worst;
      if (Math.abs(denominator) < EPSILON) return 1;
      return clamp01((value - indicator.worst) / denominator);
    }));
  }

  function topsis(normalizedMatrix, weights, fixedIdeal) {
    const weighted = normalizedMatrix.map((row) =>
      row.map((value, column) => value * weights[column]),
    );
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
    return alternatives.map((alternative) => indicators.map((indicator) => {
      const value = Number(alternative.values[valueKey(section.id, indicator.id)]);
      // Missing or invalid data must never be interpreted as an ideal zero for a cost index.
      return Number.isFinite(value) ? value : Number(indicator.worst);
    }));
  }

  function calculate(config) {
    const { indicators, sections, alternatives } = config;
    if (!indicators.length || !sections.length || !alternatives.length) {
      return {
        rows: [],
        level1WeightsBySection: {},
        level2Weights: [],
        rankingMode: "relative",
        scoreMode: config.mode,
      };
    }

    const reference = alternatives.find(
      (alternative) => alternative.id === config.referenceId,
    ) ?? alternatives[0];
    const rankingSectionScores = {};
    const modeSectionScores = {};
    const level1WeightsBySection = {};

    for (const section of sections) {
      const rawMatrix = readDecisionMatrix(alternatives, section, indicators);
      const commonMatrix = relativeNormalize(rawMatrix, indicators);
      const level1Weights = resolveWeights(
        config.level1WeightMethod,
        commonMatrix,
        indicators.map((indicator) => indicator.weight),
      );
      level1WeightsBySection[section.id] = level1Weights;
      rankingSectionScores[section.id] = topsis(commonMatrix, level1Weights, false);

      const referenceValues = indicators.map((indicator) => {
        const value = Number(reference.values[valueKey(section.id, indicator.id)]);
        return Number.isFinite(value) ? value : Number(indicator.best);
      });
      const modeMatrix = config.mode === "relative"
        ? commonMatrix
        : standardNormalize(
          rawMatrix,
          indicators,
          config.mode === "reference" ? referenceValues : undefined,
        );
      modeSectionScores[section.id] = topsis(
        modeMatrix,
        level1Weights,
        config.mode !== "relative",
      );
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
    const commonLevel2Matrix = relativeNormalize(
      rankingSectionMatrix,
      sectionIndicators,
    );
    const level2Weights = resolveWeights(
      config.level2WeightMethod,
      commonLevel2Matrix,
      sections.map((section) => section.weight),
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
    const modeScores = topsis(
      modeLevel2Matrix,
      level2Weights,
      config.mode !== "relative",
    );

    return {
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
    version: "2.0.0",
  });
})();
