import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const core = await readFile(new URL('../public/modules/plane-wizard/section-generation.js',import.meta.url),'utf8');
const html = await readFile(new URL('../public/modules/plane-wizard/index.html',import.meta.url),'utf8');
const context = vm.createContext({});
vm.runInContext(core, context);
const {generate} = context.PlaneSectionGeneration;
const circle = {center:[2,0,0],normal:[1,0,0],radius:0.1};
const direction = [1,0,0];
const defaults = {domain:'B1',prefix:'PZ',count:2,distance:0.5,distMode:'step',includeFirst:true,sixBase:1,nozzleNaming:false,sixEnabled:false,sixDomains:'B1,B2,B3,B4,B5,B6',sixNums:'1,2,3,4,5,6',sixAngle:60,sixDir:'ccw',sixAxisOrigin:[0,0,0],sixAxisDir:[0,0,1]};
const rows = (config = {}, c = circle, dir = direction) => {
 const result=generate({...defaults,...config},c,dir);
 assert.equal(result.error,'');
 return JSON.parse(JSON.stringify(result.sections));
};
const close = (a,b) => a.forEach((n,i) => assert.ok(Math.abs(n-b[i])<1e-12,`${a} != ${b}`));
assert.deepEqual(rows().map(s=>s.name), ['PZ01','PZ02']);
assert.deepEqual(rows({nozzleNaming:true}).map(s=>s.name), ['PZ1 00','PZ1 05']);
const six=rows({nozzleNaming:true,sixEnabled:true});
assert.equal(six.length,12);
for(let i=0;i<6;i++) {
 const angle=i*Math.PI/3;
 assert.equal(six[2*i].name,`PZ${i+1} 00`);
 assert.equal(six[2*i+1].name,`PZ${i+1} 05`);
 assert.equal(six[2*i].domain,`B${i+1}`);
 close(six[2*i].center,[2*Math.cos(angle),2*Math.sin(angle),0]);
 close(six[2*i].normal,[Math.cos(angle),Math.sin(angle),0]);
 close(six[2*i+1].center,[2.5*Math.cos(angle),2.5*Math.sin(angle),0]);
}
const clockwise=rows({nozzleNaming:true,sixEnabled:true,sixDir:'cw'});
close(clockwise[2].center,[1,-Math.sqrt(3),0]);
close(clockwise[0].center,six[0].center);
close(clockwise[6].center,six[6].center);
for (const i of [1,2,4,5]) assert.ok(Math.hypot(...clockwise[2*i].center.map((v,k)=>v-six[2*i].center[k]))>1);
// A tangential jet must rotate both its position and its normal by the same angle.
// Compare against the explicit Z-axis matrix, independently of Rodrigues.
const tangential={center:[-0.022,0.317,0],normal:[0.681998,-0.731354,0],radius:0.0621};
const travel=[0.681,-0.731,0.04];
for(const sixDir of ['ccw','cw']) {
 const generated=rows({sixEnabled:true,nozzleNaming:true,count:6,sixDir},tangential,travel);
 for(let nozzle=0;nozzle<6;nozzle++) {
  const angle=(sixDir==='cw'?-1:1)*nozzle*Math.PI/3;
  const rotated=v=>[v[0]*Math.cos(angle)-v[1]*Math.sin(angle),v[0]*Math.sin(angle)+v[1]*Math.cos(angle),v[2]];
  for(let section=0;section<6;section++) {
   const row=generated[nozzle*6+section];
   close(row.normal,rotated(tangential.normal));
   close(row.center,rotated(tangential.center.map((v,k)=>v+travel[k]*section*0.5)));
   assert.equal(row.name,`PZ${nozzle+1} ${String(section*5).padStart(2,'0')}`);
   assert.ok(Math.abs(row.rotationDegrees-(sixDir==='cw'?-1:1)*nozzle*60)<1e-12);
  }
 }
}
const nonzeroOrigin=rows({nozzleNaming:true,sixEnabled:true,sixAxisOrigin:[1,0,0],sixAxisDir:[0,0,8]});
close(nonzeroOrigin[2].center,[1.5,Math.sqrt(3)/2,0]);
const xAxis=rows({nozzleNaming:true,sixEnabled:true,sixAxisOrigin:[1,0,0],sixAxisDir:[3,0,0]}, {center:[1,2,0],normal:[0,1,0],radius:0.1},[0,1,0]);
close(xAxis[2].center,[1,1,Math.sqrt(3)]);
close(xAxis[2].normal,[0,0.5,Math.sqrt(3)/2]);
const base3=rows({domain:'B3',sixBase:3,nozzleNaming:true,sixEnabled:true});
close(base3[4].center,circle.center);
assert.equal(base3[4].name,'PZ3 00');
const excluded=rows({nozzleNaming:true,includeFirst:false});
assert.deepEqual(excluded.map(s=>s.name),['PZ1 00','PZ1 05']);
close(excluded[0].center,[2.5,0,0]);
const total=rows({nozzleNaming:true,distMode:'total',count:3,distance:2});
close(total[2].center,[4,0,0]);
assert.equal(total[2].name,'PZ1 10');
assert.equal(rows({nozzleNaming:true,count:20})[19].name,'PZ1 95');
assert.equal(new Set(rows({sixEnabled:true}).map(s=>s.name)).size,12);
for (const bad of [
 {sixDomains:'B1,B2'}, {sixNums:'1,2,2,4,5,6'}, {sixDomains:'B1,B1,B3,B4,B5,B6'},
 {sixAxisDir:[0,0,0]}, {sixBase:7}, {domain:'B2'}, {sixAngle:NaN}, {count:NaN}
]) {
 const result=generate({...defaults,sixEnabled:true,...bad},circle,direction);
 assert.ok(result.error);
 assert.equal(result.sections.length,0);
}
// Parse the shipped inline bundle to catch syntax errors in export/UI wiring.
const module = html.match(/<script type="module"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(module);
new vm.Script(module[1]);
assert.match(html,/domain:P\.domain/);
assert.match(html,/nozzleNaming:!1/);
assert.match(html,/sectionResult\.error/);
assert.match(html,/Domain,Nozzle/);
assert.match(html,/data-plane-reverse-rotation/);
assert.match(html,/查看六喷嘴旋转对应/);
assert.match(html,/从轴向正端看向轴心/);
console.log('PASS: naming, six domains, rotated centers/normals, clockwise, nonzero origin, nonunit/arbitrary axis, base B3, spacing, invalid-input gates and bundle syntax.');
