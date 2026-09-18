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
const FINAL_MODE_RANKING_MARKER = "当前模式排名由所选评价模式决定";
const LEGACY_AUDIT_EXPORT =
  'Aa.book_append_sheet(S,Aa.aoa_to_sheet(_metaRows),"计算参数");const _auditWeightRows=[["一级实际权重"],["截面",...i.map(_indicator=>_indicator.name)],...o.map(_section=>[_section.name,...(P.level1WeightsBySection[_section.id]??[])]),[],["二级实际权重"],["截面","实际权重"],...o.map((_section,_sectionIndex)=>[_section.name,P.level2Weights[_sectionIndex]??null])],_auditNormalizedRows=[["喷嘴","截面","指标","原始值","批内相对归一化值","当前模式归一化值","一级实际权重"]],_auditRelativeRows=[["喷嘴",...o.map(_section=>`${_section.name}批内相对贴近度`)],...P.rows.map(_row=>[_row.name,...o.map(_section=>_row.rankingSectionScores?.[_section.id]??null)])];o.forEach(_section=>{const _sectionTrace=P.trace?.sections?.[_section.id];if(!_sectionTrace)return;h.forEach((_alternative,_alternativeIndex)=>i.forEach((_indicator,_indicatorIndex)=>_auditNormalizedRows.push([_alternative.name,_section.name,_indicator.name,_sectionTrace.rawMatrix[_alternativeIndex]?.[_indicatorIndex]??null,_sectionTrace.relativeNormalizedMatrix[_alternativeIndex]?.[_indicatorIndex]??null,_sectionTrace.modeNormalizedMatrix[_alternativeIndex]?.[_indicatorIndex]??null,_sectionTrace.level1Weights[_indicatorIndex]??null]))) });Aa.book_append_sheet(S,Aa.aoa_to_sheet(_auditWeightRows),"实际权重");Aa.book_append_sheet(S,Aa.aoa_to_sheet(_auditNormalizedRows),"归一化明细");Aa.book_append_sheet(S,Aa.aoa_to_sheet(_auditRelativeRows),"一级相对参考");';
const FORMATTED_AUDIT_EXPORT =
  'const _makeSheet=(_rows,_widths,_integerColumns=[])=>{const _sheet=Aa.aoa_to_sheet(_rows);_sheet["!cols"]=_widths.map(_width=>({wch:_width}));if(_sheet["!ref"]){const _range=Aa.decode_range(_sheet["!ref"]);for(let _rowIndex=_range.s.r;_rowIndex<=_range.e.r;_rowIndex+=1)for(let _columnIndex=_range.s.c;_columnIndex<=_range.e.c;_columnIndex+=1){const _cell=_sheet[Aa.encode_cell({r:_rowIndex,c:_columnIndex})];if(_cell&&typeof _cell.v==="number")_cell.z=_integerColumns.includes(_columnIndex)?"0":"0.000000"}}return _sheet};Aa.book_append_sheet(S,_makeSheet(_metaRows,[22,52],[1]),"计算参数");const _auditWeightRows=[["一级实际权重"],["截面",...i.map(_indicator=>_indicator.name)],...o.map(_section=>[_section.name,...(P.level1WeightsBySection[_section.id]??[])]),[],["二级实际权重"],["截面","实际权重"],...o.map((_section,_sectionIndex)=>[_section.name,P.level2Weights[_sectionIndex]??null])],_auditNormalizedRows=[["喷嘴","截面","指标","原始值","批内相对归一化值","当前模式归一化值","一级实际权重"]],_auditRelativeRows=[["喷嘴",...o.map(_section=>`${_section.name}批内相对贴近度`)],...P.rows.map(_row=>[_row.name,...o.map(_section=>_row.rankingSectionScores?.[_section.id]??null)])];o.forEach(_section=>{const _sectionTrace=P.trace?.sections?.[_section.id];if(!_sectionTrace)return;h.forEach((_alternative,_alternativeIndex)=>i.forEach((_indicator,_indicatorIndex)=>_auditNormalizedRows.push([_alternative.name,_section.name,_indicator.name,_sectionTrace.rawMatrix[_alternativeIndex]?.[_indicatorIndex]??null,_sectionTrace.relativeNormalizedMatrix[_alternativeIndex]?.[_indicatorIndex]??null,_sectionTrace.modeNormalizedMatrix[_alternativeIndex]?.[_indicatorIndex]??null,_sectionTrace.level1Weights[_indicatorIndex]??null]))) });Aa.book_append_sheet(S,_makeSheet(_auditWeightRows,[20,...i.map(()=>18)]),"实际权重");Aa.book_append_sheet(S,_makeSheet(_auditNormalizedRows,[16,16,20,16,24,24,18]),"归一化明细");Aa.book_append_sheet(S,_makeSheet(_auditRelativeRows,[16,...o.map(()=>24)]),"一级相对参考");';
