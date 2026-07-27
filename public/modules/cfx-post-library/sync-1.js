'use strict';
  function githubConfigFromForm(){
    return {
      owner:$('#ghOwner').value.trim(),repo:$('#ghRepo').value.trim(),branch:$('#ghBranch').value.trim()||'main',path:$('#ghPath').value.trim()||'data/library.json',
      lastSyncAt:state.github.lastSyncAt||'',lastPushAt:state.github.lastPushAt||'',lastCheckAt:state.github.lastCheckAt||'',remoteSha:state.github.remoteSha||'',autoSync:!!$('#ghAutoSync')?.checked
    };
  }
  function loadGithubConfig(){
    let cfg={owner:'ttmmss278-png',repo:'cfx-post-private-data',branch:'main',path:'data/library.json',lastSyncAt:'',lastPushAt:'',lastCheckAt:'',remoteSha:'',autoSync:false};
    try{cfg={...cfg,...JSON.parse(localStorage.getItem(GITHUB_CONFIG_KEY)||'{}')};}catch(e){}
    state.github.lastSyncAt=cfg.lastSyncAt||state.github.lastSyncAt||'';state.github.lastPushAt=cfg.lastPushAt||state.github.lastPushAt||'';state.github.lastCheckAt=cfg.lastCheckAt||state.github.lastCheckAt||'';state.github.remoteSha=cfg.remoteSha||state.github.remoteSha||'';state.github.autoSync=!!cfg.autoSync;
    $('#ghOwner').value=cfg.owner||'';$('#ghRepo').value=cfg.repo||'';$('#ghBranch').value=cfg.branch||'main';$('#ghPath').value=cfg.path||'data/library.json';$('#ghAutoSync').checked=state.github.autoSync;
    const remembered=localStorage.getItem(GITHUB_TOKEN_KEY)||'';const session=sessionStorage.getItem(GITHUB_SESSION_TOKEN_KEY)||'';
    $('#ghToken').value=session||remembered;$('#rememberToken').checked=!!remembered;
    if(!state.github.ready){try{state.github.basePayload=JSON.parse(localStorage.getItem(GITHUB_BASE_KEY)||'null');}catch(e){state.github.basePayload=null;}state.github.ready=true;recomputeGithubDirty();}
    configureGithubAutoSync();updateGithubUi();
  }
  function saveGithubConfig(){
    const cfg=githubConfigFromForm();state.github.autoSync=!!cfg.autoSync;localStorage.setItem(GITHUB_CONFIG_KEY,JSON.stringify(cfg));
    const token=$('#ghToken').value.trim();sessionStorage.setItem(GITHUB_SESSION_TOKEN_KEY,token);
    if($('#rememberToken').checked)localStorage.setItem(GITHUB_TOKEN_KEY,token);else localStorage.removeItem(GITHUB_TOKEN_KEY);
    configureGithubAutoSync();
  }
  function githubSettings(){
    const cfg=githubConfigFromForm();const token=$('#ghToken').value.trim();
    if(!cfg.owner||!cfg.repo)throw new Error('请填写 GitHub 用户名和数据仓库名称。');
    if(!token)throw new Error('请填写 GitHub Token。');
    if(!/^[A-Za-z0-9_.-]+$/.test(cfg.owner)||!/^[A-Za-z0-9_.-]+$/.test(cfg.repo))throw new Error('用户名或仓库名称格式不正确。');
    if(!cfg.path||cfg.path.startsWith('/')||cfg.path.includes('..'))throw new Error('JSON 文件路径应为仓库内相对路径。');
    saveGithubConfig();return {...cfg,token};
  }
  function githubHeaders(token){return {'Accept':'application/vnd.github+json','Authorization':`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};}
  function utf8ToBase64(text){const bytes=new TextEncoder().encode(text);let binary='';const step=0x8000;for(let i=0;i<bytes.length;i+=step)binary+=String.fromCharCode(...bytes.subarray(i,i+step));return btoa(binary);}
  function base64ToUtf8(text){const binary=atob(String(text).replace(/\s/g,''));const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes);}
  function githubApiUrl(cfg){return `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(cfg.branch)}`;}
  function githubRepoUrl(cfg){return `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;}
  function setGithubBusy(busy,message=''){
    state.github.busy=busy;['#ghTestBtn','#ghDownloadBtn','#ghPullBtn','#ghSafeSyncBtn','#ghPushBtn','#ghUseCloudBtn','#ghKeepLocalBtn'].forEach(id=>{const el=$(id);if(el)el.disabled=busy;});
    if(message)showGithubMessage(message,busy?'ok':'ok');updateGithubUi();
  }
  function showGithubMessage(message,type='ok'){
    const box=$('#githubMessage');box.textContent=message;box.className=`warnbox ${type==='ok'?'okbox':type==='error'?'errorbox':''}`;
  }
  function hideGithubMessage(){$('#githubMessage').classList.add('hidden');}
  function formatSyncTime(iso){if(!iso)return'从未同步';try{return new Date(iso).toLocaleString('zh-CN',{hour12:false});}catch(e){return iso;}}
  function updateGithubUi(){
    const side=$('#sidebarSyncStatus'),text=$('#sidebarSyncText');side.classList.remove('ok','busy','error','pending','conflict');
    if(state.github.busy){side.classList.add('busy');text.textContent='GitHub 同步中…';}
    else if(state.github.conflict){side.classList.add('conflict');text.textContent='GitHub 冲突待处理';}
    else if(!navigator.onLine){side.classList.add('pending');text.textContent=state.github.dirty?'离线 · 修改已保存本机':'当前离线';}
    else if(state.github.dirty){side.classList.add('pending');text.textContent=state.github.autoSync?'待自动上传':'有本地修改待上传';}
    else if(state.github.connected){side.classList.add('ok');text.textContent=`已同步 · ${formatSyncTime(state.github.lastSyncAt)}`;}
    else{text.textContent=state.github.lastSyncAt?`上次同步 · ${formatSyncTime(state.github.lastSyncAt)}`:'GitHub 未连接';}
    const conn=$('#syncConnectionLabel'),remote=$('#syncRemoteLabel'),pending=$('#syncPendingLabel'),time=$('#syncTimeLabel');
    if(conn)conn.textContent=state.github.busy?'处理中':state.github.conflict?'存在冲突':state.github.connected?'已连接':'未连接';
    if(remote)remote.textContent=state.github.remoteSha?state.github.remoteSha.slice(0,8):'未读取';
    if(pending)pending.textContent=state.github.conflict?'冲突待处理':state.github.dirty?'待上传':'无待处理';
    if(time)time.textContent=formatSyncTime(state.github.lastSyncAt);
    const box=$('#githubConflictBox');if(box){box.classList.toggle('hidden',!state.github.conflict);if(state.github.conflict){const names=state.github.conflictNames?.length?`冲突条目：${state.github.conflictNames.slice(0,8).join('、')}${state.github.conflictNames.length>8?' 等':''}`:'本地与云端都发生了变化，且缺少可安全自动合并的共同版本。';$('#githubConflictText').textContent=names;}}
  }
  function makeDatabasePayload(){return {app:'CFX-Post Formula and Command Library',version:6,appVersion:APP_VERSION,exportedAt:now(),categories:state.categories,folders:state.folders,items:state.items};}
  function canonicalDatabase(data){
    const incoming=Array.isArray(data)?data:data?.items||[];
    const items=Array.isArray(incoming)?incoming.map(normalizeItem).sort((a,b)=>a.id.localeCompare(b.id)):[];
    const folders=(Array.isArray(data?.folders)?data.folders:[]).map(normalizeFolder).sort((a,b)=>a.id.localeCompare(b.id));
    const categories=uniqueCategories(Array.isArray(data?.categories)?data.categories:[...items.map(x=>x.category),...folders.map(x=>x.category)]).sort((a,b)=>a.localeCompare(b,'zh-CN'));
    return {app:'CFX-Post Formula and Command Library',version:6,categories,folders,items};
  }
  function databaseEqual(a,b){return JSON.stringify(canonicalDatabase(a))===JSON.stringify(canonicalDatabase(b));}
  function setGithubBase(payload){state.github.basePayload=canonicalDatabase(payload);localStorage.setItem(GITHUB_BASE_KEY,JSON.stringify(state.github.basePayload));}
  function recomputeGithubDirty(){if(!state.github.ready||state.github.suspendDirty)return;state.github.dirty=state.github.basePayload?!databaseEqual(makeDatabasePayload(),state.github.basePayload):false;updateGithubUi();}
  function markGithubDirty(){if(!state.github.ready||state.github.suspendDirty)return;state.github.dirty=state.github.basePayload?!databaseEqual(makeDatabasePayload(),state.github.basePayload):true;updateGithubUi();if(state.github.dirty)scheduleGithubAutoPush();}
  function entityEqual(a,b){return JSON.stringify(a??null)===JSON.stringify(b??null);}
  function mergeEntities(baseArr,localArr,remoteArr,label){
    const bm=new Map((baseArr||[]).map(x=>[x.id,x])),lm=new Map((localArr||[]).map(x=>[x.id,x])),rm=new Map((remoteArr||[]).map(x=>[x.id,x]));
    const ids=new Set([...bm.keys(),...lm.keys(),...rm.keys()]),merged=[],conflicts=[];
    ids.forEach(id=>{const b=bm.get(id)||null,l=lm.get(id)||null,r=rm.get(id)||null;let pick=null;
      if(entityEqual(l,r))pick=l;else if(entityEqual(l,b))pick=r;else if(entityEqual(r,b))pick=l;else{conflicts.push({id,label,name:l?.title||l?.name||r?.title||r?.name||id});return;}
      if(pick)merged.push(clone(pick));
    });
    return {merged,conflicts};
  }
  function mergeCategorySets(baseCats,localCats,remoteCats){
    const b=new Set(baseCats||[]),l=new Set(localCats||[]),r=new Set(remoteCats||[]),all=new Set([...b,...l,...r]),out=[];
    all.forEach(cat=>{const bv=b.has(cat),lv=l.has(cat),rv=r.has(cat);const keep=lv===rv?lv:lv===bv?rv:lv;if(keep)out.push(cat);});return uniqueCategories(out);
  }
  function mergeEntitiesWithoutBase(localArr,remoteArr,label){
    const lm=new Map((localArr||[]).map(x=>[x.id,x])),rm=new Map((remoteArr||[]).map(x=>[x.id,x])),ids=new Set([...lm.keys(),...rm.keys()]),merged=[],conflicts=[];
    ids.forEach(id=>{const l=lm.get(id)||null,r=rm.get(id)||null;if(!l&&r)merged.push(clone(r));else if(l&&!r)merged.push(clone(l));else if(entityEqual(l,r))merged.push(clone(l));else conflicts.push({id,label,name:l?.title||l?.name||r?.title||r?.name||id});});
    return {merged,conflicts};
  }
  function initialSafeMergeDatabases(local,remote){
    const l=canonicalDatabase(local),r=canonicalDatabase(remote),mi=mergeEntitiesWithoutBase(l.items,r.items,'条目'),mf=mergeEntitiesWithoutBase(l.folders,r.folders,'文件夹'),conflicts=[...mi.conflicts,...mf.conflicts];
    if(conflicts.length)return {merged:null,conflicts};
    return {merged:{app:'CFX-Post Formula and Command Library',version:6,categories:uniqueCategories([...l.categories,...r.categories]),folders:mf.merged,items:mi.merged},conflicts:[]};
  }
  function threeWayMergeDatabases(base,local,remote){
    if(!base)return initialSafeMergeDatabases(local,remote);
    const b=canonicalDatabase(base),l=canonicalDatabase(local),r=canonicalDatabase(remote),mi=mergeEntities(b.items,l.items,r.items,'条目'),mf=mergeEntities(b.folders,l.folders,r.folders,'文件夹');
    const conflicts=[...mi.conflicts,...mf.conflicts];if(conflicts.length)return {merged:null,conflicts};
    return {merged:{app:'CFX-Post Formula and Command Library',version:6,categories:mergeCategorySets(b.categories,l.categories,r.categories),folders:mf.merged,items:mi.merged},conflicts:[]};
  }
