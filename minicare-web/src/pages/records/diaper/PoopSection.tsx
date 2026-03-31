/**
 * 尿布记录 - 大便性状卡片
 *
 * 当尿布类型包含"大便"或"都有"时条件显示。
 *
 * 包含：
 *  1. 6 种大便性状（3 列网格，单选）
 *  2. 颜色 Chip 多选（黄色 / 棕黄 / 绿色）
 */

// 大便性状配置（6 项，3 列网格）
const POOP_ITEMS = [
  { key: "normal_soft", label: "正常软便", dot: "#F5C842" },
  { key: "loose", label: "稀便", dot: "#8BC34A" },
  { key: "watery", label: "水样便", dot: "#64B5F6" },
  { key: "hard", label: "干硬粒", dot: "#B0B0B0" },
  { key: "bloody", label: "血丝便", dot: "#EF5350" },
  { key: "normal_form", label: "正常成形", dot: "#8D6E63" },
];

// 颜色 Chip
const COLOR_CHIPS = [
  { key: "yellow", label: "黄色", dot: "#F5C518" },
  { key: "brown_yellow", label: "棕黄", dot: "#B8860B" },
  { key: "green", label: "绿色", dot: "#4CAF82" },
];

interface Props {
  /** 当前选中的性状 key（null 表示未选） */
  poopType: string | null;
  /** 切换性状选中（再次点击取消） */
  onPoopTypeChange: (key: string | null) => void;
  /** 当前选中的颜色 key 集合 */
  colorSelected: Set<string>;
  /** 切换某颜色选中状态 */
  onToggleColor: (key: string) => void;
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
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span className="text-[13px] font-bold text-[#7A5A60]">大便性状</span>
      </div>

      {/* 6 项网格 */}
      <div className="grid grid-cols-3 gap-2 p-3">
        {POOP_ITEMS.map(({ key, label, dot }) => (
          <button
            key={key}
            type="button"
            onClick={() =>
              onPoopTypeChange(poopType === key ? null : key)
            }
            className="flex flex-col items-center gap-1 py-2.5 rounded-xl border transition-all active:scale-95"
            style={{
              borderColor: poopType === key ? "#FF8C42" : "#E5D8DA",
              background: poopType === key ? "#FFF5EE" : "#fff",
            }}>
            <span
              className="w-[22px] h-[22px] rounded-full"
              style={{ background: dot }}
            />
            <span
              className="text-[11px] font-medium"
              style={{
                color: poopType === key ? "#C05020" : "#9A8090",
              }}>
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* 颜色 Chip（小号） */}
      <div
        className="flex items-center px-4 py-2.5"
        style={{ borderTop: "0.5px solid #F5EEF0" }}>
        <span className="text-[12px] text-[#9A8090] mr-3">颜色</span>
        <div className="flex gap-1.5 flex-1 justify-end">
          {COLOR_CHIPS.map(({ key, label, dot }) => (
            <button
              key={key}
              type="button"
              onClick={() => onToggleColor(key)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] transition-all"
              style={{
                borderColor: colorSelected.has(key) ? "#F87098" : "#E5D8DA",
                background: colorSelected.has(key) ? "#FFF0F4" : "#fff",
                color: colorSelected.has(key) ? "#F87098" : "#7A5A60",
              }}>
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: dot }}
              />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
