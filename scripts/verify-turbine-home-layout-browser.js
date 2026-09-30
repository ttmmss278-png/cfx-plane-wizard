// Isolated localhost fixture only. Check card layouts without modifying real user data.
async (page) => {
  if (!page.url().startsWith('http://127.0.0.1:5173/')) throw new Error('Only run against localhost');
  const frame = page.frames().find(value => value.url().includes('/modules/cfx-post-library/app.html'));
  const gallery = page.frameLocator('iframe');
  const directory = 'E:/浏览器及软件下载/CODEX/成果储存/冲击式水轮机工具箱储存/公式命令库卡片首页_2026-09-30/过程文件';
  const checks = [];
  await gallery.getByRole('heading', { name: '机组资料库', exact: true }).waitFor();
  await gallery.getByRole('button', { name: 'GitHub 同步', exact: true }).click();
  await gallery.locator('#githubModal').waitFor({ state: 'visible' });
  await gallery.locator('#ghOwner').fill('layout-fixture');
  if (await gallery.locator('#ghOwner').inputValue() !== 'layout-fixture') throw new Error('Sync modal not interactive from home');
  await gallery.locator('#githubModal [data-close]').click();
  checks.push('首页同步弹窗可交互');
  await page.setViewportSize({ width: 1910, height: 920 });
  await page.screenshot({ path: `${directory}/资料库卡片首页.png` });
  await gallery.getByRole('button', { name: '进入 YX机组 资料库', exact: true }).click();
  await gallery.getByRole('button', { name: '返回资料库首页', exact: false }).waitFor();
  await page.screenshot({ path: `${directory}/库内精简导航.png` });
  await gallery.getByRole('button', { name: '返回资料库首页', exact: false }).click();
  await gallery.getByRole('heading', { name: '机组资料库', exact: true }).waitFor();
  const saved = await frame.evaluate(() => CfxTurbineWorkspaces.getSnapshot());
  try {
    await frame.evaluate(() => {
      const fixture = CfxTurbineWorkspaces.getSnapshot(), empty = canonicalDatabase({ items: [], folders: [], categories: [] }).turbineWorkspaces[0].database;
      for (let index = 0; index < 18; index++) fixture.turbineWorkspaces.push({ id: `layout-${index}`, name: index === 0 ? '很长的自定义资料库名称用于检查卡片内容的换行和对齐1234567890' : `试验机组 ${index + 1}`, database: empty });
      applyIncomingDatabase(fixture, 'replace', 'isolated layout fixture');
    });
    for (const width of [1910, 1280, 768, 390]) {
      await page.setViewportSize({ width, height: 920 });
      const result = await frame.evaluate(() => {
        const hub = document.querySelector('#turbineWorkspaceHome'), grid = document.querySelector('#turbineWorkspaceCards');
        const card = grid.querySelector('article'), last = grid.lastElementChild;
        hub.scrollTop = hub.scrollHeight;
        return { width: hub.clientWidth, noOverflow: hub.scrollWidth <= hub.clientWidth + 1, canScroll: hub.scrollTop > 0, lastInView: last.getBoundingClientRect().bottom <= hub.getBoundingClientRect().bottom + 1,
          cardWidth: card.getBoundingClientRect().width, columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length };
      });
      if (!result.noOverflow || !result.canScroll || !result.lastInView) throw new Error(`${width}: ${JSON.stringify(result)}`);
      checks.push({ width, ...result });
      await frame.evaluate(() => { document.querySelector('#turbineWorkspaceHome').scrollTop = 0; });
      await page.screenshot({ path: `${directory}/多资料库布局_${width}.png` });
    }
  } finally {
    await frame.evaluate(async backup => { applyIncomingDatabase(backup, 'replace', 'restore isolated layout fixture'); await CfxCacheDiagnostics.forcePersist(); state.github.dirty = false; }, saved);
    await page.setViewportSize({ width: 1910, height: 920 });
  }
  return { passed: checks.length, checks };
}
