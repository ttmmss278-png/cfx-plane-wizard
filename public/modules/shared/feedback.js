// Render in the outer same-origin document so nested tools share the viewport centre.
function hostDocument(){let win=window;try{while(win.parent!==win&&win.parent.document)win=win.parent;}catch{}return win.document;}
function modal(title){
 const doc=hostDocument(),host=doc.createElement('div'),root=host.attachShadow({mode:'open'});host.dataset.toolboxModal='true';
 const skin=document.documentElement.dataset.peltonSkin||doc.documentElement.dataset.peltonSkin;
 const light=skin&&skin!=='tech-neon';
 root.innerHTML=`<style>:host{color-scheme:${light?'light':'dark'}}dialog{box-sizing:border-box;margin:auto;width:min(520px,calc(100vw - 32px));max-height:88dvh;overflow:auto;padding:24px;border:1px solid ${light?'#8ca9b5':'#245468'};border-radius:16px;background:${light?'#f4f9fc':'#0c2034'};color:${light?'#203c4a':'#e8f6ff'};box-shadow:0 24px 90px #0008;font:14px/1.7 system-ui}dialog::backdrop{background:#02091499}h2{font-size:18px;margin:0 0 12px}p{white-space:pre-wrap;margin:0 0 22px}.actions{display:flex;justify-content:flex-end;gap:10px}button{font:inherit;cursor:pointer;padding:8px 20px;border-radius:8px;border:1px solid #377086;background:transparent;color:inherit}button.primary{background:#20cfe0;color:#04202c;border-color:#20cfe0;font-weight:700}button:focus-visible{outline:3px solid #1acbdc;outline-offset:3px}img{display:block;max-width:100%;max-height:67dvh;margin:0 auto 16px;object-fit:contain}</style><dialog aria-labelledby="dialog-title"><h2 id="dialog-title"></h2><div class="content"></div><div class="actions"></div></dialog>`;
 root.querySelector('h2').textContent=title;doc.body.append(host);
 const dialog=root.querySelector('dialog'),previous=document.activeElement;
 const close=()=>{dialog.close();host.remove();if(previous?.isConnected)previous.focus();};
 return {root,dialog,close};
}
export function confirmAction(message,title='请确认操作'){
 return new Promise(resolve=>{const {root,dialog,close}=modal(title);const p=document.createElement('p');p.textContent=message;root.querySelector('.content').append(p);
 const finish=value=>{close();resolve(value);};
 for(const [text,value]of [['取消',false],['确认继续',true]]){const b=document.createElement('button');b.textContent=text;if(value)b.className='primary';else b.autofocus=true;b.onclick=()=>finish(value);root.querySelector('.actions').append(b);}
 dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false);});dialog.showModal();});
}
window.PeltonFeedback={confirmAction};
export function attachImportStatus(meta){
 const badge=document.createElement('span');badge.className='import-feedback';badge.setAttribute('role','status');meta.before(badge);
 const update=()=>{const text=meta.textContent;const state=/失败/.test(text)?'error':/正在|读取中/.test(text)?'busy':/尚未|未选择/.test(text)?'idle':'done';
 const label={error:'! 导入失败',busy:'… 读取中',idle:'○ 未导入',done:'✓ 已导入'}[state];
 badge.textContent=label;badge.dataset.state=state;badge.style.cssText=`display:inline-block;margin:12px 0 8px;padding:3px 10px;border:1px solid currentColor;border-radius:20px;font-size:12px;color:${{error:'#e66b69',busy:'#b38927',idle:'var(--muted, #9ab3c4)',done:'var(--accent, #1fa99a)'}[state]}`;};
 new MutationObserver(update).observe(meta,{childList:true,characterData:true,subtree:true});update();
}
export function attachChartViewer(container,title){
 const controls=document.createElement('div');controls.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin:12px 0';
 const toggle=document.createElement('button'),zoom=document.createElement('button');
 toggle.className=zoom.className='button secondary';toggle.type=zoom.type='button';toggle.setAttribute('aria-controls',container.id);
 let expanded=false;function render(){container.hidden=!expanded;toggle.textContent=expanded?'收起曲线图':'展开曲线图';toggle.setAttribute('aria-expanded',String(expanded));}render();
 toggle.onclick=()=>{expanded=!expanded;render();};zoom.textContent='放大查看';
 zoom.onclick=()=>{const svg=container.querySelector('svg');if(!svg)return;const url=URL.createObjectURL(new Blob([svg.outerHTML],{type:'image/svg+xml'}));const {root,dialog,close}=modal(title);dialog.style.width='min(1200px,calc(100vw - 32px))';const img=document.createElement('img');img.src=url;img.alt=title;root.querySelector('.content').append(img);const button=document.createElement('button');button.textContent='关闭';const finish=()=>{URL.revokeObjectURL(url);close();};button.onclick=finish;root.querySelector('.actions').append(button);dialog.addEventListener('cancel',e=>{e.preventDefault();finish();});dialog.showModal();};
 controls.append(toggle,zoom);container.before(controls);
 const update=()=>{zoom.disabled=!container.querySelector('svg');};new MutationObserver(update).observe(container,{childList:true});update();
}
