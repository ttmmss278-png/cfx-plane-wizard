import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('../src/needle-opening.ts', import.meta.url)), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020},
}).outputText;
const {openingPercentFromTravel, travelFromOpeningPercent, createNeedleOpeningRecord} = await import(
  `data:text/javascript;charset=utf-8,${encodeURIComponent(compiled)}`
);

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
near(openingPercentFromTravel(80, 36), 55);
near(travelFromOpeningPercent(80, 55), 36);
near(openingPercentFromTravel(80, 0), 100);
near(openingPercentFromTravel(80, 80), 0);
near(travelFromOpeningPercent(80, 0), 80);
near(travelFromOpeningPercent(80, 100), 0);
near(travelFromOpeningPercent(0.510387, openingPercentFromTravel(0.510387, 0.22967415)), 0.22967415);

const fromTravel = createNeedleOpeningRecord(80, 36, 'travel');
assert.deepEqual(fromTravel, {maximumMm: 80, travelMm: 36, openingPercent: 55, openingFactor: 0.55});
const fromOpening = createNeedleOpeningRecord(80, 62.5, 'opening');
assert.deepEqual(fromOpening, {maximumMm: 80, travelMm: 30, openingPercent: 62.5, openingFactor: 0.625});
assert.throws(() => createNeedleOpeningRecord(80, 101, 'opening'), /开度/);

for (const maximum of [0, -1, NaN, Infinity]) {
  assert.throws(() => openingPercentFromTravel(maximum, 0), /最大移动距离/);
  assert.throws(() => travelFromOpeningPercent(maximum, 45), /最大移动距离/);
}
for (const travel of [-1, 81, NaN, Infinity]) {
  assert.throws(() => openingPercentFromTravel(80, travel), /移动距离/);
}
for (const percent of [-1, 101, NaN, Infinity]) {
  assert.throws(() => travelFromOpeningPercent(80, percent), /开度/);
}

console.log('Needle opening: both directions, bounds and invalid inputs passed.');
