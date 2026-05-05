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
import { useState, useEffect, useMemo, useRef, useCallback, type RefObject } from "react";
import dayjs from "dayjs";
import Picker from "react-mobile-picker";

function todayStr() {
  return dayjs().format("YYYY-MM-DD");
}
function offsetDay(offset: number) {
  return dayjs().add(offset, "day").format("YYYY-MM-DD");
}
function formatDisplay(dateStr: string): string {
  if (!dateStr) return "请选择日期";
  const d = dayjs(dateStr);
  if (!d.isValid()) return "请选择日期";
  return d.format("YYYY年M月D日");
}
function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

interface DatePickerProps {
  value: string; // "YYYY-MM-DD"
  onChange: (val: string) => void;
  max?: string;
  min?: string;
  label?: string;
  className?: string;
  /** 受控模式：外部控制弹层显示状态，传入时忽略触发行 */
  open?: boolean;
  /** 受控模式：弹层关闭回调 */
  onClose?: () => void;
}

// ─── iOS 滚动穿透锁定 Hook ───────────────────────────────────────────────────
//
// iOS WebKit 的 scroll chaining：弹层内触摸事件会「穿透」到背景页面，
// 导致背景跟着滚动，同时拖慢 picker 自身的滑动响应。
// 解决方案：在遮罩容器上注册 non-passive touchmove，调用 preventDefault 截断。
// picker 列内部仍保留 react-mobile-picker 自己的原生 touch 逻辑（touch-action: pan-y）。

