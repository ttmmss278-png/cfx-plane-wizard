// Mechanical, idempotent hook into the preserved evaluator bundle. No algorithm changes.
import {readFile,writeFile} from 'node:fs/promises';
const file = new URL('../public/modules/jet-quality-evaluator/index.html',import.meta.url);
let html = await readFile(file,'utf8');
const marker = '/* quality-workbench-api-v1 */';
if (!html.includes(marker)) {
  const anchor = 'const P=Vr.useMemo(()=>V8({mode:r,indicators:i,sections:o,alternatives:h,referenceId:x,level1WeightMethod:_,level2WeightMethod:k})';
  if (html.split(anchor).length!==2) throw new Error('Evaluator state anchor changed; inspect before patching.');
  const hook = `${marker}globalThis.EvaluationWorkbench={snapshot:()=>{if(y)throw new Error("请先保存或取消综合评价中的编辑对话框。");return JSON.parse(JSON.stringify({projectName:e,mode:r,indicators:i,sections:o,alternatives:h,referenceId:x,level1WeightMethod:_,level2WeightMethod:k}))},restore:N=>{if(!N||!Array.isArray(N.indicators)||!Array.isArray(N.sections)||!Array.isArray(N.alternatives))throw new Error("评价配置无效");t(N.projectName);a(N.mode);l(N.indicators);c(N.sections);d(N.alternatives);v(N.referenceId);w(N.level1WeightMethod);g(N.level2WeightMethod);O(null)}};`;
  html=html.replace(anchor,hook+anchor);
  await writeFile(file,html);
}
console.log('Evaluation workbench API hook verified.');
