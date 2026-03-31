/**
 * 饮食记录 - 奶粉 Tab 内容
 *
 * 包含：
 *  1. 奶粉类型多选（支持混用）
 *  2. 配比记录（每种选中奶粉的勺数调整 + 配比文字提示）
 *  3. 奶量快捷选 + 步进器
 *
 * 业务规则：
 *  - 取消勾选某奶粉类型时，对应勺数自动归零
 *  - 勺数步进使用分数步进序列（见 scoopUtils.ts），避免浮点误差
 *  - 配比提示仅在有效勺数 > 0 时显示
 */
import type { MilkType } from "./types";
import { milkTypeOptions, AMOUNT_CHIPS } from "./types";
import { formatScoop, stepUp, stepDown } from "./scoopUtils";
import { Stepper } from "../shared";

// ── Props ─────────────────────────────────────────────────────────────
interface Props {
  /** 当前选中的奶粉类型集合 */
  selectedMilkTypes: Set<MilkType>;
  /** 切换某奶粉类型是否选中 */
  onToggleMilkType: (key: MilkType) => void;
  /** 各奶粉类型对应的勺数 map */
  scoops: Record<MilkType, number>;
  /** 更新某奶粉的勺数 */
  onUpdateScoop: (key: MilkType, val: number) => void;
  /** 奶量（ml） */
  formulaMl: number;
  /** 更新奶量 */
  onChangeFormulaMl: (v: number) => void;
}

export default function FormulaSection({
  selectedMilkTypes,
  onToggleMilkType,
  scoops,
  onUpdateScoop,
  formulaMl,
  onChangeFormulaMl,
}: Props) {
  // 总勺数（用于配比百分比计算）
  const totalScoops = Object.values(scoops).reduce((a, b) => a + b, 0);

  /** 生成配比说明文字 */
  const getRatioTip = () => {
    const active = milkTypeOptions.filter((m) => scoops[m.key] > 0);
    if (active.length === 0) return "请在上方调整各奶粉的勺数";
    const parts = active.map(
      (m) => `${m.label} ${formatScoop(scoops[m.key])}勺`
    );
    const pcts = active.map(
      (m) => Math.round((scoops[m.key] / totalScoops) * 100) + "%"
    );
    return `当前配比：${parts.join(" + ")}（共 ${formatScoop(totalScoops)} 勺），比例 ${pcts.join(" : ")}`;
  };

  return (
    <>
      {/* ── 奶粉类型多选 ─────────────────────────── */}
      <div className="px-4 mb-1">
        <div className="text-[12px] font-semibold text-[#9A8090] mb-2">
          奶粉类型{" "}
          <span className="font-normal">（可多选，混用时分别填写勺数）</span>
        </div>
      </div>
      <div
        className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
        <div className="grid grid-cols-2 gap-2 p-3">
          {milkTypeOptions.map(({ key, label, desc, color }, idx) => {
            const isSelected = selectedMilkTypes.has(key);
            // 最后一项（普通奶粉）独占整行
            const isLast = idx === milkTypeOptions.length - 1;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onToggleMilkType(key)}
                className={`relative py-2.5 px-3 rounded-xl border text-left transition-all active:scale-95${
                  isLast ? " col-span-2" : ""
                }`}
                style={{
                  borderColor: isSelected ? color : "#E5D8DA",
                  background: isSelected ? color + "15" : "#fff",
                }}>
                {/* 多选角标 —— 垂直居中 */}
                <span
                  className="absolute top-1/2 -translate-y-1/2 right-2 w-4 h-4 rounded-full border flex items-center justify-center"
                  style={{
                    borderColor: isSelected ? color : "#D0C0C4",
                    background: isSelected ? color : "#fff",
                  }}>
                  {isSelected && (
                    <svg
                      viewBox="0 0 10 10"
                      fill="none"
                      style={{ width: 8, height: 8 }}>
                      <path
                        d="M1.5 5 L4 7.5 L8.5 2.5"
                        stroke="#fff"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <div
                  className="text-[13px] font-semibold pr-5"
                  style={{ color: isSelected ? color : "#4A3035" }}>
                  {label}
                </div>
                <div className="text-[11px] text-[#9A8090] mt-0.5">{desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 配比记录（有选中类型时显示） ─────────── */}
      {selectedMilkTypes.size > 0 && (
        <>
          <div className="px-4 mb-1">
            <span className="text-[12px] font-semibold text-[#9A8090]">
              配比记录
            </span>
            <span className="text-[11px] text-[#9A8090] ml-1">
              （转奶期混用时填写）
            </span>
          </div>
          <div
            className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
            style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
            <div className="p-3 pt-3">
              {milkTypeOptions
                .filter((m) => selectedMilkTypes.has(m.key))
                .map((m) => (
                  <div
                    key={m.key}
                    className="flex items-center gap-2 px-2 py-2 rounded-xl mb-2 border"
                    style={{ background: "#FAF5F6", borderColor: "#F0E8EA" }}>
                    {/* 色点 + 名称 */}
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: m.color }}
                    />
                    <span className="text-[13px] font-medium text-[#4A3035] flex-1 leading-tight">
                      {m.label}
                    </span>
                    {/* 步进控件 */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateScoop(m.key, stepDown(scoops[m.key]))
                        }
                        className="w-6 h-6 rounded-full border flex items-center justify-center text-[14px] text-[#9A8090] bg-white active:bg-pink-50 flex-shrink-0"
                        style={{ borderColor: "#E5D8DA" }}>
                        −
                      </button>
                      <span
                        className="text-[15px] font-bold text-[#4A3035] text-center select-none"
                        style={{ minWidth: 32 }}>
                        {formatScoop(scoops[m.key])}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateScoop(m.key, stepUp(scoops[m.key]))
                        }
                        className="w-6 h-6 rounded-full border flex items-center justify-center text-[14px] text-[#9A8090] bg-white active:bg-pink-50 flex-shrink-0"
                        style={{ borderColor: "#E5D8DA" }}>
                        ＋
                      </button>
                      <span className="text-[12px] text-[#9A8090] w-4">
                        勺
                      </span>
                    </div>
                  </div>
                ))}
              {/* 配比说明 */}
              {totalScoops > 0 && (
                <div
                  className="px-2 py-2 rounded-lg text-[11px] text-[#7A5A60] leading-relaxed"
                  style={{ background: "#FFF0F4" }}>
                  {getRatioTip()}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── 奶量 ─────────────────────────────────── */}
      <div className="px-4 mb-1">
        <span className="text-[12px] font-semibold text-[#9A8090]">奶量</span>
      </div>
      <div
        className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
        {/* 快捷选 */}
        <div className="flex gap-2 px-4 pt-3">
          {AMOUNT_CHIPS.map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => onChangeFormulaMl(amt)}
              className="flex-1 py-1.5 rounded-full text-[12px] font-semibold border transition-all"
              style={{
                borderColor: formulaMl === amt ? "#F87098" : "#E5D8DA",
                background: formulaMl === amt ? "#FFF0F4" : "#F8F3F4",
                color: formulaMl === amt ? "#F87098" : "#9A8090",
              }}>
              {amt}ml
            </button>
          ))}
        </div>
        <Stepper
          value={formulaMl}
          onChange={onChangeFormulaMl}
          step={10}
          min={10}
          max={400}
          unit="ml"
        />
      </div>
    </>
  );
}
