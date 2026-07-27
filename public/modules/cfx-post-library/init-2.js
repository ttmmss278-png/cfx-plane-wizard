'use strict';
  $('#githubSyncBtn').addEventListener('click',()=>{loadGithubConfig();hideGithubMessage();openModal('githubModal');});
  $('#ghTestBtn').addEventListener('click',testGithubConnection);$('#ghDownloadBtn').addEventListener('click',downloadGithubJson);$('#ghPullBtn').addEventListener('click',pullFromGithub);$('#ghSafeSyncBtn').addEventListener('click',safeSyncNow);$('#ghPushBtn').addEventListener('click',pushToGithub);$('#ghUseCloudBtn').addEventListener('click',usePendingCloud);$('#ghKeepLocalBtn').addEventListener('click',keepLocalAndForcePush);
  $('#toggleTokenBtn').addEventListener('click',()=>{const input=$('#ghToken');const show=input.type==='password';input.type=show?'text':'password';$('#toggleTokenBtn').textContent=show?'隐藏':'显示';});
  ['#ghOwner','#ghRepo','#ghBranch','#ghPath','#ghToken','#rememberToken','#ghAutoSync'].forEach(id=>$(id).addEventListener('change',()=>{saveGithubConfig();if(id==='#ghAutoSync'&&$('#ghAutoSync').checked)checkGithubForUpdates('manual');}));
  $('#exportJsonBtn').addEventListener('click',()=>download(`CFX_Post_Library_Backup_${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(makeDatabasePayload(),null,2),'application/json;charset=utf-8'));
  $('#exportAllCclBtn').addEventListener('click',()=>download(`CFX_Post_All_Commands_${new Date().toISOString().slice(0,10)}.cse`,packageItems(state.items)));
  $('#restoreExamplesBtn').addEventListener('click',()=>{const ids=new Set(state.items.map(x=>x.id));let n=0;examples.forEach(x=>{if(!ids.has(x.id)){state.items.push(clone(x));ensureCategory(x.category);n++;}});save();renderAll();toast(n?`已恢复 ${n} 个示例`:'示例已存在');});
  $('#importFile').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());const count=applyIncomingDatabase(data,$('#importMode').value,`导入文件 ${file.name}`);renderAll();toast(`已导入 ${count} 项`);showFileStorageMessage(`已从 ${file.name} 导入 ${count} 个条目。`,'ok');}catch(err){alert('导入失败：'+err.message);}finally{e.target.value='';}});
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();els.search.focus();els.search.select();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='n'){e.preventDefault();fillEditor(blankItem(),true);}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&els.workspace.classList.contains('with-detail')){e.preventDefault();saveEditor();}
    if(e.key==='Escape'){$$('.modal-wrap.show').forEach(x=>x.classList.remove('show'));if(els.workspace.classList.contains('with-detail'))closeEditor();}
  });

  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.github.autoSync)checkGithubForUpdates('visible');});
  window.addEventListener('focus',()=>{if(state.github.autoSync&&!document.hidden)checkGithubForUpdates('focus');});
  window.addEventListener('online',()=>{updateGithubUi();if(state.github.autoSync)checkGithubForUpdates('online');});
  window.addEventListener('offline',updateGithubUi);

  load();loadGithubConfig();renderAll();initLinkedFileStorage();
