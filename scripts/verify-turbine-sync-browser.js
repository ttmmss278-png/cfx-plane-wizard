async (page) => {
  if (!page.url().startsWith('http://127.0.0.1:5173/modules/cfx-post-library/')) throw new Error('Only run in the isolated local library test profile');
  const scenario = await page.evaluate(() => {
    const saved = CfxTurbineWorkspaces.getSnapshot(), base = canonicalDatabase(saved);
    if (base.turbineWorkspaces.length !== 3) throw new Error('Run the main browser fixture test first');
    const local = clone(base), remote = clone(base);
    local.turbineWorkspaces[0].database.items[0].title = 'YX保留本地';
    remote.turbineWorkspaces[0].database.items[0].title = 'YX远端冲突';
    remote.turbineWorkspaces[1].database.items[0].title = 'ZL远端非冲突变更';
    applyIncomingDatabase(local, 'replace', 'sync test fixture');
    state.github.basePayload = base; state.github.pendingRemote = remote; state.github.conflict = true; state.github.dirty = true;
    const fields = ['ghOwner', 'ghRepo', 'ghBranch', 'ghPath', 'ghToken'];
    const settings = Object.fromEntries(fields.map(id => [id, document.getElementById(id).value]));
    const values = ['fixture', 'fixture', 'main', 'data/library.json', 'fake-test-token'];
    fields.forEach((id, index) => { document.getElementById(id).value = values[index]; });
    return { saved, base, local, remote, settings, content: utf8ToBase64(JSON.stringify(remote)) };
  });
  let uploads = [], editDuringUpload = false;
  await page.route('https://api.github.com/**', async route => {
    const request = route.request();
    if (request.method() === 'GET') await route.fulfill({ json: { sha: 'mock-remote', content: scenario.content } });
    else if (request.method() === 'PUT') {
      uploads.push(request.postDataJSON());
      if(editDuringUpload)await page.evaluate(()=>{
        const data=CfxTurbineWorkspaces.getSnapshot();
        data.turbineWorkspaces[1].database.items[0].description='上传期间新增说明';
        applyIncomingDatabase(data,'replace','in-flight edit test');
      });
      await route.fulfill({ json: { content: { sha: 'mock-uploaded' } } });
    } else await route.abort();
  });
  try {
    const okay = await page.evaluate(async () => {
      const original = window.confirm; window.confirm = () => true;
      try { return await keepLocalAndForcePush(); } finally { window.confirm = original; }
    });
    if (!okay || uploads.length !== 1) throw new Error('Mock conflict upload failed');
    const outgoing = await page.evaluate(content => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(content), c => c.charCodeAt(0)))), uploads[0].content);
    const results = {
      allUnitsUploaded: outgoing.turbineWorkspaces.length === 3,
      localConflictKept: outgoing.turbineWorkspaces[0].database.items[0].title === 'YX保留本地',
      remoteNonconflictKept: outgoing.turbineWorkspaces[1].database.items[0].title === 'ZL远端非冲突变更',
      customDefaultKept: outgoing.turbineWorkspaces[0].database.defaultCategory === '自定义默认',
      topLevelMirror: outgoing.items[0].title === 'YX保留本地',
      uploadCommitted: await page.evaluate(() => CfxTurbineWorkspaces.getSnapshot().turbineWorkspaces[1].database.items[0].title === 'ZL远端非冲突变更' && !state.github.dirty),
    };
    if (!Object.values(results).every(Boolean)) throw new Error(JSON.stringify(results));
    editDuringUpload=true;
    await page.evaluate(({local,base,remote})=>{
      applyIncomingDatabase(local,'replace','second upload test');state.github.basePayload=base;state.github.pendingRemote=remote;state.github.conflict=true;state.github.dirty=true;
    },scenario);
    await page.evaluate(async()=>{const original=window.confirm;window.confirm=()=>true;try{return await keepLocalAndForcePush();}finally{window.confirm=original;}});
    const concurrent=await page.evaluate(()=>{
      const item=CfxTurbineWorkspaces.getSnapshot().turbineWorkspaces[1].database.items[0];
      return {localEditPreserved:item.description==='上传期间新增说明'&&state.github.dirty,remoteEditPreserved:item.title==='ZL远端非冲突变更'};
    });
    if(!Object.values(concurrent).every(Boolean))throw new Error(JSON.stringify(concurrent));
    return { passed: 8, checks: {...results,...concurrent}, privateRepositoryWrites: 0 };
  } finally {
    await page.evaluate(({ saved, settings }) => {
      Object.entries(settings).forEach(([id, value]) => { document.getElementById(id).value = value; });
      applyIncomingDatabase(saved, 'replace', 'restore sync fixture');
      state.github.basePayload = canonicalDatabase(saved); state.github.dirty = false; clearGithubConflict(); saveGithubConfig();
    }, scenario);
    await page.unroute('https://api.github.com/**');
  }
}
