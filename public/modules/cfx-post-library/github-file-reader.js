'use strict';
(() => {
  function utf8ToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  async function readApiJson(response, label = 'GitHub 文件信息') {
    const text = (await response.text()).replace(/^\uFEFF/, '');
    let body;
    try { body = JSON.parse(text); } catch {
      const message = response.ok
        ? `${label}响应为空或不完整，请重试。`
        : `${label}请求失败（HTTP ${response.status}）。`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(body?.message || `${label}请求失败（HTTP ${response.status}）。`);
      error.status = response.status;
      throw error;
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error(`${label}不是有效的文件响应，请检查 JSON 文件路径。`);
    }
    return body;
  }

  async function readFile(cfg, headers, {allowMissing = false, conditional = false, etag = '', sha = ''} = {}) {
    const repo = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
    const path = cfg.path.split('/').map(encodeURIComponent).join('/');
    const requestHeaders = {...headers};
    if (conditional && etag) requestHeaders['If-None-Match'] = etag;
    const response = await fetch(`${repo}/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`, {headers: requestHeaders});
    if (response.status === 304) {
      if (!conditional) throw new Error('GitHub 未返回文件内容，请重新读取云端文件。');
      return {notModified: true, sha, _etag: etag};
    }
    if (response.status === 404 && allowMissing) return null;
    const file = await readApiJson(response);
    if (file.type && file.type !== 'file') throw new Error('JSON 文件路径指向的不是文件，请填写完整文件路径。');
    const inlineContent = typeof file.content === 'string' ? file.content.replace(/\s/g, '') : '';
    if (file.encoding === 'none' || (!inlineContent && Number(file.size) > 0)) {
      // Contents omits inline data above 1 MB. Read the exact blob version by
      // SHA, so a concurrent branch update cannot pair new data with an old SHA.
      if (!/^[a-f0-9]{40}$/i.test(file.sha || '')) throw new Error('GitHub 未返回有效文件版本号，已停止读取。');
      const rawHeaders = {...headers, Accept: 'application/vnd.github.raw+json'};
      delete rawHeaders['If-None-Match'];
      const rawResponse = await fetch(`${repo}/git/blobs/${file.sha}`, {headers: rawHeaders});
      if (!rawResponse.ok) await readApiJson(rawResponse, 'GitHub 大文件内容');
      const text = await rawResponse.text();
      if (!text.trim()) throw new Error('云端 JSON 文件内容为空，已停止同步。');
      file.content = utf8ToBase64(text);
      file.encoding = 'base64';
    } else if (!inlineContent) {
      throw new Error('云端 JSON 文件内容为空，已停止同步。请检查云端文件或使用备份。');
    } else if (file.encoding && file.encoding !== 'base64') {
      throw new Error('GitHub 返回了无法识别的文件编码，已停止读取。');
    }
    // Do not cache an ETag for data that cannot be safely parsed. Otherwise the
    // next automatic poll could treat a broken JSON file as already processed.
    readDatabase(file);
    const responseEtag = response.headers.get('ETag');
    if (responseEtag) file._etag = responseEtag;
    return file;
  }

  function readDatabase(file) {
    if (!file || file.notModified) throw new Error('尚未读取完整的云端 JSON 文件。');
    let text;
    try {
      const binary = atob(String(file.content || '').replace(/\s/g, ''));
      text = new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0))).replace(/^\uFEFF/, '').trim();
    } catch { throw new Error('云端文件编码无效，已停止同步。'); }
    if (!text) throw new Error('云端 JSON 文件内容为空，已停止同步。请检查云端文件或使用备份。');
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error('云端 JSON 不完整或格式无效，已停止同步。请检查云端文件或使用备份。'); }
    if (!Array.isArray(data) && !Array.isArray(data?.items)) throw new Error('云端文件不是有效的命令库 JSON，已停止同步。');
    return data;
  }

  window.CfxGithubFileReader = Object.freeze({readFile, readDatabase, readApiJson});
})();
