/**
 * 医疗记录表单页
 * UI 对齐 ui-draft/form-medical.html
 * API: POST /api/family/:familyId/records/medical
 * 字段：baby_id, visit_date, hospital, doctor, diagnosis, result_summary, medications:[{name,dose}], note, follow_up_date
 *
 * 编辑模式：通过 location.state.record 携带原始记录数据，回填表单，保存时调用 update API
 */
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { recordsApi } from "@/api";
import type { MedicalRecord, VisitType } from "@/api/types";

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
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function MedicalFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentFamily, currentBaby } = useAppStore();
  const { toast, showToast } = useToastMsg();

  // 编辑模式：从路由 state 中读取原始记录
  const editRecord = location.state?.record as MedicalRecord | undefined;
  const isEditMode = Boolean(editRecord);

  const [visitDate, setVisitDate] = useState(editRecord?.visit_date ?? nowDate());
  const [visitType, setVisitType] = useState<string>(editRecord?.visit_type ?? "checkup");
  const [hospital, setHospital] = useState(editRecord?.hospital ?? "");
  const [doctor, setDoctor] = useState(editRecord?.doctor ?? "");
  const [resultSummary, setResultSummary] = useState(editRecord?.result_summary ?? "");
  const [diagnosis, setDiagnosis] = useState(editRecord?.diagnosis ?? "");
  const [medications, setMedications] = useState<Medication[]>(() => {
    if (editRecord?.medications && editRecord.medications.length > 0) {
      return editRecord.medications.map((m) => ({ name: m.name, dose: m.dose ?? "" }));
    }
    return [];
  });
  const [note, setNote] = useState(editRecord?.note ?? "");
  const [followUpDate, setFollowUpDate] = useState(editRecord?.follow_up_date ?? "");
  const [followUpEnabled, setFollowUpEnabled] = useState(Boolean(editRecord?.follow_up_date));
  const [submitting, setSubmitting] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(isEditMode);

  /** 编辑模式下：进入页面时重新查询后端获取最新数据并回填 */
  useEffect(() => {
    if (!isEditMode || !editRecord || !currentFamily) return;
    recordsApi.medical.getOne(currentFamily.id, editRecord.id)
      .then((fresh) => {
        if (!fresh) return;
        if (fresh.visit_date) setVisitDate(fresh.visit_date);
        if (fresh.visit_type) setVisitType(fresh.visit_type);
        setHospital(fresh.hospital ?? '');
        setDoctor(fresh.doctor ?? '');
        setResultSummary(fresh.result_summary ?? '');
        setDiagnosis(fresh.diagnosis ?? '');
        if (fresh.medications && fresh.medications.length > 0) {
          setMedications(fresh.medications.map((m) => ({ name: m.name, dose: m.dose ?? '' })));
        }
        setNote(fresh.note ?? '');
        if (fresh.follow_up_date) {
          setFollowUpDate(fresh.follow_up_date);
          setFollowUpEnabled(true);
        }
      })
      .catch(() => { /* 查询失败保留快照数据 */ })
      .finally(() => setLoadingRecord(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (note) noteArr.push(note);

      const payload = {
        visit_date: visitDate,
        visit_type: (visitType as VisitType) || undefined,
        hospital: hospital || undefined,
        doctor: doctor || undefined,
        diagnosis: diagnosis || undefined,
        result_summary: resultSummary || undefined,
        medications:
          validMeds.length > 0 ? validMeds.map((m) => ({ name: m.name, dose: m.dose || undefined })) : undefined,
        follow_up_date: followUpEnabled && followUpDate ? followUpDate : undefined,
        note: noteArr.join(" / ") || undefined,
      };

      if (isEditMode && editRecord) {
        await recordsApi.medical.update(currentFamily.id, editRecord.id, payload);
        showToast("✓ 医疗记录已更新");
      } else {
        await recordsApi.medical.create(currentFamily.id, {
          baby_id: currentBaby.id,
          ...payload,
        });
        showToast("✓ 医疗记录已保存");
      }
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
      await recordsApi.medical.remove(currentFamily.id, editRecord.id);
      showToast("✓ 记录已删除");
      setTimeout(() => navigate(-1), 1200);
    } catch {
      showToast("删除失败，请重试");
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#FAF5F6" }}>
      <NavBar title={isEditMode ? "编辑医疗记录" : "医疗记录"} onBack={() => navigate(-1)} />

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

      <SubmitBar label={isEditMode ? "更新记录" : "保存记录"} submitting={submitting} onClick={handleSubmit} onDelete={isEditMode ? handleDelete : undefined} />

      <ToastMessage toast={toast} />
    </div>
  );
}