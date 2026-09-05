(function () {
  const $ = (id) => document.getElementById(id);
  const LOCAL_API_BASE = "http://127.0.0.1:62356";
  const HEALTH_TIMEOUT_MS = 1800;
  const SESSION_HEADER = "X-Pelton-Session";
  const CONFIG_FORMAT = "pelton-post-export-config";
  const CONFIG_SCHEMA_VERSION = 1;
  const PROFILE_STORAGE_KEY = "pelton.postExporter.configProfiles.v1";
  const DRAFT_STORAGE_KEY = "pelton.postExporter.configDraft.v1";
  const DRAFT_SAVE_DELAY_MS = 420;
  const MAX_CONFIG_JSON_BYTES = 1024 * 1024;

  const configFieldIds = [
    "exportImages",
    "exportTables",
    "imageDir",
    "tableDir",
    "imageWidth",
    "imageHeight",
    "imageFormat",
    "imageQuality",
    "backgroundMode",
    "imagePrefix",
    "antiAlias",
    "tableFormat",
    "tablePrefix",
    "delimiter",
    "postVersion",
    "loadMode",
    "loadTemplate",
    "viewTemplate",
    "imageTemplate",
    "tableTemplate",
  ];

  const state = {
    importedFiles: [],
    localServiceAvailable: false,
    localServiceChecking: false,
    localServiceSessionToken: "",
    baseDirAutoFilled: false,
    profiles: [],
    draftTimer: null,
    configDirty: false,
    profileNameDirty: false,
    dirty: false,
    initializing: true,
    views: [
      { enabled: false, name: "VIEW1", alias: "VIEW1", aliasEdited: false },
      { enabled: false, name: "VIEW2", alias: "VIEW2", aliasEdited: false },
      { enabled: false, name: "VIEW3", alias: "VIEW3", aliasEdited: false },
      { enabled: false, name: "VIEW4", alias: "VIEW4", aliasEdited: false },
    ],
    tables: [
      { enabled: false, name: "B1", alias: "B1", aliasEdited: false },
      { enabled: false, name: "B2", alias: "B2", aliasEdited: false },
      { enabled: false, name: "B3", alias: "B3", aliasEdited: false },
    ],
  };

  const fields = [
    "resultBaseDir",
    "manualFiles",
    "exportImages",
    "exportTables",
    "imageDir",
    "tableDir",
    "imageWidth",
    "imageHeight",
    "imageFormat",
    "imageQuality",
    "backgroundMode",
    "imagePrefix",
    "antiAlias",
    "tableFormat",
    "tablePrefix",
    "delimiter",
    "postVersion",
    "loadMode",
    "loadTemplate",
    "viewTemplate",
    "imageTemplate",
    "tableTemplate",
  ];

  const defaultImageTemplate = `HARDCOPY:
  Antialiasing = {antiAlias}
  Hardcopy Format = {imageFormat}
{renderModeLines}
{sizeLines}
  White Background = {whiteBackground}
END
>print {imageFile}`;

  function normalizedConfigItems(items) {
    if (!Array.isArray(items)) return [];
    return items.slice(0, 200).map((item, index) => {
      const name = String(item?.name ?? "").slice(0, 500);
      const alias = String(item?.alias ?? name).slice(0, 500);
      return {
        enabled: Boolean(item?.enabled),
        name,
        alias,
        aliasEdited: typeof item?.aliasEdited === "boolean" ? item.aliasEdited : alias !== name,
        order: index,
      };
    });
  }

  function captureConfig() {
    const values = {};
    configFieldIds.forEach((id) => {
      const element = $(id);
      if (!element) return;
      values[id] = element.type === "checkbox" ? element.checked : element.value;
    });
    return {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      values,
      views: normalizedConfigItems(state.views).map(({ order, ...item }) => item),
      tables: normalizedConfigItems(state.tables).map(({ order, ...item }) => item),
    };
  }

  function normalizeConfig(rawConfig) {
    if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
      throw new Error("配置内容不是有效对象");
    }
    if (Number(rawConfig.schemaVersion) !== CONFIG_SCHEMA_VERSION) {
      throw new Error(`不支持的配置版本：${rawConfig.schemaVersion ?? "未知"}`);
    }
    if (!rawConfig.values || typeof rawConfig.values !== "object" || Array.isArray(rawConfig.values)) {
      throw new Error("配置缺少导出参数");
    }
    const missingFields = configFieldIds.filter(
      (id) => !Object.prototype.hasOwnProperty.call(rawConfig.values, id),
    );
    if (missingFields.length) {
      throw new Error(`配置缺少 ${missingFields.length} 项导出参数`);
    }

    const values = {};
    configFieldIds.forEach((id) => {
      if (!Object.prototype.hasOwnProperty.call(rawConfig.values, id)) return;
      const element = $(id);
      if (!element) return;
      const rawValue = rawConfig.values[id];
      if (element.type === "checkbox") {
        values[id] = rawValue === true;
        return;
      }
      if (element.type === "number") {
        const numericValue = Math.floor(Number(rawValue));
        if (!Number.isFinite(numericValue) || numericValue <= 0) {
          throw new Error(`配置参数 ${id} 无效`);
        }
        values[id] = String(numericValue);
        return;
      }
      const value = String(rawValue ?? "").slice(0, 200000);
      if (element.tagName === "SELECT") {
        const valid = Array.from(element.options).some((option) => option.value === value);
        if (!valid) throw new Error(`配置参数 ${id} 不受支持`);
      }
      values[id] = value;
    });

    if (!Array.isArray(rawConfig.views) || !Array.isArray(rawConfig.tables)) {
      throw new Error("配置缺少图片视图或表格对象");
    }

    return {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      values,
      views: normalizedConfigItems(rawConfig.views).map(({ order, ...item }) => item),
      tables: normalizedConfigItems(rawConfig.tables).map(({ order, ...item }) => item),
    };
  }

  function applyConfig(rawConfig) {
    const config = normalizeConfig(rawConfig);
    state.initializing = true;
    try {
      configFieldIds.forEach((id) => {
        if (!Object.prototype.hasOwnProperty.call(config.values, id)) return;
        const element = $(id);
        if (!element) return;
        if (element.type === "checkbox") element.checked = config.values[id];
        else element.value = config.values[id];
      });
      state.views = config.views;
      state.tables = config.tables;
      renderAllItems();
      generate();
    } finally {
      state.initializing = false;
    }
    return config;
  }

  function setDraftStatus(message, status = "idle") {
    const element = $("draftStatus");
    if (!element) return;
    element.textContent = message;
    element.dataset.state = status;
  }

  function hasTransientResultData() {
    return Boolean(
      state.importedFiles.length ||
        $("resultBaseDir")?.value.trim() ||
        $("manualFiles")?.value.trim(),
    );
  }

  function notifyDirtyState(force = false) {
    const dirty = Boolean(state.configDirty || state.profileNameDirty || hasTransientResultData());
    if (!force && dirty === state.dirty) return;
    state.dirty = dirty;
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: "pelton-toolbox-dirty", dirty },
        window.location.origin,
      );
    }
  }

  function saveDraftNow(message = "草稿已自动保存") {
    window.clearTimeout(state.draftTimer);
    state.draftTimer = null;
    try {
      const draft = {
        format: CONFIG_FORMAT,
        version: CONFIG_SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        config: captureConfig(),
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      state.configDirty = false;
      setDraftStatus(message, "saved");
      notifyDirtyState();
      return true;
    } catch (error) {
      state.configDirty = true;
      setDraftStatus("草稿保存失败", "error");
      notifyDirtyState();
      return false;
    }
  }

  function scheduleDraftSave() {
    if (state.initializing) return;
    state.configDirty = true;
    setDraftStatus("正在保存草稿…", "saving");
    notifyDirtyState();
    window.clearTimeout(state.draftTimer);
    state.draftTimer = window.setTimeout(() => saveDraftNow(), DRAFT_SAVE_DELAY_MS);
  }

  function restoreDraft() {
    let raw = "";
    try {
      raw = localStorage.getItem(DRAFT_STORAGE_KEY) || "";
      if (!raw) return false;
      if (raw.length > MAX_CONFIG_JSON_BYTES) throw new Error("草稿文件过大");
      const payload = JSON.parse(raw);
      if (payload?.format !== CONFIG_FORMAT || Number(payload?.version) !== CONFIG_SCHEMA_VERSION) {
        throw new Error("草稿格式不兼容");
      }
      applyConfig(payload.config);
      state.configDirty = false;
      setDraftStatus("已恢复上次参数草稿", "saved");
      return true;
    } catch (error) {
      setDraftStatus("草稿无法恢复", "error");
      return false;
    }
  }

  function newProfileId() {
    if (typeof window.crypto?.randomUUID === "function") return window.crypto.randomUUID();
    return `profile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function readProfiles() {
    try {
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return [];
      if (raw.length > MAX_CONFIG_JSON_BYTES) throw new Error("方案库过大");
      const payload = JSON.parse(raw);
      if (Number(payload?.version) !== CONFIG_SCHEMA_VERSION || !Array.isArray(payload?.profiles)) return [];
      return payload.profiles.slice(0, 100).flatMap((profile) => {
        try {
          const name = String(profile?.name ?? "").trim().slice(0, 80);
          if (!name) return [];
          return [{
            id: String(profile?.id || newProfileId()),
            name,
            updatedAt: String(profile?.updatedAt || new Date(0).toISOString()),
            config: normalizeConfig(profile?.config),
          }];
        } catch (error) {
          return [];
        }
      });
    } catch (error) {
      return [];
    }
  }

  function persistProfiles(nextProfiles) {
    try {
      const payload = { version: CONFIG_SCHEMA_VERSION, profiles: nextProfiles };
      const serialized = JSON.stringify(payload);
      if (serialized.length > MAX_CONFIG_JSON_BYTES) throw new Error("方案库超过 1 MB");
      localStorage.setItem(PROFILE_STORAGE_KEY, serialized);
      state.profiles = nextProfiles;
      return true;
    } catch (error) {
      toast(error.message || "方案保存失败");
      return false;
    }
  }

  function renderProfileOptions(selectedId = "") {
    const select = $("configProfileSelect");
    select.innerHTML = "";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = state.profiles.length ? "请选择方案" : "暂无保存方案";
    select.appendChild(empty);

    state.profiles
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .forEach((profile) => {
        const option = document.createElement("option");
        option.value = profile.id;
        option.textContent = profile.name;
        select.appendChild(option);
      });

    select.value = state.profiles.some((profile) => profile.id === selectedId) ? selectedId : "";
    updateProfileControls();
  }

  function updateProfileControls() {
    const id = $("configProfileSelect").value;
    const profile = state.profiles.find((item) => item.id === id);
    $("loadConfigProfile").disabled = !profile;
    $("deleteConfigProfile").disabled = !profile;
    if (profile) $("configProfileName").value = profile.name;
    else if (document.activeElement !== $("configProfileName")) $("configProfileName").value = "";
  }

  function saveCurrentProfile() {
    const nameInput = $("configProfileName");
    const name = nameInput.value.trim().slice(0, 80);
    if (!name) {
      toast("请先填写方案名称");
      nameInput.focus();
      return;
    }

    const selectedId = $("configProfileSelect").value;
    const existing = state.profiles.find((profile) => profile.id === selectedId) ||
      state.profiles.find((profile) => profile.name.toLowerCase() === name.toLowerCase());
    const profile = {
      id: existing?.id || newProfileId(),
      name,
      updatedAt: new Date().toISOString(),
      config: captureConfig(),
    };
    const nextProfiles = existing
      ? state.profiles.map((item) => (item.id === existing.id ? profile : item))
      : [...state.profiles, profile];
    if (!persistProfiles(nextProfiles)) return;
    state.profileNameDirty = false;
    renderProfileOptions(profile.id);
    saveDraftNow("当前参数与草稿已保存");
    toast(existing ? `已更新方案“${name}”` : `已保存方案“${name}”`);
  }

  function loadSelectedProfile() {
    const profile = state.profiles.find((item) => item.id === $("configProfileSelect").value);
    if (!profile) return;
    try {
      applyConfig(profile.config);
      saveDraftNow(`已载入“${profile.name}”`);
      toast(`已载入方案“${profile.name}”`);
    } catch (error) {
      toast(error.message || "方案载入失败");
    }
  }

  function deleteSelectedProfile() {
    const profile = state.profiles.find((item) => item.id === $("configProfileSelect").value);
    if (!profile) return;
    if (!window.confirm(`确定删除方案“${profile.name}”吗？`)) return;
    const nextProfiles = state.profiles.filter((item) => item.id !== profile.id);
    if (!persistProfiles(nextProfiles)) return;
    state.profileNameDirty = false;
    $("configProfileName").value = "";
    renderProfileOptions();
    notifyDirtyState();
    toast(`已删除方案“${profile.name}”`);
  }

  function configExportPayload() {
    const selected = state.profiles.find((item) => item.id === $("configProfileSelect").value);
    const currentName = $("configProfileName").value.trim();
    return {
      format: CONFIG_FORMAT,
      version: CONFIG_SCHEMA_VERSION,
      name: currentName || selected?.name || "CFX-Post 导出配置",
      exportedAt: new Date().toISOString(),
      config: captureConfig(),
    };
  }

  function exportConfigJson() {
    const payload = configExportPayload();
    const serialized = JSON.stringify(payload, null, 2);
    const blob = new Blob([serialized], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${sanitizeName(payload.name) || "cfx-post-export-config"}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    toast("配置 JSON 已导出");
  }

  function uniqueImportedProfileName(name) {
    const base = String(name || "导入方案").trim().slice(0, 70) || "导入方案";
    const used = new Set(state.profiles.map((profile) => profile.name.toLowerCase()));
    if (!used.has(base.toLowerCase())) return base;
    let index = 2;
    while (used.has(`${base}（导入 ${index}）`.toLowerCase())) index += 1;
    return `${base}（导入 ${index}）`.slice(0, 80);
  }

  async function importConfigJson(file) {
    if (!file) return;
    if (file.size > MAX_CONFIG_JSON_BYTES) {
      toast("配置文件不能超过 1 MB");
      return;
    }
    try {
      const payload = JSON.parse(await file.text());
      if (payload?.format !== CONFIG_FORMAT || Number(payload?.version) !== CONFIG_SCHEMA_VERSION) {
        throw new Error("不是本工具箱导出的配置 JSON");
      }
      const config = normalizeConfig(payload.config);
      const name = uniqueImportedProfileName(payload.name || file.name.replace(/\.json$/i, ""));
      const profile = {
        id: newProfileId(),
        name,
        updatedAt: new Date().toISOString(),
        config,
      };
      if (!persistProfiles([...state.profiles, profile])) return;
      state.profileNameDirty = false;
      renderProfileOptions(profile.id);
      $("configProfileName").value = name;
      applyConfig(config);
      saveDraftNow(`已导入“${name}”`);
      toast(`已导入并载入方案“${name}”`);
    } catch (error) {
      toast(error.message || "配置 JSON 导入失败");
    }
  }

  function normalizePath(path) {
    return path.trim().replace(/^"+|"+$/g, "");
  }

  function joinPath(dir, file) {
    const cleanDir = normalizePath(dir);
    const cleanFile = normalizePath(file);
    if (!cleanDir) return cleanFile;
    if (!cleanFile) return cleanDir;
    if (/[\\/]$/.test(cleanDir)) return cleanDir + cleanFile;
    return cleanDir + "\\" + cleanFile;
  }

  function cfxPath(path) {
    return normalizePath(path).replace(/\\/g, "/");
  }

  function isAbsolutePath(path) {
    return /^[a-zA-Z]:[\\/]/.test(path) || /^\\\\/.test(path);
  }

  function fileName(path) {
    const clean = normalizePath(path);
    return clean.split(/[\\/]/).pop() || clean;
  }

  function directoryName(path) {
    const clean = normalizePath(path);
    const index = Math.max(clean.lastIndexOf("\\"), clean.lastIndexOf("/"));
    return index > 0 ? clean.slice(0, index) : "";
  }

  function commonDirectory(paths) {
    const dirs = paths.map(directoryName).filter(Boolean);
    if (!dirs.length) return "";

    const splitDirs = dirs.map((dir) => dir.split(/[\\/]/));
    const commonParts = [];
    const minLength = Math.min(...splitDirs.map((parts) => parts.length));

    for (let index = 0; index < minLength; index += 1) {
      const candidate = splitDirs[0][index];
      const matches = splitDirs.every((parts) => parts[index].toLowerCase() === candidate.toLowerCase());
      if (!matches) break;
      commonParts.push(candidate);
    }

    return commonParts.length ? commonParts.join("\\") : "";
  }

  function tryAutoFillBaseDir(paths) {
    const absolutePaths = paths.map(normalizePath).filter(isAbsolutePath);
    if (!absolutePaths.length) return false;

    const dir = commonDirectory(absolutePaths);
    if (!dir) return false;

    $("resultBaseDir").value = dir;
    state.baseDirAutoFilled = true;
    return true;
  }

  function importKey(path) {
    return normalizePath(path).replace(/\//g, "\\").toLowerCase();
  }

  function mergeFileEntries(existingFiles, incomingFiles) {
    const entries = existingFiles.map(normalizePath).filter(Boolean);
    let added = 0;
    let skipped = 0;
    let upgraded = 0;

    incomingFiles.map(normalizePath).filter(Boolean).forEach((incoming) => {
      const exactIndex = entries.findIndex((entry) => importKey(entry) === importKey(incoming));
      if (exactIndex >= 0) {
        skipped += 1;
        return;
      }

      const incomingName = fileName(incoming).toLowerCase();
      const sameNameIndex = entries.findIndex((entry) => fileName(entry).toLowerCase() === incomingName);

      if (sameNameIndex >= 0) {
        const existing = entries[sameNameIndex];
        if (isAbsolutePath(incoming) && !isAbsolutePath(existing)) {
          entries[sameNameIndex] = incoming;
          upgraded += 1;
          return;
        }
        if (!isAbsolutePath(incoming)) {
          skipped += 1;
          return;
        }
      }

      entries.push(incoming);
      added += 1;
    });

    return { entries, added, skipped, upgraded };
  }

  function appendImportedFiles(files) {
    const result = mergeFileEntries(state.importedFiles, files);
    state.importedFiles = result.entries;
    return result;
  }

  function importSummary(result) {
    const parts = [];
    if (result.added) parts.push(`新增 ${result.added} 个`);
    if (result.upgraded) parts.push(`补全路径 ${result.upgraded} 个`);
    if (result.skipped) parts.push(`跳过重复 ${result.skipped} 个`);
    return parts.length ? parts.join("，") : "没有新增文件";
  }

  function updateImportModeLabel() {
    const count = state.importedFiles.length;
    const suffix = count ? ` · 已导入 ${count} 个，可继续追加` : "";
    $("resultImportMode").textContent = state.localServiceAvailable
      ? `本地服务已连接 · 自动识别完整路径${suffix}`
      : `普通导入 · 本地服务未连接${suffix}`;
  }

  function setImportMode(available) {
    state.localServiceAvailable = available;
    if (!available) state.localServiceSessionToken = "";
    const button = $("smartResultFiles");
    button.classList.toggle("is-connected", available);
    updateImportModeLabel();
  }

  async function openLocalSession(signal) {
    const response = await fetch(LOCAL_API_BASE + "/api/session", {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal,
      targetAddressSpace: "loopback",
    });
    const data = await response.json();
    if (!response.ok || data.ok === false || typeof data.token !== "string" || data.token.length < 32) {
      throw new Error(data.error || `本地服务会话建立失败：${response.status}`);
    }
    state.localServiceSessionToken = data.token;
    return data.token;
  }

  async function localApi(path, options = {}, allowSessionRetry = true) {
    if (path !== "/api/health" && path !== "/api/session" && !state.localServiceSessionToken) {
      await openLocalSession(options.signal);
    }
    const headers = options.body ? { "Content-Type": "application/json" } : {};
    if (state.localServiceSessionToken) headers[SESSION_HEADER] = state.localServiceSessionToken;
    const response = await fetch(LOCAL_API_BASE + path, {
      method: options.method || "GET",
      mode: "cors",
      cache: "no-store",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      targetAddressSpace: "loopback",
    });
    const data = await response.json();
    if (response.status === 401 && allowSessionRetry) {
      state.localServiceSessionToken = "";
      await openLocalSession(options.signal);
      return localApi(path, options, false);
    }
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || `本地服务请求失败：${response.status}`);
    }
    return data;
  }

  async function detectLocalService(refreshSession = true) {
    if (state.localServiceChecking) return state.localServiceAvailable;
    state.localServiceChecking = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      if (refreshSession || !state.localServiceSessionToken) {
        await openLocalSession(controller.signal);
      }
      const health = await localApi("/api/health", { signal: controller.signal });
      if (!Array.isArray(health.features) || !health.features.includes("select-result-files")) {
        throw new Error("本地服务版本过旧，请重新下载并安装服务包");
      }
      setImportMode(true);
      return true;
    } catch (error) {
      setImportMode(false);
      return false;
    } finally {
      window.clearTimeout(timer);
      state.localServiceChecking = false;
    }
  }

  function importAbsolutePaths(paths) {
    const selectedPaths = paths.map(normalizePath).filter(isAbsolutePath);
    if (!selectedPaths.length) return null;
    const result = appendImportedFiles(selectedPaths);
    const absolutePaths = state.importedFiles.filter(isAbsolutePath);
    tryAutoFillBaseDir(absolutePaths);
    generate();
    notifyDirtyState();
    return result;
  }

  async function selectResultFiles() {
    if (!state.localServiceAvailable) {
      const connected = await detectLocalService();
      if (!connected) {
        $("resultFiles").click();
        return;
      }
    }

    const button = $("smartResultFiles");
    button.disabled = true;
    try {
      const data = await localApi("/api/select-result-files", { method: "POST", body: {} });
      const paths = (data.items || []).map((item) => item.path).filter(Boolean);
      if (!paths.length) return;
      const result = importAbsolutePaths(paths);
      if (!result) throw new Error("本地服务未返回有效的完整路径");
      toast(`${importSummary(result)}，列表共 ${state.importedFiles.length} 个`);
    } catch (error) {
      setImportMode(false);
      toast("本地服务连接已中断，请再次点击使用普通导入");
    } finally {
      button.disabled = false;
    }
  }

  function basename(path) {
    const clean = normalizePath(path);
    const name = clean.split(/[\\/]/).pop() || clean;
    return name.replace(/\.[^.]+$/, "");
  }

  function sanitizeName(value) {
    return String(value || "")
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_")
      .replace(/\s+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function unique(values) {
    const seen = new Set();
    return values.filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function parseManualFiles() {
    return $("manualFiles")
      .value.split(/\r?\n/)
      .map(normalizePath)
      .filter(Boolean);
  }

  function getResultFiles() {
    const baseDir = $("resultBaseDir").value;
    const imported = state.importedFiles.map((file) => (isAbsolutePath(file) ? file : joinPath(baseDir, file)));
    return unique([...parseManualFiles(), ...imported]);
  }

  function removeResultFile(targetFile) {
    const target = importKey(targetFile);
    const baseDir = $("resultBaseDir").value;
    state.importedFiles = state.importedFiles.filter((file) => {
      const resolved = isAbsolutePath(file) ? file : joinPath(baseDir, file);
      return importKey(resolved) !== target;
    });

    const manualFiles = parseManualFiles().filter((file) => importKey(file) !== target);
    $("manualFiles").value = manualFiles.join("\n");
    $("resultFiles").value = "";

    if (!state.importedFiles.length && !manualFiles.length && state.baseDirAutoFilled) {
      $("resultBaseDir").value = "";
      state.baseDirAutoFilled = false;
    }

    generate();
    notifyDirtyState();
    toast(`已删除 ${fileName(targetFile)}`);
  }

  function fillTemplate(template, values) {
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match;
    });
  }

  function extensionForImage(format) {
    return format.toLowerCase() === "jpeg" ? "jpg" : format.toLowerCase();
  }

  function extensionForTable(format) {
    return format.toLowerCase();
  }

  function replaceExtension(path, extension) {
    const cleanExtension = extension.replace(/^\./, "");
    return path.replace(/\.[^/.\\]+$/, "") + "." + cleanExtension;
  }

  function psString(value) {
    return String(value).replace(/'/g, "''");
  }

  function exportMode() {
    return $("imageQuality").value === "fixed" ? "fixed" : "viewport";
  }

  function renderModeLines(mode) {
    if (mode === "fixed") {
      return ["  Screen Capture = Off", "  Use Screen Size = Off"];
    }
    return ["  Screen Capture = Off", "  Use Screen Size = On"];
  }

  function sizeLines(mode, width, height) {
    if (mode !== "fixed") return [];
    return [`  Image Height = ${height}`, `  Image Width = ${width}`];
  }

  function backgroundValue() {
    const mode = $("backgroundMode").value;
    if (mode === "white") return "On";
    if (mode === "transparent") return "Off";
    return "Off";
  }

  function configureExportModeControl() {
    const select = $("imageQuality");
    const label = select.closest("label");
    const labelText = label?.querySelector("span");
    if (labelText) labelText.textContent = "导出模式";

    select.innerHTML = "";
    [
      ["viewport", "与当前 POST 视窗一致（推荐）"],
      ["fixed", "固定分辨率高清重绘"],
    ].forEach(([value, text]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.appendChild(option);
    });
    select.value = "viewport";

    const sizeGrid = $("imageWidth").closest(".field-grid");
    if (sizeGrid && !$("exportModeNote")) {
      const note = document.createElement("div");
      note.id = "exportModeNote";
      note.setAttribute("role", "note");
      note.style.marginTop = "10px";
      note.style.padding = "10px 12px";
      note.style.border = "1px solid rgba(59, 130, 246, 0.24)";
      note.style.borderRadius = "10px";
      note.style.background = "rgba(59, 130, 246, 0.07)";
      note.style.fontSize = "13px";
      note.style.lineHeight = "1.6";
      sizeGrid.insertAdjacentElement("afterend", note);
    }

    const template = $("imageTemplate");
    if (template.value.includes("{qualityLines}") || !template.value.includes("{renderModeLines}")) {
      template.value = defaultImageTemplate;
    }
  }

  function updateExportModeUi() {
    const mode = exportMode();
    const fixed = mode === "fixed";
    [$("imageWidth"), $("imageHeight")].forEach((input) => {
      input.disabled = !fixed;
      const label = input.closest("label");
      if (label) label.style.opacity = fixed ? "1" : "0.55";
    });

    const note = $("exportModeNote");
    if (!note) return;
    if (fixed) {
      note.innerHTML = "<strong>固定分辨率高清重绘：</strong>CFX-Post 会按设定宽高离屏重绘。请在 <code>Edit → Options → Common → Viewer Setup</code> 中启用 <strong>Use GPU Rendering for Printing</strong>，否则复杂表面可能出现接缝、断线或边界缺口。";
      note.style.borderColor = "rgba(245, 158, 11, 0.32)";
      note.style.background = "rgba(245, 158, 11, 0.08)";
    } else {
      note.innerHTML = "<strong>与当前 POST 视窗一致：</strong>按当前 Viewer 尺寸和当前视图进行 GPU/打印渲染，保持当前视角、缩放、宽高比和窗口像素尺寸，同时避免读取异常屏幕捕获缓冲区（可消除图片顶部黑条）。图片尺寸由当前 Viewer 窗口决定，因此宽度和高度设置已停用。";
      note.style.borderColor = "rgba(59, 130, 246, 0.24)";
      note.style.background = "rgba(59, 130, 246, 0.07)";
    }
  }

  function renderItems(containerId, list, type) {
    const container = $(containerId);
    container.innerHTML = "";

    list.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "list-item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = item.enabled;
      checkbox.addEventListener("change", () => {
        item.enabled = checkbox.checked;
        generate();
        scheduleDraftSave();
      });

      const name = document.createElement("input");
      name.type = "text";
      name.value = item.name;
      name.placeholder = type === "view" ? "例如 VIEW1" : "例如 B1";
      name.addEventListener("input", () => {
        item.name = name.value;
        if (!item.aliasEdited) {
          item.alias = name.value;
          alias.value = name.value;
        }
        generate();
        scheduleDraftSave();
      });

      const alias = document.createElement("input");
      alias.type = "text";
      alias.value = item.alias;
      alias.className = "item-alias";
      alias.placeholder = type === "view" ? "导出名，例如 streamline" : "导出名，例如 torque";
      alias.addEventListener("input", () => {
        item.alias = alias.value;
        item.aliasEdited = alias.value !== item.name;
        generate();
        scheduleDraftSave();
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-item";
      remove.textContent = "x";
      remove.title = "删除";
      remove.addEventListener("click", () => {
        list.splice(index, 1);
        renderAllItems();
        generate();
        scheduleDraftSave();
      });

      row.append(checkbox, name, alias, remove);
      container.appendChild(row);
    });
  }

  function renderAllItems() {
    renderItems("viewsList", state.views, "view");
    renderItems("tablesList", state.tables, "table");
  }

  function renderFileList() {
    const list = $("fileList");
    const files = getResultFiles();
    list.innerHTML = "";
    files.forEach((file) => {
      const pill = document.createElement("div");
      pill.className = "file-pill";

      const path = document.createElement("span");
      path.className = "file-pill-path";
      path.textContent = file;
      path.title = file;

      const name = document.createElement("strong");
      name.textContent = basename(file);

      const removeButton = document.createElement("button");
      removeButton.className = "file-remove-button";
      removeButton.type = "button";
      removeButton.textContent = "删除";
      removeButton.title = `删除 ${fileName(file)}`;
      removeButton.setAttribute("aria-label", `删除 ${fileName(file)}`);
      removeButton.addEventListener("click", () => removeResultFile(file));

      pill.append(path, name, removeButton);
      list.appendChild(pill);
    });
    updateImportModeLabel();
  }

  function getImageValues(resultFile, view) {
    const caseName = sanitizeName(basename(resultFile));
    const viewName = view.name.trim();
    const viewAlias = sanitizeName(view.alias || viewName);
    const imageFormat = $("imageFormat").value;
    const prefix = fillTemplate($("imagePrefix").value || "{case}_{view}", {
      case: caseName,
      view: viewAlias,
      viewName,
    });
    const imageFile = cfxPath(joinPath($("imageDir").value, `${sanitizeName(prefix)}.${extensionForImage(imageFormat)}`));
    const mode = exportMode();
    const imageWidth = $("imageWidth").value || "1920";
    const imageHeight = $("imageHeight").value || "1080";

    return {
      resultFile: cfxPath(resultFile),
      case: caseName,
      view: viewName,
      viewAlias,
      imageFile,
      imageFormat,
      imageWidth,
      imageHeight,
      exportMode: mode,
      antiAlias: $("antiAlias").checked ? "On" : "Off",
      renderModeLines: renderModeLines(mode).join("\n"),
      sizeLines: sizeLines(mode, imageWidth, imageHeight).join("\n"),
      whiteBackground: backgroundValue(),
    };
  }

  function getTableValues(resultFile, table) {
    const caseName = sanitizeName(basename(resultFile));
    const tableName = table.name.trim();
    const tableAlias = sanitizeName(table.alias || tableName);
    const tableFormat = $("tableFormat").value;
    const prefix = fillTemplate($("tablePrefix").value || "{case}_{table}", {
      case: caseName,
      table: tableAlias,
      tableName,
    });
    const tableFile = cfxPath(joinPath($("tableDir").value, `${sanitizeName(prefix)}.${extensionForTable(tableFormat)}`));
    const tableSaveFile = tableFormat === "txt" ? replaceExtension(tableFile, "csv") : tableFile;

    return {
      resultFile: cfxPath(resultFile),
      case: caseName,
      table: tableName,
      tableAlias,
      tableFile,
      tableSaveFile,
      tableFormat,
      delimiter: $("delimiter").value,
    };
  }

  function buildConverterScript() {
    const files = getResultFiles();
    const tables = state.tables.filter((table) => table.enabled && table.name.trim());
    const shouldExportTables = $("exportTables").checked;

    if (!shouldExportTables || $("tableFormat").value !== "txt") {
      return "# 仅当勾选输出表格且表格格式选择 TXT 时需要运行转换脚本。\n# 当前设置不需要 CSV 转 TXT。";
    }

    if (!files.length || !tables.length) {
      return "# 请先选择结果文件和表格对象。";
    }

    const lines = [
      "# CFX-Post CSV to centered TXT converter",
      "# Run this PowerShell script after the CFX-Post command finishes exporting CSV files.",
      "$ErrorActionPreference = 'Stop'",
      "",
      "function Center-Text {",
      "  param([string]$Text, [int]$Width)",
      "  $pad = $Width - $Text.Length",
      "  if ($pad -le 0) { return $Text }",
      "  $left = [Math]::Floor($pad / 2)",
      "  $right = $pad - $left",
      "  return (' ' * $left) + $Text + (' ' * $right)",
      "}",
      "",
      "function Convert-CsvToCenteredTxt {",
      "  param([string]$CsvPath, [string]$TxtPath)",
      "  if (-not (Test-Path -LiteralPath $CsvPath)) { Write-Warning \"Missing CSV: $CsvPath\"; return }",
      "  $rows = @()",
      "  foreach ($line in Get-Content -LiteralPath $CsvPath) {",
      "    $cols = $line -split ',', -1",
      "    for ($i = 0; $i -lt $cols.Count; $i++) { $cols[$i] = $cols[$i].Trim() }",
      "    $rows += ,$cols",
      "  }",
      "  $widths = @()",
      "  foreach ($row in $rows) {",
      "    for ($i = 0; $i -lt $row.Count; $i++) {",
      "      $len = $row[$i].Length",
      "      if ($widths.Count -le $i) { $widths += $len } elseif ($len -gt $widths[$i]) { $widths[$i] = $len }",
      "    }",
      "  }",
      "  $outLines = foreach ($row in $rows) {",
      "    $cells = for ($i = 0; $i -lt $row.Count; $i++) { Center-Text $row[$i] $widths[$i] }",
      "    $cells -join '  '",
      "  }",
      "  Set-Content -LiteralPath $TxtPath -Value $outLines -Encoding UTF8",
      "  Remove-Item -LiteralPath $CsvPath -Force",
      "}",
      "",
    ];

    files.forEach((resultFile) => {
      tables.forEach((table) => {
        const values = getTableValues(resultFile, table);
        lines.push(`Convert-CsvToCenteredTxt -CsvPath '${psString(values.tableSaveFile)}' -TxtPath '${psString(values.tableFile)}'`);
      });
    });

    return lines.join("\n");
  }

  function buildCommand() {
    const files = getResultFiles();
    const views = state.views.filter((view) => view.enabled && view.name.trim());
    const tables = state.tables.filter((table) => table.enabled && table.name.trim());
    const shouldExportImages = $("exportImages").checked;
    const shouldExportTables = $("exportTables").checked;
    const mode = exportMode();
    const lines = [
      "# CFX-Post batch export command",
      `# Target: ANSYS CFX-Post ${$("postVersion").value}`,
      `# Image mode: ${mode === "fixed" ? "fixed-resolution off-screen rendering" : "current Viewer-sized rendering"}`,
      `# Generated: ${new Date().toLocaleString()}`,
      "",
      "COMMAND FILE:",
      `  CFX Post Version = ${$("postVersion").value}`,
      "END",
      "",
    ];

    if (!files.length) {
      lines.push("# 请先导入结果文件，或在结果文件列表中粘贴完整路径。");
      return lines.join("\n");
    }

    if (!shouldExportImages && !shouldExportTables) {
      lines.push("# 当前未勾选图片或表格输出。");
      return lines.join("\n");
    }

    files.forEach((resultFile, fileIndex) => {
      const loadMode = $("loadMode").value === "append" && fileIndex > 0 ? "append" : "replace";
      lines.push(`# ===== ${basename(resultFile)} =====`);
      lines.push(fillTemplate($("loadTemplate").value, { resultFile: cfxPath(resultFile), loadMode }));
      lines.push("");

      if (shouldExportImages) {
        if (!views.length) {
          lines.push("# 未选择任何图片视图。");
        } else {
          views.forEach((view) => {
            const values = getImageValues(resultFile, view);
            const command = fillTemplate($("viewTemplate").value, values);
            const imageCommand = fillTemplate($("imageTemplate").value, values);
            lines.push(`# Image: ${values.view} -> ${values.imageFile}`);
            if (values.exportMode === "fixed") {
              lines.push("# Fixed-resolution rendering: enable Use GPU Rendering for Printing in CFX-Post to reduce surface seams.");
            } else {
              lines.push("# Current Viewer-sized rendering: output size follows the current CFX-Post Viewer window, rendered off-screen to avoid screen-capture artifacts.");
            }
            lines.push(command);
            lines.push(imageCommand);
            if ($("backgroundMode").value === "transparent") {
              lines.push("# 注意：透明背景是否生效取决于 CFX-Post 当前图片格式和版本支持。");
            }
            lines.push("");
          });
        }
      }

      if (shouldExportTables) {
        if (!tables.length) {
          lines.push("# 未选择任何表格对象。");
        } else {
          tables.forEach((table) => {
            const values = getTableValues(resultFile, table);
            lines.push(`# Table: ${values.table} -> ${values.tableFile}`);
            lines.push(fillTemplate($("tableTemplate").value, values));
            lines.push("");
          });
        }
      }
    });

    return lines.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  function generate() {
    updateExportModeUi();
    renderFileList();
    const files = getResultFiles();
    const selectedViews = state.views.filter((item) => item.enabled && item.name.trim()).length;
    const selectedTables = state.tables.filter((item) => item.enabled && item.name.trim()).length;
    $("commandOutput").value = buildCommand();
    $("converterOutput").value = buildConverterScript();
    $("converterMeta").textContent =
      $("exportTables").checked && $("tableFormat").value === "txt"
        ? "CFX-Post 导出 CSV 后运行此脚本"
        : "当前设置不需要转换";
    const modeLabel = exportMode() === "fixed" ? "固定分辨率重绘" : "当前视窗尺寸渲染";
    $("commandMeta").textContent = `${files.length} 个结果文件，${selectedViews} 个视图，${selectedTables} 个表格 · ${modeLabel}`;
  }

  function toast(message) {
    const toastEl = $("toast");
    toastEl.textContent = message;
    toastEl.classList.add("show");
    window.clearTimeout(toastEl.timer);
    toastEl.timer = window.setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  function downloadCommand() {
    const blob = new Blob([$("commandOutput").value], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "cfx-post-batch-export.cse";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function downloadConverter() {
    const blob = new Blob([$("converterOutput").value], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "convert-cfx-tables-to-centered-txt.ps1";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  $("resultFiles").addEventListener("change", (event) => {
    const files = Array.from(event.target.files || []);
    if (state.baseDirAutoFilled) {
      $("resultBaseDir").value = "";
      state.baseDirAutoFilled = false;
    }
    const result = appendImportedFiles(files.map((file) => file.name));
    event.target.value = "";
    generate();
    notifyDirtyState();
    toast(`${importSummary(result)}，列表共 ${state.importedFiles.length} 个`);
  });

  $("smartResultFiles").addEventListener("click", selectResultFiles);

  $("resultBaseDir").addEventListener("input", () => {
    state.baseDirAutoFilled = false;
    notifyDirtyState();
  });

  $("manualFiles").addEventListener("input", () => {
    tryAutoFillBaseDir(parseManualFiles());
    generate();
    notifyDirtyState();
  });

  $("addView").addEventListener("click", () => {
    const next = state.views.length + 1;
    state.views.push({ enabled: true, name: `VIEW${next}`, alias: `VIEW${next}`, aliasEdited: false });
    renderAllItems();
    generate();
    scheduleDraftSave();
  });

  $("addTable").addEventListener("click", () => {
    const next = state.tables.length + 1;
    state.tables.push({ enabled: true, name: `B${next}`, alias: `B${next}`, aliasEdited: false });
    renderAllItems();
    generate();
    scheduleDraftSave();
  });

  $("copyCommand").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("commandOutput").value);
      toast("代码已复制");
    } catch (error) {
      $("commandOutput").select();
      document.execCommand("copy");
      toast("代码已选中并复制");
    }
  });

  $("downloadCommand").addEventListener("click", downloadCommand);

  $("copyConverter").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("converterOutput").value);
      toast("转换脚本已复制");
    } catch (error) {
      $("converterOutput").select();
      document.execCommand("copy");
      toast("转换脚本已选中并复制");
    }
  });

  $("downloadConverter").addEventListener("click", downloadConverter);

  $("saveConfigProfile").addEventListener("click", saveCurrentProfile);
  $("loadConfigProfile").addEventListener("click", loadSelectedProfile);
  $("deleteConfigProfile").addEventListener("click", deleteSelectedProfile);
  $("exportConfigProfile").addEventListener("click", exportConfigJson);
  $("importConfigProfile").addEventListener("click", () => $("configImportFile").click());
  $("configImportFile").addEventListener("change", async (event) => {
    const [file] = Array.from(event.target.files || []);
    await importConfigJson(file);
    event.target.value = "";
  });
  $("configProfileSelect").addEventListener("change", () => {
    state.profileNameDirty = false;
    updateProfileControls();
    notifyDirtyState();
  });
  $("configProfileName").addEventListener("input", () => {
    if (state.initializing) return;
    state.profileNameDirty = true;
    notifyDirtyState();
  });

  configureExportModeControl();

  fields.forEach((id) => {
    const el = $(id);
    const eventName = el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input";
    el.addEventListener(eventName, () => {
      generate();
      if (configFieldIds.includes(id)) scheduleDraftSave();
    });
  });

  state.profiles = readProfiles();
  renderProfileOptions();
  const draftRestored = restoreDraft();
  if (!draftRestored) {
    renderAllItems();
    generate();
  }
  state.initializing = false;
  state.configDirty = false;
  state.profileNameDirty = false;
  notifyDirtyState(true);

  window.PostExporterImportDiagnostics = {
    version: "2.4.0",
    runSelfTest() {
      const first = mergeFileEntries([], ["case-a.res", "case-b.res"]);
      const second = mergeFileEntries(first.entries, ["case-b.res", "case-c.res"]);
      const upgraded = mergeFileEntries(second.entries, ["D:\\CFX\\case-a.res"]);
      const crossDirectory = mergeFileEntries(upgraded.entries, ["E:\\cases\\case-d.res"]);
      const sameNameDifferentDirectory = mergeFileEntries(crossDirectory.entries, ["F:\\archive\\case-d.res"]);
      const passed =
        first.entries.length === 2 &&
        second.entries.length === 3 &&
        second.added === 1 &&
        second.skipped === 1 &&
        upgraded.entries.length === 3 &&
        upgraded.upgraded === 1 &&
        crossDirectory.entries.length === 4 &&
        crossDirectory.entries.includes("E:\\cases\\case-d.res") &&
        sameNameDifferentDirectory.entries.length === 5;
      return { passed, first, second, upgraded, crossDirectory, sameNameDifferentDirectory };
    },
  };

  window.PostExporterConfigDiagnostics = {
    version: "1.0.0",
    storageKeys: { profiles: PROFILE_STORAGE_KEY, draft: DRAFT_STORAGE_KEY },
    captureConfig,
    exportPayload: configExportPayload,
    runSelfTest() {
      const captured = captureConfig();
      const normalized = normalizeConfig(captured);
      const serialized = JSON.stringify({ config: captured });
      const forbiddenKeys = [
        "resultBaseDir",
        "manualFiles",
        "importedFiles",
        "localServiceSessionToken",
        "sessionToken",
      ];
      const leakedKeys = forbiddenKeys.filter((key) => serialized.includes(`\"${key}\"`));
      return {
        passed:
          leakedKeys.length === 0 &&
          Object.keys(normalized.values).length === configFieldIds.length &&
          normalized.views.length === state.views.length &&
          normalized.tables.length === state.tables.length,
        leakedKeys,
        configFieldCount: Object.keys(captured.values).length,
        viewCount: state.views.length,
        tableCount: state.tables.length,
      };
    },
  };

  window.addEventListener("beforeunload", (event) => {
    if (window.parent !== window || !state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
  window.addEventListener("pagehide", () => {
    if (state.configDirty) saveDraftNow();
  });

  setImportMode(false);
  detectLocalService();
  window.addEventListener("focus", detectLocalService);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") detectLocalService();
  });
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== "pelton-local-service-status") return;
    if (event.data.connected) {
      if (typeof event.data.sessionToken === "string" && event.data.sessionToken.length >= 32) {
        state.localServiceSessionToken = event.data.sessionToken;
      }
      detectLocalService(false);
    } else setImportMode(false);
  });
})();
