/**
 * 睡眠记录 - 计时模式组件
 *
 * 功能：
 *  - 圆形 conic-gradient 进度环可视化（满环 = 12 小时）
 *  - 计时数字显示
 *  - 开始 / 结束 / 重新计时 三态按钮
 *
 * 注意：计时器的 setInterval 逻辑由父组件管理（通过 Props 注入状态），
 * 本组件仅负责 UI 渲染。
 */

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

/**
 * 将秒数格式化为 mm:ss 或 h:mm:ss
 */
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
  /** 计时器已停止（有记录待保存） */
  stopped: boolean;
  /** 当前累计秒数 */
  seconds: number;
  /** 计时开始时间（用于显示"开始于 xx:xx"） */
  startTime: Date | null;
  /** 开始计时 */
  onStart: () => void;
  /** 结束计时 */
  onStop: () => void;
}

export default function TimerMode({
  running,
  stopped,
  seconds,
  startTime,
  onStart,
  onStop,
}: Props) {
  return (
    <div className="flex flex-col items-center pt-8 pb-4 gap-4">
      {/* 圆形计时器进度环 */}
      <div
        className="relative flex items-center justify-center"
        style={{
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: running
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
            {running || stopped ? formatTimer(seconds) : "0m"}
          </span>
          <span className="text-[12px] text-[#9A8090] font-medium">
            {running ? "睡眠进行中" : stopped ? "已结束" : "准备好了"}
          </span>
        </div>
      </div>

      {/* 开始时间提示 */}
      {startTime && (
        <span className="text-[13px] text-[#9A8090]">
          开始于{" "}
          {startTime.getHours().toString().padStart(2, "0")}:
          {startTime.getMinutes().toString().padStart(2, "0")} 今天
        </span>
      )}

      {/* 操作按钮（三态） */}
      {!running && !stopped && (
        <button
          type="button"
          onClick={onStart}
          className="w-44 py-4 rounded-2xl text-white text-[16px] font-bold"
          style={{
            background: "#4CAF82",
            boxShadow: "0 4px 14px rgba(52,199,89,.4)",
          }}>
          开始计时
        </button>
      )}
      {running && (
        <button
          type="button"
          onClick={onStop}
          className="w-44 py-4 rounded-2xl text-white text-[16px] font-bold"
          style={{
            background: "#F87098",
            boxShadow: "0 4px 14px rgba(248,112,152,.35)",
          }}>
          结束睡眠
        </button>
      )}
      {stopped && (
        <button
          type="button"
          onClick={onStart}
          className="w-44 py-4 rounded-2xl text-[16px] font-bold"
          style={{ background: "#F0E8EA", color: "#7A5A60" }}>
          重新计时
        </button>
      )}
    </div>
  );
}
