/**
 * 尿布记录表单页（入口）
 *
 * UI 对齐 ui-draft/form-diaper.html
 * API: POST /api/family/:familyId/records/diaper
 *
 * 子组件：
 *  - DiaperTypeSection  换尿布类型 Chip + 今日次数
 *  - PoopSection        大便性状（条件显示：含"大便"/"都有"时展示）
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { recordsApi } from "@/api";
import TimePicker from "@/components/TimePicker";

import DiaperTypeSection from "./DiaperTypeSection";
import PoopSection from "./PoopSection";
import {
  NavBar,
  SectionLabel,
  TimeCard,
  NoteCard,
  SubmitBar,
  ToastMessage,
  nowTime,
  nowDate,
  timeToISO,
  useToastMsg,
} from "../shared";

type DiaperChip = "wet" | "dirty" | "mixed" | "dry";

/** 大便性状（供 note 序列化） */
const POOP_ITEMS = [
  { key: "normal_soft", label: "正常软便" },
  { key: "loose", label: "稀便" },
  { key: "watery", label: "水样便" },
  { key: "hard", label: "干硬粒" },
  { key: "bloody", label: "血丝便" },
  { key: "normal_form", label: "正常成形" },
];

/** 颜色 Chip（供 note 序列化） */
const COLOR_CHIPS = [
  { key: "yellow", label: "黄色" },
  { key: "brown_yellow", label: "棕黄" },
  { key: "green", label: "绿色" },
];

export default function DiaperFormPage() {
  const navigate = useNavigate();
  const { currentFamily, currentBaby } = useAppStore();
  const { toast, showToast } = useToastMsg();

  const [recordDate] = useState(nowDate());
  const [recordTime, setRecordTime] = useState(nowTime());

  // 尿布类型 Chip 多选
  const [diaperChips, setDiaperChips] = useState<Set<DiaperChip>>(
    new Set(["wet"])
  );
  // 今日次数
  const [diaperCount, setDiaperCount] = useState(3);
  // 大便性状（单选，null = 未选）
  const [poopType, setPoopType] = useState<string | null>(null);
  // 颜色 Chip 多选
  const [colorSelected, setColorSelected] = useState<Set<string>>(new Set());

  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 当选中含"大便"/"都有"时，显示大便性状卡片
  const showPoop =
    diaperChips.has("dirty") || diaperChips.has("mixed");

  const toggleDiaperChip = (key: DiaperChip) => {
    setDiaperChips((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleColor = (key: string) => {
    setColorSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  /**
   * 从多选 Chip 推断主类型（API 只支持单值）
   * 规则：mixed / (dirty+wet) → mixed；dirty → dirty；dry → dry；其余 → wet
   */
  const inferDiaperType = (): "wet" | "dirty" | "mixed" | "dry" => {
    const hasDirty = diaperChips.has("dirty");
    const hasWet = diaperChips.has("wet");
    if (diaperChips.has("mixed") || (hasDirty && hasWet)) return "mixed";
    if (hasDirty) return "dirty";
    if (diaperChips.has("dry")) return "dry";
    return "wet";
  };

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) {
      showToast("请先完成宝宝建档");
      return;
    }
    setSubmitting(true);
    try {
      const noteArr: string[] = [];
      if (poopType) {
        const p = POOP_ITEMS.find((x) => x.key === poopType);
        if (p) noteArr.push("性状：" + p.label);
      }
      if (colorSelected.size > 0) {
        noteArr.push(
          "颜色：" +
            [...colorSelected]
              .map((c) => COLOR_CHIPS.find((x) => x.key === c)?.label)
              .join("、")
        );
      }
      if (diaperCount !== 3) noteArr.push(`今日次数：${diaperCount}次`);
      if (note) noteArr.push(note);

      await recordsApi.diaper.create(currentFamily.id, {
        baby_id: currentBaby.id,
        diaper_type: inferDiaperType(),
        record_time: timeToISO(recordDate, recordTime),
        note: noteArr.join(" / ") || undefined,
      });
      showToast("✓ 尿布记录已保存");
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
      <NavBar title="尿布记录" onBack={() => navigate(-1)} />

      <div className="pb-32">
        {/* 记录时间 */}
        <SectionLabel label="记录时间" />
        <TimeCard>
          <TimePicker
            value={recordTime}
            onChange={setRecordTime}
            label="记录时间"
          />
        </TimeCard>

        {/* 换尿布类型 + 今日次数 */}
        <DiaperTypeSection
          selected={diaperChips}
          onToggle={toggleDiaperChip}
          count={diaperCount}
          onCountChange={setDiaperCount}
        />

        {/* 大便性状（条件显示） */}
        {showPoop && (
          <PoopSection
            poopType={poopType}
            onPoopTypeChange={setPoopType}
            colorSelected={colorSelected}
            onToggleColor={toggleColor}
          />
        )}

        {/* 备注 */}
        <NoteCard
          value={note}
          onChange={setNote}
          placeholder="其他观察或备注…"
        />
      </div>

      {/* 底部按钮 */}
      <SubmitBar
        onClick={handleSubmit}
        submitting={submitting}
        color="#4CAF82"
        disabledColor="#A8D8B0"
      />

      <ToastMessage toast={toast} />
    </div>
  );
}
