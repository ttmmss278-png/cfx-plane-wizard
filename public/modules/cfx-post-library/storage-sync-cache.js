'use strict';
(function(){
  const CACHE_DB='cfxpost_library_cache_v2';
  const CACHE_STORE='kv';
  const CACHE_VERSION=1;
  const CACHE_KEYS={database:'database',githubBase:'githubBase',githubMeta:'githubMeta',editorDraft:'editorDraft',lastBackup:'lastBackup'};
  const CACHE_WRITE_DELAY=120;
  const DRAFT_WRITE_DELAY=500;
  const CACHE_RECORD_KIND='cfx-library-cache-record';
  const CACHE_RECORD_VERSION=1;
  const tabId=`tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('cfxpost_library_cache_channel_v1'):null;
  let cacheTimer=null,draftTimer=null,cacheWriteChain=Promise.resolve();

  /* ---------- revision bookkeeping ---------- */
  let cacheRevision=0;            // highest shared-cache revision this tab has read or written
  let lastAdoptedPayload=null;    // common ancestor for three-way merges
  let localMutations=0;           // local business mutations in this tab
  let syncedMutations=0;          // local mutations already reflected in the shared cache
  const cacheLog=[];

  function logCache(event,details={}){
    const entry={at:now(),event,tab:tabId,revision:cacheRevision,...details};
    cacheLog.push(entry);
    if(cacheLog.length>120)cacheLog.splice(0,cacheLog.length-120);
    return entry;
  }
  function hasLocalChanges(){return localMutations>syncedMutations;}
  function noteLocalCacheMutation(source){
    localMutations+=1;
    logCache('local-mutation',{source,localMutations});
  }

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

  /* ---------- wrapped cache record (backward compatible) ---------- */
  function isCacheRecord(raw){return !!(raw&&raw.kind===CACHE_RECORD_KIND&&raw.payload);}
  function normalizeCacheRecord(raw){
    if(!raw)return null;
    if(isCacheRecord(raw)){
      if(!validDatabase(raw.payload))return null;
      return {
        kind:CACHE_RECORD_KIND,
        recordVersion:Number(raw.recordVersion)||CACHE_RECORD_VERSION,
        payload:raw.payload,
        revision:Math.max(0,Number(raw.revision)||0),
        savedAt:raw.savedAt||'',
        sourceTab:raw.sourceTab||'',
        remoteSha:raw.remoteSha||'',
        authoritative:!!raw.authoritative,
        legacy:false
      };
    }
    // Legacy shape: the raw payload was stored directly.
    if(!validDatabase(raw))return null;
    return {kind:CACHE_RECORD_KIND,recordVersion:0,payload:raw,revision:0,savedAt:raw.exportedAt||'',sourceTab:'',remoteSha:'',authoritative:false,legacy:true};
  }
  function makeCacheRecord(payload,revision,extra={}){
    return {
      kind:CACHE_RECORD_KIND,
      recordVersion:CACHE_RECORD_VERSION,
      payload,
      revision,
      savedAt:now(),
      sourceTab:tabId,
      remoteSha:state.github.remoteSha||'',
      authoritative:!!extra.authoritative
    };
  }
  async function readCacheRecord(){
    let raw=null;
    try{raw=await cacheGet(CACHE_KEYS.database);}catch(e){console.warn('读取 IndexedDB 命令库失败',e);}
    return normalizeCacheRecord(raw);
  }

  /* ---------- payload install helpers ---------- */
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

  /* ---------- view state preservation ---------- */
  function captureView(){
    return {
      filterCategory:state.filterCategory,
      filterFolderId:state.filterFolderId,
      filterType:state.filterType,
      search:state.search,
      favoritesOnly:state.favoritesOnly,
      sort:state.sort,
      collapsed:[...(state.collapsedCategories||[])]
    };
  }
  function resolveViewState(view,payload){
    const folders=Array.isArray(payload?.folders)?payload.folders:[];
    const items=Array.isArray(payload?.items)?payload.items:(Array.isArray(payload)?payload:[]);
    const categories=uniqueCategories([...(payload?.categories||[]),...folders.map(f=>f.category),...items.map(x=>x.category)]);
    const result={...view,collapsed:[...(view.collapsed||[])]};
    if(view.filterFolderId&&view.filterFolderId!=='__ungrouped__'){
      const folder=folders.find(f=>f.id===view.filterFolderId);
      if(folder){
        result.filterCategory=folder.category;
        result.collapsed=result.collapsed.filter(cat=>cat!==folder.category);
      }else{
        result.filterFolderId='';
      }
    }
    const systemCats=['全部条目','收藏夹','未分类'];
    if(!systemCats.includes(result.filterCategory)&&!categories.includes(result.filterCategory)){
      result.filterCategory='全部条目';
      result.filterFolderId='';
    }
    return result;
  }
  function applyView(view){
    state.filterCategory=view.filterCategory;
    state.filterFolderId=view.filterFolderId;
    state.filterType=view.filterType;
    state.search=view.search;
    state.favoritesOnly=view.favoritesOnly;
    state.sort=view.sort;
    state.collapsedCategories=new Set(view.collapsed||[]);
  }
  function installPayloadPreservingView(payload,{render=true}={}){
    const view=captureView();
    installPayload(payload);
    applyView(resolveViewState(view,payload));
    try{saveCollapsed();}catch(e){}
    if(render&&typeof renderAll==='function')renderAll();
  }

  /* ---------- write decision (pure, self-testable) ---------- */
  function decideWrite({latestRevision=0,tabRevision=0,localChanges=false,authoritative=false}={}){
    if(authoritative)return 'write';
    if(latestRevision<=tabRevision)return 'write';
    return localChanges?'merge':'adopt';
  }
  function safeThreeWayMerge(base,local,remote){
    if(typeof threeWayMergeDatabases==='function')return threeWayMergeDatabases(base,local,remote);
    return {merged:null,conflicts:[{id:'merge-unavailable',label:'合并',name:'合并函数不可用'}]};
  }

  function legacyPayload(){
    try{
      const rawItems=localStorage.getItem(STORAGE_KEY),rawCats=localStorage.getItem(CATEGORY_KEY),rawFolders=localStorage.getItem(FOLDER_KEY);
      if(!rawItems&&!rawCats&&!rawFolders)return null;
      return {app:'CFX-Post Formula and Command Library',version:7,appVersion:'1.8.0',exportedAt:now(),defaultCategory:'未分类',items:rawItems?JSON.parse(rawItems):[],categories:rawCats?JSON.parse(rawCats):[],folders:rawFolders?JSON.parse(rawFolders):[]};
    }catch(e){console.warn('旧版 localStorage 数据迁移失败',e);return null;}
  }
  function removeLegacyLargeStorage(){
    try{localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(CATEGORY_KEY);localStorage.removeItem(FOLDER_KEY);localStorage.removeItem(GITHUB_BASE_KEY);}catch(e){}
  }
  async function persistGithubMeta(){
    const meta={remoteSha:state.github.remoteSha||'',remoteEtag:state.github.remoteEtag||'',lastSyncAt:state.github.lastSyncAt||'',lastPushAt:state.github.lastPushAt||'',lastCheckAt:state.github.lastCheckAt||'',savedAt:now()};
    try{await cachePut(CACHE_KEYS.githubMeta,meta);}catch(e){console.warn('GitHub 同步元数据写入 IndexedDB 失败',e);}
  }

  async function backupLocalState(source){
    try{
      await cachePut(CACHE_KEYS.lastBackup,{items:clone(state.items),categories:clone(state.categories),folders:clone(state.folders),savedAt:now(),source});
    }catch(e){console.warn('写入本地备份失败',e);}
  }

  async function runCacheWriteCycle({authoritative=false,broadcast=true,render=true,payloadOverride=null}={}){
    const latest=await readCacheRecord();
    const latestRevision=latest?latest.revision:0;
    const localChanges=hasLocalChanges();
    const decision=decideWrite({latestRevision,tabRevision:cacheRevision,localChanges,authoritative});

    if(decision==='adopt'){
      installPayloadPreservingView(latest.payload,{render});
      cacheRevision=latestRevision;
      lastAdoptedPayload=clone(latest.payload);
      syncedMutations=localMutations;
      logCache('adopt-newer-cache',{from:latest.sourceTab,revision:latestRevision});
      if(typeof recomputeGithubDirty==='function')recomputeGithubDirty();
      return {action:'adopted',revision:latestRevision};
    }

    if(decision==='merge'){
      const local=clone(payloadOverride||makeDatabasePayload());
      const result=safeThreeWayMerge(lastAdoptedPayload,local,latest.payload);
      if(result.conflicts&&result.conflicts.length){
        await backupLocalState('跨标签页缓存冲突');
        logCache('merge-conflict',{names:result.conflicts.map(x=>x.name||x.id).slice(0,8),revision:latestRevision});
        if(typeof toast==='function')toast('检测到其他标签页的修改与本地修改冲突，已保留本地数据并生成备份');
        return {action:'conflict-kept-local',revision:latestRevision,conflicts:result.conflicts};
      }
      installPayloadPreservingView(result.merged,{render});
      logCache('merged-cross-tab',{revision:latestRevision});
    }

    const payload=clone(decision==='merge'?makeDatabasePayload():(payloadOverride||makeDatabasePayload()));
    const nextRevision=Math.max(latestRevision,cacheRevision)+1;
    await cachePut(CACHE_KEYS.database,makeCacheRecord(payload,nextRevision,{authoritative}));
    removeLegacyLargeStorage();
    cacheRevision=nextRevision;
    lastAdoptedPayload=clone(payload);
    syncedMutations=localMutations;
    logCache('write',{revision:nextRevision,authoritative,merged:decision==='merge'});
    if(broadcast&&channel){
      channel.postMessage({type:'database-updated',source:tabId,revision:nextRevision,authoritative,at:Date.now()});
    }
    return {action:decision==='merge'?'merged-write':'write',revision:nextRevision};
  }

  async function persistDatabaseCache(broadcast=true,options={}){
    cacheWriteChain=cacheWriteChain
      .then(()=>runCacheWriteCycle({broadcast,...options}))
      .catch(e=>{console.warn('命令库写入 IndexedDB 失败',e);return {action:'error',error:e?.message||String(e)};});
    return cacheWriteChain;
  }
  function scheduleDatabaseCacheWrite(){clearTimeout(cacheTimer);cacheTimer=setTimeout(()=>persistDatabaseCache(true),CACHE_WRITE_DELAY);}

  makeDatabasePayload=function(){return {app:'CFX-Post Formula and Command Library',version:7,appVersion:'1.8.0',exportedAt:now(),defaultCategory:'未分类',categories:state.categories,folders:state.folders,items:state.items};};
  canonicalDatabase=function(data){
    const incoming=Array.isArray(data)?data:data?.items||[];
    const items=Array.isArray(incoming)?incoming.map(normalizeItem).sort((a,b)=>a.id.localeCompare(b.id)):[];
    const folders=(Array.isArray(data?.folders)?data.folders:[]).map(normalizeFolder).sort((a,b)=>a.id.localeCompare(b.id));
    const categories=uniqueCategories(Array.isArray(data?.categories)?data.categories:[...items.map(x=>x.category),...folders.map(x=>x.category)]).sort((a,b)=>a.localeCompare(b,'zh-CN'));
    return {app:'CFX-Post Formula and Command Library',version:7,defaultCategory:'未分类',categories,folders,items};
  };

  load=async function(){
    const record=await readCacheRecord();
    let data=record?record.payload:null;
    if(record){cacheRevision=record.revision;logCache('load-cache',{revision:record.revision,legacy:record.legacy});}
    if(!validDatabase(data))data=legacyPayload();
    if(validDatabase(data))installPayload(data);else{state.items=clone(examples);state.categories=clone(defaultCategories);state.folders=[];}
    try{const rawCollapsed=localStorage.getItem(COLLAPSE_KEY);state.collapsedCategories=new Set(rawCollapsed?JSON.parse(rawCollapsed):[]);}catch(e){state.collapsedCategories=new Set();}
    const theme=localStorage.getItem(THEME_KEY);if(theme==='dark')document.body.classList.add('dark');
    try{let base=await cacheGet(CACHE_KEYS.githubBase);if(!base){try{base=JSON.parse(localStorage.getItem(GITHUB_BASE_KEY)||'null');}catch(e){base=null;}}if(base){state.github.basePayload=canonicalDatabase(base);await cachePut(CACHE_KEYS.githubBase,state.github.basePayload);}}catch(e){console.warn('读取 GitHub 同步基准失败',e);}
    try{const meta=await cacheGet(CACHE_KEYS.githubMeta);if(meta){state.github.remoteSha=meta.remoteSha||'';state.github.remoteEtag=meta.remoteEtag||'';state.github.lastSyncAt=meta.lastSyncAt||'';state.github.lastPushAt=meta.lastPushAt||'';state.github.lastCheckAt=meta.lastCheckAt||'';}}catch(e){console.warn('读取 GitHub 同步状态失败',e);}
    state.github.ready=true;
    lastAdoptedPayload=clone(makeDatabasePayload());
    syncedMutations=localMutations;
    await persistDatabaseCache(false);
  };
  save=function(markCloudDirty=true){noteLocalCacheMutation('database');scheduleDatabaseCacheWrite();if(state.fileStorage.autoSave&&state.fileStorage.handle&&!state.fileStorage.suspendAutosave)scheduleLinkedFileWrite();if(markCloudDirty)markGithubDirty();};
  saveCategories=function(){noteLocalCacheMutation('categories');scheduleDatabaseCacheWrite();};
  saveFolders=function(){noteLocalCacheMutation('folders');scheduleDatabaseCacheWrite();};

  applyIncomingDatabase=function(data,mode,source='外部数据库',options={}){
    const incoming=Array.isArray(data)?data:data?.items;if(!Array.isArray(incoming))throw new Error(`${source}不是有效的命令库 JSON。`);
    const incomingCats=Array.isArray(data?.categories)?uniqueCategories(data.categories):uniqueCategories(incoming.map(x=>x.category));
    const incomingFolders=Array.isArray(data?.folders)?data.folders.map(normalizeFolder):[];
    if(options.backup!==false)backupLocalState(source);
    const view=captureView();
    if(mode==='replace'){state.items=incoming.map(normalizeItem);state.categories=uniqueCategories(incomingCats);state.folders=incomingFolders;}
    else{const map=new Map(state.items.map(x=>[x.id,x]));incoming.map(normalizeItem).forEach(x=>map.set(x.id,x));state.items=[...map.values()];const folderMap=new Map(state.folders.map(x=>[x.id,x]));incomingFolders.forEach(x=>folderMap.set(x.id,x));state.folders=[...folderMap.values()];state.categories=uniqueCategories([...state.categories,...incomingCats]);}
    const validFolderIds=new Set(state.folders.map(f=>f.id));state.items.forEach(x=>{if(x.folderId&&!validFolderIds.has(x.folderId))x.folderId='';});
    state.categories=uniqueCategories([...state.categories,...state.items.map(x=>x.category),...state.folders.map(x=>x.category)]);
    applyView(resolveViewState(view,makeDatabasePayload()));
    try{saveCollapsed();}catch(e){}
    noteLocalCacheMutation('incoming-database');
    if(options.markDirty!==false){save(true);}
    else{clearTimeout(cacheTimer);persistDatabaseCache(true,{authoritative:true,render:false});}
    renderAll();return incoming.length;
  };

  githubConfigFromForm=function(){return {owner:$('#ghOwner').value.trim(),repo:$('#ghRepo').value.trim(),branch:$('#ghBranch').value.trim()||'main',path:$('#ghPath').value.trim()||'data/library.json',lastSyncAt:state.github.lastSyncAt||'',lastPushAt:state.github.lastPushAt||'',lastCheckAt:state.github.lastCheckAt||'',remoteSha:state.github.remoteSha||'',remoteEtag:state.github.remoteEtag||'',autoSync:!!$('#ghAutoSync')?.checked};};
  const originalLoadGithubConfig=loadGithubConfig;
  loadGithubConfig=function(){
    const remembered=localStorage.getItem(GITHUB_TOKEN_KEY)||'';
    if(remembered){
      if(!sessionStorage.getItem(GITHUB_SESSION_TOKEN_KEY))sessionStorage.setItem(GITHUB_SESSION_TOKEN_KEY,remembered);
      localStorage.removeItem(GITHUB_TOKEN_KEY);
    }
    removeLegacyLargeStorage();
    originalLoadGithubConfig();
    try{const cfg=JSON.parse(localStorage.getItem(GITHUB_CONFIG_KEY)||'{}');state.github.remoteEtag=cfg.remoteEtag||state.github.remoteEtag||'';}catch(e){}
    const remember=$('#rememberToken');if(remember){remember.checked=false;remember.disabled=true;const row=remember.closest('.checkline');if(row){row.style.display='none';row.title='安全起见，令牌仅保存在当前浏览器会话中。';}}
    const tokenPolicyHint=document.querySelector('.sync-policy .hint');if(tokenPolicyHint)tokenPolicyHint.textContent='关闭浏览器后需要重新填写 Token；自动同步只在当前会话内有效。Token 不会写入网页源码或长期存储。';
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
  handleRemoteFile=async function(file,options={}){
    const result=await originalHandleRemoteFile(file,options);
    if(file?._etag)state.github.remoteEtag=file._etag;
    await persistGithubMeta();
    clearTimeout(cacheTimer);
    await persistDatabaseCache(true,{authoritative:true,render:false});
    return result;
  };
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
  completeGithubPush=async function(body,payloadOverride=null){
    state.github.remoteEtag='';
    await originalCompleteGithubPush(body,payloadOverride);
    await persistGithubMeta();
    clearTimeout(cacheTimer);
    await persistDatabaseCache(true,{authoritative:true,render:false});
  };

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

  /* ---------- cross-tab reload ---------- */
  async function reloadFromSharedCache(incomingRevision=Infinity){
    if(state.github.conflict||els.workspace.classList.contains('with-detail'))return false;
    const record=await readCacheRecord();
    if(!record)return false;
    if(record.revision<=cacheRevision){logCache('ignore-stale-broadcast',{incoming:record.revision});return false;}
    if(hasLocalChanges()||state.github.dirty){
      const result=safeThreeWayMerge(lastAdoptedPayload,clone(makeDatabasePayload()),record.payload);
      if(result.conflicts&&result.conflicts.length){
        await backupLocalState('跨标签页缓存冲突');
        logCache('reload-conflict',{names:result.conflicts.map(x=>x.name||x.id).slice(0,8)});
        if(typeof toast==='function')toast('其他标签页的修改与本地未同步修改冲突，已保留本地数据并生成备份');
        return false;
      }
      installPayloadPreservingView(result.merged);
      cacheRevision=record.revision;
      lastAdoptedPayload=clone(record.payload);
      clearTimeout(cacheTimer);
      await persistDatabaseCache(true);
      if(typeof toast==='function')toast('已合并其他标签页保存的数据');
      return true;
    }
    installPayloadPreservingView(record.payload);
    cacheRevision=record.revision;
    lastAdoptedPayload=clone(record.payload);
    syncedMutations=localMutations;
    if(typeof recomputeGithubDirty==='function')recomputeGithubDirty();
    logCache('reload-adopt',{revision:record.revision,from:record.sourceTab});
    if(typeof toast==='function')toast('已载入其他标签页保存的数据');
    return true;
  }
  if(channel)channel.onmessage=event=>{
    const data=event.data||{};
    if(data.source===tabId||data.type!=='database-updated')return;
    const revision=Math.max(0,Number(data.revision)||0);
    if(revision&&revision<=cacheRevision){logCache('ignore-old-message',{incoming:revision,from:data.source});return;}
    reloadFromSharedCache(revision);
  };

  /* ---------- shutdown paths must never clobber a newer cache ---------- */
  function flushOnHide(){
    clearTimeout(cacheTimer);
    persistDatabaseCache(false,{render:false});
    if(els.workspace.classList.contains('with-detail'))persistEditorDraft();
  }

  window.bootstrapCfxLibrary=async function(){
    await load();loadGithubConfig();renderAll();await initLinkedFileStorage();attachDraftListeners();await restoreEditorDraft();requestPersistentStorage();
  };
  window.addEventListener('pagehide',flushOnHide);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)flushOnHide();});

  /* ---------- diagnostics ---------- */
  function folderFixture(id,name,category){return {id,name,category,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'};}
  function itemFixture(id,title,category,folderId){return normalizeItem({id,title,type:'ccl',category,folderId,cclCode:title,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'});}
  function dbFixture(folders,items){return {app:'CFX-Post Formula and Command Library',version:7,defaultCategory:'未分类',categories:uniqueCategories([...folders.map(f=>f.category),...items.map(i=>i.category)]),folders,items};}

  function runSelfTests(){
    const tests=[];
    const check=(name,ok,detail='')=>tests.push({name,ok:!!ok,detail});

    // 1. Legacy raw payload cache is still readable, wrapped record wins.
    const legacy=normalizeCacheRecord({items:[],folders:[],categories:[]});
    const wrapped=normalizeCacheRecord(makeCacheRecord(dbFixture([],[]),7));
    check('旧版直接 payload 缓存可兼容读取',!!legacy&&legacy.revision===0&&legacy.legacy===true,JSON.stringify({revision:legacy?.revision}));
    check('新版包裹结构读取 revision',!!wrapped&&wrapped.revision===7&&wrapped.legacy===false);

    // 2. An older tab must never overwrite a newer cache.
    check('旧标签页无本地修改时采用新缓存',decideWrite({latestRevision:9,tabRevision:4,localChanges:false})==='adopt');
    check('旧标签页有本地修改时走三方合并',decideWrite({latestRevision:9,tabRevision:4,localChanges:true})==='merge');
    check('缓存未更新时正常写入',decideWrite({latestRevision:4,tabRevision:4,localChanges:true})==='write');
    check('GitHub 权威更新可直接写入',decideWrite({latestRevision:99,tabRevision:1,localChanges:false,authoritative:true})==='write');

    // 3. Same-name PZ2 folders in different categories must coexist.
    const base=dbFixture([],[]);
    const localPz2=folderFixture('folder-local-pz2','PZ2','线段');
    const remotePz2=folderFixture('folder-remote-pz2','PZ2','曲线');
    const localDb=dbFixture([localPz2],[itemFixture('item-local','L1','线段','folder-local-pz2')]);
    const remoteDb=dbFixture([remotePz2],[itemFixture('item-remote','R1','曲线','folder-remote-pz2')]);
    const merged=safeThreeWayMerge(base,localDb,remoteDb);
    const mergedFolders=merged.merged?.folders||[];
    const pz2Count=mergedFolders.filter(f=>f.name==='PZ2').length;
    check('不同分类的同名 PZ2 文件夹共存',!merged.conflicts.length&&pz2Count===2,`folders=${mergedFolders.map(f=>`${f.category}/${f.name}`).join(',')}`);
    check('不同实体条目合并后都保留',(merged.merged?.items||[]).length===2);

    // 4. Concurrent creation in the same category also merges (no false conflict).
    const sameCat=safeThreeWayMerge(base,dbFixture([folderFixture('f-a','PZ2','线段')],[]),dbFixture([folderFixture('f-b','PZ3','线段')],[]));
    check('同分类不同文件夹并发创建不冲突',!sameCat.conflicts.length&&(sameCat.merged?.folders||[]).length===2);

    // 5. Current folder view is preserved across a cache reload.
    const payload=dbFixture([localPz2],[itemFixture('item-local','L1','线段','folder-local-pz2')]);
    const keptView=resolveViewState({filterCategory:'线段',filterFolderId:'folder-local-pz2',filterType:'all',search:'',favoritesOnly:false,sort:'updated',collapsed:['线段']},payload);
    check('当前文件夹仍存在时保留选中并展开分类',keptView.filterFolderId==='folder-local-pz2'&&keptView.filterCategory==='线段'&&!keptView.collapsed.includes('线段'),JSON.stringify(keptView));
    const goneView=resolveViewState({filterCategory:'线段',filterFolderId:'folder-deleted',filterType:'all',search:'',favoritesOnly:false,sort:'updated',collapsed:[]},payload);
    check('文件夹已被删除时回退到分类视图',goneView.filterFolderId===''&&goneView.filterCategory==='线段',JSON.stringify(goneView));

    const failed=tests.filter(t=>!t.ok);
    const summary={total:tests.length,passed:tests.length-failed.length,failed:failed.length};
    console.table(tests);
    console.info('[CFX Cache SelfTest]',summary);
    return {summary,tests};
  }

  window.CfxCacheDiagnostics={
    getState(){
      return {
        tabId,
        cacheRevision,
        localMutations,
        syncedMutations,
        hasLocalChanges:hasLocalChanges(),
        recordVersion:CACHE_RECORD_VERSION,
        remoteSha:state.github.remoteSha||'',
        githubDirty:!!state.github.dirty,
        githubConflict:!!state.github.conflict,
        folders:state.folders.map(f=>({id:f.id,name:f.name,category:f.category})),
        itemCount:state.items.length,
        view:captureView(),
        log:cacheLog.slice(-20)
      };
    },
    async readRecord(){const record=await readCacheRecord();return record?{revision:record.revision,savedAt:record.savedAt,sourceTab:record.sourceTab,remoteSha:record.remoteSha,legacy:record.legacy,folders:(record.payload.folders||[]).length,items:(record.payload.items||[]).length}:null;},
    decideWrite,
    resolveViewState,
    persistAuthoritative(){clearTimeout(cacheTimer);return persistDatabaseCache(true,{authoritative:true,render:false});},
    persistLocal(){clearTimeout(cacheTimer);return persistDatabaseCache(true,{render:false});},
    normalizeCacheRecord,
    reloadFromSharedCache,
    runSelfTests
  };
})();
