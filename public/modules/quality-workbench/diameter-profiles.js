import {confirmAction} from '../shared/feedback.js';

const KEY='pelton-quality-diameter-profiles-v1';
const LEGACY='pelton-quality-diameter-lock-v1';
const valid=(value,unit)=>String(value).trim()!==''&&Number.isFinite(Number(value))&&Number(value)>0&&['mm','m'].includes(unit);
const same=(a,b)=>a.value===b.value&&a.unit===b.unit;
const id=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Libraries stay on this browser. Project files carry only the current model snapshot.
export function attachDiameterProfiles({valueInput,unitInput,calculateButton,onChange,status}){
 const host=document.createElement('div');host.className='diameter-profiles';
 host.innerHTML='<label for="diameter-profile">模型</label><div class="model-controls"><select id="diameter-profile" aria-label="当前机组模型"></select><details class="action-menu"><summary>管理模型</summary><div class="action-menu-items"><button type="button" id="new-diameter-profile">保存为新模型</button><button type="button" id="rename-diameter-profile">重命名</button><button type="button" id="delete-diameter-profile">删除模型</button></div></details></div>';
 valueInput.closest('.metric-settings').querySelector('label[for="diameter"]').before(host);
 const select=host.querySelector('select'),newButton=host.querySelector('#new-diameter-profile'),rename=host.querySelector('#rename-diameter-profile'),remove=host.querySelector('#delete-diameter-profile');
 const lock=document.createElement('button');lock.id='toggle-diameter-lock';lock.type='button';lock.className='button secondary';calculateButton.before(lock);
 const hint=document.createElement('p');hint.id='diameter-lock-hint';hint.className='diameter-lock-hint';hint.setAttribute('role','status');valueInput.closest('.diameter-controls').after(hint);
 let profiles=[],selectedId='',locked=false,naming=false;
 const current=()=>({value:valueInput.value,unit:unitInput.value});
 const selected=()=>profiles.find(profile=>profile.id===selectedId);
 function persist(){
  try{localStorage.setItem(KEY,JSON.stringify({version:1,profiles,selectedId,draft:{...current(),locked}}));}
  catch{status('模型直径暂未写入本机，请保存完整项目文件备份。',true);return false;}
  return true;
 }
 function render(){
  select.replaceChildren();
  const empty=document.createElement('option');empty.value='';empty.textContent='自定义（未保存为模型）';select.append(empty);
  for(const profile of profiles){const option=document.createElement('option');option.value=profile.id;option.textContent=profile.name;option.title=`${profile.value} ${profile.unit}`;select.append(option);}
  select.value=selectedId;rename.disabled=remove.disabled=!selected();
  valueInput.disabled=unitInput.disabled=locked;
  lock.textContent=locked?'修改直径':selected()?'保存直径':'锁定直径';
  lock.setAttribute('aria-pressed',String(locked));
  hint.textContent=locked?'已锁定 · 本机已记忆':selected()?'正在编辑 · 保存后更新当前模型':'自定义参数 · 可在“管理模型”中命名保存';
 }
 function apply(draft){valueInput.value=draft.value;unitInput.value=draft.unit;locked=draft.locked===true&&valid(draft.value,draft.unit);render();}
 function uniqueName(base){let name=base,n=2;while(profiles.some(profile=>profile.name.toLocaleLowerCase()===name.toLocaleLowerCase()))name=base.slice(0,34)+' '+n++;return name;}
 function askName(title,initial=''){
  naming=true;
  const dialog=document.createElement('dialog');dialog.className='model-name-dialog';
  dialog.innerHTML='<form><h2></h2><label for="model-name-input">模型名称</label><input id="model-name-input" maxlength="40" required autocomplete="off" placeholder="例如 YX、ZL 或机组型号"><p class="name-error" role="alert"></p><div class="wb-actions"><button type="button" class="button quiet">取消</button><button type="submit" class="button primary">确认保存</button></div></form>';
  dialog.querySelector('h2').textContent=title;dialog.querySelector('input').value=initial;document.body.append(dialog);dialog.showModal();dialog.querySelector('input').focus();
  return new Promise(resolve=>{
   const finish=name=>{naming=false;dialog.close();dialog.remove();resolve(name);};
   dialog.querySelector('button').onclick=()=>finish(null);dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
   dialog.querySelector('form').onsubmit=event=>{
    event.preventDefault();const name=dialog.querySelector('input').value.trim();
    if(!name||profiles.some(profile=>profile.name.toLocaleLowerCase()===name.toLocaleLowerCase()&&(title!=='重命名直径模型'||profile.id!==selectedId))){dialog.querySelector('.name-error').textContent='请填写未重复的模型名称（最多 40 个字符）。';return;}
    finish(name);
   };
  });
 }
 try{
  const data=JSON.parse(localStorage.getItem(KEY)||'null');
  if(data?.version===1&&Array.isArray(data.profiles)){
   const ids=new Set(),names=new Set();
   profiles=data.profiles.filter(profile=>{if(!profile||typeof profile.id!=='string'||typeof profile.name!=='string'||!profile.name.trim()||profile.name.length>40||ids.has(profile.id)||names.has(profile.name.toLocaleLowerCase())||!valid(profile.value,profile.unit))return false;ids.add(profile.id);names.add(profile.name.toLocaleLowerCase());return true;}).map(profile=>({...profile,value:String(profile.value)}));
   selectedId=profiles.some(profile=>profile.id===data.selectedId)?data.selectedId:'';
   const draft=data.draft;
   if(draft&&typeof draft.value==='string'&&['mm','m'].includes(draft.unit))apply(draft);
   else if(selected())apply({...selected(),locked:true});else render();
  }else{
   const old=JSON.parse(localStorage.getItem(LEGACY)||'null');
   if(old&&valid(old.value,old.unit)){const profile={id:id(),name:'YX',value:String(old.value),unit:old.unit};profiles.push(profile);selectedId=profile.id;apply({...profile,locked:true});persist();}else render();
  }
 }catch{render();status('已保存的直径设置无法读取，请核对后重新保存。',true);}
 const edited=()=>{locked=false;render();persist();onChange();};
 valueInput.addEventListener('input',edited);unitInput.addEventListener('change',edited);
 lock.onclick=()=>{
  if(locked){locked=false;render();persist();onChange();return;}
  if(!valid(valueInput.value,unitInput.value)){status('请先填写大于 0 的喷嘴直径并确认单位。',true);return;}
  if(selected())Object.assign(selected(),current());locked=true;render();const saved=persist();onChange();if(saved)status('喷嘴直径已保存并锁定；导入偏移量后点击“计算偏移度”。');
 };
 newButton.onclick=async()=>{
  host.querySelector('details').open=false;
  if(naming)return;
  if(!valid(valueInput.value,unitInput.value)){status('请先填写大于 0 的喷嘴直径，再保存为新模型。',true);valueInput.focus();return;}
  const name=await askName('保存为新直径模型');if(name===null)return;
  const profile={id:id(),name,...current()};profiles.push(profile);selectedId=profile.id;locked=true;render();const saved=persist();onChange();if(saved)status(`已保存模型“${name}”的喷嘴直径。`);
 };
 select.onchange=async()=>{
  const next=select.value,previous=selectedId;select.value=previous;
  if(selected()&&!same(current(),selected())&&!await confirmAction('当前直径尚未保存到模型。切换将放弃这次修改，是否继续？','切换直径模型'))return;
  selectedId=next;const profile=selected();if(profile)apply({...profile,locked:true});else{locked=false;render();}
  persist();onChange();status('直径模型已切换，输入数据保留，请重新计算偏移度。');
 };
 rename.onclick=async()=>{host.querySelector('details').open=false;if(naming||!selected())return;const name=await askName('重命名直径模型',selected().name);if(name===null)return;selected().name=name;render();persist();onChange();};
 remove.onclick=async()=>{host.querySelector('details').open=false;if(!selected())return;if(!await confirmAction(`删除模型“${selected().name}”？当前直径和输入数据保留。`,'删除直径模型'))return;profiles=profiles.filter(profile=>profile.id!==selectedId);selectedId='';render();persist();onChange();};
 return {
  get locked(){return locked;},get name(){return selected()?.name||'';},
  ensureIdle(){if(naming)throw new Error('请先保存或取消直径模型命名。');},
  restore(value,unit,name='',shouldLock=false){
   const draft={value,unit};
   if(valid(value,unit)){
    let profile=profiles.find(item=>item.name===name&&same(item,draft))||(!name?profiles.find(item=>same(item,draft)):null);
    if(!profile){profile={id:id(),name:uniqueName(name||'项目直径'),...draft};profiles.push(profile);}
    selectedId=profile.id;
   }else selectedId='';
   apply({...draft,locked:shouldLock});persist();
  }
 };
}
