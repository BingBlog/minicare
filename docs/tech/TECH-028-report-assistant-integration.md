# TECH-028 — 分析页 × 敏宝助手「分析域联动」技术方案（深链触达 × 对话图表）

> 日期：2026-10-11 ｜ 状态：**v0.2 — P0（阶段一 + 阶段二）已实施**（配套 PRD-013 v1.0；实施快照见 §0 末）
> 关联：`docs/prd/PRD-013.md`（需求）｜ `docs/tech/TECH-025-mp-chart-rendering-research.md`（图表同层渲染，已落地）｜ `docs/tech/TECH-006-agent-tech.md`（助手技术方案）｜ PRD-006 §7.4 / §7.5（协议基座）
> 目标读者：实施者（照着本文可直接开工）+ 验收者。

---

## 0. 结论摘要

**一句话**：三层改动 = **小程序**（入口 / 深链 / 图表渲染）+ **agent**（图表块旁路生成 / SSE 扩展 / prompt 调整）+ **服务端零改动**；深链走「**前端组装自然语言消息**」，agent 对深链参数零感知。

**关键设计决策（D1~D7）**：

| # | 决策 | 结论 | 理由 |
| --- | --- | --- | --- |
| D1 | 深链上下文的消费方式 | **前端组装消息**（chat 页把 anchor/range 映射为自然语言起手消息），agent 无感知 | 零协议改动；复用 `preset=diary` 既成模式（其消息文本也是前端组装） |
| D2 | 图表生成落点 | **runtime 旁路生成**：工具 execute 不动，runtime 在 tool_result 后按（工具名+入参声明+输出数据）调用 `buildChartBlock` 生成块并 yield | 生成逻辑内聚为独立模块；工具 output 保持纯净（不占模型上下文）；少改 3 个文件 |
| D3 | 模型自由度的边界 | **分析场景默认出图**（按 scope 默认模板），模型可传 `chart:'none'` 关闭或改许可图型；query 场景默认不出图，模型声明才出 | 防止"模型忘声明 → 该有图没图"；仍符合 PRD「混合模式：模型在有限模板内选择」 |
| D4 | SSE 承载 | 新增 `event: block`，`data = { block }`（wrapper 保持扩展：未来行动卡/建议卡同通道） | 对齐 PRD-006 §7.5 设计 |
| D5 | 图表数量约束实现 | runtime 层**单轮计数**（本轮已发 1 张后，后续 chart 事件丢弃） | 单点实现，工具/前端零逻辑 |
| D6 | growth 出图数据源 | `growthAnalysis` 输出**补充全量测量序列** `series`（并脱离 days 90 上限取全量记录） | 现有 output 只有最新值+分位，画不了曲线；一并满足 PRD「生长全量」 |
| D7 | 兼容与发布顺序 | **agent 先行、小程序后行**：旧前端对未知 `block` 事件天然忽略（无 else 分支）；新前端上线即见图 | 双向兼容、互不阻塞 |

**实施快照（2026-10-11，P0 阶段一+二 已落地）**：

| 端 | 落地内容 | 验证 |
| --- | --- | --- |
| agent | 新增 `lib/chart-block.js`（四模板映射 + 资格判定 + caption/source）；`analyze`/`query` 工具加 `chart` 参数与描述；`growthAnalysis` 改全量（`queryGrowthAll`）+ 输出补 `series`（逐点月龄/体重/身高）；`runtime.js` 旁路生成 + 单轮 ≤1 计数 + `chart` 事件；`chat.js` → `sse('block')`；`system.js` 规则 32a~32d | chart-block 自测 **17/17**；7 文件语法检查 PASS；prompt 组装 PASS |
| 小程序 | 新增 `AskAssistantBar`（6 Tab 洞察卡接入、游客态不显示）；`pagesReport/index.tsx` 传 range；chat 页深链组装 + 防重（`analysisSentRef`）+ `block` 事件分支 + 消息 `charts[]` 渲染；新增 `ChatChartCard` + `lib/chartBlockToOption.ts`；`api/agent.ts` 类型 | `tsc` **0 新增**（src 45 条全为历史基线）；`build:weapp` 通过；产物 10/10 关键字核验 |
| 服务端 | 零改动（透传待端到端实测确认） | — |

