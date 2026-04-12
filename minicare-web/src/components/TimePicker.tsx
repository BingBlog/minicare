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

// ─── Android 惯性补偿 Hook ────────────────────────────────────────────────────
//
// iOS WebKit 自带动量滚动，react-mobile-picker 的 wheelMode="natural" 在 iOS 上
// 已经有很好的惯性体验，无需任何额外干预。
//
// Android Chrome 没有原生动量，抬手即停。此 hook 仅在 Android 上激活，在用户
// 抬手时读取瞬时速度，用 rAF + 摩擦衰减模拟惯性继续滑行。
//
// 设计原则：
//   - 不做倍速加速（不修改 touchmove 期间的位移），只补偿抬手后的惯性
//   - passive 监听，不阻止库自身的原生事件处理
//   - iOS 上直接 return，完全不介入

interface InertiaColumn {
  name: string
  items: string[]
}

const IS_IOS = /iphone|ipad|ipod/i.test(
  typeof navigator !== 'undefined' ? navigator.userAgent : ''
)

function useAndroidInertia(
  containerRef: React.RefObject<HTMLDivElement | null>,
  columns: InertiaColumn[],
  pickerValRef: React.RefObject<Record<string, string>>,
  setPickerVal: (val: Record<string, string>) => void,
  itemHeight = 44,
) {
  const lastMoveY = useRef(0)
  const lastMoveTime = useRef(0)
  const rafRef = useRef<number | null>(null)
  const activeColRef = useRef<InertiaColumn | null>(null)

  const cancelInertia = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const clampIndex = useCallback((items: string[], idx: number) =>
    Math.max(0, Math.min(items.length - 1, idx))
  , [])

  // 根据触点 X 位置识别操作的列
  const getColumnByX = useCallback((x: number, containerEl: HTMLDivElement) => {
    const rect = containerEl.getBoundingClientRect()
    const relX = x - rect.left
    const colWidth = rect.width / columns.length
    const colIdx = Math.floor(relX / colWidth)
    return columns[Math.max(0, Math.min(columns.length - 1, colIdx))]
  }, [columns])

  useEffect(() => {
    // iOS 上完全不介入，让 WebKit 原生惯性处理
    if (IS_IOS) return

    const el = containerRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      cancelInertia()
      const y = e.touches[0].pageY
      const x = e.touches[0].pageX
      lastMoveY.current = y
      lastMoveTime.current = Date.now()
      activeColRef.current = getColumnByX(x, el)
    }

    const onTouchMove = (e: TouchEvent) => {
      lastMoveY.current = e.touches[0].pageY
      lastMoveTime.current = Date.now()
    }

    const onTouchEnd = (e: TouchEvent) => {
      const col = activeColRef.current
      if (!col) return

      const endY = e.changedTouches[0].pageY
      const endTime = Date.now()
      const deltaY = endY - lastMoveY.current
      const deltaTime = endTime - lastMoveTime.current

      // 已经停住了（> 100ms 无移动），不加惯性
      if (deltaTime > 100 || deltaTime === 0) return

      const velocityPxPerMs = deltaY / deltaTime
      // 速度太慢不触发（阈值：0.2 px/ms）
      if (Math.abs(velocityPxPerMs) < 0.2) return

      const FRAME_MS = 16
      // 向下滑 → 负速度 → 选项向前（index 减小）
      let momentum = -(velocityPxPerMs * FRAME_MS) / itemHeight
      const MAX_MOMENTUM = 8
      momentum = Math.max(-MAX_MOMENTUM, Math.min(MAX_MOMENTUM, momentum))
      const FRICTION = 0.85

      const animate = () => {
        momentum *= FRICTION
        if (Math.abs(momentum) < 0.04) {
          rafRef.current = null
          return
        }

        const snapshot = pickerValRef.current
        const currentVal = snapshot[col.name]
        const currentIdx = col.items.indexOf(currentVal)
        if (currentIdx === -1) { rafRef.current = null; return }

        const newIdx = clampIndex(col.items, Math.round(currentIdx + momentum))
        if (newIdx !== currentIdx) {
          setPickerVal({ ...snapshot, [col.name]: col.items[newIdx] })
        }

        // 到达边界时停止
        if (newIdx === 0 || newIdx === col.items.length - 1) {
          rafRef.current = null
          return
        }

        rafRef.current = requestAnimationFrame(animate)
      }

      // 延迟一帧，等库完成 snap 后再接手
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(animate)
      })
    }

    el.addEventListener('touchstart', onTouchStart, { capture: false, passive: true })
    el.addEventListener('touchmove', onTouchMove, { capture: false, passive: true })
    el.addEventListener('touchend', onTouchEnd, { capture: false, passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart, { capture: false })
      el.removeEventListener('touchmove', onTouchMove, { capture: false })
      el.removeEventListener('touchend', onTouchEnd, { capture: false })
      cancelInertia()
    }
  }, [containerRef, columns, getColumnByX, clampIndex, cancelInertia, setPickerVal, itemHeight])
}
// ─────────────────────────────────────────────────────────────────────────────

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

  // ── Android 惯性补偿 ──
  const pickerContainerRef = useRef<HTMLDivElement>(null)
  const ITEM_HEIGHT = 44

  // pickerVal 通过 ref 传入，保证 rAF 回调读到最新值
  const pickerValRef = useRef(pickerVal)
  pickerValRef.current = pickerVal

  const timeColumns: InertiaColumn[] = [
    { name: 'hour', items: HOURS },
    { name: 'minute', items: MINUTES },
  ]

  useAndroidInertia(
    pickerContainerRef,
    timeColumns,
    pickerValRef,
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
            <div className="px-4 pb-6 pt-2" style={{ position: 'relative' }}>
              {/* 列标题 */}
              <div className="flex text-[12px] font-medium text-[#9A8090] mb-1 select-none">
                <div className="flex-1 text-center">时</div>
                <div className="flex-1 text-center">分</div>
              </div>

              {/* Android 惯性 ref */}
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
