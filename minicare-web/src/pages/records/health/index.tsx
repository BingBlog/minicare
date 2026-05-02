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
 *  - skin_care: string[]         护理项目列表
 *
 * 折叠交互：
 *  - 体温：默认展开（最常用），可折叠
 *  - 过敏表现：默认折叠，有数据或传 state.expandAllergy=true 时展开
 *  - 保湿护理：默认折叠，有数据或传 state.expandSkin=true 时展开
 *
 * FAB 快捷入口：
 *  - 「体温」入口传 state.expandTemp=true，进入后体温区块自动展开（与默认行为相同）
 *
 * 注意：用药/营养素记录已迁移至饮食记录「营养素」Tab，此页面不再包含该区块
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { recordsApi } from "@/api";
import type { HealthRecord } from "@/api/types";
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";

import TemperatureSection from "./TemperatureSection";
import AllergySection from "./AllergySection";
import {
  NavBar,
  SectionLabel,
  FormCard,
  NoteCard,
  SubmitBar,
  ToastMessage,
  nowTime,
  nowDate,
  timeToISO,
  isoToLocalDate,
  isoToLocalTime,
  useToastMsg,
} from "../shared";

type Severity = "mild" | "moderate" | "severe";

/** 保湿护理分组 Chip 列表 */
const SKIN_GROUPS: { label: string; chips: string[] }[] = [
  { label: "面部保湿", chips: ["涂抹面霜", "涂抹润肤露", "涂抹保湿喷雾"] },
  { label: "身体保湿", chips: ["涂抹身体乳", "涂抹润肤油", "涂抹护臀霜"] },
];

/** 过敏程度中文 */
const SEVERITY_LABEL: Record<string, string> = {
  mild: "轻度",
  moderate: "中度",
  severe: "重度",
};

