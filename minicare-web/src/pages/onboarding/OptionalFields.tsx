/**
 * Onboarding Step 1 — 可选字段展开区
 *
 * 点击展开后可填写：
 *   - 出生体重（克，500–7000）
 *   - 出生身高（厘米，30–80）
 */

interface Props {
  birthWeightG: string;
  onBirthWeightChange: (v: string) => void;
  birthHeightCm: string;
  onBirthHeightChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
}

export default function OptionalFields({
  birthWeightG,
  onBirthWeightChange,
  birthHeightCm,
  onBirthHeightChange,
  show,
  onToggle,
}: Props) {
  return (
    <div className="mx-4 mb-4">
      {/* 展开/收起按钮 */}
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 text-sm font-medium border-none bg-transparent cursor-pointer"
        style={{ color: "#F87098" }}>
        <svg
          viewBox="0 0 24 24"
          className={`w-4 h-4 transition-transform ${show ? "rotate-180" : ""}`}
          fill="#F87098">
          <path d="M7 10l5 5 5-5z" />
        </svg>
        {show ? "收起" : "填写出生体重 & 身高（可选）"}
      </button>

      {/* 展开内容 */}
      {show && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#9A8090] mb-1">出生体重（克）</label>
            <input
              type="number"
              placeholder="如：3200"
              value={birthWeightG}
              onChange={(e) => onBirthWeightChange(e.target.value)}
              min={500}
              max={7000}
              className="w-full h-11 px-3 rounded-xl border text-sm text-[#4A3035] placeholder:text-[#C0A8AD] outline-none focus:border-[#F87098] bg-white transition-colors"
              style={{ borderColor: "#E8E0E4" }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#9A8090] mb-1">出生身高（厘米）</label>
            <input
              type="number"
              placeholder="如：50"
              value={birthHeightCm}
              onChange={(e) => onBirthHeightChange(e.target.value)}
              min={30}
              max={80}
              className="w-full h-11 px-3 rounded-xl border text-sm text-[#4A3035] placeholder:text-[#C0A8AD] outline-none focus:border-[#F87098] bg-white transition-colors"
              style={{ borderColor: "#E8E0E4" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
