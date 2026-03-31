/**
 * 健康记录 - 体温卡片
 *
 * 功能：
 *  - 步进器（0.1℃ 步进，范围 35.0 ~ 42.0℃）
 *  - 清除按钮（体温可选）
 *  - ≥37.5℃ 时显示警告提示
 */

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function TemperatureSection({ value, onChange }: Props) {
  const handleDecrease = () => {
    const cur = parseFloat(value) || 37.0;
    onChange(Math.max(35.0, +(cur - 0.1).toFixed(1)).toString());
  };

  const handleIncrease = () => {
    const cur = parseFloat(value) || 37.0;
    onChange(Math.min(42.0, +(cur + 0.1).toFixed(1)).toString());
  };

  const isHigh = value && parseFloat(value) >= 37.5;

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
          stroke="#F0B8C8"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: 16, height: 16 }}>
          <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
        </svg>
        <span className="text-[13px] font-bold text-[#7A5A60]">
          体温（可选）
        </span>
      </div>

      {/* 步进器行 */}
      <div className="flex items-center px-4 py-3">
        <span className="text-[14px] text-[#7A5A60] flex-1">体温</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDecrease}
            className="flex items-center justify-center w-7 h-7 rounded-full border text-[16px] text-[#9A8090] active:bg-pink-50"
            style={{ borderColor: "#E5D8DA" }}>
            −
          </button>
          <div className="flex items-center gap-0.5">
            <span className="text-[18px] font-bold text-[#4A3035] min-w-[46px] text-center">
              {value || "—"}
            </span>
            <span className="text-[13px] text-[#9A8090]">℃</span>
          </div>
          <button
            type="button"
            onClick={handleIncrease}
            className="flex items-center justify-center w-7 h-7 rounded-full border text-[16px] text-[#9A8090] active:bg-pink-50"
            style={{ borderColor: "#E5D8DA" }}>
            ＋
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-[11px] text-[#C0A8B0] ml-1">
              清除
            </button>
          )}
        </div>
      </div>

      {/* 高烧警告 */}
      {isHigh && (
        <div
          className="mx-4 mb-3 px-3 py-2 rounded-xl text-xs"
          style={{ background: "#FFF0F4", color: "#F05060" }}>
          ⚠️ 体温偏高（≥37.5℃），建议关注宝宝状态
        </div>
      )}
    </div>
  );
}