**实施中的设计修正（与本文 v0.1 的差异，以本节为准）**：
1. **`refLines` 字段弃用** → 生长百分位参考是**随月龄变化的曲线**（单值水平线会误导），参考线改由 `series` 承载（`kind:'line'`, `ref:true`），schema 的 series 增加可选 `kind`（line/bar/scatter）与 `ref` 字段；
2. `source.tab` 取值域收敛为与前端 Tab 一致的 5 个数值维度（activity/symptom 等无对应 Tab 的维度不产生 source）；
3. 排敏入口落点由「小贴士卡」调整为「**数据洞察**卡」（当日排敏 Tab 已重构为图表分析形态，6 Tab 洞察卡统一）。

**未做（后续）**：US-07（P2 全屏预览 + 跳分析页）；贯穿项口径核对（§4，实施后执行）；真机走查（与 TECH-025 §5 清单合并）；服务端 SSE 透传端到端实测。

---

## 1. 总体链路

```
【深链触达链路】（阶段一，纯小程序）
分析页洞察卡「让助手深入分析 →」
   │ onClick: navigateTo('/pages/chat/index?intent=analysis&anchor=report:sleep&range=30')
   ▼
chat 页读 router.params（decodeParam 解码）
   │ 组装起手消息（映射表）→ 复用 sendMessage
   ▼
"帮我分析最近 30 天的睡眠情况" ——→ 走既有对话链路（模型按 prompt 规则调用 analyze_baby_data）

【图表下发链路】（阶段二）
模型 tool_call（analyze_baby_data, {scope:'trend', metrics:['sleep'], days:30, chart?:'line'})
   │ runtime: 记录本轮图表声明
   ▼
工具执行 → tool_result（output=结构化数据）
   │ runtime: buildChartBlock(工具名, 入参, output)  ← 资格判定+模板映射（确定性）
   │         单轮计数校验（≤1）
   ▼
yield { type:'chart', chart: {…} }
   │ chat.js: sse(res, 'block', { block: chart })
   ▼
chat 页 onEvent('block') → 追加到当前消息 charts[] → ChatChartCard 渲染（文字之后）
```

---

## 2. 协议设计

### 2.1 深链参数（小程序内部契约，对齐 PRD-006 §7.4）

| 参数 | 取值 | 说明 |
| --- | --- | --- |
| `intent` | `analysis` | 本期新增值；仅作入口来源标识与防重键 |
| `anchor` | `report:<tab>`，tab ∈ `growth \| feeding \| sleep \| diaper \| health \| allergy` | 决定起手消息的维度 |
| `range` | `7 \| 14 \| 30 \| 90 \| 180 \| 365 \| birth` | 决定起手消息的时间窗文案；allergy 场景忽略 |

- 编码：写入端 `encodeURIComponent`，读取端统一走 `decodeParam`（PRD-009 踩坑复用）。
- 非法值降级：忽略该参数；`anchor` 非法则整条按无上下文处理（不组装起手）。

### 2.2 SSE `block` 事件 + chart 块 schema（跨端契约）

```jsonc
// event: block
// data:
{
  "block": {
    "id": "blk_<uuid8>",
    "type": "chart",
    "chartType": "line | bar | mixed | growth",
    "title": "睡眠时长趋势",              // 用户可见
    "series": [
      {
        "name": "每日睡眠",
        "unit": "小时",
        "axis": 0,                        // 0=左轴 1=右轴（mixed 图用）
        "points": [[ "09-12", 12.5 ], …]  // [x标签, 数值]；数值 round 到 1 位
      }
    ],
    "refLines": [                          // 可选（growth 图）：参考线
      { "name": "P3", "value": 8.2 },
      { "name": "P50", "value": 10.1 },
      { "name": "P97", "value": 12.4 }
    ],
    "caption": "最近 30 天 · 共 28 天有记录",  // 强制
    "source": { "tab": "sleep", "range": "30" } // 可选：跳分析页预选用（US-07）
  }
}
```

- 前端 `api/agent.ts`：`AgentSSEEvent` 联合类型新增 `{ event: 'block'; data: { block: ChartBlock } }`；现解析器对未知事件已透传、chat 页处理链对未匹配事件天然忽略 → **双向兼容确认**。
- 持久化：`ChatMessage` 新增 `charts?: ChartBlock[]`，随消息一并进 storage（`persistMessages` 扩展）；数据点已 round，单块约 1~3KB，40 条消息上限内可控。

