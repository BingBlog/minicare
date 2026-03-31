/**
 * 饮食记录表单页（入口）
 *
 * UI 对齐 ui-draft/form-feeding.html
 * API: POST /api/family/:familyId/records/feeding
 *
 * 子组件：
 *  - TabSelector      四 Tab 切换（奶粉 / 母乳 / 营养素 / 辅食）
 *  - FormulaSection   奶粉 Tab：类型多选 + 勺数配比 + 奶量
 *  - BreastSection    母乳 Tab：哺乳侧 + 时长
 *  - SupplementSection 营养素 Tab：多项勾选 + 剂量输入
 *  - FoodSection      辅食 Tab：列表新增 / 删除
 *
 * 所有状态统一在此页管理，通过 Props 传递给子组件（State Lifting 模式）
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { recordsApi } from "@/api";
import TimePicker from "@/components/TimePicker";

import type { FeedTab, MilkType } from "./types";
import { milkTypeOptions, suppItems } from "./types";
import TabSelector from "./TabSelector";
import FormulaSection from "./FormulaSection";
import BreastSection from "./BreastSection";
import SupplementSection from "./SupplementSection";
import FoodSection from "./FoodSection";
import {
  NavBar,
  TimeCard,
  NoteCard,
  SubmitBar,
  ToastMessage,
  nowTime,
  nowDate,
  timeToISO,
  useToastMsg,
} from "../shared";

export default function FeedingFormPage() {
  const navigate = useNavigate();
  const { currentFamily, currentBaby } = useAppStore();
  const { toast, showToast } = useToastMsg();

  // ── Tab ─────────────────────────────────────────────────────────
  const [tab, setTab] = useState<FeedTab>("formula");

  // ── 公共 ─────────────────────────────────────────────────────────
  const [recordDate] = useState(nowDate());
  const [recordTime, setRecordTime] = useState(nowTime());
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── 奶粉 Tab 状态 ──────────────────────────────────────────────
  const [selectedMilkTypes, setSelectedMilkTypes] = useState<Set<MilkType>>(
    new Set(["aa"])
  );
  const [scoops, setScoops] = useState<Record<MilkType, number>>({
    aa: 3,
    eh_lactose: 0,
    eh_no_lactose: 0,
    ph: 0,
    std: 0,
  });
  const [formulaMl, setFormulaMl] = useState(120);

  /** 切换奶粉类型选中状态（取消时勺数归零） */
  const toggleMilkType = (key: MilkType) => {
    setSelectedMilkTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setScoops((s) => ({ ...s, [key]: 0 }));
      } else {
        next.add(key);
      }
      return next;
    });
  };

  /** 更新某奶粉勺数（限制在 0 ~ 20） */
  const updateScoop = (key: MilkType, val: number) => {
    setScoops((prev) => ({
      ...prev,
      [key]: Math.max(0, Math.min(20, val)),
    }));
  };

  // ── 母乳 Tab 状态 ──────────────────────────────────────────────
  const [breastSide, setBreastSide] = useState<"left" | "right" | "both">(
    "left"
  );
  const [durationMin, setDurationMin] = useState(15);

  // ── 营养素 Tab 状态 ────────────────────────────────────────────
  const [suppChecked, setSuppChecked] = useState<Record<string, boolean>>({});
  const [suppDose, setSuppDose] = useState<Record<string, string>>({});

  /** 切换营养素勾选 */
  const toggleSupp = (key: string) => {
    setSuppChecked((p) => ({ ...p, [key]: !p[key] }));
  };
  /** 更新营养素剂量 */
  const updateSuppDose = (key: string, val: string) => {
    setSuppDose((p) => ({ ...p, [key]: val }));
  };

  // ── 辅食 Tab 状态 ──────────────────────────────────────────────
  const [foodList, setFoodList] = useState<string[]>([]);
  const [foodInput, setFoodInput] = useState("");

  const addFood = () => {
    const t = foodInput.trim();
    if (!t) return;
    setFoodList((prev) => [...prev, t]);
    setFoodInput("");
  };
  const removeFood = (idx: number) =>
    setFoodList((prev) => prev.filter((_, i) => i !== idx));

  // ── 提交 ────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) {
      showToast("请先完成宝宝建档");
      return;
    }
    setSubmitting(true);
    try {
      const isoTime = timeToISO(recordDate, recordTime);

      if (tab === "formula") {
        // 奶粉：勺数信息拼入备注
        const activeScoops = milkTypeOptions.filter(
          (m) => selectedMilkTypes.has(m.key) && scoops[m.key] > 0
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
        // 营养素：写入 complementary_food = "营养素"，详情拼入 note
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

  return (
    <div className="min-h-screen" style={{ background: "#FAF5F6" }}>
      {/* 导航栏 */}
      <NavBar title="饮食记录" onBack={() => navigate(-1)} />

      <div className="pb-32">
        {/* Tab 切换 */}
        <TabSelector value={tab} onChange={setTab} />

        {/* 喂养时间（所有 Tab 共用） */}
        <TimeCard>
          <TimePicker
            value={recordTime}
            onChange={setRecordTime}
            label="喂养时间"
          />
        </TimeCard>

        {/* 奶粉 Tab */}
        {tab === "formula" && (
          <FormulaSection
            selectedMilkTypes={selectedMilkTypes}
            onToggleMilkType={toggleMilkType}
            scoops={scoops}
            onUpdateScoop={updateScoop}
            formulaMl={formulaMl}
            onChangeFormulaMl={setFormulaMl}
          />
        )}

        {/* 母乳 Tab */}
        {tab === "breast" && (
          <BreastSection
            breastSide={breastSide}
            onChangeSide={setBreastSide}
            durationMin={durationMin}
            onChangeDuration={setDurationMin}
          />
        )}

        {/* 营养素 Tab */}
        {tab === "supplement" && (
          <SupplementSection
            checked={suppChecked}
            dose={suppDose}
            onToggle={toggleSupp}
            onDoseChange={updateSuppDose}
          />
        )}

        {/* 辅食 Tab */}
        {tab === "food" && (
          <FoodSection
            foodList={foodList}
            inputValue={foodInput}
            onInputChange={setFoodInput}
            onAdd={addFood}
            onRemove={removeFood}
          />
        )}

        {/* 备注（所有 Tab 共用） */}
        <NoteCard
          value={note}
          onChange={setNote}
          placeholder="如宝宝状态、品牌等…"
        />
      </div>

      {/* 底部按钮 */}
      <SubmitBar onClick={handleSubmit} submitting={submitting} />

      {/* Toast */}
      <ToastMessage toast={toast} />
    </div>
  );
}
