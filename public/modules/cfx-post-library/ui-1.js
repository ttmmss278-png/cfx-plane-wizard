'use strict';
  function renderNav(){
    const cats=categories();els.nav.innerHTML=cats.map(cat=>{
      const count=cat==='全部条目'?state.items.length:cat==='收藏夹'?state.items.filter(x=>x.favorite).length:cat==='未分类'?state.items.filter(x=>!x.category||x.category==='未分类').length:state.items.filter(x=>x.category===cat).length;
      const system=systemCategories.includes(cat);const folders=!system?foldersForCategory(cat):[];
      const ungrouped=!system?state.items.filter(x=>x.category===cat&&!x.folderId).length:0;
      const hasFolderRows=!system&&(folders.length>0||ungrouped>0);
      const collapsed=hasFolderRows&&state.collapsedCategories.has(cat);
      const folderHtml=hasFolderRows?`<div class="folder-list ${collapsed?'collapsed':''}">${folders.map(folder=>{const fc=state.items.filter(x=>x.folderId===folder.id).length;return `<div class="folder-item"><button data-folder="${esc(folder.id)}" data-folder-cat="${esc(cat)}" class="folder-main ${state.filterFolderId===folder.id?'active':''}"><span>📁 ${esc(folder.name)}</span><span class="count">${fc}</span></button><button class="folder-manage" data-manage-folder="${esc(folder.id)}" title="管理、复制或导出文件夹">⋯</button></div>`;}).join('')}${ungrouped?`<div class="folder-item system"><button data-folder="__ungrouped__" data-folder-cat="${esc(cat)}" class="folder-main ${state.filterFolderId==='__ungrouped__'&&state.filterCategory===cat?'active':''}"><span>未分组</span><span class="count">${ungrouped}</span></button><button class="folder-manage" data-manage-ungrouped="${esc(cat)}" title="将未分组条目整理为可重命名、可移动的正式文件夹">⋯</button></div>`:''}</div>`:'';
      const toggle=hasFolderRows?`<button class="folder-toggle" data-toggle-cat="${esc(cat)}" aria-expanded="${collapsed?'false':'true'}" title="${collapsed?'展开':'折叠'}文件夹">${collapsed?'▶':'▼'}</button>`:'';
      return `<div class="category-block"><div class="nav-item ${system?'system':''} ${hasFolderRows?'has-folders':''}">${toggle}<button data-cat="${esc(cat)}" class="nav-main ${state.filterCategory===cat&&!state.filterFolderId?'active':''}"><span>${cat==='收藏夹'?'☆ ':''}${esc(cat)}</span><span class="count">${count}</span></button>${system?'':`<button class="nav-manage" data-manage-cat="${esc(cat)}" title="重命名或删除分类">⋯</button>`}</div>${folderHtml}</div>`;
    }).join('');
    $('#categoryList').innerHTML=categories().filter(x=>!['全部条目','收藏夹'].includes(x)).map(x=>`<option value="${esc(x)}"></option>`).join('');
    refreshFolderSelect($('#itemCategory')?.value||'未分类',$('#itemFolder')?.value||'');
  }
  function filteredItems(){
    let a=state.items.slice();
    if(state.filterCategory==='收藏夹')a=a.filter(x=>x.favorite);else if(state.filterCategory==='未分类')a=a.filter(x=>!x.category||x.category==='未分类');else if(state.filterCategory!=='全部条目')a=a.filter(x=>x.category===state.filterCategory);
    if(state.filterFolderId==='__ungrouped__')a=a.filter(x=>!x.folderId);else if(state.filterFolderId)a=a.filter(x=>x.folderId===state.filterFolderId);
    if(state.filterType!=='all')a=a.filter(x=>x.type===state.filterType);
    if(state.favoritesOnly)a=a.filter(x=>x.favorite);
    const q=state.search.trim().toLowerCase();if(q)a=a.filter(x=>{const folder=folderById(x.folderId);return [x.title,x.category,folder?.name||'',x.description,x.exprName,x.exprBody,x.cclCode,x.compositeCode,x.version,x.dependencies,x.notes,...x.tags].join('\n').toLowerCase().includes(q);});
    a.sort((x,y)=>state.sort==='title'?x.title.localeCompare(y.title,'zh-CN'):state.sort==='created'?new Date(y.createdAt)-new Date(x.createdAt):state.sort==='used'?(y.usageCount-x.usageCount)||new Date(y.updatedAt)-new Date(x.updatedAt):new Date(y.updatedAt)-new Date(x.updatedAt));
    return a;
  }
  function renderCards(){
    const list=filteredItems();const selectedFolder=folderById(state.filterFolderId);
    els.viewTitle.textContent=selectedFolder?`${state.filterCategory} / ${selectedFolder.name}`:state.filterFolderId==='__ungrouped__'?`${state.filterCategory} / 未分组`:state.filterCategory;
    els.viewSubtitle.textContent=selectedFolder?`当前文件夹 ${list.length} 项。整组导出时按“文件夹导出顺序”从小到大生成可直接粘贴到 Command Editor 的 CCL。`:`当前显示 ${list.length} 项，共保存 ${state.items.length} 项。支持名称、文件夹、特征词和代码全文搜索。`;
    $('#clearFilterBtn').style.visibility=(state.filterCategory!=='全部条目'||state.filterFolderId||state.filterType!=='all'||state.search||state.favoritesOnly)?'visible':'hidden';
    const copyFolder=$('#copyFolderCclBtn'),exportFolder=$('#exportFolderCclBtn');copyFolder.classList.toggle('hidden',!selectedFolder);exportFolder.classList.toggle('hidden',!selectedFolder);if(selectedFolder){copyFolder.textContent=`复制 ${selectedFolder.name} CCL`;exportFolder.textContent=`导出 ${selectedFolder.name}`;}
    if(!list.length){els.cards.innerHTML='<div class="empty"><b>没有找到匹配条目</b><br><br>可清除筛选，或在当前分类/文件夹中新建 CCL 条目。</div>';return;}
    els.cards.innerHTML=list.map(item=>{
      const pv=preview(item).slice(0,620);const tags=item.tags.slice(0,5).map(t=>`<span class="pill">${esc(t)}</span>`).join('');const folder=folderById(item.folderId);
      return `<article class="card ${state.selected.has(item.id)?'selected':''}" data-id="${item.id}">
        <input class="select-box" type="checkbox" data-select="${item.id}" ${state.selected.has(item.id)?'checked':''} title="加入加载包">
        <div class="card-top"><div><h3>${esc(item.title)}</h3><div class="meta"><span class="pill type-${item.type}">${typeNames[item.type]||item.type}</span><span class="pill">${esc(item.category||'未分类')}</span>${folder?`<span class="pill">📁 ${esc(folder.name)}</span><span class="pill">顺序 ${esc(item.exportOrder)}</span>`:''}${tags}</div></div><button class="star ${item.favorite?'on':''}" data-star="${item.id}" title="收藏">${item.favorite?'★':'☆'}</button></div>
        <div class="desc">${esc(item.description||'暂无用途说明。')}</div>
        <div class="code-preview">${esc(pv||'（空内容）')}</div>
        <div class="card-actions">
          ${item.type==='expression'||item.type==='composite'?`<button class="btn small" data-copy-formula="${item.id}">复制公式</button>`:''}
          <button class="btn small" data-copy-ccl="${item.id}">${item.type==='expression'?'复制 CCL':'复制代码'}</button>
          <button class="btn small" data-edit="${item.id}">编辑</button>
        </div>
      </article>`;
    }).join('');
  }
  function renderBatch(){els.batchCount.textContent=`已选 ${state.selected.size} 项`;els.batchBar.classList.toggle('show',state.selected.size>0);}
  function renderAll(){renderNav();renderCards();renderBatch();}

  function blankItem(){const cat=!systemCategories.includes(state.filterCategory)?state.filterCategory:'未分类';const folderId=folderById(state.filterFolderId)?.id||'';return normalizeItem({title:'',type:'ccl',category:cat,folderId,tags:[],exportOrder:100});}
  function readEditor(){return normalizeItem({id:$('#itemId').value||uid(),title:$('#itemTitle').value.trim(),type:$('#itemType').value,category:$('#itemCategory').value.trim()||'未分类',folderId:$('#itemFolder').value||'',exportOrder:Number($('#itemExportOrder').value)||100,tags:splitTags($('#itemTags').value),description:$('#itemDescription').value.trim(),exprName:$('#exprName').value.trim(),exprBody:$('#exprBody').value.trim(),cclCode:$('#cclCode').value.trim(),compositeCode:$('#compositeCode').value.trim(),version:$('#itemVersion').value.trim(),dependencies:$('#itemDependencies').value.trim(),notes:$('#itemNotes').value.trim(),favorite:state.editingId?(state.items.find(x=>x.id===state.editingId)?.favorite||false):false,usageCount:state.editingId?(state.items.find(x=>x.id===state.editingId)?.usageCount||0):0,createdAt:state.editingId?(state.items.find(x=>x.id===state.editingId)?.createdAt||now()):now(),updatedAt:now()});}
  function fillEditor(item,isNew=false){
    state.editingId=isNew?null:item.id;$('#itemId').value=isNew?'':item.id;$('#itemTitle').value=item.title;$('#itemType').value=item.type;$('#itemCategory').value=item.category;refreshFolderSelect(item.category,item.folderId);$('#itemExportOrder').value=item.exportOrder??100;$('#itemTags').value=item.tags.join(', ');$('#itemDescription').value=item.description;$('#exprName').value=item.exprName;$('#exprBody').value=item.exprBody;$('#cclCode').value=item.cclCode;$('#compositeCode').value=item.compositeCode;$('#itemVersion').value=item.version;$('#itemDependencies').value=item.dependencies;$('#itemNotes').value=item.notes;$('#editorTitle').textContent=isNew?'新建条目':'编辑条目';$('#deleteBtn').style.display=isNew?'none':'inline-flex';$('#duplicateBtn').style.display=isNew?'none':'inline-flex';updateTypeFields();validateLive();els.workspace.classList.add('with-detail');setTimeout(()=>$('#itemTitle').focus(),80);
  }
  function closeEditor(){els.workspace.classList.remove('with-detail');state.editingId=null;}
  function refreshFolderSelect(category,selected=''){const el=$('#itemFolder');if(!el)return;const list=foldersForCategory(cleanCategoryName(category));el.innerHTML=`<option value="">未分组</option>`+list.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');el.value=list.some(f=>f.id===selected)?selected:'';}
  function updateTypeFields(){const t=$('#itemType').value;$('#expressionFields').classList.toggle('hidden',!['expression','composite'].includes(t));$('#cclFields').classList.toggle('hidden',!['ccl','action'].includes(t));$('#compositeFields').classList.toggle('hidden',t!=='composite');}
  function validateLive(){const item=readEditor(),r=validateItem(item);if(!r.errors.length&&!r.warnings.length){els.validation.innerHTML='<div class="warnbox okbox">基础检查通过。CFX-Post 的实际可用性仍取决于当前结果文件中的域、边界、变量和对象名称。</div>';}else{els.validation.innerHTML=[r.errors.length?`<div class="warnbox errorbox"><b>需要修正：</b><br>${r.errors.map(esc).join('<br>')}</div>`:'',r.warnings.length?`<div class="warnbox"><b>检查提示：</b><br>${r.warnings.map(esc).join('<br>')}</div>`:''].join('');}return r;}
  function saveEditor(){const item=readEditor(),r=validateItem(item);validateLive();if(r.errors.length){toast('请先修正必填项');return;}item.category=ensureCategory(item.category);const folder=folderById(item.folderId);if(!folder||folder.category!==item.category)item.folderId='';const idx=state.items.findIndex(x=>x.id===item.id);if(idx>=0)state.items[idx]=item;else state.items.unshift(item);save();renderAll();fillEditor(item,false);toast('条目已保存');}
