'use strict';
(function(){
  state.github.localRevision=Number(state.github.localRevision)||0;
  state.github.syncPending=!!state.github.syncPending;

  function log(event,details={}){
    if(Array.isArray(state.github.syncLog)){
      state.github.syncLog.push({at:now(),event,...details});
      if(state.github.syncLog.length>100)state.github.syncLog.splice(0,state.github.syncLog.length-100);
    }
    console.info('[CFX GitHub Sync]',{at:now(),event,...details});
  }

  function dataFingerprint(payload){
    const data=payload||makeDatabasePayload();
    return JSON.stringify({
      categories:Array.isArray(data?.categories)?data.categories:[],
      folders:Array.isArray(data?.folders)?data.folders:[],
      items:Array.isArray(data?.items)?data.items:[]
    });
  }

  function noteLocalMutation(source){
    state.github.localRevision=(Number(state.github.localRevision)||0)+1;
    if(state.github.busy||Number(state.github.queueDepth)>0)state.github.syncPending=true;
    log('local-change',{source,revision:state.github.localRevision,pending:state.github.syncPending});
  }

  const previousSave=save;
  const previousSaveCategories=saveCategories;
  const previousSaveFolders=saveFolders;

  save=function(markCloudDirty=true){
    if(markCloudDirty)noteLocalMutation('database');
    return previousSave(markCloudDirty);
  };

  saveCategories=function(markCloudDirty=true){
    const result=previousSaveCategories();
    if(markCloudDirty){
      noteLocalMutation('categories');
      markGithubDirty();
    }
    return result;
  };

  saveFolders=function(markCloudDirty=true){
    const result=previousSaveFolders();
    if(markCloudDirty){
      noteLocalMutation('folders');
      markGithubDirty();
    }
    return result;
  };

  const previousUpdateGithubUi=updateGithubUi;
  updateGithubUi=function(){
    previousUpdateGithubUi();
    const pending=$('#syncPendingLabel');
    if(pending&&state.github.syncPending&&!state.github.conflict){
      pending.textContent=state.github.dirty?'同步期间有新修改待上传':'正在确认同步状态';
    }
  };

  let activePushRevision=Number(state.github.localRevision)||0;
  let activePushPayload=null;
  let activePushFingerprint='';
  const previousWriteGithubPayload=writeGithubPayload;
  writeGithubPayload=async function(...args){
    activePushRevision=Number(state.github.localRevision)||0;
    activePushPayload=clone(args[3]||makeDatabasePayload());
    activePushFingerprint=dataFingerprint(activePushPayload);
    const body=await previousWriteGithubPayload(...args);
    if(body&&typeof body==='object'){
      Object.defineProperty(body,'__cfxLocalRevision',{value:activePushRevision,enumerable:false,configurable:true});
      Object.defineProperty(body,'__cfxPayloadFingerprint',{value:activePushFingerprint,enumerable:false,configurable:true});
    }
    return body;
  };

  const previousCompleteGithubPush=completeGithubPush;
  completeGithubPush=async function(body,payloadOverride=null){
    const uploadedRevision=Number(body?.__cfxLocalRevision??activePushRevision)||0;
    const currentRevision=Number(state.github.localRevision)||0;
    const uploadedPayload=clone(payloadOverride||activePushPayload||makeDatabasePayload());
    const uploadedFingerprint=body?.__cfxPayloadFingerprint||activePushFingerprint||dataFingerprint(uploadedPayload);
    const currentFingerprint=dataFingerprint(makeDatabasePayload());
    const unchangedDuringPush=currentRevision===uploadedRevision&&currentFingerprint===uploadedFingerprint;

    if(unchangedDuringPush){
      state.github.syncPending=false;
      return previousCompleteGithubPush(body,uploadedPayload);
    }

    setGithubBase(uploadedPayload);
    state.github.connected=true;
    state.github.remoteSha=body?.content?.sha||state.github.remoteSha||'';
    state.github.remoteEtag='';
    state.github.lastSyncAt=now();
    state.github.lastPushAt=now();
    state.github.lastCheckAt=now();
    clearGithubConflict();
    recomputeGithubDirty();
    state.github.syncPending=state.github.dirty;
    saveGithubConfig();
    updateGithubUi();
    log('concurrent-edit-preserved',{
      uploadedRevision,
      currentRevision,
      revisionChanged:currentRevision!==uploadedRevision,
      contentChanged:currentFingerprint!==uploadedFingerprint,
      dirty:state.github.dirty
    });
    if(state.github.dirty&&state.github.autoSync)scheduleGithubAutoPush();
  };

  window.CfxSyncDiagnostics=window.CfxSyncDiagnostics||{};
  window.CfxSyncDiagnostics.getRevisionState=function(){
    return {
      localRevision:Number(state.github.localRevision)||0,
      syncPending:!!state.github.syncPending,
      dirty:!!state.github.dirty,
      busy:!!state.github.busy,
      queueDepth:Number(state.github.queueDepth)||0
    };
  };
})();
