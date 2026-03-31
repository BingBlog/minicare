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
import { useState, useEffect } from 'react'
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

              <Picker
                value={pickerVal}
                onChange={handleChange}
                height={200}
                itemHeight={44}
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
