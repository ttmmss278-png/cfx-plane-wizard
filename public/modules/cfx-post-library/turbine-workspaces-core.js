'use strict';
(() => {
  const LEGACY_ID = 'turbine-original';
  const LEGACY_NAME = '原有机组';
  const VERSION = '1.17.1';
  const copy = value => JSON.parse(JSON.stringify(value));
  const cleanName = value => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const hasWorkspaces = data => !!data && Array.isArray(data.turbineWorkspaces);

  function envelope(workspaces) {
    if (!workspaces.length) throw new Error('至少需要保留一个机组存储');
    return {
      ...copy(workspaces[0].database),
      app: 'CFX-Post Formula and Command Library',
      version: 8,
      appVersion: VERSION,
      turbineWorkspaces: copy(workspaces),
    };
  }

  function normalize(data, normalizeSingle) {
    const sources = hasWorkspaces(data) ? data.turbineWorkspaces : [{
      id: LEGACY_ID, name: LEGACY_NAME, createdAt: '', updatedAt: '', database: data,
    }];
    if (!sources.length) throw new Error('机组存储列表不能为空');
    const ids = new Set();
    const workspaces = sources.map(source => {
      if (!source || !/^[a-zA-Z0-9_-]{1,100}$/.test(String(source.id || ''))) throw new Error('机组存储标识无效');
      const id = String(source.id);
      if (ids.has(id)) throw new Error('机组存储标识重复');
      ids.add(id);
      const name = cleanName(source.name);
      if (!name) throw new Error('请填写机组名称');
      const raw = source.database;
      if (!Array.isArray(raw) && !Array.isArray(raw?.items)) throw new Error(`“${name}”不是有效的命令库数据`);
      return {
        id, name,
        createdAt: String(source.createdAt || ''),
        updatedAt: String(source.updatedAt || ''),
        database: normalizeSingle(raw),
      };
    });
    return envelope(workspaces);
  }

  function equal(a, b, normalizeSingle, singleEqual) {
    const left = normalize(a, normalizeSingle).turbineWorkspaces;
    const right = normalize(b, normalizeSingle).turbineWorkspaces;
    if (left.length !== right.length) return false;
    const byId = new Map(right.map(value => [value.id, value]));
    return left.every(value => {
      const other = byId.get(value.id);
      return !!other && value.name === other.name && singleEqual(value.database, other.database);
    });
  }

  function merge(base, local, remote, { normalizeSingle, singleEqual, mergeSingle, initialSingle, preferLocal = false }) {
    const b = base ? normalize(base, normalizeSingle).turbineWorkspaces : [];
    const l = normalize(local, normalizeSingle).turbineWorkspaces;
    const r = normalize(remote, normalizeSingle).turbineWorkspaces;
    const bm = new Map(b.map(value => [value.id, value]));
    const lm = new Map(l.map(value => [value.id, value]));
    const rm = new Map(r.map(value => [value.id, value]));
    const ids = [...new Set([...l, ...r, ...b].map(value => value.id))];
    const result = [], conflicts = [];
    const sameWorkspace = (a, z) => !a || !z ? a === z : a.name === z.name && singleEqual(a.database, z.database);
    for (const id of ids) {
      const prior = bm.get(id), left = lm.get(id), right = rm.get(id);
      if (!left || !right) {
        const remaining = left || right;
        if (!prior) { if (remaining) result.push(copy(remaining)); continue; }
        if (!remaining || sameWorkspace(remaining, prior)) continue;
        if (preferLocal) { if (left) result.push(copy(left)); continue; }
        conflicts.push({ id, name: remaining.name, label: '机组存储', fields: ['机组增删状态'] });
        continue;
      }
      let name = left.name;
      if (left.name !== right.name) {
        if (prior && left.name === prior.name) name = right.name;
        else if (prior && right.name === prior.name) name = left.name;
        else if (!prior && id === LEGACY_ID && (left.name === LEGACY_NAME || right.name === LEGACY_NAME)) name = left.name === LEGACY_NAME ? right.name : left.name;
        else if (!preferLocal) conflicts.push({ id, name: left.name, label: '机组存储', fields: ['机组名称'] });
      }
      const merged = prior
        ? mergeSingle(prior.database, left.database, right.database)
        : initialSingle(left.database, right.database);
      if (merged.conflicts?.length) {
        conflicts.push(...merged.conflicts.map(value => ({ ...value, id: `${id}/${value.id || ''}`, name: `${name} / ${value.name || value.id || '资料'}` })));
      } else if (merged.merged) {
        result.push({
          id, name,
          createdAt: [left.createdAt, right.createdAt, prior?.createdAt].filter(Boolean).sort()[0] || '',
          updatedAt: [left.updatedAt, right.updatedAt, prior?.updatedAt].filter(Boolean).sort().at(-1) || '',
          database: normalizeSingle(merged.merged),
        });
      }
    }
    if (conflicts.length) return { merged: null, conflicts };
    if (!result.length) return { merged: null, conflicts: [{ id: 'empty', name: '机组存储', fields: ['不能删除全部机组'] }] };
    return { merged: envelope(result), conflicts: [] };
  }

  function select(data, id) {
    return data.turbineWorkspaces.find(value => value.id === id) || data.turbineWorkspaces[0];
  }

  function scopedKey(key, id) { return id === LEGACY_ID ? key : `${key}:${id}`; }

  globalThis.CfxTurbineWorkspaceModel = { LEGACY_ID, LEGACY_NAME, VERSION, copy, cleanName, hasWorkspaces, envelope, normalize, equal, merge, select, scopedKey };
  const ACTIVE_KEY = 'cfxpost_active_turbine_v1';
  let activeId = LEGACY_ID;
  try {
    activeId = new URLSearchParams(globalThis.location?.search || '').get('turbine') || globalThis.localStorage?.getItem(ACTIVE_KEY) || LEGACY_ID;
  } catch (_) { /* The data model also runs in non-browser tests. */ }
  globalThis.CfxTurbineContext = {
    get id() { return activeId; },
    key(key) { return scopedKey(key, activeId); },
    setId(id) {
      activeId = id;
      try { globalThis.localStorage?.setItem(ACTIVE_KEY, id); } catch (_) { /* Cache remains authoritative. */ }
    },
  };
})();
