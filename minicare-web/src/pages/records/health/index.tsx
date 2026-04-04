/**
 * 健康记录表单页（入口）
 *
 * UI 对齐 ui-draft/form-health.html
 * API: POST /api/family/:familyId/records/health
 *
 * 子组件：
 *  - TemperatureSection  体温步进器 + 高温警告
 *  - AllergySection      过敏症状 9 项网格 + 程度 + 拍照
 *
 * 编辑模式：通过 location.state.record 携带原始记录数据，回填表单，保存时调用 update API
 *
 * 结构化字段（Migration 005）：
 *  - allergy_symptoms: string[]  过敏症状列表
 *  - allergy_severity: string    过敏严重程度
 *  - medications: { name, dose }[] 用药列表
 *  - skin_care: string[]         护理项目列表
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { recordsApi } from "@/api";
import type { HealthRecord } from "@/api/types";
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

/** 用药 Chip 列表（固定预设） */
const MED_CHIPS = ["维生素D", "铁剂", "益生菌", "钙剂"];
/** 保湿护理 Chip 列表 */
const SKIN_CHIPS = ["已做保湿", "涂抹面霜", "涂抹身体乳"];

/** 从 ISO 时间提取本地 HH:mm */
function isoToLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export default function HealthFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentFamily, currentBaby } = useAppStore();
  const { toast, showToast } = useToastMsg();

  // 编辑模式：从路由 state 中读取原始记录
  const editRecord = location.state?.record as HealthRecord | undefined;
  const isEditMode = Boolean(editRecord);

  const [recordDate] = useState(nowDate());
  const [recordTime, setRecordTime] = useState(() => {
    if (editRecord?.record_time) return isoToLocalTime(editRecord.record_time);
    return nowTime();
  });

  // 体温（字符串，默认 36.5℃）
  const [temperature, setTemperature] = useState(() => {
    if (editRecord?.temperature != null) return String(editRecord.temperature);
    return "36.5";
  });

  // 过敏症状多选（编辑时从结构化字段 allergy_symptoms 回填）
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>(() => {
    return editRecord?.allergy_symptoms ?? [];
  });
  const [severity, setSeverity] = useState<Severity | null>(() => {
    return (editRecord?.allergy_severity as Severity) ?? null;
  });

  // 用药：预设 Chip 多选 + 剂量（从 medications 结构化字段回填）
  // medications 可含非预设项目，预设 Chip 与自由输入分开处理
  const [selectedMeds, setSelectedMeds] = useState<Set<string>>(() => {
    const names = (editRecord?.medications ?? []).map((m) => m.name);
    return new Set(names.filter((n) => MED_CHIPS.includes(n)));
  });
  // 剂量：从第一个有剂量的预设用药中取（简化处理）
  const [medDose, setMedDose] = useState(() => {
    const med = (editRecord?.medications ?? []).find(
      (m) => MED_CHIPS.includes(m.name) && m.dose
    );
    return med?.dose ?? "";
  });

  // 保湿护理 Chip 多选（从 skin_care 结构化字段回填）
  const [selectedSkin, setSelectedSkin] = useState<Set<string>>(() => {
    return new Set(editRecord?.skin_care ?? []);
  });

  const [note, setNote] = useState(editRecord?.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(isEditMode);

  /** 用最新数据回填所有状态 */
  const applyRecord = useCallback((r: HealthRecord) => {
    if (r.record_time) setRecordTime(isoToLocalTime(r.record_time));
    if (r.temperature != null) setTemperature(String(r.temperature));
    setSelectedSymptoms(r.allergy_symptoms ?? []);
    setSeverity((r.allergy_severity as Severity) ?? null);
    const names = (r.medications ?? []).map((m) => m.name);
    setSelectedMeds(new Set(names.filter((n) => MED_CHIPS.includes(n))));
    const med = (r.medications ?? []).find((m) => MED_CHIPS.includes(m.name) && m.dose);
    setMedDose(med?.dose ?? "");
    setSelectedSkin(new Set(r.skin_care ?? []));
    setNote(r.note ?? "");
  }, []);

  /** 编辑模式下：进入页面时重新查询后端获取最新数据 */
  useEffect(() => {
    if (!isEditMode || !editRecord || !currentFamily) return;
    recordsApi.health.getOne(currentFamily.id, editRecord.id)
      .then((fresh) => { if (fresh) applyRecord(fresh); })
      .catch(() => { /* 查询失败保留快照数据 */ })
      .finally(() => setLoadingRecord(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // 构建结构化用药列表（预设 Chip）
      const medicationsPayload = [...selectedMeds].map((name) => ({
        name,
        dose: medDose || undefined,
      }));

      const payload = {
        record_time:      timeToISO(recordDate, recordTime),
        temperature:      temp,
        allergy_symptoms: selectedSymptoms.length > 0 ? selectedSymptoms : undefined,
        allergy_severity: selectedSymptoms.length > 0 ? (severity ?? undefined) : undefined,
        medications:      medicationsPayload.length > 0 ? medicationsPayload : undefined,
        skin_care:        selectedSkin.size > 0 ? [...selectedSkin] : undefined,
        note:             note || undefined,
      };

      if (isEditMode && editRecord) {
        await recordsApi.health.update(currentFamily.id, editRecord.id, payload);
        showToast("✓ 健康记录已更新");
      } else {
        await recordsApi.health.create(currentFamily.id, {
          baby_id: currentBaby.id,
          ...payload,
        });
        showToast("✓ 健康记录已保存");
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
      await recordsApi.health.remove(currentFamily.id, editRecord.id);
      showToast("✓ 记录已删除");
      setTimeout(() => navigate(-1), 1200);
    } catch {
      showToast("删除失败，请重试");
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#FAF5F6" }}>
      {/* 导航栏 */}
      <NavBar title={isEditMode ? "编辑健康记录" : "健康记录"} onBack={() => navigate(-1)} />

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
      <SubmitBar
        onClick={handleSubmit}
        submitting={submitting}
        label={isEditMode ? "更新记录" : "保存记录"}
        onDelete={isEditMode ? handleDelete : undefined}
      />

      <ToastMessage toast={toast} />
    </div>
  );
}