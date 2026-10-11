# TECH-025 小程序图表渲染方案研究：离屏截图 → 同层渲染直显

> 调研日期：2026-10-11
> 触发背景：分析页 `EcChart` 采用「离屏 Canvas 渲染 → `canvasToTempFilePath` 截图 → `Image` 展示」，
> 为绕开小程序原生 Canvas 的层级/滚动兼容问题而设计；现评估是否存在更好的方案。
> 关联：分析页×助手联动调研（图表形态决策）、后续可能把图表内嵌进助手对话流。

---

## 0. 结论速览

| 判定项 | 结论 |
| --- | --- |
| 现状截图方案的必要性前提 | ❌ **基本过期**：它针对的是「旧版 canvas（非同层渲染）」的限制；`type="2d"` 自基础库 2.9.0 起支持**同层渲染**，官方已声明「当前所有原生组件均已支持同层渲染」「除事件相关，同层渲染下已无以下限制」 |
| 当前方案的实际代价 | ① 无任何交互（tooltip 全部死代码）② 首屏多 ~300ms 延迟 + 每次重绘写一个临时文件 ③ 两处固定时延（250ms/50ms）+ 静默失败路径（查不到节点直接放弃，无重试）④ 强制 `animation:false` |
| 推荐方案 | ✅ **方案 A「同层渲染直显」**：Canvas 回到正常文档流直接展示，删除截图管线；单渲染管线、首屏接近即时、按 DPR 原生清晰、解锁 tooltip 交互、无临时文件 |
| 次要备选 | 方案 B「ECharts SSR → SVG → `<image>` data URI」：Node 实测可行（4.6KB/图），但存在 **Android 平台碎片化风险**（SVG-in-image 部分版本整体不渲染；`<text>` 标签支持未证实），仅作实验线，不建议首发采用 |
| 什么该保留截图 | 截图只保留在**导出/分享**场景（`shareImage.ts` 本来就是独立路径，不受影响） |
| 验证要求 | 本方案必须**真机验收**——开发者工具对原生组件的模拟「不能很好还原真机表现」（官方原文），历史上多个「图表不滚动」问题在真机均不复现 |
| 升级成本 | 仅改 `EcChart.tsx` 一个文件；对 5 个消费 Tab 零改动（props 向后兼容） |
| **实施状态** | ✅ **已落地（2026-10-11）**：`EcChart.tsx` 已重构为同层直显 + 触摸 tooltip；weapp 与 H5 构建均通过；类型检查 0 新增错误。**待真机验收（§5 清单）** |

---

## 1. 现状：截图模式是怎么工作的，问题在哪

### 1.1 机制

```
mount → setTimeout(250ms) → createSelectorQuery 取 canvas 节点
      → echarts.init(WxCanvas 适配器) + setOption(animation:false)
      → setTimeout(50ms) → Taro.canvasToTempFilePath() → 临时文件路径
      → setState(src) → <Image mode="widthFix"> 展示
      （canvas 本身放在 left:-9999px 离屏位置）
option 变化 → 再次 setOption + 50ms 后重新截图
```

代码位置：`minicare-mp/src/components/EcChart/EcChart.tsx`（离屏定位 L179-185、初始定时 L104、截图定时 L142-148、option 更新 L155-159）。

### 1.2 问题清单（实测代码审计）

