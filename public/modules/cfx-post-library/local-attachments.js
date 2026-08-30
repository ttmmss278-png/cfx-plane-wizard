'use strict';
(() => {
  const DIRECTORY_HANDLE_KEY='attachmentDirectory';
  const ITEM_ROOT='items';
  const MAX_ATTACHMENTS=24;
  const MAX_IMAGE_BYTES=20*1024*1024;
  const AUTO_PREVIEW_IMAGES=3;
  let editorAttachments=[];
  let legacyCstAttachments=[];
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
    installCstLibraryEntry();
    const section=document.createElement('section');
    section.id='localAttachmentsCard';
    section.className='local-attachments-card';
    section.innerHTML=`
      <div class="attachment-section-head">
        <div><h4>提醒图片</h4><p>为公式或命令保存参考图、设置截图和操作提醒。</p></div>
        <span class="attachment-local-badge">原文件不进浏览器数据库</span>
      </div>
      <div class="attachment-directory">
        <div class="attachment-directory-row">
          <div class="attachment-directory-copy"><b id="attachmentDirectoryStatus">尚未连接附件目录</b><span id="attachmentDirectoryHint">建议第一次选择 E:\\CFX-Post命令库附件；网页只保存目录授权句柄和图片索引。</span></div>
          <div class="attachment-directory-actions"><button class="btn small" type="button" id="attachmentDirectoryBtn">选择 E 盘目录</button><button class="btn small hidden" type="button" id="changeAttachmentDirectoryBtn">更换目录</button></div>
        </div>
      </div>
      <div class="attachment-cst-moved">
        <div><b>CST 文件集中管理</b><span>已有 CST 引用会自动汇入公式与命令库内的“CST 文件资料库”，旧数据仍保留在公式条目中以兼容私人仓库同步。</span></div>
        <button class="btn small" type="button" id="openCstLibraryBtn">打开 CST 文件库</button>
      </div>
      <div class="attachment-actions">
        <button class="btn" type="button" id="addImageAttachmentBtn">＋ 添加提醒图片</button>
      </div>
      <input id="attachmentDraftSignal" type="hidden" value="0">
      <input id="imageAttachmentInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden>
      <div id="attachmentList" class="attachment-list"></div>
      <div class="attachment-capacity-note">容量策略：仅图片名称与相对位置进入条目 JSON；原文件留在本地磁盘。每个条目合计最多 24 个附件索引，图片单张不超过 20 MB，最多自动预览 3 张。</div>`;
    anchor.insertAdjacentElement('afterend',section);

    const lightbox=document.createElement('div');
    lightbox.id='attachmentLightbox';
    lightbox.className='attachment-lightbox';
    lightbox.innerHTML='<button class="attachment-lightbox-close" type="button" aria-label="关闭图片预览">×</button><img alt="提醒图片大图预览">';
    document.body.appendChild(lightbox);

    $('#attachmentDirectoryBtn').addEventListener('click',()=>connectAttachmentDirectory(false));
    $('#changeAttachmentDirectoryBtn').addEventListener('click',()=>connectAttachmentDirectory(true));
    $('#openCstLibraryBtn').addEventListener('click',openCstLibrary);
    $('#addImageAttachmentBtn').addEventListener('click',()=>$('#imageAttachmentInput').click());
    $('#imageAttachmentInput').addEventListener('change',event=>consumeFiles(event.target.files,'image',event.target));
    $('#attachmentList').addEventListener('click',handleAttachmentAction);
    lightbox.addEventListener('click',event=>{if(event.target===lightbox||event.target.closest('.attachment-lightbox-close'))closeLightbox();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&lightbox.classList.contains('show')){event.stopImmediatePropagation();closeLightbox();}},{capture:true});
    $('#duplicateBtn').addEventListener('click',()=>{suppressAttachmentsOnce=true;},{capture:true});
    updateDirectoryUi();
  }

  function openCstLibrary(){
    const target=new URL('../cst-library/index.html',window.location.href);
    target.searchParams.set('v','1.3.0');
    if(new URLSearchParams(window.location.search).get('embedded'))target.searchParams.set('embedded','1');
    window.location.assign(target.href);
  }

  function installCstLibraryEntry(){
    const container=$('.side-bottom');
    if(!container||$('#cstLibraryBtn'))return;
    const button=document.createElement('button');
    button.className='btn cst-library-entry';
    button.id='cstLibraryBtn';
    button.type='button';
    button.title='管理 CST 文件、用途说明、操作提醒和参考图片';
    button.textContent='CST 文件资料库';
    const note=container.querySelector('.side-note');
    container.insertBefore(button,note||null);
    button.addEventListener('click',openCstLibrary);
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
      hint.textContent='建议第一次选择 E:\\CFX-Post命令库附件；提醒图片不会写入浏览器数据库。';
      button.textContent='选择 E 盘目录';button.disabled=false;change.classList.add('hidden');
    }else{
      const granted=storage.permission==='granted';
      status.textContent=granted?`已连接：${storage.name}`:`需要重新授权：${storage.name}`;
      hint.textContent=granted?'提醒图片将直接读写此文件夹；条目中只保存轻量索引。':'浏览器重启后可能需要点击一次重新授权，不需要重新添加图片。';
      button.textContent=granted?'目录授权正常':'重新授权';button.disabled=false;change.classList.remove('hidden');change.disabled=false;
    }
    const ready=!!storage.handle&&storage.permission==='granted'&&!storage.busy;
    const imageButton=$('#addImageAttachmentBtn');if(imageButton)imageButton.disabled=!ready;
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
    const usedSlots=legacyCstAttachments.length+editorAttachments.length;
    if(usedSlots>=MAX_ATTACHMENTS){toast(`每个条目最多 ${MAX_ATTACHMENTS} 个附件索引`);return;}
    let root;
    try{root=await requireDirectory();}catch(error){toast(error.message);return;}
    const itemId=ensureEditorItemId();
    const directory=`item-${safeAttachmentSegment(itemId)}`;
    const itemsDirectory=await root.getDirectoryHandle(ITEM_ROOT,{create:true});
    const itemDirectory=await itemsDirectory.getDirectoryHandle(directory,{create:true});
    let added=0,skipped=0;
    for(const file of files.slice(0,MAX_ATTACHMENTS-usedSlots)){
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
    stored.attachments=normalizeAttachmentRefs([...legacyCstAttachments,...editorAttachments]);stored.updatedAt=now();save();renderCards();
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
    const images=editorAttachments.filter(value=>value.kind==='image');
    if(!images.length){list.innerHTML=`<div class="attachment-empty"><b>这个公式条目还没有提醒图片</b><br>可放一张结果图、参数截图或操作步骤图片作为提醒。${legacyCstAttachments.length?`<br>检测到 ${legacyCstAttachments.length} 个旧 CST 引用，已保留并交由 CST 文件资料库显示。`:''}</div>`;return;}
    const imageHtml=images.length?`<div><div class="attachment-subtitle">提醒图片 · ${images.length}</div><div class="attachment-images">${images.map((file,index)=>`<div class="attachment-image-card"><div class="attachment-image-preview" ${index<AUTO_PREVIEW_IMAGES?`data-preview-target="${esc(file.id)}" data-attachment-preview="${esc(file.id)}"`:''}>${index<AUTO_PREVIEW_IMAGES?'正在读取本地预览…':'为控制内存，点击“查看”时加载'}</div><div class="attachment-image-info"><div class="attachment-image-copy"><b title="${esc(file.name)}">${esc(file.name)}</b><span>${formatBytes(file.size)}</span></div><div class="attachment-row-actions"><button class="btn small" type="button" data-attachment-action="view" data-attachment-id="${esc(file.id)}">查看</button><button class="btn small danger" type="button" data-attachment-action="remove" data-attachment-id="${esc(file.id)}">删除</button></div></div></div>`).join('')}</div></div>`:'';
    list.innerHTML=imageHtml;
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
    item.attachments=suppressAttachmentsOnce?[]:clone([...legacyCstAttachments,...editorAttachments]);
    suppressAttachmentsOnce=false;
    return normalizeItem(item);
  };

  const baseFillEditor=fillEditor;
  fillEditor=function(item,isNew=false){
    const attachments=normalizeAttachmentRefs(item?.attachments);
    legacyCstAttachments=attachments.filter(value=>value.kind==='cst');
    editorAttachments=attachments.filter(value=>value.kind==='image');
    baseFillEditor({...item,attachments:clone(attachments)},isNew);
    renderAttachmentPanel();
  };

  const baseCloseEditor=closeEditor;
  closeEditor=function(){releasePreviewUrls();closeLightbox();editorAttachments=[];legacyCstAttachments=[];return baseCloseEditor();};

  const baseRenderCards=renderCards;
  renderCards=function(){
    baseRenderCards();
    $$('#cards .card[data-id]').forEach(card=>{
      const item=state.items.find(value=>value.id===card.dataset.id);const files=item?.attachments||[];if(!files.length)return;
      const meta=card.querySelector('.meta');if(!meta)return;
      const images=files.filter(value=>value.kind==='image').length;
      if(images)meta.insertAdjacentHTML('beforeend',`<span class="pill attachment-card-pill">图片 ${images}</span>`);
    });
  };

  installAttachmentUi();
  initializeDirectoryHandle();
})();
