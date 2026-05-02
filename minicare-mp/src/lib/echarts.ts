/**
 * ECharts 按需引入配置
 * 仅引入项目实际用到的图表类型和组件，大幅减小包体积
 * 完整引入 ~5MB → 按需引入 ~800KB
 */
import * as echarts from 'echarts/core'

// 图表类型
import { LineChart, BarChart, ScatterChart, PieChart } from 'echarts/charts'

// 组件
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
} from 'echarts/components'

// 渲染器 — 小程序使用 Canvas 渲染
import { CanvasRenderer } from 'echarts/renderers'

// 注册
echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  CanvasRenderer,
])

export type ECharts = echarts.ECharts
export type EChartsOption = echarts.EChartsCoreOption

export default echarts
