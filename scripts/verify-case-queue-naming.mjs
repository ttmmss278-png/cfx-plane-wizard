import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';

// Execute the generated BAT with fake CFX launchers; no solver/license is used.
const source = fs.readFileSync(new URL('../public/modules/case-queue/cfx_queue_generator.js', import.meta.url), 'utf8');
function generate(values) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {value: values[id] ?? '', tagName: 'INPUT', addEventListener() {}, appendChild() {}});
    return elements.get(id);
  };
  const window = {addEventListener() {}};
  window.parent = window;
  vm.runInNewContext(source, {
    document: {getElementById: element, querySelectorAll: () => [], createElement: () => ({})},
    window, localStorage: {getItem: () => null, setItem() {}},
  });
  return element('batOutput').value;
}

for (const inputFormat of ['cfx', 'def']) {
  const bat = generate({inputFormat, caseList: '4_1.CFX\n4_2.def\n4_1', cores: '2', pauseOnError: 'no'});
  assert.ok(bat.includes('set "CASE_LIST=4_1 4_2"'));
  assert.ok(bat.includes('set "DEF_FILE=%CASE_DIR%\\_cfx_generated\\%CASE_NAME%.def"'));
  assert.ok(!bat.includes('\\_cfx_generated\\input.def'));
  assert.equal(bat.includes('# CFX_QUEUE_CONVERT_PS'), inputFormat === 'cfx');
}

if (process.platform === 'win32' && process.argv[2]) {
  const root = path.resolve(process.argv[2]);
  fs.mkdirSync(root, {recursive: true});
  const work = fs.mkdtempSync(path.join(root, '命名回归-'));
  const bin = path.join(work, 'mock CFX bin');
  const inputs = path.join(work, 'source cases');
  fs.mkdirSync(bin); fs.mkdirSync(inputs);
  const writeBat = (file, text) => fs.writeFileSync(file, text.replace(/\r?\n/g, '\r\n'), 'utf8');
  writeBat(path.join(bin, 'cfx5pre.bat'), '@echo off\n>output.def echo simulated DEF\nexit /b 0\n');
  writeBat(path.join(bin, 'cfx5solve.bat'), `@echo off
if not "%~1"=="-batch" exit /b 10
if not "%~2"=="-def" exit /b 11
if not exist "%~3" exit /b 12
for %%F in ("%~3") do set "RESULT_NAME=%%~nF"
>>"%OUT_ROOT%\\invocations.txt" echo %RESULT_NAME%
>"%RESULT_NAME%_001.out" echo This run of the ANSYS CFX Solver has finished.
>"%RESULT_NAME%_001.res" echo simulated result - not CFD data
exit /b 0
`);
  for (const format of ['cfx', 'def']) {
    for (const name of ['4_1', '4_2']) fs.writeFileSync(path.join(inputs, `${name}.${format}`), 'fixture');
    const output = path.join(work, format + ' results');
    const batPath = path.join(work, format + '-queue.bat');
    writeBat(batPath, generate({cfxSolve: path.join(bin, 'cfx5solve.bat'), defDir: inputs, outRoot: output,
      inputFormat: format, caseList: `4_1.${format}\n4_2.${format}`, cores: '2', pauseOnError: 'no', autoOpenPre: 'no', runMode: 'direct'}));
    const run = suffix => {
      const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'call', batPath], {encoding: 'utf8', input: '\r\n', timeout: 60000});
      fs.writeFileSync(path.join(work, format + suffix + '.log'), (result.stdout || '') + (result.stderr || ''));
      assert.equal(result.status, 0, `${format}: ${result.error || result.stdout || result.stderr}`);
    };
    run('-first');
    for (const name of ['4_1', '4_2']) {
      assert.ok(fs.existsSync(path.join(output, name, `${name}_001.res`)), 'result basename follows case');
      assert.ok(fs.existsSync(path.join(output, name, `${name}_001.out`)), 'OUT/RES names match');
      assert.ok(fs.existsSync(path.join(output, name, '.cfx_queue_completed')), 'completion recognized');
      assert.ok(!fs.existsSync(path.join(output, name, 'input_001.res')));
      if (format === 'cfx') assert.ok(fs.existsSync(path.join(output, name, '_cfx_generated', name + '.def')));
    }
    run('-repeat');
    assert.deepEqual(fs.readFileSync(path.join(output, 'invocations.txt'), 'utf8').trim().split(/\r?\n/), ['4_1', '4_2'], 'completed cases skipped');
  }
  console.log('Windows BAT integration passed: CFX conversion, DEF direct, two case names, paths with spaces/Chinese, completion and repeat skip. Mock CFX only. Records: ' + work);
}
console.log('Queue naming generation checks passed.');
