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
const { calculate } = context.JetQualityCalculation;

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

function orderedIds(result) {
  return [...result.rows]
    .sort((left, right) => left.rank - right.rank || right.rankScore - left.rankScore)
    .map((row) => Number(row.id.replace("nozzle-", "")));
}

const expectedOrder = [5, 6, 2, 3, 1, 4];
for (const [mode, result] of Object.entries(results)) {
  assert.deepEqual(orderedIds(result), expectedOrder, `${mode} changed the unified rank`);
  assert.equal(result.rankingMode, "relative");
  assert.equal(result.scoreMode, mode);
}

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
