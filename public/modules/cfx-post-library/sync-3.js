'use strict';
  async function writeGithubPayload(cfg,remote,message){
    const payload={message:message||$('#ghCommitMessage').value.trim()||'Update CFX-Post command library',content:utf8ToBase64(JSON.stringify(makeDatabasePayload(),null,2)),branch:cfg.branch};if(remote?.sha)payload.sha=remote.sha;
    const url=`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}`;
    const res=await fetch(url,{method:'PUT',headers:githubHeaders(cfg.token),body:JSON.stringify(payload)});const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.message||`上传失败（HTTP ${res.status}）`);return body;
  }
  async function completeGithubPush(body){
    state.github.connected=true;state.github.remoteSha=body.content?.sha||state.github.remoteSha||'';state.github.lastSyncAt=now();state.github.lastPushAt=now();state.github.lastCheckAt=now();setGithubBase(makeDatabasePayload());state.github.dirty=false;clearGithubConflict();saveGithubConfig();updateGithubUi();
  }
  async function pushToGithub(){
    hideGithubMessage();let cfg;try{cfg=githubSettings();}catch(e){showGithubMessage(e.message,'error');return;}
    setGithubBusy(true);try{
      const remote=await fetchGithubFile(cfg,true);if(remote&&!state.github.basePayload){await handleRemoteFile(remote);showGithubMessage(state.github.conflict?'尚未建立同步基准，已阻止覆盖。请先选择本地或云端版本。':'已建立同步基准，请再次上传。',state.github.conflict?'error':'ok');return;}if(remote&&state.github.remoteSha&&remote.sha!==state.github.remoteSha){await handleRemoteFile(remote);showGithubMessage(state.github.conflict?'云端已变化，已阻止覆盖。请先处理冲突。':'云端已变化，已完成安全合并；请再次上传。',state.github.conflict?'error':'ok');return;}
      if(remote&&!state.github.remoteSha&&state.github.basePayload&&!databaseEqual(state.github.basePayload,JSON.parse(base64ToUtf8(remote.content)))){await handleRemoteFile(remote);showGithubMessage('检测到未读取的云端版本，已阻止直接覆盖。','error');return;}
      const body=await writeGithubPayload(cfg,remote,$('#ghCommitMessage').value.trim());await completeGithubPush(body);showGithubMessage(`上传完成：${state.items.length} 个条目已保存到 ${cfg.owner}/${cfg.repo}/${cfg.path}。`,'ok');toast('已上传到 GitHub');
    }catch(e){state.github.connected=false;showGithubMessage(`上传失败：${e.message}`,'error');}finally{setGithubBusy(false);}
  }
  async function autoPushToGithub(){
    if(!state.github.autoSync||!state.github.dirty||state.github.conflict||state.github.busy||!navigator.onLine)return;
    let cfg;try{cfg=githubSettings();}catch(e){return;}
    setGithubBusy(true);try{
      const remote=await fetchGithubFile(cfg,true);
      if(remote&&!state.github.basePayload){await handleRemoteFile(remote,{silent:true});return;}
      if(remote&&state.github.remoteSha&&remote.sha!==state.github.remoteSha){await handleRemoteFile(remote,{silent:true});return;}
      if(remote&&!state.github.remoteSha){await handleRemoteFile(remote,{silent:true});return;}
      const body=await writeGithubPayload(cfg,remote,`Auto-sync CFX-Post library ${new Date().toISOString()}`);await completeGithubPush(body);toast('GitHub 自动同步完成');
    }catch(e){state.github.connected=false;console.warn('GitHub 自动上传失败',e);}finally{setGithubBusy(false);}
  }
  async function safeSyncNow(){
    hideGithubMessage();const ok=await checkGithubForUpdates('manual');if(!ok||state.github.conflict)return;if(state.github.dirty){await autoPushToGithub();showGithubMessage(state.github.dirty?'安全检查完成，但上传未完成，请查看连接状态。':'安全同步完成，本地与云端一致。',state.github.dirty?'error':'ok');}else showGithubMessage('安全同步完成，本地与云端一致。','ok');
  }
  async function usePendingCloud(){
    if(!state.github.pendingRemote)return;const remote=state.github.pendingRemote,sha=state.github.pendingRemoteSha;if(!confirm('使用云端版本会覆盖当前浏览器中的未同步修改。已自动保留本地备份，是否继续？'))return;
    applyDatabaseWithoutDirty(remote);setGithubBase(remote);state.github.remoteSha=sha;state.github.dirty=false;state.github.lastSyncAt=now();clearGithubConflict();saveGithubConfig();showGithubMessage('已采用云端版本。此前本地数据可从浏览器备份中恢复。','ok');toast('已采用云端版本');
  }
  async function keepLocalAndForcePush(){
    if(!state.github.pendingRemote)return;if(!confirm('此操作会用当前本地数据库覆盖云端冲突版本。确定继续？'))return;
    let cfg;try{cfg=githubSettings();}catch(e){showGithubMessage(e.message,'error');return;}setGithubBusy(true);try{const remote={sha:state.github.pendingRemoteSha};const body=await writeGithubPayload(cfg,remote,`Resolve conflict: keep local ${new Date().toISOString()}`);await completeGithubPush(body);showGithubMessage('冲突已处理：已保留本地版本并覆盖云端。','ok');toast('冲突已解决');}catch(e){showGithubMessage(`冲突处理失败：${e.message}`,'error');}finally{setGithubBusy(false);}
  }

  function packageItems(items){
    const exprs=[];const codes=[];items.forEach(item=>{if(['expression','composite'].includes(item.type)){const p=expressionParts(item);if(p.name&&p.body)exprs.push(p);}if(item.type==='composite'&&(item.compositeCode||item.cclCode).trim())codes.push((item.compositeCode||item.cclCode).trim());else if(['ccl','action'].includes(item.type)&&item.cclCode.trim())codes.push(item.cclCode.trim());});
    const blocks=[];if(exprs.length){blocks.push(`LIBRARY:\n  CEL:\n    EXPRESSIONS:\n${exprs.map(e=>`      ${e.name} = ${e.body}`).join('\n')}\n    END\n  END\nEND`);}if(codes.length)blocks.push(codes.join('\n\n'));return blocks.join('\n\n');
  }
  function copyBatch(){const items=[...state.selected].map(id=>state.items.find(x=>x.id===id)).filter(Boolean);const text=packageItems(items);state.copyContext={item:{title:`加载包（${items.length} 项）`,type:'ccl'},mode:'ccl',formula:'',ccl:text,values:{}};$('#copyModalTitle').textContent=`加载包 · ${items.length} 项`;$('#copyTabs').classList.add('hidden');const ph=placeholders(text);$('#templateArea').classList.toggle('hidden',!ph.length);$('#templateFields').innerHTML=ph.map(p=>`<div class="field"><label>${esc(p)}</label><input data-placeholder="${esc(p)}" placeholder="填写 ${esc(p)}"></div>`).join('');updateCopyOutput();openModal('copyModal');}

  function recognizeText(){const text=$('#pasteInput').value.trim();if(!text){toast('请先粘贴内容');return;}let item=blankItem();
    const lines=text.split(/\r?\n/).filter(x=>x.trim());const isCCL=lines.length>1||/^\s*>/.test(text)||/^[A-Z][A-Z0-9 _-]*:\s*/m.test(text)||/\bEND\s*$/m.test(text);
    if(!isCCL&&text.includes('=')){const i=text.indexOf('=');item.type='expression';item.exprName=text.slice(0,i).trim();item.exprBody=text.slice(i+1).trim();item.title=item.exprName||'新表达式';item.category='未分类';}
    else{item.type=/^\s*>/.test(text)?'action':'ccl';item.cclCode=text;const m=text.match(/^\s*([A-Z][A-Z0-9 _-]*):\s*(.+)$/m);item.title=m?`${m[1].trim()} · ${m[2].trim()}`:(item.type==='action'?'新命令动作':'新 CCL 对象');item.category=item.type==='action'?'通用工具':'未分类';}
    closeModal('pasteModal');$('#pasteInput').value='';fillEditor(item,true);}
