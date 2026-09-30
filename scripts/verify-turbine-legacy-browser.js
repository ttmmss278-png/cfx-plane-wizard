async (page) => {
  if (!page.url().startsWith('http://127.0.0.1:5173/')) throw new Error('Only run in the isolated localhost test profile');
  await page.evaluate(async () => {
    const fixture = { items: [{ id: 'old-id', title: '升级前资料', type: 'ccl', category: '原分类', folderId: 'old-child', cclCode: 'PLANE: PZ1\nEND' }],
      categories: ['原分类'], folders: [{ id: 'old-parent', name: '原父目录', category: '原分类' }, { id: 'old-child', name: '原子目录', parentId: 'old-parent', category: '原分类' }], defaultCategory: '原分类' };
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('cfxpost_library_cache_v2', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result, tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(fixture, 'database');
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    });
    localStorage.setItem('cfxpost_collapsed_categories_v1', JSON.stringify(['原分类']));
    localStorage.setItem('cfxpost_cst_library_v1', JSON.stringify([{ id: 'cst-original', title: '原CST资料', file: { directory: 'old-directory', storedName: 'old.cst', name: 'old.cst' } }]));
  });
  await page.goto('http://127.0.0.1:5173/#/tool/cfx-post-library');
  const frame = page.frameLocator('iframe');
  await frame.getByRole('combobox', { name: '选择机组存储' }).waitFor();
  const embedded = page.frames().find(value => value.url().includes('/modules/cfx-post-library/app.html'));
  await embedded.waitForFunction(() => !document.querySelector('#turbineWorkspaceSelect').disabled);
  const result = await embedded.evaluate(async () => {
    const payload = CfxTurbineWorkspaces.getSnapshot();
    await CfxCacheDiagnostics.forcePersist();
    const cached = await CfxCacheDiagnostics.readEnvelope();
    return { oldItems: state.items[0].title === '升级前资料', hierarchy: state.folders.find(value => value.id === 'old-child').parentId === 'old-parent',
      defaultCategory: state.defaultCategory === '原分类', originalName: payload.turbineWorkspaces[0].name === '原有机组',
      collapsed: state.collapsedCategories.has('原分类'), migratedCache: cached.payload.turbineWorkspaces.length === 1 };
  });
  if (!Object.values(result).every(Boolean)) throw new Error(JSON.stringify(result));
  await frame.getByRole('button', { name: 'CST 文件资料库', exact: true }).click();
  await frame.getByRole('heading', { name: 'CST 文件资料库 · 原有机组' }).waitFor();
  if (!await frame.getByRole('heading', { name: '原CST资料', exact: true }).isVisible()) throw new Error('Original CST was not retained');
  await frame.getByRole('button', { name: '返回公式与命令库', exact: false }).click();
  await frame.getByRole('combobox', { name: '选择机组存储' }).waitFor();
  return { passed: 7, checks: { ...result, originalCST: true } };
}
