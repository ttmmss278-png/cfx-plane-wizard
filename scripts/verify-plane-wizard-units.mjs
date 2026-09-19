import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const bundlePath = new URL("../public/modules/plane-wizard/index.html", import.meta.url);
const helpPath = new URL("../public/modules/plane-wizard/使用说明.html", import.meta.url);
const [bundle, help] = await Promise.all([
  readFile(bundlePath, "utf8"),
  readFile(helpPath, "utf8"),
]);

const match = bundle.match(/const If="cst-circle-section-gen-v1",ra=(\{[\s\S]*?\}),BE=/);
assert.ok(match, "default plane-wizard configuration should be extractable");
const defaults = vm.runInNewContext(`(${match[1]})`);

const vector = (value) => Array.from(value);
assert.equal(defaults.unit, "m");
assert.equal(defaults.bound, 0.00005);
assert.deepEqual(vector(defaults.P1), [0.001, 0, 0]);
assert.deepEqual(vector(defaults.P2), [0, 0.001, 0]);
assert.deepEqual(vector(defaults.P3), [-0.001, 0, 0]);
assert.deepEqual(vector(defaults.C2), [0, 0, 0.01]);
assert.deepEqual(vector(defaults.Q1), [0.001, 0, 0.01]);
assert.deepEqual(vector(defaults.Q2), [0, 0.001, 0.01]);
assert.deepEqual(vector(defaults.Q3), [-0.001, 0, 0.01]);
assert.equal(defaults.distance, 0.002);
assert.match(defaults.cfxTemplate, /Bound Radius = \{bound\} \[\{unit\}\]/);
assert.match(defaults.cfxTemplate, /Point = \{cx\}, \{cy\}, \{cz\} \[\{unit\}\]/);

assert.match(bundle, /输入与输出长度单位/);
assert.match(bundle, /坐标、半径和距离均按此单位填写；CFD-Post 米制坐标请选择 m。/);
assert.match(bundle, /children:"v1\.1"/);
assert.match(help, /默认长度单位为 <code>m<\/code>/);
assert.match(help, /不会自动换算已经填写的数值/);

console.log("Plane wizard metre defaults, CCL unit output and guidance verified.");
