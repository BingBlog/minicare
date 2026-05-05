# F11 · 统计报告

> 功能 ID：P1-001  
> 优先级：P1  
> 状态：**已完成** ✅  
> 最后更新：2026-05-03（对齐小程序实际实现）
>
> **技术方案**：ECharts 6 + Canvas 离屏渲染 + 截图显示模式。
> 解决微信小程序 Canvas 原生组件层级最高、滚动延迟的固有问题。

## 功能描述

通过图表可视化宝宝的各项记录数据，帮助照护者了解趋势和规律。5 个 Tab 覆盖核心记录类型。

**平台实现**：微信小程序（主平台），数据通过 REST API 获取后本地渲染图表。

## Tab 配置

5 个 Tab，顺序如下：

| 序号 | Tab Key | 标签 | 默认时间范围 |
|------|---------|------|-------------|
| 1 | `growth` | 生长 | `birth`（从出生开始） |
| 2 | `feeding` | 饮食 | 30 天 |
| 3 | `sleep` | 睡眠 | 30 天 |
| 4 | `diaper` | 尿布 | 30 天 |
| 5 | `health` | 健康 | 30 天 |

**默认选中**：`growth`（生长 Tab）

## 时间范围选项

| Key | 标签 | 天数 |
|-----|------|------|
| `7` | 7天 | 7 |
| `14` | 14天 | 14 |
| `30` | 30天 | 30 |
| `90` | 90天 | 90 |
| `180` | 半年 | 180 |
| `365` | 一年 | 365 |

**特殊行为**：Growth Tab 仅显示 `birth`（从出生开始）选项，其他时间范围对 growth 隐藏。

## 图表渲染方案

使用自定义组件 `EcChart`（基于 ECharts 6），采用 Canvas 离屏截图模式：

1. Canvas 绝对定位在屏幕外（`left: -9999px`），用户不可见
2. ECharts 在隐藏 Canvas 上渲染图表（`animation: false` 禁用动画）
3. 渲染完成后通过 `Taro.canvasToTempFilePath()` 导出为临时图片
4. 用户看到的是 `<Image>` 组件展示的截图
5. 当 `option` prop 变化时，重新渲染 → 新截图

> 此方案彻底规避小程序 Canvas 原生组件的 z-index 问题和滚动跟随延迟。

## 各 Tab 图表内容

### GrowthTab（生长）
- 百分位曲线图：P3/P15/P50/P85/P97 参考线 + 宝宝实际数据点
- 支持切换：身高/体重/头围
- 数据来源：growth_record + growth-standards.ts

### FeedingTab（饮食）
- 每日饮食次数/奶量趋势
- 按喂养类型分类统计
- 数据来源：breast_feeding / formula_feeding / food_feeding / supplement_feeding

### SleepTab（睡眠）
- 每日总睡眠时长趋势
- 白天/夜间分布
- 数据来源：sleep_record

### DiaperTab（尿布）
- 每日换尿布次数趋势
- 按类型分布（小便/大便/混合）
- 数据来源：diaper_record

### HealthTab（健康）
- 体温趋势曲线
- 过敏/用药事件标记
- 数据来源：health_record

## 验收标准（AC）

- [x] 5 个 Tab 切换正常
- [x] 默认打开 Growth Tab
- [x] 时间范围切换实时更新图表
- [x] Growth Tab 仅显示"从出生"选项
- [x] 图表使用 ECharts 截图模式渲染，无层级/滚动问题
- [x] 无数据时显示空状态提示
- [x] 生长曲线含百分位参考线

## 相关文件

- 报告主页：`minicare-mp/src/pages/report/index.tsx`
- 类型定义：`minicare-mp/src/pages/report/types.ts`
- 图表组件：`minicare-mp/src/components/EcChart/EcChart.tsx`
- 各 Tab 组件：`minicare-mp/src/pages/report/tabs/GrowthTab.tsx` 等
- 生长标准：`minicare-mp/src/lib/growth-standards.ts`
