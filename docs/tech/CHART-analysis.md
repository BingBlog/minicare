# minicare-web 图表组件分析报告

> 分析时间：2026-04-18
> 分析范围：`minicare-web/src/components/charts/`

---

## 一、现有图表组件概览

图表目录共 **9 个文件，约 1816 行代码**，全部为纯 SVG 手写实现，未引入任何第三方图表库。

| 文件 | 行数 | 图表类型 | 渲染方式 |
|------|------|---------|---------|
| `GrowthChart.tsx` | 489 | 生长曲线 + 百分位参考线 | 纯 SVG |
| `LineChart.tsx` | 335 | 折线图（支持多系列） | 纯 SVG |
| `StackedBarChart.tsx` | 202 | 堆积柱状图 | 纯 SVG |
| `BarChart.tsx` | 189 | 柱状图 | 纯 SVG |
| `DonutChart.tsx` | 179 | 环形图 | 纯 SVG |
| `ScatterChart.tsx` | 141 | 散点图 | 纯 SVG |
| `types.ts` | 199 | 类型定义 | — |
| `chartAxis.tsx` | 54 | X 轴标签辅助 | — |
| `index.ts` | 28 | 统一导出入口 | — |

---

## 二、各组件详细分析

### 2.1 BarChart — 柱状图

**功能特性：**
- 支持 Y 轴刻度自动计算和自定义范围
- 支持 X 轴标签倾斜显示（通过 `ChartRotatedXLabel`）
- 支持网格线显示/隐藏
- 支持柱顶圆角（`rounded` prop）
- 支持在柱顶显示数值标签

**算法复杂度：**  
线性映射（数据值 → 像素坐标），Y 轴范围自动扩展 1.2 倍，`O(n)` 遍历。

**功能缺口：** 无 Tooltip、无悬停高亮、无动画、仅支持单系列。

---

### 2.2 LineChart — 折线图

**功能特性：**
- 支持单系列（`data`）和多系列（`seriesData + seriesOrder`）两种数据模式
- 支持平滑曲线（三次贝塞尔曲线）
- 支持面积填充（`fillArea` prop）
- 支持多系列图例显示
- 支持数据点和数值标签显示

