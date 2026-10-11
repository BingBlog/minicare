/**
 * 报告页图表统一样式（2026-10-11）
 *
 * 小程序端 tooltip 无 DOM，ECharts 自动走 richText（画布）渲染，
 * 可用样式键与 HTML 模式不同（源码核实 echarts/lib/component/tooltip/TooltipRichContent.js）：
 *   - 生效：backgroundColor / borderColor / borderRadius / padding / textStyle.color
 *   - 不生效：extraCssText（HTML 专用）；borderWidth 固定 1px
 *   - 换行用 '\n'（richText 的 blockBreak）
 * 本模块给出统一暖色 tooltip 基底，各图按需展开并追加 formatter。
 */
export const WARM_TOOLTIP = {
  confine: true,
  backgroundColor: '#FFFFFF',
  borderColor: '#F5D5E0',
  borderRadius: 10,
  padding: [8, 12],
  textStyle: { color: '#4A3035' },
  axisPointer: {
    lineStyle: { color: '#F5D5E0' },
    crossStyle: { color: '#F5D5E0' },
    shadowStyle: { color: 'rgba(248,112,152,0.06)' },
  },
}