### 2.3 图型模板与数据映射（`buildChartBlock` 规则）

| 模板 | 触发场景 | x 轴 | series 构成 | 资格 | 降级 |
| --- | --- | --- | --- | --- | --- |
| `line` | analyze trend / query trend | 日期 `MM-DD` | 单序列（该维度数值） | ≥3 个有记录的天 | 不足 → 不出图 |
| `bar` | 同上（模型改选） | 同上 | 同上（柱状） | 同上 | 同上 |
| `mixed` | analyze summary（周报/月报） | 日期 | 奶量柱（ml，左轴）+ 睡眠线（h，右轴） | 至少一个序列 ≥3 天 | 仅一个序列有数据 → 该序列单图（bar/line） |
| `growth` | analyze growth | 月龄（测量当天） | 体重散点（无体重则身高）+ refLines P3/P50/P97 | ≥1 个测量点 | — |

- **标题/序列名映射**（单一定义处，代码内常量）：`feeding`→喂养/奶量 ml；`sleep`→睡眠/小时；`diaper`→大便/次；`activity`→活动/分钟；`health`→健康/次；`growth`→生长/kg·cm。
- mixed 图用的数据来自 summary output 的 `daily`（`formula_ml` + `sleep_min`）；月报（>14 天）同样用 `daily`（不额外取 weeks）。
- **图表生成不做任何数值再计算**：直接取工具输出中的既有数值（口径与文字必然一致——贯穿项的技术保障之一）。

---

## 3. 各端改动

### 3.1 小程序（`minicare-mp/`）

| 文件 | 改动 | 说明 |
| --- | --- | --- |
| `src/pagesReport/components/AskAssistantBar.tsx`（新） | 入口组件：props `{ tab, range }` → 文案按 tab 映射（allergy 特殊）→ onClick `navigateTo` | 入口行样式：右对齐文字按钮（主色 #F87098 + 箭头），置于洞察卡分隔线下方 |
| `src/pagesReport/tabs/{FeedingTab,SleepTab,DiaperTab,HealthTab,GrowthTab,AllergyTab}.tsx` | 洞察卡/小贴士卡底部接入 `<AskAssistantBar>` | 显示条件天然满足（洞察卡只在有数据时渲染） |
| `src/pages/chat/index.tsx` | ① 深链解析 + 起手组装（新增 `intent==='analysis'` 分支 + `analysisSentRef` 防重）；② onEvent 新增 `block` 分支 → 追加 `charts[]`；③ 消息渲染新增 `<ChatChartCard>` 列表（内容之下） | 起手映射表见下 |
| `src/api/agent.ts` | 新增 `ChartBlock` 类型 + SSE `block` 事件类型 | — |
| `src/components/ChatChartCard/`（新） | 图卡：标题 → `EcChart`（`interactive` 按需）→ 图注；容器先渲染、canvas 初始化完成后自然填充；渲染异常 try/catch → 整卡隐藏 | 复用 `chartTheme.ts` 暖色主题 |
| `src/lib/chartBlockToOption.ts`（新） | `ChartBlock → EChartsOption` 转换（line/bar/mixed/growth 四映射 + 双轴 + 参考线） | 纯函数，便于单测 |
| （P2）`src/pages/chat/chart-preview/`（新） | 全屏预览页：storage 传参（messageId+chartId）→ 大图 + 图注 + 「在分析页查看」 | — |
| （P2）`src/pagesReport/index.tsx` | 接收 `tab`/`range` 预选参数（useLoad）；带参进入时呈现返回入口 | — |

**起手消息映射表**（chat 页内常量）：

| anchor | 起手消息 |
| --- | --- |
| `report:feeding` | 帮我分析最近{窗口}的喂养情况 |
| `report:sleep` | 帮我分析最近{窗口}的睡眠情况 |
| `report:diaper` | 帮我分析最近{窗口}的大便情况 |
| `report:health` | 帮我分析最近{窗口}的健康情况 |
| `report:growth` | 帮我看看宝宝的生长情况（`birth` 不带窗口文案） |
| `report:allergy` | 帮我评估一下宝宝最近的排敏进度和风险 |

窗口文案：`7→7 天 / 14→14 天 / 30→30 天 / 90→90 天 / 180→半年 / 365→一年`。

### 3.2 agent（`minicare-agent/`）

