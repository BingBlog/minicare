/**
 * 活动记录表单页（入口）
 *
 * UI 对齐 ui-draft/form-activity.html
 * API: POST /api/family/:familyId/records/activity
 *
 * 子组件：
 *  - ActivityTypeSection  活动类型选择（横排卡片）
 *  - IntensitySection     活动强度（轻松 / 适中 / 活跃）
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { recordsApi } from "@/api";
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

type ActivityType = "tummy_time" | "outdoor" | "play" | "bath" | "other";
type Intensity = "easy" | "medium" | "active";

export default function ActivityFormPage() {
  const navigate = useNavigate();
  const { currentFamily, currentBaby } = useAppStore();
  const { toast, showToast } = useToastMsg();

  const [recordDate] = useState(nowDate());
  const [recordTime, setRecordTime] = useState(nowTime());
  const [activityType, setActivityType] = useState<ActivityType>("tummy_time");
  const [intensity, setIntensity] = useState<Intensity>("medium");
  const [durationMin, setDurationMin] = useState(15);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) {
      showToast("请先完成宝宝建档");
      return;
    }
    setSubmitting(true);
    try {
      const intensityLabel = { easy: "轻松", medium: "适中", active: "活跃" }[
        intensity
      ];
      const noteArr = [`强度：${intensityLabel}`];
      if (note) noteArr.push(note);

      await recordsApi.activity.create(currentFamily.id, {
        baby_id: currentBaby.id,
        activity_type: activityType,
        record_time: timeToISO(recordDate, recordTime),
        duration_min: durationMin,
        note: noteArr.join(" / ") || undefined,
      });
      showToast("✓ 活动记录已保存");
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
      <NavBar title="活动记录" onBack={() => navigate(-1)} />

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
        color="#DDB870"
        disabledColor="#DDCAD0"
      />

      <ToastMessage toast={toast} />
    </div>
  );
}
