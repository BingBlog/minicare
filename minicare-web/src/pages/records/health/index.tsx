/**
 * 健康记录表单页（入口）
 *
 * UI 对齐 ui-draft/form-health.html
 * API: POST /api/family/:familyId/records/health
 *
 * 子组件：
 *  - TemperatureSection  体温步进器 + 高温警告
 *  - AllergySection      过敏症状 9 项网格 + 程度 + 拍照
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { recordsApi } from "@/api";
import TimePicker from "@/components/TimePicker";

import TemperatureSection from "./TemperatureSection";
import AllergySection from "./AllergySection";
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

type Severity = "mild" | "moderate" | "severe";

/** 用药 Chip 列表 */
const MED_CHIPS = ["维生素D", "铁剂", "益生菌", "钙剂"];
/** 保湿护理 Chip 列表 */
const SKIN_CHIPS = ["已做保湿", "涂抹面霜", "涂抹身体乳"];

export default function HealthFormPage() {
  const navigate = useNavigate();
  const { currentFamily, currentBaby } = useAppStore();
  const { toast, showToast } = useToastMsg();

  const [recordDate] = useState(nowDate());
  const [recordTime, setRecordTime] = useState(nowTime());

  // 体温（字符串，空表示未填）
  const [temperature, setTemperature] = useState("");

  // 过敏症状多选
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [severity, setSeverity] = useState<Severity | null>(null);

  // 用药 Chip 多选 + 剂量
  const [selectedMeds, setSelectedMeds] = useState<Set<string>>(new Set());
  const [medDose, setMedDose] = useState("");

  // 保湿护理 Chip 多选
  const [selectedSkin, setSelectedSkin] = useState<Set<string>>(new Set());

  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const toggleSymptom = (s: string) => {
    setSelectedSymptoms((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };
  const toggleMed = (s: string) => {
    setSelectedMeds((prev) => {
      const n = new Set(prev);
      n.has(s) ? n.delete(s) : n.add(s);
      return n;
    });
  };
  const toggleSkin = (s: string) => {
    setSelectedSkin((prev) => {
      const n = new Set(prev);
      n.has(s) ? n.delete(s) : n.add(s);
      return n;
    });
  };

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) {
      showToast("请先完成宝宝建档");
      return;
    }
    const temp = temperature ? parseFloat(temperature) : undefined;
    if (temp !== undefined && (temp < 35 || temp > 42)) {
      showToast("体温范围应为 35～42℃");
      return;
    }
    setSubmitting(true);
    try {
      const noteArr: string[] = [];
      if (selectedSymptoms.length > 0) {
        noteArr.push("过敏表现：" + selectedSymptoms.join("、"));
        if (severity) {
          const sevLabel = { mild: "轻度", moderate: "中度", severe: "重度" }[
            severity
          ];
          noteArr.push("严重程度：" + sevLabel);
        }
      }
      if (selectedMeds.size > 0) {
        noteArr.push(
          "用药：" +
            [...selectedMeds].join("、") +
            (medDose ? `（${medDose}）` : "")
        );
      }
      if (selectedSkin.size > 0) {
        noteArr.push("护理：" + [...selectedSkin].join("、"));
      }
      if (note) noteArr.push(note);

      await recordsApi.health.create(currentFamily.id, {
        baby_id: currentBaby.id,
        record_time: timeToISO(recordDate, recordTime),
        temperature: temp,
        note: noteArr.join(" / ") || undefined,
      });
      showToast("✓ 健康记录已保存");
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
      <NavBar title="健康记录" onBack={() => navigate(-1)} />

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

        {/* 体温 */}
        <TemperatureSection value={temperature} onChange={setTemperature} />

        {/* 过敏表现 */}
        <AllergySection
          selected={selectedSymptoms}
          onToggle={toggleSymptom}
          severity={severity}
          onSeverityChange={setSeverity}
          onPhotoClick={() => showToast("拍照功能（功能开发中）")}
        />

        {/* 用药记录 */}
        <div
          className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
          <div
            className="flex items-center gap-2 px-4 pt-3.5 pb-2"
            style={{ borderBottom: "0.5px solid #F5EEF0" }}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#9B8ED8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 16, height: 16 }}>
              <path d="M10 2v7.31" />
              <path d="M14 9.3V1.99" />
              <path d="M8.5 2h7" />
              <path d="M14 9.3a6.5 6.5 0 1 1-4 0" />
            </svg>
            <span className="text-[13px] font-bold text-[#7A5A60]">
              用药记录
            </span>
          </div>
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {MED_CHIPS.map((med) => (
              <button
                key={med}
                type="button"
                onClick={() => toggleMed(med)}
                className="px-3 py-1.5 rounded-full border text-[13px] font-medium transition-all"
                style={{
                  borderColor: selectedMeds.has(med) ? "#9B8ED8" : "#E5D8DA",
                  background: selectedMeds.has(med) ? "#F3F0FF" : "#fff",
                  color: selectedMeds.has(med) ? "#9B8ED8" : "#7A5A60",
                }}>
                {med}
              </button>
            ))}
          </div>
          {selectedMeds.size > 0 && (
            <div
              className="flex items-center px-4 pb-3"
              style={{ borderTop: "0.5px solid #F5EEF0" }}>
              <span className="text-[14px] text-[#7A5A60] flex-1 pt-3">
                剂量
              </span>
              <input
                type="text"
                value={medDose}
                onChange={(e) => setMedDose(e.target.value)}
                placeholder="如：400IU"
                className="w-32 text-right text-[14px] text-[#4A3035] pt-3 outline-none"
                style={{ background: "transparent" }}
              />
            </div>
          )}
        </div>

        {/* 保湿护理 */}
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
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span className="text-[13px] font-bold text-[#7A5A60]">
              保湿护理
            </span>
          </div>
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {SKIN_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => toggleSkin(chip)}
                className="px-3 py-1.5 rounded-full border text-[13px] font-medium transition-all"
                style={{
                  borderColor: selectedSkin.has(chip) ? "#F87098" : "#E5D8DA",
                  background: selectedSkin.has(chip) ? "#FFF0F4" : "#fff",
                  color: selectedSkin.has(chip) ? "#F87098" : "#7A5A60",
                }}>
                {chip}
              </button>
            ))}
          </div>
        </div>

        {/* 备注 */}
        <NoteCard
          value={note}
          onChange={setNote}
          placeholder="其他观察或备注…"
          rows={1}
        />
      </div>

      {/* 底部按钮 */}
      <SubmitBar onClick={handleSubmit} submitting={submitting} />

      <ToastMessage toast={toast} />
    </div>
  );
}
