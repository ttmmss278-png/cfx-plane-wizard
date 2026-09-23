import {readMetricFile,offsetRows,coordinateRows,mergeIndicators,sectionLabel} from './core.js?v=1.1.0';
import {buildMetricChart} from './chart.js';
import {MAX_BYTES,readWorkbench,validateEvaluation} from './project.js';
import {confirmAction,attachImportStatus,attachChartViewer} from '../shared/feedback.js';

const $=id=>document.getElementById(id);
$('toggle-header').onclick=()=>{
  const compact=document.body.classList.toggle('compact-header');
  $('toggle-header').textContent=compact?'展开顶部说明':'收起顶部说明';
  $('toggle-header').setAttribute('aria-expanded',String(!compact));
};
const metrics={offset:{rows:[],name:'',visible:null},uniformity:{rows:[],name:'',visible:null}};
const tickets={offset:0,uniformity:0};
const pending={offset:false,uniformity:false};
let tab='roundness',offsetCalculated=false,offsetResults=[],dirty=false,restoring=false,projectTicket=0,projectPending=false,evaluationSource='direct';
let evaluationTouched=false, progressFrame=0, inlineSelectorFrame=0;
let evaluationCatalog=null,selectedSectionIds=[];
const roundnessFrame=$('roundness-frame'),evaluationFrame=$('evaluation-frame');
const titles={offset:'射流偏移度',uniformity:'速度均匀性'};
const status=(message,error=false)=>{$('workbench-status').textContent=message;$('workbench-status').classList.toggle('error',error);};
function setDirty(value=true){dirty=value;queueProgress();if(window.parent!==window)window.parent.postMessage({type:'pelton-toolbox-dirty',dirty},location.origin);}
function queueProgress(){if(!progressFrame)progressFrame=requestAnimationFrame(()=>{progressFrame=0;renderProgress();});}
function renderProgress(){
  const values={roundness:['busy','加载中'],offset:pending.offset?['busy','读取中']:offsetCalculated&&offsetResults.length?['done','已完成']:metrics.offset.rows.length?['warning','待计算']:['idle','待导入'],uniformity:pending.uniformity?['busy','读取中']:metrics.uniformity.rows.length?['done','已完成']:['idle','待导入'],evaluation:['idle','可直接评价']};
  const roundness=roundnessFrame.contentWindow?.RoundnessWorkbench;
  if(roundness?.progress)values.roundness=roundness.progress();
  if(evaluationSource==='stale')values.evaluation=['warning','待更新'];
  else if(evaluationTouched || evaluationSource==='linked'){
    try{
      const win=evaluationFrame.contentWindow,config=win.EvaluationWorkbench.snapshot();
      values.evaluation=win.JetQualityCalculation.validate(config).valid?['done','已完成']:['warning','需检查'];
    }catch{values.evaluation=['warning','编辑中'];}
  }
  for(const [name,[state,label]]of Object.entries(values)){
    let badge=$('progress-'+name);
    if(!badge){badge=document.createElement('span');badge.id='progress-'+name;badge.className='tab-progress';badge.setAttribute('role','status');$('tab-'+name).append(badge);}
    const next=`${state==='done'?'✓':state==='warning'?'!':state==='busy'?'…':'○'} ${label}`;
    if(badge.textContent!==next)badge.textContent=next;
    badge.dataset.state=state;
    badge.setAttribute('aria-label',`${name==='roundness'?'偏离圆度':name==='evaluation'?'综合评价':titles[name]}：${label}`);
  }
}
function changed(){if(restoring)return;setDirty();if(evaluationSource==='linked')evaluationSource='stale';renderMergeStatus();}
function renderMergeStatus(){
  const selection=evaluationCatalog?` 当前选择 ${selectedSectionIds.length}/${evaluationCatalog.sections.length} 个截面。`:'';
  $('merge-state').textContent=evaluationSource==='stale'?`前置数据已变更：当前评价保留上次汇总的数据，请重新汇总后使用。${selection}`:evaluationSource==='linked'?`已汇总三个指标。偏离圆度、偏移度已换算为无量纲小数；方法、权重和基准仍可自行设置。${selection}`:'独立评价模式：不要求导入前三项；下方保留现有评价项目 / 示例，请导入自己的数据后使用。';
  renderSectionSelectorState();
}
function selectTab(next){
  tab=next;
  document.querySelectorAll('[data-tab]').forEach(button=>{if(button.dataset.tab===next)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  for(const name of ['roundness','offset','uniformity','evaluation'])$('pane-'+name).hidden=name!==next;
}
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>selectTab(button.dataset.tab)));
$('direct-evaluation').addEventListener('click',()=>selectTab('evaluation'));

