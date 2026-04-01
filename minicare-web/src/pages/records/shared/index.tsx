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
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function timeToISO(dateStr: string, timeStr: string): string {
  // 全链路 CST：直接返回本地时间字符串，不转 UTC（不加 Z 后缀）
  // 后端 toMysqlDatetime() 用本地时间分量写入，数据库连接 timezone='+08:00' 保证一致
  return `${dateStr}T${timeStr}:00`;
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
 *
 * - 无 onDelete：单按钮（保存）
 * - 有 onDelete：左侧删除按钮 + 右侧保存按钮；点击删除后弹出全屏蒙层二次确认
 *
 * @param label          按钮文字
 * @param onClick        保存点击回调
 * @param onDelete       删除确认后回调（传入时显示删除按钮）
 * @param submitting     提交中状态（已废弃，请使用 disabled）
 * @param disabled       禁用状态
 * @param color          主色（默认 #F87098）
 * @param disabledColor  禁用色（默认 #F9A8C0）
 */
export function SubmitBar({
  label = "保存记录",
  onClick,
  onDelete,
  submitting,
  disabled,
  color = "#F87098",
  disabledColor = "#F9A8C0",
}: {
  label?: string;
  onClick: () => void;
  onDelete?: () => void;
  submitting?: boolean;
  disabled?: boolean;
  color?: string;
  disabledColor?: string;
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const isDisabled = disabled ?? submitting ?? false;

  return (
    <>
      <div
        className="fixed bottom-0 left-0 right-0 bg-white px-5 pt-3 pb-8"
        style={{ boxShadow: "0 -1px 0 #F5EEF0" }}>
        {onDelete ? (
          /* 编辑模式：删除 + 保存 双按钮 */
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={isDisabled}
              className="flex-none py-4 px-5 rounded-full text-[15px] font-bold transition-opacity border"
              style={{ color: "#F05060", borderColor: "#FFCDD2", background: "#FFF5F5" }}>
              删除
            </button>
            <button
              type="button"
              onClick={onClick}
              disabled={isDisabled}
              className="flex-1 py-4 rounded-full text-white text-[16px] font-bold transition-opacity"
              style={{ background: isDisabled ? disabledColor : color }}>
              {isDisabled ? "保存中…" : label}
            </button>
          </div>
        ) : (
          /* 新建模式：单按钮 */
          <button
            type="button"
            onClick={onClick}
            disabled={isDisabled}
            className="w-full py-4 rounded-full text-white text-[16px] font-bold transition-opacity"
            style={{ background: isDisabled ? disabledColor : color }}>
            {isDisabled ? "保存中…" : label}
          </button>
        )}
      </div>

      {/* 删除二次确认蒙层 */}
      {confirmOpen && (
        <div
          className="fixed inset-0 flex items-end"
          style={{ background: "rgba(0,0,0,0.45)", zIndex: 60 }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmOpen(false); }}>
          <div
            className="w-full bg-white rounded-t-3xl"
            style={{ maxWidth: 430, margin: "0 auto", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}>
            {/* 把手 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            {/* 提示内容 */}
            <div className="px-5 pt-4 pb-3 text-center">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: "#FFF0F0" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#F05060" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <div className="text-[15px] font-semibold text-[#4A3035] mb-1">确定删除这条记录吗？</div>
              <div className="text-xs text-[#9A8090]">删除后无法恢复</div>
            </div>
            {/* 操作按钮 */}
            <div className="px-4 pb-4 pt-1 flex gap-3">
              <button
                className="flex-1 py-3 rounded-2xl text-[14px] font-medium transition-colors active:opacity-70"
                style={{ background: "#F5F0F2", color: "#9A8090" }}
                onClick={() => setConfirmOpen(false)}>
                取消
              </button>
              <button
                className="flex-1 py-3 rounded-2xl text-[14px] font-medium transition-colors active:opacity-70"
                style={{ background: "#F05060", color: "#fff" }}
                onClick={() => { setConfirmOpen(false); onDelete?.(); }}>
                确认删除
              </button>
            </div>
            <div className="h-2" />
          </div>
        </div>
      )}
    </>
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
