'use strict';
(function(){
  const SYNC_HARDENING_VERSION='1.8.0';
  const MAX_SYNC_LOGS=100;
  const queue=[];
  const queuedByKey=new Map();
  let queueRunning=false;

  state.github.syncLog=Array.isArray(state.github.syncLog)?state.github.syncLog:[];
  state.github.syncPaused=!!state.github.syncPaused;
  state.github.queueDepth=0;

  function syncLog(event,details={}){
    const safe={...details};
    delete safe.token;
    const entry={at:now(),event,...safe};
    state.github.syncLog.push(entry);
    if(state.github.syncLog.length>MAX_SYNC_LOGS)state.github.syncLog.splice(0,state.github.syncLog.length-MAX_SYNC_LOGS);
    console.info('[CFX GitHub Sync]',entry);
    return entry;
  }

  function stableHash(value){
    const text=typeof value==='string'?value:JSON.stringify(value);
    let hash=2166136261;
    for(let i=0;i<text.length;i++){
      hash^=text.charCodeAt(i);
      hash=Math.imul(hash,16777619);
    }
    return (hash>>>0).toString(16).padStart(8,'0');
  }

  function deterministicLegacyId(prefix,parts){
    return `${prefix}-${stableHash(parts.map(value=>String(value??'').trim().toLowerCase()).join('\u241f'))}`;
  }

  function syncItemKey(item){
    if(item?.id)return `id:${item.id}`;
    return `legacy:${item?.category||'未分类'}:${item?.folderId||''}:${String(item?.title||'').trim().toLowerCase()}`;
  }

  function syncFolderKey(folder){
    if(folder?.id)return `id:${folder.id}`;
    return `legacy:${folder?.category||'未分类'}:${String(folder?.name||'').trim().toLowerCase()}`;
  }

  function normalizeSyncItem(item={}){
    const source={...item};
    if(!source.id)source.id=deterministicLegacyId('legacy-item',[source.category,source.folderId,source.title]);
    return normalizeItem(source);
  }

  function normalizeSyncFolder(folder={}){
    const source={...folder};
    if(!source.id)source.id=deterministicLegacyId('legacy-folder',[source.category,source.name]);
    return normalizeFolder(source);
  }

  function canonicalDatabaseFull(data){
    const incoming=Array.isArray(data)?data:data?.items||[];
    const items=Array.isArray(incoming)?incoming.map(normalizeSyncItem):[];
    const folders=(Array.isArray(data?.folders)?data.folders:[]).map(normalizeSyncFolder);
    const categories=uniqueCategories(Array.isArray(data?.categories)?data.categories:[...items.map(x=>x.category),...folders.map(x=>x.category)]);
    return {
      app:'CFX-Post Formula and Command Library',
      version:7,
      appVersion:SYNC_HARDENING_VERSION,
      defaultCategory:'未分类',
      categories,
      folders,
      items
    };
  }

  function semanticItem(item){
    if(!item)return null;
    const normalized=normalizeSyncItem(item);
    return {
      id:normalized.id,
      title:normalized.title,
      type:normalized.type,
      category:normalized.category,
      folderId:normalized.folderId,
      exportOrder:normalized.exportOrder,
      tags:normalized.tags,
      description:normalized.description,
      exprName:normalized.exprName,
      exprBody:normalized.exprBody,
      cclCode:normalized.cclCode,
      compositeCode:normalized.compositeCode,
      version:normalized.version,
      dependencies:normalized.dependencies,
      notes:normalized.notes,
      favorite:normalized.favorite
    };
  }

  function semanticFolder(folder){
    if(!folder)return null;
    const normalized=normalizeSyncFolder(folder);
    return {id:normalized.id,name:normalized.name,category:normalized.category};
  }

  function semanticDatabase(data){
    const full=canonicalDatabaseFull(data);
    return {
      app:full.app,
      version:full.version,
      defaultCategory:full.defaultCategory,
      categories:[...full.categories].sort((a,b)=>a.localeCompare(b,'zh-CN')),
      folders:full.folders.map(semanticFolder).sort((a,b)=>syncFolderKey(a).localeCompare(syncFolderKey(b))),
      items:full.items.map(semanticItem).sort((a,b)=>syncItemKey(a).localeCompare(syncItemKey(b)))
    };
  }

  function semanticEntity(entity,label){return label==='文件夹'?semanticFolder(entity):semanticItem(entity);}
  function semanticEqual(a,b,label='条目'){return JSON.stringify(semanticEntity(a,label))===JSON.stringify(semanticEntity(b,label));}
  function databaseHash(data){return stableHash(semanticDatabase(data));}

  canonicalDatabase=function(data){return canonicalDatabaseFull(data);};
  databaseEqual=function(a,b){return JSON.stringify(semanticDatabase(a))===JSON.stringify(semanticDatabase(b));};
  makeDatabasePayload=function(){return {app:'CFX-Post Formula and Command Library',version:7,appVersion:SYNC_HARDENING_VERSION,exportedAt:now(),defaultCategory:'未分类',categories:state.categories,folders:state.folders,items:state.items};};
  recomputeGithubDirty=function(){if(!state.github.ready||state.github.suspendDirty)return;state.github.dirty=state.github.basePayload?!databaseEqual(makeDatabasePayload(),state.github.basePayload):false;updateGithubUi();};
  markGithubDirty=function(){if(!state.github.ready||state.github.suspendDirty)return;state.github.dirty=state.github.basePayload?!databaseEqual(makeDatabasePayload(),state.github.basePayload):true;updateGithubUi();if(state.github.dirty)scheduleGithubAutoPush();};

  function timeValue(value){const parsed=new Date(value||0).getTime();return Number.isFinite(parsed)?parsed:0;}
  function latestTimestamp(...values){
    const best=values.filter(Boolean).sort((a,b)=>timeValue(b)-timeValue(a))[0];
    return best||now();
  }
  function earliestTimestamp(...values){
    const valid=values.filter(Boolean).sort((a,b)=>timeValue(a)-timeValue(b));
    return valid[0]||now();
  }
  function mergedUsageCount(base,local,remote){
    const b=Math.max(0,Number(base?.usageCount)||0);
    const l=Math.max(0,Number(local?.usageCount)||0);
    const r=Math.max(0,Number(remote?.usageCount)||0);
    if(!base)return Math.max(l,r);
    return b+Math.max(0,l-b)+Math.max(0,r-b);
  }
  function mergeEntityMetadata(base,local,remote,picked,label){
    if(!picked)return null;
    const result=clone(picked);
    result.createdAt=earliestTimestamp(base?.createdAt,local?.createdAt,remote?.createdAt,picked?.createdAt);
    result.updatedAt=latestTimestamp(base?.updatedAt,local?.updatedAt,remote?.updatedAt,picked?.updatedAt);
    if(label!=='文件夹')result.usageCount=mergedUsageCount(base,local,remote);
    return result;
  }

  function entityMap(list,label){
    const keyFn=label==='文件夹'?syncFolderKey:syncItemKey;
    return new Map((list||[]).map(entity=>[keyFn(entity),entity]));
  }
  function orderedKeys(baseArr,localArr,remoteArr,label){
    const keyFn=label==='文件夹'?syncFolderKey:syncItemKey;
    const seen=new Set(),keys=[];
    [...(localArr||[]),...(remoteArr||[]),...(baseArr||[])].forEach(entity=>{const key=keyFn(entity);if(!seen.has(key)){seen.add(key);keys.push(key);}});
    return keys;
  }

  mergeEntities=function(baseArr,localArr,remoteArr,label){
    const bm=entityMap(baseArr,label),lm=entityMap(localArr,label),rm=entityMap(remoteArr,label);
    const merged=[],conflicts=[];
    orderedKeys(baseArr,localArr,remoteArr,label).forEach(key=>{
      const b=bm.get(key)||null,l=lm.get(key)||null,r=rm.get(key)||null;
      let pick=null;
      if(semanticEqual(l,r,label))pick=l||r;
      else if(semanticEqual(l,b,label))pick=r;
      else if(semanticEqual(r,b,label))pick=l;
      else{
        conflicts.push({id:l?.id||r?.id||b?.id||key,label,name:l?.title||l?.name||r?.title||r?.name||b?.title||b?.name||key});
        return;
      }
      const withMeta=mergeEntityMetadata(b,l,r,pick,label);
      if(withMeta)merged.push(withMeta);
    });
    return {merged,conflicts};
  };

  mergeEntitiesWithoutBase=function(localArr,remoteArr,label){
    const lm=entityMap(localArr,label),rm=entityMap(remoteArr,label),merged=[],conflicts=[];
    orderedKeys([],localArr,remoteArr,label).forEach(key=>{
      const l=lm.get(key)||null,r=rm.get(key)||null;
      if(!l&&r)merged.push(clone(r));
      else if(l&&!r)merged.push(clone(l));
      else if(semanticEqual(l,r,label))merged.push(mergeEntityMetadata(null,l,r,l||r,label));
      else conflicts.push({id:l?.id||r?.id||key,label,name:l?.title||l?.name||r?.title||r?.name||key});
    });
    return {merged,conflicts};
  };

  initialSafeMergeDatabases=function(local,remote){
    const l=canonicalDatabaseFull(local),r=canonicalDatabaseFull(remote);
    const mi=mergeEntitiesWithoutBase(l.items,r.items,'条目'),mf=mergeEntitiesWithoutBase(l.folders,r.folders,'文件夹');
    const conflicts=[...mi.conflicts,...mf.conflicts];
    if(conflicts.length)return {merged:null,conflicts};
    return {merged:{app:l.app,version:7,appVersion:SYNC_HARDENING_VERSION,defaultCategory:'未分类',categories:uniqueCategories([...l.categories,...r.categories]),folders:mf.merged,items:mi.merged},conflicts:[]};
  };

  threeWayMergeDatabases=function(base,local,remote){
    if(!base)return initialSafeMergeDatabases(local,remote);
    const b=canonicalDatabaseFull(base),l=canonicalDatabaseFull(local),r=canonicalDatabaseFull(remote);
    const mi=mergeEntities(b.items,l.items,r.items,'条目'),mf=mergeEntities(b.folders,l.folders,r.folders,'文件夹');
    const conflicts=[...mi.conflicts,...mf.conflicts];
    if(conflicts.length)return {merged:null,conflicts};
    return {merged:{app:l.app,version:7,appVersion:SYNC_HARDENING_VERSION,defaultCategory:'未分类',categories:mergeCategorySets(b.categories,l.categories,r.categories),folders:mf.merged,items:mi.merged},conflicts:[]};
  };

  function threeWayMergePreferLocal(base,local,remote){
    const b=canonicalDatabaseFull(base||{items:[],folders:[],categories:[]}),l=canonicalDatabaseFull(local),r=canonicalDatabaseFull(remote);
    function mergePrefer(baseArr,localArr,remoteArr,label){
      const bm=entityMap(baseArr,label),lm=entityMap(localArr,label),rm=entityMap(remoteArr,label),merged=[];
      orderedKeys(baseArr,localArr,remoteArr,label).forEach(key=>{
        const bEntity=bm.get(key)||null,lEntity=lm.get(key)||null,rEntity=rm.get(key)||null;
        let pick=null;
        if(semanticEqual(lEntity,rEntity,label))pick=lEntity||rEntity;
        else if(semanticEqual(lEntity,bEntity,label))pick=rEntity;
        else if(semanticEqual(rEntity,bEntity,label))pick=lEntity;
        else pick=lEntity;
        const withMeta=mergeEntityMetadata(bEntity,lEntity,rEntity,pick,label);
        if(withMeta)merged.push(withMeta);
      });
      return merged;
    }
    return {
      app:l.app,version:7,appVersion:SYNC_HARDENING_VERSION,defaultCategory:'未分类',
      categories:mergeCategorySets(b.categories,l.categories,r.categories),
      folders:mergePrefer(b.folders,l.folders,r.folders,'文件夹'),
      items:mergePrefer(b.items,l.items,r.items,'条目')
    };
  }

  const originalUpdateGithubUi=updateGithubUi;
  updateGithubUi=function(){
    originalUpdateGithubUi();
    const pending=$('#syncPendingLabel');
    if(pending&&state.github.queueDepth>0&&!state.github.conflict)pending.textContent=`同步队列 ${state.github.queueDepth}`;
  };

  clearGithubConflict=function(){
    state.github.conflict=false;
    state.github.syncPaused=false;
    state.github.pendingRemote=null;
    state.github.pendingRemoteSha='';
    state.github.conflictNames=[];
    updateGithubUi();
    if(state.github.autoSync)setTimeout(configureGithubAutoSync,0);
  };

  setGithubConflict=function(file,data,conflicts=[]){
    state.github.conflict=true;
    state.github.syncPaused=true;
    state.github.connected=true;
    state.github.pendingRemote=data;
    state.github.pendingRemoteSha=file?.sha||'';
    state.github.conflictNames=conflicts.map(x=>x.name||x.id).filter(Boolean);
    clearTimeout(state.github.autoPushTimer);
    clearInterval(state.github.pollTimer);
    state.github.pollTimer=null;
    syncLog('conflict',{sha:file?.sha||'',conflicts:state.github.conflictNames.length,names:state.github.conflictNames.slice(0,8)});
    updateGithubUi();
    toast('检测到 GitHub 同步冲突');
  };

  configureGithubAutoSync=function(){
    clearInterval(state.github.pollTimer);
    state.github.pollTimer=null;
    state.github.autoSync=!!$('#ghAutoSync')?.checked;
    if(!state.github.autoSync||state.github.conflict||state.github.syncPaused){
      if(!state.github.autoSync)state.github.autoStarted=false;
      clearTimeout(state.github.autoPushTimer);
      updateGithubUi();
      return;
    }
    state.github.pollTimer=setInterval(()=>{if(!document.hidden&&!state.github.conflict)checkGithubForUpdates('timer');},GITHUB_CHECK_INTERVAL);
    if(!state.github.autoStarted){state.github.autoStarted=true;setTimeout(()=>checkGithubForUpdates('open'),900);}
    if(state.github.dirty)scheduleGithubAutoPush();
    updateGithubUi();
  };

  scheduleGithubAutoPush=function(){
    clearTimeout(state.github.autoPushTimer);
    if(!state.github.autoSync||!state.github.dirty||state.github.conflict||state.github.syncPaused||!state.github.ready)return;
    const last=state.github.lastPushAt?new Date(state.github.lastPushAt).getTime():0;
    const minWait=Math.max(0,GITHUB_MIN_PUSH_INTERVAL-(Date.now()-last));
    const wait=Math.max(GITHUB_AUTOPUSH_DELAY,minWait);
    state.github.autoPushTimer=setTimeout(()=>autoPushToGithub(),wait);
  };

  function enqueueGithubOperation(key,label,operation){
    if(queuedByKey.has(key))return queuedByKey.get(key);
    let resolvePromise,rejectPromise;
    const promise=new Promise((resolve,reject)=>{resolvePromise=resolve;rejectPromise=reject;});
    queuedByKey.set(key,promise);
    queue.push({key,label,operation,resolve:resolvePromise,reject:rejectPromise});
    state.github.queueDepth=queue.length+(queueRunning?1:0);
    updateGithubUi();
    drainQueue();
    return promise;
  }

  async function withCrossTabLock(task){
    if(navigator.locks?.request)return navigator.locks.request('cfxpost-github-sync-v2',{mode:'exclusive'},task);
    return task();
  }

  async function drainQueue(){
    if(queueRunning)return;
    queueRunning=true;
    while(queue.length){
      const job=queue.shift();
      const started=Date.now();
      syncLog('start',{operation:job.label,queueRemaining:queue.length});
      try{
        const result=await withCrossTabLock(job.operation);
        syncLog('finish',{operation:job.label,durationMs:Date.now()-started,ok:true});
        job.resolve(result);
      }catch(error){
        syncLog('finish',{operation:job.label,durationMs:Date.now()-started,ok:false,error:error?.message||String(error)});
        job.reject(error);
      }finally{
        queuedByKey.delete(job.key);
        state.github.queueDepth=queue.length;
        updateGithubUi();
      }
    }
    queueRunning=false;
    state.github.queueDepth=0;
    updateGithubUi();
  }

  function parseRemoteFile(file){
    if(!file)return null;
    const text=base64ToUtf8(file.content||'');
    const data=JSON.parse(text);
    if(!Array.isArray(data?.items)&&!Array.isArray(data))throw new Error('云端文件不是有效的命令库 JSON');
    return canonicalDatabaseFull(data);
  }

  function isShaMismatch(error){
    const message=String(error?.message||'').toLowerCase();
    return error?.status===409||error?.status===422||message.includes('does not match')||message.includes('sha')&&message.includes('match');
  }

  writeGithubPayload=async function(cfg,remote,message,payloadOverride=null){
    const payloadData=payloadOverride||makeDatabasePayload();
    const payload={
      message:message||$('#ghCommitMessage').value.trim()||'Update CFX-Post command library',
      content:utf8ToBase64(JSON.stringify(payloadData,null,2)),
      branch:cfg.branch
    };
    if(remote?.sha)payload.sha=remote.sha;
    const url=`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}`;
    const res=await fetch(url,{method:'PUT',headers:githubHeaders(cfg.token),body:JSON.stringify(payload)});
    const body=await res.json().catch(()=>({}));
    if(!res.ok){const error=new Error(body.message||`上传失败（HTTP ${res.status}）`);error.status=res.status;error.body=body;throw error;}
    return body;
  };

  async function finalizeSuccessfulSync(payload,sha,{pushed=false}={}){
    applyDatabaseWithoutDirty(payload);
    setGithubBase(payload);
    state.github.connected=true;
    state.github.remoteSha=sha||state.github.remoteSha||'';
    state.github.remoteEtag='';
    state.github.lastSyncAt=now();
    state.github.lastCheckAt=now();
    if(pushed)state.github.lastPushAt=now();
    state.github.dirty=false;
    clearGithubConflict();
    saveGithubConfig();
    updateGithubUi();
  }

  completeGithubPush=async function(body,payloadOverride=null){
    const payload=payloadOverride||makeDatabasePayload();
    await finalizeSuccessfulSync(payload,body.content?.sha||state.github.remoteSha||'',{pushed:true});
  };

  async function mergeLatestForPush(cfg,{preferLocal=false}={}){
    const latestFile=await fetchGithubFile(cfg,true,{conditional:false});
    const local=canonicalDatabaseFull(makeDatabasePayload());
    if(!latestFile)return {file:null,payload:local};
    const remote=parseRemoteFile(latestFile);
    let result;
    if(preferLocal){
      result={merged:threeWayMergePreferLocal(state.github.basePayload,local,remote),conflicts:[]};
    }else if(!state.github.basePayload){
      result=initialSafeMergeDatabases(local,remote);
    }else{
      result=threeWayMergeDatabases(state.github.basePayload,local,remote);
    }
    if(result.conflicts?.length){setGithubConflict(latestFile,remote,result.conflicts);return {file:latestFile,payload:null,conflicts:result.conflicts};}
    return {file:latestFile,payload:canonicalDatabaseFull(result.merged)};
  }

  async function pushLatest(cfg,{message,preferLocal=false,automatic=false}={}){
    let lastError=null;
    for(let attempt=1;attempt<=2;attempt++){
      const prepared=await mergeLatestForPush(cfg,{preferLocal});
      if(!prepared.payload)return {status:'conflict'};
      const payload={...prepared.payload,exportedAt:now(),appVersion:SYNC_HARDENING_VERSION};
      syncLog('push-attempt',{attempt,automatic,remoteSha:prepared.file?.sha||'',hash:databaseHash(payload),items:payload.items.length,folders:payload.folders.length});
      try{
        const body=await writeGithubPayload(cfg,prepared.file,message,payload);
        await completeGithubPush(body,payload);
        return {status:'pushed',body,payload};
      }catch(error){
        lastError=error;
        if(attempt===1&&isShaMismatch(error)){
          syncLog('sha-retry',{reason:error.message});
          continue;
        }
        throw error;
      }
    }
    throw lastError||new Error('GitHub 上传失败');
  }

  async function handleRemoteFileInternal(file,{silent=false}={}){
    const remote=parseRemoteFile(file),current=canonicalDatabaseFull(makeDatabasePayload());
    state.github.lastCheckAt=now();
    state.github.connected=true;
    syncLog('remote-read',{sha:file.sha||'',hash:databaseHash(remote),items:remote.items.length,reason:silent?'background':'manual'});
    if(!state.github.basePayload){
      if(databaseEqual(current,remote)){
        await finalizeSuccessfulSync(remote,file.sha||'');
        return 'same';
      }
      const initial=initialSafeMergeDatabases(current,remote);
      if(initial.conflicts.length){setGithubConflict(file,remote,initial.conflicts);return 'conflict';}
      applyDatabaseWithoutDirty(initial.merged);
      setGithubBase(remote);
      state.github.remoteSha=file.sha||'';
      state.github.dirty=!databaseEqual(initial.merged,remote);
      clearGithubConflict();
      state.github.lastSyncAt=now();
      saveGithubConfig();
      if(state.github.dirty)scheduleGithubAutoPush();
      if(!silent)toast('首次同步已安全合并');
      return 'merged';
    }
    if(!state.github.dirty){
      await finalizeSuccessfulSync(remote,file.sha||'');
      if(!silent)toast('已自动获取云端更新');
      return 'pulled';
    }
    const result=threeWayMergeDatabases(state.github.basePayload,current,remote);
    if(result.conflicts.length){setGithubConflict(file,remote,result.conflicts);return 'conflict';}
    applyDatabaseWithoutDirty(result.merged);
    setGithubBase(remote);
    state.github.remoteSha=file.sha||'';
    state.github.dirty=!databaseEqual(result.merged,remote);
    clearGithubConflict();
    state.github.lastSyncAt=now();
    saveGithubConfig();
    if(state.github.dirty)scheduleGithubAutoPush();
    if(!silent)toast('已安全合并云端更新');
    return 'merged';
  }

  handleRemoteFile=function(file,options={}){return handleRemoteFileInternal(file,options);};

  async function checkInternal(reason='manual'){
    if(state.github.conflict||state.github.syncPaused||!navigator.onLine)return false;
    if(reason==='timer'&&document.hidden)return false;
    let cfg;
    try{cfg=githubSettings();}catch(error){if(reason==='manual')showGithubMessage(error.message,'error');return false;}
    setGithubBusy(true);
    try{
      const file=await fetchGithubFile(cfg,true,{conditional:reason!=='manual'});
      state.github.lastCheckAt=now();
      if(file?.notModified){
        state.github.connected=true;
        if(state.github.dirty&&state.github.autoSync)scheduleGithubAutoPush();
        saveGithubConfig();
        return true;
      }
      if(!file){
        state.github.connected=true;
        state.github.remoteSha='';
        state.github.remoteEtag='';
        if(state.github.dirty&&state.github.autoSync)scheduleGithubAutoPush();
        saveGithubConfig();
        return true;
      }
      if(file.sha===state.github.remoteSha&&state.github.basePayload){
        state.github.connected=true;
        if(file._etag)state.github.remoteEtag=file._etag;
        if(state.github.dirty&&state.github.autoSync)scheduleGithubAutoPush();
        saveGithubConfig();
        return true;
      }
      await handleRemoteFileInternal(file,{silent:reason!=='manual'});
      return !state.github.conflict;
    }catch(error){
      state.github.connected=false;
      if(reason==='manual')showGithubMessage(`检查失败：${error.message}`,'error');else console.warn('GitHub 自动检查失败',error);
      return false;
    }finally{setGithubBusy(false);}
  }

  checkGithubForUpdates=function(reason='manual'){return enqueueGithubOperation('check',`check:${reason}`,()=>checkInternal(reason));};

  async function pushInternal({automatic=false,preferLocal=false,message=''}={}){
    if(state.github.conflict&&!preferLocal)return {status:'conflict'};
    if(automatic&&(!state.github.autoSync||!state.github.dirty||state.github.syncPaused||!navigator.onLine))return {status:'skipped'};
    let cfg;
    try{cfg=githubSettings();}catch(error){if(!automatic)showGithubMessage(error.message,'error');return {status:'invalid'};}
    setGithubBusy(true);
    try{
      const result=await pushLatest(cfg,{message:message||($('#ghCommitMessage').value.trim()),preferLocal,automatic});
      if(result.status==='pushed'){
        if(automatic)toast('GitHub 自动同步完成');
        else{showGithubMessage(`上传完成：${state.items.length} 个条目已保存到 ${cfg.owner}/${cfg.repo}/${cfg.path}。`,'ok');toast('已上传到 GitHub');}
      }
      return result;
    }catch(error){
      state.github.connected=false;
      if(automatic)console.warn('GitHub 自动上传失败',error);else showGithubMessage(`上传失败：${error.message}`,'error');
      throw error;
    }finally{setGithubBusy(false);}
  }

  pushToGithub=function(){hideGithubMessage();return enqueueGithubOperation('push','manual-push',()=>pushInternal({automatic:false})).catch(()=>false);};
  autoPushToGithub=function(){return enqueueGithubOperation('push','auto-push',()=>pushInternal({automatic:true,message:`Auto-sync CFX-Post library ${new Date().toISOString()}`})).catch(()=>false);};

  pullFromGithub=function(){
    hideGithubMessage();
    return enqueueGithubOperation('pull','manual-pull',async()=>{
      let cfg;
      try{cfg=githubSettings();}catch(error){showGithubMessage(error.message,'error');return false;}
      setGithubBusy(true);
      try{
        const file=await fetchGithubFile(cfg,false,{conditional:false});
        const remote=parseRemoteFile(file),mode=$('#ghPullMode').value;
        if(mode==='replace'){
          await finalizeSuccessfulSync(remote,file.sha||'');
        }else{
          const result=state.github.basePayload?threeWayMergeDatabases(state.github.basePayload,makeDatabasePayload(),remote):initialSafeMergeDatabases(makeDatabasePayload(),remote);
          if(result.conflicts.length){setGithubConflict(file,remote,result.conflicts);showGithubMessage('读取到云端更新，但同一条目存在双端业务内容修改。请在冲突区选择处理方式。','error');return false;}
          applyDatabaseWithoutDirty(result.merged);
          setGithubBase(remote);
          state.github.connected=true;
          state.github.remoteSha=file.sha||'';
          state.github.lastSyncAt=now();
          state.github.lastCheckAt=now();
          state.github.dirty=!databaseEqual(result.merged,remote);
          clearGithubConflict();
          saveGithubConfig();
        }
        showGithubMessage(`读取完成：云端 ${remote.items.length} 个条目已处理。${state.github.dirty?' 合并后的本地新增内容将安全上传。':''}`,'ok');
        if(state.github.dirty)scheduleGithubAutoPush();
        toast('已从 GitHub 读取');
        return true;
      }catch(error){state.github.connected=false;showGithubMessage(`读取失败：${error.message}`,'error');return false;}finally{setGithubBusy(false);}
    });
  };

  safeSyncNow=function(){
    hideGithubMessage();
    return enqueueGithubOperation('safe-sync','safe-sync',async()=>{
      const ok=await checkInternal('manual');
      if(!ok||state.github.conflict)return false;
      if(state.github.dirty){
        const result=await pushInternal({automatic:false});
        const done=result?.status==='pushed'&&!state.github.dirty;
        showGithubMessage(done?'安全同步完成，本地与云端一致。':'安全检查完成，但上传未完成，请查看连接状态。',done?'ok':'error');
        return done;
      }
      showGithubMessage('安全同步完成，本地与云端一致。','ok');
      return true;
    });
  };

  usePendingCloud=function(){
    if(!state.github.pendingRemote)return Promise.resolve(false);
    if(!confirm('使用最新云端版本会覆盖当前浏览器中的未同步修改。系统会保留本地备份，是否继续？'))return Promise.resolve(false);
    return enqueueGithubOperation('resolve-cloud','resolve-use-cloud',async()=>{
      let cfg;
      try{cfg=githubSettings();}catch(error){showGithubMessage(error.message,'error');return false;}
      setGithubBusy(true);
      try{
        const latestFile=await fetchGithubFile(cfg,false,{conditional:false});
        const latest=parseRemoteFile(latestFile);
        await finalizeSuccessfulSync(latest,latestFile.sha||'');
        showGithubMessage('已采用 GitHub 最新云端版本。此前本地数据可从浏览器备份中恢复。','ok');
        toast('已采用最新云端版本');
        return true;
      }catch(error){showGithubMessage(`采用云端版本失败：${error.message}`,'error');return false;}finally{setGithubBusy(false);}
    });
  };

  keepLocalAndForcePush=function(){
    if(!state.github.pendingRemote)return Promise.resolve(false);
    if(!confirm('此操作会将本地冲突内容合并到 GitHub 最新云端版本，并保留云端非冲突修改。确定继续？'))return Promise.resolve(false);
    return enqueueGithubOperation('resolve-local','resolve-keep-local',async()=>{
      let cfg;
      try{cfg=githubSettings();}catch(error){showGithubMessage(error.message,'error');return false;}
      setGithubBusy(true);
      try{
        const result=await pushLatest(cfg,{preferLocal:true,message:`Resolve conflict: merge local into latest cloud ${new Date().toISOString()}`});
        if(result.status==='pushed'){
          showGithubMessage('冲突已处理：本地冲突内容已合并到最新云端，云端非冲突修改已保留。','ok');
          toast('冲突已解决');
          return true;
        }
        return false;
      }catch(error){showGithubMessage(`冲突处理失败：${error.message}`,'error');return false;}finally{setGithubBusy(false);}
    });
  };

  const originalTestGithubConnection=testGithubConnection;
  testGithubConnection=function(){return enqueueGithubOperation('test','test-connection',()=>originalTestGithubConnection());};
  const originalDownloadGithubJson=downloadGithubJson;
  downloadGithubJson=function(){return enqueueGithubOperation('download','download-backup',()=>originalDownloadGithubJson());};

  useItem=function(id){
    const item=state.items.find(x=>x.id===id);
    if(!item)return;
    item.usageCount=(Number(item.usageCount)||0)+1;
    save(false);
  };

  function runSelfTests(){
    const tests=[];
    const assert=(name,condition)=>{if(!condition)throw new Error(`同步自检失败：${name}`);tests.push(name);};
    const baseItem=normalizeSyncItem({id:'i1',title:'A',type:'expression',category:'公式',exprName:'A',exprBody:'1',usageCount:0,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'});
    const metadataLocal={...baseItem,usageCount:1,updatedAt:'2026-01-02T00:00:00.000Z'};
    const metadataRemote={...baseItem,usageCount:2,updatedAt:'2026-01-03T00:00:00.000Z'};
    const metadataMerge=mergeEntities([baseItem],[metadataLocal],[metadataRemote],'条目');
    assert('元数据变化不产生冲突',metadataMerge.conflicts.length===0);
    assert('usageCount 增量合并',metadataMerge.merged[0].usageCount===3);
    const localA={...baseItem,title:'A-local'};
    const remoteB=normalizeSyncItem({id:'i2',title:'B-remote',type:'ccl',category:'通用工具'});
    const independent=threeWayMergeDatabases({items:[baseItem],folders:[],categories:['公式']},{items:[localA],folders:[],categories:['公式']},{items:[baseItem,remoteB],folders:[],categories:['公式','通用工具']});
    assert('本地与云端不同条目自动合并',independent.conflicts.length===0&&independent.merged.items.length===2);
    const sameLocal={...baseItem,exprBody:'2'},sameRemote={...baseItem,exprBody:'2',updatedAt:'2026-01-04T00:00:00.000Z'};
    assert('双端相同业务修改不冲突',mergeEntities([baseItem],[sameLocal],[sameRemote],'条目').conflicts.length===0);
    const diffRemote={...baseItem,exprBody:'3'};
    assert('双端不同业务修改才冲突',mergeEntities([baseItem],[sameLocal],[diffRemote],'条目').conflicts.length===1);
    assert('业务比较忽略导出时间',databaseEqual({...canonicalDatabaseFull({items:[baseItem]}),exportedAt:'2026-01-01'}, {...canonicalDatabaseFull({items:[metadataLocal]}),exportedAt:'2026-02-01'}));
    syncLog('self-test',{passed:tests.length,tests});
    return {passed:tests.length,tests};
  }

  window.CfxSyncDiagnostics={
    version:SYNC_HARDENING_VERSION,
    getLog:()=>clone(state.github.syncLog),
    clearLog:()=>{state.github.syncLog=[];},
    runSelfTests
  };

  try{runSelfTests();}catch(error){console.error(error);syncLog('self-test-failed',{error:error.message});}
})();
