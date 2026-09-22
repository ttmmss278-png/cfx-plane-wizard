import {readMetricFile,offsetRows,coordinateRows,mergeIndicators,sectionLabel} from './core.js';
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
let evaluationTouched=false, progressFrame=0;
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
  $('merge-state').textContent=evaluationSource==='stale'?'前置数据已变更：当前评价保留上次汇总的数据，请重新汇总后使用。':evaluationSource==='linked'?'已汇总三个指标。偏离圆度、偏移度已换算为无量纲小数；方法、权重和基准仍可自行设置。':'独立评价模式：不要求导入前三项；下方保留现有评价项目 / 示例，请导入自己的数据后使用。';
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
    const ticket=++tickets[kind];pending[kind]=true;queueProgress();status(`正在读取 ${file.name}…`);$('meta-'+kind).textContent=`${file.name} · 正在读取…`;
    try{
      const rows=await readMetricFile(file,kind,window.XLSX);
      if(ticket!==tickets[kind])return;
      metrics[kind]={rows,name:file.name,visible:null};
      if(offset){offsetCalculated=false;offsetResults=[];}
      renderMetric(kind);changed();status(`已导入 ${file.name}，${rows.length} 个数值。${offset?'设置直径后点击“计算偏移度”。':'曲线已生成。'}`);
    }catch(error){if(ticket===tickets[kind]){status(`导入失败：${error.message} 原数据未更改。`,true);$('meta-'+kind).textContent=`导入失败：${error.message}。${metrics[kind].rows.length?'仍保留上次数据：'+metrics[kind].name:'尚无数据'}`;}}
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
$('merge-indicators').onclick=async()=>{
  try{
    ensureIdle();
    const roundness=api(roundnessFrame,'RoundnessWorkbench').getRows();
    const evaluator=api(evaluationFrame,'EvaluationWorkbench'),previous=evaluator.snapshot();
    if(!offsetCalculated)throw new Error('请先计算射流偏移度。');
    const config=mergeIndicators(roundness,offsetResults,metrics.uniformity.rows,previous);
    validateEvaluation(config);
    if(!await confirmAction('将用三个射流指标替换综合评价中的指标、截面和对象数据。匹配到的权重、基准及当前评价方法会保留；新截面默认权重为 1，可自行修改。建议先保存完整项目。继续？','汇总射流指标'))return;
    evaluator.restore(config);evaluationSource='linked';renderMergeStatus();setDirty();
    status('三个指标已汇总。请核对权重、最差/优良标准及评价模式；新截面的权重可在综合评价中编辑。');
  }catch(error){status(error.message,true);}
};

function snapshot(){
  ensureIdle();
  return {format:'pelton-quality-workbench',version:1,savedAt:new Date().toISOString(),units:{offset:'m',uniformity:'coefficient'},tab,
    diameter:$('diameter').value,diameterUnit:$('diameter-unit').value,offsetCalculated,metrics:structuredClone(metrics),evaluationSource,evaluationTouched,
    roundness:api(roundnessFrame,'RoundnessWorkbench').snapshot(),evaluation:api(evaluationFrame,'EvaluationWorkbench').snapshot()};
}
$('save-project').onclick=()=>{
  try{const project=snapshot(),source=JSON.stringify(project);readWorkbench(source);const blob=new Blob([source],{type:'application/json'});if(blob.size>MAX_BYTES)throw new Error('完整项目超过 256 MB，请减少轮廓数据。');download(blob,'指标与综合评价_'+new Date().toISOString().slice(0,10)+'.quality.json');setDirty(false);status('完整项目已导出，包含原始数据、轴线、直径、绘图筛选和综合评价设置。');}catch(error){status(`保存失败：${error.message}`,true);}
};
$('open-project').onclick=()=>$('project-file').click();
$('project-file').onchange=async()=>{
  const input=$('project-file'),file=input.files?.[0];input.value='';if(!file)return;
  await openWorkbenchFile(file);
};
async function openWorkbenchFile(file){
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
    $('diameter').value=project.diameter;$('diameter-unit').value=project.diameterUnit;
    offsetCalculated=project.offsetCalculated;offsetResults=offsetCalculated?offsetRows(metrics.offset.rows,project.diameter,project.diameterUnit):[];
    roundness.restore(project.roundness);evaluator.restore(project.evaluation);
    evaluationSource=['direct','linked','stale'].includes(project.evaluationSource)?project.evaluationSource:'direct';
    evaluationTouched=project.evaluationTouched ?? true;
    renderMetric('offset');renderMetric('uniformity');renderMergeStatus();selectTab(project.tab);setDirty(false);status(`已恢复 ${file.name}。`);
  }catch(error){status(`打开失败：${error.message}`,true);}
  finally{restoring=false;if(ticket===projectTicket)projectPending=false;}
}

