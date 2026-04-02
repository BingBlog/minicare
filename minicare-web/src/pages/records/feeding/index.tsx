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
 *
 * 编辑模式：通过 location.state.record 携带原始记录数据，回填表单，保存时调用 update API
 */
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { recordsApi } from "@/api";
import type { FeedingRecord } from "@/api/types";
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

/** 从 ISO 时间提取本地 HH:mm */
function isoToLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

/** 从已有记录初始化表单状态 */
function initFromRecord(record: FeedingRecord) {
  const feedType = record.feed_type;
  let tab: FeedTab = "formula";
  if (feedType === "breast") tab = "breast";
  else if (feedType === "complementary") {
    if (record.complementary_food === "营养素") tab = "supplement";
    else tab = "food";
  }
  return { tab, feedType };
}

export default function FeedingFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentFamily, currentBaby } = useAppStore();
  const { toast, showToast } = useToastMsg();

  // 编辑模式：从路由 state 中读取原始记录
  const editRecord = location.state?.record as FeedingRecord | undefined;
  const isEditMode = Boolean(editRecord);

  // ── Tab ─────────────────────────────────────────────────────────
  const [tab, setTab] = useState<FeedTab>(() => {
    if (!editRecord) return "formula";
    return initFromRecord(editRecord).tab;
  });

  // ── 公共 ─────────────────────────────────────────────────────────
  const [recordDate] = useState(nowDate());
  const [recordTime, setRecordTime] = useState(() => {
    if (editRecord?.record_time) return isoToLocalTime(editRecord.record_time);
    return nowTime();
  });
  const [note, setNote] = useState(editRecord?.note ?? "");
  const [submitting, setSubmitting] = useState(false);

  // ── 奶粉 Tab 状态 ──────────────────────────────────────────────
  const [selectedMilkTypes, setSelectedMilkTypes] = useState<Set<MilkType>>(() => {
    if (editRecord?.milk_types && editRecord.milk_types.length > 0) {
      return new Set(editRecord.milk_types as MilkType[]);
    }
    return new Set(["aa"] as MilkType[]);
  });
  const [scoops, setScoops] = useState<Record<MilkType, number>>(() => {
    const defaults = { aa: 3, eh_lactose: 0, eh_no_lactose: 0, ph: 0, std: 0 };
    if (editRecord?.milk_scoops) {
      return { ...defaults, ...(editRecord.milk_scoops as Record<MilkType, number>) };
    }
    return defaults;
  });
  const [formulaMl, setFormulaMl] = useState(editRecord?.formula_ml ?? 120);

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
    (editRecord?.breast_side as "left" | "right" | "both") ?? "left"
  );
  const [durationMin, setDurationMin] = useState(editRecord?.duration_min ?? 15);

  // ── 营养素 Tab 状态 ────────────────────────────────────────────
  const [suppChecked, setSuppChecked] = useState<Record<string, boolean>>(() => {
    if (!editRecord?.supplement_items) return {};
    const checked: Record<string, boolean> = {};
    for (const item of editRecord.supplement_items) {
      if (item.key) checked[item.key] = true;
    }
    return checked;
  });
  const [suppDose, setSuppDose] = useState<Record<string, string>>(() => {
    if (!editRecord?.supplement_items) return {};
    const dose: Record<string, string> = {};
    for (const item of editRecord.supplement_items) {
      if (item.key && item.dose) dose[item.key] = item.dose;
    }
    return dose;
  });

  // ── 营养素「其他」自由输入状态 ─────────────────────
  const [suppOtherName, setSuppOtherName] = useState<string>(() => {
    const other = editRecord?.supplement_items?.find((i) => i.key === "other");
    return other?.label ?? "";
  });
  const [suppOtherDose, setSuppOtherDose] = useState<string>(() => {
    const other = editRecord?.supplement_items?.find((i) => i.key === "other");
    return other?.dose ?? "";
  });
  const [suppOtherUnit, setSuppOtherUnit] = useState<string>(() => {
    const other = editRecord?.supplement_items?.find((i) => i.key === "other");
    return other?.unit ?? "";
  });

  /** 切换营养素勾选 */
  const toggleSupp = (key: string) => {
    setSuppChecked((p) => ({ ...p, [key]: !p[key] }));
  };
  /** 更新营养素剂量 */
  const updateSuppDose = (key: string, val: string) => {
    setSuppDose((p) => ({ ...p, [key]: val }));
  };

  const [loadingRecord, setLoadingRecord] = useState(isEditMode);

  /** 编辑模式下：进入页面时重新查询后端获取最新数据并回填 */
  useEffect(() => {
    if (!isEditMode || !editRecord || !currentFamily) return;
    recordsApi.feeding.getOne(currentFamily.id, editRecord.id)
      .then((fresh) => {
        if (!fresh) return;
        if (fresh.record_time) setRecordTime(isoToLocalTime(fresh.record_time));
        // 根据 feed_type 切换 Tab 并回填对应字段
        const { tab: freshTab } = initFromRecord(fresh);
        setTab(freshTab);
        if (fresh.formula_ml != null) setFormulaMl(fresh.formula_ml);
        if (fresh.milk_types && fresh.milk_types.length > 0) {
          setSelectedMilkTypes(new Set(fresh.milk_types as MilkType[]));
        }
        if (fresh.milk_scoops) {
          setScoops((prev) => ({ ...prev, ...(fresh.milk_scoops as Record<MilkType, number>) }));
        }
        if (fresh.breast_side) setBreastSide(fresh.breast_side as 'left' | 'right' | 'both');
        if (fresh.duration_min != null) setDurationMin(fresh.duration_min);
        if (fresh.supplement_items && fresh.supplement_items.length > 0) {
          const newChecked: Record<string, boolean> = {};
          const newDose: Record<string, string> = {};
          for (const item of fresh.supplement_items) {
            if (item.key && item.key !== "other") {
              newChecked[item.key] = true;
              if (item.dose) newDose[item.key] = item.dose;
            }
          }
          setSuppChecked(newChecked);
          setSuppDose(newDose);
          // 回填「其他」行
          const otherItem = fresh.supplement_items.find((i) => i.key === "other");
          if (otherItem) {
            setSuppOtherName(otherItem.label ?? "");
            setSuppOtherDose(otherItem.dose ?? "");
            setSuppOtherUnit(otherItem.unit ?? "");
          }
        }
        if (fresh.complementary_food && fresh.complementary_food !== '营养素') {
          setFoodList(fresh.complementary_food.split('、').filter(Boolean));
        }
        setNote(fresh.note ?? '');
      })
      .catch(() => { /* 查询失败保留快照数据 */ })
      .finally(() => setLoadingRecord(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 辅食 Tab 状态 ──────────────────────────────────────────────
  const [foodList, setFoodList] = useState<string[]>(() => {
    if (editRecord?.complementary_food && editRecord.complementary_food !== "营养素") {
      return editRecord.complementary_food.split("、").filter(Boolean);
    }
    return [];
  });
  const [foodInput, setFoodInput] = useState("");

  const addFood = () => {
    const t = foodInput.trim();
    if (!t) return;
    setFoodList((prev) => [...prev, t]);
    setFoodInput("");
  };
  /** 直接添加辅食名称（快捷chip / 搜索下拉，不经过 inputValue 中转） */
  const directAddFood = (name: string) => {
    const t = name.trim();
    if (!t) return;
    setFoodList((prev) => (prev.includes(t) ? prev : [...prev, t]));
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
        // 奶粉：将类型列表和勺数映射存入专用字段
        const activeMilkTypes = milkTypeOptions
          .filter((m) => selectedMilkTypes.has(m.key) && scoops[m.key] > 0)
          .map((m) => m.key);
        const activeScoops: Record<string, number> = {};
        activeMilkTypes.forEach((key) => {
          activeScoops[key] = scoops[key];
        });

        const payload = {
          baby_id: currentBaby.id,
          feed_type: "formula" as const,
          record_time: isoTime,
          formula_ml: formulaMl,
          milk_types: activeMilkTypes.length > 0 ? activeMilkTypes : undefined,
          milk_scoops: activeMilkTypes.length > 0 ? activeScoops : undefined,
          note: note || undefined,
        };

        if (isEditMode && editRecord) {
          const { baby_id: _b, ...updatePayload } = payload;
          await recordsApi.feeding.update(currentFamily.id, editRecord.id, updatePayload);
        } else {
          await recordsApi.feeding.create(currentFamily.id, payload);
        }
      } else if (tab === "breast") {
        const payload = {
          baby_id: currentBaby.id,
          feed_type: "breast" as const,
          record_time: isoTime,
          breast_side: breastSide,
          duration_min: durationMin,
          note: note || undefined,
        };

        if (isEditMode && editRecord) {
          const { baby_id: _b, ...updatePayload } = payload;
          await recordsApi.feeding.update(currentFamily.id, editRecord.id, updatePayload);
        } else {
          await recordsApi.feeding.create(currentFamily.id, payload);
        }
      } else if (tab === "food") {
        const foodStr = foodList.length > 0 ? foodList.join("、") : "辅食";
        const payload = {
          baby_id: currentBaby.id,
          feed_type: "complementary" as const,
          record_time: isoTime,
          complementary_food: foodStr,
          note: note || undefined,
        };

        if (isEditMode && editRecord) {
          const { baby_id: _b, ...updatePayload } = payload;
          await recordsApi.feeding.update(currentFamily.id, editRecord.id, updatePayload);
        } else {
          await recordsApi.feeding.create(currentFamily.id, payload);
        }
      } else {
        // 营养素：将明细列表存入 supplement_items 专用字段
        const activeSuppItems = suppItems
          .filter((s) => suppChecked[s.key])
          .map((s) => ({
            key: s.key,
            label: s.label,
            dose: suppDose[s.key] || "",
            unit: s.unit,
          }));
        // 合并「其他」自由输入项（名称不为空时才记录）
        if (suppOtherName.trim()) {
          activeSuppItems.push({
            key: "other",
            label: suppOtherName.trim(),
            dose: suppOtherDose || "",
            unit: suppOtherUnit || "",
          });
        }

        const payload = {
          baby_id: currentBaby.id,
          feed_type: "complementary" as const,
          record_time: isoTime,
          complementary_food: "营养素",
          supplement_items: activeSuppItems.length > 0 ? activeSuppItems : undefined,
          note: note || undefined,
        };

        if (isEditMode && editRecord) {
          const { baby_id: _b, ...updatePayload } = payload;
          await recordsApi.feeding.update(currentFamily.id, editRecord.id, updatePayload);
        } else {
          await recordsApi.feeding.create(currentFamily.id, payload);
        }
      }

      showToast(isEditMode ? "✓ 饮食记录已更新" : "✓ 饮食记录已保存");
      setTimeout(() => navigate(-1), 1400);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!currentFamily || !editRecord) return;
    try {
      await recordsApi.feeding.remove(currentFamily.id, editRecord.id);
      showToast("✓ 记录已删除");
      setTimeout(() => navigate(-1), 1200);
    } catch {
      showToast("删除失败，请重试");
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#FAF5F6" }}>
      {/* 导航栏 */}
      <NavBar
        title={isEditMode ? "编辑饮食记录" : "饮食记录"}
        onBack={() => navigate(-1)}
      />

      {/* 编辑模式加载数据提示 */}
      {loadingRecord && (
        <div className="flex items-center justify-center gap-2 py-2 text-[12px] text-[#9A8090]">
          <svg className="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          正在加载最新数据…
        </div>
      )}

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
            otherName={suppOtherName}
            onOtherNameChange={setSuppOtherName}
            otherDose={suppOtherDose}
            onOtherDoseChange={setSuppOtherDose}
            otherUnit={suppOtherUnit}
            onOtherUnitChange={setSuppOtherUnit}
          />
        )}

        {/* 辅食 Tab */}
        {tab === "food" && (
          <FoodSection
            foodList={foodList}
            inputValue={foodInput}
            onInputChange={setFoodInput}
            onAdd={addFood}
            onDirectAdd={directAddFood}
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
      <SubmitBar
        onClick={handleSubmit}
        submitting={submitting}
        label={isEditMode ? "更新记录" : "保存记录"}
        onDelete={isEditMode ? handleDelete : undefined}
      />

      {/* Toast */}
      <ToastMessage toast={toast} />
    </div>
  );
}