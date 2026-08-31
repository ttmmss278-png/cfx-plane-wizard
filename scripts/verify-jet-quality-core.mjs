import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const corePath = path.join(
  projectRoot,
  "public",
  "modules",
  "jet-quality-evaluator",
  "calculation-core.js",
);
const source = await readFile(corePath, "utf8");
const context = vm.createContext({ console });
vm.runInContext(source, context, { filename: corePath });
const { calculate, parseFiniteNumber, validate, version } = context.JetQualityCalculation;

const indicators = [
  { id: "uniformity", direction: "benefit", worst: 0, best: 1, weight: 1 },
  { id: "deformation", direction: "cost", worst: 1, best: 0, weight: 1 },
  { id: "offset", direction: "cost", worst: 1, best: 0, weight: 1 },
];
const sections = [1, 2, 3].map((number) => ({
  id: `section-${number}`,
  name: `截面 ${number}`,
  weight: 1,
}));
const sourceRows = [
  [1, 0.0081, 0.1667, 0.960581, 0.0115, 0.2223, 0.962669, 0.0148, 0.2716, 0.963943],
  [2, 0.0069, 0.1779, 0.964049, 0.0103, 0.2509, 0.966314, 0.0137, 0.0638, 0.967979],
  [3, 0.0084, 0.1609, 0.964882, 0.0117, 0.2219, 0.966936, 0.0149, 0.2830, 0.968061],
  [4, 0.0086, 0.1698, 0.960452, 0.0123, 0.2316, 0.962489, 0.0158, 0.2801, 0.963723],
  [5, 0.0044, 0.1253, 0.964683, 0.0066, 0.1627, 0.967132, 0.0088, 0.2083, 0.969068],
  [6, 0.0077, 0.1338, 0.965611, 0.0107, 0.1767, 0.967749, 0.0136, 0.2207, 0.969215],
];
const alternatives = sourceRows.map((row) => {
  const values = {};
  sections.forEach((section, sectionIndex) => {
    const offset = 1 + sectionIndex * 3;
    values[`${section.id}:uniformity`] = row[offset + 2];
    values[`${section.id}:deformation`] = row[offset];
    values[`${section.id}:offset`] = row[offset + 1];
  });
  return { id: `nozzle-${row[0]}`, name: `喷嘴 ${row[0]}`, values };
});

const baseConfig = {
  indicators,
  sections,
  alternatives,
  referenceId: "nozzle-5",
  level1WeightMethod: "entropy",
  level2WeightMethod: "entropy",
};
const results = Object.fromEntries(["relative", "reference", "fixed"].map((mode) => [
  mode,
  calculate({ ...baseConfig, mode }),
]));

assert.equal(version, "2.1.0");
assert.equal(parseFiniteNumber(""), null, "an empty string must not become zero");
assert.equal(parseFiniteNumber("   "), null, "whitespace must not become zero");
assert.equal(parseFiniteNumber(null), null, "null must not become zero");
assert.equal(parseFiniteNumber(false), null, "a boolean must not become zero");
assert.equal(parseFiniteNumber("0"), 0, "an explicit zero must remain valid");

function orderedIds(result) {
  return [...result.rows]
    .sort((left, right) => left.rank - right.rank || right.rankScore - left.rankScore)
    .map((row) => Number(row.id.replace("nozzle-", "")));
}

const expectedOrder = [5, 6, 2, 3, 1, 4];
for (const [mode, result] of Object.entries(results)) {
  assert.equal(result.valid, true, `${mode} unexpectedly failed validation`);
  assert.deepEqual(orderedIds(result), expectedOrder, `${mode} changed the unified rank`);
  assert.equal(result.rankingMode, "relative");
  assert.equal(result.scoreMode, mode);
}

function cloneConfig(config = baseConfig) {
  return JSON.parse(JSON.stringify(config));
}

const blankConfig = cloneConfig();
blankConfig.mode = "relative";
blankConfig.alternatives[0].values["section-1:uniformity"] = "";
const blankResult = calculate(blankConfig);
assert.equal(blankResult.valid, false, "a blank data cell must block calculation");
assert.equal(blankResult.rows.length, 0, "invalid input must not produce result rows");
assert.ok(
  blankResult.validation.errors.some((error) => error.code === "data.missing"),
  "blank input should be reported as missing data",
);