function useScrollLock(overlayRef: RefObject<HTMLDivElement | null>, open: boolean) {
  useEffect(() => {
    if (!open) return
    const el = overlayRef.current
    if (!el) return

    // 无条件 preventDefault：阻止弹层内所有 touchmove 密击默认页面滚动，
    // picker 库自身的 JS 事件处理器不受影响（preventDefault 只阻止浏览器默认行为）
    const prevent = (e: TouchEvent) => { e.preventDefault() }

    el.addEventListener('touchmove', prevent, { passive: false })
    return () => el.removeEventListener('touchmove', prevent)
  }, [overlayRef, open])
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Android 惯性补偿 Hook ────────────────────────────────────────────────────
//
// iOS WebKit 自带动量滚动，react-mobile-picker 在 iOS 上惯性体验已很好，无需介入。
// Android Chrome 没有原生动量，抬手即停。此 hook 仅在 Android 上激活，补偿惯性延伸。
//
// 注意：columns/pickerVal 使用 ref 传入，保证每帧 rAF 里读到最新的动态选项列表
// （DatePicker 的月/日列表会随年/月变化动态更新）

interface InertiaColumn {
  name: string
  items: string[]
}

const IS_IOS = /iphone|ipad|ipod/i.test(
  typeof navigator !== 'undefined' ? navigator.userAgent : ''
)

function useAndroidInertia(
  containerRef: React.RefObject<HTMLDivElement | null>,
  columnsRef: React.RefObject<InertiaColumn[]>,
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

  // 根据触点 X 位置识别操作的列（每次都从 ref 读最新列定义）
  const getColumnByX = useCallback((x: number, containerEl: HTMLDivElement): InertiaColumn | null => {
    const cols = columnsRef.current
    if (!cols || cols.length === 0) return null
    const rect = containerEl.getBoundingClientRect()
    const relX = x - rect.left
    const colWidth = rect.width / cols.length
    const colIdx = Math.floor(relX / colWidth)
    return cols[Math.max(0, Math.min(cols.length - 1, colIdx))]
  }, [columnsRef])

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
      if (Math.abs(velocityPxPerMs) < 0.2) return

      const FRAME_MS = 16
      let momentum = -(velocityPxPerMs * FRAME_MS) / itemHeight
      const MAX_MOMENTUM = 8
      momentum = Math.max(-MAX_MOMENTUM, Math.min(MAX_MOMENTUM, momentum))
      const FRICTION = 0.85

      const animate = () => {
        momentum *= FRICTION
        if (Math.abs(momentum) < 0.04) { rafRef.current = null; return }

        const snapshot = pickerValRef.current
        if (!snapshot) { rafRef.current = null; return }
        // 每帧从 ref 取最新列定义（月/日是动态的）
        const latestCol = columnsRef.current?.find(c => c.name === col.name) ?? col
        const currentVal = snapshot[latestCol.name]
        const currentIdx = latestCol.items.indexOf(currentVal)
        if (currentIdx === -1) { rafRef.current = null; return }

        const newIdx = clampIndex(latestCol.items, Math.round(currentIdx + momentum))
        if (newIdx !== currentIdx) {
          setPickerVal({ ...snapshot, [latestCol.name]: latestCol.items[newIdx] })
        }

        if (newIdx === 0 || newIdx === latestCol.items.length - 1) {
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
  }, [containerRef, columnsRef, getColumnByX, clampIndex, cancelInertia, setPickerVal, itemHeight])
}
// ─────────────────────────────────────────────────────────────────────────────

export default function DatePicker({
  value,
  onChange,
  max,
  min,
  label = "日期",
  className,
  open: controlledOpen,
  onClose,
}: DatePickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  // 受控模式：外部传入 open；非受控模式：内部 state
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) {
      if (!v && onClose) onClose();
    } else {
      setInternalOpen(v);
    }
  };

  const maxDate = max ?? todayStr();
  const minDate = min ?? dayjs().subtract(3, "year").format("YYYY-MM-DD");

  // 解析日期字符串 → { year, month, day }
  const parse = (v: string) => {
    const [y, m, d] = v.split("-");
    return { year: y, month: m, day: d };
  };

  const [pickerVal, setPickerVal] = useState(() => parse(value));

  useEffect(() => {
    setPickerVal(parse(value));
  }, [value]);

  // 生成年/月/日选项（在 min~max 范围内）
  const { years, months, days } = useMemo(() => {
    const [minY, minM, minD] = minDate.split("-").map(Number);
    const [maxY, maxM, maxD] = maxDate.split("-").map(Number);

    const ys: string[] = [];
    for (let y = minY; y <= maxY; y++) ys.push(y.toString());

    const curY = parseInt(pickerVal.year);
    const curM = parseInt(pickerVal.month);

    // 月份：当年的可用月份
    const ms: string[] = [];
    const mStart = curY === minY ? minM : 1;
    const mEnd = curY === maxY ? maxM : 12;
    for (let m = mStart; m <= mEnd; m++) ms.push(pad2(m));

    // 日：当年当月的可用天数
    const daysInMonth = dayjs(`${curY}-${pad2(curM)}`).daysInMonth();
    const dStart = curY === minY && curM === minM ? minD : 1;
    const dEnd = curY === maxY && curM === maxM ? maxD : daysInMonth;
    const ds: string[] = [];
    for (let d = dStart; d <= dEnd; d++) ds.push(pad2(d));

    return { years: ys, months: ms, days: ds };
  }, [pickerVal.year, pickerVal.month, minDate, maxDate]);

  // 当月份/年份变化时，自动修正 day 越界
  const handleChange = (newVal: typeof pickerVal, key: string) => {
    let { year, month, day } = newVal;

    if (key === "year" || key === "month") {
      const y = parseInt(year);
      const m = parseInt(month);
      const daysInM = dayjs(`${y}-${pad2(m)}`).daysInMonth();
      const d = parseInt(day);
      if (d > daysInM) day = pad2(daysInM);
    }

    setPickerVal({ year, month, day });
  };

  const handleConfirm = () => {
    const { year, month, day } = pickerVal;
    onChange(`${year}-${month}-${day}`);
    setOpen(false);
  };

  const handleCancel = () => {
    setPickerVal(parse(value));
    setOpen(false);
  };

  const handleShortcut = (dateStr: string) => {
    const p = parse(dateStr);
    setPickerVal(p);
    onChange(dateStr);
    setOpen(false);
  };

  // 快捷按钮：今天/昨天
  const shortcuts = [
    { label: "今天", date: todayStr() },
    { label: "昨天", date: offsetDay(-1) },
  ].filter((s) => s.date >= minDate && s.date <= maxDate);

  // ── 滚动穿透锁 ──
  const overlayRef = useRef<HTMLDivElement>(null);
  useScrollLock(overlayRef, open);

  // ── Android 惯性补偿 ──
  const pickerContainerRef = useRef<HTMLDivElement>(null);
  const ITEM_HEIGHT = 44;

  // columns/pickerVal 使用 ref 传递，保证 rAF 回调读到最新的动态列表
  const columnsRef = useRef<InertiaColumn[]>([]);
  const pickerValRef = useRef<Record<string, string>>(pickerVal);

  // 每次渲染同步最新值到 ref
  columnsRef.current = [
    { name: "year", items: years },
    { name: "month", items: months },
    { name: "day", items: days },
  ];
  pickerValRef.current = pickerVal;

  useAndroidInertia(
    pickerContainerRef,
    columnsRef,
    pickerValRef,
    (val) => {
      // 惯性跳格时也需要做 day 越界修正
      const { year, month, day } = val as { year: string; month: string; day: string };
      const y = parseInt(year);
      const m = parseInt(month);
      const daysInM = dayjs(`${y}-${pad2(m)}`).daysInMonth();
      const d = parseInt(day);
      const correctedDay = d > daysInM ? pad2(daysInM) : day;
      setPickerVal({ year, month, day: correctedDay });
    },
    ITEM_HEIGHT,
  );

  return (
    <>
      {/* 触发行 — 受控模式下隐藏（外部自行提供触发按钮） */}
      {!isControlled && (
        <div
          className={`flex items-center cursor-pointer ${className ?? ""}`}
          onClick={() => setOpen(true)}>
          <span className="text-[14px] text-[#7A5A60] flex-1">{label}</span>
          <div className="flex items-center gap-1.5">
            <span
              className={`text-[14px] font-semibold ${value ? "text-[#4A3035]" : "text-[#C0A8AD]"}`}>
              {formatDisplay(value)}
            </span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#C0A8B0"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 14, height: 14 }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </div>
      )}

      {/* 底部弹层 */}
      {open && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.35)" }}
          onClick={handleCancel}>
          <div
            className="bg-white rounded-t-3xl"
            style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
            onClick={(e) => e.stopPropagation()}>
            {/* 顶部操作栏 */}
            <div
              className="flex items-center justify-between px-5 pt-4 pb-2"
              style={{ borderBottom: "0.5px solid #F5EEF0" }}>
              <button
                type="button"
                onClick={handleCancel}
                className="text-[15px] font-medium"
                style={{ color: "#9A8090" }}>
                取消
              </button>
              <span className="text-[15px] font-bold text-[#4A3035]">
                选择日期
              </span>
              <button
                type="button"
                onClick={handleConfirm}
                className="text-[15px] font-semibold"
                style={{ color: "#F87098" }}>
                确定
              </button>
            </div>

            {/* 快捷按钮 */}
            {shortcuts.length > 0 && (
              <div
                className="flex gap-2 px-5 py-3"
                style={{ borderBottom: "0.5px solid #F5EEF0" }}>
                {shortcuts.map(({ label: sLabel, date }) => (
                  <button
                    key={date}
                    type="button"
                    onClick={() => handleShortcut(date)}
                    className="px-4 py-1.5 rounded-full text-[13px] font-semibold border transition-all"
                    style={{
                      borderColor: value === date ? "#F87098" : "#E5D8DA",
                      background: value === date ? "#FFF0F4" : "#F8F3F4",
                      color: value === date ? "#F87098" : "#7A5A60",
                    }}>
                    {sLabel}
                  </button>
                ))}
                <span
                  className="flex-1 text-right self-center text-[12px]"
                  style={{ color: "#9A8090" }}>
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

              {/* Android 惯性补偿 ref；data-picker-scroll 让 useScrollLock 放行 picker 内滑动 */}
              <div ref={pickerContainerRef} data-picker-scroll>
                <Picker
                  value={pickerVal}
                  onChange={handleChange}
                  height={200}
                  itemHeight={ITEM_HEIGHT}
                  wheelMode="natural">
                  <Picker.Column name="year">
                    {years.map((y) => (
                      <Picker.Item key={y} value={y}>
                        {({ selected }) => (
                          <div
                            style={{
                              fontSize: selected ? 20 : 17,
                              fontWeight: selected ? 700 : 400,
                              color: selected ? "#4A3035" : "#B0A0A8",
                              transition: "all 0.15s",
                              textAlign: "center",
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
                          <div
                            style={{
                              fontSize: selected ? 20 : 17,
                              fontWeight: selected ? 700 : 400,
                              color: selected ? "#4A3035" : "#B0A0A8",
                              transition: "all 0.15s",
                              textAlign: "center",
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
                          <div
                            style={{
                              fontSize: selected ? 20 : 17,
                              fontWeight: selected ? 700 : 400,
                              color: selected ? "#4A3035" : "#B0A0A8",
                              transition: "all 0.15s",
                              textAlign: "center",
                            }}>
                            {parseInt(d)}日
                          </div>
                        )}
                      </Picker.Item>
                    ))}
                  </Picker.Column>
                </Picker>
              </div>
            </div>

            {/* iPhone 底部安全区 */}
            <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
          </div>
        </div>
      )}
    </>
  );
}
