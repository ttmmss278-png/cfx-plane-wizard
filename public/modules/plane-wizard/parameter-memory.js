/* Parameter drafts persist separately from the user's manual save point. */
(function (root) {
  'use strict';
  const SAVED_KEY = 'cst-circle-section-gen-v1';
  const DRAFT_KEY = 'cst-circle-section-gen-draft-v1';
  const copy = value => JSON.parse(JSON.stringify(value));
  function parse(raw) {
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('参数存档格式无效');
    return value;
  }
  function clean(value, defaults, previous = defaults) {
    const result = copy(previous);
    for (const key of Object.keys(defaults)) {
      const entry = value?.[key], fallback = defaults[key];
      if (Array.isArray(fallback)) {
        if (Array.isArray(entry) && entry.length === fallback.length) {
          result[key] = entry.map((n, i) => Number.isFinite(n) ? n : previous[key][i]);
        }
      } else if (typeof entry === typeof fallback && (typeof entry !== 'number' || Number.isFinite(entry))) {
        result[key] = entry;
      }
    }
    return result;
  }
  function readKey(key, defaults) {
    return clean(parse(root.localStorage.getItem(key)), defaults);
  }
  function read(defaults) {
    // Existing manual saves seed the draft on upgrade. Reading never changes them.
    for (const key of [DRAFT_KEY, SAVED_KEY]) {
      try { if (root.localStorage.getItem(key)) return readKey(key, defaults); }
      catch (_) { /* A broken draft must not prevent loading the manual save. */ }
    }
    return copy(defaults);
  }
  function announce(saved) {
    root.dispatchEvent?.(new root.CustomEvent('plane-parameter-persisted', { detail: { saved } }));
    return saved;
  }
  function saveDraft(value, defaults) {
    try {
      let previous = defaults;
      const raw = root.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        try { previous = clean(parse(raw), defaults); }
        catch (_) { root.localStorage.setItem(DRAFT_KEY + '-invalid-backup', raw); }
      }
      // Incomplete numeric edits retain the last valid number for refresh recovery.
      root.localStorage.setItem(DRAFT_KEY, JSON.stringify(clean(value, defaults, previous)));
      return announce(true);
    } catch (_) { return announce(false); }
  }
  function saveManual(value, defaults) {
    try {
      root.localStorage.setItem(SAVED_KEY, JSON.stringify(clean(value, defaults, read(defaults))));
      return saveDraft(value, defaults);
    } catch (_) { return announce(false); }
  }
  function readManual(defaults) {
    if (!root.localStorage.getItem(SAVED_KEY)) throw new Error('本地无手动保存的参数');
    return readKey(SAVED_KEY, defaults);
  }
  root.PlaneParameterMemory = Object.freeze({ read, saveDraft, saveManual, readManual });
})(globalThis);