const LEGACY_AUDIT_TAIL = LEGACY_AUDIT_EXPORT.replace(
  'Aa.book_append_sheet(S,Aa.aoa_to_sheet(_metaRows),"计算参数");',
  "",
);

function replaceOnce(search, replacement, label) {
  if (source.includes(replacement)) return;
  const occurrences = source.split(search).length - 1;
  if (occurrences === 0 && source.includes(FINAL_MODE_RANKING_MARKER)) return;
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
  "J=[...P.rows].sort((S,N)=>S.rank-N.rank||N.rankScore-S.rankScore)",
  "J=[...P.rows].sort((S,N)=>S.rank-N.rank||N.overall-S.overall)",
  "active mode ranking sort",
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
  "he=P.rows.map(oe=>[oe.name,oe.rankScore,oe.overall,oe.rank])",
  "he=P.rows.map(oe=>[oe.name,oe.rankScore,oe.relativeScore,oe.rank])",
  "mode-driven export values",
);

replaceOnce(
  "[[\"喷嘴\",\"统一排名得分\",\"当前模式得分\",\"统一排名\"],...he]",
  "[[\"喷嘴\",\"当前模式综合得分\",\"批内相对参考分\",\"当前模式排名\"],...he]",
  "mode-driven export headings",
);

replaceOnce(
  "[\"统一排名算法\",\"批内相对归一化 + 两级 TOPSIS\"],[\"当前辅助评分模式\",kc.find(_mode=>_mode.id===r)?.title??r]",
  "[\"主排名算法\",\"所选评价模式 + 两级 TOPSIS\"],[\"当前排名模式\",kc.find(_mode=>_mode.id===r)?.title??r],[\"批内相对参考分\",\"仅供横向核对；非相对模式下不决定排名\"],[\"结果说明\",\"当前模式排名由所选评价模式决定\"]",
  "mode-driven export metadata",
);

if (source.includes(FORMATTED_AUDIT_EXPORT + LEGACY_AUDIT_TAIL)) {
  source = source.replace(
    FORMATTED_AUDIT_EXPORT + LEGACY_AUDIT_TAIL,
    FORMATTED_AUDIT_EXPORT,
  );
}

replaceOnce(
  "Aa.book_append_sheet(S,Aa.aoa_to_sheet(_metaRows),\"计算参数\");",
  FORMATTED_AUDIT_EXPORT,
  "calculation audit export sheets",
);

replaceOnce(
  LEGACY_AUDIT_EXPORT,
  FORMATTED_AUDIT_EXPORT,
  "formatted calculation audit export sheets",
);

replaceOnce(
  'Aa.utils.decode_range(_sheet["!ref"])',
  'Aa.decode_range(_sheet["!ref"])',
  "SheetJS range helper",
);

replaceOnce(
  "Aa.utils.encode_cell({r:_rowIndex,c:_columnIndex})",
  "Aa.encode_cell({r:_rowIndex,c:_columnIndex})",
  "SheetJS cell helper",
);

