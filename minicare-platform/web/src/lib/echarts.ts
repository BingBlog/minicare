/**
 * ECharts **按需引入**（PRD-016 §7 / TECH-033 §6.4）。
 *
 * 与小程序端 `minicare-mp/src/lib/echarts.ts` **同口径**：只注册实际用到的图表与组件，
 * 避免整包引入（全量 ~1MB+ gzip）——本平台是桌面工具，但也没必要为此付体积。
 *
 * 本域只用到两类图：
 *   · 折线 —— 日活跃趋势（DAU + 7 日均线）、单功能趋势；
 *   · 柱状 —— 功能条数排行、周新增。
 *
 * `AriaComponent` 打开无障碍描述（折线图对读屏用户本来近乎不可读，至少给出文字摘要）；
 * `MarkLineComponent` 供 7 日均值参考线。
 *
 * ⚠️ 颜色**不能写 CSS 变量**（`var(--accent)`）：ECharts 走 Canvas 渲染，
 * 变量不会参与解析，最终会退化成黑色。色值统一在 `analyticsChart.ts` 里以字面量给出，
 * 且与 `styles.css` 的 `:root` 令牌逐值对齐。
 */
import * as echarts from 'echarts/core'

// 图表类型
import { LineChart, BarChart } from 'echarts/charts'

// 组件
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  AriaComponent,
} from 'echarts/components'

// 渲染器（Web 端走 Canvas）
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  AriaComponent,
  CanvasRenderer,
])

export type ECharts = echarts.ECharts
export type EChartsOption = echarts.EChartsCoreOption

export default echarts
