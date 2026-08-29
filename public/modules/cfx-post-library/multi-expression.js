'use strict';
(() => {
  const FEATURE_VERSION='1.13.0';
  const baseNormalizeItem=normalizeItem;
  const baseReadEditor=readEditor;
  const baseFillEditor=fillEditor;
  const baseUpdateTypeFields=updateTypeFields;
  const baseFilteredItems=filteredItems;
  const baseRenderCards=renderCards;

  function cleanFormula(raw={},itemId='',index=0){
    let name=String(raw.name??raw.exprName??'').trim();
    let body=String(raw.body??raw.exprBody??'').trim();
    if(!name&&body.includes('=')){
      const split=body.indexOf('=');
      name=body.slice(0,split).trim();
      body=body.slice(split+1).trim();
    }
    if(name&&body.startsWith(`${name}=`))body=body.slice(name.length+1).trim();
    return {id:String(raw.id||`${itemId||'item'}-expr-${index+1}`),name,body};
  }

  function formulaSource(item={},itemId=''){
    const rows=Array.isArray(item.expressions)&&item.expressions.length
      ? item.expressions
      : ((item.exprName||item.exprBody)?[{name:item.exprName||'',body:item.exprBody||''}]:[]);
    return rows.map((row,index)=>cleanFormula(row,itemId,index)).filter(row=>row.name||row.body);
  }

  normalizeItem=function(item={}){
    const base=baseNormalizeItem(item);
    const expressions=formulaSource(item,base.id);
    const first=expressions[0]||{name:'',body:''};
    return {...base,expressions,exprName:first.name,exprBody:first.body};
  };

  function orderedExpressions(item={}){
    const id=item.id||'item';
    return formulaSource(item,id);
  }
  window.CfxOrderedExpressions=orderedExpressions;

  expressionParts=function(item){return orderedExpressions(item)[0]||{name:'',body:''};};
  fullFormula=function(item){return orderedExpressions(item).map(row=>row.name?`${row.name}=${row.body}`:row.body).filter(Boolean).join('\n');};
  expressionCCL=function(item){
    const rows=orderedExpressions(item).filter(row=>row.name||row.body);
    if(!rows.length)return '';
    return `LIBRARY:\n  CEL:\n    EXPRESSIONS:\n${rows.map((row,index)=>`      ${row.name||`Expression ${index+1}`} = ${row.body}`).join('\n')}\n    END\n  END\nEND`;
  };
  itemCCL=function(item){
    if(item.type==='expression')return expressionCCL(item);
    if(item.type==='composite')return [expressionCCL(item),(item.compositeCode||item.cclCode||'').trim()].filter(Boolean).join('\n\n');
    return (item.cclCode||'').trim();
  };
  preview=function(item){
    if(item.type==='expression')return fullFormula(item);
    if(item.type==='composite')return [fullFormula(item),item.compositeCode||item.cclCode].filter(Boolean).join('\n');
    return item.cclCode;
  };

  function validateFormula(row,index){
    const warnings=[],errors=[];
    const label=`公式 ${index+1}`;
    if(!row.name)errors.push(`${label}：缺少表达式名称。`);
    if(row.name&&!/^[A-Za-z]/.test(row.name))errors.push(`${label}：表达式名称应以英文字母开头。`);
    if(row.name.length>80)errors.push(`${label}：表达式名称超过 80 个字符。`);
    if(!row.body)errors.push(`${label}：表达式内容为空。`);
    [['(',')'],['[',']']].forEach(([open,close])=>{
      const left=(row.body.match(new RegExp(`\\${open}`,'g'))||[]).length;
      const right=(row.body.match(new RegExp(`\\${close}`,'g'))||[]).length;
      if(left!==right)warnings.push(`${label}：${open}${close} 数量不平衡（${left}/${right}）。`);
    });
    if(/\d,\d/.test(row.body))warnings.push(`${label}：检测到数字中的逗号，CFD-Post 数值应使用英文句点作为小数点。`);
    return {warnings,errors};
  }

  validateExpression=function(item){
    const rows=orderedExpressions(item),warnings=[],errors=[];
    if(!rows.length)return {warnings,errors:['至少需要添加一个公式。']};
    rows.forEach((row,index)=>{const result=validateFormula(row,index);warnings.push(...result.warnings);errors.push(...result.errors);});
    const names=new Map();
    rows.forEach((row,index)=>{
      const key=row.name.toLowerCase();
      if(!key)return;
      if(names.has(key))errors.push(`公式 ${index+1}：名称“${row.name}”与公式 ${names.get(key)+1} 重复。`);
      else names.set(key,index);
    });
    rows.forEach((row,index)=>{
      rows.slice(index+1).forEach((later,offset)=>{
        if(!later.name)return;
        const token=later.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        if(new RegExp(`(^|[^A-Za-z0-9_])${token}([^A-Za-z0-9_]|$)`,'i').test(row.body))warnings.push(`公式 ${index+1} 引用了后置的公式 ${index+offset+2}“${later.name}”，请确认执行顺序。`);
      });
    });
    return {warnings,errors};
  };

  validateItem=function(item){
    const result={warnings:[],errors:[]};
    if(!item.title.trim())result.errors.push('条目名称不能为空。');
    if(item.title.length>80)result.errors.push('条目名称超过 80 个字符。');
    if(item.type==='expression'){
      const check=validateExpression(item);result.warnings.push(...check.warnings);result.errors.push(...check.errors);
    }else if(item.type==='composite'){
      const hasExpressions=orderedExpressions(item).length>0;
      const code=(item.compositeCode||item.cclCode||'').trim();
      if(!hasExpressions&&!code)result.errors.push('组合条目至少需要填写公式或 CCL 代码中的一种。');
      if(hasExpressions){const check=validateExpression(item);result.warnings.push(...check.warnings);result.errors.push(...check.errors);}
      if(code){const check=validateCCL(code);result.warnings.push(...check.warnings);result.errors.push(...check.errors);}
    }else{
      const check=validateCCL(item.cclCode);result.warnings.push(...check.warnings);result.errors.push(...check.errors);
    }
    return result;
  };

  function installFormulaEditor(){
    const fields=$('#expressionFields');
    if(!fields||$('#expressionList'))return;
    fields.innerHTML=`
      <input id="exprName" type="hidden">
      <textarea id="exprBody" hidden></textarea>
      <div class="expression-editor-head">
        <div><h4>条目公式</h4><p>公式按 1 → 2 → 3 的顺序生成与执行；先定义常量或中间量，再填写引用它们的结果公式。</p></div>
        <button class="btn small primary" type="button" id="addExpressionBtn">＋ 增加公式</button>
      </div>
      <div class="expression-list" id="expressionList"></div>
      <div class="hint expression-copy-hint">复制“公式”时按顺序输出多行 <b>名称=表达式</b>；复制“CCL”时自动合并到同一个 LIBRARY → CEL → EXPRESSIONS 块中。</div>`;
  }

  function expressionRowHtml(row,index,total){
    return `<section class="expression-row" data-expression-row data-expression-id="${esc(row.id||'')}">
      <div class="expression-row-head">
        <div class="expression-order"><span class="expression-order-number">${index+1}</span><span>公式 ${index+1}</span></div>
        <div class="expression-row-actions">
          <button class="btn small" type="button" data-expression-action="up" aria-label="上移公式 ${index+1}" title="上移" ${index===0?'disabled':''}>↑</button>
          <button class="btn small" type="button" data-expression-action="down" aria-label="下移公式 ${index+1}" title="下移" ${index===total-1?'disabled':''}>↓</button>
          <button class="btn small danger" type="button" data-expression-action="delete" aria-label="删除公式 ${index+1}" title="删除">删除</button>
        </div>
      </div>
      <div class="field"><label>表达式名称</label><input data-expression-name aria-label="公式 ${index+1} 名称" value="${esc(row.name||'')}" placeholder="${index===0?'Temperature':'EntropyGeneration'}"></div>
      <div class="field"><label>表达式内容 <small>填写等号右侧，也可粘贴完整的 名称=内容</small></label><textarea data-expression-body aria-label="公式 ${index+1} 内容" placeholder="${index===0?'298.15[K]':'引用前面已经定义的公式名称'}">${esc(row.body||'')}</textarea></div>
    </section>`;
  }

  function renderExpressionEditor(rows=[]){
    const list=$('#expressionList');if(!list)return;
    const safeRows=(rows.length?rows:[{id:'',name:'',body:''}]).map((row,index)=>cleanFormula(row,$('#itemId')?.value||'draft',index));
    list.innerHTML=safeRows.map((row,index)=>expressionRowHtml(row,index,safeRows.length)).join('');
    syncLegacyFields();
  }

  function readExpressionRows(){
    return $$('#expressionList [data-expression-row]').map((node,index)=>cleanFormula({id:node.dataset.expressionId,name:node.querySelector('[data-expression-name]').value,body:node.querySelector('[data-expression-body]').value},$('#itemId')?.value||'draft',index));
  }

  function syncLegacyFields(){
    const first=readExpressionRows()[0]||{name:'',body:''};
    $('#exprName').value=first.name;
    $('#exprBody').value=first.body;
  }

  installFormulaEditor();

  readEditor=function(){
    syncLegacyFields();
    const item=baseReadEditor();
    item.expressions=readExpressionRows();
    return normalizeItem(item);
  };

  fillEditor=function(item,isNew=false){
    const normalized=normalizeItem(item);
    baseFillEditor(normalized,isNew);
    renderExpressionEditor(normalized.expressions);
    validateLive();
  };

  updateTypeFields=function(){
    baseUpdateTypeFields();
    const type=$('#itemType').value;
    if(['expression','composite'].includes(type)&&!$('#expressionList [data-expression-row]'))renderExpressionEditor([]);
  };

  filteredItems=function(){
    const query=state.search;
    if(!query.trim())return baseFilteredItems();
    state.search='';
    let candidates;
    try{candidates=baseFilteredItems();}finally{state.search=query;}
    const needle=query.trim().toLowerCase();
    return candidates.filter(item=>{
      const folder=folderById(item.folderId);
      const formulaText=orderedExpressions(item).flatMap(row=>[row.name,row.body]);
      return [item.title,item.category,folder?.name||'',item.description,...formulaText,item.cclCode,item.compositeCode,item.version,item.dependencies,item.notes,...item.tags,...(item.attachments||[]).map(file=>file.name)].join('\n').toLowerCase().includes(needle);
    });
  };

  renderCards=function(){
    baseRenderCards();
    $$('#cards .card[data-id]').forEach(card=>{
      const item=state.items.find(value=>value.id===card.dataset.id);
      const count=orderedExpressions(item).length;
      if(!count||!['expression','composite'].includes(item.type))return;
      const meta=card.querySelector('.meta');
      if(meta&&!meta.querySelector('.formula-count-pill'))meta.insertAdjacentHTML('beforeend',`<span class="pill formula-count-pill">${count} 个公式</span>`);
    });
  };

  packageItems=function(items){
    const expressions=[],codes=[];
    items.forEach(item=>{
      if(['expression','composite'].includes(item.type))orderedExpressions(item).forEach(row=>{if(row.name&&row.body)expressions.push(row);});
      if(item.type==='composite'&&(item.compositeCode||item.cclCode).trim())codes.push((item.compositeCode||item.cclCode).trim());
      else if(['ccl','action'].includes(item.type)&&item.cclCode.trim())codes.push(item.cclCode.trim());
    });
    const blocks=[];
    if(expressions.length)blocks.push(`LIBRARY:\n  CEL:\n    EXPRESSIONS:\n${expressions.map(row=>`      ${row.name} = ${row.body}`).join('\n')}\n    END\n  END\nEND`);
    if(codes.length)blocks.push(codes.join('\n\n'));
    return blocks.join('\n\n');
  };

  const list=$('#expressionList');
  $('#addExpressionBtn').addEventListener('click',()=>{
    const rows=readExpressionRows();
    rows.push({id:'',name:'',body:''});
    renderExpressionEditor(rows);
    list.lastElementChild?.querySelector('[data-expression-name]')?.focus();
    validateLive();
    if(typeof scheduleEditorDraft==='function')scheduleEditorDraft();
  });
  list.addEventListener('click',event=>{
    const button=event.target.closest('[data-expression-action]');if(!button)return;
    const row=button.closest('[data-expression-row]');
    const rows=readExpressionRows(),index=[...list.children].indexOf(row),action=button.dataset.expressionAction;
    if(action==='up'&&index>0)[rows[index-1],rows[index]]=[rows[index],rows[index-1]];
    else if(action==='down'&&index<rows.length-1)[rows[index+1],rows[index]]=[rows[index],rows[index+1]];
    else if(action==='delete')rows.length===1?rows.splice(0,1,{id:'',name:'',body:''}):rows.splice(index,1);
    else return;
    renderExpressionEditor(rows);validateLive();
    if(typeof scheduleEditorDraft==='function')scheduleEditorDraft();
  });
  list.addEventListener('input',()=>{
    syncLegacyFields();validateLive();
    if(typeof scheduleEditorDraft==='function')scheduleEditorDraft();
  });

  const brandVersion=document.querySelector('.brand p');
  if(brandVersion)brandVersion.textContent=brandVersion.textContent.replace(/v\d+\.\d+\.\d+\b/,`v${FEATURE_VERSION}`);
})();
