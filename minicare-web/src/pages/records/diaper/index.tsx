/**
 * 尿布记录表单页（入口）
 *
 * UI 对齐 ui-draft/form-diaper.html
 * API: POST /api/family/:familyId/records/diaper
 *
 * 子组件：
 *  - DiaperTypeSection  换尿布类型 Chip + 今日次数
 *  - PoopSection        大便性状（条件显示：含"大便"/"都有"时展示）
 *
 * 编辑模式：通过 location.state.record 携带原始记录数据，回填表单，保存时调用 update API
 */
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { recordsApi } from "@/api";
import type { DiaperRecord } from "@/api/types";
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

/** 从 ISO 时间提取本地 HH:mm */
function isoToLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export default function DiaperFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentFamily, currentBaby } = useAppStore();
  const { toast, showToast } = useToastMsg();

  // 编辑模式：从路由 state 中读取原始记录
  const editRecord = location.state?.record as DiaperRecord | undefined;
  const isEditMode = Boolean(editRecord);

  const [recordDate] = useState(nowDate());
  const [recordTime, setRecordTime] = useState(() => {
    if (editRecord?.record_time) return isoToLocalTime(editRecord.record_time);
    return nowTime();
  });

  // 尿布类型 Chip 单选（从编辑记录恢复）
  const [diaperType, setDiaperType] = useState<DiaperChip>(() => {
    if (editRecord?.diaper_type) return editRecord.diaper_type as DiaperChip;
    return "wet";
  });

  // 今日次数
  const [diaperCount, setDiaperCount] = useState(editRecord?.diaper_count ?? 3);

  // 大便性状（单选，null = 未选）
  const [poopType, setPoopType] = useState<string | null>(editRecord?.poop_type ?? null);

  // 颜色 Chip 多选（从编辑记录恢复，存储的颜色可能是多个用逗号分隔）
  const [colorSelected, setColorSelected] = useState<Set<string>>(() => {
    if (editRecord?.color) {
      return new Set(editRecord.color.split(",").map((c) => c.trim()).filter(Boolean));
    }
    return new Set();
  });

  const [note, setNote] = useState(editRecord?.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(isEditMode);

  /** 编辑模式下：进入页面时重新查询后端获取最新数据并回填 */
  useEffect(() => {
    if (!isEditMode || !editRecord || !currentFamily) return;
    recordsApi.diaper.getOne(currentFamily.id, editRecord.id)
      .then((fresh) => {
        if (!fresh) return;
        if (fresh.record_time) setRecordTime(isoToLocalTime(fresh.record_time));
        if (fresh.diaper_type) setDiaperType(fresh.diaper_type as DiaperChip);
        if (fresh.diaper_count != null) setDiaperCount(fresh.diaper_count);
        setPoopType(fresh.poop_type ?? null);
        if (fresh.color) setColorSelected(new Set(fresh.color.split(',').map((c) => c.trim()).filter(Boolean)));
        setNote(fresh.note ?? '');
      })
      .catch(() => { /* 查询失败保留快照数据 */ })
      .finally(() => setLoadingRecord(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 当选中"大便"/"都有"时，显示大便性状卡片
  const showPoop = diaperType === "dirty" || diaperType === "mixed";

  const toggleColor = (key: string) => {
    setColorSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) {
      showToast("请先完成宝宝建档");
      return;
    }
    setSubmitting(true);
    try {
      // 颜色：多选用逗号分隔存储
      const colorStr = colorSelected.size > 0 ? [...colorSelected].join(",") : undefined;

      const payload = {
        baby_id: currentBaby.id,
        diaper_type: diaperType,
        record_time: timeToISO(recordDate, recordTime),
        color: colorStr,
        poop_type: (showPoop && poopType ? poopType : undefined) as DiaperRecord["poop_type"],
        diaper_count: diaperCount !== 3 ? diaperCount : undefined,
        note: note || undefined,
      };

      if (isEditMode && editRecord) {
        const { baby_id: _b, ...updatePayload } = payload;
        await recordsApi.diaper.update(currentFamily.id, editRecord.id, updatePayload);
      } else {
        await recordsApi.diaper.create(currentFamily.id, payload);
      }

      showToast(isEditMode ? "✓ 尿布记录已更新" : "✓ 尿布记录已保存");
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
      await recordsApi.diaper.remove(currentFamily.id, editRecord.id);
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
        title={isEditMode ? "编辑尿布记录" : "尿布记录"}
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
          selected={diaperType}
          onSelect={setDiaperType}
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
        label={isEditMode ? "更新记录" : "保存记录"}
        color="#4CAF82"
        disabledColor="#A8D8B0"
        onDelete={isEditMode ? handleDelete : undefined}
      />

      <ToastMessage toast={toast} />
    </div>
  );
}