| # | 问题 | 证据/说明 |
| --- | --- | --- |
| 1 | **图表完全不可交互** | `Image` 没有绑定任何手势；canvas 离屏。各 Tab 传入的 `tooltip` 配置（如 FeedingTab L102/L130）永远不会触发，是死代码。5 个 Tab 共 10 个图表全部受影响 |
| 2 | 首屏延迟叠加 | 250ms 初始等待 + 节点查询 + 渲染 + 50ms 截图等待 + `canvasToTempFilePath` 文件写入 + Image 解码，典型 300–500ms 才可见 |
| 3 | 时序脆弱 | 250ms / 50ms 两个固定时延靠猜：慢设备截图可能早于首帧完成（拍到空白）；若查询时节点未布局完成（`width===0`）则 **直接静默放弃、无重试**（L108/L112），图表永久空白 |
| 4 | 每次重绘写临时文件 | 数据/区间切换即产生一个新临时文件；虽有系统清理，但属无谓 IO |
| 5 | 动画能力被牺牲 | 因截图时序限制强制 `animation:false`，失去 ECharts 的过渡表现力 |
| 6 | 架构复杂度 | WxCanvas 适配器 + 截图状态机 + 双定时器 + H5 分支，维护面大（一个 200 行组件里三种时序路径） |
| 7 | 层叠风险的反向残留 | 截图方案"解决"了层级问题，但也意味着**任何需要覆盖在图表上的自有 UI 也做不了**（因为图表是图片，无法承载任何数据交互）|

### 1.3 关键发现：被绕开的前提是否仍然成立？

组件头注释的前提：「① Canvas 层级最高会覆盖 fixed TabBar；② 页面滚动时跟随有延迟」。

- 这两条是**非同行渲染时代的旧版 canvas 行为**（官方文档原文此前如此描述）。
- 项目实际用的是 `type="2d"`（同层渲染，2.9.0+）。**官方文档 2026 年现行版本已明确：**
  > 「当前所有原生组件（除 input 组件 focus 状态）均已支持同层渲染。」
  > 「**除事件相关，同层渲染下已无以下限制**」（指：层级最高、无法被覆盖、不能设 fixed、父级 overflow:hidden 不能裁剪 等）
- 换言之：如果历史上观察到的异常出现在**开发者工具模拟器**里，那大概率是模拟环境假象——官方明确提示「在工具上，原生组件是用 web 组件模拟的，因此很多情况并不能很好的还原真机的表现，建议尽量在真机上调试」；社区多个「echarts 不跟随滚动」帖的最终结论同样是「工具里异常、真机正常」。
- 若当时确在真机复现，最大嫌疑是「同层渲染失败」回落到旧行为（旧内核设备，官方统计失败率很低），或当时链路混用了旧版 canvas API。

> 结论：截图方案是在一个（对当前技术栈而言）基本不成立的前提下建立的，且代价是永久丧失交互与稳健性。

---

## 2. 原理背景：原生组件 / 同层渲染现状（2026）

- **时间线**：canvas 2d + 同层渲染 2.9.0（2019）→ 全量原生组件支持同层渲染（现行文档）→ 鸿蒙 OS 只支持同层渲染。
- **实现**：iOS 将原生组件挂载进由 DOM 节点（`overflow:scroll`）生成的 `WKChildScrollView`；Android 通过 chromium `embed` 插件机制绘入 WebView 渲染层。两者都意味着滚动由合成器/原生滚动视图承载，**不存在「Native 与 WebView 帧不同步」的延迟**。
- **剩余限制与失败模式**：
  1. 事件相关限制仍适用（如原生组件不支持 `catch`/`capture` 绑定方式——Taro 已处理）；iOS 不支持 `pointer-events`。
  2. 同层渲染失败：Android 无微信自研 chromium 内核的极旧设备；iOS 在节点树不稳定时（如频繁改 `position` 引发重排）有失败率。官方称「失败率很低」。失败后回落为旧行为（图表仍能画出来，但层级/滚动回到 old quirks），**不是白屏**。
  3. iOS 上父节点 `border-radius` 裁剪可能失效（本项目图表四周有 padding，不触及卡片圆角，无影响）。
  4. 工程建议（降低 iOS 失败率）：避免在原生组件上频繁改 WXSS、尤其别改 `position`；需要变换用 `transform`。
- **`bindrendererror` 兜底**：官方文档提到可监听同层渲染失败做降级，但 **Taro 的 `Canvas` 组件类型未透传该事件**（仅 `onError`），社区也报告 canvas 2d 上该事件不完全可靠。→ 本方案不依赖它，作为未来可选项（需包一层原生自定义组件）。

---

## 3. 候选方案对比

