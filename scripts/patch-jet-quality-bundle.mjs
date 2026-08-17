import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const bundlePath = path.join(
  projectRoot,
  "public",
  "modules",
  "jet-quality-evaluator",
  "index.html",
);

let source = await readFile(bundlePath, "utf8");

function replaceOnce(search, replacement, label) {
  if (source.includes(replacement)) return;
  const occurrences = source.split(search).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: expected one occurrence, found ${occurrences}`);
  }
  source = source.replace(search, replacement);
}

replaceOnce(
  "function V8(e){const{indicators:t,sections:r,alternatives:a}=e;",
  "function V8(e){if(globalThis.JetQualityCalculation?.calculate)return globalThis.JetQualityCalculation.calculate(e);const{indicators:t,sections:r,alternatives:a}=e;",
  "calculation core hook",
);

replaceOnce(
  "J=[...P.rows].sort((S,N)=>S.rank-N.rank||N.overall-S.overall)",
  "J=[...P.rows].sort((S,N)=>S.rank-N.rank||N.rankScore-S.rankScore)",
  "stable unified ranking sort",
);

replaceOnce(
  "q=[\"喷嘴\",...o.map(oe=>`${oe.name}贴近度`)]",
  "q=[\"喷嘴\",...o.map(oe=>`${oe.name}模式得分`)]",
  "section export heading",
);

replaceOnce(
  "he=P.rows.map(oe=>[oe.name,oe.overall,oe.rank])",
  "he=P.rows.map(oe=>[oe.name,oe.rankScore,oe.overall,oe.rank])",
  "overall export values",
);

replaceOnce(
  "[[\"喷嘴\",\"综合贴近度\",\"排名\"],...he]",
  "[[\"喷嘴\",\"统一排名得分\",\"当前模式得分\",\"统一排名\"],...he]",
  "overall export headings",
);

replaceOnce(
  "className:\"helper\",children:\"模式决定归一化基准\"",
  "className:\"helper\",children:\"模式只改变辅助评分基准\"",
  "mode helper",
);

replaceOnce(
  "children:\"达到或优于该喷嘴的指标归一化为 1\"",
  "children:\"达到或优于该喷嘴的模式得分为 1，不改变统一排名\"",
  "reference mode hint",
);

replaceOnce(
  "className:\"weight-summary\",children:[F.jsx(\"span\",{children:\"当前计算权重\"})",
  "className:\"weight-summary\",children:[F.jsx(\"span\",{children:\"统一排名权重（切换模式保持不变）\"})",
  "weight summary label",
);

replaceOnce(
  "F.jsx(\"h2\",{children:\"两级 TOPSIS 评价结果\"})",
  "F.jsx(\"h2\",{children:\"统一排名与模式辅助评分\"})",
  "results heading",
);

replaceOnce(
  "F.jsx(\"th\",{children:\"排名\"}),F.jsx(\"th\",{children:\"喷嘴\"}),o.map(S=>F.jsxs(\"th\",{children:[S.name,F.jsx(\"small\",{children:\"一级贴近度\"})]},S.id)),F.jsx(\"th\",{children:\"综合贴近度\"})",
  "F.jsx(\"th\",{children:\"统一排名\"}),F.jsx(\"th\",{children:\"喷嘴\"}),o.map(S=>F.jsxs(\"th\",{children:[S.name,F.jsx(\"small\",{children:\"模式一级得分\"})]},S.id)),F.jsx(\"th\",{children:\"统一排名得分\"}),F.jsx(\"th\",{children:\"当前模式得分\"})",
  "results table headings",
);

replaceOnce(
  "o.map(N=>F.jsx(\"td\",{children:S.sectionScores[N.id].toFixed(4)},N.id)),F.jsx(\"td\",{children:F.jsx(\"b\",{className:\"score\",children:S.overall.toFixed(4)})})",
  "o.map(N=>F.jsx(\"td\",{children:S.sectionScores[N.id].toFixed(4)},N.id)),F.jsx(\"td\",{children:F.jsx(\"b\",{className:\"score\",children:S.rankScore.toFixed(4)})}),F.jsx(\"td\",{children:F.jsx(\"b\",{className:\"score mode-score\",children:S.overall.toFixed(4)})})",
  "results table values",
);

replaceOnce(
  "F.jsx(\"small\",{children:\"综合表现最优\"}),F.jsx(\"h2\",{children:G?.name??\"—\"}),F.jsx(\"b\",{children:G?G.overall.toFixed(4):\"—\"})",
  "F.jsx(\"small\",{children:\"统一排名首位\"}),F.jsx(\"h2\",{children:G?.name??\"—\"}),F.jsx(\"b\",{children:G?G.rankScore.toFixed(4):\"—\"})",
  "winner summary",
);

replaceOnce(
  "style:{width:`${Math.max(2,S.overall*100)}%`}",
  "style:{width:`${Math.max(2,S.rankScore*100)}%`}",
  "ranking bar width",
);

replaceOnce(
  "children:(S.overall*100).toFixed(1)",
  "children:(S.rankScore*100).toFixed(1)",
  "ranking bar value",
);

replaceOnce(
  "r===\"relative\"?\"评价完成：当前结果用于本批喷嘴之间的相对比较\":r===\"reference\"?\"评价完成：当前结果以所选优良喷嘴为参照\":\"评价完成：固定标准可用于跨机组与跨批次比较\"",
  "r===\"relative\"?\"统一排名已锁定；当前模式得分为批内相对贴近度\":r===\"reference\"?\"统一排名不变；当前模式得分表示与所选优良喷嘴的接近程度\":\"统一排名不变；当前模式得分表示固定标准下的达标程度\"",
  "result explanation",
);

replaceOnce(
  "r===\"relative\"?\"统一排名已锁定；当前模式得分为批内相对贴近度\":r===\"reference\"?\"统一排名不变；当前模式得分表示与所选优良喷嘴的接近程度\":\"统一排名不变；当前模式得分表示固定标准下的达标程度\"",
  "r===\"relative\"?\"奖杯与柱状图显示统一排名得分；批内相对得分请查看结果表\":r===\"reference\"?\"奖杯与柱状图显示统一排名得分；基准接近度请查看结果表\":\"奖杯与柱状图显示统一排名得分；固定标准达标度请查看结果表\"",
  "ranking chart score explanation",
);

await writeFile(bundlePath, source, "utf8");
console.log("Jet quality bundle patched successfully.");
