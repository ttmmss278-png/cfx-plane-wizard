'use strict';
  function supportsLinkedFileStorage(){return typeof window.showSaveFilePicker==='function'&&typeof window.showOpenFilePicker==='function'&&'indexedDB' in window;}
  function openFileHandleDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(FILE_HANDLE_DB,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(FILE_HANDLE_STORE))db.createObjectStore(FILE_HANDLE_STORE);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function idbGetFileHandle(){if(!('indexedDB' in window))return null;const db=await openFileHandleDb();return new Promise((resolve,reject)=>{const tx=db.transaction(FILE_HANDLE_STORE,'readonly');const req=tx.objectStore(FILE_HANDLE_STORE).get(FILE_HANDLE_KEY);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();});}
  async function idbSetFileHandle(handle){const db=await openFileHandleDb();return new Promise((resolve,reject)=>{const tx=db.transaction(FILE_HANDLE_STORE,'readwrite');tx.objectStore(FILE_HANDLE_STORE).put(handle,FILE_HANDLE_KEY);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
  async function idbDeleteFileHandle(){if(!('indexedDB' in window))return;const db=await openFileHandleDb();return new Promise((resolve,reject)=>{const tx=db.transaction(FILE_HANDLE_STORE,'readwrite');tx.objectStore(FILE_HANDLE_STORE).delete(FILE_HANDLE_KEY);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
  async function fileHandlePermission(handle,request=false){if(!handle)return false;const opts={mode:'readwrite'};if((await handle.queryPermission(opts))==='granted')return true;if(request&&(await handle.requestPermission(opts))==='granted')return true;return false;}
  function showFileStorageMessage(message,type='ok'){const box=$('#fileStorageMessage');if(!box)return;box.textContent=message;box.className=`warnbox ${type==='ok'?'okbox':type==='error'?'errorbox':''}`;}
  function hideFileStorageMessage(){const box=$('#fileStorageMessage');if(box)box.classList.add('hidden');}
  function updateFileStorageUi(){
    const fs=state.fileStorage;const linked=!!fs.handle;const label=$('#fileConnectionLabel'),time=$('#fileSaveTimeLabel'),desc=$('#linkedFileDescription'),side=$('#sidebarFileStatus'),sideText=$('#sidebarFileText'),hint=$('#fileStorageSupportHint');
    if(label)label.textContent=fs.busy?'处理中':linked?(fs.name||'已连接'):'未连接';
    if(time)time.textContent=formatSyncTime(fs.lastSavedAt);
    if(desc)desc.textContent=linked?`当前文件：${fs.name||'已选择的数据文件'}。文件句柄会尝试保存在当前浏览器中，重新打开网页时可能需要再次授权。`:'尚未连接。连接后可以立即写入、从文件读取，也可以在修改条目后自动保存。';
    if(side){side.classList.remove('ok','busy','error');if(fs.busy)side.classList.add('busy');else if(linked)side.classList.add('ok');}
    if(sideText)sideText.textContent=fs.busy?'数据文件处理中…':linked?`数据文件 · ${fs.name||'已连接'}`:'未连接数据文件';
    if(hint)hint.textContent=supportsLinkedFileStorage()?'当前浏览器支持直接选择和写入本地文件。':'当前浏览器不支持直接写入指定文件，请使用 JSON 下载与导入。';
    ['#readDataFileBtn','#writeDataFileBtn','#disconnectDataFileBtn'].forEach(id=>{const el=$(id);if(el)el.disabled=!linked||fs.busy;});
    ['#createDataFileBtn','#openDataFileBtn'].forEach(id=>{const el=$(id);if(el)el.disabled=!supportsLinkedFileStorage()||fs.busy;});
    const auto=$('#fileAutoSave');if(auto)auto.checked=fs.autoSave;
  }
  function setFileStorageBusy(busy){state.fileStorage.busy=busy;updateFileStorageUi();}
  async function initLinkedFileStorage(){
    state.fileStorage.autoSave=localStorage.getItem(FILE_AUTOSAVE_KEY)!=='false';
    if(!supportsLinkedFileStorage()){updateFileStorageUi();return;}
    try{const handle=await idbGetFileHandle();if(handle){state.fileStorage.handle=handle;state.fileStorage.name=handle.name||'';state.fileStorage.permission=await handle.queryPermission({mode:'readwrite'});}}catch(e){console.warn('恢复数据文件句柄失败',e);}
    updateFileStorageUi();
  }
  async function createLinkedDataFile(){
    hideFileStorageMessage();if(!supportsLinkedFileStorage()){showFileStorageMessage('当前浏览器不支持直接选择保存位置，请改用“下载完整 JSON”。','error');return;}
    try{const handle=await window.showSaveFilePicker({suggestedName:'CFX_Post_Library_Data.json',types:[{description:'CFX-Post 命令库 JSON',accept:{'application/json':['.json']}}]});state.fileStorage.handle=handle;state.fileStorage.name=handle.name||'CFX_Post_Library_Data.json';await idbSetFileHandle(handle);updateFileStorageUi();await writeLinkedDataFile(false);showFileStorageMessage(`已连接并写入：${state.fileStorage.name}`,'ok');}catch(e){if(e.name!=='AbortError')showFileStorageMessage(`选择保存位置失败：${e.message}`,'error');}
  }
  async function openExistingDataFile(){
    hideFileStorageMessage();if(!supportsLinkedFileStorage()){showFileStorageMessage('当前浏览器不支持连接已有文件，请使用下方导入控件。','error');return;}
    try{const [handle]=await window.showOpenFilePicker({multiple:false,types:[{description:'CFX-Post 命令库 JSON',accept:{'application/json':['.json']}}]});state.fileStorage.handle=handle;state.fileStorage.name=handle.name||'';await idbSetFileHandle(handle);updateFileStorageUi();showFileStorageMessage(`已连接：${state.fileStorage.name}。可选择“从文件读取”或“立即写入文件”。`,'ok');}catch(e){if(e.name!=='AbortError')showFileStorageMessage(`连接文件失败：${e.message}`,'error');}
  }
  async function writeLinkedDataFile(silent=false){
    const fs=state.fileStorage;if(!fs.handle){if(!silent)showFileStorageMessage('请先选择一个数据文件。','error');return false;}
    setFileStorageBusy(true);try{if(!await fileHandlePermission(fs.handle,true))throw new Error('未获得文件写入权限');const writable=await fs.handle.createWritable();await writable.write(JSON.stringify(makeDatabasePayload(),null,2));await writable.close();fs.lastSavedAt=now();fs.permission='granted';updateFileStorageUi();if(!silent){showFileStorageMessage(`已写入 ${fs.name||'数据文件'}：${state.items.length} 个条目。`,'ok');toast('数据文件已保存');}return true;}catch(e){if(!silent)showFileStorageMessage(`写入失败：${e.message}`,'error');else console.warn('自动写入数据文件失败',e);return false;}finally{setFileStorageBusy(false);}
  }
  function scheduleLinkedFileWrite(){clearTimeout(scheduleLinkedFileWrite.timer);scheduleLinkedFileWrite.timer=setTimeout(()=>writeLinkedDataFile(true),700);}
  async function readLinkedDataFile(){
    const fs=state.fileStorage;hideFileStorageMessage();if(!fs.handle){showFileStorageMessage('请先连接一个已有 JSON 文件。','error');return;}
    setFileStorageBusy(true);try{const file=await fs.handle.getFile();const data=JSON.parse(await file.text());fs.suspendAutosave=true;const count=applyIncomingDatabase(data,$('#fileReadMode').value,'本地数据文件');showFileStorageMessage(`读取完成：已处理 ${count} 个条目。`,'ok');toast('已从数据文件读取');}catch(e){showFileStorageMessage(`读取失败：${e.message}`,'error');}finally{fs.suspendAutosave=false;setFileStorageBusy(false);}
  }
  async function disconnectLinkedDataFile(){if(!state.fileStorage.handle)return;if(!confirm('断开当前数据文件？浏览器中的公式不会被删除。'))return;await idbDeleteFileHandle().catch(()=>{});state.fileStorage.handle=null;state.fileStorage.name='';state.fileStorage.lastSavedAt='';state.fileStorage.permission='unknown';updateFileStorageUi();showFileStorageMessage('已断开数据文件。浏览器本地数据库仍然保留。','ok');}
