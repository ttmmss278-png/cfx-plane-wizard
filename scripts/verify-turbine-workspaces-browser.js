// Run only in the isolated playwright-cli "turbine" profile, against localhost.
async (page) => {
  if (!page.url().startsWith('http://127.0.0.1:5173/')) throw new Error('Only run against the local test server');
  const checks = [];
  const check = (name, okay) => { if (!okay) throw new Error(name); checks.push(name); };
  await page.evaluate(() => { state.github.dirty = false; });
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#backToTurbineHomeBtn').disabled);
  const enter = async name => {
    await page.waitForFunction(() => !document.querySelector('#backToTurbineHomeBtn').disabled);
    if (!await page.evaluate(() => CfxTurbineWorkspaces.isHome())) {
      await page.getByRole('button', { name: '返回资料库首页', exact: false }).click();
    }
    await page.getByRole('button', { name: `进入 ${name} 资料库`, exact: true }).click();
    await page.waitForFunction(() => !CfxTurbineWorkspaces.isHome() && !document.querySelector('#backToTurbineHomeBtn').disabled);
  };
  const original = await page.evaluate(() => {
    const old = { defaultCategory: '自定义默认', categories: ['公式', '自定义默认'], folders: [
      { id: 'parent', name: '公式父目录', category: '公式' }, { id: 'child', name: '喷嘴', category: '公式', parentId: 'parent' },
    ], items: Array.from({ length: 183 }, (_, index) => ({ id: `fixture-${index}`, title: `YX资料${index}`, category: '公式', folderId: 'child', type: 'ccl', cclCode: `PLANE: YX${index}\nEND`, favorite: index < 2 })) };
    const data = canonicalDatabase(old); data.turbineWorkspaces[0].name = 'YX';
    data.turbineWorkspaces.push({ id: 'turbine-zl', name: 'ZL', database: canonicalDatabase({ items: [], categories: [], folders: [] }).turbineWorkspaces[0].database });
    applyIncomingDatabase(data, 'replace', 'browser test fixture');
    return old;
  });
  await enter('YX');
  check('原库的183条资料完整保留', await page.evaluate(() => state.items.length === 183 && state.folders.find(x => x.id === 'child').parentId === 'parent' && state.defaultCategory === '自定义默认'));
  await enter('ZL');
  await page.waitForFunction(() => state.items.length === 0);
  await page.getByRole('button', { name: '新建条目', exact: true }).click();
  await page.locator('#itemTitle').fill('ZL独立命令');
  await page.locator('#cclCode').fill('PLANE: ZL独立命令\nEND');
  await page.locator('#saveBtn').click();
  check('新建条目只写入ZL', await page.evaluate(() => CfxTurbineWorkspaces.getSnapshot().turbineWorkspaces.find(x => x.name === 'ZL').database.items.length === 1));
  await page.locator('#itemTitle').fill('ZL未保存编辑');
  await page.getByRole('button', { name: '返回资料库首页', exact: false }).click();
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('#backToTurbineHomeBtn').disabled);
  check('取消切换保留未提交编辑', await page.evaluate(() => CfxTurbineContext.id === 'turbine-zl' && document.querySelector('#itemTitle').value === 'ZL未保存编辑'));
  await page.getByRole('button', { name: '返回资料库首页', exact: false }).click();
  await page.getByRole('dialog').getByRole('button', { name: '保存并继续' }).click();
  await enter('YX');
  check('切回YX原资料与文件夹不变', await page.evaluate(() => state.items.length === 183 && state.folders.length === 2 && state.defaultCategory === '自定义默认'));
  await enter('ZL');
  check('保存并切换正确保存到原机组', await page.evaluate(() => state.items[0].title === 'ZL未保存编辑'));
  await page.evaluate(() => { state.github.dirty = false; });
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#backToTurbineHomeBtn').disabled);
  check('重新打开保留机组选择及资料', await page.evaluate(() => CfxTurbineContext.id === 'turbine-zl' && state.items[0].title === 'ZL未保存编辑' && CfxTurbineWorkspaces.getSnapshot().turbineWorkspaces[0].database.items.length === 183));
  await page.getByRole('button', { name: '返回资料库首页', exact: false }).click();
  await page.getByRole('button', { name: '＋ 新建资料库', exact: true }).click();
  await page.getByRole('textbox', { name: '机组名称', exact: true }).fill('YX');
  await page.getByRole('button', { name: '创建资料库', exact: true }).click();
  check('拒绝重名防止误选', await page.getByRole('alert').filter({ hasText: '已有同名机组' }).isVisible());
  await page.getByRole('textbox', { name: '机组名称', exact: true }).fill('HX');
  await page.getByRole('button', { name: '创建资料库', exact: true }).click();
  await page.getByRole('button', { name: '进入 HX 资料库', exact: true }).waitFor();
  check('添加第三机组为空库不复制原资料', await page.evaluate(() => state.items.length === 0 && CfxTurbineWorkspaces.getSnapshot().turbineWorkspaces.length === 3));
  await page.getByRole('button', { name: '重命名 HX 资料库', exact: true }).click();
  await page.getByRole('textbox', { name: '机组名称', exact: true }).fill('HX试验');
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
  await enter('HX试验');
  check('改名不改变机组标识', await page.evaluate(() => CfxTurbineWorkspaces.getSnapshot().turbineWorkspaces.length === 3));
  const integration = await page.evaluate(async () => {
    const saved = CfxTurbineWorkspaces.getSnapshot(), base = canonicalDatabase(saved);
    const local = clone(base), remote = clone(base);
    local.turbineWorkspaces[0].database.items[0].title = 'YX本地变更';
    remote.turbineWorkspaces[1].database.items[0].title = 'ZL云端变更';
    const merged = threeWayMergeDatabases(base, local, remote);
    const independent = merged.conflicts.length === 0 && merged.merged.turbineWorkspaces[0].database.items[0].title === 'YX本地变更' && merged.merged.turbineWorkspaces[1].database.items[0].title === 'ZL云端变更';
    remote.turbineWorkspaces[0].database.items[0].title = 'YX云端冲突';
    const conflict = threeWayMergeDatabases(base, local, remote).conflicts.some(value => value.name.startsWith('YX /'));
    const backup = clone(saved);
    applyIncomingDatabase({ items: [{ id: 'plain-test', title: 'HX旧备份导入', type: 'ccl', cclCode: 'PLANE: HX\nEND' }] }, 'replace', 'plain import test');
    const plainOnlyCurrent = state.items[0].title === 'HX旧备份导入' && CfxTurbineWorkspaces.getSnapshot().turbineWorkspaces[0].database.items.length === 183;
    applyIncomingDatabase(backup, 'replace', 'restore full test backup');
    await CfxCacheDiagnostics.forcePersist();
    return { independent, conflict, plainOnlyCurrent, restored: CfxTurbineWorkspaces.getSnapshot().turbineWorkspaces.length === 3 && state.items.length === 0,
      fileKey: FILE_HANDLE_KEY !== 'libraryDataFile', collapseKey: COLLAPSE_KEY !== 'cfxpost_collapsed_categories_v1' };
  });
  Object.entries(integration).forEach(([key, value]) => check(key, value));
  await page.evaluate(() => { state.github.dirty = false; });
  await page.getByRole('button', { name: 'CST 文件资料库', exact: true }).click();
  await page.waitForURL('**/cst-library/index.html?**');
  check('CST资料随当前机组隔离', (await page.locator('h1').textContent()).includes('HX试验') && page.url().includes('turbine='));
  await page.getByRole('button', { name: '返回公式与命令库', exact: false }).click();
  await page.waitForFunction(() => window.CfxTurbineWorkspaces && !document.querySelector('#backToTurbineHomeBtn').disabled);
  check('CST返回保持机组', await page.evaluate(() => document.querySelector('#currentTurbineWorkspaceName').textContent === 'HX试验'));
  // Exercise real remote parsing/application, but never send private repository requests.
  const remoteCheck = await page.evaluate(async () => {
    const payload = CfxTurbineWorkspaces.getSnapshot();
    state.github.basePayload = clone(payload); state.github.dirty = false;
    const remote = clone(payload); remote.turbineWorkspaces[0].database.items[0].title = 'YX模拟远端更新';
    const result = await handleRemoteFile({ sha: 'test-sha', content: utf8ToBase64(JSON.stringify(remote)) }, { silent: true });
    const full = CfxTurbineWorkspaces.getSnapshot();
    return { result, count: full.turbineWorkspaces.length, updated: full.turbineWorkspaces[0].database.items[0].title, current: state.items.length };
  });
  check('模拟云端读取保留全部机组且正确更新非当前机组', remoteCheck.count === 3 && remoteCheck.updated === 'YX模拟远端更新' && remoteCheck.current === 0);
  await enter('YX');
  check('云端更新在切换后可见', await page.evaluate(() => state.items.some(value => value.title === 'YX模拟远端更新')));
  await page.evaluate(result => { window.__turbineQA = result; }, { passed: checks.length, checks });
  return { passed: checks.length, checks };
}
