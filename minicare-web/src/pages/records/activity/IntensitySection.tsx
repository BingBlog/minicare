/**
 * 活动记录 - 活动强度选择卡片
 *
 * 三个选项：轻松 / 适中 / 活跃
 * 每个选项包含 SVG 图标 + 文字标签
 */

type Intensity = "easy" | "medium" | "active";

const INTENSITY_OPTIONS: {
  key: Intensity;
  label: string;
  color: string;
  bg: string;
  /** 渲染图标的 SVG 字符串（内联） */
  iconPath: React.ReactNode;
}[] = [
  {
    key: "easy",
    label: "轻松",
    color: "#4CAF82",
    bg: "#E8F5E9",
    iconPath: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#4CAF82"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ width: 18, height: 18 }}>
        <rect x="6" y="10" width="12" height="4" rx="2" />
      </svg>
    ),
  },
  {
    key: "medium",
    label: "适中",
    color: "#DDB870",
    bg: "#FFF8E6",
    iconPath: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#DDB870"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ width: 18, height: 18 }}>
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
  },
  {
    key: "active",
    label: "活跃",
    color: "#F87098",
    bg: "#FFF0F4",
    iconPath: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#F87098"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ width: 18, height: 18 }}>
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
];

interface Props {
  value: Intensity;
  onChange: (v: Intensity) => void;
}

export default function IntensitySection({ value, onChange }: Props) {
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
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <span className="text-[13px] font-bold text-[#7A5A60]">活动强度</span>
      </div>

      <div className="flex gap-2.5 px-4 py-3">
        {INTENSITY_OPTIONS.map(({ key, label, color, bg, iconPath }) => (
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
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: value === key ? bg : "#F5F0F2" }}>
              {iconPath}
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
  );
}
