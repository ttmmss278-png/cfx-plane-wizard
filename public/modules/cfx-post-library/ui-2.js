'use strict';
  function openCategoryManager(cat=null){
    state.editingCategory=cat;
    const isNew=!cat;
    $('#categoryModalTitle').textContent=isNew?'新建分类':'管理分类';
    $('#categoryNameInput').value=cat||'';
    $('#categoryModalHint').textContent=isNew?'建立分类后，可在编辑条目时直接选择。':'修改名称后，该分类下所有条目会同步更新。';
    $('#categoryDeleteHint').style.display=isNew?'none':'block';
    $('#deleteCategoryBtn').style.display=isNew?'none':'inline-flex';
    $('#saveCategoryBtn').textContent=isNew?'创建分类':'保存名称';
    openModal('categoryModal');
    setTimeout(()=>{$('#categoryNameInput').focus();$('#categoryNameInput').select();},80);
  }
  function saveCategoryEdit(){
    const oldName=state.editingCategory;const newName=cleanCategoryName($('#categoryNameInput').value);
    if(!newName){toast('分类名称不能为空');return;}
    if(systemCategories.includes(newName)){toast('该名称属于系统分类，不能使用');return;}
    if(newName.length>40){toast('分类名称不能超过 40 个字符');return;}
    if(!oldName){ensureCategory(newName);saveCategories();closeModal('categoryModal');renderAll();toast('分类已创建');return;}
    if(newName===oldName){closeModal('categoryModal');return;}
    const exists=categories().includes(newName);
    if(exists&&!confirm(`分类“${newName}”已存在。是否将“${oldName}”合并到该分类？`))return;
    state.items.forEach(x=>{if(x.category===oldName){x.category=newName;x.updatedAt=now();}});state.folders.forEach(f=>{if(f.category===oldName){f.category=newName;f.updatedAt=now();}});
    state.categories=uniqueCategories(state.categories.filter(x=>x!==oldName).concat(newName));
    if(state.filterCategory===oldName)state.filterCategory=newName;
    save();closeModal('categoryModal');renderAll();toast(exists?'分类已合并':'分类名称已修改');
  }
  function deleteCategory(){
    const cat=state.editingCategory;if(!cat||systemCategories.includes(cat))return;
    const count=state.items.filter(x=>x.category===cat).length;
    if(!confirm(`确定删除分类“${cat}”？${count?`\n其中 ${count} 个条目将移动到“未分类”。`:''}`))return;
    const folderIds=new Set(state.folders.filter(f=>f.category===cat).map(f=>f.id));state.items.forEach(x=>{if(x.category===cat){x.category='未分类';x.folderId='';x.updatedAt=now();}});state.folders=state.folders.filter(f=>!folderIds.has(f.id));
    state.categories=state.categories.filter(x=>x!==cat);
    if(state.filterCategory===cat)state.filterCategory=count?'未分类':'全部条目';
    save();closeModal('categoryModal');renderAll();toast('分类已删除，条目已保留');
  }

  function ordinaryCategories(){return categories().filter(x=>!systemCategories.includes(x));}
  function openFolderManager(folderId=null,category=null){
    state.editingFolderId=folderId;const folder=folderById(folderId);const isNew=!folder;
    $('#folderModalTitle').textContent=isNew?'新建文件夹':`管理文件夹 · ${folder.name}`;
    const opts=ordinaryCategories();$('#folderCategorySelect').innerHTML=opts.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    const preferred=folder?.category||(!systemCategories.includes(category||state.filterCategory)?(category||state.filterCategory):'截面与定位器');$('#folderCategorySelect').value=opts.includes(preferred)?preferred:(opts[0]||'未分类');
    $('#folderNameInput').value=folder?.name||'';$('#folderBatchArea').classList.toggle('hidden',!isNew);$('#folderCopyArea').classList.toggle('hidden',isNew);$('#folderCopyName').value=folder?`${folder.name} - 副本`:'';$('#folderReplaceFrom').value=folder?.name||'';$('#folderReplaceTo').value='';
    $('#deleteFolderBtn').style.display=isNew?'none':'inline-flex';$('#duplicateFolderBtn').style.display=isNew?'none':'inline-flex';$('#copyFolderModalBtn').style.display=isNew?'none':'inline-flex';$('#exportFolderModalBtn').style.display=isNew?'none':'inline-flex';$('#saveFolderBtn').textContent=isNew?'创建单个文件夹':'保存名称';updateBatchFolderPreview();openModal('folderModal');setTimeout(()=>$('#folderNameInput').focus(),80);
  }
  function saveFolderEdit(){const old=folderById(state.editingFolderId);const name=cleanFolderName($('#folderNameInput').value),category=cleanCategoryName($('#folderCategorySelect').value);if(!name){toast('文件夹名称不能为空');return;}if(!category){toast('请选择所属分类');return;}const duplicate=state.folders.find(f=>f.category===category&&f.name===name&&f.id!==old?.id);if(duplicate){toast('该分类中已存在同名文件夹');return;}ensureCategory(category);if(old){const oldCategory=old.category;old.name=name;old.category=category;old.updatedAt=now();state.items.forEach(x=>{if(x.folderId===old.id){x.category=category;x.updatedAt=now();}});if(state.filterFolderId===old.id)state.filterCategory=category;}else state.folders.push(normalizeFolder({name,category}));state.collapsedCategories.delete(category);saveCollapsed();save();closeModal('folderModal');renderAll();toast(old?'文件夹已更新':'文件夹已创建');}
  function deleteFolder(){const folder=folderById(state.editingFolderId);if(!folder)return;const count=folderItems(folder.id).length;if(!confirm(`确定删除文件夹“${folder.name}”？${count?`\n其中 ${count} 个条目将移到“${folder.category} / 未分组”。`:''}`))return;state.items.forEach(x=>{if(x.folderId===folder.id){x.folderId='';x.updatedAt=now();}});state.folders=state.folders.filter(f=>f.id!==folder.id);if(state.filterFolderId===folder.id){state.filterFolderId='__ungrouped__';state.filterCategory=folder.category;}save();closeModal('folderModal');renderAll();toast('文件夹已删除，条目已保留');}
  function replaceDeep(value,from,to){if(!from)return clone(value);if(typeof value==='string')return value.split(from).join(to);if(Array.isArray(value))return value.map(v=>replaceDeep(v,from,to));if(value&&typeof value==='object'){const out={};Object.entries(value).forEach(([k,v])=>out[k]=replaceDeep(v,from,to));return out;}return value;}
  function duplicateFolder(){const folder=folderById(state.editingFolderId);if(!folder)return;const newName=cleanFolderName($('#folderCopyName').value),from=$('#folderReplaceFrom').value,to=$('#folderReplaceTo').value;if(!newName){toast('请填写新文件夹名称');return;}if(state.folders.some(f=>f.category===folder.category&&f.name===newName)){toast('同分类已有该文件夹名称');return;}const newFolder=normalizeFolder({name:newName,category:folder.category});state.folders.push(newFolder);folderItems(folder.id).forEach(src=>{const copy=normalizeItem(replaceDeep(src,from,to));copy.id=uid();copy.folderId=newFolder.id;copy.category=newFolder.category;copy.createdAt=copy.updatedAt=now();state.items.push(copy);});save();closeModal('folderModal');state.filterCategory=newFolder.category;state.filterFolderId=newFolder.id;renderAll();toast(`已复制为 ${newName}`);}
  function batchFolderSequence(){
    const prefix=$('#batchFolderPrefix').value, suffix=$('#batchFolderSuffix').value;
    const start=Number.parseInt($('#batchFolderStart').value,10);
    const count=Number.parseInt($('#batchFolderCount').value,10);
    const width=Math.max(0,Math.min(6,Number.parseInt($('#batchFolderWidth').value,10)||0));
    if(!Number.isFinite(start)||!Number.isFinite(count)||count<1||count>100)return [];
    return Array.from({length:count},(_,i)=>cleanFolderName(`${prefix}${String(start+i).padStart(width,'0')}${suffix}`)).filter(Boolean);
  }
  function updateBatchFolderPreview(){const el=$('#batchFolderPreview');if(!el)return;const names=batchFolderSequence();el.textContent=names.length?`预览：${names.slice(0,10).join('、')}${names.length>10?` … 共 ${names.length} 个`:''}`:'请检查起始编号和创建数量（1–100）。';}
  function createFoldersByNames(names){
    const category=cleanCategoryName($('#folderCategorySelect').value)||'截面与定位器';ensureCategory(category);
    const unique=[...new Set(names.map(cleanFolderName).filter(Boolean))];if(!unique.length){toast('没有可创建的文件夹名称');return;}
    const existing=new Set(state.folders.filter(f=>f.category===category).map(f=>f.name));let created=0,skipped=0;
    unique.forEach(name=>{if(existing.has(name)){skipped++;return;}state.folders.push(normalizeFolder({name,category}));existing.add(name);created++;});
    if(!created){toast(`没有创建文件夹；${skipped} 个名称已存在`);return;}
    state.collapsedCategories.delete(category);saveCollapsed();save();closeModal('folderModal');state.filterCategory=category;state.filterFolderId='';renderAll();toast(`已创建 ${created} 个文件夹${skipped?`，跳过 ${skipped} 个重复名称`:''}`);
  }
  function batchCreateRuleFolders(){const names=batchFolderSequence();if(!names.length){toast('请输入有效的起始编号和创建数量');return;}createFoldersByNames(names);}
  function batchCreateListFolders(){const names=splitTags($('#batchFolderNames').value);if(!names.length){toast('请填写文件夹名称列表');return;}createFoldersByNames(names);}
  function folderPackage(folder){return packageItems(folderItems(folder.id));}
  function showFolderPackage(folder){const items=folderItems(folder.id),text=folderPackage(folder);if(!text){toast('该文件夹没有可导出的表达式或 CCL');return;}state.copyContext={item:{title:`${folder.name} 整组 CCL`,type:'ccl'},mode:'ccl',formula:'',ccl:text,values:{}};$('#copyModalTitle').textContent=`${folder.category} / ${folder.name} · ${items.length} 项`;$('#copyTabs').classList.add('hidden');const ph=placeholders(text);$('#templateArea').classList.toggle('hidden',!ph.length);$('#templateFields').innerHTML=ph.map(p=>`<div class="field"><label>${esc(p)}</label><input data-placeholder="${esc(p)}" placeholder="填写 ${esc(p)}"></div>`).join('');updateCopyOutput();openModal('copyModal');}
  function exportFolder(folder){const text=folderPackage(folder);if(!text){toast('该文件夹没有可导出的表达式或 CCL');return;}download(`CFX_Post_${safeFilename(folder.name)}_${new Date().toISOString().slice(0,10)}.cse`,text);toast(`已导出 ${folder.name}`);}

  function useItem(id){const item=state.items.find(x=>x.id===id);if(item){item.usageCount=(item.usageCount||0)+1;item.updatedAt=now();save(false);}}
  function prepareCopy(item,mode='ccl'){
    useItem(item.id);
    const formula=fullFormula(item);const ccl=itemCCL(item);state.copyContext={item,mode,formula,ccl,values:{}};
    $('#copyModalTitle').textContent=`${item.title} · ${mode==='formula'?'公式':'Command Editor'}`;
    $('#copyTabs').classList.toggle('hidden',!(item.type==='expression'||item.type==='composite'));
    $$('#copyTabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===mode));
    const allText=[formula,ccl].join('\n');const ph=placeholders(allText);const area=$('#templateArea');area.classList.toggle('hidden',!ph.length);
    $('#templateFields').innerHTML=ph.map(p=>`<div class="field"><label>${esc(p)}</label><input data-placeholder="${esc(p)}" placeholder="填写 ${esc(p)}"></div>`).join('');
    updateCopyOutput();openModal('copyModal');renderCards();
  }
  function updateCopyOutput(){if(!state.copyContext)return;const {mode,formula,ccl}=state.copyContext;const values={};$$('#templateFields input').forEach(i=>values[i.dataset.placeholder]=i.value);let text=mode==='formula'?formula:ccl;text=replacePlaceholders(text,values);$('#copyOutput').value=text;$('#copyStats').textContent=`${text.split(/\r?\n/).length} 行 · ${text.length} 字符`;}
