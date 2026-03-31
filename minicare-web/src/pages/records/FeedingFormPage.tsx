/**
 * 饮食记录表单页
 * UI 对齐 ui-draft/form-feeding.html
 * API: POST /api/family/:familyId/records/feeding
 * 字段：baby_id, feed_type(breast|formula|complementary|supplement), record_time,
 *       breast_side(left|right|both), duration_min, formula_ml,
 *       complementary_food, amount_g, note
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { recordsApi } from "@/api";
import TimePicker from "@/components/TimePicker";

// ── Tab 类型 ──────────────────────────────────────────────────────
type FeedTab = "formula" | "breast" | "supplement" | "food";

// ── 奶粉类型 ──────────────────────────────────────────────────────
type MilkType = "aa" | "eh_lactose" | "eh_no_lactose" | "ph" | "std";
const milkTypeOptions: {
  key: MilkType;
  label: string;
  desc: string;
  color: string;
}[] = [
  { key: "aa", label: "氨基酸奶粉", desc: "深度过敏 适用", color: "#F87098" },
  {
    key: "eh_lactose",
    label: "深度水解（含乳糖）",
    desc: "转奶第2阶段",
    color: "#9B8ED8",
  },
  {
    key: "eh_no_lactose",
    label: "深度水解（无乳糖）",
    desc: "乳糖不耐受",
    color: "#7B6EC8",
  },
  { key: "ph", label: "适度水解奶粉", desc: "转奶第3阶段", color: "#DDB870" },
  { key: "std", label: "普通奶粉", desc: "免疫耐受后", color: "#4CAF82" },
];

// ── 营养素 ────────────────────────────────────────────────────────
const suppItems = [
  { key: "vitD", label: "维生素 D", unit: "IU" },
  { key: "iron", label: "铁", unit: "mg" },
  { key: "probiotic", label: "益生菌", unit: "亿" },
  { key: "prebiotic", label: "益生元", unit: "g" },
  { key: "calcium", label: "钙", unit: "mg" },
];

// ── 勺数步进逻辑 ─────────────────────────────────────────────────
// 用「分子/分母」对精确表示每一步，彻底避免浮点误差
// 序列：0, 1/4, 1/3, 1/2, 2/3, 3/4, 1, 1+1/4, 1+1/3 … 整数步进到 20
type Fraction = { n: number; d: number }; // n/d，d=1 表示整数

const FRAC_PARTS: Fraction[] = [
  { n: 0, d: 1 },
  { n: 1, d: 4 },
  { n: 1, d: 3 },
  { n: 1, d: 2 },
  { n: 2, d: 3 },
  { n: 3, d: 4 },
];

// 完整步进序列（分数形式）
const SCOOP_STEP_FRACS: Fraction[] = (() => {
  const result: Fraction[] = [];
  for (const f of FRAC_PARTS) result.push(f); // 0 ~ 3/4
  for (let w = 1; w <= 20; w++) {
    result.push({ n: w, d: 1 }); // 整数
    if (w < 20) {
      for (const f of FRAC_PARTS.slice(1)) {
        // 1/4 ~ 3/4 部分
        result.push({ n: w * f.d + f.n, d: f.d }); // 用通分存储：w + n/d = (w*d+n)/d
      }
    }
  }
  return result;
})();

/** 将分数转成浮点数（仅用于比较，不用于显示） */
function fracToNum(f: Fraction): number {
  return f.n / f.d;
}

// 对应浮点数列表（与 SCOOP_STEP_FRACS 一一对应）
const SCOOP_STEPS: number[] = SCOOP_STEP_FRACS.map(fracToNum);

function stepUp(val: number): number {
  const idx = SCOOP_STEPS.findIndex((s) => s > val + 1e-9);
  return idx === -1 ? SCOOP_STEPS[SCOOP_STEPS.length - 1] : SCOOP_STEPS[idx];
}

function stepDown(val: number): number {
  const idx = [...SCOOP_STEPS].reverse().findIndex((s) => s < val - 1e-9);
  return idx === -1 ? 0 : SCOOP_STEPS[SCOOP_STEPS.length - 1 - idx];
}

/** Unicode 分数字符映射（分子/分母 → 符号） */
const FRAC_SYMBOL: Record<string, string> = {
  "1/4": "¼",
  "1/3": "⅓",
  "1/2": "½",
  "2/3": "⅔",
  "3/4": "¾",
  "5/4": "1¼",
  "4/3": "1⅓",
  "3/2": "1½",
  "5/3": "1⅔",
  "7/4": "1¾",
};

