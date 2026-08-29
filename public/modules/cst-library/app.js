"use strict";

(() => {
  const RECORDS_KEY = "cfxpost_cst_library_v1";
  const HIDDEN_LEGACY_KEY = "cfxpost_cst_hidden_legacy_v1";
  const FORMULA_ITEMS_KEY = "cfxpost_command_library_v1";
  const SKIN_KEY = "pelton-toolbox-skin-v1";
  const FILE_HANDLE_DB = "cfxpost_file_handles_v1";
  const FILE_HANDLE_STORE = "handles";
  const DIRECTORY_HANDLE_KEY = "attachmentDirectory";
  const CST_ROOT = "cst-records";
  const LEGACY_ROOT = "items";
  const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
  const MAX_IMAGES = 12;

  const $ = (selector) => document.querySelector(selector);
  const state = {
    records: [],
    hiddenLegacy: new Set(),
    directory: { handle: null, name: "", permission: "unknown", busy: false },
    query: "",
    activeId: "",
    previewUrls: [],
    lightboxUrl: "",
  };

  function applyStoredSkin() {
    const skin = localStorage.getItem(SKIN_KEY) || "tech-neon";
    document.documentElement.dataset.peltonSkin = skin;
  }

  function uid(prefix = "cst") {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function now() {
    return new Date().toISOString();
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function safeSegment(value) {
    return String(value || "")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\.\.+/g, "_")
      .trim()
      .slice(0, 180);
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function formatBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
    return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "未知时间"
      : date.toLocaleString("zh-CN", { hour12: false, year: "numeric", month: "2-digit", day: "2-digit" });
  }

  function normalizeFileRef(value, fallbackRoot = LEGACY_ROOT) {
    if (!value || typeof value !== "object") return null;
    const storedName = safeSegment(value.storedName);
    const directory = safeSegment(value.directory);
    if (!storedName || !directory) return null;
    return {
      id: String(value.id || storedName).slice(0, 120),
      name: String(value.name || storedName).trim().slice(0, 220) || storedName,
      kind: value.kind === "image" ? "image" : "cst",
      mimeType: String(value.mimeType || "application/octet-stream").slice(0, 120),
      size: Math.max(0, Number(value.size) || 0),
      root: safeSegment(value.root || fallbackRoot) || fallbackRoot,
      directory,
      storedName,
      addedAt: value.addedAt || "",
      localOnly: true,
    };
  }

  function normalizeRecord(value) {
    const record = value && typeof value === "object" ? value : {};
    const file = normalizeFileRef(record.file, record.legacyKey ? LEGACY_ROOT : CST_ROOT);
    if (!file) return null;
    return {
      id: String(record.id || uid()).slice(0, 120),
      title: String(record.title || file.name.replace(/\.cst$/i, "") || "未命名 CST").trim().slice(0, 100),
      version: String(record.version || "").trim().slice(0, 80),
      tags: Array.isArray(record.tags)
        ? record.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20)
        : String(record.tags || "").split(/[,，;；\n]+/).map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
      description: String(record.description || "").trim().slice(0, 4000),
      notes: String(record.notes || "").trim().slice(0, 4000),
      file,
      images: (Array.isArray(record.images) ? record.images : [])
        .map((image) => normalizeFileRef(image, CST_ROOT))
        .filter(Boolean)
        .slice(0, MAX_IMAGES),
      legacyKey: String(record.legacyKey || ""),
      sourceItemId: String(record.sourceItemId || ""),
      sourceItemTitle: String(record.sourceItemTitle || ""),
      assetsDirectory: safeSegment(record.assetsDirectory || `record-${record.id || file.id}`),
      createdAt: record.createdAt || file.addedAt || now(),
      updatedAt: record.updatedAt || record.createdAt || now(),
    };
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function saveRecords() {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(state.records));
    localStorage.setItem(HIDDEN_LEGACY_KEY, JSON.stringify([...state.hiddenLegacy]));
  }

  function migrateLegacyCstRefs() {
    const formulaItems = readJson(FORMULA_ITEMS_KEY, []);
    if (!Array.isArray(formulaItems)) return 0;
    const existingLegacy = new Set(state.records.map((record) => record.legacyKey).filter(Boolean));
    let added = 0;
    for (const item of formulaItems) {
      const attachments = Array.isArray(item?.attachments) ? item.attachments : [];
      for (const rawFile of attachments) {
        if (rawFile?.kind !== "cst") continue;
        const file = normalizeFileRef(rawFile, LEGACY_ROOT);
        if (!file) continue;
        const legacyKey = `${file.root}/${file.directory}/${file.storedName}`;
        if (existingLegacy.has(legacyKey) || state.hiddenLegacy.has(legacyKey)) continue;
        const createdAt = file.addedAt || item.createdAt || now();
        state.records.push(normalizeRecord({
          id: `legacy-${stableHash(legacyKey)}`,
          title: file.name.replace(/\.cst$/i, ""),
          version: item.version || "",
          tags: ["来自公式命令库", ...(Array.isArray(item.tags) ? item.tags.slice(0, 4) : [])],
          description: item.description || `原关联条目：${item.title || "未命名条目"}`,
          notes: "",
          file,
          images: [],
          legacyKey,
          sourceItemId: item.id || "",
          sourceItemTitle: item.title || "",
          assetsDirectory: `record-legacy-${stableHash(legacyKey)}`,
          createdAt,
          updatedAt: item.updatedAt || createdAt,
        }));
        existingLegacy.add(legacyKey);
        added += 1;
      }
    }
    if (added) saveRecords();
    return added;
  }

  function loadRecords() {
    state.records = (Array.isArray(readJson(RECORDS_KEY, [])) ? readJson(RECORDS_KEY, []) : [])
      .map(normalizeRecord)
      .filter(Boolean);
    state.hiddenLegacy = new Set(Array.isArray(readJson(HIDDEN_LEGACY_KEY, [])) ? readJson(HIDDEN_LEGACY_KEY, []) : []);
    migrateLegacyCstRefs();
  }

  function openFileHandleDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(FILE_HANDLE_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(FILE_HANDLE_STORE)) {
          request.result.createObjectStore(FILE_HANDLE_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function directoryHandleRecord(mode, value) {
    if (!("indexedDB" in window)) return null;
    const db = await openFileHandleDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(FILE_HANDLE_STORE, mode === "get" ? "readonly" : "readwrite");
      const store = transaction.objectStore(FILE_HANDLE_STORE);
      const request = mode === "get"
        ? store.get(DIRECTORY_HANDLE_KEY)
        : store.put(value, DIRECTORY_HANDLE_KEY);
      request.onsuccess = () => {
        if (mode === "get") resolve(request.result || null);
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => {
        db.close();
        if (mode !== "get") resolve(null);
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    });
  }

  const supportsDirectory = () => typeof window.showDirectoryPicker === "function" && "indexedDB" in window;

  async function initializeDirectory() {
    if (!supportsDirectory()) {
      updateDirectoryUi();
      return;
    }
    try {
      const handle = await directoryHandleRecord("get");
      if (handle) {
        state.directory.handle = handle;
        state.directory.name = handle.name || "本地资料目录";
        state.directory.permission = await handle.queryPermission({ mode: "readwrite" });
      }
    } catch (error) {
      console.warn("恢复 CST 资料目录失败", error);
    }
    updateDirectoryUi();
    renderRecords();
  }

  async function connectDirectory(forceNew) {
    if (!supportsDirectory()) return;
    state.directory.busy = true;
    updateDirectoryUi();
    try {
      let handle = forceNew ? null : state.directory.handle;
      if (handle) {
        const permission = await handle.requestPermission({ mode: "readwrite" });
        if (permission !== "granted") throw new Error("未获得资料目录读写权限");
      } else {
        handle = await window.showDirectoryPicker({ id: "cfx-post-library-attachments", mode: "readwrite" });
      }
      await handle.getDirectoryHandle(LEGACY_ROOT, { create: true });
      await handle.getDirectoryHandle(CST_ROOT, { create: true });
      await directoryHandleRecord("put", handle);
      state.directory.handle = handle;
      state.directory.name = handle.name || "本地资料目录";
      state.directory.permission = "granted";
      toast(`已连接：${state.directory.name}`);
    } catch (error) {
      if (error?.name !== "AbortError") toast(error?.message || "资料目录连接失败");
    } finally {
      state.directory.busy = false;
      updateDirectoryUi();
      renderRecords();
    }
  }

  async function requireDirectory() {
    if (!state.directory.handle) throw new Error("请先连接本地资料目录");
    let permission = await state.directory.handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") permission = await state.directory.handle.requestPermission({ mode: "readwrite" });
    state.directory.permission = permission;
    updateDirectoryUi();
    if (permission !== "granted") throw new Error("未获得资料目录读写权限");
    return state.directory.handle;
  }

  function updateDirectoryUi() {
    const status = $("#directoryStatus");
    const hint = $("#directoryHint");
    const connect = $("#connectDirectoryBtn");
    const change = $("#changeDirectoryBtn");
    const add = $("#addCstBtn");
    if (!supportsDirectory()) {
      status.textContent = "当前浏览器不支持本地资料目录";
      hint.textContent = "请使用最新版 Microsoft Edge 或 Google Chrome。";
      connect.textContent = "浏览器不支持";
      connect.disabled = true;
      change.classList.add("hidden");
      add.disabled = true;
      return;
    }
    if (state.directory.busy) {
      status.textContent = "正在处理资料目录…";
      connect.disabled = true;
      change.disabled = true;
      add.disabled = true;
      return;
    }
    if (!state.directory.handle) {
      status.textContent = "尚未连接本地资料目录";
      hint.textContent = "首次使用请选择原公式库附件目录；已有 CST 会自动显示。";
      connect.textContent = "连接资料目录";
      connect.disabled = false;
      change.classList.add("hidden");
      add.disabled = true;
      return;
    }
    const granted = state.directory.permission === "granted";
    status.textContent = granted ? `已连接：${state.directory.name}` : `需要重新授权：${state.directory.name}`;
    hint.textContent = granted
      ? "CST 与提醒图片直接读写该文件夹；浏览器数据库只保存轻量索引和文字说明。"
      : "浏览器重启后可能需要重新授权一次，原文件和资料索引不会丢失。";
    connect.textContent = granted ? "目录授权正常" : "重新授权";
    connect.disabled = false;
    change.classList.remove("hidden");
    change.disabled = false;
    add.disabled = !granted;
  }

  async function resolveFile(reference) {
    const root = await requireDirectory();
    const rootDirectory = await root.getDirectoryHandle(reference.root || LEGACY_ROOT);
    const recordDirectory = await rootDirectory.getDirectoryHandle(reference.directory);
    const fileHandle = await recordDirectory.getFileHandle(reference.storedName);
    return fileHandle.getFile();
  }

  async function downloadFile(reference) {
    try {
      const file = await resolveFile(reference);
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = reference.name;
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        anchor.remove();
      }, 1000);
    } catch (error) {
      toast(`无法读取文件：${error?.message || "请检查目录授权"}`);
    }
  }

  async function writeFileToDirectory(directoryHandle, file, prefix, kind, rootName, directoryName) {
    const id = uid(kind === "image" ? "img" : "file");
    const safeName = safeSegment(file.name) || `${kind === "image" ? "image" : "file"}.${kind === "cst" ? "cst" : "bin"}`;
    const storedName = `${prefix}-${id}__${safeName}`;
    const handle = await directoryHandle.getFileHandle(storedName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
    return normalizeFileRef({
      id,
      name: file.name,
      kind,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      root: rootName,
      directory: directoryName,
      storedName,
      addedAt: now(),
    }, rootName);
  }

  async function addCstFiles(fileList) {
    const files = [...(fileList || [])].filter((file) => file.name.toLowerCase().endsWith(".cst"));
    $("#cstFileInput").value = "";
    if (!files.length) return toast("请选择 .CST 文件");
    let root;
    try {
      root = await requireDirectory();
    } catch (error) {
      return toast(error.message);
    }
    const cstRoot = await root.getDirectoryHandle(CST_ROOT, { create: true });
    let added = 0;
    for (const file of files) {
      const recordId = uid("cst");
      const directoryName = `record-${safeSegment(recordId)}`;
      try {
        const directory = await cstRoot.getDirectoryHandle(directoryName, { create: true });
        const reference = await writeFileToDirectory(directory, file, "cst", "cst", CST_ROOT, directoryName);
        state.records.unshift(normalizeRecord({
          id: recordId,
          title: file.name.replace(/\.cst$/i, ""),
          tags: [],
          description: "",
          notes: "",
          file: reference,
          images: [],
          assetsDirectory: directoryName,
          createdAt: now(),
          updatedAt: now(),
        }));
        added += 1;
      } catch (error) {
        console.warn("保存 CST 文件失败", error);
      }
    }
    saveRecords();
    renderRecords();
    toast(added ? `已添加 ${added} 个 CST 文件` : "CST 文件保存失败");
    if (added === 1) openEditor(state.records[0].id);
  }

  async function addImages(fileList) {
    const record = activeRecord();
    $("#imageFileInput").value = "";
    if (!record) return;
    const files = [...(fileList || [])].filter((file) => file.type.startsWith("image/") && file.size <= MAX_IMAGE_BYTES);
    if (!files.length) return toast("请选择不超过 20 MB 的 PNG、JPG、WEBP 或 GIF 图片");
    if (record.images.length >= MAX_IMAGES) return toast(`每个 CST 最多保存 ${MAX_IMAGES} 张提醒图片`);
    let root;
    try {
      root = await requireDirectory();
    } catch (error) {
      return toast(error.message);
    }
    const cstRoot = await root.getDirectoryHandle(CST_ROOT, { create: true });
    const directoryName = record.assetsDirectory || `record-${safeSegment(record.id)}`;
    const directory = await cstRoot.getDirectoryHandle(directoryName, { create: true });
    let added = 0;
    for (const file of files.slice(0, MAX_IMAGES - record.images.length)) {
      try {
        const reference = await writeFileToDirectory(directory, file, "image", "image", CST_ROOT, directoryName);
        record.images.push(reference);
        added += 1;
      } catch (error) {
        console.warn("保存提醒图片失败", error);
      }
    }
    record.assetsDirectory = directoryName;
    record.updatedAt = now();
    saveRecords();
    renderEditorImages();
    renderRecords();
    toast(added ? `已添加 ${added} 张提醒图片` : "提醒图片保存失败");
  }

  function releasePreviewUrls() {
    state.previewUrls.forEach((url) => URL.revokeObjectURL(url));
    state.previewUrls = [];
  }

  async function loadPreview(reference, target) {
    if (!reference || !target || state.directory.permission !== "granted") return;
    try {
      const file = await resolveFile(reference);
      const url = URL.createObjectURL(file);
      state.previewUrls.push(url);
      const image = document.createElement("img");
      image.src = url;
      image.alt = `提醒图片：${reference.name}`;
      target.textContent = "";
      target.appendChild(image);
    } catch {
      target.textContent = "图片未找到";
    }
  }

  function filteredRecords() {
    const query = state.query.trim().toLocaleLowerCase("zh-CN");
    const records = [...state.records].sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
    if (!query) return records;
    return records.filter((record) => [
      record.title,
      record.file.name,
      record.version,
      record.description,
      record.notes,
      record.sourceItemTitle,
      ...record.tags,
    ].join("\n").toLocaleLowerCase("zh-CN").includes(query));
  }

  function renderRecords() {
    releasePreviewUrls();
    const records = filteredRecords();
    $("#librarySummary").textContent = state.query
      ? `找到 ${records.length} 项，共保存 ${state.records.length} 项`
      : `共保存 ${state.records.length} 项；其中 ${state.records.filter((record) => record.legacyKey).length} 项来自原公式命令库`;
    if (!records.length) {
      $("#recordGrid").innerHTML = `<div class="empty-state"><div><b>${state.query ? "没有匹配的 CST 资料" : "还没有保存 CST 文件"}</b><p>${state.query ? "请尝试其他文件名、标签或说明。" : "连接本地资料目录后，点击“添加 CST 文件”开始建立资料卡片。"}</p></div></div>`;
      return;
    }
    $("#recordGrid").innerHTML = records.map((record) => `
      <article class="record-card" data-record-id="${escapeHtml(record.id)}">
        <div class="record-cover" data-card-cover="${escapeHtml(record.id)}">
          <span class="cst-glyph">CST</span>
          ${record.images.length ? `<span class="image-count">图片 ${record.images.length}</span>` : ""}
        </div>
        <div class="record-content">
          <div class="record-topline"><span>${escapeHtml(record.version || "未标注版本")}</span>${record.legacyKey ? '<span class="legacy">原公式库资料</span>' : `<span>${escapeHtml(formatDate(record.updatedAt))}</span>`}</div>
          <h3 title="${escapeHtml(record.title)}">${escapeHtml(record.title)}</h3>
          <div class="file-name" title="${escapeHtml(record.file.name)}">${escapeHtml(record.file.name)} · ${formatBytes(record.file.size)}</div>
          <p class="record-description">${escapeHtml(record.description || record.notes || "尚未填写文件内容说明。")}</p>
          <div class="record-tags">${record.tags.slice(0, 4).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
          <div class="record-actions"><button class="button ghost" type="button" data-action="download">下载 CST</button><button class="button secondary" type="button" data-action="edit">查看与编辑</button></div>
        </div>
      </article>`).join("");
    records.forEach((record) => {
      if (!record.images[0]) return;
      const target = $(`[data-card-cover="${CSS.escape(record.id)}"]`);
      loadPreview(record.images[0], target);
    });
  }

  function activeRecord() {
    return state.records.find((record) => record.id === state.activeId) || null;
  }

  function openEditor(recordId) {
    const record = state.records.find((item) => item.id === recordId);
    if (!record) return;
    state.activeId = record.id;
    $("#recordId").value = record.id;
    $("#recordTitle").value = record.title;
    $("#recordVersion").value = record.version;
    $("#recordTags").value = record.tags.join(", ");
    $("#recordDescription").value = record.description;
    $("#recordNotes").value = record.notes;
    $("#editorFileSummary").innerHTML = `<b>${escapeHtml(record.file.name)}</b><span>${formatBytes(record.file.size)} · ${record.legacyKey ? `原关联条目：${escapeHtml(record.sourceItemTitle || "公式命令库")}` : "独立 CST 资料"}</span>`;
    $("#editorBackdrop").hidden = false;
    document.body.style.overflow = "hidden";
    renderEditorImages();
    $("#recordTitle").focus();
  }

  function closeEditor() {
    $("#editorBackdrop").hidden = true;
    document.body.style.overflow = "";
    state.activeId = "";
  }

  function saveEditor() {
    const record = activeRecord();
    if (!record) return;
    const title = $("#recordTitle").value.trim();
    if (!title) return toast("请填写资料名称");
    record.title = title.slice(0, 100);
    record.version = $("#recordVersion").value.trim().slice(0, 80);
    record.tags = $("#recordTags").value.split(/[,，;；\n]+/).map((tag) => tag.trim()).filter(Boolean).slice(0, 20);
    record.description = $("#recordDescription").value.trim().slice(0, 4000);
    record.notes = $("#recordNotes").value.trim().slice(0, 4000);
    record.updatedAt = now();
    saveRecords();
    renderRecords();
    toast("CST 说明已保存");
  }

  async function removeImage(imageId) {
    const record = activeRecord();
    const image = record?.images.find((item) => item.id === imageId);
    if (!record || !image || !confirm(`删除提醒图片“${image.name}”？`)) return;
    try {
      const root = await requireDirectory();
      const rootDirectory = await root.getDirectoryHandle(image.root || CST_ROOT);
      const directory = await rootDirectory.getDirectoryHandle(image.directory);
      await directory.removeEntry(image.storedName);
    } catch (error) {
      console.warn("删除提醒图片原文件失败", error);
    }
    record.images = record.images.filter((item) => item.id !== imageId);
    record.updatedAt = now();
    saveRecords();
    renderEditorImages();
    renderRecords();
    toast("提醒图片已删除");
  }

  async function deleteRecord() {
    const record = activeRecord();
    if (!record || !confirm(`删除 CST 资料“${record.title}”？`)) return;
    if (record.legacyKey) {
      state.hiddenLegacy.add(record.legacyKey);
      if (record.images.length) {
        try {
          const root = await requireDirectory();
          const cstRoot = await root.getDirectoryHandle(CST_ROOT);
          await cstRoot.removeEntry(record.assetsDirectory, { recursive: true });
        } catch (error) {
          console.warn("清理 CST 提醒图片失败", error);
        }
      }
    } else {
      try {
        const root = await requireDirectory();
        const cstRoot = await root.getDirectoryHandle(CST_ROOT);
        await cstRoot.removeEntry(record.file.directory, { recursive: true });
      } catch (error) {
        console.warn("删除 CST 原文件失败", error);
      }
    }
    state.records = state.records.filter((item) => item.id !== record.id);
    saveRecords();
    closeEditor();
    renderRecords();
    toast(record.legacyKey ? "已从独立 CST 资料库隐藏，原公式库文件未删除" : "CST 资料已删除");
  }

  function renderEditorImages() {
    const record = activeRecord();
    const container = $("#editorImages");
    if (!record || !record.images.length) {
      container.innerHTML = '<div class="image-empty">还没有提醒图片，可添加设置截图、结果图或操作步骤。</div>';
      return;
    }
    container.innerHTML = record.images.map((image) => `
      <article class="image-card">
        <div class="image-preview" data-editor-preview="${escapeHtml(image.id)}">正在读取本地图片…</div>
        <div class="image-meta"><span title="${escapeHtml(image.name)}">${escapeHtml(image.name)}</span><button type="button" data-remove-image="${escapeHtml(image.id)}">删除</button></div>
      </article>`).join("");
    record.images.forEach((image) => loadPreview(image, $(`[data-editor-preview="${CSS.escape(image.id)}"]`)));
  }

  async function showLightbox(reference) {
    try {
      const file = await resolveFile(reference);
      closeLightbox();
      state.lightboxUrl = URL.createObjectURL(file);
      $("#imageLightbox img").src = state.lightboxUrl;
      $("#imageLightbox").hidden = false;
    } catch (error) {
      toast(`无法显示图片：${error?.message || "请检查目录授权"}`);
    }
  }

  function closeLightbox() {
    $("#imageLightbox").hidden = true;
    $("#imageLightbox img").removeAttribute("src");
    if (state.lightboxUrl) URL.revokeObjectURL(state.lightboxUrl);
    state.lightboxUrl = "";
  }

  function toast(message) {
    const element = $("#toast");
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove("show"), 2600);
  }

  function bindEvents() {
    $("#backToFormulaBtn").addEventListener("click", () => {
      const target = new URL("../cfx-post-library/app.html", window.location.href);
      target.searchParams.set("v", "1.12.0");
      if (new URLSearchParams(window.location.search).get("embedded")) target.searchParams.set("embedded", "1");
      window.location.assign(target.href);
    });
    $("#connectDirectoryBtn").addEventListener("click", () => connectDirectory(false));
    $("#changeDirectoryBtn").addEventListener("click", () => connectDirectory(true));
    $("#addCstBtn").addEventListener("click", () => $("#cstFileInput").click());
    $("#cstFileInput").addEventListener("change", (event) => addCstFiles(event.target.files));
    $("#searchInput").addEventListener("input", (event) => {
      state.query = event.target.value;
      renderRecords();
    });
    $("#recordGrid").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      const card = event.target.closest("[data-record-id]");
      if (!button || !card) return;
      const record = state.records.find((item) => item.id === card.dataset.recordId);
      if (!record) return;
      if (button.dataset.action === "download") downloadFile(record.file);
      else openEditor(record.id);
    });
    $("#closeEditorBtn").addEventListener("click", closeEditor);
    $("#editorBackdrop").addEventListener("click", (event) => {
      if (event.target === event.currentTarget) closeEditor();
    });
    $("#saveRecordBtn").addEventListener("click", saveEditor);
    $("#deleteRecordBtn").addEventListener("click", deleteRecord);
    $("#downloadEditorCstBtn").addEventListener("click", () => {
      const record = activeRecord();
      if (record) downloadFile(record.file);
    });
    $("#addImageBtn").addEventListener("click", () => $("#imageFileInput").click());
    $("#imageFileInput").addEventListener("change", (event) => addImages(event.target.files));
    $("#editorImages").addEventListener("click", (event) => {
      const record = activeRecord();
      const removeButton = event.target.closest("button[data-remove-image]");
      if (removeButton) return removeImage(removeButton.dataset.removeImage);
      const preview = event.target.closest("[data-editor-preview]");
      const image = record?.images.find((item) => item.id === preview?.dataset.editorPreview);
      if (image) showLightbox(image);
    });
    $("#imageLightbox").addEventListener("click", (event) => {
      if (event.target === event.currentTarget || event.target.closest("button")) closeLightbox();
    });
    window.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        $("#searchInput").focus();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && state.activeId) {
        event.preventDefault();
        saveEditor();
      }
      if (event.key === "Escape") {
        if (!$("#imageLightbox").hidden) closeLightbox();
        else if (!$("#editorBackdrop").hidden) closeEditor();
      }
    });
    window.addEventListener("storage", (event) => {
      if (event.key === SKIN_KEY) applyStoredSkin();
      if (event.key === FORMULA_ITEMS_KEY || event.key === RECORDS_KEY) {
        loadRecords();
        renderRecords();
      }
    });
  }

  function initialize() {
    applyStoredSkin();
    loadRecords();
    bindEvents();
    updateDirectoryUi();
    renderRecords();
    initializeDirectory();
  }

  initialize();
})();
