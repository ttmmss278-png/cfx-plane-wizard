'use strict';
  const APP_VERSION='1.9.4';
  const STORAGE_KEY='cfxpost_command_library_v1';
  const CATEGORY_KEY='cfxpost_command_categories_v1';
  const FOLDER_KEY='cfxpost_command_folders_v1';
  const COLLAPSE_KEY='cfxpost_collapsed_categories_v1';
  const THEME_KEY='cfxpost_command_library_theme';
  const GITHUB_CONFIG_KEY='cfxpost_github_sync_config_v1';
  const GITHUB_TOKEN_KEY='cfxpost_github_sync_token_v1';
  const GITHUB_SESSION_TOKEN_KEY='cfxpost_github_sync_session_token_v1';
  const GITHUB_BASE_KEY='cfxpost_github_sync_base_v1';
  const GITHUB_AUTOPUSH_DELAY=15000;
  const GITHUB_MIN_PUSH_INTERVAL=30000;
  const GITHUB_CHECK_INTERVAL=60000;
  const FILE_AUTOSAVE_KEY='cfxpost_linked_file_autosave_v1';
  const FILE_HANDLE_DB='cfxpost_file_handles_v1';
  const FILE_HANDLE_STORE='handles';
  const FILE_HANDLE_KEY='libraryDataFile';
  const typeNames={expression:'表达式',ccl:'CCL 对象',composite:'组合条目',action:'命令动作'};
  const systemCategories=['全部条目','收藏夹','未分类'];
  const defaultCategories=['性能参数','熵产分析','截面与定位器','云图与等值线','流线与矢量','图表与导出','通用工具'];

  const userContour=`CONTOUR: SCPZ2 01
  Apply Instancing Transform = On
  Clip Contour = Off
  Colour Map = Default Colour Map
  Colour Scale = Linear
  Colour Variable =
  Colour Variable Boundary Values = Hybrid
  Constant Contour Colour = Off
  Contour Range = User Specified
  Culling Mode = No Culling
  Domain List = B2
  Draw Contours = On
  Font = Sans Serif
  Fringe Fill = On
  Instancing Transform = /DEFAULT INSTANCE TRANSFORM:Default Transform
  Lighting = On
  Line Colour = 0, 0, 0
  Line Colour Mode = Default
  Line Width = 1
  Location List = /PLANE:pz2f9D
  Max = 5 [W m^-3 K^-1]
  Min = 0.0 [W m^-3 K^-1]
  Number of Contours = 11
  Show Numbers = Off
  Specular Lighting = On
  Surface Drawing = Smooth Shading
  Text Colour = 0, 0, 0
  Text Colour Mode = Default
  Text Height = 0.024
  Transparency = 0.0
  Use Face Values = Off
  Value List = 0 [W m^-3 K^-1],1 [W m^-3 K^-1]
  Visibility = Off
  OBJECT VIEW TRANSFORM:
    Apply Reflection = Off
    Apply Rotation = Off
    Apply Scale = Off
    Apply Translation = Off
    Principal Axis = Z
    Reflection Plane Option = XY Plane
    Rotation Angle = 0.0 [degree]
    Rotation Axis From = 0 [m], 0 [m], 0 [m]
    Rotation Axis To = 0 [m], 0 [m], 0 [m]
    Rotation Axis Type = Principal Axis
    Scale Vector = 1 , 1 , 1
    Translation Vector = 0 [m], 0 [m], 0 [m]
    X = 0.0 [m]
    Y = 0.0 [m]
    Z = 0.0 [m]
  END
END`;

  const examples=[
    {id:'ex-q1',title:'AB1 侧体积流量 Q1',type:'expression',category:'性能参数',tags:['流量','Q1','massFlow','AB1','体积流量'],description:'将 AB1 Side 1 的质量流量除以水密度，得到体积流量。使用前确认流量正负号和介质密度。',exprName:'Q1',exprBody:'(massFlow()@AB1 Side 1)/1000[kg m^-3]',cclCode:'',compositeCode:'',version:'通用',dependencies:'AB1 Side 1',notes:'当前采用 1000 kg/m³。若密度并非常数，建议改为与材料或结果一致的密度表达式。',favorite:true,usageCount:0,createdAt:'2026-07-26T14:00:00.000Z',updatedAt:'2026-07-26T14:00:00.000Z'},
    {id:'ex-contour-scpz2',title:'熵产云图 SCPZ2 01',type:'ccl',category:'云图与等值线',tags:['熵产','Contour','SCPZ2','pz2f9D','B2','0-5'],description:'用户指定的熵产等值云图设置：范围 0–5 W·m⁻³·K⁻¹，11 条等值线，位置为 pz2f9D，域为 B2。',exprName:'',exprBody:'',cclCode:userContour,compositeCode:'',version:'2025 R1 / 2025 R2',dependencies:'B2, pz2f9D',notes:'原始文本末尾多出“EN”，示例中已按两个嵌套对象修正为两个 END。Colour Variable 当前为空，执行前应指定变量。',favorite:true,usageCount:0,createdAt:'2026-07-26T14:01:00.000Z',updatedAt:'2026-07-26T14:01:00.000Z'},
    {id:'ex-template-contour',title:'通用平面云图模板',type:'ccl',category:'云图与等值线',tags:['模板','Contour','Plane','Domain','Variable','Range'],description:'带占位符的精简云图模板。复制时填写对象名、域、平面、变量和范围。',exprName:'',exprBody:'',cclCode:`CONTOUR: {{contourName}}
  Colour Map = Default Colour Map
  Colour Scale = Linear
  Colour Variable = {{variable}}
  Contour Range = User Specified
  Domain List = {{domain}}
  Draw Contours = On
  Fringe Fill = On
  Location List = /PLANE:{{plane}}
  Max = {{max}}
  Min = {{min}}
  Number of Contours = {{levels}}
  Visibility = On
END`,compositeCode:'',version:'通用模板',dependencies:'{{domain}}, {{plane}}, {{variable}}',notes:'这是精简模板；CFD-Post 会使用未显式写出的默认参数。建议先在副本算例中测试。',favorite:false,usageCount:0,createdAt:'2026-07-26T14:02:00.000Z',updatedAt:'2026-07-26T14:02:00.000Z'},
    {id:'ex-delete-object',title:'删除指定对象',type:'action',category:'通用工具',tags:['delete','删除','对象','命令动作'],description:'通过 Command Editor 删除已有对象。对象被其他对象引用时可能产生警告。',exprName:'',exprBody:'',cclCode:'>delete {{objectName}}',compositeCode:'',version:'通用',dependencies:'{{objectName}}',notes:'删除操作不可直接撤销，建议先保存 State 或 Session。',favorite:false,usageCount:0,createdAt:'2026-07-26T14:03:00.000Z',updatedAt:'2026-07-26T14:03:00.000Z'}
  ];

  let state={items:[],categories:[],folders:[],collapsedCategories:new Set(),filterCategory:'全部条目',filterFolderId:'',filterType:'all',search:'',favoritesOnly:false,sort:'updated',selected:new Set(),editingId:null,editingCategory:null,editingFolderId:null,copyContext:null,github:{remoteSha:'',lastSyncAt:'',lastPushAt:'',lastCheckAt:'',connected:false,busy:false,dirty:false,conflict:false,autoSync:false,ready:false,suspendDirty:false,basePayload:null,pendingRemote:null,pendingRemoteSha:'',conflictNames:[],autoPushTimer:null,pollTimer:null,autoStarted:false},fileStorage:{handle:null,name:'',autoSave:true,busy:false,lastSavedAt:'',permission:'unknown',suspendAutosave:false}};
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const els={
    nav:$('#categoryNav'),cards:$('#cards'),workspace:$('#workspace'),detail:$('#detailPanel'),search:$('#searchInput'),viewTitle:$('#viewTitle'),viewSubtitle:$('#viewSubtitle'),
    typeFilter:$('#typeFilter'),sort:$('#sortSelect'),favoritesBtn:$('#favoritesBtn'),batchBar:$('#batchBar'),batchCount:$('#batchCount'),validation:$('#validationBox')
  };

  function clone(v){return JSON.parse(JSON.stringify(v));}
  function uid(){return 'cfx-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);}
  function esc(s=''){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
  function now(){return new Date().toISOString();}
  function normalizeItem(item){return {id:item.id||uid(),title:item.title||'未命名条目',type:item.type||'ccl',category:item.category||'未分类',folderId:item.folderId||'',exportOrder:Number.isFinite(Number(item.exportOrder))?Number(item.exportOrder):100,tags:Array.isArray(item.tags)?item.tags:splitTags(item.tags||''),description:item.description||'',exprName:item.exprName||'',exprBody:item.exprBody||'',cclCode:item.cclCode||'',compositeCode:item.compositeCode||'',version:item.version||'',dependencies:item.dependencies||'',notes:item.notes||'',favorite:!!item.favorite,usageCount:Number(item.usageCount)||0,createdAt:item.createdAt||now(),updatedAt:item.updatedAt||now()};}
  function normalizeFolder(folder){return {id:folder.id||uid(),name:String(folder.name||'未命名文件夹').trim(),category:cleanCategoryName(folder.category)||'未分类',createdAt:folder.createdAt||now(),updatedAt:folder.updatedAt||now()};}
  function cleanFolderName(name){return String(name||'').trim().replace(/\s+/g,' ');}
  function folderById(id){return state.folders.find(f=>f.id===id)||null;}
  function foldersForCategory(category){return state.folders.filter(f=>f.category===category).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}));}
  function folderItems(folderId){return state.items.filter(x=>x.folderId===folderId).sort((a,b)=>(Number(a.exportOrder)||100)-(Number(b.exportOrder)||100)||new Date(a.createdAt)-new Date(b.createdAt));}
  function safeFilename(name){return String(name||'Folder').replace(/[\\/:*?"<>|]+/g,'_').trim()||'Folder';}
  function splitTags(s){return String(s).split(/[,，;；\n]+/).map(x=>x.trim()).filter(Boolean);}
  function cleanCategoryName(name){return String(name||'').trim().replace(/\s+/g,' ');}
  function uniqueCategories(list){return [...new Set((list||[]).map(cleanCategoryName).filter(x=>x&&!systemCategories.includes(x)))];}
  function load(){
    try{const raw=localStorage.getItem(STORAGE_KEY);state.items=raw?JSON.parse(raw).map(normalizeItem):clone(examples);}catch(e){state.items=clone(examples);}
    try{const rawCats=localStorage.getItem(CATEGORY_KEY);state.categories=rawCats?uniqueCategories(JSON.parse(rawCats)):clone(defaultCategories);}catch(e){state.categories=clone(defaultCategories);}
    try{const rawFolders=localStorage.getItem(FOLDER_KEY);state.folders=rawFolders?JSON.parse(rawFolders).map(normalizeFolder):[];}catch(e){state.folders=[];}
    try{const rawCollapsed=localStorage.getItem(COLLAPSE_KEY);state.collapsedCategories=new Set(rawCollapsed?JSON.parse(rawCollapsed):[]);}catch(e){state.collapsedCategories=new Set();}
    const validFolderIds=new Set(state.folders.map(f=>f.id));state.items.forEach(x=>{if(x.folderId&&!validFolderIds.has(x.folderId))x.folderId='';});
    state.categories=uniqueCategories([...state.categories,...state.items.map(x=>x.category),...state.folders.map(x=>x.category)]);
    if(!localStorage.getItem(STORAGE_KEY)) save();else saveCategories();
    const theme=localStorage.getItem(THEME_KEY);if(theme==='dark')document.body.classList.add('dark');
  }
  function save(markCloudDirty=true){localStorage.setItem(STORAGE_KEY,JSON.stringify(state.items));saveCategories();saveFolders();if(state.fileStorage.autoSave&&state.fileStorage.handle&&!state.fileStorage.suspendAutosave)scheduleLinkedFileWrite();if(markCloudDirty)markGithubDirty();}
  function saveCategories(){localStorage.setItem(CATEGORY_KEY,JSON.stringify(state.categories));}
  function saveFolders(){localStorage.setItem(FOLDER_KEY,JSON.stringify(state.folders));}
  function saveCollapsed(){localStorage.setItem(COLLAPSE_KEY,JSON.stringify([...state.collapsedCategories]));}
  function ensureCategory(name){const cat=cleanCategoryName(name);if(cat&&!systemCategories.includes(cat)&&!state.categories.includes(cat))state.categories.push(cat);return cat||'未分类';}
  function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),1800);}
  function openModal(id){$('#'+id).classList.add('show');}
  function closeModal(id){$('#'+id).classList.remove('show');}
  function download(filename,text,type='text/plain;charset=utf-8'){const blob=new Blob([text],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},100);}
  async function copyText(text){try{await navigator.clipboard.writeText(text);toast('已复制到剪贴板');return true;}catch(e){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('已复制到剪贴板');return true;}}
