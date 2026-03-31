/**
 * 饮食记录 - 营养素 Tab 内容
 *
 * 包含：
 *  - 5 种营养素（维生素D / 铁 / 益生菌 / 益生元 / 钙）
 *  - 每行：勾选框 + 名称 + 剂量输入框 + 单位
 */
import { suppItems } from "./types";

interface Props {
  /** 各营养素是否已勾选 */
  checked: Record<string, boolean>;
  /** 各营养素剂量输入值（字符串，保留输入中间态） */
  dose: Record<string, string>;
  /** 切换某营养素勾选状态 */
  onToggle: (key: string) => void;
  /** 更新某营养素剂量 */
  onDoseChange: (key: string, val: string) => void;
}

export default function SupplementSection({
  checked,
  dose,
  onToggle,
  onDoseChange,
}: Props) {
  return (
    <>
      <div className="px-4 mb-1">
        <span className="text-[12px] font-semibold text-[#9A8090]">
          营养素记录
        </span>
      </div>
      <div
        className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
        {suppItems.map((s, idx) => (
          <div
            key={s.key}
            className="flex items-center gap-2.5 px-4 py-3 relative"
            style={{
              borderBottom:
                idx < suppItems.length - 1 ? "0.5px solid #F5EEF0" : "none",
            }}>
            {/* 勾选框 */}
            <button
              type="button"
              onClick={() => onToggle(s.key)}
              className="w-5 h-5 rounded-[6px] border-2 flex items-center justify-center flex-shrink-0 transition-all"
              style={{
                borderColor: checked[s.key] ? "#F87098" : "#D0C0C4",
                background: checked[s.key] ? "#F87098" : "#fff",
              }}>
              {checked[s.key] && (
                <span className="text-white text-[11px] font-bold leading-none">
                  ✓
                </span>
              )}
            </button>

            {/* 营养素名称 */}
            <span className="text-[14px] font-medium text-[#4A3035] flex-1">
              {s.label}
            </span>

            {/* 剂量输入 */}
            <input
              type="text"
              inputMode="decimal"
              placeholder="剂量"
              value={dose[s.key] || ""}
              onChange={(e) =>
                onDoseChange(s.key, e.target.value.replace(/[^0-9.]/g, ""))
              }
              className="w-16 text-center text-[13px] text-[#4A3035] bg-[#FAF5F6] rounded-lg border outline-none"
              style={{ borderColor: "#E5D8DA", padding: "5px 6px" }}
            />

            {/* 单位 */}
            <span className="text-[12px] text-[#9A8090] w-5">{s.unit}</span>
          </div>
        ))}
      </div>
    </>
  );
}
