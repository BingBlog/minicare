# M4 · 总结分析与生长曲线（技术方案）

> 模块：M4 ｜ 状态：**P2 已落地** ｜ 优先级：P2
> **2026-08-23 P2 完成**：minicare-agent `lib/tools/analyze-baby-data.js`（trend 首尾 3 天均值对比 + 极差比；summary 跨维聚合；growth 百分位）+ `lib/growth.js`（中国 2023 儿科生长参考，与小程序 growth-standards 同源）。生长数据不足（<2 次测量）明确返回 hasData:false。

## 1. 技术设计概览

```
一键周报/月报按钮 ──预置消息──▶ 模型意图识别 ──▶ analyze_baby_data(scope)
对话请求"帮我总结" ───────────▶                    ├─ trend   单维趋势
                                                  ├─ summary 跨维总结
                                                  └─ growth  生长曲线
                        └──▶ 返回结构化 JSON ──▶ 模型组织回答 + 总结卡片
```

- 周报/月报 = 前端按钮向输入框插入预置消息"生成最近 7 天/30 天总结"，**无新接口**；
- 数据聚合复用 M3 的 queryMetric，本模块做跨维编排与生长计算。

## 2. analyze_baby_data 工具

```ts
// lib/tools/analyze-baby-data.js
import { z } from 'zod'
export const ANALYZE_BABY_DATA_TOOL = {
  name: 'analyze_baby_data',
  description: '对宝宝健康记录做趋势分析、跨维度综合总结或生长曲线解读。用户要求总结/趋势/周报/月报/生长时调用，结果带数据依据。',
  parameters: z.object({
    scope: z.enum(['trend','summary','growth']),
    days: z.number().int().min(1).max(90).optional().default(7),
    metrics: z.array(z.enum(['feeding','sleep','diaper','growth','health','symptom','activity'])).optional(),
  }),
  execute: async ({ scope, days, metrics }, ctx) => {
    const babyId = ctx.babyId
    if (scope === 'trend')  return await trendAnalysis(babyId, metrics?.[0], days)
    if (scope === 'summary') return await summaryAnalysis(babyId, metrics ?? ALL, days)
    if (scope === 'growth') return await growthAnalysis(babyId, days)
  },
}
```

### 2.1 trend（单维趋势）

- 复用 M3 trend SQL 按天分组 → 序列；
- 趋势判定：线性回归斜率符号 + 波动系数（简单实现：首尾 3 天均值对比 + 极差比）；
- 异常点：单日值与前后 2 天均值偏差 >50% → `suspect: true`；
- 返回：`{ ok, metric, days, trend: 'up'|'down'|'flat'|'volatile', keyNumbers, anomalies: [...] }`。

### 2.2 summary（跨维总结）

- 循环各维度调 queryMetric（days 窗口）→ 每维生成 `{ metric, summary, keyNumbers }`；
- 无记录维度 → `{ metric, hasData: false }`（模型输出"暂无记录"）；
- 异常聚合：各维 anomalies + 跨维关联提示（如"6/15 奶量下降且同日血丝便"）；
- 返回 `{ ok, scope:'summary', days, dimensions: [...], anomalies: [...], note }`。

### 2.3 growth（生长曲线，lib/growth.js）

- 数据源：**中国 2023 儿科生长参考**（P3-P97），与小程序内置 growth-standards 同源；
- 形态：内置常量表（按月龄/月龄区间 → 各百分位体重/身高），约几十 KB，运行时查询，不建表；
- 计算：
  ```js
  // lib/growth.js
  export function percentileOf(ageMonths, sex, type /* weight|height */, value) {
    const ref = GROWTH_2023[sex][type][nearestAgeIndex(ageMonths)]   // {p3,p10,p25,p50,p75,p90,p97}
    return { percentile: interpolate(ref, value), range: bucket(ref, value) } // 如 P50-P75
  }
  // 返回 { p: 'P50-P75', ref: '中国2023儿科生长参考' }
  ```
- 输出：`{ ok, scope:'growth', days, weight: { p:'P50-P75', lastKg, deltaKg }, height: {...} | null }`；
- 数据不足（<2 次测量）→ `hasData:false`，模型提示"记录不足以解读生长曲线"。

## 3. 总结卡片 JSON schema（模型组织回答的依据）

```json
{
  "title": "旺仔 7 月整体情况",
  "period": "2026-07-01 ~ 2026-07-31",
  "dimensions": [
    { "metric": "feeding", "label": "喂养", "summary": "日均 780ml", "keyNumbers": ["42 条记录", "夜奶 2 次/晚"] },
    { "metric": "growth",  "label": "生长", "summary": "体重 +620g", "growth": { "p": "P50-P75" } }
  ],
  "anomalies": [{ "date": "2026-06-15", "metric": "diaper", "desc": "血丝便 1 次" }],
  "advice": ["关注点结合知识库给建议"],
  "note": "数据来自 7 月各类记录共 168 条"
}
```

## 4. 测试与验证

- 趋势正确性：造 3 组数据（上升/下降/平稳）→ trend 判定正确；
- 生长百分位：已知体重对照参考表 → 输出区间正确（P50-P75 等）；
- 数据不足：<5 天有效 / <2 次测量 → 明确提示；
- 周报按钮：前端预置消息 → 模型触发 summary(days=7) → 卡片正确。