const nonFiniteConfig = cloneConfig();
nonFiniteConfig.mode = "fixed";
nonFiniteConfig.alternatives[1].values["section-2:offset"] = Number.POSITIVE_INFINITY;
const nonFiniteResult = calculate(nonFiniteConfig);
assert.equal(nonFiniteResult.valid, false, "Infinity must block calculation");
assert.ok(
  nonFiniteResult.validation.errors.some((error) => error.code === "data.nonFinite"),
  "Infinity should be reported as a non-finite data value",
);

const costConfig = {
  mode: "fixed",
  indicators: [
    { id: "loss", name: "损失", direction: "cost", worst: 10, best: 0, weight: 1 },
  ],
  sections: [{ id: "outlet", name: "出口", weight: 1 }],
  alternatives: [
    { id: "low", name: "低损失", values: { "outlet:loss": 1 } },
    { id: "high", name: "高损失", values: { "outlet:loss": 9 } },
  ],
  referenceId: "low",
  level1WeightMethod: "equal",
  level2WeightMethod: "equal",
};
const costResult = calculate(costConfig);
assert.equal(costResult.valid, true, "a valid cost indicator should calculate");
assert.equal(costResult.rows.find((row) => row.id === "low").rank, 1);
assert.ok(
  costResult.rows.find((row) => row.id === "low").overall
    > costResult.rows.find((row) => row.id === "high").overall,
  "a lower cost value must score better",
);

const equalColumnConfig = {
  mode: "relative",
  indicators: [
    { id: "uniformity", name: "均匀性", direction: "benefit", worst: 0, best: 1, weight: 1 },
  ],
  sections: [{ id: "section", name: "截面", weight: 1 }],
  alternatives: ["a", "b", "c"].map((id) => ({
    id,
    name: id.toUpperCase(),
    values: { "section:uniformity": 0.5 },
  })),
  referenceId: "a",
  level1WeightMethod: "entropy",
  level2WeightMethod: "entropy",
};
const equalColumnResult = calculate(equalColumnConfig);
assert.equal(equalColumnResult.valid, true, "an all-equal column is a valid boundary case");
assert.ok(equalColumnResult.rows.every((row) => row.rank === 1), "all-equal values should tie");
assert.ok(
  equalColumnResult.rows.every((row) => Number.isFinite(row.rankScore) && Number.isFinite(row.overall)),
  "all-equal values must not create NaN scores",
);

const partialZeroWeightConfig = {
  mode: "relative",
  indicators: [
    { id: "ignored", name: "零权指标", direction: "benefit", worst: 0, best: 1, weight: 0 },
    { id: "kept", name: "有效指标", direction: "benefit", worst: 0, best: 1, weight: 2 },
  ],
  sections: [{ id: "section", name: "截面", weight: 1 }],
  alternatives: [
    { id: "a", name: "A", values: { "section:ignored": 0, "section:kept": 0.5 } },
    { id: "b", name: "B", values: { "section:ignored": 1, "section:kept": 0.5 } },
  ],
  referenceId: "a",
  level1WeightMethod: "manual",
  level2WeightMethod: "manual",
};
const partialZeroWeightResult = calculate(partialZeroWeightConfig);
assert.equal(partialZeroWeightResult.valid, true, "individual zero weights should be supported");
assert.deepEqual(
  partialZeroWeightResult.level1WeightsBySection.section,
  [0, 1],
  "manual zero weights must not be silently changed to one",
);
assert.ok(partialZeroWeightResult.rows.every((row) => row.rank === 1));

const allZeroWeightConfig = cloneConfig(partialZeroWeightConfig);
allZeroWeightConfig.indicators.forEach((indicator) => { indicator.weight = 0; });
const allZeroWeightResult = calculate(allZeroWeightConfig);
assert.equal(allZeroWeightResult.valid, false, "all-zero manual weights must block calculation");
assert.ok(
  allZeroWeightResult.validation.errors.some((error) => error.code === "weight.allZero"),
  "all-zero manual weights should have a specific validation error",
);

const directionMismatchConfig = cloneConfig(costConfig);
directionMismatchConfig.indicators[0].best = 12;
const directionMismatch = validate(directionMismatchConfig);
assert.equal(directionMismatch.valid, false, "inconsistent cost benchmarks must be rejected");
assert.ok(
  directionMismatch.errors.some((error) => error.code === "benchmark.directionMismatch"),
  "benchmark direction mismatch should be identified",
);

