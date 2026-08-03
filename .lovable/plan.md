# 卡通工程主题（Cartoon Workbench）设计方案

只做设计规划与结构分析，本次不改动任何业务代码。

## 一、当前设计为何缺少参考图的卡通质感

从代码读取确认的事实：

- `src/App.tsx` 中六个模块（`modules` 数组，行 58-148）共用同一个卡片组件 `article.tool-card`，差异仅为 `tone-blue/cyan/violet/orange/green` 与一个 lucide 线性图标（`ImageDown / PlaySquare / ScanLine / CircleDotDashed / FileCog / Command`）。这正是「六张相同卡片换图标和颜色」的结构性根因，不是配色问题。
- 视觉层是纯 CSS 变量叠加：`src/styles.css`(1374 行) → `ux-v2.css` → `ux-v3.css` → `topbar-polish.css` → `home-workbench-polish.css` → `design-system.css`(670 行) → `design-system-dark.css` → `skin-system.css`(602 行)，共 7 层覆盖。`src/skins.ts` 的皮肤机制只切换 `data-pelton-skin` 下的颜色令牌，没有任何插画资产层。
- Hero 区（`hero-visual`）用的是 CSS 圆环 + 一个 `Waves` 图标，没有体积、材质、光影，也没有喷嘴/转轮/水流等主题物件。
- 图标全部为 1.8 描边的线性矢量图标，天然无法表达黏土渲染质感；参考图的质感来自带高光、阴影、厚度的 3D 插画位图。
- 层级扁平：Hero / 状态条 / 六卡片高度和权重接近，`home-workbench-polish.css` 甚至把状态卡压到 56px，把卡片钉成等高 222px 的 3 列网格，进一步强化了「通用 AI 仪表盘」观感。
- 参考图中的「继续工作」区（两张带插画的大缩略图卡）在当前代码中不存在；现有 `quick-workspace` 是四个纯文字小按钮。

结论：缺的是**插画资产 + 分层组件 + 叙事化版式**三件事，任何颜色令牌改动都补不上。

## 二、新卡通主题的完整视觉系统

主题标识：`data-pelton-skin="cartoon-engineering"`（新增第 5 套皮肤，四套现有皮肤全部保留）。

### 色板（深海军蓝 / 蓝灰金属 / 青绿 + 橙色点缀）
```text
ink-900   #0C1B2A   页面底色 / 侧栏
ink-800   #12263A   面板底
ink-700   #1A3550   卡片底
steel-500 #4E6B87   蓝灰金属中调
steel-300 #8AA3BB   金属高光
teal-400  #35C6B5   主强调（数据 / 成功 / 水流）
teal-200  #8FE6DC   水流高光
orange-500 #E8792B  仅用于机械连接件、关键 CTA、序号徽章
paper-100 #F2F6FA   卡通插画中的纸张 / 文件夹亮面
```

### 质感规则
- 插画：3D 卡通 / 黏土渲染位图（PNG，透明背景），统一 45° 主光源、右下柔和阴影、2-3px 深色轮廓提示，圆角厚实形体。
- 面板：`ink-700` 底 + 1px `steel-500/30` 描边 + 内部 1px 顶部高光 + 下方柔和投影，形成「有厚度的机件面板」。
- 圆角统一 14px（卡片）/ 10px（控件）/ 999px（徽章）。
- 背景：极淡工程网格 + 局部青绿泛光，不使用大面积渐变。
- 中文字体：`Noto Sans SC` 字重 500/700；标题字号层级 34 / 20 / 15 / 12。

### 防遮挡硬规则
每张卡片划分为「插画舞台区」与「文字区」两个互不重叠的盒子；插画只在自身舞台区内做 `overflow: hidden` 溢出裁切，绝不 `position: absolute` 压到文字上；文字区始终有独立不透明底衬。

## 三、首页重新布局（叙事化层级）

```text
┌ Hero（大，约 300-340px，占 2/3 宽）───────┬ 环境栏（1/3 宽，纵向堆叠）┐
│ 标题 + 副本 + 4 个环境指标                │ 环境同步 / 本地优先        │
│ 右侧：转轮+喷嘴+水流 主插画（大尺寸）      │ 本地存储 / GitHub 同步     │
├──────────────────────────────────────────┤ 工作区路径 / 快捷入口       │
│ 继续工作（新增）：2 张带插画的大缩略卡     │                            │
├──────────────────────────────────────────┴────────────────────────────┤
│ 工具模块：工具栏（分类筛选 + 搜索，保持现有合并形态）                  │
│ 卡片网格 —— 非等权：01 与 06 为宽卡（跨 2 列），02-05 为标准卡          │
└───────────────────────────────────────────────────────────────────────┘
```

- Hero 视觉重量 ≈ 卡片的 3 倍，「继续工作」≈ 1.6 倍，形成三级叙事。
- 右侧环境栏由现有 `quick-workspace` 四态升级而来，功能与点击行为完全不变。
- 1440-1920px：三列主网格；1180-1439px：环境栏移到 Hero 下方横排；<980px：全部单列，插画缩为 96px 缩略图。

## 四、六个模块的专属插画与卡片结构

每个模块一个独立插画资产 + 一套背景元素 + 卡片内自定义构成，卡片内部结构（插画舞台位置、徽章位置、特性标签排布）按模块差异化。

