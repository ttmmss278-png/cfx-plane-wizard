'use strict';
(() => {
  const model = CfxTurbineWorkspaceModel, context = CfxTurbineContext;
  const originalCanonical = canonicalDatabase, originalEqual = databaseEqual;
  const originalMerge = threeWayMergeDatabases, originalInitialMerge = initialSafeMergeDatabases;
  let registry = null, ready = false, switching = false, editorBaseline = '', modalResolve = null, modalFocus = null;

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
      const answer = await question('切换机组存储', `“${active().name}”有尚未保存的编辑。`, [
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
    if (!ready || switching || (!newWorkspace && id === context.id)) return;
    if (state.github.busy || state.fileStorage.busy || state.attachmentStorage?.busy) { toast('当前正在读写或同步，请完成后再切换机组'); renderWorkspaceUi(); return; }
    switching = true; renderWorkspaceUi();
    try {
      if (!await settleEditor()) return;
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
      await window.CfxLibraryDrafts?.restore();
      toast(`已切换到 ${active().name}`);
    } catch (error) { toast(`切换失败：${error.message}`); console.error(error); }
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
    const select = $('#turbineWorkspaceSelect'); if (!select) return;
    select.innerHTML = (registry?.turbineWorkspaces || [{ id: context.id, name: '正在读取…' }]).map(value => `<option value="${esc(value.id)}">${esc(value.name)}</option>`).join('');
    select.value = context.id;
    [select, $('#addTurbineWorkspaceBtn'), $('#renameTurbineWorkspaceBtn')].forEach(control => { control.disabled = !ready || switching; });
    $('#turbineWorkspaceCount').textContent = registry ? `${registry.turbineWorkspaces.length} 个机组` : '';
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
  async function editName(rename) {
    if (!ready || switching) return;
    $('#turbineWorkspaceModal').dataset.renameId = rename ? context.id : '';
    const answer = await question(rename ? '重命名机组存储' : '新建机组存储', rename ? '只修改名称，已有资料和同步关联不变。' : '新机组使用独立的空资料库，不影响现有机组。', [
      { value: 'cancel', text: '取消' }, { value: 'submit', text: rename ? '保存名称' : '创建并进入', primary: true },
    ], rename ? active().name : '');
    if (answer === 'cancel') return;
    const { name } = answer;
    if (rename) { captureActive(); active().name = name; active().updatedAt = now(); storeNames(); save(); await window.CfxCacheDiagnostics.forcePersist(); renderAll(); toast('机组名称已修改'); }
    else await changeWorkspace(`turbine-${crypto.randomUUID()}`, { id: '', name, createdAt: now(), updatedAt: now(), database: singleCanonical({ items: [], folders: [], categories: ['未分类'], defaultCategory: '未分类' }) });
  }
  function installUi() {
    const panel = document.createElement('section'); panel.className = 'turbine-workspace-panel'; panel.setAttribute('aria-label', '机组存储');
    panel.innerHTML = `<div class="turbine-workspace-label"><label for="turbineWorkspaceSelect">机组存储</label><span id="turbineWorkspaceCount"></span></div><div class="turbine-workspace-controls"><select id="turbineWorkspaceSelect" aria-label="选择机组存储"></select><button type="button" class="btn" id="addTurbineWorkspaceBtn" title="新建机组存储" aria-label="新建机组存储">＋</button><button type="button" class="btn" id="renameTurbineWorkspaceBtn" title="重命名当前机组" aria-label="重命名当前机组">改名</button></div>`;
    $('.brand').insertAdjacentElement('afterend', panel);
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-wrap" id="turbineWorkspaceModal" role="dialog" aria-modal="true" aria-labelledby="turbineWorkspaceModalTitle"><div class="modal small"><div class="modal-head"><h3 id="turbineWorkspaceModalTitle"></h3><button class="btn icon-btn small" id="closeTurbineWorkspaceModal" type="button" aria-label="关闭">×</button></div><div class="modal-body"><p id="turbineWorkspaceMessage"></p><div class="field" id="turbineWorkspaceNameField"><label for="turbineWorkspaceName">机组名称</label><input id="turbineWorkspaceName" maxlength="40" placeholder="例如 YX、ZL"></div><div id="turbineWorkspaceError" role="alert"></div></div><div class="modal-foot" id="turbineWorkspaceModalActions"></div></div></div>`);
    $('#turbineWorkspaceSelect').addEventListener('change', event => changeWorkspace(event.target.value));
    $('#addTurbineWorkspaceBtn').addEventListener('click', () => editName(false));
    $('#renameTurbineWorkspaceBtn').addEventListener('click', () => editName(true));
    $('#closeTurbineWorkspaceModal').addEventListener('click', () => finishModal('cancel'));
    $('#turbineWorkspaceModal').addEventListener('click', event => { if (event.target.id === 'turbineWorkspaceModal') finishModal('cancel'); });
    $('#turbineWorkspaceName').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('#turbineWorkspaceModalActions .primary')?.click(); } });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && modalResolve) { event.stopImmediatePropagation(); finishModal('cancel'); } }, true);
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
  };
  installUi();
})();
