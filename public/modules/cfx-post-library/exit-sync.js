'use strict';
(function(){
  const EXIT_STATUS_KEY='cfxpost_exit_sync_status_v1';
  let finalPushPromise=null;
  let finalPushStartedAt=0;

  function hasUnsyncedChanges(){
    return !!(state?.github?.dirty||state?.github?.conflict);
  }

  function canAttemptFinalPush(){
    return !!(
      state?.github?.autoSync&&
      state.github.dirty&&
      !state.github.conflict&&
      !state.github.busy&&
      !state.github.exitPushInFlight&&
      navigator.onLine
    );
  }

  function rememberExitStatus(status,detail=''){
    try{localStorage.setItem(EXIT_STATUS_KEY,JSON.stringify({status,detail,at:new Date().toISOString()}));}catch(e){}
  }

  async function attemptFinalGithubPush(reason='pagehide'){
    if(!canAttemptFinalPush())return false;
    if(finalPushPromise)return finalPushPromise;
    if(Date.now()-finalPushStartedAt<1000)return false;

    let cfg;
    try{cfg=githubSettings();}catch(e){rememberExitStatus('skipped',e.message);return false;}

    const body={
      message:`Exit auto-sync CFX-Post library ${new Date().toISOString()}`,
      content:utf8ToBase64(JSON.stringify(makeDatabasePayload(),null,2)),
      branch:cfg.branch
    };
    if(state.github.remoteSha)body.sha=state.github.remoteSha;

    const url=`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}`;
    finalPushStartedAt=Date.now();
    state.github.exitPushInFlight=true;
    rememberExitStatus('pending',reason);
    updateGithubUi();

    finalPushPromise=fetch(url,{
      method:'PUT',
      headers:githubHeaders(cfg.token),
      body:JSON.stringify(body),
      keepalive:true
    }).then(async res=>{
      const response=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(response.message||`退出同步失败（HTTP ${res.status}）`);
      await completeGithubPush(response);
      rememberExitStatus('success',reason);
      return true;
    }).catch(err=>{
      console.warn('页面退出前的 GitHub 最终上传未完成',err);
      rememberExitStatus('failed',err.message||String(err));
      return false;
    }).finally(()=>{
      state.github.exitPushInFlight=false;
      finalPushPromise=null;
      updateGithubUi();
    });
    return finalPushPromise;
  }

  window.addEventListener('beforeunload',event=>{
    if(!hasUnsyncedChanges())return;
    attemptFinalGithubPush('beforeunload');
    event.preventDefault();
    event.returnValue='';
  });

  window.addEventListener('pagehide',()=>{
    if(hasUnsyncedChanges())attemptFinalGithubPush('pagehide');
  });

  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&hasUnsyncedChanges())attemptFinalGithubPush('visibilitychange');
  });
})();