const missingReferenceConfig = cloneConfig(baseConfig);
missingReferenceConfig.mode = "reference";
missingReferenceConfig.referenceId = "missing-nozzle";
const missingReferenceResult = calculate(missingReferenceConfig);
assert.equal(missingReferenceResult.valid, false, "an unknown reference nozzle must block calculation");
assert.ok(
  missingReferenceResult.validation.errors.some((error) => error.code === "reference.missing"),
  "an unknown reference should have a specific validation error",
);

const invalidReferenceBaselineConfig = cloneConfig(costConfig);
invalidReferenceBaselineConfig.mode = "reference";
invalidReferenceBaselineConfig.alternatives[0].values["outlet:loss"] = 10;
const invalidReferenceBaseline = calculate(invalidReferenceBaselineConfig);
assert.equal(invalidReferenceBaseline.valid, false, "a reference equal to the worst baseline must be rejected");
assert.ok(
  invalidReferenceBaseline.validation.errors.some((error) => error.code === "reference.directionMismatch"),
  "an unusable reference baseline should have a specific validation error",
);

const negativeWeightConfig = cloneConfig(baseConfig);
negativeWeightConfig.mode = "relative";
negativeWeightConfig.indicators[0].weight = -1;
const negativeWeightResult = calculate(negativeWeightConfig);
assert.equal(negativeWeightResult.valid, false, "negative weights must block calculation");
assert.ok(
  negativeWeightResult.validation.errors.some((error) => error.code === "weight.negative"),
  "negative weights should have a specific validation error",
);

assert.deepEqual(
  results.relative.level1WeightsBySection,
  results.reference.level1WeightsBySection,
  "level-one entropy weights changed with mode",
);
assert.deepEqual(
  results.relative.level2Weights,
  results.fixed.level2Weights,
  "level-two entropy weights changed with mode",
);
assert.notDeepEqual(
  results.relative.rows.map((row) => row.overall),
  results.fixed.rows.map((row) => row.overall),
  "auxiliary mode scores should retain their distinct meaning",
);

const alternativeReference = calculate({
  ...baseConfig,
  mode: "reference",
  referenceId: "nozzle-2",
});
assert.deepEqual(
  orderedIds(alternativeReference),
  expectedOrder,
  "changing the benchmark nozzle changed the unified rank",
);

const maximumWeight = Math.max(
  ...Object.values(results.fixed.level1WeightsBySection).flat(),
  ...results.fixed.level2Weights,
);
assert.ok(maximumWeight < 0.9, "a single entropy weight still dominates the result");

for (const level1WeightMethod of ["equal", "manual", "entropy"]) {
  for (const level2WeightMethod of ["equal", "manual", "entropy"]) {
    const weightingConfig = {
      ...baseConfig,
      level1WeightMethod,
      level2WeightMethod,
    };
    const relativeResult = calculate({ ...weightingConfig, mode: "relative" });
    const referenceResult = calculate({ ...weightingConfig, mode: "reference" });
    const fixedResult = calculate({ ...weightingConfig, mode: "fixed" });
    const expectedWeightedOrder = orderedIds(relativeResult);
    assert.deepEqual(
      orderedIds(referenceResult),
      expectedWeightedOrder,
      `${level1WeightMethod}/${level2WeightMethod}: reference mode changed the rank`,
    );
    assert.deepEqual(
      orderedIds(fixedResult),
      expectedWeightedOrder,
      `${level1WeightMethod}/${level2WeightMethod}: fixed mode changed the rank`,
    );
    assert.deepEqual(
      referenceResult.level1WeightsBySection,
      relativeResult.level1WeightsBySection,
      `${level1WeightMethod}/${level2WeightMethod}: level-one weights changed`,
    );
    assert.deepEqual(
      fixedResult.level2Weights,
      relativeResult.level2Weights,
      `${level1WeightMethod}/${level2WeightMethod}: level-two weights changed`,
    );
  }
}

console.log("Jet quality calculation verified:");
console.log(`  unified order: ${expectedOrder.join(" > ")}`);
console.log("  9 weight-method combinations keep ranks and weights stable across modes");
console.log("  mode scores differ while retaining their distinct engineering meaning");
console.log("  empty/non-finite inputs and inconsistent benchmarks are blocked");
console.log("  cost indicators, equal columns, and zero-weight boundaries are verified");
