'use strict';
(function(){
  const BULK_UI_VERSION='1.9.0';
  const VIEW_KEY='cfxpost_bulk_view_v1';
  const MODE_KEY='cfxpost_bulk_mode_v1';
  const bulkState={
    enabled:localStorage.getItem(MODE_KEY)==='1',
    view:localStorage.getItem(VIEW_KEY)==='list'?'list':'cards',
    anchorId:'',
    visibleSignature:'',
    wired:false
  };

  function visibleItems(){
    try{return filteredItems();}catch(error){console.warn('读取当前筛选结果失败',error);return [];}
  }
  function visibleIds(){return visibleItems().map(item=>item.id);}
  function selectedVisibleIds(){const ids=new Set(visibleIds());return [...state.selected].filter(id=>ids.has(id));}
  function hiddenSelectedCount(){return Math.max(0,state.selected.size-selectedVisibleIds().length);}
  function currentFolder(){return folderById(state.filterFolderId);}
  function setBatchMode(enabled){
    bulkState.enabled=!!enabled;
    localStorage.setItem(MODE_KEY,bulkState.enabled?'1':'0');
    document.body.classList.toggle('cfx-bulk-mode',bulkState.enabled);
    updateBulkUi();
  }
  function setView(view){
    bulkState.view=view==='list'?'list':'cards';
    localStorage.setItem(VIEW_KEY,bulkState.view);
    updateCardsPresentation();
    updateBulkUi();
  }
  function updateAnchorForVisibleOrder(){
    const signature=visibleIds().join('|');
    if(signature!==bulkState.visibleSignature){
      bulkState.visibleSignature=signature;
      bulkState.anchorId='';
    }
  }
  function selectionSummary(){
    const selected=state.selected.size;
    const visibleSelected=selectedVisibleIds().length;
    return {selected,visibleSelected,hidden:selected-visibleSelected,visibleTotal:visibleIds().length};
  }

  function ensureBulkControls(){
    if(bulkState.wired)return;
    const toolbar=document.querySelector('.toolbar');
    const cards=document.querySelector('#cards');
    const batchBar=document.querySelector('#batchBar');
    if(!toolbar||!cards||!batchBar)return;

    const controls=document.createElement('div');
    controls.className='bulk-tools';
    controls.innerHTML=`
      <button class="btn small" id="bulkModeBtn" type="button">批量选择</button>
      <button class="btn small" id="bulkSelectVisibleBtn" type="button">全选当前结果</button>
      <button class="btn small" id="bulkInvertVisibleBtn" type="button">反选</button>
      <button class="btn small" id="bulkClearAllBtn" type="button">清空</button>
      <button class="btn small" id="bulkExportVisibleBtn" type="button">导出当前结果</button>
      <button class="btn small" id="bulkViewBtn" type="button">列表视图</button>`;
    toolbar.appendChild(controls);

    const listHeader=document.createElement('div');
    listHeader.id='bulkListHeader';
    listHeader.className='bulk-list-header hidden';
    listHeader.innerHTML='<span>选择</span><span>条目与所属位置</span><span>类型</span><span>操作</span>';
    cards.parentNode.insertBefore(listHeader,cards);

    const folderSelect=document.createElement('button');
    folderSelect.id='bulkSelectFolderBtn';
    folderSelect.type='button';
    folderSelect.className='btn small hidden';
    folderSelect.textContent='选择文件夹全部条目';
    document.querySelector('.library-head-actions')?.prepend(folderSelect);

    const scope=document.createElement('span');
    scope.id='batchScopeSummary';
    scope.className='batch-scope-summary';
    document.querySelector('#batchCount')?.after(scope);

    const review=document.createElement('button');
    review.id='batchReviewBtn';
    review.type='button';
    review.className='btn small';
    review.textContent='查看已选';
    document.querySelector('#batchCopyBtn')?.before(review);

    const keepVisible=document.createElement('button');
    keepVisible.id='batchKeepVisibleBtn';
    keepVisible.type='button';
    keepVisible.className='btn small hidden';
    keepVisible.textContent='只保留当前可见';
    review.after(keepVisible);

    const modal=document.createElement('div');
    modal.className='modal-wrap';
    modal.id='bulkSelectionModal';
    modal.innerHTML=`
      <div class="modal bulk-review-modal">
        <div class="modal-head"><h3>已选条目检查</h3><button class="btn icon-btn small" id="bulkReviewCloseBtn" type="button">×</button></div>
        <div class="modal-body">
          <div class="bulk-review-summary" id="bulkReviewSummary"></div>
          <div class="bulk-review-list" id="bulkReviewList"></div>
        </div>
        <div class="modal-foot bulk-review-actions">
          <button class="btn" id="bulkReviewKeepVisibleBtn" type="button">只保留当前可见</button>
          <button class="btn danger" id="bulkReviewClearBtn" type="button">清空全部</button>
          <button class="btn" id="bulkReviewCopyBtn" type="button">生成加载包</button>
          <button class="btn primary" id="bulkReviewExportBtn" type="button">导出所选 CCL</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    wireBulkEvents();
    bulkState.wired=true;
    setBatchMode(bulkState.enabled);
    setView(bulkState.view);
  }

  function updateCardsPresentation(){
    const cards=document.querySelector('#cards');
    const header=document.querySelector('#bulkListHeader');
    if(!cards)return;
    cards.classList.toggle('bulk-list-view',bulkState.view==='list');
    header?.classList.toggle('hidden',bulkState.view!=='list');
    cards.querySelectorAll('.card[data-id]').forEach(card=>{
      card.tabIndex=0;
      card.setAttribute('aria-selected',state.selected.has(card.dataset.id)?'true':'false');
      card.title=bulkState.enabled?'单击选择；按住 Shift 单击可连续选择':'';
    });
  }

  function updateBulkUi(){
    ensureBulkControls();
    updateAnchorForVisibleOrder();
    updateCardsPresentation();
    document.body.classList.toggle('cfx-bulk-mode',bulkState.enabled);
    const summary=selectionSummary();
    const modeBtn=document.querySelector('#bulkModeBtn');
    if(modeBtn){
      modeBtn.classList.toggle('primary',bulkState.enabled);
      modeBtn.textContent=bulkState.enabled?'✓ 批量选择中':'批量选择';
    }
    const selectBtn=document.querySelector('#bulkSelectVisibleBtn');
    if(selectBtn)selectBtn.textContent=`全选当前结果 (${summary.visibleTotal})`;
    const exportBtn=document.querySelector('#bulkExportVisibleBtn');
    if(exportBtn)exportBtn.textContent=`导出当前结果 (${summary.visibleTotal})`;
    const viewBtn=document.querySelector('#bulkViewBtn');
    if(viewBtn)viewBtn.textContent=bulkState.view==='list'?'卡片视图':'列表视图';
    const scope=document.querySelector('#batchScopeSummary');
    if(scope)scope.textContent=`当前可见 ${summary.visibleSelected} · 其他位置 ${summary.hidden}`;
    const keepVisible=document.querySelector('#batchKeepVisibleBtn');
    keepVisible?.classList.toggle('hidden',summary.hidden===0);
    const folderButton=document.querySelector('#bulkSelectFolderBtn');
    const folder=currentFolder();
    if(folderButton){
      folderButton.classList.toggle('hidden',!folder);
      if(folder)folderButton.textContent=`选择 ${folder.name} 全部条目`;
    }
    const clearBtn=document.querySelector('#batchClearBtn');
    if(clearBtn)clearBtn.textContent='清空全部';
  }

  function refreshSelectionUi(){
    renderCards();
    renderBatch();
    updateBulkUi();
  }

  function selectVisible(mode='all'){
    const ids=visibleIds();
    if(mode==='all')ids.forEach(id=>state.selected.add(id));
    else if(mode==='invert')ids.forEach(id=>state.selected.has(id)?state.selected.delete(id):state.selected.add(id));
    bulkState.anchorId=ids.at(-1)||'';
    setBatchMode(true);
    refreshSelectionUi();
    toast(mode==='all'?`已选择当前结果 ${ids.length} 项`:`已反选当前结果 ${ids.length} 项`);
  }

  function clearAllSelection(){
    state.selected.clear();
    bulkState.anchorId='';
    refreshSelectionUi();
    toast('已清空选择');
  }

  function keepOnlyVisible(){
    const visible=new Set(visibleIds());
    [...state.selected].forEach(id=>{if(!visible.has(id))state.selected.delete(id);});
    refreshSelectionUi();
    renderReviewModal();
    toast('已移除其他位置的选择');
  }

  function applyCardSelection(id,event={}){
    const ids=visibleIds();
    const index=ids.indexOf(id);
    if(index<0)return;
    if(event.shiftKey&&bulkState.anchorId&&ids.includes(bulkState.anchorId)){
      const anchorIndex=ids.indexOf(bulkState.anchorId);
      const [start,end]=anchorIndex<index?[anchorIndex,index]:[index,anchorIndex];
      const range=ids.slice(start,end+1);
      if(!(event.ctrlKey||event.metaKey))ids.forEach(visibleId=>state.selected.delete(visibleId));
      range.forEach(rangeId=>state.selected.add(rangeId));
    }else{
      state.selected.has(id)?state.selected.delete(id):state.selected.add(id);
      bulkState.anchorId=id;
    }
    setBatchMode(true);
    refreshSelectionUi();
  }

  function selectedItems(){
    return [...state.selected].map(id=>state.items.find(item=>item.id===id)).filter(Boolean);
  }

  function confirmHiddenSelection(action){
    const hidden=hiddenSelectedCount();
    if(!hidden)return true;
    return confirm(`当前选择中有 ${hidden} 个条目位于其他文件夹或已被筛选隐藏。是否仍然${action}全部已选条目？`);
  }

  function exportItems(items,label='Selected'){
    if(!items.length){toast('当前没有可导出的条目');return false;}
    const text=packageItems(items);
    if(!text){toast('所选条目没有可导出的表达式或 CCL');return false;}
    const name=safeFilename(label||'Selected');
    download(`CFX_Post_${name}_${new Date().toISOString().slice(0,10)}.cse`,text);
    toast(`已导出 ${items.length} 项`);
    return true;
  }

  function exportVisible(){
    const items=visibleItems();
    const label=currentFolder()?.name||state.filterCategory||'Current_Result';
    exportItems(items,`${label}_当前结果`);
  }

  function renderReviewModal(){
    const list=document.querySelector('#bulkReviewList');
    const summaryBox=document.querySelector('#bulkReviewSummary');
    if(!list||!summaryBox)return;
    const items=selectedItems();
    const summary=selectionSummary();
    summaryBox.innerHTML=`<b>已选 ${summary.selected} 项</b><span>当前可见 ${summary.visibleSelected} 项，其他位置 ${summary.hidden} 项</span>`;
    if(!items.length){list.innerHTML='<div class="empty"><b>尚未选择条目</b></div>';return;}
    const groups=new Map();
    items.forEach(item=>{
      const folder=folderById(item.folderId);
      const key=`${item.category||'未分类'} / ${folder?.name||'未分组'}`;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(item);
    });
    list.innerHTML=[...groups.entries()].map(([name,group])=>`
      <section class="bulk-review-group">
        <div class="bulk-review-group-head"><b>${esc(name)}</b><span>${group.length} 项</span></div>
        ${group.map(item=>`<div class="bulk-review-row"><span class="bulk-review-check">✓</span><span class="bulk-review-name">${esc(item.title)}</span><span class="pill type-${esc(item.type)}">${esc(typeNames[item.type]||item.type)}</span><button class="btn small" type="button" data-bulk-remove="${esc(item.id)}">移除</button></div>`).join('')}
      </section>`).join('');
  }

  function openReviewModal(){
    renderReviewModal();
    document.querySelector('#bulkSelectionModal')?.classList.add('show');
  }
  function closeReviewModal(){document.querySelector('#bulkSelectionModal')?.classList.remove('show');}

  function wireBulkEvents(){
    document.querySelector('#bulkModeBtn')?.addEventListener('click',()=>setBatchMode(!bulkState.enabled));
    document.querySelector('#bulkSelectVisibleBtn')?.addEventListener('click',()=>selectVisible('all'));
    document.querySelector('#bulkInvertVisibleBtn')?.addEventListener('click',()=>selectVisible('invert'));
    document.querySelector('#bulkClearAllBtn')?.addEventListener('click',clearAllSelection);
    document.querySelector('#bulkExportVisibleBtn')?.addEventListener('click',exportVisible);
    document.querySelector('#bulkViewBtn')?.addEventListener('click',()=>setView(bulkState.view==='list'?'cards':'list'));
    document.querySelector('#bulkSelectFolderBtn')?.addEventListener('click',()=>{
      const folder=currentFolder();if(!folder)return;
      folderItems(folder.id).forEach(item=>state.selected.add(item.id));
      setBatchMode(true);refreshSelectionUi();toast(`已选择 ${folder.name} 全部 ${folderItems(folder.id).length} 项`);
    });
    document.querySelector('#batchReviewBtn')?.addEventListener('click',openReviewModal);
    document.querySelector('#batchKeepVisibleBtn')?.addEventListener('click',keepOnlyVisible);
    document.querySelector('#bulkReviewCloseBtn')?.addEventListener('click',closeReviewModal);
    document.querySelector('#bulkReviewKeepVisibleBtn')?.addEventListener('click',keepOnlyVisible);
    document.querySelector('#bulkReviewClearBtn')?.addEventListener('click',()=>{clearAllSelection();renderReviewModal();});
    document.querySelector('#bulkReviewCopyBtn')?.addEventListener('click',()=>{if(state.selected.size){closeReviewModal();copyBatch();}});
    document.querySelector('#bulkReviewExportBtn')?.addEventListener('click',()=>exportItems(selectedItems(),'Selected'));
    document.querySelector('#bulkSelectionModal')?.addEventListener('click',event=>{if(event.target.id==='bulkSelectionModal')closeReviewModal();const remove=event.target.closest('[data-bulk-remove]');if(remove){state.selected.delete(remove.dataset.bulkRemove);refreshSelectionUi();renderReviewModal();}});

    document.querySelector('#cards')?.addEventListener('click',event=>{
      const card=event.target.closest('.card[data-id]');
      if(!card)return;
      const checkbox=event.target.closest('[data-select]');
      if(!checkbox&&!bulkState.enabled)return;
      if(bulkState.enabled||checkbox){event.preventDefault();event.stopImmediatePropagation();applyCardSelection(card.dataset.id,event);}
    },true);

    document.querySelector('#cards')?.addEventListener('keydown',event=>{
      const card=event.target.closest('.card[data-id]');
      if(!card||!bulkState.enabled)return;
      if(event.key===' '||event.key==='Enter'){
        event.preventDefault();applyCardSelection(card.dataset.id,event);
      }
    });

    const batchCopy=document.querySelector('#batchCopyBtn');
    batchCopy?.addEventListener('click',event=>{
      event.preventDefault();event.stopImmediatePropagation();
      if(confirmHiddenSelection('生成加载包并包含'))copyBatch();
    },true);
    const batchExport=document.querySelector('#batchExportBtn');
    batchExport?.addEventListener('click',event=>{
      event.preventDefault();event.stopImmediatePropagation();
      if(confirmHiddenSelection('导出'))exportItems(selectedItems(),'Selected');
    },true);

    document.addEventListener('keydown',event=>{
      const target=event.target;
      const editing=target?.matches?.('input,textarea,select,[contenteditable="true"]');
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'&&bulkState.enabled&&!editing){
        event.preventDefault();selectVisible('all');return;
      }
      if(event.key==='Escape'&&document.querySelector('#bulkSelectionModal')?.classList.contains('show')){
        event.preventDefault();closeReviewModal();return;
      }
      if(event.key==='Escape'&&bulkState.enabled&&!editing){setBatchMode(false);}
    },true);
  }

  const previousRenderCards=renderCards;
  renderCards=function(){
    previousRenderCards();
    updateAnchorForVisibleOrder();
    updateCardsPresentation();
    updateBulkUi();
  };
  const previousRenderBatch=renderBatch;
  renderBatch=function(){previousRenderBatch();updateBulkUi();};

  ensureBulkControls();
  updateBulkUi();
  window.CfxBulkSelection={
    version:BULK_UI_VERSION,
    selectVisible:()=>selectVisible('all'),
    invertVisible:()=>selectVisible('invert'),
    clear:clearAllSelection,
    review:openReviewModal,
    getState:()=>({...bulkState,...selectionSummary()})
  };
})();
