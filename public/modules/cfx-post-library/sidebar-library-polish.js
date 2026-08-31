'use strict';
(() => {
  const WIDTH_KEY='cfxpost_sidebar_width_v1';
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

  function installResponsiveAccessibility(){
    [
      ['themeBtn','切换明暗主题','主题'],
      ['quickPasteBtn','粘贴并自动识别','识别'],
      ['newFolderTopBtn','新建文件夹','文件夹'],
      ['newBtn','新建条目','新建']
    ].forEach(([id,label,compactLabel])=>{
      const button=document.getElementById(id);
      if(!button)return;
      button.setAttribute('aria-label',label);
      if(!button.title)button.title=label;
      button.dataset.compactLabel=compactLabel;
    });
    document.querySelector('#detailPanel')?.setAttribute('aria-label','条目编辑器');
    document.querySelector('#closeDetailBtn')?.setAttribute('aria-label','关闭条目编辑器');
  }

  function libraryCounts(){
    const categoryNames=new Set([
      ...(Array.isArray(state?.categories)?state.categories:[]),
      ...(Array.isArray(state?.items)?state.items.map(item=>item.category).filter(Boolean):[]),
      ...(Array.isArray(state?.folders)?state.folders.map(folder=>folder.category).filter(Boolean):[])
    ]);
    return {
      items:Array.isArray(state?.items)?state.items.length:0,
      categories:categoryNames.size,
      folders:Array.isArray(state?.folders)?state.folders.length:0
    };
  }

  function updateStats(){
    const target=document.querySelector('#sidebarLibraryStats');
    if(!target)return;
    const counts=libraryCounts();
    target.textContent=`${counts.items} 条资料 · ${counts.categories} 类 · ${counts.folders} 文件夹`;
  }

  function applyDirectoryFilter(){
    const nav=document.querySelector('#categoryNav');
    const input=document.querySelector('#sidebarDirectoryFilter');
    if(!nav||!input)return;
    const query=input.value.trim().toLocaleLowerCase('zh-CN');
    let visible=0;
    nav.querySelectorAll('.category-block').forEach(block=>{
      const categoryName=block.querySelector('.nav-main>span:first-child')?.textContent?.trim()||'';
      const categoryMatch=!query||categoryName.toLocaleLowerCase('zh-CN').includes(query);
      let folderMatches=0;
      const folderNodes=[...block.querySelectorAll('.folder-tree-node')];
      [...folderNodes].reverse().forEach(folder=>{
        const folderName=folder.querySelector(':scope > .folder-row > .folder-main > span:first-child')?.textContent?.trim()||'';
        const ownMatch=!query||categoryMatch||folderName.toLocaleLowerCase('zh-CN').includes(query);
        const descendantMatch=[...folder.querySelectorAll(':scope > .folder-children > .folder-tree-node')].some(child=>child.dataset.directoryMatch==='true');
        const match=ownMatch||descendantMatch;
        folder.dataset.directoryMatch=String(match);
        folder.hidden=!match;
        if(match)folderMatches++;
        if(query&&descendantMatch)folder.querySelector(':scope > .folder-children')?.classList.remove('collapsed');
      });
      folderNodes.forEach(folder=>delete folder.dataset.directoryMatch);
      const show=!query||categoryMatch||folderMatches>0;
      block.hidden=!show;
      if(show){
        visible++;
        if(query&&folderMatches)block.querySelector('.folder-list')?.classList.remove('collapsed');
      }
    });
    let empty=nav.querySelector('.nav-filter-empty');
    if(!visible&&query){
      if(!empty){
        empty=document.createElement('div');
        empty.className='nav-filter-empty';
        nav.appendChild(empty);
      }
      empty.textContent=`没有找到“${input.value.trim()}”相关的分类或文件夹`;
    }else empty?.remove();
    document.querySelector('.sidebar-filter')?.classList.toggle('has-value',Boolean(query));
  }

  function installDirectoryTools(){
    installResponsiveAccessibility();
    const sidebar=document.querySelector('.sidebar');
    const brand=sidebar?.querySelector('.brand');
    const nav=sidebar?.querySelector('#categoryNav');
    if(!sidebar||!brand||!nav||document.querySelector('#sidebarDirectoryFilter'))return;

    const meta=document.createElement('div');
    meta.className='sidebar-directory-meta';
    meta.innerHTML='<strong>资料目录</strong><span id="sidebarLibraryStats">正在统计…</span>';
    brand.insertAdjacentElement('afterend',meta);

    const filter=document.createElement('label');
    filter.className='sidebar-filter';
    filter.innerHTML='<span aria-hidden="true">⌕</span><input id="sidebarDirectoryFilter" type="search" autocomplete="off" placeholder="筛选分类或文件夹…" aria-label="筛选分类或文件夹"><button type="button" id="clearSidebarDirectoryFilter" aria-label="清除目录筛选">×</button>';
    meta.insertAdjacentElement('afterend',filter);
    const input=filter.querySelector('input');
    input.addEventListener('input',applyDirectoryFilter);
    input.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&input.value){input.value='';applyDirectoryFilter();}
    });
    filter.querySelector('button').addEventListener('click',()=>{input.value='';applyDirectoryFilter();input.focus();});

    const resizer=document.createElement('button');
    resizer.type='button';
    resizer.className='sidebar-resizer';
    resizer.title='拖动调整资料目录宽度；双击恢复默认宽度';
    resizer.setAttribute('aria-label','调整资料目录宽度');
    sidebar.appendChild(resizer);
    let startX=0,startWidth=0;
    resizer.addEventListener('pointerdown',event=>{
      startX=event.clientX;
      startWidth=sidebar.getBoundingClientRect().width;
      resizer.classList.add('dragging');
      resizer.setPointerCapture(event.pointerId);
    });
    resizer.addEventListener('pointermove',event=>{
      if(!resizer.hasPointerCapture(event.pointerId))return;
      const width=clamp(startWidth+event.clientX-startX,300,460);
      document.documentElement.style.setProperty('--library-sidebar-width',`${width}px`);
    });
    const finishResize=event=>{
      if(!resizer.hasPointerCapture(event.pointerId))return;
      resizer.releasePointerCapture(event.pointerId);
      resizer.classList.remove('dragging');
      localStorage.setItem(WIDTH_KEY,String(Math.round(sidebar.getBoundingClientRect().width)));
    };
    resizer.addEventListener('pointerup',finishResize);
    resizer.addEventListener('pointercancel',finishResize);
    resizer.addEventListener('dblclick',()=>{
      document.documentElement.style.setProperty('--library-sidebar-width','340px');
      localStorage.removeItem(WIDTH_KEY);
    });

    const saved=Number(localStorage.getItem(WIDTH_KEY));
    if(Number.isFinite(saved)&&saved>=300&&saved<=460){
      document.documentElement.style.setProperty('--library-sidebar-width',`${saved}px`);
    }

    const observer=new MutationObserver(()=>{updateStats();applyDirectoryFilter();});
    observer.observe(nav,{childList:true});
    updateStats();
    applyDirectoryFilter();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installDirectoryTools,{once:true});
  else installDirectoryTools();
})();
