import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {readFile} from 'node:fs/promises';
import {parseMetricRows,readMetricFile,offsetRows,mergeIndicators,coordinateRows} from '../public/modules/quality-workbench/core.js';
import {buildMetricChart} from '../public/modules/quality-workbench/chart.js';
import {readWorkbench} from '../public/modules/quality-workbench/project.js';
import {serializeRoundnessProject,readRoundnessProject} from '../public/modules/roundness-deviation/project-file.js';
import {buildTemplateConfig,buildTemplateGrid} from '../public/modules/jet-quality-evaluator/template-core.js';

const grid=[['X/D','PZ1','PZ2'],[1,.006,.009],[.5,.002,.004],[0,0,0]];
const rows=parseMetricRows(grid,'offset');
assert.equal(rows.length,6);assert.equal(rows[0].section,0);
assert.deepEqual(parseMetricRows([['PZ1','PZ2'],[0,0,0]],'offset'),rows.slice(0,2));
assert.deepEqual(offsetRows(rows,'600','mm'),offsetRows(rows,'.6','m'));
assert.equal(offsetRows(rows,'.6','m').find(r=>r.nozzle===1&&r.section===1).value,1);
for(const value of ['',0,-1,Infinity,NaN])assert.throws(()=>offsetRows(rows,value,'m'));
for(const grid of [ [['','PZ1','PZ1'],[1,1,1]], [['','PZ1'],[1,null]], [['','PZ1'],[1,0],[1,1]], [['','PZ1'],[1,-1]], [['','PZ1'],['bad',1]], [['','PZ1',null],[1,1,2]] ])assert.throws(()=>parseMetricRows(grid,'offset'));
assert.throws(()=>parseMetricRows([['','PZ1'],[1,95]],'uniformity'));
assert.equal(parseMetricRows([['','PZ1'],[1,0],[2,1]],'uniformity').length,2);
for(const ext of ['xlsx','xls','csv','txt']){
  let payload;
  if(ext==='xlsx'||ext==='xls'){const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(grid),'Sheet1');XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([]),'Empty');payload=XLSX.write(book,{bookType:ext==='xls'?'biff8':'xlsx',type:'buffer'});}
  else payload=Buffer.from(grid.map(row=>row.join(ext==='txt'?'\t':',')).join('\n'));
  const file={name:'fixture.'+ext,size:payload.length,arrayBuffer:async()=>payload,text:async()=>payload.toString()};
  assert.deepEqual(await readMetricFile(file,'offset',XLSX),rows);
}
const uniformity=rows.map(row=>({...row,value:.95})),roundness=rows.map(row=>({...row,value:30})),offset=offsetRows(rows,'.6','m');
const previous={projectName:'自定义试验',mode:'fixed',level1WeightMethod:'manual',level2WeightMethod:'manual',referenceId:'nozzle-2',indicators:[{id:'offset',weight:5,worst:.5,best:0}],sections:[{id:'old',position:'x/D = 0.5',weight:9}]};
const merged=mergeIndicators(roundness,offset,uniformity,previous);
assert.equal(merged.mode,'fixed');assert.equal(merged.indicators[2].weight,5);assert.equal(merged.sections.find(s=>s.position==='X/D = 0.5').weight,9);
assert.equal(merged.alternatives[0].values['section-1:deformation'],.3);
assert.equal(merged.alternatives[0].values['section-1:offset'],.01);
assert.equal(merged.alternatives[0].values['section-1:uniformity'],.95);
assert.equal(merged.indicators[1].unit,'无量纲小数');
assert.equal(merged.indicators[2].unit,'无量纲小数');
const templateSettings={objectNames:['PZ1','PZ2'],sectionNames:['0.5D','1.0D'],variableNames:['速度均匀性','偏离圆度','射流偏移度']};
const templateGrid=buildTemplateGrid(templateSettings);
assert.equal(templateGrid.headers.length,7);
assert.deepEqual(templateGrid.headers.slice(0,4),['评价对象','0.5D-速度均匀性','0.5D-偏离圆度','0.5D-射流偏移度']);
assert.equal(templateGrid.rows.length,2);
const templateConfig=buildTemplateConfig(templateSettings,merged);
assert.equal(templateConfig.alternatives.length,2);
assert.equal(templateConfig.sections.length,2);
assert.equal(templateConfig.indicators.length,3);
assert.equal(templateConfig.indicators[0].direction,'benefit');
assert.equal(templateConfig.indicators[1].direction,'cost');
assert.equal(templateConfig.indicators[2].direction,'cost');
assert.equal(templateConfig.indicators[2].unit,'无量纲小数');
assert.equal(Object.keys(templateConfig.alternatives[0].values).length,6);
const freshTemplateConfig=buildTemplateConfig(templateSettings);
assert.equal(freshTemplateConfig.indicators[2].worst,1);
assert.equal(freshTemplateConfig.indicators[2].best,0);
const repairedTemplateConfig=buildTemplateConfig(templateSettings,{indicators:[{id:'bad-offset',name:'射流偏移度',direction:'benefit',worst:0,best:1,weight:1,unit:'—'}]});
assert.equal(repairedTemplateConfig.indicators[2].direction,'cost');
assert.equal(repairedTemplateConfig.indicators[2].worst,1);
assert.equal(repairedTemplateConfig.indicators[2].best,0);
assert.throws(()=>buildTemplateGrid({...templateSettings,variableNames:['重复','重复']}),/不能重复/);
assert.throws(()=>mergeIndicators(roundness.slice(1),offset,uniformity),/缺少/);
assert.equal(coordinateRows(offset,[2])[0][1],'PZ2');
for(const [kind,values]of [['offset',offset],['uniformity',uniformity],['uniformity',uniformity.map(r=>({...r,value:1}))],['uniformity',uniformity.map(r=>({...r,value:0}))]]){
  const svg=buildMetricChart(values,kind);assert(!/NaN|Infinity/.test(svg));assert.match(svg,/X\/D/);assert.match(svg,/stroke-dasharray/);
  assert.equal(buildMetricChart(values,kind,[]),'');
}
const state={contours:[],areas:[],axes:{},contourName:'',areaName:'',areaSheetName:'',contourWarnings:[],areaWarnings:[],results:[],resultWarnings:[],resultErrors:[]};
const draft=JSON.parse(serializeRoundnessProject(state,{chartMode:'percent',visibleNozzles:[],nozzleFilter:'all'},new Date().toISOString(),{allowDraft:true}));
assert.equal(readRoundnessProject(JSON.stringify(draft),{allowDraft:true}).state.results.length,0);
assert.throws(()=>readRoundnessProject(JSON.stringify(draft)));
const project={format:'pelton-quality-workbench',version:1,units:{offset:'m',uniformity:'coefficient'},tab:'evaluation',diameter:'600',diameterUnit:'mm',offsetCalculated:true,metrics:{offset:{rows,name:'fixture',visible:[]},uniformity:{rows:uniformity,name:'fixture',visible:null}},roundness:draft,evaluation:merged};
const saved=JSON.stringify(project);assert.deepEqual(readWorkbench(saved).metrics.offset.visible,[]);
assert.equal(readWorkbench(JSON.stringify({...project,diameterLocked:true})).diameterLocked,true);
assert.throws(()=>readWorkbench(JSON.stringify({...project,diameterLocked:'true'})),/锁定状态/);
const selectedSectionIds=[merged.sections[0].id,merged.sections[2].id];
const selectedProject={...project,evaluation:{...merged,sections:merged.sections.filter(section=>selectedSectionIds.includes(section.id))},evaluationCatalog:merged,selectedSectionIds};
const restoredSelection=readWorkbench(JSON.stringify(selectedProject));
assert.deepEqual(restoredSelection.selectedSectionIds,selectedSectionIds);
assert.equal(restoredSelection.evaluationCatalog.sections.length,3);
assert.equal(restoredSelection.evaluation.sections.length,2);
assert.throws(()=>readWorkbench(JSON.stringify({...selectedProject,selectedSectionIds:[]})),/不能为空/);
for(const mutate of [p=>p.version=2,p=>p.units.offset='mm',p=>p.diameter='0',p=>p.metrics.uniformity.rows[0].value=99,p=>p.evaluation.indicators[0].direction='bad',p=>p.roundness.data.axes=JSON.parse('{"__proto__":{}}')]){
  const p=JSON.parse(saved);mutate(p);assert.throws(()=>readWorkbench(JSON.stringify(p)));
}
// Optional read-only sample validation; no user files are written.
if(process.argv.includes('--samples'))for(const [name,kind] of [['30偏移量.xlsx','offset'],['30速度均匀性.xlsx','uniformity']]){
  const payload=await readFile('C:/Users/Administrator/Desktop/2026.09.16/02TAB/PIANYI/03偏移/'+name);
  const data=await readMetricFile({name,size:payload.length,arrayBuffer:async()=>payload},kind,XLSX);
  assert.equal(data.length,72);assert.equal(new Set(data.map(row=>row.section)).size,12);
  if(kind==='offset')assert(Math.abs(offsetRows(data,620,'mm')[0].value-.365)<1e-12);
  else assert.equal(data[0].value,.949608);
  console.log(`${name}: 6 nozzles × 12 sections, validated.`);
}
console.log('Quality workbench: imports, units, missing/duplicate values, alignment, weights, charts, drafts and project validation passed.');
