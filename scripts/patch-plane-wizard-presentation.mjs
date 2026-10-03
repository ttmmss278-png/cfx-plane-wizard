import {readFile, writeFile} from 'node:fs/promises';

// The upstream standalone React bundle has no separate component source.
// Keep presentation anchors here, and all styling in interface.css.
const path = new URL('../public/modules/plane-wizard/index.html', import.meta.url);
let source = await readFile(path, 'utf8');
function replace(search, replacement) {
  if (source.includes(replacement)) return;
  if (source.split(search).length !== 2) throw new Error('Expected unique UI anchor: ' + search.slice(0, 100));
  source = source.replace(search, replacement);
}
replace('<body>', '<body id="plane-wizard-interface" data-plane-ui-version="1.2.1">');
replace('</head>', '<link rel="stylesheet" href="./interface.css?v=1.2.1">\n</head>');
replace('className:"flex-1 min-w-0 p-1.5",children:E.jsx("canvas"', 'className:"pw-geometry-surface flex-1 min-w-0 p-1.5",children:E.jsx("canvas"');
replace('className:"hidden md:flex items-center gap-2 text-[11px] text-muted-foreground",children:[E.jsx("span",{className:"px-2 py-0.5 rounded bg-secondary",children:"Engineering Utility"}),E.jsx("span",{children:"v1.2"})]', 'className:"pw-metadata",children:[E.jsx("span",{className:"pw-metadata-label",children:"CFX-Post"}),E.jsx("span",{className:"pw-version",children:"v1.2.1"})]');
replace('className:e.nozzleNaming?"eng-btn-primary":"eng-btn","aria-pressed":!!e.nozzleNaming,"data-plane-nozzle-naming":"",onClick:()=>l("nozzleNaming",!e.nozzleNaming),children:e.nozzleNaming?"已启用：喷嘴编号 + 05、10…":"按喷嘴编号命名：05、10…"', 'className:"pw-naming-toggle","aria-label":"喷嘴编号命名","aria-pressed":!!e.nozzleNaming,"data-plane-nozzle-naming":"",onClick:()=>l("nozzleNaming",!e.nozzleNaming),children:E.jsxs(E.Fragment,{children:[E.jsx("span",{className:"pw-switch", "aria-hidden":!0}),E.jsx("span",{className:"pw-toggle-label",children:"喷嘴编号命名"}),E.jsx("span",{className:"pw-toggle-state","aria-hidden":!0,children:e.nozzleNaming?"已开启":"已关闭"})]})');
replace('className:"border-t border-border bg-card p-2 flex flex-wrap gap-1.5",children:[E.jsx("button",{className:"eng-btn-primary flex-1 min-w-[120px]",onClick:S', 'className:"pw-action-bar border-t border-border bg-card p-2 flex flex-wrap gap-1.5",children:[E.jsx("button",{className:"pw-action pw-action-primary eng-btn-primary flex-1 min-w-[120px]",onClick:S');
for (const [handler,kind] of [['g','secondary'],['C','quiet'],['k','quiet']]) {
  replace(`className:"eng-btn",onClick:${handler}`, `className:"pw-action pw-action-${kind} eng-btn",onClick:${handler}`);
}
replace('className:`eng-tab ${n===x?"eng-tab-active":""}`', 'className:`pw-output-tab eng-tab ${n===x?"eng-tab-active":""}`,"aria-pressed":n===x');
for(const property of ['mode', 'targetMode']) {
  replace(`onClick:()=>l("${property}",x),className:`, `onClick:()=>l("${property}",x),"data-plane-definition":"","aria-pressed":e.${property}===x,className:`);
}
replace('className:"flex items-center gap-1",children:[E.jsx("button",{className:"eng-btn-ghost",onClick:()=>h(v,n)', 'className:"pw-export-actions flex items-center gap-1",children:[E.jsx("button",{className:"pw-action pw-action-quiet pw-copy eng-btn-ghost",onClick:()=>h(v,n)');
replace('className:"eng-btn-ghost",onClick:()=>h(f,"CSV")', 'className:"pw-action pw-action-quiet pw-copy eng-btn-ghost",onClick:()=>h(f,"CSV")');
for (const format of ['m,"sections.cst","text/plain"', 'f,"sections.csv","text/csv"']) {
  replace(`className:"eng-btn-ghost",onClick:()=>p(${format})`, `className:"pw-action pw-action-export eng-btn-ghost",onClick:()=>p(${format})`);
}
source = source.replaceAll('./section-generation.js?v=1.2.0','./section-generation.js?v=1.2.1').replaceAll('./state-bridge.js?v=1.2.0','./state-bridge.js?v=1.2.1');
// Keep the explanation inside the setting card, separate from the toggle button.
// Native details supplies keyboard support and an independent expanded state.
if (!source.includes('className:"pw-naming-details"')) {
  const start = source.indexOf('E.jsxs("div",{className:"col-span-2",children:[E.jsx("button",{type:"button",className:"pw-naming-toggle"');
  const end = source.indexOf(',E.jsxs("div",{className:"col-span-2",children:[E.jsx("label",{className:"eng-label",children:"基准喷嘴编号"', start);
  if (start < 0 || end < 0) throw new Error('Naming explanation anchors missing');
  const fragment = source.slice(start, end);
  const childrenStart = fragment.indexOf('children:[') + 'children:['.length;
  const hintStart = fragment.indexOf(',E.jsx("p",');
  const button = fragment.slice(childrenStart, hintStart);
  const hint = fragment.slice(hintStart + 1, -3);
  source = source.slice(0, start) + 'E.jsxs("div",{className:"col-span-2 pw-naming-setting",children:[' + button + ',E.jsxs("details",{className:"pw-naming-details",children:[E.jsx("summary",{children:"详情"}),' + hint + ']})]})' + source.slice(end);
}
await writeFile(path, source, 'utf8');
console.log('Plane wizard presentation v1.2.1 applied.');
