/**
 * 活动记录 - 活动类型选择卡片
 *
 * 5 种活动类型横排滚动（爬走练习 / 户外活动 / 运动活动 / 洗澡 / 其他）
 */

type ActivityType = "tummy_time" | "outdoor" | "play" | "bath" | "other";

const ACTIVITY_OPTIONS: {
  key: ActivityType;
  label: string;
  sub: string;
  icon: string;
  color: string;
  bg: string;
}[] = [
  {
    key: "tummy_time",
    label: "爬走练习",
    sub: "趴卧/爬行练习",
    icon: "🐛",
    color: "#F87098",
    bg: "#FFF0F4",
  },
  {
    key: "outdoor",
    label: "户外活动",
    sub: "散步/日晒/亲近自然",
    icon: "🌞",
    color: "#C0922A",
    bg: "#FFFDE7",
  },
  {
    key: "play",
    label: "运动活动",
    sub: "蹦跳/肢体运动",
    icon: "🎯",
    color: "#4CAF82",
    bg: "#E8F5E9",
  },
  {
    key: "bath",
    label: "洗澡",
    sub: "日常清洁护理",
    icon: "🛁",
    color: "#4A90D9",
    bg: "#EEF6FF",
  },
  {
    key: "other",
    label: "其他活动",
    sub: "自由记录",
    icon: "✨",
    color: "#9B8ED8",
    bg: "#F3F0FF",
  },
];

interface Props {
  value: ActivityType;
  onChange: (v: ActivityType) => void;
}

export default function ActivityTypeSection({ value, onChange }: Props) {
  return (
    <div
      className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
      style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
      {/* 卡片头部 */}
      <div
        className="flex items-center gap-2 px-4 pt-3.5 pb-2"
        style={{ borderBottom: "0.5px solid #F5EEF0" }}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#DDB870"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: 16, height: 16 }}>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <span className="text-[13px] font-bold text-[#7A5A60]">活动类型</span>
      </div>

      {/* 横排可滚动卡片列表 */}
      <div className="flex gap-1.5 px-3 py-3 overflow-x-auto">
        {ACTIVITY_OPTIONS.map(({ key, label, icon, color, bg }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className="flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border flex-shrink-0 transition-all active:scale-95"
            style={{
              minWidth: 56,
              borderColor: value === key ? color : "#E5D8DA",
              background: value === key ? bg : "#fff",
            }}>
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: value === key ? bg : "#F5F0F2" }}>
              <span className="text-[16px]">{icon}</span>
            </span>
            <span
              className="text-[11px] font-medium whitespace-nowrap"
              style={{ color: value === key ? color : "#9A8090" }}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
