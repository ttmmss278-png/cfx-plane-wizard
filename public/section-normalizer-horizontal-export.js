'use strict';
(function () {
  const PATCH_VERSION = '1.0.1';
  const STORAGE_KEY = 'section-normalizer-export-layout-v1';

  if (window.SectionNormalizerHorizontalExport?.version === PATCH_VERSION) return;

  function naturalCompare(left, right) {
    return new Intl.Collator('zh-CN', {
      numeric: true,
      sensitivity: 'base',
    }).compare(String(left), String(right));
  }

  function currentLayout() {
    return document.getElementById('exportLayout')?.value || 'columns';
  }

  function groupNameForRow(row) {
    const selectedGroup = els.groupCol?.value;
    return String(
      row?.section_id_projected ??
        (selectedGroup ? row?.[selectedGroup] : '') ??
        (state.sectionHeader ? row?.[state.sectionHeader] : '') ??
        '',
    );
  }

  function orderedGroupNames() {
    const fromState = Array.isArray(state.groups)
      ? state.groups.map(String).filter(Boolean)
      : [];
    const fromRows = state.projected.map(groupNameForRow).filter(Boolean);
    const unique = [...new Set([...fromState, ...fromRows])];
    return unique.sort(naturalCompare);
  }

  function exportValueHeaders() {
    const headers = exportHeaders();
    const groupHeaders = new Set(
      [els.groupCol?.value, state.sectionHeader, 'section_id_projected']
        .filter(Boolean)
        .map(String),
    );
    return headers.filter((header) => !groupHeaders.has(String(header)));
  }

  function longTable() {
    const headers = exportHeaders();
    return {
      layout: 'rows',
      headers,
      rows: state.projected.map((row) => headers.map((header) => row?.[header] ?? '')),
    };
  }

  function horizontalTable() {
    const groups = orderedGroupNames();
    if (groups.length <= 1) return longTable();

    const valueHeaders = exportValueHeaders();
    const rowsByGroup = new Map(groups.map((group) => [group, []]));

    state.projected.forEach((row) => {
      const group = groupNameForRow(row);
      if (!rowsByGroup.has(group)) rowsByGroup.set(group, []);
      rowsByGroup.get(group).push(row);
    });

    const headers = groups.flatMap((group) =>
      valueHeaders.map((header) => `${group} ${header}`),
    );
    const rowCount = Math.max(
      0,
      ...groups.map((group) => rowsByGroup.get(group)?.length || 0),
    );
    const rows = Array.from({ length: rowCount }, (_, rowIndex) =>
      groups.flatMap((group) => {
        const row = rowsByGroup.get(group)?.[rowIndex];
        return valueHeaders.map((header) => row?.[header] ?? '');
      }),
    );

    return {
      layout: 'columns',
      headers,
      rows,
      groups,
      valueHeaders,
    };
  }

  function buildExportTable() {
    if (currentLayout() !== 'columns') return longTable();
    return horizontalTable();
  }

  function tableRowsAsObjects(table, limit = 30) {
    return table.rows.slice(0, limit).map((values) => {
      const row = {};
      table.headers.forEach((header, index) => {
        row[header] = values[index] ?? '';
      });
      return row;
    });
  }

  function renderExportPreview() {
    if (!state.projected.length) return;
    const table = buildExportTable();
    originalRenderPreview(tableRowsAsObjects(table), table.headers);
  }

  function updateHint() {
    const hint = document.getElementById('exportLayoutHint');
    if (!hint) return;

    let nextText = '';
    if (currentLayout() === 'columns') {
      const groups = orderedGroupNames();
      nextText = groups.length
        ? `每个截面作为相邻列组，${groups.join('、')} 从左到右排列，便于整块复制某一个截面。`
        : '每个截面作为相邻列组，从左到右排列；各截面行数不同时自动用空白补齐。';
    } else {
      nextText = '所有截面依次向下堆叠，并保留截面编号列，兼容原有长表格式。';
    }

    // Avoid creating DOM mutations when the displayed message is unchanged.
    if (hint.textContent !== nextText) hint.textContent = nextText;
  }

  function installLayoutControl() {
    const exportMode = document.getElementById('exportMode');
    const card = exportMode?.closest('.export-card');
    if (!exportMode || !card || document.getElementById('exportLayout')) return;

    const label = document.createElement('label');
    label.textContent = '输出排布';

    const select = document.createElement('select');
    select.id = 'exportLayout';
    select.innerHTML = [
      '<option value="columns">按列横向排布（每个截面一组列）</option>',
      '<option value="rows">按行汇总（原长表格式）</option>',
    ].join('');

    const remembered = localStorage.getItem(STORAGE_KEY);
    select.value = remembered === 'rows' ? 'rows' : 'columns';
    label.appendChild(select);

    const hint = document.createElement('div');
    hint.id = 'exportLayoutHint';
    hint.className = 'message';

    const folderGrid = card.querySelector('.grid-2');
    card.insertBefore(label, folderGrid || null);
    card.insertBefore(hint, folderGrid || null);

    select.addEventListener('change', () => {
      localStorage.setItem(STORAGE_KEY, select.value);
      updateHint();
      renderExportPreview();
    });

    updateHint();
  }

  if (
    typeof state === 'undefined' ||
    typeof els === 'undefined' ||
    typeof exportHeaders !== 'function' ||
    typeof csvEscape !== 'function' ||
    typeof renderPreview !== 'function' ||
    typeof buildCsvText !== 'function'
  ) {
    console.warn('[Section Normalizer] Horizontal export patch could not initialize.');
    return;
  }

  const originalRenderPreview = renderPreview;
  const originalBuildCsvText = buildCsvText;

  buildCsvText = function patchedBuildCsvText() {
    if (!state.projected.length || currentLayout() !== 'columns') {
      return originalBuildCsvText();
    }
    const table = buildExportTable();
    const lines = [table.headers.map(csvEscape).join(',')];
    table.rows.forEach((row) => {
      lines.push(row.map(csvEscape).join(','));
    });
    return lines.join('\n');
  };

  renderPreview = function patchedRenderPreview(rows, headers) {
    const projectedPreview =
      state.projected.length > 0 &&
      Array.isArray(headers) &&
      (headers.includes('x_output') || headers.includes('y_output'));

    if (projectedPreview && currentLayout() === 'columns') {
      const table = buildExportTable();
      return originalRenderPreview(tableRowsAsObjects(table), table.headers);
    }
    return originalRenderPreview(rows, headers);
  };

  // The module DOM is complete before this patch is injected, so a persistent
  // whole-document MutationObserver is unnecessary and can create a feedback loop.
  installLayoutControl();

  document.getElementById('exportMode')?.addEventListener('change', () => {
    updateHint();
    renderExportPreview();
  });

  window.SectionNormalizerHorizontalExport = {
    version: PATCH_VERSION,
    buildExportTable,
    renderExportPreview,
    getState: () => ({
      layout: currentLayout(),
      groups: orderedGroupNames(),
      projectedRows: state.projected.length,
      table: (() => {
        const table = buildExportTable();
        return { rows: table.rows.length, columns: table.headers.length };
      })(),
    }),
    runSelfTests: () => {
      const table = buildExportTable();
      const groups = orderedGroupNames();
      const expectedColumns =
        currentLayout() === 'columns' && groups.length > 1
          ? groups.length * exportValueHeaders().length
          : exportHeaders().length;
      const result = {
        groupOrder: groups,
        rows: table.rows.length,
        columns: table.headers.length,
        expectedColumns,
        passed:
          table.headers.length === expectedColumns &&
          table.rows.every((row) => row.length === table.headers.length),
      };
      console.info('[Section Normalizer Horizontal Export]', result);
      return result;
    },
  };

  console.info('[Section Normalizer] Horizontal grouped export enabled', {
    version: PATCH_VERSION,
    defaultLayout: currentLayout(),
  });
})();
