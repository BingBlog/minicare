/**
 * 医疗记录表单页
 * UI 对齐 ui-draft/form-medical.html
 * API: POST /api/family/:familyId/records/medical
 * 字段：baby_id, visit_date, hospital, doctor, diagnosis, result_summary, medications:[{name,dose}], note, follow_up_date
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { recordsApi } from "@/api";

import { NavBar, SectionLabel, FormSection, SubmitBar, useToastMsg, ToastMessage } from "../shared";
import VisitTypeSection from "./VisitTypeSection";
import BasicInfoSection from "./BasicInfoSection";
import OCRSection from "./OCRSection";
import ResultSection from "./ResultSection";
import MedicationsSection, { type Medication } from "./MedicationsSection";
import FollowUpSection from "./FollowUpSection";

const IconFileText = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 28, height: 28 }}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

function nowDate(): string {
  return new Date().toISOString().split("T")[0];
}

export default function MedicalFormPage() {
  const navigate = useNavigate();
  const { currentFamily, currentBaby } = useAppStore();
  const { toast, showToast } = useToastMsg();

  const [visitDate, setVisitDate] = useState(nowDate());
  const [visitType, setVisitType] = useState<string>("checkup");
  const [hospital, setHospital] = useState("");
  const [doctor, setDoctor] = useState("");
  const [resultSummary, setResultSummary] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [medications, setMedications] = useState<Medication[]>([]);
  const [note, setNote] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpEnabled, setFollowUpEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const addMed = () => setMedications((prev) => [...prev, { name: "", dose: "" }]);
  const removeMed = (i: number) => setMedications((prev) => prev.filter((_, idx) => idx !== i));
  const updateMed = (i: number, field: keyof Medication, val: string) => {
    setMedications((prev) => prev.map((m, idx) => (idx === i ? { ...m, [field]: val } : m)));
  };

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) {
      showToast("请先完成宝宝建档");
      return;
    }
    setSubmitting(true);
    try {
      const validMeds = medications.filter((m) => m.name.trim());
      const noteArr: string[] = [];
      if (resultSummary) noteArr.push("摘要：" + resultSummary);
      if (note) noteArr.push(note);
      await recordsApi.medical.create(currentFamily.id, {
        baby_id: currentBaby.id,
        visit_date: visitDate,
        hospital: hospital || undefined,
        diagnosis: diagnosis || undefined,
        medications:
          validMeds.length > 0 ? validMeds.map((m) => ({ name: m.name, dose: m.dose || undefined })) : undefined,
        note: noteArr.join(" / ") || undefined,
      });
      showToast("✓ 医疗记录已保存");
      setTimeout(() => navigate("/"), 1400);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#FAF5F6" }}>
      <NavBar title="医疗记录" onBack={() => navigate(-1)} />

      <div className="pb-32">
        {/* ── 检查类型 ── */}
        <SectionLabel label="检查类型" />
        <VisitTypeSection value={visitType} onChange={setVisitType} />

        {/* ── 基本信息 ── */}
        <SectionLabel label="基本信息" />
        <BasicInfoSection
          visitDate={visitDate}
          hospital={hospital}
          doctor={doctor}
          onVisitDateChange={setVisitDate}
          onHospitalChange={setHospital}
          onDoctorChange={setDoctor}
        />

        {/* ── OCR 上传区 ── */}
        <SectionLabel label="上传检查报告（OCR 自动识别）" />
        <OCRSection showToast={showToast} />

        {/* ── 结果与诊断 ── */}
        <SectionLabel label="结果与诊断" />
        <ResultSection
          resultSummary={resultSummary}
          diagnosis={diagnosis}
          onResultSummaryChange={setResultSummary}
          onDiagnosisChange={setDiagnosis}
        />

        {/* ── 用药记录 ── */}
        <MedicationsSection medications={medications} onAdd={addMed} onRemove={removeMed} onUpdate={updateMed} />

        {/* ── 附件照片 ── */}
        <SectionLabel label="附件照片" />
        <FormSection>
          <div className="flex gap-2.5 px-4 py-3 flex-wrap">
            {/* 已上传缩略图示例 */}
            <div
              className="flex items-center justify-center rounded-xl overflow-hidden"
              style={{ width: 70, height: 70, background: "#FFF5F8", border: "1.5px dashed #F0B8C8" }}>
              <div style={{ color: "#F0B8C8" }}>
                <IconFileText />
              </div>
            </div>
            {/* 添加按钮 */}
            <button
              type="button"
              onClick={() => showToast("添加更多照片")}
              className="flex items-center justify-center rounded-xl text-[26px] font-light"
              style={{
                width: 70,
                height: 70,
                background: "#FFF5F8",
                border: "1.5px dashed #F0B8C8",
                color: "#F0B8C8",
              }}>
              ＋
            </button>
          </div>
        </FormSection>

        {/* ── 下次复查提醒 ── */}
        <SectionLabel label="下次复查提醒（可选）" />
        <FollowUpSection
          followUpDate={followUpDate}
          followUpEnabled={followUpEnabled}
          onDateChange={setFollowUpDate}
          onToggle={() => setFollowUpEnabled(!followUpEnabled)}
        />

        {/* ── 备注 ── */}
        <SectionLabel label="备注（可选）" />
        <FormSection>
          <div className="px-4 py-3">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="医嘱、注意事项等…"
              rows={2}
              className="w-full text-[13px] text-[#4A3035] resize-none outline-none"
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
