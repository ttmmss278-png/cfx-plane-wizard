'use strict';
  function fullFormula(item){
    let name=(item.exprName||'').trim(),body=(item.exprBody||'').trim();
    if(body.includes('=')&&!name){const i=body.indexOf('=');name=body.slice(0,i).trim();body=body.slice(i+1).trim();}
    if(body.startsWith(name+'='))body=body.slice(name.length+1).trim();
    return name?`${name}=${body}`:body;
  }
  function expressionParts(item){
    let name=(item.exprName||'').trim(),body=(item.exprBody||'').trim();
    if(body.includes('=')&&!name){const i=body.indexOf('=');name=body.slice(0,i).trim();body=body.slice(i+1).trim();}
    if(name&&body.startsWith(name+'='))body=body.slice(name.length+1).trim();
    return {name,body};
  }
  function expressionCCL(item){const {name,body}=expressionParts(item);if(!name&&!body)return '';return `LIBRARY:\n  CEL:\n    EXPRESSIONS:\n      ${name || 'Expression 1'} = ${body}\n    END\n  END\nEND`;}
  function itemCCL(item){
    if(item.type==='expression')return expressionCCL(item);
    if(item.type==='composite'){const a=expressionCCL(item),b=(item.compositeCode||item.cclCode||'').trim();return [a,b].filter(Boolean).join('\n\n');}
    return (item.cclCode||'').trim();
  }
  function preview(item){return item.type==='expression'?fullFormula(item):item.type==='composite'?[fullFormula(item),item.compositeCode].filter(Boolean).join('\n'):item.cclCode;}
  function placeholders(text){const set=new Set();String(text).replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(_,n)=>{set.add(n.trim());return _;});return [...set];}
  function replacePlaceholders(text,values){return String(text).replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(_,n)=>values[n.trim()]??_);}

  function validateExpression(item){
    const warnings=[],errors=[];const {name,body}=expressionParts(item);
    if(!name)errors.push('缺少表达式名称。');
    if(name&&!/^[A-Za-z]/.test(name))errors.push('表达式名称应以英文字母开头。');
    if(name.length>80)errors.push('表达式名称超过 80 个字符。');
    if(!body)errors.push('表达式内容为空。');
    const pairs=[['(',')'],['[',']']];for(const [a,b] of pairs){const ca=(body.match(new RegExp('\\'+a,'g'))||[]).length,cb=(body.match(new RegExp('\\'+b,'g'))||[]).length;if(ca!==cb)warnings.push(`${a}${b} 数量不平衡（${ca}/${cb}）。`);}
    if(/\d,\d/.test(body))warnings.push('检测到数字中的逗号。CFD-Post 数值应使用英文句点作为小数点。');
    return {warnings,errors};
  }
  function validateCCL(code){
    const warnings=[],errors=[];const text=String(code||'').trim();if(!text){errors.push('CCL 内容为空。');return {warnings,errors};}
    const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
    let headers=0,ends=0;
    lines.forEach(line=>{if(/^[A-Z][A-Z0-9 _-]*(?::\s*.*)?\s*:$/.test(line)||/^[A-Z][A-Z0-9 _-]*:\s*.+$/.test(line))headers++;if(line==='END')ends++;});
    if(headers&&ends!==headers)warnings.push(`对象头约 ${headers} 个，END 为 ${ends} 个；请核对嵌套结构。`);
    const first=lines[0]||'';if(first.startsWith('>')){}else if(!first.includes(':'))warnings.push('首行未识别为“对象类型: 名称”或命令动作。');
    const m=first.match(/^[A-Z][A-Z0-9 _-]*:\s*(.+)$/);if(m){const name=m[1].trim();if(name&&!/^[A-Za-z]/.test(name))warnings.push('对象名称通常应以英文字母开头。');if(name.length>80)errors.push('对象名称超过 80 个字符。');}
    if(/\bEN\s*$/.test(text))warnings.push('末尾检测到 EN，可能是未写完整的 END。');
    if(/\d,\d/.test(text))warnings.push('检测到数字中的逗号，请确认它是向量分隔符而不是小数点。');
    return {warnings,errors};
  }
  function validateItem(item){
    let result={warnings:[],errors:[]};
    if(!item.title.trim())result.errors.push('条目名称不能为空。');
    if(item.title.length>80)result.errors.push('条目名称超过 80 个字符。');
    if(item.type==='expression'){const r=validateExpression(item);result.warnings.push(...r.warnings);result.errors.push(...r.errors);}
    else if(item.type==='composite'){const hasExpr=!!(item.exprName.trim()||item.exprBody.trim()),hasCode=!!(item.compositeCode||item.cclCode||'').trim();if(!hasExpr&&!hasCode)result.errors.push('组合条目至少需要填写表达式或 CCL 代码中的一种。');if(hasExpr){const r1=validateExpression(item);result.warnings.push(...r1.warnings);result.errors.push(...r1.errors);}if(hasCode){const r2=validateCCL(item.compositeCode||item.cclCode);result.warnings.push(...r2.warnings);result.errors.push(...r2.errors);}}
    else{const r=validateCCL(item.cclCode);result.warnings.push(...r.warnings);result.errors.push(...r.errors);}
    return result;
  }

  function categories(){
    const discovered=uniqueCategories([...state.items.map(x=>x.category),...state.folders.map(x=>x.category)]);
    const ordinary=uniqueCategories([...state.categories,...discovered]);
    return ['全部条目','收藏夹',...ordinary,'未分类'];
  }
