/**
 * 睡眠记录 - 计时模式组件
 *
 * 四种状态：
 *   idle    — 未开始（seconds === 0, !running, !stopped）→ 显示「开始计时」
 *   running — 计时中（running）                          → 显示「结束睡眠」
 *   paused  — 暂停中（seconds > 0, !running, !stopped）  → 显示「继续计时」（弹窗取消后）
 *   stopped — 已保存（stopped）                          → 显示保存成功提示
 *
 * 注意：
 *  - 计时器的 setInterval 逻辑由父组件管理（通过 Props 注入状态）
 *  - onStart  → 父组件调用 startSleep API（首次开始，创建服务端记录）
 *  - onResume → 父组件直接恢复 setTimerRunning(true)，不调用 API（弹窗「继续计时」后的恢复）
 *  - onStop   → 父组件判断时长，短则弹窗，长则调用 endSleep API
 */

import dayjs from "dayjs";

/** 月亮图标（计时圆圈中心） */
const IconMoon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="#4CAF82"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 28, height: 28 }}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

/** Loading 小圆圈 */
const IconSpinner = () => (
  <svg
    className="animate-spin"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    style={{ width: 18, height: 18 }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

/** 将秒数格式化为 mm:ss 或 h:mm:ss */
function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface Props {
  /** 计时器是否运行中 */
  running: boolean;
  /** 计时器已结束（endSleep API 已成功调用） */
  stopped: boolean;
  /** 当前累计秒数 */
  seconds: number;
  /** 计时开始时间（用于显示"开始于 xx:xx"） */
  startTime: Date | null;
  /** 正在调用 startSleep / endSleep API */
  apiLoading: boolean;
  /** 首次点击「开始计时」→ 父组件调用 startSleep API 创建服务端记录 */
  onStart: () => void;
  /** 暂停后点击「继续计时」→ 父组件直接恢复本地计时，不调用 API */
  onResume: () => void;
  /** 点击「结束睡眠」→ 父组件判断时长，短则弹窗，长则调用 endSleep API */
  onStop: () => void;
  /** 点击「取消本次计时」→ 父组件弹确认弹窗 */
  onCancel: () => void;
}

export default function TimerMode({
  running,
  stopped,
  seconds,
  startTime,
  apiLoading,
  onStart,
  onResume,
  onStop,
  onCancel,
}: Props) {
  const isIdle   = !running && !stopped && seconds === 0;
  const isPaused = !running && !stopped && seconds > 0;

  return (
    <div className="flex flex-col items-center pt-8 pb-4 gap-4">
      {/* 圆形计时器进度环 */}
      <div
        className="relative flex items-center justify-center"
        style={{
          width: 180,
          height: 180,
          borderRadius: "50%",
          // 运行中 / 暂停中 均渲染已积累的进度弧
          background: (!isIdle)
            ? `conic-gradient(#4CAF82 ${Math.min(
                100,
                (seconds / (12 * 3600)) * 100
              )}%, #F0E8EA 0%)`
            : "#F0E8EA",
        }}>
        {/* 内圆白底 */}
        <div
          className="flex flex-col items-center justify-center gap-1"
          style={{
            width: 148,
            height: 148,
            borderRadius: "50%",
            background: "#fff",
          }}>
          <IconMoon />
          <span className="text-[32px] font-extrabold text-[#4A3035] leading-none tracking-tight">
            {isIdle ? "0m" : formatTimer(seconds)}
          </span>
          <span className="text-[12px] text-[#9A8090] font-medium">
            {running  ? "睡眠进行中"
            : stopped  ? "已保存"
            : isPaused ? "已暂停"
            :            "准备好了"}
          </span>
        </div>
      </div>

      {/* 开始时间提示 */}
      {startTime && (
        <span className="text-[13px] text-[#9A8090]">
          开始于 {dayjs(startTime).format("HH:mm")} 今天
        </span>
      )}

      {/* ── 按钮区 ── */}

      {/* idle：「开始计时」*/}
      {isIdle && (
        <button
          type="button"
          onClick={onStart}
          disabled={apiLoading}
          className="w-44 py-4 rounded-2xl text-white text-[16px] font-bold flex items-center justify-center gap-2"
          style={{
            background: apiLoading ? "#A8D8B0" : "#4CAF82",
            boxShadow: apiLoading ? "none" : "0 4px 14px rgba(52,199,89,.4)",
          }}>
          {apiLoading ? <IconSpinner /> : null}
          开始计时
        </button>
      )}

      {/* paused：「继续计时」 + 「取消本次计时」（不调 API，直接恢复本地计时器） */}
      {isPaused && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onResume}
            className="w-44 py-4 rounded-2xl text-white text-[16px] font-bold flex items-center justify-center gap-2"
            style={{
              background: "#4CAF82",
              boxShadow: "0 4px 14px rgba(52,199,89,.4)",
            }}>
            继续计时
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-[13px] font-medium"
            style={{ color: "#C4A8B0" }}>
            取消本次计时
          </button>
        </div>
      )}

      {/* running：「结束睡眠」 + 「取消本次计时」 */}
      {running && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onStop}
            disabled={apiLoading}
            className="w-44 py-4 rounded-2xl text-white text-[16px] font-bold flex items-center justify-center gap-2"
            style={{
              background: apiLoading ? "#FBB8CA" : "#F87098",
              boxShadow: apiLoading ? "none" : "0 4px 14px rgba(248,112,152,.35)",
            }}>
            {apiLoading ? <IconSpinner /> : null}
            结束睡眠
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={apiLoading}
            className="text-[13px] font-medium"
            style={{ color: "#C4A8B0" }}>
            取消本次计时
          </button>
        </div>
      )}

      {/* stopped：保存成功提示（即将自动跳回） */}
      {stopped && (
        <div
          className="flex items-center gap-2 text-[14px] font-semibold"
          style={{ color: "#4CAF82" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 18, height: 18 }}>
            <path d="M20 6L9 17l-5-5" />
          </svg>
          记录已保存，正在返回…
        </div>
      )}
    </div>
  );
}