(function () {
  const $ = (id) => document.getElementById(id);

  const state = {
    importedFiles: [],
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
    return true;
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
    const imported = state.importedFiles.map((file) => joinPath(baseDir, file));
    return unique([...parseManualFiles(), ...imported]);
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

  function hardcopyQualityLines(quality) {
    if (quality === "low") {
      return ["  Screen Capture = On"];
    }
    if (quality === "medium") {
      return ["  Screen Capture = Off"];
    }
    return ["  Screen Capture = Off", "  Use Screen Size = Off"];
  }

  function backgroundValue() {
    const mode = $("backgroundMode").value;
    if (mode === "white") return "On";
    if (mode === "transparent") return "Off";
    return "Off";
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
      pill.innerHTML = `<span>${file}</span><strong>${basename(file)}</strong>`;
      list.appendChild(pill);
    });
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

    return {
      resultFile: cfxPath(resultFile),
      case: caseName,
      view: viewName,
      viewAlias,
      imageFile,
      imageFormat,
      imageWidth: $("imageWidth").value || "1920",
      imageHeight: $("imageHeight").value || "1080",
      antiAlias: $("antiAlias").checked ? "On" : "Off",
      qualityLines: hardcopyQualityLines($("imageQuality").value).join("\n"),
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
    const lines = [
      "# CFX-Post batch export command",
      `# Target: ANSYS CFX-Post ${$("postVersion").value}`,
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
    $("commandMeta").textContent = `${files.length} 个结果文件，${selectedViews} 个视图，${selectedTables} 个表格`;
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
    const selectedPaths = files.map((file) => normalizePath(file.path || file.webkitRelativePath || file.name));
    const hasAbsolutePaths = tryAutoFillBaseDir(selectedPaths);
    state.importedFiles = hasAbsolutePaths ? selectedPaths.map(fileName) : files.map((file) => file.name);
    generate();
  });

  $("manualFiles").addEventListener("input", () => {
    tryAutoFillBaseDir(parseManualFiles());
    generate();
  });

  $("addView").addEventListener("click", () => {
    const next = state.views.length + 1;
    state.views.push({ enabled: true, name: `VIEW${next}`, alias: `VIEW${next}`, aliasEdited: false });
    renderAllItems();
    generate();
  });

  $("addTable").addEventListener("click", () => {
    const next = state.tables.length + 1;
    state.tables.push({ enabled: true, name: `B${next}`, alias: `B${next}`, aliasEdited: false });
    renderAllItems();
    generate();
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

  fields.forEach((id) => {
    const el = $(id);
    const eventName = el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input";
    el.addEventListener(eventName, generate);
  });

  renderAllItems();
  generate();
})();