| 维度 | **A. 同层直显（推荐）** | B. SSR→SVG→`<image>` | C. 现状截图 | D. 换图表库（uCharts/F2） | E. 服务端出图 |
| --- | --- | --- | --- | --- | --- |
| 渲染链路 | Canvas 绘制即显示（1 步） | 生成 SVG 字符串→base64→图片解码 | 渲染→截图→文件→图片（4 步） | Canvas 绘制即显示 | 后端渲染→网络传输→图片 |
| 交互（tooltip） | ✅ 手势转发到 zrender（解锁） | ❌ 静态 | ❌ 静态 | ✅（自带交互，需重写配置） | ❌ |
| 清晰度 | 原生 DPR 渲染 | 矢量（解码质量待验证） | 物理分辨率位图 | 原生 DPR | 位图 |
| 首屏延迟 | 低（一次渲染） | 低-中（生成+解码） | 高（300ms+） | 低 | 高（网络） |
| 依赖 | 无新增（echarts 6 已在） | 无新增（SSR 内置） | 无 | +新库 | +后端服务 |
| 实现成本 | 低-中（单组件改造） | 中（测量/编码/兜底） | 0（现状） | 高（全部图表配置重写） | 中-高 |
| 平台风险 | 低（同层失败率很低） | **中-高** | 低但脆弱 | 低 | 中 |
| 结论 | ✅ 采用 | ⏸ 备选实验 | 仅保留于导出 | ✖ 不划算 | ✖ 仅分享/打印 |

### 3.1 方案 B 专题：SSR→SVG 的实证与风险

**已实证（本机 Node 实测，ECharts 6.0.0）**：

```
echarts.init(null, null, { renderer:'svg', ssr:true, width:400, height:300 })
  → chart.renderToSVGString()
  → 简单折线图：SVG 4,612 字符 / base64 6,152 字符 / 含 11 个 <text>
```

说明：无 DOM、无 Canvas 环境纯 JS 即可产出图谱，体积很小（30 天数据的曲线预估也仅几十 KB base64，setData 毫无压力）。`<image>` 官方支持 SVG 格式（含 `data:image/svg+xml;base64` 用法，官方社区有教程）。

**风险（为什么只列为备选）**：
1. **平台碎片化**：2026-03 社区实测「iOS 微信 8.0.45 可渲染、Android 微信 8.0.52 不渲染」；文档仅记载 `svg 不支持百分比单位`、`svg 不支持 <style>` 两条限制，**`<text>` 标签支持情况没有官方承诺**——而图表轴标签（含中文）离不开 `<text>`。
2. SSR 模式下文字测宽为估算（可通过 `setPlatformAPI({measureText})` 注入精确测量，需要一块测量用 canvas，复杂度上升）。
3. 仍然无交互——费大力气换来的仍是静态图，收益不如方案 A。

**用途定位**：仅在方案 A 真机验收出现意外（同层渲染大面积失败）时作为退路实验；或在未来「对话流长列表内嵌大量静态图表」场景评估（图片在长列表中的成本低于常驻 Canvas）。

---

## 4. 推荐方案 A：同层渲染直显设计

### 4.1 改造要点

1. **Canvas 回归正常文档流**（删除 `left:-9999px`），删除整条截图管线与 `snapshotSrc` 状态。
2. **初始化去定时化**：用「轮询 + 上限」替代固定 250ms——`createSelectorQuery` 查不到节点或宽度为 0 时重试（100ms 间隔，至多 10 次），仍失败则 `console.warn` 留痕（不再是静默空白）。
3. **消除闭包陈旧值**：`option` 存入 ref，init 时读取最新值，杜绝「初始化渲染到旧 option」的时序竞态。
4. **option 更新即重绘**：`chart.setOption(option, true)`，无截图、无延时。
5. **交互（新增，可选 prop `interactive` 默认开）**：`Canvas` 绑定 `onTouchStart/Move/End`，坐标经 `e.touches[0].x/y`（Taro `CanvasTouch` 类型自带，相对 canvas）转发给 zrender——与 echarts-for-weixin 官方组件同一机制（zrender 6 实测 API：`handler.dispatch('mousedown'|'mousemove'|'mouseup', {zrX, zrY})`、`handler.processGesture`，源码 `zrender/lib/Handler.js:116/203`）。
   - **不设 `disableScroll`**：页面滚动不受影响；提示框以「点按」为主，水平拖动跟随（垂直拖动=滚动页面，工具提示短暂出现属可接受行为，真机验收时再按手感微调）。
