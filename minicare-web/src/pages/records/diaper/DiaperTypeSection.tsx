/**
 * 尿布记录 - 换尿布卡片
 *
 * 包含：
 *  1. 尿布类型 Chip 单选（湿尿布 / 大便 / 都有 / 未换）
 *  2. 今日次数步进器（最小 0，无上限）
 */

type DiaperChip = "wet" | "dirty" | "mixed" | "dry";

const CHIP_OPTIONS: { key: DiaperChip; label: string }[] = [
  { key: "wet", label: "湿尿布" },
  { key: "dirty", label: "大便" },
  { key: "mixed", label: "都有" },
  { key: "dry", label: "未换" },
];

interface Props {
  /** 当前选中的 Chip（单选） */
  selected: DiaperChip;
  /** 选择某 Chip */
  onSelect: (key: DiaperChip) => void;
  /** 今日换尿布次数 */
  count: number;
  /** 更新今日次数 */
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
        className="flex items-center gap-2 px-4 pt-3.5 pb-2"
        style={{ borderBottom: "0.5px solid #F5EEF0" }}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#4CAF82"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: 16, height: 16 }}>
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
        </svg>
        <span className="text-[13px] font-bold text-[#7A5A60]">换尿布</span>
      </div>

      {/* Chip 单选行 */}
      <div className="flex gap-2 px-4 py-3 flex-wrap">
        {CHIP_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className="px-4 py-1.5 rounded-full text-[13px] font-semibold border transition-all"
            style={{
              borderColor: selected === key ? "#F87098" : "#E5D8DA",
              background: selected === key ? "#FFF0F4" : "#fff",
              color: selected === key ? "#F87098" : "#7A5A60",
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* 今日次数 */}
      <div
        className="flex items-center px-4 py-2.5"
        style={{ borderTop: "0.5px solid #F5EEF0" }}>
        <span className="text-[14px] text-[#7A5A60] flex-1">今日次数</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onCountChange(Math.max(0, count - 1))}
            className="w-6 h-6 rounded-full border flex items-center justify-center text-[14px] text-[#9A8090] active:bg-pink-50"
            style={{ borderColor: "#E5D8DA" }}>
            −
          </button>
          <span className="text-[14px] font-bold text-[#4A3035] min-w-[20px] text-center">
            {count}
          </span>
          <button
            type="button"
            onClick={() => onCountChange(count + 1)}
            className="w-6 h-6 rounded-full border flex items-center justify-center text-[14px] text-[#9A8090] active:bg-pink-50"
            style={{ borderColor: "#E5D8DA" }}>
            ＋
          </button>
        </div>
      </div>
    </div>
  );
}