function makeMetricPane(kind){
  const offset=kind==='offset';
  $('pane-'+kind).innerHTML=`<section class="panel metric-import"><div><h2>${offset?'导入射流偏移量':'导入速度均匀性系数'}</h2><p>CSV / TXT / Excel（.xlsx / .xls）<br>首列为截面 X/D，后续表头为 PZ1、PZ2…；${offset?'偏移量单位固定为 m。':'数值直接使用 0～1 系数，不乘 100。'}</p><div class="wb-actions"><button class="button secondary" id="import-${kind}">添加${offset?'偏移量':'速度均匀性'}数据</button><button class="button secondary" id="clear-${kind}">清空本项数据</button></div><input id="file-${kind}" type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" hidden><p id="meta-${kind}" role="status">尚未导入文件</p></div><div class="metric-settings">${offset?'<label for="diameter">喷嘴直径 D（所有喷嘴共用）</label><div class="diameter-controls"><input id="diameter" type="number" min="0" step="any" placeholder="请输入直径"><select id="diameter-unit" aria-label="喷嘴直径单位"><option value="mm">mm</option><option value="m">m</option></select><button class="button primary" id="calculate-offset">计算偏移度</button></div><p>射流偏移度 A = 偏移量 (m) ÷ 喷嘴直径 (m) × 100%<br>修改直径后须重新计算，旧曲线不会继续使用。</p>':'<h2>速度均匀性系数</h2><p>直接绘制表中的原始系数，越接近 1 越好。纵轴根据实际数据范围自动调整，以显示细微差别。</p><p>导入后即可生成曲线，无需再次计算。</p>'}</div></section><section class="panel" id="result-${kind}" hidden><div class="metric-tools"><h2>${titles[kind]}随截面变化</h2><div class="wb-actions"><button class="button secondary" id="xy-${kind}">导出横纵坐标</button><button class="button secondary" id="csv-${kind}">导出 CSV</button><button class="button secondary" id="png-${kind}">导出 PNG</button><button class="button secondary" id="svg-${kind}">导出 SVG</button></div></div><p class="note">按实际 X/D 排序连接原始数据，不平滑、不插值。坐标导出首列为截面（0.5、1.0…），后续为所选喷嘴${offset?'偏移度百分数数值，例如 3 表示 3%，不带百分号。':'原始系数，不带百分号。'}</p><fieldset class="metric-filters" id="filters-${kind}"><legend>显示喷嘴</legend></fieldset><div class="metric-chart-wrap" id="chart-${kind}" tabindex="0" role="region" aria-label="${titles[kind]}曲线，窄屏可横向滚动"></div><div class="table-wrap" tabindex="0" style="margin-top:16px"><table class="metric-table" id="table-${kind}"></table></div></section>`;
  $('import-'+kind).onclick=()=>$('file-'+kind).click();
  $('file-'+kind).onchange=async()=>{
    const input=$('file-'+kind),file=input.files?.[0];input.value='';if(!file)return;
    beginSessionImport(kind);
    const ticket=++tickets[kind];pending[kind]=true;queueProgress();status(`正在读取 ${file.name}…`);$('meta-'+kind).textContent=`${file.name} · 正在读取…`;
    try{
      const rows=await readMetricFile(file,kind,window.XLSX);
      if(ticket!==tickets[kind])return;
      metrics[kind]={rows,name:file.name,visible:null};
      if(offset){offsetCalculated=false;offsetResults=[];}
      finishSessionImport(kind,true);
      renderMetric(kind);changed();status(`已导入 ${file.name}，${rows.length} 个数值。${offset?'设置直径后点击“计算偏移度”。':'曲线已生成。'}`);
    }catch(error){if(ticket===tickets[kind]){finishSessionImport(kind,false);status(`导入失败：${error.message} 原数据未更改。`,true);$('meta-'+kind).textContent=`导入失败：${error.message}。${metrics[kind].rows.length?'仍保留上次数据：'+metrics[kind].name:'尚无数据'}`;}}
    finally{if(ticket===tickets[kind])pending[kind]=false;queueProgress();}
  };
  $('clear-'+kind).onclick=async()=>{
    if(metrics[kind].rows.length&&!await confirmAction(`清空${titles[kind]}的导入数据和曲线？其他指标及直径不受影响。`))return;
    tickets[kind]++;pending[kind]=false;metrics[kind]={rows:[],name:'',visible:null};
    if(offset){offsetCalculated=false;offsetResults=[];}
    renderMetric(kind);changed();status(`已清空${titles[kind]}。`);
  };
  $('filters-'+kind).onchange=()=>{metrics[kind].visible=[...$('filters-'+kind).querySelectorAll('input:checked')].map(input=>Number(input.value));renderMetric(kind,false);setDirty();};
  for(const format of ['xy','csv','png','svg'])$(format+'-'+kind).onclick=()=>void exportMetric(kind,format);
  attachImportStatus($('meta-'+kind));attachChartViewer($('chart-'+kind),titles[kind]+'随截面变化');
}
makeMetricPane('offset');makeMetricPane('uniformity');
const DIAMETER_LOCK_KEY='pelton-quality-diameter-lock-v1';
let diameterLocked=false;
const diameterLockButton=document.createElement('button');
diameterLockButton.id='toggle-diameter-lock';diameterLockButton.type='button';diameterLockButton.className='button secondary';
$('calculate-offset').before(diameterLockButton);
const diameterLockHint=document.createElement('p');
diameterLockHint.id='diameter-lock-hint';diameterLockHint.className='diameter-lock-hint';diameterLockHint.setAttribute('role','status');
$('diameter').closest('.diameter-controls').after(diameterLockHint);
function validDiameter(value,unit){return String(value).trim()!==''&&Number.isFinite(Number(value))&&Number(value)>0&&['m','mm'].includes(unit);}
function setDiameterLocked(locked,persist=true){
  if(locked&&!validDiameter($('diameter').value,$('diameter-unit').value))throw new Error('请先填写大于 0 的喷嘴直径并确认单位。');
  diameterLocked=locked;
  $('diameter').disabled=locked;$('diameter-unit').disabled=locked;
  diameterLockButton.textContent=locked?'修改直径':'锁定直径';
  diameterLockButton.setAttribute('aria-pressed',String(locked));
  diameterLockHint.textContent=locked?`已锁定 ${$('diameter').value} ${$('diameter-unit').value}，下次打开仍可沿用。`:'锁定后，下次打开可直接沿用这个直径。';
  if(persist){try{if(locked)localStorage.setItem(DIAMETER_LOCK_KEY,JSON.stringify({value:$('diameter').value,unit:$('diameter-unit').value}));else localStorage.removeItem(DIAMETER_LOCK_KEY);}catch{}}
}
try{
  const saved=JSON.parse(localStorage.getItem(DIAMETER_LOCK_KEY)||'null');
  if(saved&&validDiameter(saved.value,saved.unit)){$('diameter').value=saved.value;$('diameter-unit').value=saved.unit;setDiameterLocked(true,false);}
  else setDiameterLocked(false,false);
}catch{setDiameterLocked(false,false);}
diameterLockButton.onclick=()=>{
  try{setDiameterLocked(!diameterLocked);setDirty();status(diameterLocked?'喷嘴直径已锁定；导入新的偏移量后可直接计算。':'喷嘴直径已解锁，修改后请重新计算。');}
  catch(error){status(error.message,true);}
};
for(const id of ['diameter','diameter-unit'])$(id).addEventListener('input',()=>{offsetCalculated=false;offsetResults=[];renderMetric('offset');changed();});
$('calculate-offset').onclick=()=>{
  try{if(pending.offset)throw new Error('请等待偏移量导入完成。');if(!metrics.offset.rows.length)throw new Error('请先导入偏移量数据。');offsetResults=offsetRows(metrics.offset.rows,$('diameter').value,$('diameter-unit').value);offsetCalculated=true;renderMetric('offset');changed();status('偏移度计算完成，曲线与数据表已更新。');}catch(error){status(error.message,true);}
};
function resultRows(kind){return kind==='offset'?offsetResults:metrics.uniformity.rows;}
function renderMetric(kind,rebuildFilters=true){
  const data=metrics[kind],rows=resultRows(kind);
  $('meta-'+kind).textContent=data.rows.length?`${data.name} · ${data.rows.length} 个数值 · ${new Set(data.rows.map(row=>row.nozzle)).size} 个喷嘴`:'尚未导入文件';
  $('result-'+kind).hidden=!rows.length;
  if(rebuildFilters){
    const field=$('filters-'+kind);field.replaceChildren();const legend=document.createElement('legend');legend.textContent='显示喷嘴';field.append(legend);
    [...new Set(rows.map(row=>row.nozzle))].sort((a,b)=>a-b).forEach(n=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=String(n);input.checked=data.visible==null||data.visible.includes(n);label.append(input,`PZ${n}`);field.append(label);});
  }
  const svg=buildMetricChart(rows,kind,data.visible);
  $('chart-'+kind).innerHTML=svg||'<p class="chart-empty">请勾选至少一个喷嘴。</p>';
  for(const format of ['xy','csv','png','svg'])$(format+'-'+kind).disabled=!svg;
  const table=$('table-'+kind);table.replaceChildren();
  coordinateRows(rows,data.visible).forEach((row,index)=>{const tr=document.createElement('tr');row.forEach((value,col)=>{const cell=document.createElement(index===0?'th':'td');cell.textContent=value==null?'—':typeof value==='number'?(col===0?sectionLabel(value):Number(value.toPrecision(9)).toString()):value;tr.append(cell);});table.append(tr);});
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function saveBlobToChosenPath(blob,name){
  let pickerWindow=null;
  try{
    if(window.top&&typeof window.top.showSaveFilePicker==='function')pickerWindow=window.top;
  }catch{}
  if(!pickerWindow&&typeof window.showSaveFilePicker==='function')pickerWindow=window;
  if(!pickerWindow){
    download(blob,name);
    return {name,fallback:true};
  }
  try{
    const handle=await pickerWindow.showSaveFilePicker({
      suggestedName:name,
      types:[{description:'射流质量完整项目',accept:{'application/json':['.json']}}]
    });
    const writable=await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return {name:handle.name||name,fallback:false};
  }catch(error){
    if(error?.name==='AbortError')return null;
    throw error;
  }
}
async function exportMetric(kind,format){
  try{
    const data=metrics[kind],rows=resultRows(kind),svg=buildMetricChart(rows,kind,data.visible);if(!svg)return;
    const base=(data.name.replace(/\.[^.]+$/,'')||titles[kind])+'_'+titles[kind];
    if(format==='svg'){download(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),base+'.svg');return;}
    if(format==='png'){
      const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);
      try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width*2;canvas.height=image.height*2;canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw new Error('图片生成失败');download(png,base+'.png');}finally{URL.revokeObjectURL(url);}return;
    }
    const XLSX=window.XLSX,coords=coordinateRows(rows,data.visible),sheet=XLSX.utils.aoa_to_sheet(coords);sheet['!cols']=coords[0].map(()=>({wch:18}));
    for(const [key,cell]of Object.entries(sheet))if(!key.startsWith('!')&&cell.t==='n')cell.z=/^A\d+$/.test(key)?'0.0#########':'0.000000######';
    if(format==='csv'){download(new Blob(['\uFEFF',XLSX.utils.sheet_to_csv(sheet)],{type:'text/csv;charset=utf-8'}),base+'_横纵坐标.csv');return;}
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'横纵坐标');
    const meta=XLSX.utils.aoa_to_sheet([['指标',titles[kind]],['来源文件',data.name],['横轴','X/D'],['纵轴单位',kind==='offset'?'百分数数值（3 表示 3%，无百分号）':'无量纲原始系数'],...(kind==='offset'?[['偏移量单位','m'],['喷嘴直径',Number($('diameter').value)],['直径单位',$('diameter-unit').value]]:[])]);meta['!cols']=[{wch:20},{wch:65}];XLSX.utils.book_append_sheet(book,meta,'说明');
    download(new Blob([XLSX.write(book,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),base+'_横纵坐标.xlsx');
  }catch(error){status(`导出失败：${error.message}`,true);}
}