// IndexedDB keeps large contour datasets out of localStorage. Never replace a
// previous session until the user has chosen whether to restore it.
let cacheReady=false,cacheBusy=false,lastCached='',cachedProject=null;
const cacheNote=document.createElement('span');cacheNote.id='cache-status';cacheNote.setAttribute('role','status');
cacheNote.style.cssText='font-size:11px;color:var(--muted);';$('toggle-header').before(cacheNote);
function cacheStore(mode,value){return new Promise((resolve,reject)=>{
 const request=indexedDB.open('pelton-quality-session',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('sessions');
 request.onerror=()=>reject(request.error);
 request.onsuccess=()=>{const db=request.result,tx=db.transaction('sessions',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('sessions');
 const op=mode==='get'?store.get('latest'):store.put(value,'latest');let result;
 op.onsuccess=()=>{result=op.result;};tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(tx.error);};};
});}
cacheStore('get').then(value=>{
 if(!value){cacheReady=true;cacheNote.textContent='数据自动保存在本机';return;}
 cachedProject=value;cacheNote.textContent='';
 for(const [label,restore]of [['恢复上次数据',true],['开始新会话',false]]){
 const button=document.createElement('button');button.className=`button ${restore?'primary':'secondary'} session-choice`;button.textContent=label;
 button.onclick=async()=>{
 if(!restore&&!await confirmAction('开始新会话后，后续操作将更新本机自动备份。建议先恢复并导出需要保留的旧项目。继续？'))return;
 if(restore){await openWorkbenchFile(new File([cachedProject],'上次本机自动保存.quality.json',{type:'application/json'}));
 if(!$('workbench-status').textContent.startsWith('已恢复'))return;}
 document.querySelectorAll('.session-choice').forEach(el=>el.remove());cacheReady=true;cacheNote.textContent='数据自动保存在本机';
 };cacheNote.before(button);}
}).catch(()=>{cacheNote.textContent='本机存储不可用，请保存完整项目文件';});
setInterval(async()=>{
 if(!cacheReady||cacheBusy||restoring||projectPending)return;
 let source;
 try{const project=snapshot();project.savedAt='';source=JSON.stringify(project);}catch{return;}
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
  for(const file of ['embedded-modules.css?v=3.5','embedded-skins.css?v=1.8',...(id==='jet-quality-evaluator'?['jet-quality-evaluator-integration.css?v=1.2.0']:[])]){
    const link=doc.createElement('link');link.rel='stylesheet';link.href=new URL('../../'+file,location.href).href;doc.head.append(link);
  }
  const onEdit=()=>{if(id==='roundness-deviation')changed();else{evaluationTouched=true;setDirty();}};
  doc.addEventListener('input',onEdit);
  doc.addEventListener('change',onEdit);
  new MutationObserver(queueProgress).observe(doc.body,{subtree:true,childList:true,attributes:true,characterData:true});
  if(id==='roundness-deviation')frame.contentWindow.addEventListener('roundness-workbench-change',()=>{if(!restoring)queueMicrotask(changed);});
  // Buttons such as delete/reset/save-axis are also edits. Downloads and tab navigation are harmless to mark dirty conservatively.
  doc.addEventListener('click',event=>{if(event.target.closest('button'))setDirty();});
  syncSkin();
}
roundnessFrame.addEventListener('load',()=>prepareFrame(roundnessFrame,'roundness-deviation'));
evaluationFrame.addEventListener('load',()=>prepareFrame(evaluationFrame,'jet-quality-evaluator'));
for(const [frame,id]of [[roundnessFrame,'roundness-deviation'],[evaluationFrame,'jet-quality-evaluator']])if(frame.contentDocument?.readyState==='complete'&&frame.contentDocument?.body?.children.length)prepareFrame(frame,id);
try{if(window.parent!==window)window.parent.addEventListener('pelton-skin-change',syncSkin);}catch{}
window.addEventListener('storage',event=>{if(event.key==='pelton-toolbox-skin-v1')syncSkin();});
window.addEventListener('beforeunload',event=>{if(dirty&&window.parent===window){event.preventDefault();event.returnValue='';}});
syncSkin();renderMergeStatus();queueProgress();
