import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../public/modules/def-converter/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'DEF converter script exists');

const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, { value: '', checked: false, disabled: false, textContent: '', style: {}, className: '', innerHTML: '', scrollHeight: 0, scrollTop: 0 });
  return elements.get(id);
}
element('outputDir').value = 'C:\\synthetic-output';
element('cfxPath').value = 'C:\\synthetic-cfx5pre.exe';
element('conflictMode').value = 'overwrite';
element('continueOnError').checked = true;

let resolveStart;
const pendingStart = new Promise(resolve => { resolveStart = resolve; });
let status = { running: true, phase: 'running', message: '正在转换', items: [] };
const requests = [];
const context = vm.createContext({
  document: { getElementById: element, addEventListener() {}, visibilityState: 'visible' },
  window: { addEventListener() {}, location: { origin: 'http://127.0.0.1:5173' }, parent: {} },
  localStorage: { getItem() { return null; }, setItem() {} },
  fetch: async (url) => {
    const path = new URL(url).pathname;
    requests.push(path);
    if (path === '/api/start') await pendingStart;
    if (path === '/api/stop') status = { running: false, phase: 'stopped', message: '任务已由用户停止', items: [] };
    return { ok: true, status: 200, json: async () => path === '/api/status' ? status : { ok: true } };
  },
  confirm: () => true,
  alert() {},
  setTimeout,
  clearTimeout,
  AbortController,
  URL,
});

vm.runInContext(script.replace(/\binit\(\);window\.addEventListener/, 'window.addEventListener'), context);
vm.runInContext("state.serverReady=true;state.sessionToken='x'.repeat(64);state.files=[{path:'C:/sample.cfx',name:'sample.cfx',size:1,status:'waiting'}]", context);

const start = vm.runInContext('startConversion()', context);
assert.equal(element('stopBtn').disabled, false, 'stop is enabled while start request is pending');
assert.equal(element('startBtn').disabled, true, 'duplicate start is disabled');
const stop = vm.runInContext('stopConversion()', context);
await stop;
assert.ok(requests.includes('/api/stop'), 'stop reaches the service while start is pending');
resolveStart();
await start;
assert.equal(element('stopBtn').disabled, true, 'stop is disabled after the task ends');
assert.equal(element('taskNote').textContent, '任务已由用户停止');
console.log('DEF converter UI start/stop state test passed');
