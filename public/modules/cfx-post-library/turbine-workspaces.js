'use strict';
(() => {
  const model = CfxTurbineWorkspaceModel, context = CfxTurbineContext;
  const originalCanonical = canonicalDatabase, originalEqual = databaseEqual;
  const originalMerge = threeWayMergeDatabases, originalInitialMerge = initialSafeMergeDatabases;
  let registry = null, ready = false, switching = false, editorBaseline = '', modalResolve = null, modalFocus = null;
  let homeOpen = new URLSearchParams(location.search).get('view') !== 'library', homeQuery = '';
  let lastEnteredId = context.id;
  try { lastEnteredId = localStorage.getItem('cfxpost_last_entered_library_v1') || context.id; } catch (_) {}

  function singleCanonical(data) {
    const previous = state.defaultCategory;
    try {
      state.defaultCategory = data?.defaultCategory || '未分类';
      return { ...originalCanonical(data), defaultCategory: state.defaultCategory };
    } finally { state.defaultCategory = previous; }
  }
  const singleEqual = (a, b) => a.defaultCategory === b.defaultCategory && originalEqual(a, b);
  function mergeSingle(base, local, remote, preferFn) {
    const result = preferFn ? { merged: preferFn(base, local, remote), conflicts: [] } :
      (base ? originalMerge(base, local, remote) : originalInitialMerge(local, remote));
    if (result.merged) {
      let category = local.defaultCategory;
      if (category !== remote.defaultCategory) {
        if (base && category === base.defaultCategory) category = remote.defaultCategory;
        else if ((!base || remote.defaultCategory !== base.defaultCategory) && !preferFn) {
          result.conflicts.push({ id: 'defaultCategory', name: '默认分类', fields: ['默认分类'] });
          result.merged = null;
          return result;
        }
      }
      result.merged.defaultCategory = category || '未分类';
    }
    return result;
  }
  const mergeOptions = preferFn => ({
    normalizeSingle: singleCanonical, singleEqual, preferLocal: !!preferFn,
    mergeSingle: (b, l, r) => mergeSingle(b, l, r, preferFn),
    initialSingle: (l, r) => mergeSingle(null, l, r, preferFn),
  });
  canonicalDatabase = data => model.normalize(data || { items: [], folders: [], categories: [] }, singleCanonical);
  databaseEqual = (a, b) => model.equal(a, b, singleCanonical, singleEqual);
  threeWayMergeDatabases = (b, l, r) => model.merge(b, l, r, mergeOptions());
  initialSafeMergeDatabases = (l, r) => model.merge(null, l, r, mergeOptions());

  function active() { return registry && model.select(registry, context.id); }
  function updateContext(id) {
    context.setId(id);
    const url = new URL(location.href); url.searchParams.set('turbine', id);
    history.replaceState(null, '', url);
    COLLAPSE_KEY = context.key('cfxpost_collapsed_categories_v1');
    FILE_AUTOSAVE_KEY = context.key('cfxpost_linked_file_autosave_v1');
    FILE_HANDLE_KEY = context.key('libraryDataFile');
    CATEGORY_FIX_DEFAULT_KEY = context.key('cfxpost_default_category_v1');
  }
  function storeNames() {
    try { localStorage.setItem('cfxpost_turbine_names_v1', JSON.stringify(registry.turbineWorkspaces.map(({ id, name }) => ({ id, name })))); }
    catch (_) { /* The real data is in IndexedDB. */ }
  }
  function captureActive() {
    const database = singleCanonical({ items: state.items, folders: state.folders, categories: state.categories, defaultCategory: state.defaultCategory });
    if (!registry) registry = model.normalize(database, singleCanonical);
    else active().database = database;
    return registry;
  }
  makeDatabasePayload = function () {
    captureActive();
    return { ...model.envelope(registry.turbineWorkspaces), exportedAt: now() };
  };
  function install(data) {
    registry = canonicalDatabase(data);
    const selected = model.select(registry, context.id);
    updateContext(selected.id);
    state.defaultCategory = selected.database.defaultCategory;
    storeNames();
    renderWorkspaceUi();
    return model.copy(selected.database);
  }
  function installActiveState(data) {
    state.defaultCategory = data.defaultCategory;
    state.items = data.items.map(normalizeItem);
    state.folders = data.folders.map(normalizeFolder);
    state.categories = uniqueCategories([...data.categories, state.defaultCategory, ...state.items.map(item => item.category), ...state.folders.map(folder => folder.category)]);
    const folderIds = new Set(state.folders.map(folder => folder.id));
    state.items.forEach(item => { if (item.folderId && !folderIds.has(item.folderId)) item.folderId = ''; });
  }
  const oldLoad = load;
  load = async function () {
    await oldLoad();
    captureActive();
    updateContext(active().id);
    storeNames();
    await window.CfxAttachmentStorage?.reload();
    renderWorkspaceUi();
  };
  const oldBootstrap = window.bootstrapCfxLibrary;
  window.bootstrapCfxLibrary = async function () {
    await oldBootstrap();
    ready = true;
    renderWorkspaceUi();
  };
  const oldRenderAll = renderAll;
  renderAll = function () { oldRenderAll(); renderWorkspaceUi(); };
  const oldFillEditor = fillEditor;
  const editorFingerprint = () => {
    const item = readEditor();
    ['id', 'createdAt', 'updatedAt', 'usageCount'].forEach(key => delete item[key]);
    return JSON.stringify(item);
  };
  fillEditor = function (...args) { oldFillEditor(...args); editorBaseline = editorFingerprint(); };
  function editorDirty() { return els.workspace.classList.contains('with-detail') && editorFingerprint() !== editorBaseline; }

  async function settleEditor() {
    if (editorDirty()) {
      const answer = await question('离开当前资料库', `“${active().name}”有尚未保存的编辑。`, [
        { value: 'cancel', text: '取消' }, { value: 'discard', text: '放弃修改' }, { value: 'save', text: '保存并继续', primary: true },
      ]);
      if (answer === 'cancel') return false;
      if (answer === 'save') {
        if (validateItem(readEditor()).errors.length) { validateLive(); toast('请先修正当前条目的必填项'); return false; }
        saveEditor();
      }
    }
    await window.CfxLibraryDrafts?.clear();
    closeEditor();
    return true;
  }
  function resetView() {
    state.filterCategory = '全部条目'; state.filterFolderId = ''; state.filterType = 'all';
    state.search = ''; state.favoritesOnly = false; state.selected = new Set();
    els.search.value = '';
    try { state.collapsedCategories = new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]')); }
    catch (_) { state.collapsedCategories = new Set(); }
    $('#sidebarDirectoryFilter') && ($('#sidebarDirectoryFilter').value = '');
    $$('#typeFilter [data-type]').forEach(button => button.classList.toggle('active', button.dataset.type === 'all'));
    els.favoritesBtn?.classList.remove('active');
  }
  async function flushBeforeSwitch() {
    const pendingFileWrite = !!scheduleLinkedFileWrite.timer;
    clearTimeout(scheduleLinkedFileWrite.timer); scheduleLinkedFileWrite.timer = null;
    if (pendingFileWrite && state.fileStorage.autoSave && state.fileStorage.handle && !state.fileStorage.suspendAutosave) await writeLinkedDataFile(true);
    const result = await window.CfxCacheDiagnostics.forcePersist();
    if (result?.kind === 'conflict' || result?.kind === 'memory-only') throw new Error('当前资料尚未安全存储，请处理缓存冲突或启用浏览器存储后再切换');
  }
  async function changeWorkspace(id, newWorkspace) {
    if (!ready || switching) return false;
    if (!newWorkspace && id === context.id) return true;
    if (state.github.busy || state.fileStorage.busy || state.attachmentStorage?.busy) { toast('当前正在读写或同步，请完成后再切换资料库'); renderWorkspaceUi(); return false; }
    switching = true; renderWorkspaceUi();
    try {
      if (!await settleEditor()) return false;
      await flushBeforeSwitch();
      captureActive();
      if (newWorkspace) { registry.turbineWorkspaces.push({ ...newWorkspace, id }); save(); await flushBeforeSwitch(); }
      updateContext(id);
      const data = active().database;
      installActiveState(data);
      resetView();
      Object.assign(state.fileStorage, { handle: null, name: '', permission: 'unknown', lastSavedAt: '', busy: false });
      hideFileStorageMessage();
      await initLinkedFileStorage();
      await window.CfxAttachmentStorage?.reload();
      storeNames(); renderAll();
      if (!homeOpen) await window.CfxLibraryDrafts?.restore();
      toast(newWorkspace ? `已创建 ${active().name}` : `已切换到 ${active().name}`);
      return true;
    } catch (error) { toast(`切换失败：${error.message}`); console.error(error); return false; }
    finally { switching = false; renderWorkspaceUi(); }
  }

  // Plain old backups import into the current machine. Full backups carry all machines.
  applyIncomingDatabase = function (data, mode, source = '外部数据库', options = {}) {
    const before = makeDatabasePayload();
    if (!Array.isArray(data) && !Array.isArray(data?.items)) throw new Error(`${source}不是有效的命令库 JSON。`);
    let next;
    if (model.hasWorkspaces(data)) {
      const incoming = canonicalDatabase(data);
      if (mode === 'replace') next = incoming;
      else {
        next = canonicalDatabase(before);
        incoming.turbineWorkspaces.forEach(value => {
          const current = next.turbineWorkspaces.find(entry => entry.id === value.id);
          if (current) { current.database = mergeImport(current.database, value.database); current.name = value.name; }
          else next.turbineWorkspaces.push(value);
        });
      }
    } else {
      next = canonicalDatabase(before);
      const current = model.select(next, context.id), incoming = singleCanonical(data);
      current.database = mode === 'replace' ? incoming : mergeImport(current.database, incoming);
      current.updatedAt = now();
    }
    if (options.backup !== false) backupFullDatabase(before, source);
    const previousId = context.id;
    const incomingActive = model.select(next, previousId);
    if (incomingActive.id !== previousId) {
      clearTimeout(scheduleLinkedFileWrite.timer); scheduleLinkedFileWrite.timer = null;
      closeEditor();
      Object.assign(state.fileStorage, { handle: null, name: '', lastSavedAt: '', permission: 'unknown' });
    }
    installActiveState(install(next));
    state.selected = new Set();
    if (incomingActive.id !== previousId) { resetView(); initLinkedFileStorage(); window.CfxAttachmentStorage?.reload(); }
    save(options.markDirty !== false);
    renderAll();
    return model.hasWorkspaces(data) ? data.turbineWorkspaces.reduce((count, entry) => count + entry.database.items.length, 0) : (Array.isArray(data) ? data.length : data.items.length);
  };
  function mergeImport(local, incoming) {
    const mergeById = (a, b) => [...new Map([...a, ...b].map(value => [value.id, value])).values()];
    return singleCanonical({ ...local, categories: uniqueCategories([...local.categories, ...incoming.categories]), folders: mergeById(local.folders, incoming.folders), items: mergeById(local.items, incoming.items) });
  }
  function backupFullDatabase(payload, source) {
    // Use the cache rather than localStorage, which can be too small for multiple libraries.
    const request = indexedDB.open('cfxpost_library_cache_v2', 1);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ payload, source, savedAt: now() }, 'turbine-before-import');
      tx.oncomplete = tx.onerror = () => db.close();
    };
  }

  function renderWorkspaceUi() {
    const name = $('#currentTurbineWorkspaceName'); if (!name) return;
    name.textContent = active()?.name || '正在读取…';
    $('#backToTurbineHomeBtn').disabled = !ready || switching;
    renderHome();
  }
  function setHome(open, focus = true) {
    homeOpen = open;
    document.body.classList.toggle('turbine-hub-open', open);
    const app = $('.app');
    app.inert = open;
    if (open) app.setAttribute('aria-hidden', 'true'); else app.removeAttribute('aria-hidden');
    $('#turbineWorkspaceHome').hidden = !open;
    document.documentElement.scrollTop = 0; document.body.scrollTop = 0;
    const url = new URL(location.href);
    if (open) url.searchParams.delete('view'); else url.searchParams.set('view', 'library');
    history.replaceState(null, '', url);
    if (focus) (open ? $('#turbineHubTitle') : $('#backToTurbineHomeBtn')).focus();
  }
  async function returnHome() {
    if (!ready || switching || homeOpen) return;
    if (state.fileStorage.busy || state.attachmentStorage?.busy) { toast('请等待当前文件读写完成'); return; }
    switching = true; renderWorkspaceUi();
    try {
      if (!await settleEditor()) return;
      await flushBeforeSwitch();
      homeQuery = ''; $('#turbineHubSearch').value = '';
      setHome(true); renderHome();
    } catch (error) { toast(`返回失败：${error.message}`); }
    finally { switching = false; renderWorkspaceUi(); }
  }
  async function openWorkspaceCard(id) {
    if (!await changeWorkspace(id)) return;
    lastEnteredId = context.id;
    try { localStorage.setItem('cfxpost_last_entered_library_v1', lastEnteredId); } catch (_) {}
    setHome(false);
    await window.CfxLibraryDrafts?.restore();
  }
  const archiveIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>';
  function renderHome() {
    const grid = $('#turbineWorkspaceCards'); if (!grid) return;
    const all = registry?.turbineWorkspaces || [];
    const units = all.filter(value => value.name.toLocaleLowerCase().includes(homeQuery.toLocaleLowerCase()));
    const summary = $('#turbineHubSummary');
    summary.textContent = ready ? `${all.length} 个资料库 · ${all.reduce((total, value) => total + value.database.items.length, 0)} 条资料` : '正在读取资料库…';
    ['#newTurbineHomeBtn', '#exportTurbineHomeBtn', '#syncTurbineHomeBtn'].forEach(id => { $(id).disabled = !ready || switching; });
    grid.innerHTML = units.map(value => {
      const database = value.database, count = database.items.length, recent = value.id === lastEnteredId;
      return `<article class="turbine-library-card"><button type="button" class="turbine-card-enter" data-enter-turbine="${esc(value.id)}" aria-label="进入 ${esc(value.name)} 资料库" ${!ready || switching ? 'disabled' : ''}><span class="turbine-card-icon">${archiveIcon}</span><span class="turbine-card-heading"><span class="turbine-card-name" title="${esc(value.name)}">${esc(value.name)}</span>${recent ? '<span class="turbine-card-recent">最近使用</span>' : ''}</span><span class="turbine-card-description">${count ? '公式与命令资料库' : '尚未添加资料'}</span><span class="turbine-card-stats"><span><b>${count}</b> 条资料</span><span><b>${database.folders.length}</b> 个文件夹</span></span><span class="turbine-card-footer">进入资料库 <span aria-hidden="true">→</span></span></button><button type="button" class="turbine-card-rename" data-rename-turbine="${esc(value.id)}" aria-label="重命名 ${esc(value.name)} 资料库" ${!ready || switching ? 'disabled' : ''}>改名</button></article>`;
    }).join('');
    if (homeQuery && !units.length) grid.innerHTML = '<p class="turbine-hub-empty" role="status">没有找到匹配的资料库</p>';
    if (!homeQuery) grid.insertAdjacentHTML('beforeend', `<button type="button" class="turbine-card-add" id="addTurbineCardBtn" ${!ready || switching ? 'disabled' : ''}><span class="turbine-card-add-icon" aria-hidden="true">＋</span><b>新建资料库</b><span>自定义名称，独立保存资料</span></button>`);
  }
  function finishModal(value) {
    const resolve = modalResolve; modalResolve = null;
    $('#turbineWorkspaceModal').classList.remove('show');
    modalFocus?.focus(); resolve?.(value);
  }
  function question(title, message, actions, inputValue) {
    if (modalResolve) finishModal('cancel');
    modalFocus = document.activeElement;
    const modal = $('#turbineWorkspaceModal');
    $('#turbineWorkspaceModalTitle').textContent = title;
    $('#turbineWorkspaceMessage').textContent = message;
    const field = $('#turbineWorkspaceNameField'), input = $('#turbineWorkspaceName');
    field.hidden = inputValue === undefined; input.value = inputValue || '';
    $('#turbineWorkspaceError').textContent = '';
    const footer = $('#turbineWorkspaceModalActions'); footer.replaceChildren();
    actions.forEach(action => {
      const button = document.createElement('button'); button.type = 'button'; button.className = `btn${action.primary ? ' primary' : ''}`;
      button.textContent = action.text;
      button.addEventListener('click', () => {
        if (action.value === 'submit') {
          const name = model.cleanName(input.value);
          if (!name) { $('#turbineWorkspaceError').textContent = '请填写机组名称'; input.focus(); return; }
          const renameId = modal.dataset.renameId;
          if (registry.turbineWorkspaces.some(value => value.id !== renameId && value.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
            $('#turbineWorkspaceError').textContent = '已有同名机组，请使用其他名称'; input.focus(); return;
          }
          finishModal({ name });
        } else finishModal(action.value);
      });
      footer.appendChild(button);
    });
    modal.classList.add('show');
    (inputValue === undefined ? footer.querySelector('button') : input).focus(); input.select();
    return new Promise(resolve => { modalResolve = resolve; });
  }
  async function editName(rename, targetId = context.id) {
    if (!ready || switching) return;
    const target = registry.turbineWorkspaces.find(value => value.id === targetId);
    if (rename && !target) return;
    $('#turbineWorkspaceModal').dataset.renameId = rename ? targetId : '';
    const answer = await question(rename ? '重命名资料库' : '新建资料库', rename ? '只修改名称，已有资料和同步关联不变。' : '新资料库独立保存，不影响已有内容。', [
      { value: 'cancel', text: '取消' }, { value: 'submit', text: rename ? '保存名称' : (homeOpen ? '创建资料库' : '创建并进入'), primary: true },
    ], rename ? target.name : '');
    if (answer === 'cancel') return;
    const { name } = answer;
    if (rename) {
      captureActive(); const entry = registry.turbineWorkspaces.find(value => value.id === targetId);
      if (!entry) { toast('该资料库已发生变化，请重新选择'); return; }
      entry.name = name; entry.updatedAt = now(); storeNames(); save(); await window.CfxCacheDiagnostics.forcePersist(); renderAll(); toast('资料库名称已修改');
    }
    else await changeWorkspace(`turbine-${crypto.randomUUID()}`, { id: '', name, createdAt: now(), updatedAt: now(), database: singleCanonical({ items: [], folders: [], categories: ['未分类'], defaultCategory: '未分类' }) });
  }
  function installUi() {
    const panel = document.createElement('section'); panel.className = 'turbine-workspace-panel'; panel.setAttribute('aria-label', '机组存储');
    panel.innerHTML = `<button type="button" class="btn turbine-home-back" id="backToTurbineHomeBtn">← 返回资料库首页</button><div class="turbine-workspace-label">当前资料库</div><div class="turbine-current-name" id="currentTurbineWorkspaceName">正在读取…</div>`;
    $('.brand').insertAdjacentElement('afterend', panel);
    document.body.insertAdjacentHTML('beforeend', `<main class="turbine-hub" id="turbineWorkspaceHome" aria-labelledby="turbineHubTitle"><div class="turbine-hub-content"><header class="turbine-hub-header"><div><p class="turbine-hub-eyebrow">公式与命令库</p><h1 id="turbineHubTitle" tabindex="-1">机组资料库</h1><p class="turbine-hub-intro">选择一个资料库，管理对应机组的公式、命令与参考资料。</p></div><div class="turbine-hub-actions"><button type="button" class="btn" id="exportTurbineHomeBtn">备份全部</button><button type="button" class="btn" id="syncTurbineHomeBtn">GitHub 同步</button><button type="button" class="btn primary" id="newTurbineHomeBtn">＋ 新建资料库</button></div></header><div class="turbine-hub-toolbar"><p id="turbineHubSummary" role="status">正在读取资料库…</p><label class="turbine-hub-search"><span aria-hidden="true">⌕</span><input type="search" id="turbineHubSearch" aria-label="查找资料库" placeholder="查找资料库名称"></label></div><section class="turbine-hub-grid" id="turbineWorkspaceCards" aria-label="机组资料库卡片"></section></div></main>`);
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-wrap" id="turbineWorkspaceModal" role="dialog" aria-modal="true" aria-labelledby="turbineWorkspaceModalTitle"><div class="modal small"><div class="modal-head"><h3 id="turbineWorkspaceModalTitle"></h3><button class="btn icon-btn small" id="closeTurbineWorkspaceModal" type="button" aria-label="关闭">×</button></div><div class="modal-body"><p id="turbineWorkspaceMessage"></p><div class="field" id="turbineWorkspaceNameField"><label for="turbineWorkspaceName">机组名称</label><input id="turbineWorkspaceName" maxlength="40" placeholder="例如 YX、ZL"></div><div id="turbineWorkspaceError" role="alert"></div></div><div class="modal-foot" id="turbineWorkspaceModalActions"></div></div></div>`);
    $('#backToTurbineHomeBtn').addEventListener('click', returnHome);
    $('#newTurbineHomeBtn').addEventListener('click', () => editName(false));
    $('#syncTurbineHomeBtn').addEventListener('click', () => $('#githubSyncBtn').click());
    $('#exportTurbineHomeBtn').addEventListener('click', () => $('#exportJsonBtn').click());
    $('#turbineHubSearch').addEventListener('input', event => { homeQuery = event.target.value.trim(); renderHome(); });
    $('#turbineWorkspaceCards').addEventListener('click', event => {
      const entry = event.target.closest('[data-enter-turbine]'), rename = event.target.closest('[data-rename-turbine]');
      if (entry) openWorkspaceCard(entry.dataset.enterTurbine);
      else if (rename) editName(true, rename.dataset.renameTurbine);
      else if (event.target.closest('#addTurbineCardBtn')) editName(false);
    });
    $('#closeTurbineWorkspaceModal').addEventListener('click', () => finishModal('cancel'));
    $('#turbineWorkspaceModal').addEventListener('click', event => { if (event.target.id === 'turbineWorkspaceModal') finishModal('cancel'); });
    $('#turbineWorkspaceName').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('#turbineWorkspaceModalActions .primary')?.click(); } });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && modalResolve) { event.stopImmediatePropagation(); finishModal('cancel'); } }, true);
    document.addEventListener('keydown', event => {
      if (!homeOpen || !(event.ctrlKey || event.metaKey) || !['k', 'n', 's'].includes(event.key.toLowerCase())) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key.toLowerCase() === 'k') $('#turbineHubSearch').focus();
      if (event.key.toLowerCase() === 'n' && !$('.modal-wrap.show')) editName(false);
    }, true);
    window.addEventListener('message', event => {
      if (event.origin === location.origin && event.source === window.parent && event.data?.type === 'cfx-turbine-home') returnHome();
    });
    setHome(homeOpen, false);
    renderWorkspaceUi();
    $('#exportJsonBtn').textContent = '下载完整 JSON（全部机组）';
  }
  window.CfxTurbineWorkspaces = {
    install,
    mergePreferLocal: (b, l, r, preferFn) => {
      const result = model.merge(b, l, r, mergeOptions(preferFn));
      if (!result.merged) throw new Error('无法合并机组存储');
      return result.merged;
    },
    // Diagnostics exclude credentials and local file handles.
    getSnapshot: () => model.copy(makeDatabasePayload()),
    getActiveId: () => context.id,
    isHome: () => homeOpen,
  };
  installUi();
})();