function api(frame,name){const value=frame.contentWindow?.[name];if(!value)throw new Error('模块尚在加载，请稍后重试。');return value;}
function ensureIdle(){if(projectPending||pending.offset||pending.uniformity)throw new Error('请等待文件读取完成。');}
function mergeVisibleIntoCatalog(visible){
  if(!evaluationCatalog)return visible;
  const visibleSections=new Map(visible.sections.map(section=>[section.id,section]));
  const selectedBefore=new Set(selectedSectionIds);
  const deleted=new Set([...selectedBefore].filter(id=>!visibleSections.has(id)));
  const sections=evaluationCatalog.sections.filter(section=>!deleted.has(section.id)).map(section=>visibleSections.get(section.id)??section);
  for(const section of visible.sections)if(!sections.some(item=>item.id===section.id))sections.push(section);
  const previousAlternatives=evaluationCatalog.alternatives||[];
  const alternatives=visible.alternatives.map(alternative=>{
    const previous=previousAlternatives.find(item=>item.id===alternative.id)||previousAlternatives.find(item=>item.name===alternative.name);
    return {...alternative,values:{...(previous?.values||{}),...(alternative.values||{})}};
  });
  selectedSectionIds=visible.sections.map(section=>section.id);
  evaluationCatalog={...evaluationCatalog,...visible,sections,alternatives};
  return visible;
}
function captureLinkedEvaluation(){
  const visible=api(evaluationFrame,'EvaluationWorkbench').snapshot();
  return evaluationCatalog?mergeVisibleIntoCatalog(visible):visible;
}
function selectedEvaluationConfig(){
  if(!evaluationCatalog)return null;
  const selected=new Set(selectedSectionIds);
  return {...structuredClone(evaluationCatalog),sections:structuredClone(evaluationCatalog.sections.filter(section=>selected.has(section.id)))};
}
function restoreLinkedSelection(){
  const config=selectedEvaluationConfig();
  if(config)api(evaluationFrame,'EvaluationWorkbench').restore(config);
}
function queueInlineSectionSelector(){
  if(!inlineSelectorFrame)inlineSelectorFrame=requestAnimationFrame(()=>{inlineSelectorFrame=0;renderInlineSectionSelector();});
}
function renderInlineSectionSelector(){
  const doc=evaluationFrame.contentDocument;
  if(!doc?.body)return;
  const existing=doc.querySelector('.quality-inline-section-selector');
  if(!evaluationCatalog){existing?.remove();return;}
  const sectionList=doc.querySelector('.config-layout > .subsection:first-child .section-list');
  if(!sectionList)return;
  const signature=JSON.stringify({sections:evaluationCatalog.sections.map(section=>[section.id,section.name,section.position]),selected:selectedSectionIds});
  if(existing?.dataset.signature===signature)return;
  const selector=existing||doc.createElement('section');
  selector.className='quality-inline-section-selector';
  selector.dataset.signature=signature;
  selector.setAttribute('aria-label','选择参与评价的截面');
  selector.replaceChildren();

  const head=doc.createElement('div');head.className='quality-inline-selector-head';
  const titleWrap=doc.createElement('div');
  const title=doc.createElement('strong');title.textContent='参与评价的截面';
  const summary=doc.createElement('small');
  titleWrap.append(title,summary);
  const actions=doc.createElement('div');actions.className='quality-inline-selector-actions';
  const selectAll=doc.createElement('button');selectAll.type='button';selectAll.textContent='全选';
  const clear=doc.createElement('button');clear.type='button';clear.textContent='清空';
  const apply=doc.createElement('button');apply.type='button';apply.className='quality-inline-selector-apply';apply.textContent='应用选择';
  actions.append(selectAll,clear,apply);head.append(titleWrap,actions);

  const grid=doc.createElement('div');grid.className='quality-inline-selector-grid';
  const selected=new Set(selectedSectionIds);
  evaluationCatalog.sections.forEach((section,index)=>{
    const option=doc.createElement('label');option.className='quality-inline-section-choice';
    const input=doc.createElement('input');input.type='checkbox';input.value=section.id;input.checked=selected.has(section.id);
    input.setAttribute('aria-label',`选择 ${section.name||`截面 ${index+1}`} ${section.position||''}`.trim());
    const indexBadge=doc.createElement('span');indexBadge.className='quality-inline-section-index';indexBadge.textContent=`S${String(index+1).padStart(2,'0')}`;
    const copy=doc.createElement('span');copy.className='quality-inline-section-copy';
    const name=doc.createElement('b');name.textContent=section.name||`截面 ${index+1}`;
    const position=doc.createElement('small');position.textContent=section.position||'未设置位置';
    copy.append(name,position);option.append(input,indexBadge,copy);grid.append(option);
  });
  const error=doc.createElement('p');error.className='quality-inline-selector-error';error.setAttribute('role','alert');
  const selectedListLabel=doc.createElement('div');selectedListLabel.className='quality-inline-selected-label';

  const updateDraft=()=>{
    const count=grid.querySelectorAll('input:checked').length;
    summary.textContent=`已选 ${count}/${evaluationCatalog.sections.length}`;
    error.textContent='';
  };
  grid.addEventListener('change',updateDraft);
  selectAll.addEventListener('click',()=>{grid.querySelectorAll('input').forEach(input=>input.checked=true);updateDraft();});
  clear.addEventListener('click',()=>{grid.querySelectorAll('input').forEach(input=>input.checked=false);updateDraft();});
  apply.addEventListener('click',()=>{
    const ids=[...grid.querySelectorAll('input:checked')].map(input=>input.value);
    if(!ids.length){error.textContent='至少选择一个评价截面。';return;}
    try{captureLinkedEvaluation();selectedSectionIds=ids;restoreLinkedSelection();}
    catch(reason){error.textContent=reason.message;return;}
    evaluationTouched=true;setDirty();renderMergeStatus();queueProgress();queueInlineSectionSelector();
    status(`已应用 ${ids.length} 个评价截面，评价数据、权重和排名已按新组合更新。`);
  });
  selectedListLabel.textContent='当前评价截面（可编辑名称与位置）';
  selector.append(head,grid,error,selectedListLabel);
  if(!existing)sectionList.before(selector);
  updateDraft();
}
function renderSectionSelectorState(){
  const button=$('select-sections');
  button.hidden=!evaluationCatalog;
  if(evaluationCatalog){
    $('selected-section-count').textContent=`${selectedSectionIds.length}/${evaluationCatalog.sections.length}`;
    button.setAttribute('aria-label',`选择评价截面，当前已选 ${selectedSectionIds.length} 个，共 ${evaluationCatalog.sections.length} 个`);
  }
  queueInlineSectionSelector();
}
function renderSectionPicker(){
  const grid=$('section-picker-grid');grid.replaceChildren();
  const selected=new Set(selectedSectionIds);
  evaluationCatalog.sections.forEach((section,index)=>{
    const label=document.createElement('label');label.className='section-picker-option';label.dataset.search=`${section.name} ${section.position}`.toLowerCase();
    const input=document.createElement('input');input.type='checkbox';input.value=section.id;input.checked=selected.has(section.id);input.setAttribute('aria-label',`选择 ${section.name} ${section.position}`);
    const name=document.createElement('strong');name.textContent=section.name||`截面 ${index+1}`;
    const position=document.createElement('small');position.textContent=section.position||'未设置位置';
    label.append(input,name,position);grid.append(label);
  });
  $('section-picker-search').value='';$('section-picker-error').textContent='';updateSectionPickerSummary();
}
function updateSectionPickerSummary(){
  const total=$('section-picker-grid').querySelectorAll('input').length,checked=$('section-picker-grid').querySelectorAll('input:checked').length;
  $('section-picker-summary').textContent=`已选择 ${checked} / ${total} 个截面`;
}
function openSectionPicker(){
  if(!evaluationCatalog)return;
  try{captureLinkedEvaluation();}catch(error){status(error.message,true);return;}
  renderSectionPicker();$('section-picker-backdrop').hidden=false;$('section-picker-search').focus();
}
function closeSectionPicker(){$('section-picker-backdrop').hidden=true;}
$('select-sections').onclick=openSectionPicker;
$('close-section-picker').onclick=closeSectionPicker;$('cancel-section-picker').onclick=closeSectionPicker;
$('section-picker-backdrop').addEventListener('mousedown',event=>{if(event.target===$('section-picker-backdrop'))closeSectionPicker();});
$('section-picker-grid').addEventListener('change',()=>{$('section-picker-error').textContent='';updateSectionPickerSummary();});
$('section-picker-search').addEventListener('input',event=>{const query=event.target.value.trim().toLowerCase();$('section-picker-grid').querySelectorAll('.section-picker-option').forEach(option=>{option.hidden=Boolean(query&&!option.dataset.search.includes(query));});});
$('select-all-sections').onclick=()=>{$('section-picker-grid').querySelectorAll('input').forEach(input=>{if(!input.closest('.section-picker-option').hidden)input.checked=true;});updateSectionPickerSummary();};
$('clear-all-sections').onclick=()=>{$('section-picker-grid').querySelectorAll('input').forEach(input=>{if(!input.closest('.section-picker-option').hidden)input.checked=false;});updateSectionPickerSummary();};
$('apply-section-picker').onclick=()=>{
  const ids=[...$('section-picker-grid').querySelectorAll('input:checked')].map(input=>input.value);
  if(!ids.length){$('section-picker-error').textContent='至少选择一个评价截面。';return;}
  selectedSectionIds=ids;restoreLinkedSelection();closeSectionPicker();evaluationTouched=true;setDirty();renderMergeStatus();queueProgress();
  status(`已选择 ${ids.length} 个评价截面，其余 ${evaluationCatalog.sections.length-ids.length} 个截面仍保留，可随时换选。`);
};
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('section-picker-backdrop').hidden)closeSectionPicker();});
$('merge-indicators').onclick=async()=>{
  try{
    ensureIdle();
    const roundness=api(roundnessFrame,'RoundnessWorkbench').getRows();
    const evaluator=api(evaluationFrame,'EvaluationWorkbench');
    const previous=evaluationCatalog?(captureLinkedEvaluation(),structuredClone(evaluationCatalog)):evaluator.snapshot();
    const previouslySelectedPositions=evaluationCatalog?new Set(evaluationCatalog.sections.filter(section=>selectedSectionIds.includes(section.id)).map(section=>String(section.position))):null;
    if(!offsetCalculated)throw new Error('请先计算射流偏移度。');
    const config=mergeIndicators(roundness,offsetResults,metrics.uniformity.rows,previous);
    validateEvaluation(config);
    if(!await confirmAction('将用三个射流指标替换综合评价中的指标、截面和对象数据。匹配到的权重、基准及当前评价方法会保留；新截面默认权重为 1，可自行修改。建议先保存完整项目。继续？','汇总射流指标'))return;
    evaluationCatalog=structuredClone(config);
    selectedSectionIds=previouslySelectedPositions?[...config.sections.filter(section=>previouslySelectedPositions.has(String(section.position))).map(section=>section.id)]:config.sections.map(section=>section.id);
    if(!selectedSectionIds.length)selectedSectionIds=config.sections.map(section=>section.id);
    restoreLinkedSelection();evaluationSource='linked';selectTab('evaluation');renderMergeStatus();setDirty();
    requestAnimationFrame(()=>requestAnimationFrame(openSectionPicker));
    status('三个指标已汇总。请勾选本次参与评价的截面；未勾选截面不会丢失，之后可以随时换选。');
  }catch(error){status(error.message,true);}
};

