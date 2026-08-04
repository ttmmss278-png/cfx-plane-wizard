'use strict';
(function(){
  const GUARD_VERSION='2.0.0';
  const CACHE_DB='cfxpost_library_cache_v2';
  const CACHE_STORE='kv';
  const CACHE_VERSION=1;
  const CACHE_KEY='database-v3';
  const LEGACY_CACHE_KEY='database';
  const GITHUB_BASE_KEY_IDB='githubBase';
  const GITHUB_META_KEY_IDB='githubMeta';
  const BACKUP_KEY='crossTabConflictBackup-v3';
  const CHANNEL_NAME='cfxpost_library_cache_channel_v3';
  const WRITE_DELAY=140;
  const tabId=`tab-v3-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
  const NativeBroadcastChannel=window.__CfxNativeBroadcastChannel||window.BroadcastChannel;
  const channel=typeof NativeBroadcastChannel==='function'?new NativeBroadcastChannel(CHANNEL_NAME):null;

  let currentRevision=0;
  let cacheBasePayload=null;
  let localMutationRevision=0;
  let persistedMutationRevision=0;
  let authoritativeDepth=0;
  let pendingAuthoritative=false;
  let pendingSource='local';
  let writeTimer=null;
  let writeChain=Promise.resolve();
  let lastConflict=null;
  let lastWrite=null;

  function openCacheDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(CACHE_DB,CACHE_VERSION);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(CACHE_STORE))db.createObjectStore(CACHE_STORE);};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('IndexedDB 打开失败'));
    });
  }

  async function readKey(key){
    if(!('indexedDB' in window))return null;
    const db=await openCacheDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(CACHE_STORE,'readonly');
      const req=tx.objectStore(CACHE_STORE).get(key);
      req.onsuccess=()=>resolve(req.result??null);
      req.onerror=()=>reject(req.error);
      tx.oncomplete=()=>db.close();
      tx.onerror=()=>{db.close();reject(tx.error);};
    });
  }

  async function writeKey(key,value){
    if(!('indexedDB' in window))return false;
    const db=await openCacheDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(CACHE_STORE,'readwrite');
      tx.objectStore(CACHE_STORE).put(value,key);
      tx.oncomplete=()=>{db.close();resolve(true);};
      tx.onerror=()=>{db.close();reject(tx.error);};
    });
  }

  function isDatabase(data){return !!(data&&(Array.isArray(data.items)||Array.isArray(data)));}
  function canonical(data){return typeof canonicalDatabase==='function'?canonicalDatabase(data):clone(data);}
  function databaseSame(a,b){return typeof databaseEqual==='function'?databaseEqual(a,b):JSON.stringify(canonical(a))===JSON.stringify(canonical(b));}
  function makePayload(){return clone(makeDatabasePayload());}

  function decodeEnvelope(value){
    if(value&&value.schema==='cfx-cache-envelope-v3'&&isDatabase(value.payload)){
      return {
        schema:'cfx-cache-envelope-v3',
        revision:Math.max(0,Number(value.revision)||0),
        savedAt:value.savedAt||'',
        sourceTab:value.sourceTab||'',
        source:value.source||'cache',
        remoteSha:value.remoteSha||'',
        payload:canonical(value.payload)
      };
    }
    if(isDatabase(value)){
      return {schema:'cfx-cache-envelope-v3',revision:0,savedAt:'',sourceTab:'legacy',source:'legacy-cache',remoteSha:'',payload:canonical(value)};
    }
    return null;
  }

  function envelope(payload,revision,source){
    return {
      schema:'cfx-cache-envelope-v3',
      guardVersion:GUARD_VERSION,
      revision,
      savedAt:now(),
      sourceTab:tabId,
      source:source||'local',
      remoteSha:state.github.remoteSha||'',
      payload:canonical(payload)
    };
  }

  function captureView(){
    return {
      filterCategory:state.filterCategory,
      filterFolderId:state.filterFolderId,
      collapsedCategories:new Set(state.collapsedCategories||[]),
      selected:new Set(state.selected||[]),
      editingId:state.editingId||null
    };
  }

  function resolveView(view,payload){
    const folders=Array.isArray(payload?.folders)?payload.folders:[];
    const items=Array.isArray(payload?.items)?payload.items:[];
    const categories=new Set([...(payload?.categories||[]),...folders.map(x=>x.category),...items.map(x=>x.category),'全部条目','收藏夹']);
    const folder=folders.find(x=>x.id===view.filterFolderId);
    const next={...view,collapsedCategories:new Set(view.collapsedCategories||[]),selected:new Set(view.selected||[])};
    if(folder){
      next.filterCategory=folder.category;
      next.filterFolderId=folder.id;
      next.collapsedCategories.delete(folder.category);
    }else{
      next.filterFolderId='';
      if(!categories.has(next.filterCategory))next.filterCategory='全部条目';
    }
    const validItemIds=new Set(items.map(x=>x.id));
    next.selected=new Set([...next.selected].filter(id=>validItemIds.has(id)));
    if(next.editingId&&!validItemIds.has(next.editingId))next.editingId=null;
    return next;
  }

  function installPayloadPreservingView(data,{render=true}={}){
    const payload=canonical(data);
    const view=resolveView(captureView(),payload);
    state.items=payload.items.map(normalizeItem);
    state.folders=payload.folders.map(normalizeFolder);
    state.categories=uniqueCategories([...payload.categories,...state.items.map(x=>x.category),...state.folders.map(x=>x.category)]);
    const validFolderIds=new Set(state.folders.map(f=>f.id));
    state.items.forEach(item=>{if(item.folderId&&!validFolderIds.has(item.folderId))item.folderId='';});
    state.filterCategory=view.filterCategory;
    state.filterFolderId=view.filterFolderId;
    state.collapsedCategories=view.collapsedCategories;
    state.selected=view.selected;
    if(view.editingId!==state.editingId)state.editingId=view.editingId;
    saveCollapsed();
    if(render)renderAll();
    return payload;
  }

  function mergeDatabases(base,local,remote){
    if(base&&typeof threeWayMergeDatabases==='function')return threeWayMergeDatabases(base,local,remote);
    if(typeof initialSafeMergeDatabases==='function')return initialSafeMergeDatabases(local,remote);
    return {merged:local,conflicts:[]};
  }

  function hasUnpersistedMutation(){return localMutationRevision!==persistedMutationRevision;}

  function noteLocalMutation(markCloudDirty){
    localMutationRevision+=1;
    if(markCloudDirty){
      state.github.localRevision=(Number(state.github.localRevision)||0)+1;
      if(state.github.busy||Number(state.github.queueDepth)>0)state.github.syncPending=true;
    }
  }

  function chooseWrite(existing,local,{authoritative=false,source='local'}={}){
    const existingRevision=existing?.revision||0;
    if(!existing)return {kind:'write',payload:local,revision:Math.max(1,currentRevision+1),source};
    if(existingRevision<=currentRevision)return {kind:'write',payload:local,revision:currentRevision+1,source};

    if(!authoritative&&!hasUnpersistedMutation())return {kind:'adopt',existing};

    const result=mergeDatabases(cacheBasePayload,local,existing.payload);
    if(result?.conflicts?.length){
      if(authoritative){
        return {kind:'authoritative-write',payload:local,revision:existingRevision+1,source,conflicts:result.conflicts,backup:existing};
      }
      return {kind:'conflict',conflicts:result.conflicts,existing,local};
    }
    return {kind:'write',payload:canonical(result.merged),revision:existingRevision+1,source:`${source}:merged`};
  }

  async function atomicPersist(payload,options={}){
    if(!('indexedDB' in window))return {kind:'memory-only',payload};
    const db=await openCacheDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(CACHE_STORE,'readwrite');
      const store=tx.objectStore(CACHE_STORE);
      let outcome=null;
      const req=store.get(CACHE_KEY);
      req.onerror=()=>reject(req.error);
      req.onsuccess=()=>{
        try{
          const existing=decodeEnvelope(req.result);
          outcome=chooseWrite(existing,canonical(payload),options);
          if(outcome.kind==='write'||outcome.kind==='authoritative-write'){
            const next=envelope(outcome.payload,outcome.revision,outcome.source);
            store.put(next,CACHE_KEY);
            outcome.envelope=next;
            if(outcome.backup){
              store.put({savedAt:now(),reason:'authoritative-cache-conflict',existing:outcome.backup,local:canonical(payload),conflicts:outcome.conflicts||[]},BACKUP_KEY);
            }
          }else if(outcome.kind==='conflict'){
            store.put({savedAt:now(),reason:'cross-tab-cache-conflict',existing:outcome.existing,local:canonical(payload),conflicts:outcome.conflicts||[]},BACKUP_KEY);
          }
        }catch(error){reject(error);}
      };
      tx.oncomplete=()=>{db.close();resolve(outcome||{kind:'none'});};
      tx.onerror=()=>{db.close();reject(tx.error);};
      tx.onabort=()=>{db.close();reject(tx.error||new Error('缓存事务已中止'));};
    });
  }

  function broadcastEnvelope(saved){
    if(!channel||!saved)return;
    channel.postMessage({type:'database-updated-v3',sourceTab:tabId,revision:saved.revision,savedAt:saved.savedAt,remoteSha:saved.remoteSha||''});
  }

  async function persistRevisionedCache({broadcast=true,authoritative=false,source='local'}={}){
    const payload=makePayload();
    const outcome=await atomicPersist(payload,{authoritative,source});
    lastWrite={at:now(),kind:outcome.kind,source,authoritative};

    if(outcome.kind==='write'||outcome.kind==='authoritative-write'){
      currentRevision=outcome.envelope.revision;
      cacheBasePayload=canonical(outcome.envelope.payload);
      persistedMutationRevision=localMutationRevision;
      lastConflict=null;
      if(broadcast)broadcastEnvelope(outcome.envelope);
      return outcome;
    }

    if(outcome.kind==='adopt'&&outcome.existing){
      currentRevision=outcome.existing.revision;
      cacheBasePayload=canonical(outcome.existing.payload);
      persistedMutationRevision=localMutationRevision;
      if(!state.github.dirty&&!state.github.conflict&&!els.workspace.classList.contains('with-detail')){
        installPayloadPreservingView(outcome.existing.payload);
      }
      return outcome;
    }

    if(outcome.kind==='conflict'){
      lastConflict={at:now(),conflicts:outcome.conflicts||[],revision:outcome.existing?.revision||0};
      state.github.syncPending=true;
      updateGithubUi();
      if(!document.hidden)toast('检测到其他标签页修改，已保留本地备份，未覆盖当前数据');
    }
    return outcome;
  }

  function scheduleRevisionedWrite({authoritative=false,source='local'}={}){
    pendingAuthoritative=pendingAuthoritative||authoritative;
    pendingSource=authoritative?source:(pendingSource||source);
    clearTimeout(writeTimer);
    writeTimer=setTimeout(()=>{
      const options={broadcast:true,authoritative:pendingAuthoritative,source:pendingSource};
      pendingAuthoritative=false;
      pendingSource='local';
      writeChain=writeChain.then(()=>persistRevisionedCache(options)).catch(error=>console.warn('修订号缓存写入失败',error));
    },WRITE_DELAY);
  }

  async function reconcileFromSharedCache(reason='broadcast'){
    if(state.github.conflict||els.workspace.classList.contains('with-detail'))return false;
    const incoming=decodeEnvelope(await readKey(CACHE_KEY));
    if(!incoming||incoming.revision<=currentRevision)return false;
    if(!hasUnpersistedMutation()&&!state.github.dirty){
      installPayloadPreservingView(incoming.payload);
      currentRevision=incoming.revision;
      cacheBasePayload=canonical(incoming.payload);
      persistedMutationRevision=localMutationRevision;
      if(!document.hidden)toast('已载入其他标签页的更新');
      return true;
    }
    await persistRevisionedCache({broadcast:true,authoritative:false,source:`${reason}:reconcile`});
    return true;
  }

  const previousLoad=load;
  load=async function(){
    let stored=null;
    try{stored=decodeEnvelope(await readKey(CACHE_KEY));}catch(error){console.warn('读取修订号缓存失败',error);}
    if(!stored){
      try{stored=decodeEnvelope(await readKey(LEGACY_CACHE_KEY));}catch(error){console.warn('读取旧缓存失败',error);}
    }

    if(stored){
      installPayloadPreservingView(stored.payload,{render:false});
      currentRevision=stored.revision;
      cacheBasePayload=canonical(stored.payload);
    }else{
      try{await previousLoad();}catch(error){console.warn('旧版缓存加载失败',error);}
      cacheBasePayload=canonical(makePayload());
    }

    try{const rawCollapsed=localStorage.getItem(COLLAPSE_KEY);state.collapsedCategories=new Set(rawCollapsed?JSON.parse(rawCollapsed):[]);}catch(error){state.collapsedCategories=new Set();}
    const theme=localStorage.getItem(THEME_KEY);if(theme==='dark')document.body.classList.add('dark');

    try{
      let base=await readKey(GITHUB_BASE_KEY_IDB);
      if(!base){try{base=JSON.parse(localStorage.getItem(GITHUB_BASE_KEY)||'null');}catch(error){base=null;}}
      if(base){state.github.basePayload=canonical(base);await writeKey(GITHUB_BASE_KEY_IDB,state.github.basePayload);}
    }catch(error){console.warn('读取 GitHub 同步基准失败',error);}

    try{
      const meta=await readKey(GITHUB_META_KEY_IDB);
      if(meta){state.github.remoteSha=meta.remoteSha||'';state.github.remoteEtag=meta.remoteEtag||'';state.github.lastSyncAt=meta.lastSyncAt||'';state.github.lastPushAt=meta.lastPushAt||'';state.github.lastCheckAt=meta.lastCheckAt||'';}
    }catch(error){console.warn('读取 GitHub 同步状态失败',error);}

    state.github.ready=true;
    persistedMutationRevision=localMutationRevision;
    await persistRevisionedCache({broadcast:false,authoritative:true,source:stored?'startup-normalize':'startup-migrate'});
  };

  save=function(markCloudDirty=true){
    const authoritative=authoritativeDepth>0;
    if(!authoritative)noteLocalMutation(markCloudDirty);
    scheduleRevisionedWrite({authoritative,source:authoritative?'incoming-database':'save'});
    if(state.fileStorage.autoSave&&state.fileStorage.handle&&!state.fileStorage.suspendAutosave)scheduleLinkedFileWrite();
    if(markCloudDirty)markGithubDirty();
  };

  saveCategories=function(markCloudDirty=true){
    noteLocalMutation(markCloudDirty);
    scheduleRevisionedWrite({source:'categories'});
    if(markCloudDirty)markGithubDirty();
  };

  saveFolders=function(markCloudDirty=true){
    noteLocalMutation(markCloudDirty);
    scheduleRevisionedWrite({source:'folders'});
    if(markCloudDirty)markGithubDirty();
  };

  const previousApplyIncomingDatabase=applyIncomingDatabase;
  applyIncomingDatabase=function(data,mode,source='外部数据库',options={}){
    authoritativeDepth+=1;
    try{
      const count=previousApplyIncomingDatabase(data,mode,source,options);
      scheduleRevisionedWrite({authoritative:options.markDirty===false||source.includes('GitHub'),source:`incoming:${source}`});
      const folder=state.folders.find(item=>item.id===state.filterFolderId);
      if(folder){state.filterCategory=folder.category;state.collapsedCategories.delete(folder.category);saveCollapsed();renderAll();}
      return count;
    }finally{authoritativeDepth-=1;}
  };

  const previousHandleRemoteFile=handleRemoteFile;
  handleRemoteFile=async function(file,options={}){
    const result=await previousHandleRemoteFile(file,options);
    await persistRevisionedCache({broadcast:true,authoritative:true,source:'github-pull'});
    return result;
  };

  const previousCompleteGithubPush=completeGithubPush;
  completeGithubPush=async function(body,payloadOverride=null){
    const result=await previousCompleteGithubPush(body,payloadOverride);
    await persistRevisionedCache({broadcast:true,authoritative:true,source:'github-push'});
    return result;
  };

  if(channel){
    channel.onmessage=event=>{
      const message=event.data||{};
      if(message.type!=='database-updated-v3'||message.sourceTab===tabId)return;
      const revision=Number(message.revision)||0;
      if(revision<=currentRevision)return;
      reconcileFromSharedCache('broadcast').catch(error=>console.warn('跨标签页缓存合并失败',error));
    };
  }

  window.addEventListener('pagehide',()=>{
    clearTimeout(writeTimer);
    writeChain=writeChain.then(()=>persistRevisionedCache({broadcast:false,authoritative:false,source:'pagehide'})).catch(()=>{});
  });

  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){
      clearTimeout(writeTimer);
      writeChain=writeChain.then(()=>persistRevisionedCache({broadcast:false,authoritative:false,source:'visibility-hidden'})).catch(()=>{});
    }else{
      reconcileFromSharedCache('visibility-visible').catch(()=>{});
    }
  });

  function runSelfTests(){
    const tests=[];
    const assert=(name,condition)=>{if(!condition)throw new Error(`缓存自检失败：${name}`);tests.push(name);};
    const base={app:'CFX-Post Formula and Command Library',version:7,categories:['线段','原始平面'],folders:[],items:[]};
    const local={...base,folders:[{id:'f-line',name:'PZ2',category:'线段'}]};
    const remote={...base,folders:[{id:'f-plane',name:'PZ2',category:'原始平面'}]};
    const sameName=mergeDatabases(base,local,remote);
    assert('不同分类同名 PZ2 可共存',!sameName.conflicts?.length&&sameName.merged.folders.length===2);

    const itemLocal={...base,items:[{id:'i1',title:'A',type:'ccl',category:'线段',folderId:'',cclCode:'A'}]};
    const itemRemote={...base,items:[{id:'i2',title:'B',type:'ccl',category:'线段',folderId:'',cclCode:'B'}]};
    const independent=mergeDatabases(base,itemLocal,itemRemote);
    assert('不同实体可自动合并',!independent.conflicts?.length&&independent.merged.items.length===2);

    const priorRevision=currentRevision,priorLocal=localMutationRevision,priorPersisted=persistedMutationRevision;
    currentRevision=2;localMutationRevision=0;persistedMutationRevision=0;
    const stale=chooseWrite({revision:3,payload:canonical(base)},canonical(base),{authoritative:false,source:'test'});
    assert('旧标签页无修改时不能覆盖新缓存',stale.kind==='adopt');
    currentRevision=priorRevision;localMutationRevision=priorLocal;persistedMutationRevision=priorPersisted;

    const view=resolveView({filterCategory:'线段',filterFolderId:'f-line',collapsedCategories:new Set(['线段']),selected:new Set(),editingId:null},local);
    assert('当前文件夹视图得到保留并展开',view.filterFolderId==='f-line'&&!view.collapsedCategories.has('线段'));
    return {passed:tests.length,tests};
  }

  window.CfxCacheDiagnostics={
    version:GUARD_VERSION,
    getState:()=>({tabId,currentRevision,localMutationRevision,persistedMutationRevision,hasUnpersistedMutation:hasUnpersistedMutation(),lastConflict:clone(lastConflict),lastWrite:clone(lastWrite),remoteSha:state.github.remoteSha||'',filterCategory:state.filterCategory,filterFolderId:state.filterFolderId}),
    readEnvelope:()=>readKey(CACHE_KEY).then(decodeEnvelope),
    forcePersist:()=>persistRevisionedCache({broadcast:true,authoritative:false,source:'diagnostic'}),
    reconcile:()=>reconcileFromSharedCache('diagnostic'),
    runSelfTests
  };

  try{console.info('[CFX Cache Guard]',{version:GUARD_VERSION,tests:runSelfTests()});}catch(error){console.error(error);}
})();
