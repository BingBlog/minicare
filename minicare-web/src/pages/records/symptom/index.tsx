/**
 * 表现记录表单页
 * UI 对齐 ui-draft/form-symptom.html
 * API: POST /api/family/:familyId/records/symptom
 * 字段：baby_id, record_time, symptoms, note
 * mood（心情）和 spirit（精神）在前端选择后拼接为文字，放入 note 字段传入后端
 * DDL 中无 mood/spirit 独立列；symptoms JSON 必传（当前以 type=6 占位）
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { recordsApi } from "@/api";

import { NavBar, SectionLabel, FormSection, SubmitBar, useToastMsg, ToastMessage } from "../shared";
import MoodSection from "./MoodSection";
import SpiritSection from "./SpiritSection";

const PRIMARY = "#F87098";

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

export default function SymptomFormPage() {
  const navigate = useNavigate();
  const { currentFamily, currentBaby } = useAppStore();
  const { toast, showToast } = useToastMsg();

  const [recordDate] = useState(nowDate());
  const [recordTime, setRecordTime] = useState(nowTime());
  const [mood, setMood] = useState<string>("happy");
  const [spirit, setSpirit] = useState<string>("normal");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) {
      showToast("请先完成宝宝建档");
      return;
    }
    setSubmitting(true);
    try {
      const noteArr: string[] = [];
      const moodLabel = { happy: "开心", normal: "一般", sad: "低落" }[mood] ?? mood;
      const spiritLabel = { calm: "安静", normal: "正常", active: "活跃", sleepy: "嗜睡" }[spirit] ?? spirit;
      noteArr.push(`心情：${moodLabel}`, `精神：${spiritLabel}`);
      if (note) noteArr.push(note);

      await recordsApi.symptom.create(currentFamily.id, {
        baby_id: currentBaby.id,
        record_time: timeToISO(recordDate, recordTime),
        symptoms: [{ type: 6, severity: 1 }],
        note: noteArr.join(" / ") || undefined,
      });
      showToast("✓ 表现记录已保存");
      setTimeout(() => navigate("/"), 1400);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#FAF5F6" }}>
      <NavBar title="表现记录" onBack={() => navigate(-1)} />

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

      <SubmitBar label="保存记录" submitting={submitting} onClick={handleSubmit} />

      <ToastMessage toast={toast} />
    </div>
  );
}

/** 简化版时间选择器，复用原逻辑 */
function TimePicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  // 简单渲染，实际组件在 @/components/TimePicker
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-[14px] text-[#4A3035] outline-none"
      style={{ background: "transparent" }}
    />
  );
}
