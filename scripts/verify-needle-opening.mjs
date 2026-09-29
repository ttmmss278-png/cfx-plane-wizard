import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('../src/needle-opening.ts', import.meta.url)), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020},
}).outputText;
const {openingPercentFromTravel, travelFromOpeningPercent} = await import(
  `data:text/javascript;charset=utf-8,${encodeURIComponent(compiled)}`
);

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
near(openingPercentFromTravel(80, 36), 45);
near(travelFromOpeningPercent(80, 45), 36);
near(openingPercentFromTravel(80, 0), 0);
near(openingPercentFromTravel(80, 80), 100);
near(travelFromOpeningPercent(80, 0), 0);
near(travelFromOpeningPercent(80, 100), 80);
near(travelFromOpeningPercent(0.510387, openingPercentFromTravel(0.510387, 0.22967415)), 0.22967415);

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
