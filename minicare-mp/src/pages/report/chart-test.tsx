/**
 * 图表方案可行性验证页（临时替换 report 页面）
 * 验证 4 种 ECharts 图表示例在小程序中是否正常渲染
 */
import { View, Text } from '@tarojs/components'
import { EcChart } from '@/components/EcChart'
import TabBar from '@/components/TabBar/TabBar'

export default function ChartTestPage() {
  const lineOption = {
    tooltip: { trigger: 'axis' as const, confine: true },
    grid: { left: 50, right: 16, top: 16, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: ['1月', '2月', '3月', '4月', '5月', '6月'],
      axisLabel: { fontSize: 11 },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { fontSize: 11 },
    },
    series: [{
      type: 'line' as const,
      data: [3.5, 4.8, 5.9, 6.8, 7.5, 8.1],
      smooth: true,
      lineStyle: { color: '#F87098', width: 2 },
      itemStyle: { color: '#F87098' },
      areaStyle: { color: 'rgba(248,112,152,0.15)' },
    }],
  }

  const barOption = {
    tooltip: { trigger: 'axis' as const, confine: true },
    grid: { left: 50, right: 16, top: 16, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: ['周一', '周二', '周三', '周四', '周五'],
      axisLabel: { fontSize: 11 },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { fontSize: 11 },
    },
    series: [{
      type: 'bar' as const,
      data: [3, 5, 2, 8, 4],
      itemStyle: { color: '#9B8ED8', borderRadius: [4, 4, 0, 0] },
      barMaxWidth: 30,
    }],
  }

  const stackedOption = {
    tooltip: { trigger: 'axis' as const, confine: true },
    legend: { data: ['母乳', '配方奶', '辅食'], bottom: 0, textStyle: { fontSize: 10 } },
    grid: { left: 50, right: 16, top: 16, bottom: 36 },
    xAxis: { type: 'category' as const, data: ['一', '二', '三', '四', '五'], axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value' as const, axisLabel: { fontSize: 11 } },
    series: ['母乳', '配方奶', '辅食'].map((name) => ({
      name,
      type: 'bar' as const,
      stack: 'total',
      data: name === '母乳' ? [2, 3, 1, 3, 2] : name === '配方奶' ? [3, 2, 3, 1, 3] : [0, 1, 2, 1, 2],
      itemStyle: { color: name === '母乳' ? '#9B8ED8' : name === '配方奶' ? '#F87098' : '#6BCB77' },
      barMaxWidth: 36,
    })),
  }

  const scatterOption = {
    tooltip: { confine: true },
    grid: { left: 50, right: 16, top: 16, bottom: 30 },
    xAxis: { type: 'category' as const, data: ['1日', '2日', '3日', '4日', '5日', '6日', '7日'], axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value' as const, min: 36, max: 39, axisLabel: { fontSize: 11, formatter: (v: number) => `${v}°C` } },
    series: [{
      type: 'scatter' as const,
      data: [[0, 36.5], [1, 37.0], [2, 36.8], [3, 37.5], [4, 36.6], [5, 37.2], [6, 36.9]],
      symbolSize: (val: number[]) => val[1] > 37.4 ? 18 : 12,
      itemStyle: { color: '#A8D8A8' },
    }],
  }

  const pieOption = {
    tooltip: { confine: true },
    legend: { bottom: 0, textStyle: { fontSize: 10 } },
    series: [{
      type: 'pie' as const,
      radius: ['45%', '70%'],
      center: ['50%', '45%'],
      label: { show: false },
      data: [
        { value: 15, name: '开心', itemStyle: { color: '#6BCB77' } },
        { value: 8, name: '平静', itemStyle: { color: '#7EC8E3' } },
        { value: 3, name: '烦躁', itemStyle: { color: '#F5A962' } },
        { value: 2, name: '哭闹', itemStyle: { color: '#F05060' } },
      ],
    }],
  }

  return (
    <View style={{ padding: 20, paddingTop: 40, background: '#FFF8FA', minHeight: '100vh' }}>
      <Text style={{ fontSize: 20, fontWeight: 800, color: '#4A3035', display: 'block' }}>
        ECharts 方案验证
      </Text>
      <Text style={{ fontSize: 12, color: '#C0A8AD', marginTop: 4, marginBottom: 16, display: 'block' }}>
        echarts.wx.js + Taro Canvas 2D（等效 echarts-for-weixin）
      </Text>

      {/* 折线图 */}
      <View style={{ background: '#fff', borderRadius: 12, padding: 14, marginBottom: 16, boxShadow: '0 1px 4px rgba(200,100,120,0.06)' }}>
        <Text style={{ fontSize: 13, fontWeight: 600, color: '#4A3035', marginBottom: 10 }}>1. 折线图 (Line)</Text>
        <EcChart option={lineOption} height='320rpx' />
      </View>

      {/* 柱状图 */}
      <View style={{ background: '#fff', borderRadius: 12, padding: 14, marginBottom: 16, boxShadow: '0 1px 4px rgba(200,100,120,0.06)' }}>
        <Text style={{ fontSize: 13, fontWeight: 600, color: '#4A3035', marginBottom: 10 }}>2. 柱状图 (Bar)</Text>
        <EcChart option={barOption} height='300rpx' />
      </View>

      {/* 堆积柱状图 */}
      <View style={{ background: '#fff', borderRadius: 12, padding: 14, marginBottom: 16, boxShadow: '0 1px 4px rgba(200,100,120,0.06)' }}>
        <Text style={{ fontSize: 13, fontWeight: 600, color: '#4A3035', marginBottom: 10 }}>3. 堆积柱状图 (Stacked Bar)</Text>
        <EcChart option={stackedOption} height='320rpx' />
      </View>

      {/* 散点图 */}
      <View style={{ background: '#fff', borderRadius: 12, padding: 14, marginBottom: 16, boxShadow: '0 1px 4px rgba(200,100,120,0.06)' }}>
        <Text style={{ fontSize: 13, fontWeight: 600, color: '#4A3035', marginBottom: 10 }}>4. 散点图 (Scatter)</Text>
        <EcChart option={scatterOption} height='280rpx' />
      </View>

      {/* 饼图 */}
      <View style={{ background: '#fff', borderRadius: 12, padding: 14, marginBottom: 16, boxShadow: '0 1px 4px rgba(200,100,120,0.06)' }}>
        <Text style={{ fontSize: 13, fontWeight: 600, color: '#4A3035', marginBottom: 10 }}>5. 环形图 (Pie)</Text>
        <EcChart option={pieOption} height='320rpx' />
      </View>

      {/* 底部导航栏 */}
      <TabBar activeTab='report' />
    </View>
  )
}
