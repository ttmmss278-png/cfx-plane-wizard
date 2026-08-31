'use strict';
  els.nav.addEventListener('click',e=>{const toggle=e.target.closest('button[data-toggle-cat]');if(toggle){const cat=toggle.dataset.toggleCat;if(state.collapsedCategories.has(cat))state.collapsedCategories.delete(cat);else state.collapsedCategories.add(cat);saveCollapsed();renderNav();return;}const ungroupedManage=e.target.closest('button[data-manage-ungrouped]');if(ungroupedManage){openFolderManager('__ungrouped__',ungroupedManage.dataset.manageUngrouped);return;}const folderManage=e.target.closest('button[data-manage-folder]');if(folderManage){openFolderManager(folderManage.dataset.manageFolder);return;}const manage=e.target.closest('button[data-manage-cat]');if(manage){openCategoryManager(manage.dataset.manageCat);return;}const folder=e.target.closest('button[data-folder]');if(folder){state.filterCategory=folder.dataset.folderCat;state.filterFolderId=folder.dataset.folder;renderAll();return;}const b=e.target.closest('button[data-cat]');if(!b)return;state.filterCategory=b.dataset.cat;state.filterFolderId='';renderAll();});
  els.cards.addEventListener('click',e=>{
    const t=e.target;const id=t.dataset.star||t.dataset.edit||t.dataset.copyFormula||t.dataset.copyCcl||t.dataset.select;if(!id)return;const item=state.items.find(x=>x.id===id);if(!item)return;
    if(t.dataset.star){item.favorite=!item.favorite;item.updatedAt=now();save();renderAll();return;}
    if(t.dataset.edit){fillEditor(item,false);return;}
    if(t.dataset.copyFormula){prepareCopy(item,'formula');return;}
    if(t.dataset.copyCcl){prepareCopy(item,'ccl');return;}
    if(t.dataset.select){t.checked?state.selected.add(id):state.selected.delete(id);renderAll();return;}
  });
  els.typeFilter.addEventListener('click',e=>{const b=e.target.closest('button[data-type]');if(!b)return;state.filterType=b.dataset.type;$$('#typeFilter button').forEach(x=>x.classList.toggle('active',x===b));renderCards();});
  els.search.addEventListener('input',e=>{state.search=e.target.value;renderCards();});
  els.sort.addEventListener('change',e=>{state.sort=e.target.value;renderCards();});
  els.favoritesBtn.addEventListener('click',()=>{state.favoritesOnly=!state.favoritesOnly;els.favoritesBtn.textContent=state.favoritesOnly?'★ 仅收藏':'☆ 仅收藏';renderCards();});
  $('#clearFilterBtn').addEventListener('click',()=>{state.filterCategory='全部条目';state.filterFolderId='';state.filterType='all';state.search='';state.favoritesOnly=false;els.search.value='';els.favoritesBtn.textContent='☆ 仅收藏';$$('#typeFilter button').forEach(x=>x.classList.toggle('active',x.dataset.type==='all'));renderAll();});
  $('#newBtn').addEventListener('click',()=>fillEditor(blankItem(),true));
  $('#newCategoryBtn').addEventListener('click',()=>openCategoryManager());
  $('#newFolderTopBtn').addEventListener('click',()=>openFolderManager(null,state.filterCategory));
  $('#saveCategoryBtn').addEventListener('click',saveCategoryEdit);
  $('#deleteCategoryBtn').addEventListener('click',deleteCategory);
  $('#categoryNameInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveCategoryEdit();}});
  $('#saveFolderBtn').addEventListener('click',saveFolderEdit);$('#deleteFolderBtn').addEventListener('click',deleteFolder);$('#duplicateFolderBtn').addEventListener('click',duplicateFolder);$('#batchRuleFoldersBtn').addEventListener('click',batchCreateRuleFolders);$('#batchListFoldersBtn').addEventListener('click',batchCreateListFolders);['#batchFolderPrefix','#batchFolderSuffix','#batchFolderStart','#batchFolderCount','#batchFolderWidth'].forEach(s=>$(s).addEventListener('input',updateBatchFolderPreview));$('#copyFolderModalBtn').addEventListener('click',()=>{const f=folderById(state.editingFolderId);if(f){closeModal('folderModal');showFolderPackage(f);}});$('#exportFolderModalBtn').addEventListener('click',()=>{const f=folderById(state.editingFolderId);if(f)exportFolder(f);});
  $('#closeDetailBtn').addEventListener('click',closeEditor);$('#saveBtn').addEventListener('click',saveEditor);
  $('#itemType').addEventListener('change',()=>{updateTypeFields();validateLive();});
  $('#itemCategory').addEventListener('input',()=>{refreshFolderSelect($('#itemCategory').value,'');validateLive();});
  $$('#detailPanel input,#detailPanel textarea,#detailPanel select').forEach(el=>el.addEventListener('input',validateLive));
  $('#deleteBtn').addEventListener('click',()=>{if(!state.editingId)return;if(!confirm('确定删除该条目？'))return;state.items=state.items.filter(x=>x.id!==state.editingId);state.selected.delete(state.editingId);save();closeEditor();renderAll();toast('条目已删除');});
  $('#duplicateBtn').addEventListener('click',()=>{const item=readEditor();item.id=uid();item.title=(item.title||'未命名')+' - 副本';item.createdAt=item.updatedAt=now();state.editingId=null;fillEditor(item,true);});
  $('#themeBtn').addEventListener('click',()=>{document.body.classList.toggle('dark');localStorage.setItem(THEME_KEY,document.body.classList.contains('dark')?'dark':'light');});
  $('#quickPasteBtn').addEventListener('click',()=>openModal('pasteModal'));$('#recognizeBtn').addEventListener('click',recognizeText);
  $('#copyFolderCclBtn').addEventListener('click',()=>{const f=folderById(state.filterFolderId);if(f)showFolderPackage(f);});$('#exportFolderCclBtn').addEventListener('click',()=>{const f=folderById(state.filterFolderId);if(f)exportFolder(f);});
  $('#batchCopyBtn').addEventListener('click',copyBatch);$('#batchExportBtn').addEventListener('click',()=>{const items=[...state.selected].map(id=>state.items.find(x=>x.id===id)).filter(Boolean);download(`CFX_Post_Load_Package_${new Date().toISOString().slice(0,10)}.cse`,packageItems(items));});$('#batchClearBtn').addEventListener('click',()=>{state.selected.clear();renderAll();});
  $('#copyTabs').addEventListener('click',e=>{const b=e.target.closest('button[data-tab]');if(!b||!state.copyContext)return;state.copyContext.mode=b.dataset.tab;$$('#copyTabs button').forEach(x=>x.classList.toggle('active',x===b));updateCopyOutput();});
  $('#templateFields').addEventListener('input',updateCopyOutput);$('#copyOutputBtn').addEventListener('click',()=>copyText($('#copyOutput').value));$('#downloadOutputBtn').addEventListener('click',()=>download(`CFX_Post_${state.copyContext?.mode==='formula'?'Formula':'Command'}_${Date.now()}.${state.copyContext?.mode==='formula'?'txt':'cse'}`,$('#copyOutput').value));
  $$('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));$$('.modal-wrap').forEach(w=>w.addEventListener('click',e=>{if(e.target===w)closeModal(w.id);}));
  $('#backupBtn').addEventListener('click',()=>{hideFileStorageMessage();updateFileStorageUi();openModal('backupModal');});$('#dataFileBtn').addEventListener('click',()=>{hideFileStorageMessage();updateFileStorageUi();openModal('backupModal');});$('#referenceBtn').addEventListener('click',()=>openModal('referenceModal'));
  $('#createDataFileBtn').addEventListener('click',createLinkedDataFile);$('#openDataFileBtn').addEventListener('click',openExistingDataFile);$('#readDataFileBtn').addEventListener('click',readLinkedDataFile);$('#writeDataFileBtn').addEventListener('click',()=>writeLinkedDataFile(false));$('#disconnectDataFileBtn').addEventListener('click',disconnectLinkedDataFile);
  $('#fileAutoSave').addEventListener('change',e=>{state.fileStorage.autoSave=e.target.checked;localStorage.setItem(FILE_AUTOSAVE_KEY,String(state.fileStorage.autoSave));if(state.fileStorage.autoSave&&state.fileStorage.handle)scheduleLinkedFileWrite();updateFileStorageUi();});
