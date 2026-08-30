'use strict';
(() => {
  const HIERARCHY_VERSION = '1.14.0';
  const FOLDER_COLLAPSE_PREFIX = 'folder:';

  function normalizeParentId(value, id = '') {
    const parentId = value ? String(value) : '';
    return parentId && parentId !== id ? parentId : '';
  }

  const previousNormalizeFolder = normalizeFolder;
  normalizeFolder = function (folder) {
    const normalized = previousNormalizeFolder(folder || {});
    return { ...normalized, parentId: normalizeParentId(folder?.parentId, normalized.id) };
  };

  function folderChildren(parentId, category = '', folders = state.folders) {
    return folders
      .filter(folder => (folder.parentId || '') === (parentId || '') && (!category || folder.category === category))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
  }

  function descendantFolderIds(folderId, folders = state.folders) {
    const result = new Set();
    const stack = [folderId];
    while (stack.length) {
      const current = stack.pop();
      folderChildren(current, '', folders).forEach(child => {
        if (result.has(child.id) || child.id === folderId) return;
        result.add(child.id);
        stack.push(child.id);
      });
    }
    return result;
  }

  function folderScopeIds(folderId) {
    return new Set([folderId, ...descendantFolderIds(folderId)]);
  }

  function directFolderItems(folderId) {
    return state.items.filter(item => item.folderId === folderId);
  }

  folderItems = function (folderId) {
    const ids = folderScopeIds(folderId);
    return state.items
      .filter(item => ids.has(item.folderId))
      .sort((a, b) => (Number(a.exportOrder) || 100) - (Number(b.exportOrder) || 100) || new Date(a.createdAt) - new Date(b.createdAt));
  };

  function folderPath(folder, folders = state.folders) {
    if (!folder) return [];
    const byId = new Map(folders.map(item => [item.id, item]));
    const path = [];
    const seen = new Set();
    let current = folder;
    while (current && !seen.has(current.id)) {
      path.unshift(current);
      seen.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : null;
    }
    return path;
  }

  function folderPathLabel(folder) {
    return folderPath(folder).map(item => item.name).join(' / ');
  }

  function flattenFolderTree(category, folders = state.folders) {
    const rows = [];
    const visit = (folder, depth) => {
      rows.push({ folder, depth });
      folderChildren(folder.id, category, folders).forEach(child => visit(child, depth + 1));
    };
    folderChildren('', category, folders).forEach(folder => visit(folder, 0));
    return rows;
  }

  function folderOptionLabel(folder, depth) {
    const path = folderPathLabel(folder);
    return depth ? `${'　'.repeat(depth)}↳ ${path}` : path;
  }

  function repairFolderHierarchy(folders = state.folders) {
    const byId = new Map(folders.map(folder => [folder.id, folder]));
    let changed = false;
    folders.forEach(folder => {
      const parent = byId.get(folder.parentId);
      if (folder.parentId && (!parent || parent.id === folder.id || parent.category !== folder.category)) {
        folder.parentId = '';
        changed = true;
      }
    });
    folders.forEach(folder => {
      const seen = new Set([folder.id]);
      let current = folder;
      while (current.parentId) {
        if (seen.has(current.parentId)) {
          folder.parentId = '';
          changed = true;
          break;
        }
        seen.add(current.parentId);
        current = byId.get(current.parentId);
        if (!current) break;
      }
    });
    return changed;
  }

  const previousLoad = load;
  load = async function () {
    await previousLoad();
    if (repairFolderHierarchy()) save(false);
  };

  function folderCollapseKey(folderId) {
    return `${FOLDER_COLLAPSE_PREFIX}${folderId}`;
  }

  function renderFolderNode(folder, category) {
    const children = folderChildren(folder.id, category);
    const collapsed = children.length && state.collapsedCategories.has(folderCollapseKey(folder.id));
    const count = folderItems(folder.id).length;
    const toggle = children.length
      ? `<button class="folder-branch-toggle" data-toggle-folder="${esc(folder.id)}" aria-expanded="${collapsed ? 'false' : 'true'}" title="${collapsed ? '展开' : '折叠'}子文件夹">${collapsed ? '▶' : '▼'}</button>`
      : '<span class="folder-branch-spacer" aria-hidden="true"></span>';
    const childHtml = children.length
      ? `<div class="folder-children${collapsed ? ' collapsed' : ''}">${children.map(child => renderFolderNode(child, category)).join('')}</div>`
      : '';
    return `<div class="folder-item folder-tree-node" data-folder-node="${esc(folder.id)}"><div class="folder-row">${toggle}<button data-folder="${esc(folder.id)}" data-folder-cat="${esc(category)}" class="folder-main ${state.filterFolderId === folder.id ? 'active' : ''}" title="${esc(folderPathLabel(folder))}"><span>📁 ${esc(folder.name)}</span><span class="count">${count}</span></button><button class="folder-new-child" data-new-child="${esc(folder.id)}" title="在此文件夹中建立子文件夹" aria-label="在 ${esc(folder.name)} 中建立子文件夹">＋</button><button class="folder-manage" data-manage-folder="${esc(folder.id)}" title="管理、复制或导出文件夹">⋯</button></div>${childHtml}</div>`;
  }

  renderNav = function () {
    const cats = categories();
    els.nav.innerHTML = cats.map(cat => {
      const count = cat === '全部条目' ? state.items.length : cat === '收藏夹' ? state.items.filter(item => item.favorite).length : state.items.filter(item => item.category === cat).length;
      const system = CATEGORY_FIX_SYSTEM.includes(cat);
      const roots = !system ? folderChildren('', cat) : [];
      const ungrouped = !system ? state.items.filter(item => item.category === cat && !item.folderId).length : 0;
      const hasFolderRows = !system && (roots.length > 0 || ungrouped > 0);
      const collapsed = hasFolderRows && state.collapsedCategories.has(cat);
      const tree = roots.map(folder => renderFolderNode(folder, cat)).join('');
      const ungroupedHtml = ungrouped ? `<div class="folder-item system folder-tree-node"><div class="folder-row ungrouped-row"><span class="folder-branch-spacer"></span><button data-folder="__ungrouped__" data-folder-cat="${esc(cat)}" class="folder-main ${state.filterFolderId === '__ungrouped__' && state.filterCategory === cat ? 'active' : ''}"><span>未分组</span><span class="count">${ungrouped}</span></button><span></span><button class="folder-manage" data-manage-ungrouped="${esc(cat)}" title="将未分组条目整理为正式文件夹">⋯</button></div></div>` : '';
      const folderHtml = hasFolderRows ? `<div class="folder-list ${collapsed ? 'collapsed' : ''}">${tree}${ungroupedHtml}</div>` : '';
      const toggle = hasFolderRows ? `<button class="folder-toggle" data-toggle-cat="${esc(cat)}" aria-expanded="${collapsed ? 'false' : 'true'}" title="${collapsed ? '展开' : '折叠'}文件夹">${collapsed ? '▶' : '▼'}</button>` : '';
      return `<div class="category-block"><div class="nav-item ${system ? 'system' : ''} ${hasFolderRows ? 'has-folders' : ''}">${toggle}<button data-cat="${esc(cat)}" class="nav-main ${state.filterCategory === cat && !state.filterFolderId ? 'active' : ''}"><span>${cat === '收藏夹' ? '☆ ' : ''}${esc(cat)}</span><span class="count">${count}</span></button>${system ? '' : `<button class="nav-manage" data-manage-cat="${esc(cat)}" title="重命名或删除分类">⋯</button>`}</div>${folderHtml}</div>`;
    }).join('');
    $('#categoryList').innerHTML = categories().filter(cat => !CATEGORY_FIX_SYSTEM.includes(cat)).map(cat => `<option value="${esc(cat)}"></option>`).join('');
    refreshFolderSelect($('#itemCategory')?.value || currentDefaultCategory(), $('#itemFolder')?.value || '');
  };

  filteredItems = function () {
    let items = state.items.slice();
    if (state.filterCategory === '收藏夹') items = items.filter(item => item.favorite);
    else if (state.filterCategory !== '全部条目') items = items.filter(item => item.category === state.filterCategory);
    if (state.filterFolderId === '__ungrouped__') items = items.filter(item => !item.folderId);
    else if (state.filterFolderId) {
      const ids = folderScopeIds(state.filterFolderId);
      items = items.filter(item => ids.has(item.folderId));
    }
    if (state.filterType !== 'all') items = items.filter(item => item.type === state.filterType);
    if (state.favoritesOnly) items = items.filter(item => item.favorite);
    const query = state.search.trim().toLowerCase();
    if (query) items = items.filter(item => {
      const folder = folderById(item.folderId);
      return [item.title, item.category, folderPathLabel(folder), item.description, item.exprName, item.exprBody, item.cclCode, item.compositeCode, item.version, item.dependencies, item.notes, ...item.tags, ...(item.attachments || []).map(file => file.name)].join('\n').toLowerCase().includes(query);
    });
    items.sort((a, b) => state.sort === 'title' ? a.title.localeCompare(b.title, 'zh-CN') : state.sort === 'created' ? new Date(b.createdAt) - new Date(a.createdAt) : state.sort === 'used' ? (b.usageCount - a.usageCount) || new Date(b.updatedAt) - new Date(a.updatedAt) : new Date(b.updatedAt) - new Date(a.updatedAt));
    return items;
  };

  refreshFolderSelect = function (category, selected = '') {
    const element = $('#itemFolder');
    if (!element) return;
    const rows = flattenFolderTree(cleanCategoryName(category) || currentDefaultCategory());
    element.innerHTML = '<option value="">未分组</option>' + rows.map(({ folder, depth }) => `<option value="${esc(folder.id)}">${esc(folderOptionLabel(folder, depth))}</option>`).join('');
    element.value = rows.some(row => row.folder.id === selected) ? selected : '';
  };

  function ensureParentField() {
    if ($('#folderParentSelect')) return;
    const categoryField = $('#folderCategorySelect')?.closest('.field');
    if (!categoryField) return;
    const field = document.createElement('div');
    field.className = 'field folder-parent-field';
    field.id = 'folderParentField';
    field.innerHTML = '<label>上级文件夹</label><select id="folderParentSelect"><option value="">分类根目录</option></select><div class="hint">选择现有文件夹即可建立子文件夹；不能移动到自身或自己的下级中。</div>';
    categoryField.insertAdjacentElement('afterend', field);
  }

  function refreshParentSelect(category, selected = '', editingId = '') {
    ensureParentField();
    const element = $('#folderParentSelect');
    if (!element) return;
    const excluded = editingId ? new Set([editingId, ...descendantFolderIds(editingId)]) : new Set();
    const rows = flattenFolderTree(category).filter(row => !excluded.has(row.folder.id));
    element.innerHTML = '<option value="">分类根目录</option>' + rows.map(({ folder, depth }) => `<option value="${esc(folder.id)}">${esc(folderOptionLabel(folder, depth))}</option>`).join('');
    element.value = rows.some(row => row.folder.id === selected) ? selected : '';
  }

  openFolderManager = function (folderId = null, category = null, requestedParentId = null) {
    ensureParentField();
    const isUngrouped = folderId === '__ungrouped__';
    state.editingFolderId = folderId;
    state.editingUngroupedCategory = isUngrouped ? cleanCategoryName(category || state.filterCategory) : null;
    const folder = isUngrouped ? null : folderById(folderId);
    const isNew = !folder && !isUngrouped;
    const selectedFolder = folderById(state.filterFolderId);
    const inferredParent = isNew ? (requestedParentId || (selectedFolder && (!category || selectedFolder.category === category) ? selectedFolder.id : '')) : (folder?.parentId || '');
    const opts = ordinaryCategories();
    const preferred = isUngrouped ? state.editingUngroupedCategory : (folder?.category || folderById(inferredParent)?.category || (!CATEGORY_FIX_SYSTEM.includes(category || state.filterCategory) ? (category || state.filterCategory) : currentDefaultCategory()));
    const selectedCategory = opts.includes(preferred) ? preferred : (opts[0] || currentDefaultCategory());
    $('#folderCategorySelect').innerHTML = opts.map(cat => `<option value="${esc(cat)}">${esc(cat)}</option>`).join('');
    $('#folderCategorySelect').value = selectedCategory;
    refreshParentSelect(selectedCategory, inferredParent, folder?.id || '');
    const parent = folderById(inferredParent);
    $('#folderModalTitle').textContent = isUngrouped ? `整理未分组条目 · ${state.editingUngroupedCategory}` : isNew ? (parent ? `新建子文件夹 · ${parent.name}` : '新建文件夹') : `管理文件夹 · ${folder.name}`;
    $('#folderNameInput').value = folder?.name || '';
    $('#folderNameInput').placeholder = isUngrouped ? '输入正式文件夹名称，例如：进口流量公式' : '文件夹名称';
    $('#folderModalHint').textContent = folder && parent
      ? `当前位于“${folderPathLabel(parent)}”中；可在上方修改所属层级。`
      : parent
        ? `将创建在“${folderPathLabel(parent)}”中。保存后仍可修改上级文件夹。`
        : '文件夹可建立多级子目录；目录箭头用于展开或折叠。';
    const copyHint = $('#folderCopyArea .hint');
    if (copyHint) copyHint.textContent = '复制文件夹会完整复制其下级目录和全部条目；也可同时替换标题、标签、表达式与 CCL 中的字符。';
    const deleteHint = $('#folderDeleteHint');
    if (deleteHint && folder) {
      const target = folder.parentId ? `上级文件夹“${folderPathLabel(folderById(folder.parentId))}”` : '当前分类的“未分组”';
      deleteHint.textContent = `删除只移除这个目录：直属条目会移到${target}，直属子文件夹会提升一级，条目和下级内容都不会被删除。`;
    }
    $('#folderBatchArea').classList.toggle('hidden', !isNew);
    $('#folderCopyArea').classList.toggle('hidden', isNew || isUngrouped);
    $('#folderCopyName').value = folder ? `${folder.name} - 副本` : '';
    $('#folderReplaceFrom').value = folder?.name || '';
    $('#folderReplaceTo').value = '';
    $('#deleteFolderBtn').style.display = isNew || isUngrouped ? 'none' : 'inline-flex';
    $('#duplicateFolderBtn').style.display = isNew || isUngrouped ? 'none' : 'inline-flex';
    $('#copyFolderModalBtn').style.display = isNew || isUngrouped ? 'none' : 'inline-flex';
    $('#exportFolderModalBtn').style.display = isNew || isUngrouped ? 'none' : 'inline-flex';
    $('#saveFolderBtn').textContent = isUngrouped ? '整理为正式文件夹' : isNew ? (parent ? '创建子文件夹' : '创建文件夹') : '保存文件夹';
    updateBatchFolderPreview();
    openModal('folderModal');
    setTimeout(() => $('#folderNameInput').focus(), 80);
  };

  function siblingNameExists(category, parentId, name, exceptId = '') {
    return state.folders.some(folder => folder.category === category && (folder.parentId || '') === (parentId || '') && folder.name === name && folder.id !== exceptId);
  }

  saveFolderEdit = function () {
    const isUngrouped = state.editingFolderId === '__ungrouped__';
    const old = isUngrouped ? null : folderById(state.editingFolderId);
    const name = cleanFolderName($('#folderNameInput').value);
    const category = cleanCategoryName($('#folderCategorySelect').value);
    const parentId = $('#folderParentSelect')?.value || '';
    if (!name) { toast(isUngrouped ? '请填写整理后的文件夹名称' : '文件夹名称不能为空'); return; }
    if (!category) { toast('请选择所属分类'); return; }
    if (name === '未分组') { toast('“未分组”是系统临时分组，请使用其他正式文件夹名称'); return; }
    const parent = folderById(parentId);
    if (parentId && (!parent || parent.category !== category)) { toast('上级文件夹必须位于同一分类'); return; }
    if (old && (parentId === old.id || descendantFolderIds(old.id).has(parentId))) { toast('不能把文件夹移动到自身或自己的下级中'); return; }
    if (siblingNameExists(category, parentId, name, old?.id || '')) { toast('同一上级目录中已存在同名文件夹'); return; }
    ensureCategory(category);
    let savedFolder;
    if (isUngrouped) {
      const sourceCategory = state.editingUngroupedCategory;
      const items = state.items.filter(item => item.category === sourceCategory && !item.folderId);
      if (!items.length) { toast('当前没有可整理的未分组条目'); closeModal('folderModal'); renderAll(); return; }
      savedFolder = normalizeFolder({ name, category, parentId });
      state.folders.push(savedFolder);
      items.forEach(item => { item.category = category; item.folderId = savedFolder.id; item.updatedAt = now(); });
    } else if (old) {
      const movedIds = folderScopeIds(old.id);
      old.name = name;
      old.category = category;
      old.parentId = parentId;
      old.updatedAt = now();
      state.folders.forEach(folder => { if (movedIds.has(folder.id)) folder.category = category; });
      state.items.forEach(item => { if (movedIds.has(item.folderId)) { item.category = category; item.updatedAt = now(); } });
      savedFolder = old;
    } else {
      savedFolder = normalizeFolder({ name, category, parentId });
      state.folders.push(savedFolder);
    }
    state.collapsedCategories.delete(category);
    if (parentId) state.collapsedCategories.delete(folderCollapseKey(parentId));
    saveCollapsed();
    save();
    closeModal('folderModal');
    state.filterCategory = category;
    state.filterFolderId = savedFolder.id;
    renderAll();
    toast(old ? '文件夹层级已更新' : parentId ? '子文件夹已创建' : '文件夹已创建');
  };

  deleteFolder = function () {
    const folder = folderById(state.editingFolderId);
    if (!folder) return;
    const directItems = directFolderItems(folder.id);
    const children = folderChildren(folder.id, folder.category);
    if (!confirm(`确定删除文件夹“${folder.name}”？\n${directItems.length} 个直属条目将移到上一级，${children.length} 个直属子文件夹将提升一级；不会删除任何公式。`)) return;
    directItems.forEach(item => { item.folderId = folder.parentId || ''; item.updatedAt = now(); });
    children.forEach(child => { child.parentId = folder.parentId || ''; child.updatedAt = now(); });
    state.folders = state.folders.filter(item => item.id !== folder.id);
    state.collapsedCategories.delete(folderCollapseKey(folder.id));
    if (state.filterFolderId === folder.id) state.filterFolderId = folder.parentId || '';
    saveCollapsed();
    save();
    closeModal('folderModal');
    renderAll();
    toast('文件夹已删除，条目和子文件夹已保留');
  };

  duplicateFolder = function () {
    const sourceRoot = folderById(state.editingFolderId);
    if (!sourceRoot) return;
    const newName = cleanFolderName($('#folderCopyName').value);
    const from = $('#folderReplaceFrom').value;
    const to = $('#folderReplaceTo').value;
    if (!newName) { toast('请填写新文件夹名称'); return; }
    if (siblingNameExists(sourceRoot.category, sourceRoot.parentId || '', newName)) { toast('同一上级目录中已有该文件夹名称'); return; }
    const sourceIds = [sourceRoot.id, ...descendantFolderIds(sourceRoot.id)];
    const sourceFolders = sourceIds.map(id => folderById(id)).filter(Boolean).sort((a, b) => folderPath(a).length - folderPath(b).length);
    const idMap = new Map();
    sourceFolders.forEach(source => {
      const copy = normalizeFolder({
        name: source.id === sourceRoot.id ? newName : source.name,
        category: sourceRoot.category,
        parentId: source.id === sourceRoot.id ? (sourceRoot.parentId || '') : idMap.get(source.parentId) || ''
      });
      idMap.set(source.id, copy.id);
      state.folders.push(copy);
    });
    let itemCount = 0;
    sourceFolders.forEach(source => {
      directFolderItems(source.id).forEach(item => {
        const copySource = from && to ? replaceDeep(item, from, to) : clone(item);
        const copy = normalizeItem(copySource);
        copy.id = uid();
        copy.folderId = idMap.get(source.id);
        copy.category = sourceRoot.category;
        copy.createdAt = copy.updatedAt = now();
        state.items.push(copy);
        itemCount++;
      });
    });
    const newRootId = idMap.get(sourceRoot.id);
    save();
    closeModal('folderModal');
    state.filterCategory = sourceRoot.category;
    state.filterFolderId = newRootId;
    renderAll();
    toast(`已复制 ${sourceFolders.length} 个文件夹和 ${itemCount} 个条目`);
  };

  createFoldersByNames = function (names) {
    const category = cleanCategoryName($('#folderCategorySelect').value) || currentDefaultCategory();
    const parentId = $('#folderParentSelect')?.value || '';
    const parent = folderById(parentId);
    if (parentId && (!parent || parent.category !== category)) { toast('上级文件夹必须位于同一分类'); return; }
    ensureCategory(category);
    const unique = [...new Set(names.map(cleanFolderName).filter(Boolean))];
    if (!unique.length) { toast('没有可创建的文件夹名称'); return; }
    const existing = new Set(state.folders.filter(folder => folder.category === category && (folder.parentId || '') === parentId).map(folder => folder.name));
    let created = 0;
    let skipped = 0;
    unique.forEach(name => {
      if (existing.has(name)) { skipped++; return; }
      state.folders.push(normalizeFolder({ name, category, parentId }));
      existing.add(name);
      created++;
    });
    if (!created) { toast(`没有创建文件夹；${skipped} 个名称已存在`); return; }
    state.collapsedCategories.delete(category);
    if (parentId) state.collapsedCategories.delete(folderCollapseKey(parentId));
    saveCollapsed();
    save();
    closeModal('folderModal');
    state.filterCategory = category;
    state.filterFolderId = parentId || '';
    renderAll();
    toast(`已创建 ${created} 个${parentId ? '子' : ''}文件夹${skipped ? `，跳过 ${skipped} 个重复名称` : ''}`);
  };

  const previousApplyIncomingDatabase = applyIncomingDatabase;
  applyIncomingDatabase = function (data, mode, source = '外部数据库', options = {}) {
    const count = previousApplyIncomingDatabase(data, mode, source, options);
    if (repairFolderHierarchy()) {
      save(options.markDirty !== false);
      renderAll();
    }
    return count;
  };

  const previousRenderAll = renderAll;
  renderAll = function () {
    previousRenderAll();
    const folder = folderById(state.filterFolderId);
    if (folder) {
      const path = folderPathLabel(folder);
      els.viewTitle.textContent = path;
      els.viewSubtitle.textContent = `当前目录及其全部子文件夹共 ${filteredItems().length} 项；整组导出会包含下级目录中的条目。`;
    }
  };

  ensureParentField();
  $('#folderCategorySelect')?.addEventListener('change', event => {
    const old = folderById(state.editingFolderId);
    refreshParentSelect(cleanCategoryName(event.target.value), '', old?.id || '');
  });
  els.nav.addEventListener('click', event => {
    const toggle = event.target.closest('button[data-toggle-folder]');
    if (toggle) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const key = folderCollapseKey(toggle.dataset.toggleFolder);
      if (state.collapsedCategories.has(key)) state.collapsedCategories.delete(key);
      else state.collapsedCategories.add(key);
      saveCollapsed();
      renderNav();
      return;
    }
    const add = event.target.closest('button[data-new-child]');
    if (add) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const parent = folderById(add.dataset.newChild);
      if (parent) openFolderManager(null, parent.category, parent.id);
    }
  }, true);

  function runHierarchySelfTests() {
    const sample = [
      { id: 'root', name: '公式', category: '测试', parentId: '' },
      { id: 'child', name: '损失', category: '测试', parentId: 'root' },
      { id: 'grandchild', name: '局部损失', category: '测试', parentId: 'child' },
      { id: 'other', name: '流量', category: '测试', parentId: 'root' }
    ];
    const descendants = descendantFolderIds('root', sample);
    const flat = flattenFolderTree('测试', sample);
    const depths = new Map(flat.map(row => [row.folder.id, row.depth]));
    const tests = {
      nestedDescendants: descendants.size === 3 && descendants.has('grandchild'),
      depthStructure: flat[0]?.folder.id === 'root' && depths.get('root') === 0 && depths.get('child') === 1 && depths.get('other') === 1 && depths.get('grandchild') === 2,
      path: folderPath(sample[2], sample).map(item => item.name).join('/') === '公式/损失/局部损失',
      moveGuardSet: new Set(['child', ...descendantFolderIds('child', sample)]).has('grandchild')
    };
    if (Object.values(tests).some(value => !value)) throw new Error(`子文件夹自检失败：${JSON.stringify(tests)}`);
    return { version: HIERARCHY_VERSION, passed: Object.keys(tests).length, tests };
  }

  window.CfxFolderHierarchyDiagnostics = {
    version: HIERARCHY_VERSION,
    runSelfTests: runHierarchySelfTests,
    folderPath: id => folderPathLabel(folderById(id)),
    descendants: id => [...descendantFolderIds(id)]
  };

  try {
    console.info('[CFX Folder Hierarchy]', runHierarchySelfTests());
  } catch (error) {
    console.error(error);
  }
})();
