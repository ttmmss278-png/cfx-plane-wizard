'use strict';
(function(){
  const CACHE_DB='cfxpost_library_cache_v2';
  const CACHE_STORE='kv';
  const CACHE_VERSION=1;
  const CACHE_KEYS={database:'database',githubBase:'githubBase',githubMeta:'githubMeta',editorDraft:'editorDraft',lastBackup:'lastBackup'};
  const CACHE_WRITE_DELAY=120;
  const DRAFT_WRITE_DELAY=500;
  const tabId=`tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('cfxpost_library_cache_channel_v1'):null;
  let cacheTimer=null,draftTimer=null,cacheWriteChain=Promise.resolve();

  function openCacheDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(CACHE_DB,CACHE_VERSION);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(CACHE_STORE))db.createObjectStore(CACHE_STORE);};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('IndexedDB 打开失败'));
    });
  }
  async function cacheGet(key){
    if(!('indexedDB' in window))return null;
    const db=await openCacheDb();
    return new Promise((resolve,reject)=>{const tx=db.transaction(CACHE_STORE,'readonly');const req=tx.objectStore(CACHE_STORE).get(key);req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();tx.onerror=()=>{db.close();reject(tx.error);};});
  }
  async function cachePut(key,value){
    if(!('indexedDB' in window))return false;
    const db=await openCacheDb();
    return new Promise((resolve,reject)=>{const tx=db.transaction(CACHE_STORE,'readwrite');tx.objectStore(CACHE_STORE).put(value,key);tx.oncomplete=()=>{db.close();resolve(true);};tx.onerror=()=>{db.close();reject(tx.error);};});
  }
  async function cacheDelete(key){
    if(!('indexedDB' in window))return;
    const db=await openCacheDb();
    return new Promise((resolve,reject)=>{const tx=db.transaction(CACHE_STORE,'readwrite');tx.objectStore(CACHE_STORE).delete(key);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});
  }
  function validDatabase(data){return !!(data&&(Array.isArray(data.items)||Array.isArray(data)));}
  function normalizedPayload(data){
    const incoming=Array.isArray(data)?data:data?.items||[];
    const items=incoming.map(normalizeItem);
    const folders=(Array.isArray(data?.folders)?data.folders:[]).map(normalizeFolder);
    const categories=uniqueCategories(Array.isArray(data?.categories)?data.categories:[...items.map(x=>x.category),...folders.map(x=>x.category)]);
    return {items,folders,categories};
  }
  function installPayload(data){
    const normalized=normalizedPayload(data);
    state.items=normalized.items;
    state.folders=normalized.folders;
    state.categories=uniqueCategories([...normalized.categories,...state.items.map(x=>x.category),...state.folders.map(x=>x.category)]);
    const validFolderIds=new Set(state.folders.map(f=>f.id));
    state.items.forEach(x=>{if(x.folderId&&!validFolderIds.has(x.folderId))x.folderId='';});
  }
  function legacyPayload(){
    try{
      const rawItems=localStorage.getItem(STORAGE_KEY),rawCats=localStorage.getItem(CATEGORY_KEY),rawFolders=localStorage.getItem(FOLDER_KEY);
      if(!rawItems&&!rawCats&&!rawFolders)return null;
      return {app:'CFX-Post Formula and Command Library',version:7,appVersion:'1.7.0',exportedAt:now(),defaultCategory:'未分类',items:rawItems?JSON.parse(rawItems):[],categories:rawCats?JSON.parse(rawCats):[],folders:rawFolders?JSON.parse(rawFolders):[]};
    }catch(e){console.warn('旧版 localStorage 数据迁移失败',e);return null;}
  }
  function removeLegacyLargeStorage(){
    try{localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(CATEGORY_KEY);localStorage.removeItem(FOLDER_KEY);localStorage.removeItem(GITHUB_BASE_KEY);}catch(e){}
  }
  async function persistGithubMeta(){
    const meta={remoteSha:state.github.remoteSha||'',remoteEtag:state.github.remoteEtag||'',lastSyncAt:state.github.lastSyncAt||'',lastPushAt:state.github.lastPushAt||'',lastCheckAt:state.github.lastCheckAt||'',savedAt:now()};
    try{await cachePut(CACHE_KEYS.githubMeta,meta);}catch(e){console.warn('GitHub 同步元数据写入 IndexedDB 失败',e);}
  }
  async function persistDatabaseCache(broadcast=true){
    const payload=clone(makeDatabasePayload());
    cacheWriteChain=cacheWriteChain.then(async()=>{await cachePut(CACHE_KEYS.database,payload);removeLegacyLargeStorage();if(broadcast&&channel)channel.postMessage({type:'database-updated',source:tabId,at:Date.now()});}).catch(e=>console.warn('命令库写入 IndexedDB 失败',e));
    return cacheWriteChain;
  }
  function scheduleDatabaseCacheWrite(){clearTimeout(cacheTimer);cacheTimer=setTimeout(()=>persistDatabaseCache(true),CACHE_WRITE_DELAY);}

  makeDatabasePayload=function(){return {app:'CFX-Post Formula and Command Library',version:7,appVersion:'1.7.0',exportedAt:now(),defaultCategory:'未分类',categories:state.categories,folders:state.folders,items:state.items};};
  canonicalDatabase=function(data){
    const incoming=Array.isArray(data)?data:data?.items||[];
    const items=Array.isArray(incoming)?incoming.map(normalizeItem).sort((a,b)=>a.id.localeCompare(b.id)):[];
    const folders=(Array.isArray(data?.folders)?data.folders:[]).map(normalizeFolder).sort((a,b)=>a.id.localeCompare(b.id));
    const categories=uniqueCategories(Array.isArray(data?.categories)?data.categories:[...items.map(x=>x.category),...folders.map(x=>x.category)]).sort((a,b)=>a.localeCompare(b,'zh-CN'));
    return {app:'CFX-Post Formula and Command Library',version:7,defaultCategory:'未分类',categories,folders,items};
  };

  load=async function(){
    let data=null;
    try{data=await cacheGet(CACHE_KEYS.database);}catch(e){console.warn('读取 IndexedDB 命令库失败',e);}
    if(!validDatabase(data))data=legacyPayload();
    if(validDatabase(data))installPayload(data);else{state.items=clone(examples);state.categories=clone(defaultCategories);state.folders=[];}
    try{const rawCollapsed=localStorage.getItem(COLLAPSE_KEY);state.collapsedCategories=new Set(rawCollapsed?JSON.parse(rawCollapsed):[]);}catch(e){state.collapsedCategories=new Set();}
    const theme=localStorage.getItem(THEME_KEY);if(theme==='dark')document.body.classList.add('dark');
    try{let base=await cacheGet(CACHE_KEYS.githubBase);if(!base){try{base=JSON.parse(localStorage.getItem(GITHUB_BASE_KEY)||'null');}catch(e){base=null;}}if(base){state.github.basePayload=canonicalDatabase(base);await cachePut(CACHE_KEYS.githubBase,state.github.basePayload);}}catch(e){console.warn('读取 GitHub 同步基准失败',e);}
    try{const meta=await cacheGet(CACHE_KEYS.githubMeta);if(meta){state.github.remoteSha=meta.remoteSha||'';state.github.remoteEtag=meta.remoteEtag||'';state.github.lastSyncAt=meta.lastSyncAt||'';state.github.lastPushAt=meta.lastPushAt||'';state.github.lastCheckAt=meta.lastCheckAt||'';}}catch(e){console.warn('读取 GitHub 同步状态失败',e);}
    state.github.ready=true;
    await persistDatabaseCache(false);
  };
  save=function(markCloudDirty=true){scheduleDatabaseCacheWrite();if(state.fileStorage.autoSave&&state.fileStorage.handle&&!state.fileStorage.suspendAutosave)scheduleLinkedFileWrite();if(markCloudDirty)markGithubDirty();};
  saveCategories=function(){scheduleDatabaseCacheWrite();};
  saveFolders=function(){scheduleDatabaseCacheWrite();};

  applyIncomingDatabase=function(data,mode,source='外部数据库',options={}){
    const incoming=Array.isArray(data)?data:data?.items;if(!Array.isArray(incoming))throw new Error(`${source}不是有效的命令库 JSON。`);
    const incomingCats=Array.isArray(data?.categories)?uniqueCategories(data.categories):uniqueCategories(incoming.map(x=>x.category));
    const incomingFolders=Array.isArray(data?.folders)?data.folders.map(normalizeFolder):[];
    if(options.backup!==false)cachePut(CACHE_KEYS.lastBackup,{items:clone(state.items),categories:clone(state.categories),folders:clone(state.folders),savedAt:now(),source}).catch(e=>console.warn('写入导入前备份失败',e));
    if(mode==='replace'){state.items=incoming.map(normalizeItem);state.categories=uniqueCategories(incomingCats);state.folders=incomingFolders;}
    else{const map=new Map(state.items.map(x=>[x.id,x]));incoming.map(normalizeItem).forEach(x=>map.set(x.id,x));state.items=[...map.values()];const folderMap=new Map(state.folders.map(x=>[x.id,x]));incomingFolders.forEach(x=>folderMap.set(x.id,x));state.folders=[...folderMap.values()];state.categories=uniqueCategories([...state.categories,...incomingCats]);}
    const validFolderIds=new Set(state.folders.map(f=>f.id));state.items.forEach(x=>{if(x.folderId&&!validFolderIds.has(x.folderId))x.folderId='';});
    state.categories=uniqueCategories([...state.categories,...state.items.map(x=>x.category),...state.folders.map(x=>x.category)]);
    save(options.markDirty!==false);renderAll();return incoming.length;
  };

  githubConfigFromForm=function(){return {owner:$('#ghOwner').value.trim(),repo:$('#ghRepo').value.trim(),branch:$('#ghBranch').value.trim()||'main',path:$('#ghPath').value.trim()||'data/library.json',lastSyncAt:state.github.lastSyncAt||'',lastPushAt:state.github.lastPushAt||'',lastCheckAt:state.github.lastCheckAt||'',remoteSha:state.github.remoteSha||'',remoteEtag:state.github.remoteEtag||'',autoSync:!!$('#ghAutoSync')?.checked};};
  const originalLoadGithubConfig=loadGithubConfig;
  loadGithubConfig=function(){
    const remembered=localStorage.getItem(GITHUB_TOKEN_KEY)||'';
    if(remembered&&!sessionStorage.getItem(GITHUB_SESSION_TOKEN_KEY))sessionStorage.setItem(GITHUB_SESSION_TOKEN_KEY,remembered);
    removeLegacyLargeStorage();
    originalLoadGithubConfig();
    try{const cfg=JSON.parse(localStorage.getItem(GITHUB_CONFIG_KEY)||'{}');state.github.remoteEtag=cfg.remoteEtag||state.github.remoteEtag||'';}catch(e){}
    const remember=$('#rememberToken');if(remember){remember.checked=false;remember.disabled=true;const label=remember.closest('label');if(label){label.style.display='none';label.title='安全起见，令牌仅保存在当前浏览器会话中。';}}
    updateGithubUi();
  };
  saveGithubConfig=function(){
    const cfg=githubConfigFromForm();state.github.autoSync=!!cfg.autoSync;localStorage.setItem(GITHUB_CONFIG_KEY,JSON.stringify(cfg));
    const token=$('#ghToken').value.trim();sessionStorage.setItem(GITHUB_SESSION_TOKEN_KEY,token);localStorage.removeItem(GITHUB_TOKEN_KEY);
    configureGithubAutoSync();persistGithubMeta();
  };
  setGithubBase=function(payload){state.github.basePayload=canonicalDatabase(payload);cachePut(CACHE_KEYS.githubBase,state.github.basePayload).catch(e=>console.warn('GitHub 基准写入 IndexedDB 失败',e));localStorage.removeItem(GITHUB_BASE_KEY);};

  fetchGithubFile=async function(cfg,allowMissing=false,options={}){
    const headers=githubHeaders(cfg.token);if(options.conditional&&state.github.remoteEtag)headers['If-None-Match']=state.github.remoteEtag;
    const res=await fetch(githubApiUrl(cfg),{headers});
    if(res.status===304)return {notModified:true,sha:state.github.remoteSha||'',_etag:state.github.remoteEtag||''};
    if(res.status===404&&allowMissing)return null;
    const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.message||`GitHub 请求失败（HTTP ${res.status}）`);
    const etag=res.headers.get('ETag')||'';if(etag){body._etag=etag;state.github.remoteEtag=etag;}
    return body;
  };
  const originalHandleRemoteFile=handleRemoteFile;
  handleRemoteFile=async function(file,options={}){const result=await originalHandleRemoteFile(file,options);if(file?._etag)state.github.remoteEtag=file._etag;await persistGithubMeta();await persistDatabaseCache(false);return result;};
  checkGithubForUpdates=async function(reason='manual'){
    if(state.github.busy||state.github.conflict||!navigator.onLine)return false;if(reason==='timer'&&document.hidden)return false;
    let cfg;try{cfg=githubSettings();}catch(e){if(reason==='manual')showGithubMessage(e.message,'error');return false;}
    setGithubBusy(true);try{
      const file=await fetchGithubFile(cfg,true,{conditional:true});state.github.lastCheckAt=now();
      if(file?.notModified){state.github.connected=true;if(state.github.dirty&&state.github.autoSync)scheduleGithubAutoPush();saveGithubConfig();return true;}
      if(!file){state.github.connected=true;state.github.remoteEtag='';if(state.github.dirty&&state.github.autoSync)scheduleGithubAutoPush();saveGithubConfig();return true;}
      if(file.sha===state.github.remoteSha&&state.github.basePayload){state.github.connected=true;if(file._etag)state.github.remoteEtag=file._etag;if(state.github.dirty&&state.github.autoSync)scheduleGithubAutoPush();saveGithubConfig();return true;}
      await handleRemoteFile(file,{silent:reason!=='manual'});return !state.github.conflict;
    }catch(e){state.github.connected=false;if(reason==='manual')showGithubMessage(`检查失败：${e.message}`,'error');else console.warn('GitHub 自动检查失败',e);return false;}finally{setGithubBusy(false);}
  };
  const originalCompleteGithubPush=completeGithubPush;
  completeGithubPush=async function(body){state.github.remoteEtag='';await originalCompleteGithubPush(body);await persistGithubMeta();await persistDatabaseCache(false);};

  async function persistEditorDraft(){
    if(!els.workspace.classList.contains('with-detail'))return;
    try{await cachePut(CACHE_KEYS.editorDraft,{item:readEditor(),isNew:!state.editingId,editingId:state.editingId||'',savedAt:now()});}catch(e){console.warn('编辑草稿写入 IndexedDB 失败',e);}
  }
  function scheduleEditorDraft(){clearTimeout(draftTimer);draftTimer=setTimeout(persistEditorDraft,DRAFT_WRITE_DELAY);}
  async function clearEditorDraft(){clearTimeout(draftTimer);try{await cacheDelete(CACHE_KEYS.editorDraft);}catch(e){}}
  const originalSaveEditor=saveEditor;
  saveEditor=function(){const result=validateItem(readEditor());originalSaveEditor();if(!result.errors.length)clearEditorDraft();};
  async function restoreEditorDraft(){
    let draft=null;try{draft=await cacheGet(CACHE_KEYS.editorDraft);}catch(e){}
    if(!draft?.item)return;
    if(Date.now()-new Date(draft.savedAt||0).getTime()>7*24*60*60*1000){await clearEditorDraft();return;}
    const saved=draft.editingId?state.items.find(x=>x.id===draft.editingId):null;
    if(saved&&entityEqual(normalizeItem(saved),normalizeItem(draft.item))){await clearEditorDraft();return;}
    if(confirm(`检测到 ${formatSyncTime(draft.savedAt)} 保存的未提交编辑草稿，是否恢复？`)){fillEditor(normalizeItem(draft.item),!!draft.isNew);toast('已恢复本地编辑草稿');}else await clearEditorDraft();
  }
  function attachDraftListeners(){
    $$('#detailPanel input,#detailPanel textarea,#detailPanel select').forEach(el=>el.addEventListener('input',scheduleEditorDraft));
    $('#deleteBtn')?.addEventListener('click',()=>setTimeout(clearEditorDraft,0));
  }

  async function withGithubSyncLock(task){if(navigator.locks?.request)return navigator.locks.request('cfxpost-github-sync',{mode:'exclusive'},task);return task();}
  const originalPushToGithub=pushToGithub,originalAutoPushToGithub=autoPushToGithub;
  pushToGithub=function(){return withGithubSyncLock(()=>originalPushToGithub());};
  autoPushToGithub=function(){return withGithubSyncLock(()=>originalAutoPushToGithub());};

  async function requestPersistentStorage(){
    if(!navigator.storage?.persist)return;
    try{if(!(await navigator.storage.persisted()))await navigator.storage.persist();}catch(e){}
  }
  async function reloadFromSharedCache(){
    if(state.github.dirty||state.github.conflict||els.workspace.classList.contains('with-detail'))return;
    try{const data=await cacheGet(CACHE_KEYS.database);if(validDatabase(data)){installPayload(data);renderAll();toast('已载入其他标签页保存的数据');}}catch(e){}
  }
  if(channel)channel.onmessage=event=>{if(event.data?.source!==tabId&&event.data?.type==='database-updated')reloadFromSharedCache();};

  window.bootstrapCfxLibrary=async function(){
    await load();loadGithubConfig();renderAll();await initLinkedFileStorage();attachDraftListeners();await restoreEditorDraft();requestPersistentStorage();
  };
  window.addEventListener('pagehide',()=>{clearTimeout(cacheTimer);persistDatabaseCache(false);if(els.workspace.classList.contains('with-detail'))persistEditorDraft();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(cacheTimer);persistDatabaseCache(false);if(els.workspace.classList.contains('with-detail'))persistEditorDraft();}});
})();