6. 生命周期与清理沿用现有 `dispose()`；H5 分支保持不变（本来就是直显）。
7. 首版保持 `animation:false`（与现状一致，减小变化面）；直显模式下动画已无技术阻碍，作为后续可选优化。

### 4.2 代码草案（替换 EcChart.tsx 核心部分；WxCanvas 适配器原样保留）

```tsx
/**
 * EcChart v2 — canvas type="2d" 同层渲染直显
 * 变更：删除离屏定位 + 截图管线；初始化轮询重试；解锁触摸提示框。
 */
import { useEffect, useRef, useState } from 'react'
import { View, Canvas } from '@tarojs/components'
import Taro from '@tarojs/taro'
import echarts, { type ECharts, type EChartsOption } from '@/lib/echarts'

interface EcChartProps {
  option: EChartsOption
  height: string
  /** 是否启用触摸提示框（默认 true；设为 false 可关闭手势绑定） */
  interactive?: boolean
}

export default function EcChart({ option, height, interactive = true }: EcChartProps) {
  const idRef = useRef(`ec-${++canvasIdCounter}`)
  const cid = idRef.current
  const optionRef = useRef(option)
  optionRef.current = option                                  // 始终指向最新 option
  const chartRef = useRef<ECharts | null>(null)
  const [ready, setReady] = useState(false)

  // ── 初始化（轮询等待布局完成，替代固定 250ms）──
  useEffect(() => {
    let disposed = false
    let tries = 0
    const tryInit = () => {
      if (disposed || chartRef.current) return
      Taro.createSelectorQuery()
        .select(`#${cid}`)
        .fields({ node: true, size: true })
        .exec((res) => {
          if (disposed) return
          const item = res?.[0] as { node: WechatMiniprogram.Canvas; width: number; height: number } | undefined
          if (!item?.node || item.width === 0) {
            if (++tries < 10) setTimeout(tryInit, 100)
            else console.warn('[EcChart] init give up: node not laid out', cid)
            return
          }
          const canvasNode = item.node
          const dpr = Taro.getSystemInfoSync().pixelRatio
          const ctx = canvasNode.getContext('2d')
          const canvas = new WxCanvas(ctx, cid, canvasNode)   // 适配器与原实现相同

          ;(echarts as unknown as { setPlatformAPI: Function }).setPlatformAPI({
            createCanvas: () => canvas,
            loadImage: (src: string, onload: () => void, onerror: () => void) => {
              if (canvasNode.createImage) {
                const img = canvasNode.createImage()
                img.onload = onload; img.onerror = onerror; img.src = src
                return img
              }
              onerror?.()
            },
          })

          const chart = echarts.init(canvas as unknown as HTMLElement, undefined, {
            width: item.width, height: item.height, devicePixelRatio: dpr,
          })
          canvas.setChart(chart)
          chart.setOption(optionRef.current, true)            // 读 ref → 无陈旧闭包
          chartRef.current = chart
          setReady(true)
        })
    }
    const t = setTimeout(tryInit, 0)
    return () => {
      disposed = true; clearTimeout(t)
      chartRef.current?.dispose(); chartRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── option 更新：直绘，无截图 ──
  useEffect(() => {
    if (!chartRef.current) return
    chartRef.current.setOption(option, true)
  }, [option])

  // ── 触摸 → zrender（与 echarts-for-weixin 同机制）──
  const toZr = (e: { touches?: CanvasTouch[]; changedTouches?: CanvasTouch[] }) => {
    const t = e.touches?.[0] ?? e.changedTouches?.[0]
    return t ? { zrX: t.x, zrY: t.y, preventDefault: () => {} } : null
  }
  const onTouchStart = (e: any) => {
    const z = interactive && toZr(e); const h = chartRef.current?.getZr().handler as any
    if (z && h) { h.dispatch('mousedown', z); h.dispatch('mousemove', z) }
  }
  const onTouchMove = (e: any) => {
    const z = interactive && toZr(e); const h = chartRef.current?.getZr().handler as any
    if (z && h) h.dispatch('mousemove', z)
  }
  const onTouchEnd = (e: any) => {
    const z = interactive && toZr(e); const h = chartRef.current?.getZr().handler as any
    if (z && h) h.dispatch('mouseup', z)
  }

  return (
    <View style={{ width: '100%', height }}>
      <Canvas
        id={cid}
        canvasId={cid}
        type='2d'
        style={{ width: '100%', height, display: 'block' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      />
    </View>
  )
}
```

> 说明：H5 的直渲染分支照旧（保留现有 `TARO_ENV === 'h5'` 逻辑）；`lib/echarts.ts` 无需变动（tooltip 组件已注册，`TooltipComponent` 内部自带 axisPointer，已核实 `echarts/lib/component/tooltip/install.js:44`）。
>
> ⚠️ 以上为设计阶段草案。**最终实现以 `src/components/EcChart/EcChart.tsx` 为准**，落地时相对草案的增强：
> ① 触摸增加「垂直滑动识别」（位移 >8px 且纵向为主 → 判为页面滚动，`dispatchAction({type:'hideTip'})` 收起提示框并停止转发，滚动体验零干扰）；
> ② `hideTip` 为 ECharts 公开 action，不依赖 zrender 内部行为；
> ③ 小程序 Canvas 节点改用文件内最小结构类型（`MpCanvasNode`），不再依赖无法解析的 `WechatMiniprogram` 全局命名空间（顺带清掉该文件 5 个存量类型错误）。

### 4.3 交互设计（tooltip 行为约定）

| 手势 | 行为（已实现） |
| --- | --- |
| 点按图表 | 立即显示提示框（touchstart 转发 mousedown+mousemove 到 zrender） |
| 水平拖动 | 提示框跟随 |
| 垂直拖动（判为滚页） | 位移 >8px 且纵向为主 → 自动收起提示框、停止转发，**页面正常滚动，零干扰** |
| 若真机手感不佳 | 备选：`disableScroll={true}`（拖拽图内不滚页，需产品权衡）；或 `interactive={false}` 退回纯静态 |

### 4.4 降级与回滚

1. **回滚**：改造上线前保留旧实现文件（如 `EcChart.snapshot.tsx`，不引用）一个版本周期；真机出现问题时 10 分钟内可切回。一个周期后删除。
2. **同层渲染失败**（极低概率）：回落为旧行为（层级/滚动 quirks），图表仍可显示；不引入 `bindrendererror` 依赖（Taro 不支持透传），如未来需要再包原生自定义组件。
3. **交互冲突降级**：`interactive` prop 可按图表粒度关闭。

### 4.5 影响面清单（改造时核对）

| 项 | 结论 |
| --- | --- |
| `minicare-mp/src/components/EcChart/EcChart.tsx` | 改造本体 |
| 消费方：FeedingTab(3) / DiaperTab(2) / HealthTab(3) / SleepTab(1) / GrowthTab(1) | **零改动**（props 兼容，新增可选 `interactive`） |
| `shareImage.ts`（导出分享图） | 不动（独立旧版 canvas 路径，截图在此场景是合理需求） |
| 报告页「导出」按钮 | 占位 toast，与本次无关 |
| H5 构建 | 分支保留，行为不变 |
| 助手对话流内嵌图表（未来） | 本方案天然支持直显；长列表内多图表场景届时再评估「直显 vs 静态图」混合策略 |

---

## 5. 真机验收清单（发布前必做）

> 前置：`npm run build:weapp` + `npm run preview` 上传体验版，用 iOS + Android 各至少 1 台真机扫码验收（**先用开发者工具自查逻辑，结论以真机为准**）。

- [ ] 分析页 5 个 Tab 图表全部正常渲染（首屏无空白、无闪烁）
- [ ] 页面滚动时图表跟随滚动，无延迟/拖影
- [ ] 自定义 TabBar（`z-index:100`）与 FAB 弹层不被图表遮挡；图表可被正常覆盖
- [ ] 点按/拖动图表 → tooltip 正常出现（含中文文案与日期标签）
- [ ] 在图表区域上下拖动 → 页面正常滚动（不被"吃掉"手势）
- [ ] 切换 Tab / 切换时间区间 → 图表随数据刷新，无残留旧图
- [ ] 返回再进入页面 → 图表重建正常（无重复初始化、无报错）
- [ ] 弱网/慢设备：首屏图表延迟可感知但不空白；极端情况下 console 有 `init give up` 告警而非静默
- [ ] 旧 Android 设备（如有）抽查；鸿蒙设备抽查
- [ ] 5 个 Tab 连续切换两轮无内存告警/闪退
- [ ] H5 构建抽查图表正常（回归确认）

---

## 6. 参考资料

| # | 来源 | 关键结论 |
| --- | --- | --- |
| 1 | [canvas 组件文档（微信官方）](https://developers.weixin.qq.com/miniprogram/dev/component/canvas.html) | 「2.9.0 起支持一套新 Canvas 2D 接口（需指定 type 属性），**同时支持同层渲染**」 |
| 2 | [原生组件说明（微信官方）](https://developers.weixin.qq.com/miniprogram/dev/component/native-component.html) | 「当前所有原生组件均已支持同层渲染」；「**除事件相关，同层渲染下已无以下限制**」；同层失败原因与 `bindrendererror`；「工具上原生组件用 web 组件模拟……建议真机调试」 |
| 3 | [小程序同层渲染原理剖析（官方文章转载）](https://www.cnblogs.com/jiduoduo/p/14028440.html) | iOS WKChildScrollView / Android embed 原理；失败率很低；避免频繁改 position，用 transform；iOS 父级 border-radius 裁剪可能失效 |
| 4 | [echarts-for-weixin README](https://github.com/ecomfe/echarts-for-weixin) | 「使用新的 Canvas 2d 可以提升渲染性能，**解决非同层渲染问题，强烈建议开启**」；tooltip 支持；已知 bug 列表（iOS 半透明/渐变） |
| 5 | [image 组件文档（微信官方）](https://developers.weixin.qq.com/miniprogram/dev/component/image.html) | 支持 SVG 格式；`svg 不支持百分比单位`、`svg 不支持 <style>` |
| 6 | 本机 Node 实测（2026-10-11） | ECharts 6 SSR `renderToSVGString()`：简单折线图 SVG 4,612 字符 / base64 6,152 字符 / 11 个 `<text>` |
| 7 | zrender 6.0.0 源码 | `handler.dispatch(eventName, eventArgs)`（L116）、`processGesture`（L203）——触摸转发机制在 echarts 6 / zrender 6 仍然成立 |
| 8 | Taro 4.2 类型定义 | `Canvas` 支持 `onTouchStart/Move/End/Cancel`、`disableScroll`、`type`；`CanvasTouch` 含相对画布的 `x/y`（`common.d.ts:126`） |
| 9 | 微信服务市场社区（2025-06） | 「开发者工具中的原生组件层级固定、不支持滚动穿透，而**真机环境表现正常**」——模拟器假象的典型报告 |
| 10 | 社区实测（2026-03，CSDN） | SVG-in-image 平台碎片化：iOS 可渲染 / Android 部分微信版本不渲染（方案 B 的风险依据） |

---

## 附：本次调研对「分析页×助手联动」的输入

- 分析页图表渲染改造（本方案）落地后，`EcChart` 天然具备交互能力，可作为「助手分析结论可视化」的现成渲染组件复用。
- 助手对话流（`pages/chat`，`ScrollView` 结构，见 `src/pages/chat/index.tsx:935`）若未来内嵌图表：短会话场景直显可用；**长列表 + 大量图表**场景需重新评估（常驻 Canvas 的原生层数量/内存 vs 静态图方案），届时另开评估。