/** 将浮点步进值显示为分数字符串，永远不显示小数点 */
function formatScoop(val: number): string {
  if (val === 0) return "0";
  // 找到对应的 Fraction
  const idx = SCOOP_STEPS.findIndex((s) => Math.abs(s - val) < 1e-9);
  if (idx === -1) return String(Math.round(val)); // 理论上不会走到这里
  const { n, d } = SCOOP_STEP_FRACS[idx];
  if (d === 1) return String(n); // 整数
  const whole = Math.floor(n / d);
  const remN = n - whole * d;
  const fracKey = `${remN}/${d}`;
  const fracSym = FRAC_SYMBOL[fracKey] ?? `${remN}/${d}`;
  return whole === 0 ? fracSym : `${whole}${fracSym}`;
}

// ── 工具函数 ─────────────────────────────────────────────────────
function nowTime(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
function nowDate(): string {
  return new Date().toISOString().split("T")[0];
}
function timeToISO(dateStr: string, timeStr: string): string {
  return new Date(`${dateStr}T${timeStr}:00`).toISOString();
}

// ── 共用 SVG 图标 ─────────────────────────────────────────────────
const IconArrowLeft = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 20, height: 20 }}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

// ── 通用卡片 ──────────────────────────────────────────────────────
function SectionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
      style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
      <div
        className="flex items-center justify-between px-4 pt-3.5 pb-2"
        style={{ borderBottom: "0.5px solid #F5EEF0" }}>
        <span className="text-[13px] font-bold text-[#7A5A60]">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── 步进器 ────────────────────────────────────────────────────────
function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 10,
  unit = "ml",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        className="flex items-center justify-center text-[22px] font-bold text-[#9A8090] bg-white border border-[#E5D8DA] rounded-full active:bg-pink-50"
        style={{ width: 36, height: 36 }}>
        −
      </button>
      <div className="flex-1 text-center">
        <span className="text-[28px] font-extrabold text-[#4A3035]">
          {value}
        </span>
        <span className="text-[12px] text-[#9A8090] ml-1">{unit}</span>
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        className="flex items-center justify-center text-[22px] font-bold text-[#9A8090] bg-white border border-[#E5D8DA] rounded-full active:bg-pink-50"
        style={{ width: 36, height: 36 }}>
        ＋
      </button>
    </div>
  );
}

// ── 奶量快捷选 ────────────────────────────────────────────────────
const AMOUNT_CHIPS = [60, 90, 120, 150, 180];

