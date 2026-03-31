/**
 * 生长记录表单页（入口）
 *
 * UI 对齐 ui-draft/form-growth.html
 * API: POST /api/family/:familyId/records/growth
 *
 * 业务规则：
 *  - 高度以 cm 输入，存储为 mm（× 10）
 *  - 体重以 kg 输入，存储为 g（× 1000）
 *  - 头围以 cm 输入，存储为 mm（× 10）
 *  - 每日唯一索引 uk_growth_baby_date，重复提交会覆盖
 *
 * 子组件：
 *  - MeasureCards  顶部 3 格数据预览卡片
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { recordsApi } from "@/api";
import DatePicker from "@/components/DatePicker";

import MeasureCards from "./MeasureCards";
import {
  NavBar,
  SectionLabel,
  FormCard,
  NoteCard,
  SubmitBar,
  ToastMessage,
  nowDate,
  useToastMsg,
} from "../shared";

type MeasureKey = "height" | "weight" | "head";

const ORG_OPTIONS = ["儿保门诊", "家中自测", "社区卫生", "其他"];

export default function GrowthFormPage() {
  const navigate = useNavigate();
  const { currentFamily, currentBaby } = useAppStore();
  const { toast, showToast } = useToastMsg();

  const [recordDate, setRecordDate] = useState(nowDate());
  const [height, setHeight] = useState("");   // cm（字符串，保留输入中间态）
  const [weight, setWeight] = useState("");   // kg
  const [head, setHead] = useState("");       // cm
  const [activeCard, setActiveCard] = useState<MeasureKey | null>(null);
  const [orgChip, setOrgChip] = useState<string | null>("儿保门诊");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /** setter 映射（用于统一的输入行处理） */
  const setterMap: Record<MeasureKey, (v: string) => void> = {
    height: setHeight,
    weight: setWeight,
    head: setHead,
  };
  const valueMap: Record<MeasureKey, string> = {
    height,
    weight,
    head,
  };

  const handleSubmit = async () => {
    if (!currentFamily || !currentBaby) {
      showToast("请先完成宝宝建档");
      return;
    }
    if (!height && !weight && !head) {
      showToast("请至少填写一项测量数据");
      return;
    }
    setSubmitting(true);
    try {
      const heightMm = height ? Math.round(parseFloat(height) * 10) : undefined;
      const weightG = weight ? Math.round(parseFloat(weight) * 1000) : undefined;
      const headMm = head ? Math.round(parseFloat(head) * 10) : undefined;
      const noteArr: string[] = [];
      if (orgChip) noteArr.push("机构：" + orgChip);
      if (note) noteArr.push(note);

      await recordsApi.growth.create(currentFamily.id, {
        baby_id: currentBaby.id,
        record_date: recordDate,
        height_mm: heightMm,
        weight_g: weightG,
        head_mm: headMm,
        note: noteArr.join(" / ") || undefined,
      });
      showToast("✓ 生长记录已保存");
      setTimeout(() => navigate("/"), 1400);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "保存失败（同日只可记录一次）"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#FAF5F6" }}>
      {/* 导航栏 */}
      <NavBar title="生长记录" onBack={() => navigate(-1)} />

      <div className="pb-32">
        {/* 测量数据预览卡片 */}
        <div className="px-4 pt-3.5 pb-2">
          <span className="text-[12px] font-semibold text-[#9A8090]">
            本次测量数据
          </span>
        </div>
        <MeasureCards
          height={height}
          weight={weight}
          head={head}
          activeCard={activeCard}
          onActivate={setActiveCard}
        />

        {/* 填写数值 + 测量日期 */}
        <SectionLabel label="填写数值" />
        <FormCard>
          {(
            [
              { key: "height" as const, label: "身高", unit: "cm", placeholder: "如 68.0" },
              { key: "weight" as const, label: "体重", unit: "kg", placeholder: "如 7.5" },
              { key: "head" as const, label: "头围", unit: "cm", placeholder: "如 43.0" },
            ] as const
          ).map(({ key, label, unit, placeholder }, idx) => (
            <div
              key={key}
              className="flex items-center px-4 py-3"
              style={{
                borderBottom: idx < 2 ? "0.5px solid #F5EEF0" : "none",
              }}>
              <span className="text-[14px] text-[#7A5A60] flex-1">{label}</span>
              <input
                type="text"
                inputMode="decimal"
                value={valueMap[key]}
                onChange={(e) => {
                  setterMap[key](e.target.value.replace(/[^0-9.]/g, ""));
                  setActiveCard(key);
                }}
                onBlur={(e) => {
                  const n = parseFloat(e.target.value);
                  if (!isNaN(n)) setterMap[key](n.toFixed(1));
                }}
                placeholder={placeholder}
                className="w-20 text-right text-[14px] font-semibold text-[#4A3035] bg-transparent outline-none"
              />
              <span className="text-[13px] text-[#9A8090] ml-1 w-6">
                {unit}
              </span>
            </div>
          ))}
          <div className="px-4 py-3" style={{ borderTop: "0.5px solid #F5EEF0" }}>
            <DatePicker
              value={recordDate}
              onChange={setRecordDate}
              label="测量日期"
              max={nowDate()}
            />
          </div>
        </FormCard>

        {/* 测量机构（可选） */}
        <SectionLabel label="测量机构（可选）" />
        <FormCard>
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {ORG_OPTIONS.map((org) => (
              <button
                key={org}
                type="button"
                onClick={() => setOrgChip(orgChip === org ? null : org)}
                className="px-3 py-1.5 rounded-full border text-[13px] font-semibold transition-all"
                style={{
                  borderColor: orgChip === org ? "#F87098" : "#E5D8DA",
                  background: orgChip === org ? "#FFF0F4" : "#fff",
                  color: orgChip === org ? "#F87098" : "#7A5A60",
                }}>
                {org}
              </button>
            ))}
          </div>
        </FormCard>

        {/* 上传测量单（可选） */}
        <SectionLabel label="上传测量单（可选）" />
        <FormCard>
          <button
            type="button"
            onClick={() => showToast("拍照上传（功能开发中）")}
            className="flex items-center gap-3 px-4 py-3.5 w-full text-left">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center border-2 border-dashed flex-shrink-0"
              style={{ borderColor: "#F0B8C8", background: "#FFF0F4" }}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#F0B8C8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: 24, height: 24 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div>
              <div className="text-[14px] font-semibold text-[#7A5A60]">
                拍照或上传测量报告
              </div>
              <div className="text-[12px] text-[#9A8090] mt-0.5">
                JPG / PNG，与结构化数据一并保存
              </div>
            </div>
          </button>
        </FormCard>

        {/* 备注 */}
        <NoteCard
          value={note}
          onChange={setNote}
          placeholder="测量机构、备注等…"
        />

        {/* 提示文字 */}
        <div className="mx-4 text-[11px] text-[#9A8090] text-center">
          同一天只能记录一次，如已有记录将覆盖
        </div>
      </div>

      {/* 底部按钮 */}
      <SubmitBar
        onClick={handleSubmit}
        submitting={submitting}
        color="#9B8ED8"
        disabledColor="#DDCAD0"
      />

      <ToastMessage toast={toast} />
    </div>
  );
}
