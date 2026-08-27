'use strict';
(() => {
  const DIRECTORY_HANDLE_KEY='attachmentDirectory';
  const ITEM_ROOT='items';
  const MAX_ATTACHMENTS=24;
  const MAX_IMAGE_BYTES=20*1024*1024;
  const AUTO_PREVIEW_IMAGES=3;
  let editorAttachments=[];
  let previewGeneration=0;
  let previewUrls=[];
  let lightboxUrl='';
  let suppressAttachmentsOnce=false;

  state.attachmentStorage={handle:null,name:'',permission:'unknown',busy:false};

  const supportsDirectory=()=>typeof window.showDirectoryPicker==='function'&&'indexedDB' in window;
  const formatBytes=value=>{const bytes=Math.max(0,Number(value)||0);if(bytes<1024)return `${bytes} B`;if(bytes<1024**2)return `${(bytes/1024).toFixed(bytes<10240?1:0)} KB`;if(bytes<1024**3)return `${(bytes/1024**2).toFixed(bytes<10*1024**2?1:0)} MB`;return `${(bytes/1024**3).toFixed(1)} GB`;};
  const attachmentKey=item=>`${item.directory}/${item.storedName}`;

  async function directoryHandleRecord(mode,value){
    if(!('indexedDB' in window))return null;
    const db=await openFileHandleDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(FILE_HANDLE_STORE,mode==='get'?'readonly':'readwrite');
      const store=tx.objectStore(FILE_HANDLE_STORE);
      const request=mode==='get'?store.get(DIRECTORY_HANDLE_KEY):mode==='delete'?store.delete(DIRECTORY_HANDLE_KEY):store.put(value,DIRECTORY_HANDLE_KEY);
      request.onsuccess=()=>{if(mode==='get')resolve(request.result||null);};
      request.onerror=()=>reject(request.error);
      tx.oncomplete=()=>{db.close();if(mode!=='get')resolve(null);};
      tx.onerror=()=>{db.close();reject(tx.error);};
    });
  }

  function releasePreviewUrls(){previewUrls.forEach(url=>URL.revokeObjectURL(url));previewUrls=[];}
  function closeLightbox(){
    const box=$('#attachmentLightbox');
    box?.classList.remove('show');
    if(lightboxUrl){URL.revokeObjectURL(lightboxUrl);lightboxUrl='';}
    const image=box?.querySelector('img');if(image)image.removeAttribute('src');
  }

  function installAttachmentUi(){
    const anchor=$('#itemNotes')?.closest('.field');
    if(!anchor||$('#localAttachmentsCard'))return;
    const section=document.createElement('section');
    section.id='localAttachmentsCard';
    section.className='local-attachments-card';
    section.innerHTML=`
      <div class="attachment-section-head">
        <div><h4>本地附件</h4><p>保存 CST 文件和用于提醒自己的参考图片。</p></div>
        <span class="attachment-local-badge">原文件不进浏览器数据库</span>
      </div>
      <div class="attachment-directory">
        <div class="attachment-directory-row">
          <div class="attachment-directory-copy"><b id="attachmentDirectoryStatus">尚未连接附件目录</b><span id="attachmentDirectoryHint">建议第一次选择 E:\\CFX-Post命令库附件；网页只保存目录授权句柄和附件索引。</span></div>
          <div class="attachment-directory-actions"><button class="btn small" type="button" id="attachmentDirectoryBtn">选择 E 盘目录</button><button class="btn small hidden" type="button" id="changeAttachmentDirectoryBtn">更换目录</button></div>
        </div>
      </div>
      <div class="attachment-actions">
        <button class="btn" type="button" id="addCstAttachmentBtn">＋ 添加 .CST 文件</button>
        <button class="btn" type="button" id="addImageAttachmentBtn">＋ 添加提醒图片</button>
      </div>
      <input id="attachmentDraftSignal" type="hidden" value="0">
      <input id="cstAttachmentInput" type="file" accept=".cst,application/octet-stream" multiple hidden>
      <input id="imageAttachmentInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden>
      <div id="attachmentList" class="attachment-list"></div>
      <div class="attachment-capacity-note">容量策略：仅附件名称与相对位置进入条目 JSON；CST 和图片原文件留在本地磁盘。最多 24 个附件/条目，图片单张不超过 20 MB，最多自动预览 3 张。</div>`;
    anchor.insertAdjacentElement('afterend',section);

    const lightbox=document.createElement('div');
    lightbox.id='attachmentLightbox';
    lightbox.className='attachment-lightbox';
    lightbox.innerHTML='<button class="attachment-lightbox-close" type="button" aria-label="关闭图片预览">×</button><img alt="提醒图片大图预览">';
    document.body.appendChild(lightbox);

    $('#attachmentDirectoryBtn').addEventListener('click',()=>connectAttachmentDirectory(false));
    $('#changeAttachmentDirectoryBtn').addEventListener('click',()=>connectAttachmentDirectory(true));
    $('#addCstAttachmentBtn').addEventListener('click',()=>$('#cstAttachmentInput').click());
    $('#addImageAttachmentBtn').addEventListener('click',()=>$('#imageAttachmentInput').click());
    $('#cstAttachmentInput').addEventListener('change',event=>consumeFiles(event.target.files,'cst',event.target));
    $('#imageAttachmentInput').addEventListener('change',event=>consumeFiles(event.target.files,'image',event.target));
    $('#attachmentList').addEventListener('click',handleAttachmentAction);
    lightbox.addEventListener('click',event=>{if(event.target===lightbox||event.target.closest('.attachment-lightbox-close'))closeLightbox();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&lightbox.classList.contains('show')){event.stopImmediatePropagation();closeLightbox();}},{capture:true});
    $('#duplicateBtn').addEventListener('click',()=>{suppressAttachmentsOnce=true;},{capture:true});
    updateDirectoryUi();
  }

  function updateDirectoryUi(){
    const storage=state.attachmentStorage;
    const status=$('#attachmentDirectoryStatus'),hint=$('#attachmentDirectoryHint'),button=$('#attachmentDirectoryBtn'),change=$('#changeAttachmentDirectoryBtn');
    if(!status)return;
    if(!supportsDirectory()){
      status.textContent='当前浏览器不支持本地附件目录';
      hint.textContent='请使用最新版 Edge 或 Chrome 打开在线工具箱。';
      button.textContent='浏览器不支持';button.disabled=true;change.classList.add('hidden');
    }else if(storage.busy){
      status.textContent='附件目录处理中…';button.disabled=true;change.disabled=true;
    }else if(!storage.handle){
      status.textContent='尚未连接附件目录';
      hint.textContent='建议第一次选择 E:\\CFX-Post命令库附件；文件内容不会写入浏览器数据库。';
      button.textContent='选择 E 盘目录';button.disabled=false;change.classList.add('hidden');
    }else{
      const granted=storage.permission==='granted';
      status.textContent=granted?`已连接：${storage.name}`:`需要重新授权：${storage.name}`;
      hint.textContent=granted?'CST 与图片将直接读写此文件夹；条目中只保存轻量索引。':'浏览器重启后可能需要点击一次重新授权，不需要重新添加附件。';
      button.textContent=granted?'目录授权正常':'重新授权';button.disabled=false;change.classList.remove('hidden');change.disabled=false;
    }
    const ready=!!storage.handle&&storage.permission==='granted'&&!storage.busy;
    ['#addCstAttachmentBtn','#addImageAttachmentBtn'].forEach(selector=>{const element=$(selector);if(element)element.disabled=!ready;});
  }

  async function initializeDirectoryHandle(){
    if(!supportsDirectory()){updateDirectoryUi();return;}
    try{
      const handle=await directoryHandleRecord('get');
      if(handle){state.attachmentStorage.handle=handle;state.attachmentStorage.name=handle.name||'本地附件目录';state.attachmentStorage.permission=await handle.queryPermission({mode:'readwrite'});}
    }catch(error){console.warn('恢复附件目录授权失败',error);}
    updateDirectoryUi();
    if(state.attachmentStorage.permission==='granted')renderAttachmentPanel();
  }

  async function connectAttachmentDirectory(forceNew){
    if(!supportsDirectory())return;
    const storage=state.attachmentStorage;
    storage.busy=true;updateDirectoryUi();
    try{
      let handle=!forceNew?storage.handle:null;
      if(handle){
        const permission=await handle.requestPermission({mode:'readwrite'});
        if(permission!=='granted')throw new Error('未获得附件目录读写权限');
      }else{
        handle=await window.showDirectoryPicker({id:'cfx-post-library-attachments',mode:'readwrite'});
      }
      await handle.getDirectoryHandle(ITEM_ROOT,{create:true});
      await directoryHandleRecord('put',handle);
      storage.handle=handle;storage.name=handle.name||'本地附件目录';storage.permission='granted';
      toast(`附件目录已连接：${storage.name}`);
    }catch(error){
      if(error.name!=='AbortError')toast(error.message||'附件目录连接失败');
      if(storage.handle)storage.permission=await storage.handle.queryPermission({mode:'readwrite'}).catch(()=> 'denied');
    }finally{storage.busy=false;updateDirectoryUi();renderAttachmentPanel();}
  }

  async function requireDirectory(){
    const storage=state.attachmentStorage;
    if(!storage.handle)throw new Error('请先选择 E 盘附件目录');
    let permission=await storage.handle.queryPermission({mode:'readwrite'});
    if(permission!=='granted')permission=await storage.handle.requestPermission({mode:'readwrite'});
    storage.permission=permission;updateDirectoryUi();
    if(permission!=='granted')throw new Error('未获得附件目录读写权限');
    return storage.handle;
  }

  function ensureEditorItemId(){
    let itemId=$('#itemId').value.trim();
    if(!itemId){itemId=uid();$('#itemId').value=itemId;}
    return itemId;
  }

  async function consumeFiles(fileList,kind,input){
    const files=[...(fileList||[])];input.value='';if(!files.length)return;
    if(editorAttachments.length>=MAX_ATTACHMENTS){toast(`每个条目最多 ${MAX_ATTACHMENTS} 个附件`);return;}
    let root;
    try{root=await requireDirectory();}catch(error){toast(error.message);return;}
    const itemId=ensureEditorItemId();
    const directory=`item-${safeAttachmentSegment(itemId)}`;
    const itemsDirectory=await root.getDirectoryHandle(ITEM_ROOT,{create:true});
    const itemDirectory=await itemsDirectory.getDirectoryHandle(directory,{create:true});
    let added=0,skipped=0;
    for(const file of files.slice(0,MAX_ATTACHMENTS-editorAttachments.length)){
      const lower=file.name.toLowerCase();
      if(kind==='cst'&&!lower.endsWith('.cst')){skipped++;continue;}
      if(kind==='image'&&(!file.type.startsWith('image/')||file.size>MAX_IMAGE_BYTES)){skipped++;continue;}
      const id=`att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
      const safeName=safeAttachmentSegment(file.name)||`${kind==='image'?'image':'attachment'}.${kind==='cst'?'cst':'bin'}`;
      const storedName=`${id}__${safeName}`;
      try{
        const handle=await itemDirectory.getFileHandle(storedName,{create:true});
        const writable=await handle.createWritable();
        await writable.write(file);
        await writable.close();
        editorAttachments.push({id,name:file.name,kind,mimeType:file.type||'application/octet-stream',size:file.size,directory,storedName,addedAt:now(),localOnly:true});
        added++;
      }catch(error){console.warn('写入本地附件失败',error);skipped++;}
    }
    editorAttachments=normalizeAttachmentRefs(editorAttachments);
    persistAttachmentAssociation();signalAttachmentDraft();renderAttachmentPanel();
    toast(added?`已保存 ${added} 个本地附件${skipped?`，跳过 ${skipped} 个不符合要求的文件`:''}`:'没有添加附件，请检查格式或图片大小');
  }

  function persistAttachmentAssociation(){
    const itemId=$('#itemId').value.trim();
    const stored=state.items.find(item=>item.id===itemId);
    if(!stored)return;
    stored.attachments=normalizeAttachmentRefs(editorAttachments);stored.updatedAt=now();save();renderCards();
  }

  function signalAttachmentDraft(){
    const signal=$('#attachmentDraftSignal');if(!signal)return;
    signal.value=String(Date.now());signal.dispatchEvent(new Event('input',{bubbles:true}));
  }

  async function resolveAttachmentFile(meta){
    const root=await requireDirectory();
    const itemsDirectory=await root.getDirectoryHandle(ITEM_ROOT);
    const itemDirectory=await itemsDirectory.getDirectoryHandle(meta.directory);
    const handle=await itemDirectory.getFileHandle(meta.storedName);
    return handle.getFile();
  }

  async function downloadAttachment(meta){
    try{
      const file=await resolveAttachmentFile(meta);const url=URL.createObjectURL(file);const anchor=document.createElement('a');
      anchor.href=url;anchor.download=meta.name;document.body.appendChild(anchor);anchor.click();
      setTimeout(()=>{URL.revokeObjectURL(url);anchor.remove();},1000);
    }catch(error){toast(`无法读取附件：${error.message}`);}
  }

  async function showImageAttachment(meta){
    try{
      const file=await resolveAttachmentFile(meta);closeLightbox();lightboxUrl=URL.createObjectURL(file);
      const box=$('#attachmentLightbox');box.querySelector('img').src=lightboxUrl;box.classList.add('show');
    }catch(error){toast(`无法显示图片：${error.message}`);}
  }

  async function removeAttachment(meta){
    if(!confirm(`删除附件“${meta.name}”？\n将同时删除附件目录中的原文件。`))return;
    try{
      const root=await requireDirectory();
      const shared=state.items.some(item=>item.id!==$('#itemId').value&&(item.attachments||[]).some(value=>attachmentKey(value)===attachmentKey(meta)));
      if(!shared){const itemsDirectory=await root.getDirectoryHandle(ITEM_ROOT);const itemDirectory=await itemsDirectory.getDirectoryHandle(meta.directory);await itemDirectory.removeEntry(meta.storedName);}
      editorAttachments=editorAttachments.filter(value=>value.id!==meta.id);
      persistAttachmentAssociation();signalAttachmentDraft();renderAttachmentPanel();toast(shared?'已移除附件关联，原文件仍被其他条目使用':'附件已从条目和本地目录删除');
    }catch(error){toast(`删除失败：${error.message}`);}
  }

  function handleAttachmentAction(event){
    const button=event.target.closest('button[data-attachment-action]');
    const preview=event.target.closest('[data-attachment-preview]');
    const id=button?.dataset.attachmentId||preview?.dataset.attachmentPreview;
    const meta=editorAttachments.find(value=>value.id===id);if(!meta)return;
    const action=button?.dataset.attachmentAction||'view';
    if(action==='download')downloadAttachment(meta);
    else if(action==='remove')removeAttachment(meta);
    else if(meta.kind==='image')showImageAttachment(meta);
  }

  function renderAttachmentPanel(){
    const list=$('#attachmentList');if(!list)return;
    releasePreviewUrls();const generation=++previewGeneration;
    const cst=editorAttachments.filter(value=>value.kind==='cst');
    const images=editorAttachments.filter(value=>value.kind==='image');
    if(!editorAttachments.length){list.innerHTML='<div class="attachment-empty"><b>这个条目还没有本地附件</b><br>可添加 CST 文件，或放一张结果图、设置截图作为操作提醒。</div>';return;}
    const cstHtml=cst.length?`<div><div class="attachment-subtitle">CST 文件 · ${cst.length}</div>${cst.map(file=>`<div class="attachment-file-row"><div class="attachment-file-main"><span class="attachment-file-icon">CST</span><div class="attachment-file-copy"><b title="${esc(file.name)}">${esc(file.name)}</b><span>${formatBytes(file.size)} · 本地文件</span></div></div><div class="attachment-row-actions"><button class="btn small" type="button" data-attachment-action="download" data-attachment-id="${esc(file.id)}">下载</button><button class="btn small danger" type="button" data-attachment-action="remove" data-attachment-id="${esc(file.id)}">删除</button></div></div>`).join('')}</div>`:'';
    const imageHtml=images.length?`<div><div class="attachment-subtitle">提醒图片 · ${images.length}</div><div class="attachment-images">${images.map((file,index)=>`<div class="attachment-image-card"><div class="attachment-image-preview" ${index<AUTO_PREVIEW_IMAGES?`data-preview-target="${esc(file.id)}" data-attachment-preview="${esc(file.id)}"`:''}>${index<AUTO_PREVIEW_IMAGES?'正在读取本地预览…':'为控制内存，点击“查看”时加载'}</div><div class="attachment-image-info"><div class="attachment-image-copy"><b title="${esc(file.name)}">${esc(file.name)}</b><span>${formatBytes(file.size)}</span></div><div class="attachment-row-actions"><button class="btn small" type="button" data-attachment-action="view" data-attachment-id="${esc(file.id)}">查看</button><button class="btn small danger" type="button" data-attachment-action="remove" data-attachment-id="${esc(file.id)}">删除</button></div></div></div>`).join('')}</div></div>`:'';
    list.innerHTML=cstHtml+imageHtml;
    if(state.attachmentStorage.permission!=='granted'){
      list.querySelectorAll('[data-preview-target]').forEach(node=>node.textContent='重新授权附件目录后显示预览');return;
    }
    images.slice(0,AUTO_PREVIEW_IMAGES).forEach(async meta=>{
      const target=list.querySelector(`[data-preview-target="${CSS.escape(meta.id)}"]`);if(!target)return;
      try{
        const file=await resolveAttachmentFile(meta);if(generation!==previewGeneration)return;
        const url=URL.createObjectURL(file);previewUrls.push(url);const image=document.createElement('img');image.src=url;image.alt=`提醒图片：${meta.name}`;target.textContent='';target.appendChild(image);
      }catch(error){if(generation===previewGeneration)target.textContent='本地图片未找到或目录未授权';}
    });
  }

  const baseReadEditor=readEditor;
  readEditor=function(){
    const item=baseReadEditor();
    item.attachments=suppressAttachmentsOnce?[]:clone(editorAttachments);
    suppressAttachmentsOnce=false;
    return normalizeItem(item);
  };

  const baseFillEditor=fillEditor;
  fillEditor=function(item,isNew=false){
    editorAttachments=normalizeAttachmentRefs(item?.attachments);
    baseFillEditor({...item,attachments:clone(editorAttachments)},isNew);
    renderAttachmentPanel();
  };

  const baseCloseEditor=closeEditor;
  closeEditor=function(){releasePreviewUrls();closeLightbox();editorAttachments=[];return baseCloseEditor();};

  const baseRenderCards=renderCards;
  renderCards=function(){
    baseRenderCards();
    $$('#cards .card[data-id]').forEach(card=>{
      const item=state.items.find(value=>value.id===card.dataset.id);const files=item?.attachments||[];if(!files.length)return;
      const meta=card.querySelector('.meta');if(!meta)return;
      const cst=files.filter(value=>value.kind==='cst').length,images=files.filter(value=>value.kind==='image').length;
      if(cst)meta.insertAdjacentHTML('beforeend',`<span class="pill attachment-card-pill">CST ${cst}</span>`);
      if(images)meta.insertAdjacentHTML('beforeend',`<span class="pill attachment-card-pill">图片 ${images}</span>`);
      if(cst){const actions=card.querySelector('.card-actions');actions?.insertAdjacentHTML('afterbegin',`<button class="btn small" type="button" data-card-cst="${esc(item.id)}">${cst===1?'下载 CST':`CST 文件 ${cst}`}</button>`);}
    });
  };

  els.cards.addEventListener('click',event=>{
    const button=event.target.closest('button[data-card-cst]');if(!button)return;
    const item=state.items.find(value=>value.id===button.dataset.cardCst);if(!item)return;
    const files=(item.attachments||[]).filter(value=>value.kind==='cst');
    if(files.length===1)downloadAttachment(files[0]);
    else{fillEditor(item,false);setTimeout(()=>$('#localAttachmentsCard')?.scrollIntoView({block:'nearest'}),100);}
  });

  installAttachmentUi();
  initializeDirectoryHandle();
})();
