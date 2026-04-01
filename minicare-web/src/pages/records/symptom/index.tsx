/**
 * 表现记录表单页
 * UI 对齐 ui-draft/form-symptom.html
 * API: POST /api/family/:familyId/records/symptom
 *
 * 字段：baby_id, record_time, symptoms, spirit, mood
 * spirit（精神）和 mood（心情）直接存入各自专用字段（DDL 有对应列）
 * symptoms JSON 必传（当前以 type=6 占位）
 *
 * 编辑模式：通过 location.state.record 携带原始记录数据，回填表单，保存时调用 update API
 */
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { recordsApi } from "@/api";
import type { SymptomRecord, MoodLevel, SpiritLevel } from "@/api/types";
import TimePicker from "@/components/TimePicker";

import { NavBar, SectionLabel, FormSection, SubmitBar, useToastMsg, ToastMessage, nowTime, nowDate, timeToISO } from "../shared";
import MoodSection from "./MoodSection";
import SpiritSection from "./SpiritSection";

const PRIMARY = "#F87098";

/** 从 ISO 时间提取本地 HH:mm */
function isoToLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

/**
 * 前端 MoodSection 的值（happy/normal/sad）→ 后端 MoodLevel (happy/neutral/fussy/crying)
 * 由于 MoodSection 组件使用 happy/normal/sad，这里做一个映射
 * 注意：后端的 neutral/fussy/crying 在编辑时显示为对应的前端值
 */
function toBackendMood(frontendMood: string): MoodLevel {
  const map: Record<string, MoodLevel> = {
    happy: "happy",
    normal: "neutral",
    sad: "fussy",   // 低落 → 烦躁（最接近）
    // 已存储的后端值也透传
    neutral: "neutral",
    fussy: "fussy",
    crying: "crying",
  };
  return map[frontendMood] ?? "neutral";
}

function toFrontendMood(backendMood: MoodLevel): string {
  const map: Record<MoodLevel, string> = {
    happy: "happy",
    neutral: "normal",
    fussy: "sad",
    crying: "sad",
  };
  return map[backendMood] ?? "normal";
}

/**
 * 前端 SpiritSection 的值（calm/normal/active/sleepy）→ 后端 SpiritLevel (active/normal/tired/lethargic)
 */
function toBackendSpirit(frontendSpirit: string): SpiritLevel {
  const map: Record<string, SpiritLevel> = {
    calm: "normal",
    normal: "normal",
    active: "active",
    sleepy: "tired",
    // 已存储的后端值也透传
    tired: "tired",
    lethargic: "lethargic",
  };
  return map[frontendSpirit] ?? "normal";
}

function toFrontendSpirit(backendSpirit: SpiritLevel): string {
  const map: Record<SpiritLevel, string> = {
    active: "active",
    normal: "normal",
    tired: "sleepy",
    lethargic: "sleepy",
  };
  return map[backendSpirit] ?? "normal";
}

export default function SymptomFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentFamily, currentBaby } = useAppStore();
  const { toast, showToast } = useToastMsg();

  // 编辑模式：从路由 state 中读取原始记录
  const editRecord = location.state?.record as SymptomRecord | undefined;
  const isEditMode = Boolean(editRecord);

  const [recordDate] = useState(nowDate());
  const [recordTime, setRecordTime] = useState(() => {
    if (editRecord?.record_time) return isoToLocalTime(editRecord.record_time);
    return nowTime();
  });
  // 使用前端枚举值，提交时转换为后端值
  const [mood, setMood] = useState<string>(() => {
    if (editRecord?.mood) return toFrontendMood(editRecord.mood);
    return "happy";
  });
  const [spirit, setSpirit] = useState<string>(() => {
    if (editRecord?.spirit) return toFrontendSpirit(editRecord.spirit);
    return "normal";
  });
  const [note, setNote] = useState(editRecord?.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(isEditMode);
  // 编辑时保存最新的 symptoms（更新时需要此字段）
  const [latestSymptoms, setLatestSymptoms] = useState(editRecord?.symptoms ?? []);

  /** 编辑模式下：进入页面时重新查询后端获取最新数据并回填 */
  useEffect(() => {
    if (!isEditMode || !editRecord || !currentFamily) return;
    recordsApi.symptom.getOne(currentFamily.id, editRecord.id)
      .then((fresh) => {
        if (!fresh) return;
        if (fresh.record_time) setRecordTime(isoToLocalTime(fresh.record_time));
        if (fresh.mood) setMood(toFrontendMood(fresh.mood));
        if (fresh.spirit) setSpirit(toFrontendSpirit(fresh.spirit));
        setNote(fresh.note ?? '');
        if (fresh.symptoms) setLatestSymptoms(fresh.symptoms);
      })
      .catch(() => { /* 查询失败保留快照数据 */ })
      .finally(() => setLoadingRecord(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) {
      showToast("请先完成宝宝建档");
      return;
    }
    setSubmitting(true);
    try {
      const backendMood = toBackendMood(mood);
      const backendSpirit = toBackendSpirit(spirit);

      if (isEditMode && editRecord) {
        await recordsApi.symptom.update(currentFamily.id, editRecord.id, {
          record_time: timeToISO(recordDate, recordTime),
          symptoms: latestSymptoms, // 使用最新查询到的症状列表
          spirit: backendSpirit,
          mood: backendMood,
          note: note || undefined,
        });
      } else {
        await recordsApi.symptom.create(currentFamily.id, {
          baby_id: currentBaby.id,
          record_time: timeToISO(recordDate, recordTime),
          symptoms: [{ type: 6, severity: 1 }],
          spirit: backendSpirit,
          mood: backendMood,
          note: note || undefined,
        });
      }

      showToast(isEditMode ? "✓ 表现记录已更新" : "✓ 表现记录已保存");
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
      await recordsApi.symptom.remove(currentFamily.id, editRecord.id);
      showToast("✓ 记录已删除");
      setTimeout(() => navigate(-1), 1200);
    } catch {
      showToast("删除失败，请重试");
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#FAF5F6" }}>
      <NavBar
        title={isEditMode ? "编辑表现记录" : "表现记录"}
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
        {/* ── 记录时间 ── */}
        <SectionLabel label="记录时间" />
        <FormSection>
          <div className="px-4 py-3">
            <TimePicker value={recordTime} onChange={setRecordTime} label="记录时间" />
          </div>
        </FormSection>

        {/* ── 心情状态 ── */}
        <MoodSection value={mood} onChange={setMood} />

        {/* ── 精神状态 ── */}
        <SpiritSection value={spirit} onChange={setSpirit} />

        {/* ── 备注 ── */}
        <SectionLabel label="备注（可选）" />
        <FormSection>
          <div className="px-4 py-3">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="其他观察或备注…"
              className="w-full text-[13px] text-[#4A3035] outline-none"
              style={{ background: "transparent" }}
            />
          </div>
        </FormSection>
      </div>

      <SubmitBar
        label={isEditMode ? "更新记录" : "保存记录"}
        submitting={submitting}
        onClick={handleSubmit}
        onDelete={isEditMode ? handleDelete : undefined}
      />

      <ToastMessage toast={toast} />
    </div>
  );
}