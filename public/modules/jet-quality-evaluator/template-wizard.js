import {buildTemplateConfig, buildTemplateGrid} from './template-core.js?v=1.0.0';

const $ = (selector, root = document) => root.querySelector(selector);
const compactText = value => String(value || '').replace(/\s+/g, ' ').trim();

function getXlsx() {
  const value = window.XLSX;
  if (!value?.utils) throw new Error('Excel 组件尚未加载，请刷新后重试。');
  return value;
}

function currentSnapshot() {
  if (!window.EvaluationWorkbench?.snapshot) throw new Error('评价模块尚未加载，请稍后重试。');
  return window.EvaluationWorkbench.snapshot();
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function saveTemplate(blob, name) {
  let pickerWindow = null;
  try {
    if (window.top && typeof window.top.showSaveFilePicker === 'function') pickerWindow = window.top;
  } catch {}
  if (!pickerWindow && typeof window.showSaveFilePicker === 'function') pickerWindow = window;
  if (!pickerWindow) {
    download(blob, name);
    return {name, fallback: true};
  }
  try {
    const handle = await pickerWindow.showSaveFilePicker({
      suggestedName: name,
      types: [{description: '综合评价数据模板', accept: {'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']}}]
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return {name: handle.name || name, fallback: false};
  } catch (error) {
    if (error?.name === 'AbortError') return null;
    throw error;
  }
}

function createWorkbook(settings, projectName) {
  const XLSX = getXlsx();
  const {normalized, headers, rows} = buildTemplateGrid(settings);
  const workbook = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  dataSheet['!cols'] = headers.map((header, index) => ({wch: Math.min(34, Math.max(index === 0 ? 16 : 20, String(header).length * 2 + 4))}));
  dataSheet['!autofilter'] = {ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}${rows.length + 1}`};
  const notes = [
    ['综合评价导入模板'],
    ['项目名称', projectName || '通用综合评价'],
    ['评价对象数量', normalized.objectNames.length],
    ['每个评价对象的子对象数量', normalized.sectionNames.length],
    ['每个子对象的评价变量数量', normalized.variableNames.length],
    ['填写要求', '只填写“评价数据”工作表；第一列名称可修改，其余单元格必须填写纯数字，不得留空。'],
    ['百分数要求', '偏离圆度、偏移度等百分数指标请填写无量纲小数，例如 8% 填写 0.08，不要输入百分号。'],
    ['导入顺序', '列顺序已经按“子对象 × 评价变量”生成，请勿移动或删除列。'],
    ['子对象', normalized.sectionNames.join('、')],
    ['评价变量', normalized.variableNames.join('、')]
  ];
  const noteSheet = XLSX.utils.aoa_to_sheet(notes);
  noteSheet['!cols'] = [{wch: 24}, {wch: 92}];
  XLSX.utils.book_append_sheet(workbook, dataSheet, '评价数据');
  XLSX.utils.book_append_sheet(workbook, noteSheet, '填写说明');
  return workbook;
}

function makeCountSection(kind, title, count, names, prefix) {
  const section = document.createElement('section');
  section.className = 'template-wizard-section';
  section.dataset.kind = kind;
  section.innerHTML = `<div class="template-wizard-section-head"><strong>${title}</strong><label>数量 <input type="number" min="1" step="1" value="${count}" aria-label="${title}数量"></label></div><div class="template-name-grid"></div>`;
  section._names = names.slice();
  section._prefix = prefix;
  return section;
}

function renderNames(section) {
  const count = Number($('input[type="number"]', section).value);
  const grid = $('.template-name-grid', section);
  const existing = [...grid.querySelectorAll('input[type="text"]')].map(input => input.value);
  section._names = existing.length ? existing : section._names;
  grid.replaceChildren();
  for (let index = 0; index < count; index += 1) {
    const label = document.createElement('label');
    const caption = document.createElement('span');
    const input = document.createElement('input');
    caption.textContent = `${index + 1}`;
    input.type = 'text';
    input.value = section._names[index] || `${section._prefix}${index + 1}`;
    input.setAttribute('aria-label', `${section.querySelector('strong').textContent} ${index + 1} 名称`);
    label.append(caption, input);
    grid.append(label);
  }
}

function readSettings(dialog) {
  const names = kind => [...dialog.querySelectorAll(`[data-kind="${kind}"] .template-name-grid input`)].map(input => input.value);
  return {objectNames: names('objects'), sectionNames: names('sections'), variableNames: names('variables')};
}

function updateSummary(dialog) {
  const objectCount = Number($('[data-kind="objects"] input[type="number"]', dialog).value) || 0;
  const sectionCount = Number($('[data-kind="sections"] input[type="number"]', dialog).value) || 0;
  const variableCount = Number($('[data-kind="variables"] input[type="number"]', dialog).value) || 0;
  $('.template-wizard-summary span', dialog).textContent = `${objectCount} 个评价对象；每个对象 ${sectionCount} 个子对象；每个子对象 ${variableCount} 个变量。模板共 ${1 + sectionCount * variableCount} 列，每个评价对象需填写 ${sectionCount * variableCount} 个数值。`;
}

function toast(message) {
  document.querySelector('.template-wizard-toast')?.remove();
  const node = document.createElement('div');
  node.className = 'template-wizard-toast';
  node.setAttribute('role', 'status');
  node.textContent = message;
  document.body.append(node);
  window.setTimeout(() => node.remove(), 3600);
}

function openWizard() {
  let snapshot;
  try { snapshot = currentSnapshot(); } catch (error) { toast(error.message); return; }
  const backdrop = document.createElement('div');
  backdrop.className = 'template-wizard-backdrop';
  backdrop.innerHTML = `<div class="template-wizard" role="dialog" aria-modal="true" aria-labelledby="template-wizard-title"><header class="template-wizard-head"><div><p>独立综合评价</p><h2 id="template-wizard-title">生成数据导入模板</h2></div><button type="button" class="button ghost template-wizard-close" aria-label="关闭模板向导">×</button></header><div class="template-wizard-body"></div><footer class="template-wizard-actions"><span>导出成功后会同步更新当前评价结构；请填完模板再点击“导入 Excel”。</span><div><button type="button" class="button ghost template-wizard-cancel">取消</button> <button type="button" class="button primary template-wizard-export">应用配置并导出 Excel</button></div></footer></div>`;
  const body = $('.template-wizard-body', backdrop);
  const sections = [
    makeCountSection('objects', '评价对象', snapshot.alternatives.length || 1, snapshot.alternatives.map(item => item.name), '评价对象'),
    makeCountSection('sections', '每个评价对象包含的子对象', snapshot.sections.length || 1, snapshot.sections.map(item => item.name), '子对象'),
    makeCountSection('variables', '每个子对象包含的评价变量', snapshot.indicators.length || 1, snapshot.indicators.map(item => item.name), '评价变量')
  ];
  sections.forEach(section => { body.append(section); renderNames(section); });
  body.insertAdjacentHTML('beforeend', '<div class="template-wizard-summary"><strong>模板结构</strong><span></span></div><div class="template-wizard-error" role="alert"></div>');
  updateSummary(backdrop);

  const close = () => backdrop.remove();
  $('.template-wizard-close', backdrop).onclick = close;
  $('.template-wizard-cancel', backdrop).onclick = close;
  backdrop.addEventListener('mousedown', event => { if (event.target === backdrop) close(); });
  backdrop.addEventListener('input', event => {
    const section = event.target.closest?.('.template-wizard-section');
    if (section && event.target.type === 'number') {
      const max = section.dataset.kind === 'objects' ? 200 : section.dataset.kind === 'sections' ? 100 : 50;
      const value = Math.max(1, Math.min(max, Math.trunc(Number(event.target.value) || 1)));
      event.target.value = String(value);
      renderNames(section);
    }
    updateSummary(backdrop);
    $('.template-wizard-error', backdrop).textContent = '';
  });
  backdrop.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  $('.template-wizard-export', backdrop).onclick = async event => {
    const button = event.currentTarget;
    const errorNode = $('.template-wizard-error', backdrop);
    try {
      button.disabled = true;
      button.textContent = '正在生成…';
      const settings = readSettings(backdrop);
      const config = buildTemplateConfig(settings, snapshot);
      const workbook = createWorkbook(settings, snapshot.projectName);
      const bytes = getXlsx().write(workbook, {bookType: 'xlsx', type: 'array', compression: true});
      const blob = new Blob([bytes], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      const safeName = String(snapshot.projectName || '综合评价').replace(/[\\/:*?"<>|]+/g, '_');
      const saved = await saveTemplate(blob, `${safeName}_数据导入模板.xlsx`);
      if (!saved) { button.disabled = false; button.textContent = '应用配置并导出 Excel'; return; }
      window.EvaluationWorkbench.restore(config);
      document.dispatchEvent(new Event('input', {bubbles: true}));
      close();
      toast(`模板已保存为“${saved.name}”，当前评价结构已同步，填好后可直接导入。`);
    } catch (error) {
      errorNode.textContent = error?.message || '模板生成失败。';
      button.disabled = false;
      button.textContent = '应用配置并导出 Excel';
    }
  };
  document.body.append(backdrop);
  $('.template-wizard-close', backdrop).focus();
}

function installButton() {
  if (document.querySelector('#evaluation-template-wizard')) return true;
  const actionArea = document.querySelector('.file-actions > div:last-child');
  if (!actionArea) return false;
  const importButton = [...actionArea.querySelectorAll('button')].find(button => compactText(button.textContent) === '导入 Excel');
  if (!importButton) return false;
  const button = document.createElement('button');
  button.id = 'evaluation-template-wizard';
  button.type = 'button';
  button.className = 'button ghost';
  button.textContent = '生成导入模板';
  button.onclick = openWizard;
  actionArea.insertBefore(button, importButton);
  return true;
}

if (!installButton()) {
  const observer = new MutationObserver(() => { if (installButton()) observer.disconnect(); });
  observer.observe(document.documentElement, {childList: true, subtree: true});
}

window.EvaluationTemplateWizard = {open: openWizard, createWorkbook};

