import { readFile, writeFile } from "node:fs/promises";

const bundlePath = new URL("../public/modules/plane-wizard/index.html", import.meta.url);
let source = await readFile(bundlePath, "utf8");

function replaceOnce(search, replacement, label) {
  if (source.includes(replacement)) return;
  const occurrences = source.split(search).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: expected one source fragment, found ${occurrences}`);
  }
  source = source.replace(search, replacement);
}

replaceOnce(
  'const If="cst-circle-section-gen-v1",ra={domain:"NOZZLE",prefix:"PLANE_",unit:"mm",decimals:6,bound:.05,mode:"3pts",C:[0,0,0],R1:[1,0,0],R2:[0,1,0],P1:[1,0,0],P2:[0,1,0],P3:[-1,0,0],includeFirst:!0,targetMode:"3pts",C2:[0,0,10],Q1:[1,0,10],Q2:[0,1,10],Q3:[-1,0,10],distance:2,count:6,distMode:"step",sixEnabled:!1',
  'const If="cst-circle-section-gen-v1",ra={domain:"NOZZLE",prefix:"PLANE_",unit:"m",decimals:6,bound:.00005,mode:"3pts",C:[0,0,0],R1:[.001,0,0],R2:[0,.001,0],P1:[.001,0,0],P2:[0,.001,0],P3:[-.001,0,0],includeFirst:!0,targetMode:"3pts",C2:[0,0,.01],Q1:[.001,0,.01],Q2:[0,.001,.01],Q3:[-.001,0,.01],distance:.002,count:6,distMode:"step",sixEnabled:!1',
  "metre defaults",
);

replaceOnce(
  'E.jsxs("div",{children:[E.jsx("label",{className:"eng-label",children:"单位标签"}),E.jsx(_o,{value:e.unit,onChange:x=>l("unit",x)})]})',
  'E.jsxs("div",{children:[E.jsx("label",{className:"eng-label",children:"输入与输出长度单位"}),E.jsx(_o,{value:e.unit,onChange:x=>l("unit",x)}),E.jsx("p",{className:"mt-1 text-[10px] leading-4 text-muted-foreground",children:"坐标、半径和距离均按此单位填写；CFD-Post 米制坐标请选择 m。"})]})',
  "unit field guidance",
);

replaceOnce(
  'E.jsx("span",{children:"v1.0"})',
  'E.jsx("span",{children:"v1.1"})',
  "module version",
);

await writeFile(bundlePath, source, "utf8");
console.log("Plane wizard defaults and unit guidance use metres.");
