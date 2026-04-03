/**
 * Onboarding Step 1 — 过敏信息区域
 *
 * 包含：
 *   - 过敏类型固定显示（牛奶蛋白，MVP 阶段不可更改）
 *   - 过敏程度分段选择器（轻度/中度/重度/未知）
 *   - CDC 参考链接提示
 *   - 补充提示（生长数据可后续录入）
 */
import type { AllergyLevel } from "@/api";

type AllergyLevelKey = AllergyLevel | "";

const ALLERGY_LEVEL_OPTIONS: {
  value: AllergyLevel;
  label: string;
  activeColor: string;
}[] = [
  { value: "mild", label: "轻度", activeColor: "#4CAF82" },
  { value: "moderate", label: "中度", activeColor: "#DDB870" },
  { value: "severe", label: "重度", activeColor: "#F05060" },
  { value: "unknown", label: "未知", activeColor: "#9A8090" },
];

interface Props {
  allergyLevel: AllergyLevelKey;
  onAllergyLevelChange: (v: AllergyLevel) => void;
}

export default function AllergySection({
  allergyLevel,
  onAllergyLevelChange,
}: Props) {
  return (
    <>
      {/* 过敏类型固定项 */}
      {/* <div
        className="text-xs font-bold text-[#9A8090] px-5 pt-4 pb-1.5"
        style={{ letterSpacing: ".3px" }}>
        过敏信息
      </div>
      <div
        className="mx-4 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.07)" }}>
        <div className="flex items-center px-4 py-3.5">
          <span className="text-sm text-[#4A3035]">
            过敏类型 <span className="text-red-400">*</span>
          </span>
          <span className="flex-1 text-right text-sm text-[#4A3035]">
            牛奶蛋白过敏
          </span>
          <span className="text-[#C0A8AD] ml-1 text-base">›</span>
        </div>
      </div> */}

      {/* 过敏程度分段选择器 */}
      <div
        className="text-xs font-bold text-[#9A8090] px-5 pt-4 pb-1.5"
        style={{ letterSpacing: ".3px" }}>
        过敏程度
      </div>
      <div
        className="mx-4 flex rounded-2xl overflow-hidden p-1"
        style={{ background: "#F5F0F2" }}>
        {ALLERGY_LEVEL_OPTIONS.map(({ value, label, activeColor }) => (
          <div
            key={value}
            onClick={() => onAllergyLevelChange(value)}
            className="flex-1 text-center py-2.5 rounded-xl cursor-pointer text-[13px] font-semibold transition-all"
            style={
              allergyLevel === value
                ? {
                    background: "#fff",
                    color: activeColor,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                  }
                : { color: "#9A8090" }
            }>
            {label}
          </div>
        ))}
      </div>

      {/* CDC 提示 */}
      <div
        className="mx-4 mt-2 mb-4 px-3.5 py-3 rounded-xl"
        style={{ background: "var(--color-primary-lt, #FFF0F4)" }}>
        <div className="text-xs text-[#9A8090] leading-relaxed">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              width: 13,
              height: 13,
              verticalAlign: -2,
              color: "#F87098",
              display: "inline",
            }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>{" "}
          不确定过敏程度？{" "}
          <a
            href="https://www.cdc.gov/niosh/topics/emres/allergen.html"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold"
            style={{ color: "#F87098" }}>
            [查看 CDC 评分标准]
          </a>{" "}
          — 可先选「未知」，就诊后再更新。
        </div>
      </div>

      {/* 补充提示 */}
      <div
        className="mx-4 mb-5 px-3.5 py-3 rounded-xl border"
        style={{ background: "#FAFAFA", borderColor: "#F0E8EA" }}>
        <div className="text-[11px] text-[#9A8090] leading-relaxed">
          身高、体重等生长数据可在档案创建后，通过「生长记录」模块随时补充。
        </div>
      </div>
    </>
  );
}
