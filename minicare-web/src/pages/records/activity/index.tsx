/**
 * 活动记录表单页（入口）
 *
 * UI 对齐 ui-draft/form-activity.html
 * API: POST /api/family/:familyId/records/activity
 *
 * 子组件：
 *  - ActivityTypeSection  活动类型选择（横排卡片）
 *  - IntensitySection     活动强度（轻松 / 适中 / 活跃）
 *
 * 编辑模式：通过 location.state.record 携带原始记录数据，回填表单，保存时调用 update API
 */
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { recordsApi } from "@/api";
import type { ActivityRecord, ActivityIntensity } from "@/api/types";
import TimePicker from "@/components/TimePicker";

import ActivityTypeSection from "./ActivityTypeSection";
import IntensitySection from "./IntensitySection";
import {
  NavBar,
  SectionLabel,
  FormCard,
  TimeCard,
  NoteCard,
  SubmitBar,
  ToastMessage,
  nowTime,
  nowDate,
  timeToISO,
  useToastMsg,
} from "../shared";

type ActivityType = 'gross_motor' | 'fine_motor' | 'edu_play' | 'outdoor' | 'daily_care' | 'other';

/** 从 ISO 时间提取本地 HH:mm */
function isoToLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export default function ActivityFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentFamily, currentBaby } = useAppStore();
  const { toast, showToast } = useToastMsg();

  // 编辑模式：从路由 state 中读取原始记录
  const editRecord = location.state?.record as ActivityRecord | undefined;
  const isEditMode = Boolean(editRecord);

  const [recordDate] = useState(nowDate());
  const [recordTime, setRecordTime] = useState(() => {
    if (editRecord?.record_time) return isoToLocalTime(editRecord.record_time);
    return nowTime();
  });
  const [activityType, setActivityType] = useState<ActivityType>(
    (editRecord?.activity_type as ActivityType) ?? 'gross_motor'
  );
  const [intensity, setIntensity] = useState<ActivityIntensity>(
    editRecord?.intensity ?? "medium"
  );
  const [durationMin, setDurationMin] = useState(editRecord?.duration_min ?? 15);
  const [note, setNote] = useState(editRecord?.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(isEditMode);

  /** 编辑模式下：进入页面时重新查询后端获取最新数据并回填 */
  useEffect(() => {
    if (!isEditMode || !editRecord || !currentFamily) return;
    recordsApi.activity.getOne(currentFamily.id, editRecord.id)
      .then((fresh) => {
        if (!fresh) return;
        if (fresh.record_time) setRecordTime(isoToLocalTime(fresh.record_time));
        if (fresh.activity_type) setActivityType(fresh.activity_type as ActivityType);
        if (fresh.intensity) setIntensity(fresh.intensity as ActivityIntensity);
        if (fresh.duration_min != null) setDurationMin(fresh.duration_min);
        setNote(fresh.note ?? '');
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
      const payload = {
        baby_id: currentBaby.id,
        activity_type: activityType,
        record_time: timeToISO(recordDate, recordTime),
        duration_min: durationMin,
        intensity: intensity,
        note: note || undefined,
      };

      if (isEditMode && editRecord) {
        const { baby_id: _b, ...updatePayload } = payload;
        await recordsApi.activity.update(currentFamily.id, editRecord.id, updatePayload);
      } else {
        await recordsApi.activity.create(currentFamily.id, payload);
      }

      showToast(isEditMode ? "✓ 活动记录已更新" : "✓ 活动记录已保存");
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
      await recordsApi.activity.remove(currentFamily.id, editRecord.id);
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
        title={isEditMode ? "编辑活动记录" : "活动记录"}
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

        {/* 活动类型 */}
        <ActivityTypeSection value={activityType} onChange={setActivityType} />

        {/* 活动时长（内联步进器） */}
        <div
          className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
          <div
            className="flex items-center gap-2 px-4 pt-3.5 pb-2"
            style={{ borderBottom: "0.5px solid #F5EEF0" }}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#F0B8C8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 16, height: 16 }}>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="text-[13px] font-bold text-[#7A5A60]">
              活动时长
            </span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => setDurationMin((d) => Math.max(5, d - 5))}
              className="flex items-center justify-center w-9 h-9 rounded-full border text-[18px] text-[#9A8090] bg-white active:bg-pink-50"
              style={{ borderColor: "#E5D8DA" }}>
              −
            </button>
            <div className="flex-1 text-center">
              <span className="text-[28px] font-extrabold text-[#4A3035]">
                {durationMin}
              </span>
              <div className="text-[12px] text-[#9A8090] mt-0.5">分钟</div>
            </div>
            <button
              type="button"
              onClick={() => setDurationMin((d) => Math.min(120, d + 5))}
              className="flex items-center justify-center w-9 h-9 rounded-full border text-[18px] text-[#9A8090] bg-white active:bg-pink-50"
              style={{ borderColor: "#E5D8DA" }}>
              ＋
            </button>
          </div>
        </div>

        {/* 活动强度 */}
        <IntensitySection value={intensity} onChange={setIntensity} />

        {/* 备注 */}
        <NoteCard
          value={note}
          onChange={setNote}
          placeholder="其他观察或备注…"
          rows={1}
        />
      </div>

      {/* 底部按钮 */}
      <SubmitBar
        onClick={handleSubmit}
        submitting={submitting}
        label={isEditMode ? "更新记录" : "保存记录"}
        color="#DDB870"
        disabledColor="#DDCAD0"
        onDelete={isEditMode ? handleDelete : undefined}
      />

      <ToastMessage toast={toast} />
    </div>
  );
}