function snapshot(){
  ensureIdle();
  const evaluation=captureLinkedEvaluation();
  return {format:'pelton-quality-workbench',version:1,savedAt:new Date().toISOString(),units:{offset:'m',uniformity:'coefficient'},tab,
    diameter:$('diameter').value,diameterUnit:$('diameter-unit').value,diameterLocked,offsetCalculated,metrics:structuredClone(metrics),evaluationSource,evaluationTouched,
    roundness:api(roundnessFrame,'RoundnessWorkbench').snapshot(),evaluation,
    evaluationCatalog:evaluationCatalog?structuredClone(evaluationCatalog):null,selectedSectionIds:evaluationCatalog?[...selectedSectionIds]:[]};
}
$('save-project').onclick=async()=>{
  try{
    const project=snapshot(),source=JSON.stringify(project);readWorkbench(source);
    const blob=new Blob([source],{type:'application/json'});if(blob.size>MAX_BYTES)throw new Error('完整项目超过 256 MB，请减少轮廓数据。');
    const result=await saveBlobToChosenPath(blob,'指标与综合评价_'+new Date().toISOString().slice(0,10)+'.quality.json');
    if(!result){status('已取消保存，当前项目未更改。');return;}
    setDirty(false);
    status(result.fallback?'当前浏览器不支持选择保存路径，完整项目已下载。':`完整项目已保存至“${result.name}”，包含原始数据、轴线、直径、绘图筛选和综合评价设置。`);
  }catch(error){status(`保存失败：${error.message}`,true);}
};
$('open-project').onclick=()=>$('project-file').click();
$('project-file').onchange=async()=>{
  const input=$('project-file'),file=input.files?.[0];input.value='';if(!file)return;
  await openWorkbenchFile(file);
};
async function openWorkbenchFile(file,fromCache=false){
  const ticket=++projectTicket;
  try{
    ensureIdle();projectPending=true;status('正在校验完整项目…');
    if(file.size>MAX_BYTES)throw new Error('项目超过 256 MB。');
    const project=readWorkbench(await file.text());if(ticket!==projectTicket)return;
    const roundness=api(roundnessFrame,'RoundnessWorkbench'),evaluator=api(evaluationFrame,'EvaluationWorkbench');
    if(!await confirmAction('打开完整项目将替换四个页面的当前数据和设置。未保存内容将丢失，是否继续？','打开完整项目')){status('已取消，当前数据未更改。');return;}
    restoring=true;
    // All structures and the roundness calculation were validated before mutation.
    for(const kind of ['offset','uniformity']){tickets[kind]++;pending[kind]=false;metrics[kind]=project.metrics[kind];}
    const keepLegacyLock=project.diameterLocked===undefined&&diameterLocked&&project.diameter===$('diameter').value&&project.diameterUnit===$('diameter-unit').value;
    $('diameter').value=project.diameter;$('diameter-unit').value=project.diameterUnit;
    setDiameterLocked(project.diameterLocked===true||keepLegacyLock);
    offsetCalculated=project.offsetCalculated;offsetResults=offsetCalculated?offsetRows(metrics.offset.rows,project.diameter,project.diameterUnit):[];
    roundness.restore(project.roundness);
    evaluationCatalog=project.evaluationCatalog?structuredClone(project.evaluationCatalog):null;
    selectedSectionIds=evaluationCatalog?[...project.selectedSectionIds]:[];
    if(evaluationCatalog)restoreLinkedSelection();else evaluator.restore(project.evaluation);
    evaluationSource=['direct','linked','stale'].includes(project.evaluationSource)?project.evaluationSource:'direct';
    evaluationTouched=project.evaluationTouched ?? true;
    renderMetric('offset');renderMetric('uniformity');renderMergeStatus();selectTab(project.tab);finishSessionChoice(fromCache);setDirty(false);status(`已恢复 ${file.name}。`);
    return true;
  }catch(error){status(`打开失败：${error.message}`,true);return false;}
  finally{restoring=false;if(ticket===projectTicket)projectPending=false;}
}