| 文件 | 改动 | 说明 |
| --- | --- | --- |
| `src/lib/tools/analyze-baby-data.js` | ① zod 参数加 `chart`（枚举 `line/bar/mixed/growth/none`，可选）；② description 更新（分析场景默认出图、可用 none 关闭、改图型从许可内选）；③ `growthAnalysis` 输出补 `series`（全量测量点）+ 脱离 days 上限 | D3/D6 |
| `src/lib/tools/query-baby-data.js` | zod 参数加 `chart`（可选，默认不出图） | D3 |
| `src/lib/chart-block.js`（新） | `buildChartBlock({ toolName, input, output })`：资格判定 → 模板映射 → caption 生成（窗口+有记录天数）→ `source` 派生 | §2.3 规则落地 |
| `src/lib/runtime.js` | ① tool_call 时记录 `input.chart` 声明；② tool_result 后（analyze/query）调用 `buildChartBlock`；③ 单轮 ≤1 图计数；④ `yield { type:'chart', chart }` | D2/D5 |
| `src/routes/chat.js` | 事件循环新增分支：`ev.type === 'chart'` → `sse(res, 'block', { block: ev.chart })` | 插入点：现有 `tool_result` 分支之后 |
| `src/prompts/system.js` | 新增「数据分析回答规范」小节：① 分析类请求调用 analyze 时按场景声明图表（默认跟随，不刻意关闭）；② 回答四要素（概况/异常/状态语境/建议+免责）；③ **长窗口 >90 天 → 按最近 90 天分析 + 温和说明**；④ 文字独立完整、不描述图本身（不写"如图可见"）；⑤ 起手句体现理解、不做二次确认 | PRD US-03/§横向规则 |

### 3.3 服务端（`minicare-server/`）—— 零改动

- 深链参数在 chat 页内消费（D1），chat 接口（`POST /api/agent/chat` 代理）不感知新参数；
- 图表数据全部来自 agent 既有工具查询，无新接口；
- ⚠️ 唯一核对项：nested `block` 事件在 server 代理层为**透传**（SSE 流式管道不做事件解析）——已具备，无需改动（实施时以一次端到端验证确认）。

---

## 4. 口径一致性核对方案（贯穿项）

**核对清单**（实施后逐一执行）：

| # | 对象 | A 端（小程序） | B 端（agent） | 核对方法 |
| --- | --- | --- | --- | --- |
| 1 | 生长百分位 | `lib/growth-standards.ts`（`calculatePercentile`，P3/P97 线性估算） | `lib/growth.js`（`percentileOf`，全分位插值） | 固定样本集（性别×月龄×测量值 ≥10 组）双端计算对比；差异 >1 个百分位档即修 |
| 2 | 生长参考数据表 | 内置表（中国 2023） | 内置表（中国 2023） | 抽查关键月龄点（0/6/12/24/36）P3/P50/P97 数值一致性 |
| 3 | 日均口径 | Tab 内计算（如 FeedingTab `avgFormula`：排除当日、按 hist 天数） | `analyze summary`（按有记录天数） | 同一窗口双端对比；分母口径差异写入结论 |

**修正策略（最小改动原则）**：
- 算法差异 → 对齐到同一插值实现（收敛到一端逻辑，另一端改为同款）；
- 数据表差异 → 以项目权威数据源为准同步；
- 若存在无法短期收敛的差异 → 记录为已知偏差并在对应端标注（不允许静默不一致）。
- ⚠️ 注意：profile.js 生长分位与 analyze 工具**已共用 `growth.js`**（既有收敛），核对重点是"前端 vs agent"这一对。

---

## 5. 分期与实施顺序

| 期 | 内容 | 交付物 | 可独立发版 |
| --- | --- | --- | --- |
| **阶段一（P0-1）** | 深链触达：入口组件 + chat 深链解析/起手 + （agent）prompt 四要素微调 | US-01/02/03 验收通过 | ✅（纯小程序 + prompt 调整） |
| **阶段二（P0-2）** | 对话图表：工具参数 + `chart-block.js` + runtime/chat.js + 前端渲染 | US-04/05/06 验收通过 | ✅（agent 先行无副作用） |
| **贯穿** | 口径一致性核对（§4） | 核对报告 + 修正提交 | 随阶段二收口 |
| **P2** | US-07 全屏预览 + 跳分析页 | — | ✅ |

