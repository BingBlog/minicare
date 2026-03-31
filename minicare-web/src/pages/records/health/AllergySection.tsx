/**
 * 健康记录 - 过敏表现卡片
 *
 * 包含：
 *  1. 9 种过敏症状 3 列网格多选
 *  2. 有症状时展示：表现程度（轻度/中度/重度）+ 拍照（占位）
 */

/** 过敏症状列表（9 项） */
const ALLERGY_SYMPTOMS = [
  "皮疹/湿疹",
  "荨麻疹",
  "腹泻",
  "呕吐",
  "鼻塞/流鼻涕",
  "打喷嚏",
  "眼睛红肿",
  "血便",
  "呼吸急促",
];

type Severity = "mild" | "moderate" | "severe";

const SEVERITY_CONFIG: {
  key: Severity;
  label: string;
  borderColor: string;
  bgColor: string;
  textColor: string;
}[] = [
  {
    key: "mild",
    label: "轻度",
    borderColor: "#4CAF82",
    bgColor: "#E8F5E9",
    textColor: "#2E7D32",
  },
  {
    key: "moderate",
    label: "中度",
    borderColor: "#FF8C42",
    bgColor: "#FFF3E0",
    textColor: "#E65100",
  },
  {
    key: "severe",
    label: "重度",
    borderColor: "#F05060",
    bgColor: "#FEF0F0",
    textColor: "#C62828",
  },
];

interface Props {
  selected: string[];
  onToggle: (s: string) => void;
  severity: Severity | null;
  onSeverityChange: (v: Severity | null) => void;
  onPhotoClick: () => void;
}

export default function AllergySection({
  selected,
  onToggle,
  severity,
  onSeverityChange,
  onPhotoClick,
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
          stroke="#F0A0B0"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: 16, height: 16 }}>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="text-[13px] font-bold text-[#7A5A60]">
          过敏表现（多选，无则跳过）
        </span>
      </div>

      {/* 9 项网格 */}
      <div className="grid grid-cols-3 gap-2 p-3">
        {ALLERGY_SYMPTOMS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onToggle(s)}
            className="py-2.5 px-2 rounded-xl border text-[13px] font-medium text-center transition-all active:scale-95"
            style={{
              borderColor: selected.includes(s) ? "#F05060" : "#E5D8DA",
              background: selected.includes(s) ? "#FEF0F0" : "#fff",
              color: selected.includes(s) ? "#F05060" : "#7A5A60",
            }}>
            {s}
          </button>
        ))}
      </div>

      {/* 有症状时：表现程度 + 拍照 */}
      {selected.length > 0 && (
        <>
          <div className="px-4 pb-1 text-[12px] text-[#9A8090]">表现程度</div>
          <div className="flex gap-2 px-4 pb-3">
            {SEVERITY_CONFIG.map(
              ({ key, label, borderColor, bgColor, textColor }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    onSeverityChange(severity === key ? null : key)
                  }
                  className="flex-1 py-2.5 rounded-xl border text-[13px] font-semibold text-center transition-all"
                  style={{
                    borderColor: severity === key ? borderColor : "#E5D8DA",
                    borderWidth: severity === key ? 2 : 1.5,
                    background: severity === key ? bgColor : "#fff",
                    color: severity === key ? textColor : "#9A8090",
                  }}>
                  {label}
                </button>
              )
            )}
          </div>

          {/* 拍照（占位） */}
          <div className="px-4 pb-1 text-[12px] text-[#9A8090]">
            表现拍照（可选）
          </div>
          <div className="flex gap-2.5 px-4 pb-3">
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center border-2 border-dashed"
              style={{ borderColor: "#F0B8C8", background: "#FFF0F4" }}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#F0B8C8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: 24, height: 24 }}>
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <button
              type="button"
              onClick={onPhotoClick}
              className="w-16 h-16 rounded-xl flex items-center justify-center text-[28px] font-light border-2 border-dashed"
              style={{
                borderColor: "#E5D8DA",
                background: "#F8F3F4",
                color: "#C0A8B0",
              }}>
              ＋
            </button>
          </div>
        </>
      )}
    </div>
  );
}
