'use strict';
  function clearGithubConflict(){state.github.conflict=false;state.github.pendingRemote=null;state.github.pendingRemoteSha='';state.github.conflictNames=[];updateGithubUi();}
  function setGithubConflict(file,data,conflicts=[]){state.github.conflict=true;state.github.connected=true;state.github.pendingRemote=data;state.github.pendingRemoteSha=file?.sha||'';state.github.conflictNames=conflicts.map(x=>x.name||x.id).filter(Boolean);clearTimeout(state.github.autoPushTimer);updateGithubUi();toast('检测到 GitHub 同步冲突');}
  function scheduleGithubAutoPush(){
    clearTimeout(state.github.autoPushTimer);if(!state.github.autoSync||!state.github.dirty||state.github.conflict||!state.github.ready)return;
    const last=state.github.lastPushAt?new Date(state.github.lastPushAt).getTime():0;const minWait=Math.max(0,GITHUB_MIN_PUSH_INTERVAL-(Date.now()-last));const wait=Math.max(GITHUB_AUTOPUSH_DELAY,minWait);
    state.github.autoPushTimer=setTimeout(()=>autoPushToGithub(),wait);
  }
  function configureGithubAutoSync(){
    clearInterval(state.github.pollTimer);state.github.pollTimer=null;state.github.autoSync=!!$('#ghAutoSync')?.checked;
    if(!state.github.autoSync){state.github.autoStarted=false;clearTimeout(state.github.autoPushTimer);updateGithubUi();return;}
    state.github.pollTimer=setInterval(()=>{if(!document.hidden)checkGithubForUpdates('timer');},GITHUB_CHECK_INTERVAL);
    if(!state.github.autoStarted){state.github.autoStarted=true;setTimeout(()=>checkGithubForUpdates('open'),900);}
    if(state.github.dirty)scheduleGithubAutoPush();updateGithubUi();
  }
  function applyDatabaseWithoutDirty(data,source='GitHub 云端数据库'){
    state.github.suspendDirty=true;try{return applyIncomingDatabase(data,'replace',source,{markDirty:false});}finally{state.github.suspendDirty=false;}
  }
  function applyIncomingDatabase(data,mode,source='外部数据库',options={}){
    const incoming=Array.isArray(data)?data:data?.items;if(!Array.isArray(incoming))throw new Error(`${source}不是有效的命令库 JSON。`);
    const incomingCats=Array.isArray(data?.categories)?uniqueCategories(data.categories):uniqueCategories(incoming.map(x=>x.category));const incomingFolders=Array.isArray(data?.folders)?data.folders.map(normalizeFolder):[];
    if(options.backup!==false)localStorage.setItem(STORAGE_KEY+'_before_external_import',JSON.stringify({items:state.items,categories:state.categories,folders:state.folders,savedAt:now(),source}));
    if(mode==='replace'){state.items=incoming.map(normalizeItem);state.categories=uniqueCategories(incomingCats);state.folders=incomingFolders;}
    else{const map=new Map(state.items.map(x=>[x.id,x]));incoming.map(normalizeItem).forEach(x=>map.set(x.id,x));state.items=[...map.values()];const folderMap=new Map(state.folders.map(x=>[x.id,x]));incomingFolders.forEach(x=>folderMap.set(x.id,x));state.folders=[...folderMap.values()];state.categories=uniqueCategories([...state.categories,...incomingCats]);}
    const validFolderIds=new Set(state.folders.map(f=>f.id));state.items.forEach(x=>{if(x.folderId&&!validFolderIds.has(x.folderId))x.folderId='';});state.categories=uniqueCategories([...state.categories,...state.items.map(x=>x.category),...state.folders.map(x=>x.category)]);save(options.markDirty!==false);renderAll();return incoming.length;
  }
  async function fetchGithubFile(cfg,allowMissing=false){
    const res=await fetch(githubApiUrl(cfg),{headers:githubHeaders(cfg.token)});
    if(res.status===404&&allowMissing)return null;
    const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.message||`GitHub 请求失败（HTTP ${res.status}）`);return body;
  }
  async function testGithubConnection(){
    hideGithubMessage();let cfg;try{cfg=githubSettings();}catch(e){showGithubMessage(e.message,'error');return;}
    setGithubBusy(true);try{
      const res=await fetch(githubRepoUrl(cfg),{headers:githubHeaders(cfg.token)});const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.message||`无法访问仓库（HTTP ${res.status}）`);
      const file=await fetchGithubFile(cfg,true);state.github.connected=true;state.github.remoteSha=file?.sha||state.github.remoteSha||'';state.github.lastCheckAt=now();showGithubMessage(file?`连接成功。已找到 ${cfg.path}。`:`连接成功。仓库中尚无 ${cfg.path}，首次上传时会创建。`,'ok');saveGithubConfig();
    }catch(e){state.github.connected=false;showGithubMessage(`连接失败：${e.message}`,'error');}finally{setGithubBusy(false);}
  }
  async function handleRemoteFile(file,{silent=false}={}){
    const remote=JSON.parse(base64ToUtf8(file.content));const current=makeDatabasePayload();state.github.lastCheckAt=now();state.github.connected=true;
    if(!state.github.basePayload){
      if(databaseEqual(current,remote)){applyDatabaseWithoutDirty(remote);setGithubBase(remote);state.github.remoteSha=file.sha||'';state.github.dirty=false;clearGithubConflict();state.github.lastSyncAt=now();saveGithubConfig();return 'same';}
      const initial=initialSafeMergeDatabases(current,remote);if(initial.conflicts.length){setGithubConflict(file,remote,initial.conflicts);return 'conflict';}
      applyDatabaseWithoutDirty(initial.merged);setGithubBase(remote);state.github.remoteSha=file.sha||'';state.github.dirty=!databaseEqual(initial.merged,remote);clearGithubConflict();state.github.lastSyncAt=now();saveGithubConfig();if(state.github.dirty)scheduleGithubAutoPush();if(!silent)toast('首次同步已安全合并');return 'merged';
    }
    if(!state.github.dirty){applyDatabaseWithoutDirty(remote);setGithubBase(remote);state.github.remoteSha=file.sha||'';state.github.dirty=false;clearGithubConflict();state.github.lastSyncAt=now();saveGithubConfig();if(!silent)toast('已自动获取云端更新');return 'pulled';}
    const result=threeWayMergeDatabases(state.github.basePayload,current,remote);
    if(result.conflicts.length){setGithubConflict(file,remote,result.conflicts);return 'conflict';}
    applyDatabaseWithoutDirty(result.merged);setGithubBase(remote);state.github.remoteSha=file.sha||'';state.github.dirty=!databaseEqual(result.merged,remote);clearGithubConflict();state.github.lastSyncAt=now();saveGithubConfig();if(state.github.dirty)scheduleGithubAutoPush();if(!silent)toast('已安全合并云端更新');return 'merged';
  }
  async function checkGithubForUpdates(reason='manual'){
    if(state.github.busy||state.github.conflict||!navigator.onLine)return false;if(reason==='timer'&&document.hidden)return false;
    let cfg;try{cfg=githubSettings();}catch(e){if(reason==='manual')showGithubMessage(e.message,'error');return false;}
    setGithubBusy(true);try{
      const file=await fetchGithubFile(cfg,true);state.github.lastCheckAt=now();
      if(!file){state.github.connected=true;if(state.github.dirty&&state.github.autoSync)scheduleGithubAutoPush();saveGithubConfig();return true;}
      if(file.sha===state.github.remoteSha&&state.github.basePayload){state.github.connected=true;if(state.github.dirty&&state.github.autoSync)scheduleGithubAutoPush();saveGithubConfig();return true;}
      await handleRemoteFile(file,{silent:reason!=='manual'});return !state.github.conflict;
    }catch(e){state.github.connected=false;if(reason==='manual')showGithubMessage(`检查失败：${e.message}`,'error');else console.warn('GitHub 自动检查失败',e);return false;}finally{setGithubBusy(false);}
  }
  async function pullFromGithub(){
    hideGithubMessage();let cfg;try{cfg=githubSettings();}catch(e){showGithubMessage(e.message,'error');return;}
    setGithubBusy(true);try{
      const file=await fetchGithubFile(cfg,false);const remote=JSON.parse(base64ToUtf8(file.content));const mode=$('#ghPullMode').value;
      if(mode==='replace'){applyDatabaseWithoutDirty(remote);setGithubBase(remote);state.github.dirty=false;clearGithubConflict();}
      else if(state.github.basePayload){const result=threeWayMergeDatabases(state.github.basePayload,makeDatabasePayload(),remote);if(result.conflicts.length){setGithubConflict(file,remote,result.conflicts);showGithubMessage('读取到云端更新，但同一条目存在双端修改。请在冲突区选择处理方式。','error');return;}applyDatabaseWithoutDirty(result.merged);setGithubBase(remote);state.github.dirty=!databaseEqual(result.merged,remote);clearGithubConflict();}
      else{const initial=initialSafeMergeDatabases(makeDatabasePayload(),remote);if(initial.conflicts.length){setGithubConflict(file,remote,initial.conflicts);showGithubMessage('首次读取发现同一条目在本地与云端内容不同。请在冲突区选择处理方式。','error');return;}applyDatabaseWithoutDirty(initial.merged);setGithubBase(remote);state.github.dirty=!databaseEqual(initial.merged,remote);clearGithubConflict();}
      state.github.connected=true;state.github.remoteSha=file.sha||'';state.github.lastSyncAt=now();state.github.lastCheckAt=now();saveGithubConfig();showGithubMessage(`读取完成：云端 ${canonicalDatabase(remote).items.length} 个条目已处理。本地读取前备份已保留。${state.github.dirty?' 合并后存在本地新增内容，将在安全检查后上传。':''}`,'ok');if(state.github.dirty)scheduleGithubAutoPush();toast('已从 GitHub 读取');
    }catch(e){state.github.connected=false;showGithubMessage(`读取失败：${e.message}`,'error');}finally{setGithubBusy(false);}
  }
  async function downloadGithubJson(){
    hideGithubMessage();let cfg;try{cfg=githubSettings();}catch(e){showGithubMessage(e.message,'error');return;}
    setGithubBusy(true);try{const file=await fetchGithubFile(cfg,false);const text=base64ToUtf8(file.content);const data=JSON.parse(text);if(!Array.isArray(data?.items)&&!Array.isArray(data))throw new Error('云端文件不是有效的命令库 JSON');download(`CFX_Post_GitHub_Backup_${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(data,null,2),'application/json;charset=utf-8');state.github.connected=true;state.github.remoteSha=file.sha||'';state.github.lastCheckAt=now();saveGithubConfig();showGithubMessage('云端 JSON 已下载，不会修改当前浏览器数据库。','ok');toast('云端 JSON 已下载');}catch(e){state.github.connected=false;showGithubMessage(`下载失败：${e.message}`,'error');}finally{setGithubBusy(false);}
  }