export default function FeedingFormPage() {
  const navigate = useNavigate();
  const { currentFamily, currentBaby } = useAppStore();

  const [tab, setTab] = useState<FeedTab>("formula");
  const [recordDate] = useState(nowDate());
  const [recordTime, setRecordTime] = useState(nowTime());

  // 奶粉 tab
  const [selectedMilkTypes, setSelectedMilkTypes] = useState<Set<MilkType>>(
    new Set(["aa"]),
  );
  const [scoops, setScoops] = useState<Record<MilkType, number>>({
    aa: 3,
    eh_lactose: 0,
    eh_no_lactose: 0,
    ph: 0,
    std: 0,
  });
  const [formulaMl, setFormulaMl] = useState(120);

  // 母乳 tab
  const [breastSide, setBreastSide] = useState<"left" | "right" | "both">(
    "left",
  );
  const [durationMin, setDurationMin] = useState(15);

  // 营养素 tab
  const [suppChecked, setSuppChecked] = useState<Record<string, boolean>>({});
  const [suppDose, setSuppDose] = useState<Record<string, string>>({});

  // 辅食 tab
  const [foodList, setFoodList] = useState<string[]>([]);
  const [foodInput, setFoodInput] = useState("");

  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const toggleMilkType = (key: MilkType) => {
    setSelectedMilkTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setScoops((s) => ({ ...s, [key]: 0 }));
      } else next.add(key);
      return next;
    });
  };

  const updateScoop = (key: MilkType, val: number) => {
    setScoops((prev) => ({ ...prev, [key]: Math.max(0, Math.min(20, val)) }));
  };

  const totalScoops = Object.values(scoops).reduce((a, b) => a + b, 0);

  const getRatioTip = () => {
    const active = milkTypeOptions.filter((m) => scoops[m.key] > 0);
    if (active.length === 0) return "请在上方调整各奶粉的勺数";
    const parts = active.map(
      (m) => `${m.label} ${formatScoop(scoops[m.key])}勺`,
    );
    const pcts = active.map(
      (m) => Math.round((scoops[m.key] / totalScoops) * 100) + "%",
    );
    return `当前配比：${parts.join(" + ")}（共 ${formatScoop(totalScoops)} 勺），比例 ${pcts.join(" : ")}`;
  };

  const addFood = () => {
    const t = foodInput.trim();
    if (!t) return;
    setFoodList((prev) => [...prev, t]);
    setFoodInput("");
  };
  const removeFood = (idx: number) =>
    setFoodList((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) {
      showToast("请先完成宝宝建档");
      return;
    }
    setSubmitting(true);
    try {
      const isoTime = timeToISO(recordDate, recordTime);
      if (tab === "formula") {
        const activeScoops = milkTypeOptions.filter(
          (m) => selectedMilkTypes.has(m.key) && scoops[m.key] > 0,
        );
        const milkNote = activeScoops
          .map((m) => `${m.label}${scoops[m.key]}勺`)
          .join("+");
        await recordsApi.feeding.create(currentFamily.id, {
          baby_id: currentBaby.id,
          feed_type: "formula",
          record_time: isoTime,
          formula_ml: formulaMl,
          note: [milkNote, note].filter(Boolean).join(" / ") || undefined,
        });
      } else if (tab === "breast") {
        await recordsApi.feeding.create(currentFamily.id, {
          baby_id: currentBaby.id,
          feed_type: "breast",
          record_time: isoTime,
          breast_side: breastSide,
          duration_min: durationMin,
          note: note || undefined,
        });
      } else if (tab === "food") {
        const foodStr = foodList.length > 0 ? foodList.join("、") : "辅食";
        await recordsApi.feeding.create(currentFamily.id, {
          baby_id: currentBaby.id,
          feed_type: "complementary",
          record_time: isoTime,
          complementary_food: foodStr,
          note: note || undefined,
        });
      } else {
        // 营养素 - 记录到备注
        const suppNote = suppItems
          .filter((s) => suppChecked[s.key])
          .map((s) => `${s.label}${suppDose[s.key] || ""}${s.unit}`)
          .join("、");
        await recordsApi.feeding.create(currentFamily.id, {
          baby_id: currentBaby.id,
          feed_type: "complementary",
          record_time: isoTime,
          complementary_food: "营养素",
          note: [suppNote, note].filter(Boolean).join(" / ") || undefined,
        });
      }
      showToast("✓ 饮食记录已保存");
      setTimeout(() => navigate("/"), 1400);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const tabs: { key: FeedTab; label: string }[] = [
    { key: "formula", label: "奶粉" },
    { key: "breast", label: "母乳" },
    { key: "supplement", label: "营养素" },
    { key: "food", label: "辅食" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#FAF5F6" }}>
      {/* 导航栏 */}
      <div
        className="flex items-center justify-between px-4 pt-12 pb-3 bg-white sticky top-0 z-20"
        style={{ boxShadow: "0 1px 0 #F5EEF0" }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-[#7A5A60] p-1 -ml-1">
          <IconArrowLeft />
        </button>
        <span className="text-[17px] font-bold text-[#4A3035]">饮食记录</span>
        <div className="w-8" />
      </div>

      <div className="pb-32">
        {/* Tab 选择 */}
        <div
          className="mx-4 mt-3 mb-3.5 flex gap-0 rounded-xl overflow-hidden p-[3px]"
          style={{ background: "#F0E8EA" }}>
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="flex-1 py-[9px] text-[13px] font-semibold rounded-[10px] transition-all"
              style={{
                background: tab === key ? "#fff" : "transparent",
                color: tab === key ? "#F87098" : "#9A8090",
                boxShadow: tab === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* 喂养时间（共用） */}
        <div
          className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
          <div className="px-4 py-3">
            <TimePicker
              value={recordTime}
              onChange={setRecordTime}
              label="喂养时间"
            />
          </div>
        </div>

        {/* ══ Tab: 奶粉 ══ */}
        {tab === "formula" && (
          <>
            {/* 奶粉类型（多选） */}
            <div className="px-4 mb-1">
              <div className="text-[12px] font-semibold text-[#9A8090] mb-2">
                奶粉类型{" "}
                <span className="font-normal">
                  （可多选，混用时分别填写勺数）
                </span>
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
                      onClick={() => toggleMilkType(key)}
                      className={`relative py-2.5 px-3 rounded-xl border text-left transition-all active:scale-95${isLast ? " col-span-2" : ""}`}
                      style={{
                        borderColor: isSelected ? color : "#E5D8DA",
                        background: isSelected ? color + "15" : "#fff",
                      }}>
                      {/* 多选角标 — 垂直居中 */}
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
                      <div className="text-[11px] text-[#9A8090] mt-0.5">
                        {desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 配比记录 */}
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
                          style={{
                            background: "#FAF5F6",
                            borderColor: "#F0E8EA",
                          }}>
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
                                updateScoop(m.key, stepDown(scoops[m.key]))
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
                                updateScoop(m.key, stepUp(scoops[m.key]))
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

            {/* 奶量 */}
            <div className="px-4 mb-1">
              <span className="text-[12px] font-semibold text-[#9A8090]">
                奶量
              </span>
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
                    onClick={() => setFormulaMl(amt)}
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
                onChange={setFormulaMl}
                step={10}
                min={10}
                max={400}
                unit="ml"
              />
            </div>
          </>
        )}

        {/* ══ Tab: 母乳 ══ */}
        {tab === "breast" && (
          <>
            {/* 哺乳侧 */}
            <div className="px-4 mb-1">
              <span className="text-[12px] font-semibold text-[#9A8090]">
                哺乳侧
              </span>
            </div>
            <div
              className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
              style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
              <div className="flex gap-2.5 p-3">
                {(
                  [
                    { key: "left", label: "左侧", icon: "←" },
                    { key: "right", label: "右侧", icon: "→" },
                    { key: "both", label: "双侧", icon: "↔" },
                  ] as const
                ).map(({ key, label, icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setBreastSide(key)}
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

            {/* 时长 */}
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
                onChange={setDurationMin}
                step={5}
                min={1}
                max={60}
                unit="分钟"
              />
            </div>
          </>
        )}

        {/* ══ Tab: 营养素 ══ */}
        {tab === "supplement" && (
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
                      idx < suppItems.length - 1
                        ? "0.5px solid #F5EEF0"
                        : "none",
                  }}>
                  <button
                    type="button"
                    onClick={() =>
                      setSuppChecked((p) => ({ ...p, [s.key]: !p[s.key] }))
                    }
                    className="w-5 h-5 rounded-[6px] border-2 flex items-center justify-center flex-shrink-0 transition-all"
                    style={{
                      borderColor: suppChecked[s.key] ? "#F87098" : "#D0C0C4",
                      background: suppChecked[s.key] ? "#F87098" : "#fff",
                    }}>
                    {suppChecked[s.key] && (
                      <span className="text-white text-[11px] font-bold leading-none">
                        ✓
                      </span>
                    )}
                  </button>
                  <span className="text-[14px] font-medium text-[#4A3035] flex-1">
                    {s.label}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="剂量"
                    value={suppDose[s.key] || ""}
                    onChange={(e) =>
                      setSuppDose((p) => ({
                        ...p,
                        [s.key]: e.target.value.replace(/[^0-9.]/g, ""),
                      }))
                    }
                    className="w-16 text-center text-[13px] text-[#4A3035] bg-[#FAF5F6] rounded-lg border outline-none"
                    style={{ borderColor: "#E5D8DA", padding: "5px 6px" }}
                  />
                  <span className="text-[12px] text-[#9A8090] w-5">
                    {s.unit}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ══ Tab: 辅食 ══ */}
        {tab === "food" && (
          <>
            <div className="px-4 mb-1">
              <span className="text-[12px] font-semibold text-[#9A8090]">
                辅食记录
              </span>
            </div>
            <div
              className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
              style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
              {foodList.map((food, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2.5 px-4 py-3"
                  style={{ borderBottom: "0.5px solid #F5EEF0" }}>
                  <span className="flex-1 text-[14px] font-medium text-[#4A3035]">
                    {food}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFood(idx)}
                    className="w-5 h-5 rounded-full bg-[#F05060] text-white flex items-center justify-center text-[14px] font-bold flex-shrink-0">
                    ×
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2 px-4 py-3">
                <input
                  type="text"
                  value={foodInput}
                  onChange={(e) => setFoodInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addFood()}
                  placeholder="添加辅食名称，如：南瓜泥"
                  className="flex-1 text-[13px] text-[#4A3035] outline-none"
                  style={{ background: "transparent" }}
                />
                <button
                  type="button"
                  onClick={addFood}
                  className="text-[22px] font-light text-[#F87098]">
                  ＋
                </button>
              </div>
            </div>
          </>
        )}

        {/* 备注（共用） */}
        <div
          className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
          <div className="px-4 pt-3 pb-1">
            <span className="text-[12px] font-semibold text-[#9A8090]">
              备注（可选）
            </span>
          </div>
          <div className="px-4 pb-3">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="如宝宝状态、品牌等…"
              rows={2}
              className="w-full text-[13px] text-[#4A3035] resize-none outline-none"
              style={{ background: "transparent" }}
            />
          </div>
        </div>
      </div>

      {/* 底部按钮 */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-white px-5 pt-3 pb-8"
        style={{ boxShadow: "0 -1px 0 #F5EEF0" }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-4 rounded-full text-white text-[16px] font-bold transition-opacity"
          style={{ background: submitting ? "#F9A8C0" : "#F87098" }}>
          {submitting ? "保存中…" : "保存记录"}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-[#4A3035] text-white text-sm px-5 py-2.5 rounded-full z-50 whitespace-nowrap shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
