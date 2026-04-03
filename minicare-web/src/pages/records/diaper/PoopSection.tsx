/**
 * 尿布记录 - 大便性状卡片
 *
 * 当尿布类型包含「臭臭」/「臭臭+嘘嘘」时条件显示。
 *
 * 重构为横向标签 Wrap 布局，减少视觉高度，扫视更快：
 *  1. 大便性状：带色点的标签单选（点再次点击取消）
 *  2. 颜色：带色点的小标签多选，合并在同一卡片内
 */

// 大便性状（横向标签）
// normal_soft 和 normal_form 合并为 normal（正常），作为第一项且默认选中
const POOP_ITEMS: { key: string; label: string; dot: string }[] = [
  { key: "normal",  label: "正常",   dot: "#F5C842" },
  { key: "loose",   label: "稀便",   dot: "#8BC34A" },
  { key: "watery",  label: "水样便", dot: "#64B5F6" },
  { key: "hard",    label: "干硬粒", dot: "#B0B0B0" },
  { key: "bloody",  label: "血丝便", dot: "#EF5350" },
];

// 颜色标签
const COLOR_CHIPS: { key: string; label: string; dot: string }[] = [
  { key: "yellow",       label: "黄色",     dot: "#F5C518" },
  { key: "brown_yellow", label: "棕黄",     dot: "#B8860B" },
  { key: "green",        label: "绿色",     dot: "#4CAF82" },
];

interface Props {
  poopType: string | null;
  onPoopTypeChange: (key: string | null) => void;
  colorSelected: Set<string>;
  onToggleColor: (key: string) => void;
}

// 标签组件
function TagChip({
  dot,
  label,
  selected,
  onClick,
  activeColor = "#C05020",
  activeBg = "#FFF5EE",
  activeBorder = "#F0A060",
}: {
  dot: string;
  label: string;
  selected: boolean;
  onClick: () => void;
  activeColor?: string;
  activeBg?: string;
  activeBorder?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border transition-all active:scale-95"
      style={{
        paddingTop: 6,
        paddingBottom: 6,
        paddingLeft: 11,
        paddingRight: 12,
        borderColor: selected ? activeBorder : "#E5D8DA",
        background: selected ? activeBg : "#F8F4F5",
        color: selected ? activeColor : "#9A8090",
      }}>
      <span
        className="rounded-full flex-shrink-0"
        style={{
          width: 10,
          height: 10,
          background: dot,
          opacity: selected ? 1 : 0.55,
        }}
      />
      <span className="text-[12px] font-semibold leading-none">{label}</span>
    </button>
  );
}

export default function PoopSection({
  poopType,
  onPoopTypeChange,
  colorSelected,
  onToggleColor,
}: Props) {
  return (
    <div
      className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
      style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>

      {/* 卡片头部 */}
      <div
        className="flex items-center gap-2 px-4 pt-3.5 pb-2.5"
        style={{ borderBottom: "0.5px solid #F5EEF0" }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="#DDB870" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span className="text-[13px] font-bold text-[#7A5A60]">大便性状</span>
        <span className="text-[11px] text-[#C0ADB2] ml-auto">可不选</span>
      </div>

      {/* 性状标签区 */}
      <div className="flex flex-wrap gap-2 px-4 pt-3 pb-2">
        {POOP_ITEMS.map(({ key, label, dot }) => (
          <TagChip
            key={key}
            dot={dot}
            label={label}
            selected={poopType === key}
            onClick={() => onPoopTypeChange(poopType === key ? null : key)}
            activeColor="#C05020"
            activeBg="#FFF5EE"
            activeBorder="#E8A070"
          />
        ))}
      </div>

      {/* 颜色标签区 */}
      <div
        className="flex items-center gap-2 px-4 pt-2 pb-3"
        style={{ borderTop: "0.5px solid #F5EEF0" }}>
        <span className="text-[12px] text-[#B8A0A8] font-medium flex-shrink-0">颜色</span>
        <div className="flex gap-1.5 flex-wrap">
          {COLOR_CHIPS.map(({ key, label, dot }) => (
            <TagChip
              key={key}
              dot={dot}
              label={label}
              selected={colorSelected.has(key)}
              onClick={() => onToggleColor(key)}
              activeColor="#F87098"
              activeBg="#FFF0F4"
              activeBorder="#F4A8C0"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