/** 折叠区块头部 — 可点击展开/收起 */
function SectionHeader({
  icon,
  title,
  badge,
  open,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  /** 折叠态摘要徽章文字，空则不显示 */
  badge?: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-4 pt-3.5 pb-3 text-left"
      style={{ borderBottom: open ? "0.5px solid #F5EEF0" : "none" }}>
      {icon}
      <span className="text-[13px] font-bold text-[#7A5A60] flex-1">{title}</span>
      {/* 折叠态摘要 badge */}
      {!open && badge && (
        <span
          className="text-[11px] font-medium px-2 py-0.5 rounded-full mr-1"
          style={{ background: "#FFF0F4", color: "#F87098" }}>
          {badge}
        </span>
      )}
      {/* 展开/收起箭头 */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#C0A8B0"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          width: 14,
          height: 14,
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s ease",
          flexShrink: 0,
        }}>
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

export default function HealthFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentFamily, currentBaby } = useAppStore();
  const { toast, showToast } = useToastMsg();

  // 编辑模式：从路由 state 中读取原始记录
  const editRecord = location.state?.record as HealthRecord | undefined;
  const isEditMode = Boolean(editRecord);

  const [recordDate, setRecordDate] = useState(() => {
    if (editRecord?.record_time) return isoToLocalDate(editRecord.record_time);
    return nowDate();
  });
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

  // 保湿护理 Chip 多选（从 skin_care 结构化字段回填）
  const [selectedSkin, setSelectedSkin] = useState<Set<string>>(() => {
    return new Set(editRecord?.skin_care ?? []);
  });

  const [note, setNote] = useState(editRecord?.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(isEditMode);

  // ── 折叠状态 ─────────────────────────────────────────────────────
  // 体温：始终默认展开（FAB 快捷入口传 state.expandTemp=true 时也展开）
  const [tempOpen, setTempOpen] = useState(
    () => location.state?.expandTemp ?? true,
  );
  // 过敏：编辑时有数据则展开，新建时默认折叠（FAB 可传 state.expandAllergy=true 展开）
  const [allergyOpen, setAllergyOpen] = useState(
    () => (editRecord?.allergy_symptoms?.length ?? 0) > 0 || location.state?.expandAllergy,
  );
  // 护理：编辑时有数据则展开，新建时默认折叠（FAB 可传 state.expandSkin=true 展开）
  const [skinOpen, setSkinOpen] = useState(
    () => (editRecord?.skin_care?.length ?? 0) > 0 || location.state?.expandSkin,
  );

  /** 用最新数据回填所有状态 */
  const applyRecord = useCallback((r: HealthRecord) => {
    if (r.record_time) {
      setRecordDate(isoToLocalDate(r.record_time));
      setRecordTime(isoToLocalTime(r.record_time));
    }
    if (r.temperature != null) setTemperature(String(r.temperature));
    setSelectedSymptoms(r.allergy_symptoms ?? []);
    setSeverity((r.allergy_severity as Severity) ?? null);
    setSelectedSkin(new Set(r.skin_care ?? []));
    setNote(r.note ?? "");
    // 有数据时自动展开对应区块
    if ((r.allergy_symptoms?.length ?? 0) > 0) setAllergyOpen(true);
    if ((r.skin_care?.length ?? 0) > 0) setSkinOpen(true);
  }, []);

  /** 编辑模式下：进入页面时重新查询后端获取最新数据 */
  useEffect(() => {
    if (!isEditMode || !editRecord || !currentFamily) return;
    recordsApi.health
      .getOne(currentFamily.id, editRecord.id)
      .then((fresh) => {
        if (fresh) applyRecord(fresh);
      })
      .catch(() => {
        /* 查询失败保留快照数据 */
      })
      .finally(() => setLoadingRecord(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSymptom = (s: string) => {
    setSelectedSymptoms((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
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
      const payload = {
        record_time: timeToISO(recordDate, recordTime),
        temperature: temp,
        allergy_symptoms:
          selectedSymptoms.length > 0 ? selectedSymptoms : undefined,
        allergy_severity:
          selectedSymptoms.length > 0 ? (severity ?? undefined) : undefined,
        skin_care: selectedSkin.size > 0 ? [...selectedSkin] : undefined,
        note: note || undefined,
      };

      if (isEditMode && editRecord) {
        await recordsApi.health.update(
          currentFamily.id,
          editRecord.id,
          payload,
        );
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

  // ── 过敏区块折叠态摘要 ───────────────────────────────────────────
  const allergyBadge = (() => {
    if (selectedSymptoms.length === 0) return undefined;
    const sevLabel = severity ? `· ${SEVERITY_LABEL[severity]}` : "";
    return `${selectedSymptoms.length} 项${sevLabel}`;
  })();

  // ── 护理区块折叠态摘要 ───────────────────────────────────────────
  const skinBadge =
    selectedSkin.size > 0 ? `已选 ${selectedSkin.size} 项` : undefined;

  // ── 体温区块折叠态摘要 ───────────────────────────────────────────
  const tempBadge = temperature ? `${temperature} ℃` : undefined;

  return (
    <div className="min-h-screen" style={{ background: "#FAF5F6" }}>
      {/* 导航栏 */}
      <NavBar
        title={isEditMode ? "编辑健康记录" : "健康记录"}
        onBack={() => navigate(-1)}
      />

      {/* 编辑模式加载数据提示 */}
      {loadingRecord && (
        <div className="flex items-center justify-center gap-2 py-2 text-[12px] text-[#9A8090]">
          <svg
            className="animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ width: 14, height: 14 }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          正在加载最新数据…
        </div>
      )}

      <div className="pb-32">
        {/* 记录时间 */}
        <SectionLabel label="记录时间" />
        <FormCard>
          <div
            className="px-4 py-3"
            style={{ borderBottom: "0.5px solid #F5EEF0" }}>
            <DatePicker
              value={recordDate}
              onChange={setRecordDate}
              label="记录日期"
            />
          </div>
          <div className="px-4 py-3">
            <TimePicker
              value={recordTime}
              onChange={setRecordTime}
              label="记录时间"
            />
          </div>
        </FormCard>

        {/* ── 体温（默认展开） ── */}
        <div
          className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
          <SectionHeader
            icon={
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#F0B8C8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: 16, height: 16 }}>
                <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
              </svg>
            }
            title="体温（可选）"
            badge={!tempOpen ? tempBadge : undefined}
            open={tempOpen}
            onToggle={() => setTempOpen((v: boolean) => !v)}
          />
          {tempOpen && (
            <TemperatureSection value={temperature} onChange={setTemperature} />
          )}
        </div>

        {/* ── 过敏表现（默认折叠） ── */}
        <div
          className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
          <SectionHeader
            icon={
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#F0A0B0"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: 16, height: 16 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            }
            title="过敏表现"
            badge={allergyBadge}
            open={allergyOpen}
            onToggle={() => setAllergyOpen((v: boolean) => !v)}
          />
          {allergyOpen && (
            <AllergySection
              selected={selectedSymptoms}
              onToggle={toggleSymptom}
              severity={severity}
              onSeverityChange={setSeverity}
              onPhotoClick={() => showToast("拍照功能（功能开发中）")}
            />
          )}
          {/* 折叠态 hint */}
          {!allergyOpen && selectedSymptoms.length === 0 && (
            <div className="px-4 pb-3 text-[12px] text-[#C0A8B0]">
              无过敏表现则跳过
            </div>
          )}
        </div>

        {/* ── 保湿护理（默认折叠） ── */}
        <div
          className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
          <SectionHeader
            icon={
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
            }
            title="保湿护理"
            badge={skinBadge}
            open={skinOpen}
            onToggle={() => setSkinOpen((v: boolean) => !v)}
          />
          {skinOpen && (
            <div className="px-4 py-3">
              {SKIN_GROUPS.map((group) => (
                <div key={group.label} className="mb-3 last:mb-0">
                  <div className="text-[12px] font-medium text-[#9A8090] mb-2">
                    {group.label}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.chips.map((chip) => (
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
              ))}
            </div>
          )}
          {/* 折叠态 hint */}
          {!skinOpen && selectedSkin.size === 0 && (
            <div className="px-4 pb-3 text-[12px] text-[#C0A8B0]">
              今日未做护理则跳过
            </div>
          )}
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
