/**
 * records 表单页共享工具 / 基础组件
 *
 * 集中导出各表单页复用的：
 *  - 时间工具函数 (nowTime / nowDate / timeToISO)
 *  - 通用 SVG 图标 (IconArrowLeft)
 *  - 通用 UI 组件 (SectionLabel / FormCard / FormRow / Stepper / Toast / SubmitBar)
 */

import React from "react";

// ─── 时间工具 ────────────────────────────────────────────────────────
export function nowTime(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

export function nowDate(): string {
  return new Date().toISOString().split("T")[0];
}

export function timeToISO(dateStr: string, timeStr: string): string {
  return new Date(`${dateStr}T${timeStr}:00`).toISOString();
}

// ─── 通用 Toast Hook ─────────────────────────────────────────────────
export function useToastMsg() {
  const [toast, setToast] = React.useState("");
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  };
  return { toast, showToast };
}

// ─── 图标 ─────────────────────────────────────────────────────────────

/** 返回箭头（导航栏左侧） */
export const IconArrowLeft = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 20, height: 20 }}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

// ─── 基础布局组件 ─────────────────────────────────────────────────────

/**
 * 导航栏
 * @param title   居中标题
 * @param onBack  返回按钮回调
 */
export function NavBar({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between px-4 pt-12 pb-3 bg-white sticky top-0 z-20"
      style={{ boxShadow: "0 1px 0 #F5EEF0" }}>
      <button
        type="button"
        onClick={onBack}
        className="text-[#7A5A60] p-1 -ml-1">
        <IconArrowLeft />
      </button>
      <span className="text-[17px] font-bold text-[#4A3035]">{title}</span>
      <div className="w-8" />
    </div>
  );
}

/**
 * 节标签（小号灰字）
 * @param label  显示文字
 * @param sub    副标题（可选）
 */
export function SectionLabel({
  label,
  sub,
}: {
  label: string;
  sub?: string;
}) {
  return (
    <div className="px-4 pt-3 pb-1">
      <span className="text-[12px] font-semibold text-[#9A8090]">{label}</span>
      {sub && (
        <span className="text-[11px] text-[#9A8090] ml-1 font-normal">
          {sub}
        </span>
      )}
    </div>
  );
}

/**
 * 通用白底卡片容器
 * @param children  内容
 * @param className 额外类名（可选）
 */
export function FormCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mx-4 mb-3 bg-white rounded-2xl overflow-hidden ${className}`}
      style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
      {children}
    </div>
  );
}

/** FormSection is an alias for FormCard for backward compatibility */
export const FormSection = FormCard;

/**
 * 带左侧标题的卡片（带分割线的卡片头部）
 * @param title    左侧标题
 * @param action   右侧操作区（可选）
 * @param icon     左侧图标（可选）
 * @param children 卡片内容
 */
export function SectionCard({
  title,
  action,
  icon,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
      style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
      <div
        className="flex items-center justify-between px-4 pt-3.5 pb-2"
        style={{ borderBottom: "0.5px solid #F5EEF0" }}>
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[13px] font-bold text-[#7A5A60]">{title}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/**
 * 表单行：左侧 label + 右侧 children
 * @param label    左侧文字
 * @param last     是否最后一行（无下边线）
 * @param children 右侧内容
 */
export function FormRow({
  label,
  last,
  children,
}: {
  label: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center px-4 py-3"
      style={{ borderBottom: last ? "none" : "0.5px solid #F5EEF0" }}>
      <span className="text-[13px] text-[#7A5A60] flex-none w-20">{label}</span>
      <div className="flex-1 flex justify-end items-center">{children}</div>
    </div>
  );
}

/**
 * 数值步进器
 * @param value     当前值
 * @param onChange  值变化回调
 * @param min       最小值（默认 0）
 * @param max       最大值（默认 999）
 * @param step      步长（默认 10）
 * @param unit      单位文字（默认 "ml"）
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 10,
  unit = "ml",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        className="flex items-center justify-center text-[22px] font-bold text-[#9A8090] bg-white border border-[#E5D8DA] rounded-full active:bg-pink-50"
        style={{ width: 36, height: 36 }}>
        −
      </button>
      <div className="flex-1 text-center">
        <span className="text-[28px] font-extrabold text-[#4A3035]">
          {value}
        </span>
        <span className="text-[12px] text-[#9A8090] ml-1">{unit}</span>
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        className="flex items-center justify-center text-[22px] font-bold text-[#9A8090] bg-white border border-[#E5D8DA] rounded-full active:bg-pink-50"
        style={{ width: 36, height: 36 }}>
        ＋
      </button>
    </div>
  );
}

/**
 * 底部提交按钮栏
 * @param label      按钮文字
 * @param onClick    点击回调
 * @param submitting 提交中状态（已废弃，请使用 disabled）
 * @param disabled   禁用状态
 * @param color      主色（默认 #F87098）
 * @param disabledColor  禁用色（默认 #F9A8C0）
 */
export function SubmitBar({
  label = "保存记录",
  onClick,
  submitting,
  disabled,
  color = "#F87098",
  disabledColor = "#F9A8C0",
}: {
  label?: string;
  onClick: () => void;
  submitting?: boolean;
  disabled?: boolean;
  color?: string;
  disabledColor?: string;
}) {
  const isDisabled = disabled ?? submitting ?? false;
  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-white px-5 pt-3 pb-8"
      style={{ boxShadow: "0 -1px 0 #F5EEF0" }}>
      <button
        type="button"
        onClick={onClick}
        disabled={isDisabled}
        className="w-full py-4 rounded-full text-white text-[16px] font-bold transition-opacity"
        style={{ background: isDisabled ? disabledColor : color }}>
        {isDisabled ? "保存中…" : label}
      </button>
    </div>
  );
}

/**
 * Toast 提示浮层
 * @param toast  显示文字（为空时不渲染）
 */
export function ToastMessage({ toast }: { toast: string }) {
  if (!toast) return null;
  return (
    <div className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-[#4A3035] text-white text-sm px-5 py-2.5 rounded-full z-50 whitespace-nowrap shadow-lg">
      {toast}
    </div>
  );
}

/**
 * 时间卡片包装器（显示 TimePicker 的通用容器）
 */
export function TimeCard({ children }: { children: React.ReactNode }) {
  return (
    <FormCard>
      <div className="px-4 py-3">{children}</div>
    </FormCard>
  );
}

/**
 * 备注输入卡片
 * @param value      当前备注文字
 * @param onChange   变化回调
 * @param placeholder 占位符
 * @param rows        行数（默认 2）
 */
export function NoteCard({
  value,
  onChange,
  placeholder = "其他观察或备注…",
  rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <>
      <SectionLabel label="备注（可选）" />
      <FormCard>
        <div className="px-4 py-3">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            className="w-full text-[13px] text-[#4A3035] resize-none outline-none"
            style={{ background: "transparent" }}
          />
        </div>
      </FormCard>
    </>
  );
}