**核心算法 — 三次贝塞尔平滑曲线：**
```ts
function buildLinePath(points, smooth) {
  return points.map((p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`
    if (smooth) {
      const prev = points[i - 1]
      const cpx = (prev.x + p.x) / 2
      return `C ${cpx} ${prev.y} ${cpx} ${p.y} ${p.x} ${p.y}` // 控制点取相邻点 X 中点
    }
    return `L ${p.x} ${p.y}`
  }).join(' ')
}
```

**算法复杂度：** `O(n)` 单系列，`O(n×m)` 多系列（m 为系列数）。

**功能缺口：** 无 Tooltip、无悬停高亮、无缩放/平移、无动画。

---

### 2.3 StackedBarChart — 堆积柱状图

**功能特性：**
- 展示各类型占比（如母乳/配方奶/辅食占比）
- 支持多系列堆积
- Y 轴最大值自动向上取整到刻度间隔
- 支持图例显示

**核心算法 — 从底部向上累加：**
```ts
for (const key of seriesOrder) {
  const value = d.values[key] || 0
  const segmentHeight = Math.max(0, (value / yMax) * innerHeight)
  currentY -= segmentHeight  // 从底部向上偏移
  segments.push({ y: currentY, height: segmentHeight, ... })
}
```

**算法复杂度：** `O(n×m)`（n 数据点，m 系列数）。

**功能缺口：** 无 Tooltip、无悬停效果、无动画。

---

### 2.4 DonutChart — 环形图

**功能特性：**
- 展示比例数据（情绪分布、大便性状分布等）
- 支持中心文字和数值显示
- 自动计算百分比和弧度
- 支持图例显示

**核心算法 — 极坐标弧线路径（`SVG arc` 路径）：**
```ts
const describeArc = (cx, cy, outerR, innerR, startAngle, endAngle) => {
  const x1Outer = cx + outerR * Math.cos(startAngle)
  const y1Outer = cy + outerR * Math.sin(startAngle)
  // ... 计算四个端点坐标
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0
  return `M ... A ${outerR} ... L ... A ${innerR} ... Z`
}
```
需要处理完整圆（角度接近 2π）的特殊情况（绘制两个半圆）。

**功能缺口：** 无 Tooltip、无悬停扩展效果、无动画。

---

### 2.5 GrowthChart — 生长曲线图（最复杂）

**功能特性：**
- 展示体重/身高/头围实测曲线
- 叠加国家标准百分位曲线（P3、P15、P50、P85、P97）
- 支持动态 X 轴坐标域（局部放大）
- 支持 Y 轴动态收窄（根据可视区间数据）
- 支持性别切换（男/女）、测量类型切换（体重/身高/头围）
- 自适应容器宽度

**核心算法 1 — Catmull-Rom 样条曲线（百分位参考线）：**
```ts
// 切线方向由前后邻点决定，曲线自然连续；适合单调平滑曲线
function catmullRomPath(points, tension = 0.5) {
  const pts = [points[0], ...points, points[points.length - 1]]
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i-1], pts[i], pts[i+1], pts[i+2]]
    const cp1x = p1.x + ((p2.x - p0.x) * tension) / 3
    const cp1y = p1.y + ((p2.y - p0.y) * tension) / 3
    const cp2x = p2.x - ((p3.x - p1.x) * tension) / 3
    const cp2y = p2.y - ((p3.y - p1.y) * tension) / 3
    d.push(`C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`)
  }
}
```

**核心算法 2 — 局部放大坐标域：**
```ts
// 数据跨度 < 1.5 月时，X 轴只框住数据附近区间
if (dataSpanMo < ZOOM_DOMAIN_SPAN_THRESHOLD_MO) {
  let lo = Math.max(0, dataMinMonth - DOMAIN_PAD_MO)
  let hi = Math.min(stdMaxMonth, dataMaxMonth + DOMAIN_PAD_MO)
  if (hi - lo < 2) {
    const mid = (dataMinMonth + dataMaxMonth) / 2
    lo = Math.max(0, mid - 1)
    hi = Math.min(stdMaxMonth, mid + 1)
  }
}
```

**核心算法 3 — X 轴刻度自适应：**
```ts
// 根据数据跨度（月数）动态选择刻度间隔
if (span <= 2.5) step = 0.5
else if (span <= 6) step = 1
else if (span <= 18) step = 3
else step = 6
// 刻度数 > 8 时自动稀疏化
```

**算法复杂度：** `O(n)` 实测数据 + `O(m)` 百分位曲线（m 为月龄采样数，约 120 个点/曲线 × 5 条）。

**功能缺口：** 无 Tooltip（无法点击查看精确测量值）、无手势交互、无动画。

---

### 2.6 ScatterChart — 散点图（最简单）

**功能特性：**
- 用于报告页体温、情绪等按日分布展示
- 支持自定义散点大小和颜色
- 槽位式 X 轴布局（每个数据点占一个槽位）

**算法复杂度：** `O(n)` 线性映射，最简单。

**功能缺口：** 无 Tooltip、无悬停效果、无散点选择。

---

## 三、图表使用分布

Report 页各 Tab 组件的图表依赖：

| Tab 文件 | 使用的图表组件 |
|---------|--------------|
| `DiaperTab.tsx` | `BarChart`、`StackedBarChart` |
| `FeedingTab.tsx` | `LineChart`、`StackedBarChart` |
| `SleepTab.tsx` | `LineChart` |
| `HealthTab.tsx` | `ScatterChart`、`DonutChart` |
| `GrowthTab.tsx` | `GrowthChart` |

---

## 四、当前功能缺口汇总

| 特性 | 状态 | 影响程度 |
|------|------|---------|
| Tooltip（触摸/悬停查看数值） | ❌ 全部缺失 | 🔴 高 — 用户无法查看具体数值 |
| 悬停/激活高亮 | ❌ 全部缺失 | 🟡 中 |
| 动画（入场/更新） | ❌ 全部缺失 | 🟡 中 |
| 移动端手势（缩放/平移） | ❌ 全部缺失 | 🟡 中 |
| 响应式宽度 | ✅ 支持 | — |
| 自适应刻度 | ✅ 支持 | — |
| 图例 | ✅ 部分支持 | — |
| 多系列 | ✅ 部分支持 | — |
| TypeScript 类型 | ✅ 完整定义 | — |

---

## 五、三方图表库调研对比

### 5.1 候选库综合评分

| 维度 | Recharts | Nivo | ECharts | Chart.js | Victory |
|------|----------|------|---------|----------|---------|
| **gzip 体积** | ~25-45KB | ~20-30KB（按需） | ~150KB（按需） | ~65KB | ~60KB |
| **移动端 Touch** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Tooltip 内置** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **参考线叠加** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐（需插件） | ⭐⭐⭐⭐ |
| **渲染方式** | SVG | SVG/Canvas | Canvas/SVG | Canvas | SVG |
| **React 声明式** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐（配置式） | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **TypeScript 质量** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **维护活跃度** | 25.8k ⭐ | 13.6k ✅ | 60k ✅ | 65k ✅ | 11.2k ✅ |

### 5.2 各库关键特点

#### Recharts
- `<ReferenceLine>` + `<ReferenceArea>` 原生 API，完美支持 GrowthChart 百分位线场景
- React 声明式组件 API，与项目代码风格一致，迁移成本最低
- 纯 SVG 渲染，移动端性能良好，DOM 可直接操作
- TypeScript 类型内置（官方，无需额外 `@types/`）
- **短板**：长按/滑动手势需自行适配

#### Nivo
- 按需引入体积最小，文档质量最佳（在线配置器可生成代码）
- Tooltip 自定义能力强（支持完整 React 组件渲染）
- 支持 Canvas 模式，大数据量场景有优势
- **短板**：多图表组合稍复杂

#### ECharts（echarts-for-react）
- 功能最全面：参考线、标注、地图、3D 全内置
- 移动端触摸交互最佳（长按、滑动、缩放、平移全支持）
- 中文文档完善
- **短板**：按需引入后仍约 150KB gzip（是 Recharts 的 5-6 倍）；配置式 API 与 React 风格格格不入

#### Chart.js
- Canvas 渲染，大数据量性能最佳
- 触摸交互优于 Recharts
- **短板**：Canvas 渲染无法像 SVG 直接操作 DOM；参考线依赖 `chartjs-plugin-annotation` 插件

---

## 六、实施方案（已确定：引入 Recharts）

> 更新时间：2026-04-18 | 状态：**已完成实施**

### 6.1 决策

**最终方案：全量迁移到 Recharts**

| 原因 | 说明 |
|------|------|
| 参考线原生支持 | `<ComposedChart>` 混合 Line 系列，完美替代 GrowthChart 中手写的 Catmull-Rom 样条算法 |
| Tooltip 零成本 | `<Tooltip>` 开箱即用，移动端 touch 触发，支持完全自定义渲染 |
| React 声明式 API | 与项目代码风格完全一致，迁移成本最低 |
| 体积可控 | gzip 约 25-30KB，对移动端 H5 影响最小 |
| TypeScript 完善 | 官方类型内置，无需额外 `@types/` |
| 渲染方式一致 | 纯 SVG，与原有架构一致，DOM 可访问 |

不选 ECharts：按需引入后仍约 150KB gzip（原有全部 JS 约 200KB），且配置式 API 与 React 风格不符。

### 6.2 迁移范围（全量）

| 组件 | 迁移结果 | Recharts 对应 |
|------|---------|--------------|
| `GrowthChart` | ✅ 已迁移 | `ComposedChart` + 多条 `Line`（百分位）+ `Line`（实测）+ `Tooltip` |
| `LineChart` | ✅ 已迁移 | `LineChart` + `Line` + `Area` + `Tooltip` |
| `BarChart` | ✅ 已迁移 | `BarChart` + `Bar` + `Tooltip` |
| `StackedBarChart` | ✅ 已迁移 | `BarChart(stackId)` + 多条 `Bar` + `Tooltip` |
| `DonutChart` | ✅ 已迁移 | `PieChart` + `Pie(innerRadius)` + `Tooltip` |
| `ScatterChart` | ✅ 已迁移 | `ScatterChart` + `Scatter` + `Tooltip` |

移除文件：`chartAxis.tsx`（原 X 轴标签辅助，已被 Recharts `<XAxis>` 内置替代）

### 6.3 安装

```bash
cd minicare-web
npm install recharts
```

### 6.4 GrowthChart 核心实现（生长曲线 + 百分位）

GrowthChart 使用 `ComposedChart`，将百分位曲线（P3/P15/P50/P85/P97）和实测数据线均作为 `<Line>` 系列混合渲染，共享同一坐标轴：

```tsx
// 关键：百分位曲线 + 实测曲线合并为一个 data 数组
// 每个 datapoint: { ageMonths, p3, p15, p50, p85, p97, actual? }
<ComposedChart data={mergedData}>
  <XAxis dataKey="ageMonths" tickFormatter={formatMonth} />
  <YAxis domain={[yMin, yMax]} />
  {/* 百分位参考线（不在 Tooltip 中展示） */}
  <Line dataKey="p3"  stroke="#C4B5D4" strokeDasharray="3 3" dot={false} legendType="none" />
  <Line dataKey="p50" stroke="#9B8ED8" dot={false} legendType="none" />
  <Line dataKey="p97" stroke="#C4B5D4" strokeDasharray="3 3" dot={false} legendType="none" />
  {/* 实测数据线（在 Tooltip 中展示） */}
  <Line dataKey="actual" stroke="#F87098" dot={{ r: 4, fill: '#F87098' }} connectNulls={false} />
  <Tooltip content={<GrowthTooltip measureType={activeMeasure} />} />
</ComposedChart>
```

### 6.5 Tooltip 设计规范

所有图表 Tooltip 使用品牌色卡片样式，与项目整体 UI 风格保持一致：

```tsx
// 通用 Tooltip 卡片
<div className="bg-white rounded-xl px-3 py-2 shadow-lg border border-gray-100 text-xs">
  <p className="font-semibold text-[#F87098]">{value}</p>
  <p className="text-gray-400">{label}</p>
</div>
```

