/**
 * 活动记录 - 活动类型选择卡片
 *
 * 5 种活动类型横排滚动（爬走练习 / 户外活动 / 运动活动 / 洗澡 / 其他）
 * 图标均使用内联 SVG，避免 emoji 渲染差异
 */

type ActivityType = "tummy_time" | "outdoor" | "play" | "bath" | "other";

/** 爬走练习：宝宝趴卧/爬行 —— 用人形向前爬动图标 */
const IconTummyTime = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    {/* 头 */}
    <circle cx="17" cy="6" r="2" />
    {/* 身体趴着向前 */}
    <path d="M3 14 Q8 10 13 12 L17 10" />
    {/* 手臂向前伸 */}
    <path d="M3 14 L6 17" />
    <path d="M13 12 L11 16" />
  </svg>
);

/** 户外活动：太阳 + 光线 */
const IconOutdoor = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    <circle cx="12" cy="12" r="4" />
    <line x1="12" y1="2" x2="12" y2="4" />
    <line x1="12" y1="20" x2="12" y2="22" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="2" y1="12" x2="4" y2="12" />
    <line x1="20" y1="12" x2="22" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

/** 运动活动：蹦跳/跑步人形 */
const IconPlay = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    {/* 头 */}
    <circle cx="13" cy="4" r="2" />
    {/* 躯干 */}
    <path d="M11 8 L10 14" />
    {/* 手臂 */}
    <path d="M10 10 L7 9" />
    <path d="M10 10 L14 8" />
    {/* 腿（奔跑姿势） */}
    <path d="M10 14 L7 18" />
    <path d="M10 14 L13 17" />
  </svg>
);

/** 洗澡：浴缸 */
const IconBath = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    <path d="M9 6 L9 11" />
    <path d="M9 6 Q9 4 11 4 L11 11" />
    <path d="M2 11 L22 11" />
    <path d="M2 11 Q2 16 5 18 L5 20" />
    <path d="M22 11 Q22 16 19 18 L19 20" />
    <path d="M3 18 L21 18" />
  </svg>
);

/** 其他活动：星形 */
const IconOther = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const ACTIVITY_OPTIONS: {
  key: ActivityType;
  label: string;
  sub: string;
  Icon: React.ComponentType<{ color: string }>;
  color: string;
  bg: string;
}[] = [
  {
    key: "tummy_time",
    label: "爬走练习",
    sub: "趴卧/爬行练习",
    Icon: IconTummyTime,
    color: "#F87098",
    bg: "#FFF0F4",
  },
  {
    key: "outdoor",
    label: "户外活动",
    sub: "散步/日晒/亲近自然",
    Icon: IconOutdoor,
    color: "#C0922A",
    bg: "#FFFDE7",
  },
  {
    key: "play",
    label: "运动活动",
    sub: "蹦跳/肢体运动",
    Icon: IconPlay,
    color: "#4CAF82",
    bg: "#E8F5E9",
  },
  {
    key: "bath",
    label: "洗澡",
    sub: "日常清洁护理",
    Icon: IconBath,
    color: "#4A90D9",
    bg: "#EEF6FF",
  },
  {
    key: "other",
    label: "其他活动",
    sub: "自由记录",
    Icon: IconOther,
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

      {/* 横排均匀分布 */}
      <div className="flex px-2 py-3 gap-1">
        {ACTIVITY_OPTIONS.map(({ key, label, Icon, color, bg }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border transition-all active:scale-95"
            style={{
              borderColor: value === key ? color : "#E5D8DA",
              background: value === key ? bg : "#fff",
            }}>
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: value === key ? bg : "#F5F0F2" }}>
              <Icon color={value === key ? color : "#B09098"} />
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
