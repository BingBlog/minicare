/**
 * 睡眠记录 - 补录模式
 *
 * 包含：
 *  1. 入睡时间 / 醒来时间 TimePicker
 *  2. 自动计算的睡眠时长显示
 *  3. 睡眠时段 Chip 选择（夜间 / 上午小睡 / 下午小睡 / 其他）
 */
import TimePicker from "@/components/TimePicker";

/** 计算两个 HH:mm 字符串之间的分钟差（跨午夜兼容） */
function calcDurationMin(startTime: string, endTime: string): number {
  const s = new Date(`2000-01-01T${startTime}:00`).getTime();
  let e = new Date(`2000-01-01T${endTime}:00`).getTime();
  if (e < s) e += 24 * 3600 * 1000; // 跨午夜
  return Math.round((e - s) / 60000);
}

const PERIOD_OPTIONS = [
  { key: "night", label: "夜间", icon: "🌙" },
  { key: "morning_nap", label: "上午小睡", icon: "☀️" },
  { key: "afternoon_nap", label: "下午小睡", icon: "🌤️" },
  { key: "other", label: "其他", icon: "" },
];

interface Props {
  startTime: string;
  endTime: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  sleepPeriod: string;
  onPeriodChange: (v: string) => void;
}

export default function ManualMode({
  startTime,
  endTime,
  onStartChange,
  onEndChange,
  sleepPeriod,
  onPeriodChange,
}: Props) {
  const durationMin = calcDurationMin(startTime, endTime);

  return (
    <>
      {/* 时间信息卡片 */}
      <div className="px-4 pt-3.5 pb-1">
        <span className="text-[12px] font-semibold text-[#9A8090]">
          时间信息
        </span>
      </div>
      <div
        className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
        <div
          className="px-4 py-3"
          style={{ borderBottom: "0.5px solid #F5EEF0" }}>
          <TimePicker
            value={startTime}
            onChange={onStartChange}
            label="入睡时间"
          />
        </div>
        <div
          className="px-4 py-3"
          style={{ borderBottom: "0.5px solid #F5EEF0" }}>
          <TimePicker
            value={endTime}
            onChange={onEndChange}
            label="醒来时间"
          />
        </div>
        {/* 自动计算的时长 */}
        <div className="flex items-center px-4 py-3">
          <span className="text-[14px] text-[#7A5A60] flex-1">睡眠时长</span>
          <span className="text-[14px] font-semibold text-[#4A3035]">
            {durationMin > 0
              ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m（自动计算）`
              : "—"}
          </span>
        </div>
      </div>

      {/* 睡眠时段 */}
      <div className="px-4 pb-1">
        <span className="text-[12px] font-semibold text-[#9A8090]">
          睡眠时段
        </span>
      </div>
      <div
        className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
        <div className="flex flex-wrap gap-2 px-4 py-3">
          {PERIOD_OPTIONS.map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onPeriodChange(key)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border text-[13px] font-semibold transition-all"
              style={{
                borderColor: sleepPeriod === key ? "#F87098" : "#E5D8DA",
                background: sleepPeriod === key ? "#FFF0F4" : "#fff",
                color: sleepPeriod === key ? "#F87098" : "#7A5A60",
              }}>
              {icon && <span>{icon}</span>}
              {label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
