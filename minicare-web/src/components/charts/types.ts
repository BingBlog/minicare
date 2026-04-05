/**
 * 图表组件通用类型定义
 */

/** 数据点 */
export interface DataPoint {
  /** X 轴标签（日期/时间） */
  label: string
  /** Y 轴数值 */
  value: number
}

/** 多系列数据点 */
export interface SeriesDataPoint {
  label: string
  values: Record<string, number>
}

/** 图表颜色配置 */
export interface ChartColors {
  primary: string
  secondary?: string
  tertiary?: string
  quaternary?: string
  quinary?: string
}

/** 坐标轴配置 */
export interface AxisConfig {
  /** 是否显示网格线 */
  showGrid?: boolean
  /** Y 轴最小值（默认自动） */
  yMin?: number
  /** Y 轴最大值（默认自动） */
  yMax?: number
  /** Y 轴标签格式化函数 */
  yFormat?: (value: number) => string
  /** X 轴标签间隔（每隔几个显示） */
  xLabelInterval?: number
}

/** 图表基础 Props */
export interface BaseChartProps {
  /** 图表宽度（默认容器宽度） */
  width?: number
  /** 图表高度（默认 200） */
  height?: number
  /** 图表边距 */
  padding?: {
    top?: number
    right?: number
    bottom?: number
    left?: number
  }
  /** 颜色配置 */
  colors?: ChartColors
  /** 坐标轴配置 */
  axis?: AxisConfig
  /** 是否显示图例 */
  showLegend?: boolean
  /** 是否显示数据点 */
  showDots?: boolean
  /** 是否显示数值标签 */
  showValues?: boolean
  /** 自定义类名 */
  className?: string
}

/** 折线图 Props */
export interface LineChartProps extends BaseChartProps {
  /** 单系列数据（与 seriesData 二选一） */
  data?: DataPoint[]
  /** 多系列：每条与单系列相同 X 顺序；与 data 二选一 */
  seriesData?: SeriesDataPoint[]
  /** 多系列时必填：绘制顺序与颜色键 */
  seriesOrder?: string[]
  /** 多系列图例文案（默认用 series key） */
  seriesLabels?: Record<string, string>
  /** 是否填充区域（仅单系列，或多系列时只填充 seriesOrder 第一项） */
  fillArea?: boolean
  /** 是否显示平滑曲线 */
  smooth?: boolean
}

/** 柱状图 Props */
export interface BarChartProps extends BaseChartProps {
  data: DataPoint[]
  /** 柱子宽度比例（0-1） */
  barWidth?: number
  /** 是否显示为圆角 */
  rounded?: boolean
}

/** 堆积柱状图 Props */
export interface StackedBarChartProps extends BaseChartProps {
  data: SeriesDataPoint[]
  /** 系列名称顺序 */
  seriesOrder: string[]
  /** 系列颜色映射 */
  seriesColors: Record<string, string>
  /** 图例展示名（不传则使用 series key） */
  seriesLabels?: Record<string, string>
  /** 柱子宽度比例（0-1） */
  barWidth?: number
}

/** 环形图 Props */
export interface DonutChartProps {
  /** 各部分数据 */
  data: Array<{
    label: string
    value: number
    color: string
  }>
  /** 图表尺寸 */
  size?: number
  /** 内圆半径比例（0-1） */
  innerRadius?: number
  /** 是否显示中心文字 */
  showCenter?: boolean
  /** 中心文字 */
  centerText?: string
  /** 中心数值 */
  centerValue?: string
  /** 自定义类名 */
  className?: string
}

/** 生长曲线数据点 */
export interface GrowthDataPoint {
  /** 月龄 */
  ageMonths: number
  /** 测量日期 */
  date: string
  /** 实际值 */
  value: number
  /** 单位（g 或 mm） */
  unit: 'g' | 'mm'
}

/** 百分位曲线数据 */
export interface PercentileCurve {
  p3: number
  p15: number
  p50: number
  p85: number
  p97: number
}

/** 生长曲线 Props */
export interface GrowthChartProps {
  /** 实际测量数据 */
  data: GrowthDataPoint[]
  /** 百分位曲线数据 */
  percentiles: Array<{
    ageMonths: number
    male?: PercentileCurve
    female?: PercentileCurve
  }>
  /** 性别 */
  gender: 'male' | 'female'
  /** 测量类型 */
  measureType: 'weight' | 'height' | 'head'
  /** 图表高度 */
  height?: number
  /** 自定义类名 */
  className?: string
}
