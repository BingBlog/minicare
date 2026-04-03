/**
 * 尿布记录 - 屁屁状态卡片
 *
 * 每次换尿布时记录屁屁皮肤状态，帮助追踪尿布疹趋势。
 *
 * 重构为横向标签 Wrap 布局：
 *  - 6 种状态用带颜色语义的标签单选（可再次点击取消）
 *  - 颜色从绿→黄→橙→红→紫，直观传达严重程度
 *  - 始终显示，可不选
 */

export type ButtCondition =
  | "normal"
  | "slightly_red"
  | "rash"
  | "severe_rash"
  | "fungal"
  | "other";

const BUTT_ITEMS: {
  key: ButtCondition;
  label: string;
  dot: string;
  activeColor: string;
  activeBg: string;
  activeBorder: string;
}[] = [
  {
    key: "normal",
    label: "正常",
    dot: "#4CAF82",
    activeColor: "#2A9060",
    activeBg: "#EEF9F3",
    activeBorder: "#7ACCA0",
  },
  {
    key: "slightly_red",
    label: "轻微发红",
    dot: "#FFB74D",
    activeColor: "#B07820",
    activeBg: "#FFF8EE",
    activeBorder: "#FFCA80",
  },
  {
    key: "rash",
    label: "红屁屁",
    dot: "#F87098",
    activeColor: "#D04060",
    activeBg: "#FFF0F4",
    activeBorder: "#F4A0B8",
  },
  {
    key: "severe_rash",
    label: "严重红屁屁",
    dot: "#E53935",
    activeColor: "#B82020",
    activeBg: "#FFF0F0",
    activeBorder: "#E88080",
  },
  {
    key: "fungal",
    label: "疑似感染",
    dot: "#9C6FD0",
    activeColor: "#6A3A96",
    activeBg: "#F5F0FC",
    activeBorder: "#C09ADC",
  },
  {
    key: "other",
    label: "其他异常",
    dot: "#90A4AE",
    activeColor: "#5A7480",
    activeBg: "#F2F6F8",
    activeBorder: "#A8C0C8",
  },
];

interface Props {
  value: ButtCondition | null;
  onChange: (key: ButtCondition | null) => void;
}

export default function ButtConditionSection({ value, onChange }: Props) {
  return (
    <div
      className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
      style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>

      {/* 卡片头部 */}
      <div
        className="flex items-center gap-2 px-4 pt-3.5 pb-2.5"
        style={{ borderBottom: "0.5px solid #F5EEF0" }}>
        {/* 心形图标 */}
        <svg viewBox="0 0 24 24" fill="none" stroke="#F87098" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        <span className="text-[13px] font-bold text-[#7A5A60]">屁屁状态</span>
        <span className="text-[11px] text-[#C0ADB2] ml-auto">可不选</span>
      </div>

      {/* 标签区 */}
      <div className="flex flex-wrap gap-2 px-4 py-3">
        {BUTT_ITEMS.map(({ key, label, dot, activeColor, activeBg, activeBorder }) => {
          const isSelected = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(isSelected ? null : key)}
              className="inline-flex items-center gap-1.5 rounded-full border transition-all active:scale-95"
              style={{
                paddingTop: 6,
                paddingBottom: 6,
                paddingLeft: 11,
                paddingRight: 12,
                borderColor: isSelected ? activeBorder : "#E5D8DA",
                background: isSelected ? activeBg : "#F8F4F5",
                color: isSelected ? activeColor : "#9A8090",
              }}>
              <span
                className="rounded-full flex-shrink-0"
                style={{
                  width: 10,
                  height: 10,
                  background: dot,
                  opacity: isSelected ? 1 : 0.5,
                }}
              />
              <span className="text-[12px] font-semibold leading-none">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