// IndexedDB keeps large contour datasets out of localStorage. Never replace a
// previous session until the user has chosen whether to restore it.
let cacheReady=false,cacheBusy=false,lastCached='',cachedProject=null,sessionChoiceClosed=false;
const sessionImports=new Set();
const SESSION_GENERATION_KEY='pelton-quality-session-generation-v1';
let sessionGeneration='';
try{sessionGeneration=localStorage.getItem(SESSION_GENERATION_KEY)||'';}catch{}
const cacheNote=document.createElement('span');cacheNote.id='cache-status';cacheNote.setAttribute('role','status');
cacheNote.style.cssText='font-size:11px;color:var(--muted);';$('toggle-header').before(cacheNote);
function finishSessionChoice(preserveGeneration=false){
 if(!sessionChoiceClosed&&!preserveGeneration){
  sessionGeneration=`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try{localStorage.setItem(SESSION_GENERATION_KEY,sessionGeneration);}catch{}
 }
 sessionChoiceClosed=true;sessionImports.clear();cachedProject=null;cacheReady=true;
 document.querySelectorAll('.session-choice').forEach(button=>button.remove());
 cacheNote.textContent='数据自动保存在本机';
}
function beginSessionImport(kind){
 if(sessionChoiceClosed)return;
 sessionImports.add(kind);
 document.querySelectorAll('.session-choice').forEach(button=>button.disabled=true);
}
function finishSessionImport(kind,succeeded){
 if(sessionChoiceClosed)return;
 sessionImports.delete(kind);
 if(succeeded){finishSessionChoice();return;}
 if(!sessionImports.size)document.querySelectorAll('.session-choice').forEach(button=>button.disabled=false);
}
function cacheStore(mode,value){return new Promise((resolve,reject)=>{
 const request=indexedDB.open('pelton-quality-session',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('sessions');
 request.onerror=()=>reject(request.error);
 request.onsuccess=()=>{const db=request.result,tx=db.transaction('sessions',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('sessions');
 const op=mode==='get'?store.get('latest'):store.put(value,'latest');let result;
 op.onsuccess=()=>{result=op.result;};tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(tx.error);};};
});}
cacheStore('get').then(value=>{
 if(sessionChoiceClosed)return;
 if(value&&sessionGeneration){
  try{if(JSON.parse(value).sessionGeneration!==sessionGeneration)value=null;}catch{value=null;}
 }
 if(!value){cacheReady=true;cacheNote.textContent='数据自动保存在本机';return;}
 cachedProject=value;cacheNote.textContent='';
 for(const [label,restore]of [['恢复上次数据',true],['开始新会话',false]]){
 const button=document.createElement('button');button.className=`button ${restore?'primary':'secondary'} session-choice`;button.textContent=label;
 button.onclick=async()=>{
 if(!restore&&!await confirmAction('开始新会话后，后续操作将更新本机自动备份。建议先恢复并导出需要保留的旧项目。继续？'))return;
  if(restore){if(!await openWorkbenchFile(new File([cachedProject],'上次本机自动保存.quality.json',{type:'application/json'}),true))return;}
  finishSessionChoice();
  };button.disabled=sessionImports.size>0;cacheNote.before(button);}
}).catch(()=>{cacheNote.textContent='本机存储不可用，请保存完整项目文件';});
setInterval(async()=>{
 if(!cacheReady||cacheBusy||restoring||projectPending)return;
 let source;
 try{const project=snapshot();project.savedAt='';project.sessionGeneration=sessionGeneration;source=JSON.stringify(project);}catch{return;}
 if(source===lastCached)return;
 cacheBusy=true;
 try{if(new Blob([source]).size>MAX_BYTES)throw Error('数据过大');await cacheStore('put',source);lastCached=source;cacheNote.textContent='✓ 已自动保存到本机';}
 catch{cacheNote.textContent='自动保存失败，请保存完整项目文件';}
 finally{cacheBusy=false;}
},2500);

function syncSkin(){
  const skins=['tech-neon','fresh-cartoon','watercolor','mechanical-cartoon'];let skin='tech-neon';
  try{skin=window.parent.document.documentElement.dataset.peltonSkin||localStorage.getItem('pelton-toolbox-skin-v1')||skin;}catch{}
  if(!skins.includes(skin))skin='tech-neon';
  document.documentElement.dataset.peltonSkin=skin;
  for(const frame of [roundnessFrame,evaluationFrame]){if(frame.contentDocument?.documentElement)frame.contentDocument.documentElement.dataset.peltonSkin=skin;}
  window.dispatchEvent(new Event('pelton-skin-change'));
}
function prepareFrame(frame,id){
  const doc=frame.contentDocument;if(!doc?.body)return;
  if(doc.documentElement.dataset.qualityPrepared)return;
  doc.documentElement.dataset.qualityPrepared='true';
  doc.documentElement.dataset.peltonEmbedded='true';doc.body.classList.add('toolbox-embedded',`toolbox-module-${id}`);
  for(const file of ['embedded-modules.css?v=3.5','embedded-skins.css?v=1.8',...(id==='jet-quality-evaluator'?['jet-quality-evaluator-integration.css?v=1.6.0']:[])]){
    const link=doc.createElement('link');link.rel='stylesheet';link.href=new URL('../../'+file,location.href).href;doc.head.append(link);
  }
  const onEdit=()=>{if(id==='roundness-deviation')changed();else{evaluationTouched=true;setDirty();}};
  doc.addEventListener('input',onEdit);
  doc.addEventListener('change',onEdit);
  doc.addEventListener('change',event=>{
    const input=event.target;
    if(input?.tagName!=='INPUT'||input.type!=='file'||!input.files?.length)return;
    if(id==='roundness-deviation'&&['contour-file','area-file'].includes(input.id))beginSessionImport('roundness-'+input.id);
    else finishSessionChoice();
  },true);
  new MutationObserver(()=>{queueProgress();if(id==='jet-quality-evaluator')queueInlineSectionSelector();}).observe(doc.body,{subtree:true,childList:true,attributes:true,characterData:true});
  if(id==='roundness-deviation'){
    frame.contentWindow.addEventListener('roundness-workbench-change',()=>{if(!restoring)queueMicrotask(changed);});
    frame.contentWindow.addEventListener('roundness-workbench-file-import-result',event=>finishSessionImport('roundness-'+event.detail.kind,event.detail.ok));
  }
  // Buttons such as delete/reset/save-axis are also edits. Downloads and tab navigation are harmless to mark dirty conservatively.
  doc.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    setDirty();
    if(id==='jet-quality-evaluator'&&button.textContent.trim()==='保存设置')setTimeout(()=>{try{captureLinkedEvaluation();queueInlineSectionSelector();}catch{}},0);
  });
  syncSkin();
  if(id==='jet-quality-evaluator')queueInlineSectionSelector();
}
roundnessFrame.addEventListener('load',()=>prepareFrame(roundnessFrame,'roundness-deviation'));
evaluationFrame.addEventListener('load',()=>prepareFrame(evaluationFrame,'jet-quality-evaluator'));
for(const [frame,id]of [[roundnessFrame,'roundness-deviation'],[evaluationFrame,'jet-quality-evaluator']])if(frame.contentDocument?.readyState==='complete'&&frame.contentDocument?.body?.children.length)prepareFrame(frame,id);
try{if(window.parent!==window)window.parent.addEventListener('pelton-skin-change',syncSkin);}catch{}
window.addEventListener('storage',event=>{if(event.key==='pelton-toolbox-skin-v1')syncSkin();});
window.addEventListener('beforeunload',event=>{if(dirty&&window.parent===window){event.preventDefault();event.returnValue='';}});
syncSkin();renderMergeStatus();queueProgress();
