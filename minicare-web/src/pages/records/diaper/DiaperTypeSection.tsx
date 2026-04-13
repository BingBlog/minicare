/**
 * 尿布记录 - 换尿布类型选择器
 *
 * 重构为大卡片式选择器（3 列并排），突出主操作：
 *  - 每个选项含大图标 + 主标签
 *  - 选中状态有明显的背景色和描边
 *  - 今日次数步进器紧跟在下方
 */

type DiaperChip = "wet" | "dirty" | "mixed";

// 嘘嘘图标：水滴
const IconWet = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 28, height: 28 }}>
    <path
      d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"
      stroke="currentColor"
      fill="currentColor"
      fillOpacity="0.15"
    />
  </svg>
);

// 臭臭图标：云朵（拟人便便造型）
const IconDirty = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 28, height: 28 }}>
    {/* 旋涡云朵形状 */}
    <path
      d="M12 3c1.1 0 2 .4 2.7 1.1.5-.3 1.1-.5 1.8-.5 1.9 0 3.5 1.6 3.5 3.5 0 .3 0 .5-.1.8.9.6 1.6 1.6 1.6 2.8 0 1.9-1.5 3.4-3.4 3.4H6.9C5 14.1 3.5 12.6 3.5 10.7c0-1.2.6-2.3 1.6-3 0-.2-.1-.4-.1-.6C5 5.2 6.4 3.8 8.2 3.8c.4 0 .7.1 1 .2C9.8 3.3 10.8 3 12 3z"
      stroke="currentColor"
      fill="currentColor"
      fillOpacity="0.15"
    />
    {/* 底部小脚丫暗示 */}
    <path d="M9 14.5c0 1.4 1.3 2.5 3 2.5s3-1.1 3-2.5" stroke="currentColor" />
  </svg>
);

// 臭臭+嘘嘘图标：水滴 + 云叠加
const IconMixed = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 28, height: 28 }}>
    <path
      d="M8 3.5l3.5 3.5a5 5 0 1 1-7 0z"
      stroke="currentColor"
      fill="currentColor"
      fillOpacity="0.2"
    />
    <path
      d="M14 5c.8 0 1.4.3 1.9.8.3-.2.8-.4 1.2-.4 1.3 0 2.4 1.1 2.4 2.4 0 .2 0 .4-.1.5.6.4 1.1 1.1 1.1 1.9 0 1.3-1 2.3-2.3 2.3H13c-1.3 0-2.3-1-2.3-2.3 0-.8.4-1.5 1-2 0-.1 0-.3-.1-.4 0-1.2 1-2.2 2.2-2.2l.2.1z"
      stroke="currentColor"
      fill="currentColor"
      fillOpacity="0.2"
    />
  </svg>
);

const CARD_OPTIONS: {
  key: DiaperChip;
  label: string;
  icon: () => JSX.Element;
  activeColor: string;
  activeBg: string;
  activeBorder: string;
}[] = [
  {
    key: "wet",
    label: "嘘嘘",
    icon: IconWet,
    activeColor: "#3B9EF5",
    activeBg: "#EEF6FF",
    activeBorder: "#7BBFF8",
  },
  {
    key: "dirty",
    label: "臭臭",
    icon: IconDirty,
    activeColor: "#D4875A",
    activeBg: "#FFF5EE",
    activeBorder: "#E8B48A",
  },
  {
    key: "mixed",
    label: "臭臭＋嘘嘘",
    icon: IconMixed,
    activeColor: "#A06CC0",
    activeBg: "#F7F0FC",
    activeBorder: "#C89EDA",
  },
];

interface Props {
  selected: DiaperChip;
  onSelect: (key: DiaperChip) => void;
  count: number;
  onCountChange: (v: number) => void;
}

export default function DiaperTypeSection({
  selected,
  onSelect,
  count,
  onCountChange,
}: Props) {
  return (
    <div
      className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
      style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
      {/* 卡片头部 */}
      <div
        className="flex items-center gap-2 px-4 pt-3.5 pb-2.5"
        style={{ borderBottom: "0.5px solid #F5EEF0" }}>
        {/* 尿布图标 */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#4CAF82"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: 15, height: 15 }}>
          <path d="M4 4h16v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4z" />
          <path d="M4 9h5l2 3 2-3h5" />
        </svg>
        <span className="text-[13px] font-bold text-[#7A5A60]">换尿布</span>
      </div>

      {/* 大卡片式三列选择器 */}
      <div className="grid grid-cols-3 gap-2.5 p-3">
        {CARD_OPTIONS.map(
          ({ key, label, icon: Icon, activeColor, activeBg, activeBorder }) => {
            const isSelected = selected === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(key)}
                className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 transition-all active:scale-95"
                style={{
                  paddingTop: 14,
                  paddingBottom: 14,
                  borderColor: isSelected ? activeBorder : "#EDE4E6",
                  background: isSelected ? activeBg : "#FAFAFA",
                  color: isSelected ? activeColor : "#B8A0A8",
                }}>
                <span style={{ color: isSelected ? activeColor : "#C8B0B8" }}>
                  <Icon />
                </span>
                <span
                  className="text-[13px] font-bold leading-tight tracking-wide"
                  style={{ color: isSelected ? activeColor : "#9A8090" }}>
                  {label}
                </span>
              </button>
            );
          },
        )}
      </div>

      {/* 今日次数 */}
      <div
        className="flex items-center px-4 py-2.5"
        style={{ borderTop: "0.5px solid #F5EEF0" }}>
        <span className="text-[13px] text-[#9A8090] flex-1">今日次数</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onCountChange(Math.max(0, count - 1))}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[18px] font-light transition-all active:bg-pink-50"
            style={{
              border: "1.5px solid #E5D8DA",
              color: "#9A8090",
              lineHeight: 1,
            }}>
            −
          </button>
          <span className="text-[18px] font-bold text-[#4A3035] min-w-[24px] text-center tabular-nums">
            {count}
          </span>
          <button
            type="button"
            onClick={() => onCountChange(count + 1)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[18px] font-light transition-all active:bg-pink-50"
            style={{
              border: "1.5px solid #E5D8DA",
              color: "#9A8090",
              lineHeight: 1,
            }}>
            ＋
          </button>
        </div>
      </div>
    </div>
  );
}
