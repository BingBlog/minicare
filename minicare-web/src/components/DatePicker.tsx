/**
 * DatePicker — 移动端底部弹层日期选择器
 * 使用 react-mobile-picker，显示为 年/月/日 三列滚轮
 * 顶部提供「今天 / 昨天」快捷按钮
 *
 * 用法：
 *   <DatePicker value="2026-03-31" onChange={(v) => setDate(v)} max={today} />
 *
 * Props:
 *   value    — "YYYY-MM-DD" 格式字符串
 *   onChange — (val: string) => void，回调 "YYYY-MM-DD" 字符串
 *   max?     — 最大日期 "YYYY-MM-DD"，默认今天
 *   min?     — 最小日期 "YYYY-MM-DD"，默认 3 年前
 *   label?   — 触发行左侧标签，默认 "日期"
 *   className? — 传给触发行外层 div
 */
import { useState, useEffect, useMemo } from 'react'
import Picker from 'react-mobile-picker'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
function offsetDay(offset: number) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().split('T')[0]
}
function formatDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${y}年${parseInt(m)}月${parseInt(d)}日`
}
function pad2(n: number) { return n.toString().padStart(2, '0') }

interface DatePickerProps {
  value: string                    // "YYYY-MM-DD"
  onChange: (val: string) => void
  max?: string
  min?: string
  label?: string
  className?: string
}

export default function DatePicker({
  value,
  onChange,
  max,
  min,
  label = '日期',
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)

  const maxDate = max ?? todayStr()
  const minDate = min ?? (() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 3)
    return d.toISOString().split('T')[0]
  })()

  // 解析日期字符串 → { year, month, day }
  const parse = (v: string) => {
    const [y, m, d] = v.split('-')
    return { year: y, month: m, day: d }
  }

  const [pickerVal, setPickerVal] = useState(() => parse(value))

  useEffect(() => { setPickerVal(parse(value)) }, [value])

  // 生成年/月/日选项（在 min~max 范围内）
  const { years, months, days } = useMemo(() => {
    const [minY, minM, minD] = minDate.split('-').map(Number)
    const [maxY, maxM, maxD] = maxDate.split('-').map(Number)

    const ys: string[] = []
    for (let y = minY; y <= maxY; y++) ys.push(y.toString())

    const curY = parseInt(pickerVal.year)
    const curM = parseInt(pickerVal.month)

    // 月份：当年的可用月份
    const ms: string[] = []
    const mStart = curY === minY ? minM : 1
    const mEnd   = curY === maxY ? maxM : 12
    for (let m = mStart; m <= mEnd; m++) ms.push(pad2(m))

    // 日：当年当月的可用天数
    const daysInMonth = new Date(curY, curM, 0).getDate()
    const dStart = (curY === minY && curM === minM) ? minD : 1
    const dEnd   = (curY === maxY && curM === maxM) ? maxD : daysInMonth
    const ds: string[] = []
    for (let d = dStart; d <= dEnd; d++) ds.push(pad2(d))

    return { years: ys, months: ms, days: ds }
  }, [pickerVal.year, pickerVal.month, minDate, maxDate])

  // 当月份/年份变化时，自动修正 day 越界
  const handleChange = (newVal: typeof pickerVal, key: string) => {
    let { year, month, day } = newVal

    if (key === 'year' || key === 'month') {
      const y = parseInt(year)
      const m = parseInt(month)
      const daysInM = new Date(y, m, 0).getDate()
      const d = parseInt(day)
      if (d > daysInM) day = pad2(daysInM)
    }

    setPickerVal({ year, month, day })
  }

  const handleConfirm = () => {
    const { year, month, day } = pickerVal
    onChange(`${year}-${month}-${day}`)
    setOpen(false)
  }

  const handleCancel = () => {
    setPickerVal(parse(value))
    setOpen(false)
  }

  const handleShortcut = (dateStr: string) => {
    const p = parse(dateStr)
    setPickerVal(p)
    onChange(dateStr)
    setOpen(false)
  }

  // 快捷按钮：今天/昨天
  const shortcuts = [
    { label: '今天', date: todayStr() },
    { label: '昨天', date: offsetDay(-1) },
  ].filter(s => s.date >= minDate && s.date <= maxDate)

  return (
    <>
      {/* 触发行 */}
      <div
        className={`flex items-center cursor-pointer ${className ?? ''}`}
        onClick={() => setOpen(true)}
      >
        <span className="text-[14px] text-[#7A5A60] flex-1">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[14px] font-semibold text-[#4A3035]">{formatDisplay(value)}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="#C0A8B0" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>

      {/* 底部弹层 */}
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
              <button type="button" onClick={handleCancel}
                className="text-[15px] font-medium" style={{ color: '#9A8090' }}>
                取消
              </button>
              <span className="text-[15px] font-bold text-[#4A3035]">选择日期</span>
              <button type="button" onClick={handleConfirm}
                className="text-[15px] font-semibold" style={{ color: '#F87098' }}>
                确定
              </button>
            </div>

            {/* 快捷按钮 */}
            {shortcuts.length > 0 && (
              <div className="flex gap-2 px-5 py-3" style={{ borderBottom: '0.5px solid #F5EEF0' }}>
                {shortcuts.map(({ label: sLabel, date }) => (
                  <button
                    key={date}
                    type="button"
                    onClick={() => handleShortcut(date)}
                    className="px-4 py-1.5 rounded-full text-[13px] font-semibold border transition-all"
                    style={{
                      borderColor: value === date ? '#F87098' : '#E5D8DA',
                      background: value === date ? '#FFF0F4' : '#F8F3F4',
                      color: value === date ? '#F87098' : '#7A5A60',
                    }}
                  >
                    {sLabel}
                  </button>
                ))}
                <span className="flex-1 text-right self-center text-[12px]" style={{ color: '#9A8090' }}>
                  {formatDisplay(value)}
                </span>
              </div>
            )}

            {/* Picker 主体 */}
            <div className="px-4 pb-4 pt-2">
              {/* 列标题 */}
              <div className="flex text-[12px] font-medium text-[#9A8090] mb-1 select-none">
                <div className="flex-1 text-center">年</div>
                <div className="flex-1 text-center">月</div>
                <div className="flex-1 text-center">日</div>
              </div>

              <Picker
                value={pickerVal}
                onChange={handleChange}
                height={200}
                itemHeight={44}
                wheelMode="natural"
              >
                <Picker.Column name="year">
                  {years.map((y) => (
                    <Picker.Item key={y} value={y}>
                      {({ selected }) => (
                        <div style={{
                          fontSize: selected ? 20 : 17,
                          fontWeight: selected ? 700 : 400,
                          color: selected ? '#4A3035' : '#B0A0A8',
                          transition: 'all 0.15s',
                          textAlign: 'center',
                        }}>
                          {y}
                        </div>
                      )}
                    </Picker.Item>
                  ))}
                </Picker.Column>

                <Picker.Column name="month">
                  {months.map((m) => (
                    <Picker.Item key={m} value={m}>
                      {({ selected }) => (
                        <div style={{
                          fontSize: selected ? 20 : 17,
                          fontWeight: selected ? 700 : 400,
                          color: selected ? '#4A3035' : '#B0A0A8',
                          transition: 'all 0.15s',
                          textAlign: 'center',
                        }}>
                          {parseInt(m)}月
                        </div>
                      )}
                    </Picker.Item>
                  ))}
                </Picker.Column>

                <Picker.Column name="day">
                  {days.map((d) => (
                    <Picker.Item key={d} value={d}>
                      {({ selected }) => (
                        <div style={{
                          fontSize: selected ? 20 : 17,
                          fontWeight: selected ? 700 : 400,
                          color: selected ? '#4A3035' : '#B0A0A8',
                          transition: 'all 0.15s',
                          textAlign: 'center',
                        }}>
                          {parseInt(d)}日
                        </div>
                      )}
                    </Picker.Item>
                  ))}
                </Picker.Column>
              </Picker>
            </div>

            {/* iPhone 底部安全区 */}
            <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
          </div>
        </div>
      )}
    </>
  )
}
