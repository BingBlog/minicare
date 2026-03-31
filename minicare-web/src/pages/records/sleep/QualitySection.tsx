/**
 * 睡眠记录 - 睡眠质量选择卡片
 *
 * 三个选项：良好 / 一般 / 较差
 * 两种模式均显示此卡片。
 */

// 睡眠质量类型
type SleepQuality = "good" | "normal" | "poor";

// SVG 表情图标
const IconLaugh = ({ color }: { color: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 22, height: 22 }}>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 13s1.5 2 4 2 4-2 4-2" />
    <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="3" />
    <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="3" />
  </svg>
);

const IconNeutral = ({ color }: { color: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 22, height: 22 }}>
    <circle cx="12" cy="12" r="10" />
    <line x1="8" y1="15" x2="16" y2="15" />
    <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="3" />
    <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="3" />
  </svg>
);

const IconFrown = ({ color }: { color: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 22, height: 22 }}>
    <circle cx="12" cy="12" r="10" />
    <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
    <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="3" />
    <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="3" />
  </svg>
);

/** 质量选项配置 */
const QUALITY_OPTIONS: {
  key: SleepQuality;
  label: string;
  Icon: React.ComponentType<{ color: string }>;
  color: string;
  bg: string;
}[] = [
  { key: "good", label: "良好", Icon: IconLaugh, color: "#4CAF82", bg: "#E8F5E9" },
  { key: "normal", label: "一般", Icon: IconNeutral, color: "#9A8090", bg: "#F5F0F2" },
  { key: "poor", label: "较差", Icon: IconFrown, color: "#F87098", bg: "#FFF0F4" },
];

interface Props {
  value: SleepQuality;
  onChange: (v: SleepQuality) => void;
}

export default function QualitySection({ value, onChange }: Props) {
  return (
    <>
      <div className="px-4 pb-1">
        <span className="text-[12px] font-semibold text-[#9A8090]">
          睡眠质量
        </span>
      </div>
      <div
        className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
        <div className="flex gap-2.5 px-4 py-3">
          {QUALITY_OPTIONS.map(({ key, label, Icon, color, bg }) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all active:scale-95"
              style={{
                borderColor: value === key ? color : "#E5D8DA",
                background: value === key ? bg : "#fff",
              }}>
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: value === key ? bg : "#F5F0F2" }}>
                <Icon color={value === key ? color : "#9A8090"} />
              </span>
              <span
                className="text-[12px] font-medium"
                style={{ color: value === key ? color : "#9A8090" }}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
