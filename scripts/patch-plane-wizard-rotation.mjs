import {readFile, writeFile} from 'node:fs/promises';
const path = new URL('../public/modules/plane-wizard/index.html', import.meta.url);
let source = await readFile(path, 'utf8');
if (/data-plane-ui-version="1\.2\.[1-9]\d*"/.test(source)) {
  console.log('Plane wizard rotation already applied; preserving current presentation.');
  process.exit(0);
}
function replace(search, value) {
  if (source.includes(value)) return;
  if (source.split(search).length !== 2) throw new Error('Expected unique bundle fragment: ' + search.slice(0,80));
  source = source.replace(search, value);
}
replace('<script type="module"', '<script src="./section-generation.js?v=1.2.0"></script>\n<script type="module"');
replace('prefix:"PLANE_",unit:"m"', 'prefix:"PLANE_",nozzleNaming:!1,unit:"m"');
const start = source.indexOf('d=y.useMemo(()=>{if(!a)return[];');
if (start >= 0) {
  const end = source.indexOf(',m=y.useMemo', start);
  if (end < 0) throw new Error('Section memo boundary missing');
  source = source.slice(0, start) + 'sectionResult=y.useMemo(()=>globalThis.PlaneSectionGeneration.generate(e,a,c),[e,a,c]),d=sectionResult.sections' + source.slice(end);
}
replace('domain:e.domain,unit:e.unit,bound:ie(e.bound', 'domain:P.domain,unit:e.unit,bound:ie(e.bound');
replace('const x="Name,Cx,Cy,Cz,Nx,Ny,Nz,Radius,Unit"', 'const x="Name,Cx,Cy,Cz,Nx,Ny,Nz,Radius,Unit,Domain,Nozzle"');
replace('${ie(b.radius,e.decimals)},${e.unit}`', '${ie(b.radius,e.decimals)},${e.unit},"${b.domain.replace(/"/g,\'""\')}",${b.nozzle}`');
replace('v=n==="PLANE"?m:n==="CSV"?f:w;', 'v=sectionResult.error?`# ${sectionResult.error}`:n==="PLANE"?m:n==="CSV"?f:w;');
replace('const S=()=>{if(!a)', 'const S=()=>{if(sectionResult.error){Ot.error(sectionResult.error),i("生成失败："+sectionResult.error);return}if(!a)');
replace('h=async(x,P)=>{try{', 'h=async(x,P)=>{if(sectionResult.error){Ot.error(sectionResult.error);return}try{');
replace('p=(x,P,b)=>{const j=', 'p=(x,P,b)=>{if(sectionResult.error){Ot.error(sectionResult.error);return}const j=');
const prefixField = 'E.jsxs("div",{children:[E.jsx("label",{className:"eng-label",children:"截面命名前缀"}),E.jsx(_o,{value:e.prefix,onChange:x=>l("prefix",x)})]})';
replace(prefixField, prefixField + ',E.jsxs("div",{className:"col-span-2",children:[E.jsx("button",{type:"button",className:e.nozzleNaming?"eng-btn-primary":"eng-btn","aria-pressed":!!e.nozzleNaming,"data-plane-nozzle-naming":"",onClick:()=>l("nozzleNaming",!e.nozzleNaming),children:e.nozzleNaming?"已启用：喷嘴编号 + 05、10…":"按喷嘴编号命名：05、10…"}),E.jsx("p",{className:"mt-1 text-[10px] leading-4 text-muted-foreground",children:e.nozzleNaming?`${e.prefix}${e.sixBase} 05、${e.prefix}${e.sixBase} 10…；数字为命名标签，不改变截面间距。`:"默认命名仍为前缀 + 01、02…"})]}),E.jsxs("div",{className:"col-span-2",children:[E.jsx("label",{className:"eng-label",children:"基准喷嘴编号"}),E.jsx(Xn,{value:e.sixBase,onChange:x=>l("sixBase",x),step:1})]})');
const baseField = 'E.jsxs("div",{children:[E.jsx("label",{className:"eng-label",children:"基准喷嘴编号"}),E.jsx(Xn,{value:e.sixBase,onChange:x=>l("sixBase",x),step:1})]}),';
// The common field above also works when rotation is disabled.
if (source.includes(baseField)) source = source.replace(baseField, '');
replace('E.jsx(_o,{value:e.sixDomains,onChange:x=>l("sixDomains",x)})', 'E.jsx(_o,{value:e.sixDomains,onChange:x=>l("sixDomains",x)}),E.jsx("p",{className:"mt-1 text-[10px] leading-4 text-muted-foreground",children:"例如 B1, B2, B3, B4, B5, B6；按旋转方向排序，与编号逐个对应。圆心和法向同时旋转，每个截面使用对应域名。"})');
replace('E.jsx("span",{children:"v1.1"})', 'E.jsx("span",{children:"v1.2"})');
replace('const O=d.map(Y=>{const[q,Fe]=L(Y.center);', 'const previewSections=e.sixEnabled?d.filter(Y=>Y.nozzle===e.sixBase):d,O=previewSections.map(Y=>{const[q,Fe]=L(Y.center);');
replace('E.jsx("h3",{className:"eng-panel-title",children:"截面预览"})', 'E.jsx("h3",{className:"eng-panel-title",children:e.sixEnabled?"截面预览 · 基准喷嘴沿程":"截面预览"})');
await writeFile(path, source, 'utf8');
console.log('Plane wizard rotation and nozzle naming wired to all exports.');
