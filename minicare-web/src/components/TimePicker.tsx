/**
 * TimePicker — 移动端底部弹层时间选择器
 * 使用 react-mobile-picker，显示为 "HH:mm" 两列滚轮
 *
 * 用法：
 *   <TimePicker value="09:30" onChange={(v) => setTime(v)} />
 *
 * Props:
 *   value    — "HH:mm" 格式字符串
 *   onChange — (val: string) => void，回调 "HH:mm" 字符串
 *   label?   — 触发行左侧标签，默认 "时间"
 *   className? — 传给触发行外层 div
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import Picker from 'react-mobile-picker'

// 生成 00~23 小时数组
const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))
// 生成 00~59 分钟数组（1分钟步进）
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'))

interface TimePickerProps {
  value: string                    // "HH:mm"
  onChange: (val: string) => void
  label?: string
  className?: string
}

// ─── 实时倍速 + 惯性滑动 Hook ────────────────────────────────────────────────
//
// 两层加速机制：
//  1. 实时倍速（touchmove）：手指还在滑动时，以 SPEED_MULTIPLIER 倍的速率跳格，
//     让选项表现得像手指移动了更长距离一样。用浮点累积避免小位移时的抖动。
//  2. 惯性延续（touchend）：抬手时计算瞬时速度，用 rAF + 摩擦系数模拟继续滑行。
//
// 参数：
//   containerRef  — Picker 外层容器 ref
//   columns       — 每列的选项数组，按列名映射
//   pickerVal     — 当前选中值
//   setPickerVal  — 更新选中值的函数
//   itemHeight    — 每个条目高度（px），用于速度→格数换算

interface InertiaColumn {
  name: string
  items: string[]
}

// 实时滑动倍速系数：手指移动 1px，选项移动 SPEED_MULTIPLIER px 的等效距离
const SPEED_MULTIPLIER = 2.5

function usePickerInertia(
  containerRef: React.RefObject<HTMLDivElement | null>,
  columns: InertiaColumn[],
  pickerVal: Record<string, string>,
  setPickerVal: (val: Record<string, string>) => void,
  itemHeight = 44,
) {
  // 触摸记录
  const touchStartY = useRef(0)
  const touchStartTime = useRef(0)
  const lastMoveY = useRef(0)
  const lastMoveTime = useRef(0)
  // 浮点累积偏移量（避免每个小 touchmove 都触发跳格）
  const accFloat = useRef(0)
  // 用于在 rAF 回调里访问最新值（避免闭包陈旧）
  const pickerValRef = useRef(pickerVal)
  pickerValRef.current = pickerVal
  const rafRef = useRef<number | null>(null)
  // 当前操作的列（touchstart 时确定）
  const activeColRef = useRef<InertiaColumn | null>(null)

  // 取消正在进行的惯性动画
  const cancelInertia = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  // 索引边界钳制
  const clampIndex = useCallback((col: InertiaColumn, idx: number) => {
    return Math.max(0, Math.min(col.items.length - 1, idx))
  }, [])

  // 识别手指滑过哪一列（X 坐标均分）
  const getColumnByX = useCallback((x: number, containerEl: HTMLDivElement) => {
    const rect = containerEl.getBoundingClientRect()
    const relX = x - rect.left
    const colWidth = rect.width / columns.length
    const colIdx = Math.floor(relX / colWidth)
    return columns[Math.max(0, Math.min(columns.length - 1, colIdx))]
  }, [columns])

  // 核心跳格函数：给定列 + 浮点格数偏移，更新选中值
  const shiftByFloat = useCallback((col: InertiaColumn, floatDelta: number) => {
    const currentVal = pickerValRef.current[col.name]
    const currentIdx = col.items.indexOf(currentVal)
    if (currentIdx === -1) return currentIdx

    const newIdx = clampIndex(col, Math.round(currentIdx + floatDelta))
    if (newIdx !== currentIdx) {
      setPickerVal({ ...pickerValRef.current, [col.name]: col.items[newIdx] })
    }
    return newIdx
  }, [clampIndex, setPickerVal])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      cancelInertia()
      const y = e.touches[0].pageY
      const x = e.touches[0].pageX
      touchStartY.current = y
      touchStartTime.current = Date.now()
      lastMoveY.current = y
      lastMoveTime.current = Date.now()
      accFloat.current = 0
      activeColRef.current = getColumnByX(x, el)
    }

    const onTouchMove = (e: TouchEvent) => {
      const col = activeColRef.current
      if (!col) return

      const currentY = e.touches[0].pageY
      const rawDelta = currentY - lastMoveY.current  // 本次 move 的原始位移（px）
      lastMoveY.current = currentY
      lastMoveTime.current = Date.now()

      // 将原始像素位移放大 SPEED_MULTIPLIER 倍后换算为格数，累积
      // 向下滑（rawDelta > 0）→ index 减小（负格数）
      const gridDelta = -(rawDelta * (SPEED_MULTIPLIER - 1)) / itemHeight
      accFloat.current += gridDelta

      // 只有累积超过 0.5 格才真正跳格（避免每帧微小抖动）
      if (Math.abs(accFloat.current) >= 0.5) {
        const jumped = shiftByFloat(col, accFloat.current)
        // 到达边界时清空累积，防止越界堆积
        if (jumped === 0 || jumped === col.items.length - 1) {
          accFloat.current = 0
        } else {
          // 保留浮点余数
          accFloat.current = accFloat.current - Math.round(accFloat.current)
        }
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      accFloat.current = 0
      const col = activeColRef.current
      if (!col) return

      const endY = e.changedTouches[0].pageY
      const endTime = Date.now()
      // 用最近一段时间的速度（而非全程），更准确反映抬手瞬间的意图
      const deltaY = endY - lastMoveY.current
      const deltaTime = endTime - lastMoveTime.current

      // 时间太长（>150ms 无移动）说明已经停住了，不加惯性
      if (deltaTime > 150 || deltaTime === 0) return

      const velocityPxPerMs = deltaY / deltaTime

      // 太慢不触发惯性（阈值：0.15 px/ms）
      if (Math.abs(velocityPxPerMs) < 0.15) return

      // 速度转格/帧动量（包含倍速系数）
      const FRAME_MS = 16
      let momentum = -(velocityPxPerMs * SPEED_MULTIPLIER * FRAME_MS) / itemHeight
      const MAX_MOMENTUM = 12
      momentum = Math.max(-MAX_MOMENTUM, Math.min(MAX_MOMENTUM, momentum))

      // 衰减系数（每帧乘以此值）
      const FRICTION = 0.82

      const animate = () => {
        momentum *= FRICTION
        if (Math.abs(momentum) < 0.05) {
          rafRef.current = null
          return
        }

        const currentVal = pickerValRef.current[col.name]
        const currentIdx = col.items.indexOf(currentVal)
        if (currentIdx === -1) { rafRef.current = null; return }

        const newIdx = clampIndex(col, Math.round(currentIdx + momentum))
        if (newIdx !== currentIdx) {
          setPickerVal({ ...pickerValRef.current, [col.name]: col.items[newIdx] })
        }

        if (newIdx === 0 || newIdx === col.items.length - 1) {
          rafRef.current = null
          return
        }

        rafRef.current = requestAnimationFrame(animate)
      }

      // 延迟两帧，等库自身 snap 完成后启动惯性
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(animate)
      })
    }

    // capture + passive：不干扰库的事件处理
    el.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
    el.addEventListener('touchmove', onTouchMove, { capture: true, passive: true })
    el.addEventListener('touchend', onTouchEnd, { capture: true, passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart, { capture: true })
      el.removeEventListener('touchmove', onTouchMove, { capture: true })
      el.removeEventListener('touchend', onTouchEnd, { capture: true })
      cancelInertia()
    }
  }, [containerRef, columns, getColumnByX, clampIndex, cancelInertia, setPickerVal, shiftByFloat, itemHeight])
}
// ────────────────────────────────────────────────────────────────────────────

export default function TimePicker({ value, onChange, label = '时间', className }: TimePickerProps) {
  const [open, setOpen] = useState(false)

  // 将 "HH:mm" 拆成 { hour, minute }
  const parse = (v: string) => {
    const [h = '00', m = '00'] = v.split(':')
    return {
      hour: h.padStart(2, '0'),
      minute: m.padStart(2, '0'),
    }
  }

  const [pickerVal, setPickerVal] = useState(() => parse(value))

  // 外部 value 变化时同步
  useEffect(() => { setPickerVal(parse(value)) }, [value])

  const handleChange = (newVal: typeof pickerVal) => {
    setPickerVal(newVal)
  }

  const handleConfirm = () => {
    onChange(`${pickerVal.hour}:${pickerVal.minute}`)
    setOpen(false)
  }

  const handleCancel = () => {
    // 还原为 props value
    setPickerVal(parse(value))
    setOpen(false)
  }

  // ── 惯性滑动 ──
  const pickerContainerRef = useRef<HTMLDivElement>(null)
  const ITEM_HEIGHT = 44

  const timeColumns: InertiaColumn[] = [
    { name: 'hour', items: HOURS },
    { name: 'minute', items: MINUTES },
  ]

  usePickerInertia(
    pickerContainerRef,
    timeColumns,
    pickerVal,
    setPickerVal as (val: Record<string, string>) => void,
    ITEM_HEIGHT,
  )

  return (
    <>
      {/* 触发行 */}
      <div
        className={`flex items-center cursor-pointer ${className ?? ''}`}
        onClick={() => setOpen(true)}
      >
        <span className="text-[14px] text-[#7A5A60] flex-1">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[14px] font-semibold text-[#4A3035]">{value}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="#C0A8B0" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>

      {/* 遮罩 + 底部弹层 */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={handleCancel}
        >
          <div
            className="bg-white rounded-t-3xl"
            style={{ boxShadow: '0 -4px 24px rgba(0,0,0,0.12)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶部操作栏 */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2"
              style={{ borderBottom: '0.5px solid #F5EEF0' }}>
              <button
                type="button"
                onClick={handleCancel}
                className="text-[15px] font-medium"
                style={{ color: '#9A8090' }}
              >
                取消
              </button>
              <span className="text-[15px] font-bold text-[#4A3035]">选择时间</span>
              <button
                type="button"
                onClick={handleConfirm}
                className="text-[15px] font-semibold"
                style={{ color: '#F87098' }}
              >
                确定
              </button>
            </div>

            {/* Picker 主体 */}
            <div className="px-4 pb-6 pt-2">
              {/* 列标题 */}
              <div className="flex text-[12px] font-medium text-[#9A8090] mb-1 select-none">
                <div className="flex-1 text-center">时</div>
                <div className="flex-1 text-center">分</div>
              </div>

              {/* ref 挂在 Picker 外层容器，用于惯性监听 */}
              <div ref={pickerContainerRef}>
                <Picker
                  value={pickerVal}
                  onChange={handleChange}
                  height={200}
                  itemHeight={ITEM_HEIGHT}
                  wheelMode="natural"
                  style={{ '--rdp-color': '#F87098' } as React.CSSProperties}
                >
                  <Picker.Column name="hour">
                    {HOURS.map((h) => (
                      <Picker.Item key={h} value={h}>
                        {({ selected }) => (
                          <div
                            style={{
                              fontSize: selected ? 22 : 18,
                              fontWeight: selected ? 700 : 400,
                              color: selected ? '#4A3035' : '#B0A0A8',
                              transition: 'all 0.15s',
                              textAlign: 'center',
                            }}
                          >
                            {h}
                          </div>
                        )}
                      </Picker.Item>
                    ))}
                  </Picker.Column>

                  {/* 分隔符列（静态） */}
                  <div className="flex items-center justify-center" style={{ width: 20, flexShrink: 0 }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: '#4A3035', lineHeight: 1 }}>:</span>
                  </div>

                  <Picker.Column name="minute">
                    {MINUTES.map((m) => (
                      <Picker.Item key={m} value={m}>
                        {({ selected }) => (
                          <div
                            style={{
                              fontSize: selected ? 22 : 18,
                              fontWeight: selected ? 700 : 400,
                              color: selected ? '#4A3035' : '#B0A0A8',
                              transition: 'all 0.15s',
                              textAlign: 'center',
                            }}
                          >
                            {m}
                          </div>
                        )}
                      </Picker.Item>
                    ))}
                  </Picker.Column>
                </Picker>
              </div>

              {/* 选中指示线 */}
              <div
                className="pointer-events-none absolute left-4 right-4"
                style={{
                  top: '50%',
                  transform: 'translateY(-50%)',
                  height: 44,
                  borderTop: '1.5px solid #F0E8EA',
                  borderBottom: '1.5px solid #F0E8EA',
                  borderRadius: 10,
                }}
              />
            </div>

            {/* iPhone 底部安全区 */}
            <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
          </div>
        </div>
      )}
    </>
  )
}