**发布顺序硬约束**：**agent → 小程序**。旧版小程序对 `block` 事件无 handler（天然忽略）；反之若前端先行，新代码等待 agent 上线后才见效果（无故障但空转）。任何一期发布后，回滚仅需回滚对应端（协议单向兼容）。

**默认出图口径（D3 实施细节，验收口径）**：
- `analyze scope=trend` → `line`；`scope=summary` → `mixed`；`scope=growth` → `growth`（模型未传 chart 时）；
- `query aggregate=trend` → 默认不出图（模型传 chart 才出）；
- 资格不足时静默不出图（返回 `chart:null`，不报错、不影响文字）。

---

## 6. 测试与验收映射

| PRD 验收点 | 测试方式 |
| --- | --- |
| US-01 四场景（显示/跳转/空态/游客） | 开发者工具 + 真机走查（6 Tab） |
| US-02 四场景（传递/非法/防重/缺省） | URL 手改注入 + 返回重进 |
| US-03 六场景（起手/全量/压缩/无数据/纠正/排敏） | 真机对话走查（重点：长窗口文案、生长全量） |
| US-04 五场景（下发/一致/不出图/降级/持久化） | 真机 + 断网开关模拟 + 退出重进 |
| US-05 六场景（矩阵） | 对话脚本走查（趋势/周报/生长/单点/不足/其他） |
| US-06 五场景（图文/流式/恢复/降级/多图） | 真机重点（多图消息滚动性能 = TECH-025 待真机验收项一并覆盖） |
| 贯穿项（百分位/日均对照） | §4 核对脚本（一次性） |
| 回归 | minicare-agent 既有 eval 用例不出新 fail（P0 套件 5/5 保持） |

---

## 7. 风险与开放问题

| # | 风险/问题 | 处置 |
| --- | --- | --- |
| R1 | 多图消息滚动性能（EcChart 同层渲染实例数） | 单轮 ≤1 图 + 消息 40 条上限；真机专项走查（与 TECH-025 真机清单合并） |
| R2 | storage 容量（charts 持久化） | 数据点 round + 单块 1~3KB 评估；观察 40 条上限下的占用，必要时降为"仅保留最近 5 条带图消息" |
| R3 | `mixed` 双轴图在 ~640rpx 宽度的可读性 | 真机目检；不可读则降级为单序列（先奶量） |
| R4 | 模型不按规范声明/关闭图表 | 工具描述 + prompt 引导为主；代码层资格校验兜底（不合规声明自动忽略，按默认模板） |
| R5 | 长窗口"压缩到 90 天"说明的新鲜度 | 文案在实施时定稿并走查（US-03 场景3） |
| R6 | 起手消息的句式为固定模板，可能显得机械 | 先发固定句式（可控、可测）；观察后如需再演进为轻变量 |
| R7 | 口径核对发现真实偏差的修正成本 | 按 §4 策略分档处理；确实无法收敛的记入已知偏差清单（附端侧标注），不静默 |
| R8 | `birth` 全量生长记录的性能（代理层 60s 超时） | 全量测量通常 <100 条，查询轻；实施时实测确认 |

---

## 8. 附：改动文件总表（实施自查用）

```
minicare-mp/
  src/pagesReport/components/AskAssistantBar.tsx        [新]
  src/pagesReport/tabs/*.tsx ×6                          [接入口]
  src/pages/chat/index.tsx                               [深链+渲染+block]
  src/api/agent.ts                                       [类型]
  src/components/ChatChartCard/                          [新]
  src/lib/chartBlockToOption.ts                          [新]
  src/pages/chat/chart-preview/                          [新,P2]
  src/pagesReport/index.tsx                              [P2,预选参数]

minicare-agent/
  src/lib/tools/analyze-baby-data.js                     [chart 参数 + growth series]
  src/lib/tools/query-baby-data.js                       [chart 参数]
  src/lib/chart-block.js                                 [新]
  src/lib/runtime.js                                     [chart 事件]
  src/routes/chat.js                                     [block SSE]
  src/prompts/system.js                                  [回答规范]

minicare-server/                                        [零改动]
```

---

> 返回 [PRD-013](../prd/PRD-013.md) ｜ [TECH-025](TECH-025-mp-chart-rendering-research.md) ｜ PRD-006 §7.4/§7.5