replaceOnce(
  'Aa.book_append_sheet(S,Aa.aoa_to_sheet([N,...U]),"原始数据"),Aa.book_append_sheet(S,Aa.aoa_to_sheet([q,...ce]),"截面一级评价"),Aa.book_append_sheet(S,Aa.aoa_to_sheet([["喷嘴","当前模式综合得分","批内相对参考分","当前模式排名"],...he]),"喷嘴综合评价")',
  'Aa.book_append_sheet(S,_makeSheet([N,...U],[16,...o.flatMap(()=>i.map(()=>18))]),"原始数据"),Aa.book_append_sheet(S,_makeSheet([q,...ce],[16,...o.map(()=>22)]),"截面一级评价"),Aa.book_append_sheet(S,_makeSheet([["喷嘴","当前模式综合得分","批内相对参考分","当前模式排名"],...he],[16,22,22,16],[3]),"喷嘴综合评价")',
  "formatted result export sheets",
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

replaceOnce(
  "className:\"helper\",children:\"模式只改变辅助评分基准\"",
  "className:\"helper\",children:\"当前模式直接决定主排名与综合得分\"",
  "active mode helper",
);

replaceOnce(
  "children:\"达到或优于该喷嘴的模式得分为 1，不改变统一排名\"",
  "children:\"达到或优于该喷嘴的归一化值为 1，基准接近度直接决定当前排名\"",
  "reference ranking hint",
);

replaceOnce(
  "className:\"weight-summary\",children:[F.jsx(\"span\",{children:\"统一排名权重（切换模式保持不变）\"})",
  "className:\"weight-summary\",children:[F.jsx(\"span\",{children:\"当前两级计算实际权重\"})",
  "active weight summary label",
);

replaceOnce(
  "F.jsx(\"h2\",{children:\"统一排名与模式辅助评分\"})",
  "F.jsx(\"h2\",{children:\"当前模式排名与批内相对参考\"})",
  "mode-driven results heading",
);

replaceOnce(
  "F.jsx(\"th\",{children:\"统一排名\"}),F.jsx(\"th\",{children:\"喷嘴\"}),o.map(S=>F.jsxs(\"th\",{children:[S.name,F.jsx(\"small\",{children:\"模式一级得分\"})]},S.id)),F.jsx(\"th\",{children:\"统一排名得分\"}),F.jsx(\"th\",{children:\"当前模式得分\"})",
  "F.jsx(\"th\",{children:\"当前模式排名\"}),F.jsx(\"th\",{children:\"喷嘴\"}),o.map(S=>F.jsxs(\"th\",{children:[S.name,F.jsx(\"small\",{children:\"当前模式一级得分\"})]},S.id)),F.jsx(\"th\",{children:\"当前模式综合得分\"}),F.jsx(\"th\",{children:\"批内相对参考分\"})",
  "mode-driven result table headings",
);

replaceOnce(
  "o.map(N=>F.jsx(\"td\",{children:S.sectionScores[N.id].toFixed(4)},N.id)),F.jsx(\"td\",{children:F.jsx(\"b\",{className:\"score\",children:S.rankScore.toFixed(4)})}),F.jsx(\"td\",{children:F.jsx(\"b\",{className:\"score mode-score\",children:S.overall.toFixed(4)})})",
  "o.map(N=>F.jsx(\"td\",{children:S.sectionScores[N.id].toFixed(4)},N.id)),F.jsx(\"td\",{children:F.jsx(\"b\",{className:\"score\",children:S.rankScore.toFixed(4)})}),F.jsx(\"td\",{children:F.jsx(\"b\",{className:\"score mode-score\",children:S.relativeScore.toFixed(4)})})",
  "mode-driven result table values",
);

replaceOnce(
  "F.jsx(\"small\",{children:\"统一排名首位\"})",
  "F.jsx(\"small\",{children:\"当前模式排名首位\"})",
  "mode-driven winner label",
);

replaceOnce(
  "r===\"relative\"?\"奖杯与柱状图显示统一排名得分；批内相对得分请查看结果表\":r===\"reference\"?\"奖杯与柱状图显示统一排名得分；基准接近度请查看结果表\":\"奖杯与柱状图显示统一排名得分；固定标准达标度请查看结果表\"",
  "r===\"relative\"?\"当前模式排名由批内相对综合得分决定；参考分与主分相同\":r===\"reference\"?\"当前模式排名由基准接近度决定；批内相对分保留用于核对\":\"当前模式排名由固定标准达标度决定；请先标定工程阈值。当前模式排名由所选评价模式决定\"",
  "mode-driven result explanation",
);

await writeFile(bundlePath, source, "utf8");
console.log("Jet quality bundle patched successfully.");
