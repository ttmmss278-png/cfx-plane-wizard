import {validateRows, offsetRows} from './core.js';
import {readRoundnessProject} from '../roundness-deviation/project-file.js?v=1.4.0';
export const MAX_BYTES=256*1024*1024;
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const text=value=>typeof value==='string';
const number=value=>typeof value==='number'&&Number.isFinite(value);
const draftNumber=value=>number(value)||value==='';
export function validateEvaluation(config) {
  assert(config && text(config.projectName) && ['relative','reference','fixed'].includes(config.mode),'评价项目名称或模式无效。');
  assert(['equal','manual','entropy'].includes(config.level1WeightMethod)&&['equal','manual','entropy'].includes(config.level2WeightMethod),'赋权方法无效。');
  for (const key of ['indicators','sections','alternatives']) {
    const list=config[key];
    assert(Array.isArray(list)&&list.length>0&&list.length<=10000,`${key} 数量无效。`);
    assert(list.every(row=>row && text(row.id)&&row.id.length>0&&text(row.name))&&new Set(list.map(row=>row.id)).size===list.length,`${key} 标识无效或重复。`);
  }
  assert(config.indicators.length*config.sections.length*config.alternatives.length<=1000000,'评价数据过多，请分组。');
  assert(config.indicators.every(row=>['benefit','cost'].includes(row.direction)&&draftNumber(row.weight)&&draftNumber(row.worst)&&draftNumber(row.best)&&text(row.unit)),'指标配置无效。');
  assert(config.sections.every(row=>text(row.position)&&draftNumber(row.weight)),'截面配置无效。');
  assert(text(config.referenceId),'基准标识无效。');
  assert(config.alternatives.every(row=>row.values && typeof row.values==='object' && !Array.isArray(row.values) && Object.values(row.values).every(draftNumber)),'评价数值无效。');
  return structuredClone(config);
}

export function readWorkbench(source) {
  const project=JSON.parse(source);
  assert(project?.format==='pelton-quality-workbench'&&project.version===1,'这不是受支持的一体化评价项目，请选择 .quality.json 文件。');
  assert(project.units?.offset==='m' && project.units?.uniformity==='coefficient','项目单位无效。');
  assert(['roundness','offset','uniformity','evaluation'].includes(project.tab),'项目页签无效。');
  assert(text(project.diameter)&&['m','mm'].includes(project.diameterUnit),'喷嘴直径设置无效。');
  const metrics={};
  for(const kind of ['offset','uniformity']) {
    const input=project.metrics?.[kind];
    assert(input && text(input.name),'来源文件信息无效。');
    const rows=validateRows(input.rows,kind);
    assert(input.visible===null || Array.isArray(input.visible)&&input.visible.every(n=>rows.some(row=>row.nozzle===n))&&new Set(input.visible).size===input.visible.length,'绘图筛选无效。');
    metrics[kind]={name:input.name,rows,visible:input.visible};
  }
  assert(typeof project.offsetCalculated==='boolean','偏移度计算状态无效。');
  if(project.offsetCalculated)offsetRows(metrics.offset.rows,project.diameter,project.diameterUnit);
  readRoundnessProject(JSON.stringify(project.roundness),{allowDraft:true});
  const evaluation=validateEvaluation(project.evaluation);
  let evaluationCatalog=null,selectedSectionIds=[];
  if(project.evaluationCatalog!=null){
    evaluationCatalog=validateEvaluation(project.evaluationCatalog);
    assert(Array.isArray(project.selectedSectionIds)&&project.selectedSectionIds.length>0,'评价截面选择不能为空。');
    const available=new Set(evaluationCatalog.sections.map(section=>section.id));
    assert(project.selectedSectionIds.every(id=>text(id)&&available.has(id))&&new Set(project.selectedSectionIds).size===project.selectedSectionIds.length,'评价截面选择无效或重复。');
    selectedSectionIds=[...project.selectedSectionIds];
    assert(evaluation.sections.length===selectedSectionIds.length&&evaluation.sections.every(section=>selectedSectionIds.includes(section.id)),'当前评价截面与保存的选择不一致。');
  }
  // Imported results are always recomputed by the existing evaluator / metric core.
  return {...project,metrics,evaluation,evaluationCatalog,selectedSectionIds,roundness:structuredClone(project.roundness)};
}
