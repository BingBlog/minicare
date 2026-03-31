/**
 * 饮食记录 - 母乳 Tab 内容
 *
 * 包含：
 *  1. 哺乳侧选择（左侧 / 右侧 / 双侧）
 *  2. 哺乳时长步进器（1 ~ 60 分钟，5 分钟步进）
 */
import { Stepper } from "../shared";

interface Props {
  breastSide: "left" | "right" | "both";
  onChangeSide: (side: "left" | "right" | "both") => void;
  durationMin: number;
  onChangeDuration: (v: number) => void;
}

/** 哺乳侧选项配置 */
const SIDE_OPTIONS = [
  { key: "left" as const, label: "左侧", icon: "←" },
  { key: "right" as const, label: "右侧", icon: "→" },
  { key: "both" as const, label: "双侧", icon: "↔" },
];

export default function BreastSection({
  breastSide,
  onChangeSide,
  durationMin,
  onChangeDuration,
}: Props) {
  return (
    <>
      {/* ── 哺乳侧 ─────────────────────────────────── */}
      <div className="px-4 mb-1">
        <span className="text-[12px] font-semibold text-[#9A8090]">
          哺乳侧
        </span>
      </div>
      <div
        className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
        <div className="flex gap-2.5 p-3">
          {SIDE_OPTIONS.map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onChangeSide(key)}
              className="flex-1 flex flex-col items-center gap-1 py-3.5 rounded-xl border transition-all active:scale-95"
              style={{
                borderColor: breastSide === key ? "#F87098" : "#E5D8DA",
                background: breastSide === key ? "#FFF0F4" : "#fff",
              }}>
              <span className="text-[22px] leading-none">{icon}</span>
              <span
                className="text-[13px] font-semibold"
                style={{
                  color: breastSide === key ? "#F87098" : "#4A3035",
                }}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── 时长 ──────────────────────────────────── */}
      <div className="px-4 mb-1">
        <span className="text-[12px] font-semibold text-[#9A8090]">
          时长
        </span>
      </div>
      <div
        className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
        <Stepper
          value={durationMin}
          onChange={onChangeDuration}
          step={5}
          min={1}
          max={60}
          unit="分钟"
        />
      </div>
    </>
  );
}