| 序号 | 模块 | 主插画物件 | 背景元素 | 卡片结构 |
|---|---|---|---|---|
| 01 | CFX-Post 批量导出 | 显示器 + 图表/表格页 + 文件夹 + 橙色导出箭头 | 右上导出箭头轨迹 | 宽卡：左插画舞台 / 右文字 |
| 02 | CFX 连跑 BAT 生成器 | 计时器 + 算例卡片队列 + 终端窗口 | 底部队列进度刻度 | 标准卡：上插画 / 下文字 |
| 03 | 截面二维归一化投影 | 三维坐标架 + 半透明剖切平面 + 投影虚线 + 二维轮廓 | 虚线投影网格 | 标准卡：插画偏右下 |
| 04 | CFX-Post 圆截面生成器 | 喷嘴管件 + 水流颗粒 + 连续圆截面环 | 青绿水流弧线 | 标准卡：插画横贯顶部 |
| 05 | CFX 批量转 DEF | CFX 工程文件 + 橙色齿轮转换装置 + DEF 文件 + 连接线 | 连接线 + 本地服务状态灯 | 标准卡 + 本地服务提示条 |
| 06 | CFX-Post 公式与命令库 | 公式手册 + CEL/CCL 书页 + 书签 + GitHub 标识 | 页边书签色带 | 宽卡：左手册插画 / 右文字 + 同步徽章 |

侧栏导航与命令栏也各自使用对应插画的 32px 缩略版本，形成全局一致的模块识别。

## 五、建议新增 / 修改文件清单

新增（视觉层，独立目录）：
```text
src/theme/cartoon/CartoonTheme.css        主题令牌 + 组件样式（唯一新样式入口）
src/theme/cartoon/moduleArt.ts            模块 id → 插画资产 / 背景元素 / 卡片变体 映射
src/theme/cartoon/CartoonHero.tsx         Hero 区组件
src/theme/cartoon/CartoonEnvRail.tsx      右侧环境栏（复用现有四态数据与点击回调）
src/theme/cartoon/CartoonResumeStrip.tsx  继续工作区
src/theme/cartoon/CartoonModuleCard.tsx   差异化模块卡（宽卡 / 标准卡变体）
src/assets/cartoon/hero-turbine.png       Hero 主插画
src/assets/cartoon/module-01..06.png      六个模块插画
public/embedded-cartoon.css               iframe 内嵌模块的卡通皮肤变量（仅变量与外观）
```

修改（最小改动）：
```text
src/skins.ts        新增 "cartoon-engineering" 皮肤项（不改存储键与逻辑）
src/main.tsx        引入 CartoonTheme.css
src/App.tsx         仅在 skin === cartoon 时渲染新组件，modules 数组、openModule、iframe 逻辑、状态与 localStorage 全部不动
public/embedded-skins.css  追加 cartoon 分支
```

绝不修改：`public/modules/**`（六个 iframe 模块的全部 JS/HTML/数据逻辑）、`public/modules/cfx-post-library/**` 的 sync/storage 脚本、`local-def-service/**`。

## 六、视觉层与业务逻辑 / 公式库同步的隔离方式

1. 新组件全部为**纯展示组件**：只接收 `modules`、`lastUsedModule`、`githubSyncSummary`、`openModule` 等既有 props，不含 fetch、不含 localStorage 读写、不含副作用。
2. `App.tsx` 保留唯一状态源；卡通主题只替换 `!activeModule` 分支内的 JSX 渲染，事件回调函数体不变。
3. 六个 iframe 模块只通过 `public/embedded-cartoon.css` 注入外观变量，与现有 `embedded-skins.css` 同机制，不注入任何 JS。
4. 公式命令库（模块 06）与私有仓库 `ttmmss278-png/cfx-post-private-data` 的连接：只覆盖其公开 CSS 变量（`--bg/--panel/--text/--primary/--line`），不触碰 `sync-*.js`、`storage-sync-cache.js`、`token-memory-option.js`、`version.json`、localStorage 键名与数据结构。
5. 插画资产为静态 PNG import，不改变任何请求或数据流。

## 七、分阶段实施与验收标准

**阶段 1 — 主题骨架**：新增皮肤项、`CartoonTheme.css` 令牌层、目录结构。
验收：切换皮肤生效，其他四套皮肤外观零变化，控制台无报错。

**阶段 2 — 插画资产**：生成 1 张 Hero + 6 张模块插画（统一光源与材质）。
验收：七张图风格一致、透明背景、单图 < 300KB。

**阶段 3 — 首页重构**：Hero / 环境栏 / 继续工作区 / 差异化卡片网格。
验收：六张卡片视觉可辨（宽卡 2 张 + 标准卡 4 张），三级层级明显，无中央大面积空白。

**阶段 4 — 模块识别与内嵌皮肤**：侧栏与命令栏缩略插画、iframe 卡通皮肤。
验收：六个模块内所有按钮 / 输入 / 计算 / 导入导出可用，模块 06 同步与 localStorage 数据完整。

**阶段 5 — 响应式与回归**：1920 / 1680 / 1440 / 1280 / 980 截图核对。
验收：无横向滚动；中文无截断、无插画遮挡；对照现有 `modules` 清单确认控件与 ID 无缺失。

请确认此方案后我再开始编码。
