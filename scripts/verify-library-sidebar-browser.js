// Run against the isolated localhost profile containing the synthetic YX sidebar fixture.
async (page) => {
  if (!page.url().startsWith('http://127.0.0.1:5173/')) throw new Error('Only run against localhost');
  const embedded = () => page.frames().find(value => value.url().includes('/modules/cfx-post-library/app.html'));
  const ui = page.frameLocator('iframe'), checks = [], sizes = [];
  const directory = 'E:/浏览器及软件下载/CODEX/成果储存/冲击式水轮机工具箱储存/公式命令库目录空间优化_2026-09-30/过程文件';
  const check = (name, result) => { if (!result) throw new Error(name); checks.push(name); };
  await embedded().waitForFunction(() => !document.querySelector('#backToTurbineHomeBtn').disabled);
  const original = await embedded().evaluate(() => CfxTurbineWorkspaces.getSnapshot());
  check('183条合成资料与30个文件夹保留', await embedded().evaluate(() => state.items.length === 183 && state.folders.length === 30));
  for (const viewport of [{width:1910,height:920},{width:1440,height:900},{width:1366,height:768},{width:1280,height:720}]) {
    await page.setViewportSize(viewport);
    const metrics = await embedded().evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const button = rect('#backToTurbineHomeBtn'), name = rect('#currentTurbineWorkspaceName'), sidebar = rect('.sidebar');
      const nav = document.querySelector('#categoryNav'), panel = rect('.turbine-workspace-panel'), footer = rect('.side-bottom');
      return { navHeight: nav.clientHeight, panelHeight: panel.height,
        brandHidden: getComputedStyle(document.querySelector('.sidebar>.brand')).display === 'none',
        noteHidden: getComputedStyle(document.querySelector('.side-note')).display === 'none',
        sameRow: Math.abs(button.y + button.height / 2 - name.y - name.height / 2) < 1 && button.right < name.right,
        noOverflow: nav.scrollWidth <= nav.clientWidth + 1 && panel.right <= sidebar.right && footer.bottom <= sidebar.bottom,
        navBeforeFooter: rect('#categoryNav').bottom <= footer.top };
    });
    check(`${viewport.width}×${viewport.height}布局`, metrics.brandHidden && metrics.noteHidden && metrics.sameRow && metrics.noOverflow && metrics.navBeforeFooter && metrics.panelHeight <= 46 && metrics.navHeight >= 200);
    sizes.push({ viewport, ...metrics });
    await page.screenshot({ path: `${directory}/目录优化_${viewport.width}x${viewport.height}.png` });
  }
  await page.setViewportSize({width:1910,height:920});
  await ui.getByRole('searchbox', {name:'筛选分类或文件夹'}).fill('PZ30');
  await ui.locator('.folder-main').filter({hasText:'PZ30'}).click();
  check('目录筛选与文件夹选择正常', await embedded().evaluate(() => state.filterFolderId === 'fixture-folder-29' && document.querySelector('#viewTitle').textContent.includes('PZ30')));
  await ui.getByRole('button', {name:'清除目录筛选',exact:true}).click();
  const scrolled = await embedded().evaluate(() => {
    const nav = document.querySelector('#categoryNav'); nav.scrollTop = nav.scrollHeight;
    return nav.scrollTop > 0 && document.querySelector('.side-bottom').getBoundingClientRect().bottom <= document.querySelector('.sidebar').getBoundingClientRect().bottom;
  });
  check('长目录可滚动且底部操作不遮挡', scrolled);
  await embedded().evaluate(() => { document.querySelector('#categoryNav').scrollTop = 0; });
  await ui.getByRole('button', {name:'返回资料库首页',exact:true}).click();
  await ui.getByRole('button', {name:'进入 YX 资料库',exact:true}).click();
  await ui.getByRole('button', {name:'新建条目',exact:true}).click();
  await ui.locator('#itemTitle').fill('未保存检查');
  await ui.getByRole('button', {name:'返回资料库首页',exact:true}).click();
  await ui.getByRole('dialog').getByRole('button', {name:'取消',exact:true}).click();
  check('紧凑返回按钮仍保护未保存内容', await ui.locator('#itemTitle').inputValue() === '未保存检查');
  await ui.getByRole('button', {name:'返回资料库首页',exact:true}).click();
  await ui.getByRole('dialog').getByRole('button', {name:'放弃修改',exact:true}).click();
  await ui.getByRole('button', {name:'重命名 YX 资料库',exact:true}).click();
  const longName = 'YX水轮机组很长的自定义资料库名称用于检查单行不挤压返回按钮';
  await ui.getByRole('textbox', {name:'机组名称',exact:true}).fill(longName);
  await ui.getByRole('button', {name:'保存名称',exact:true}).click();
  await ui.getByRole('button', {name:`进入 ${longName} 资料库`,exact:true}).click();
  const nameCheck = await embedded().evaluate(() => {
    const name = document.querySelector('#currentTurbineWorkspaceName');
    return name.title === name.textContent && getComputedStyle(name).whiteSpace === 'nowrap' && name.scrollWidth > name.clientWidth;
  });
  check('长名称单行省略并保留完整提示', nameCheck);
  await embedded().evaluate(async saved => { applyIncomingDatabase(saved, 'replace', 'restore isolated sidebar fixture'); await CfxCacheDiagnostics.forcePersist(); state.github.dirty = false; }, original);
  await page.screenshot({path:`${directory}/目录优化最终效果.png`});
  return { passed:checks.length, checks, sizes, heightGain:sizes[0].navHeight - 256 };
}
