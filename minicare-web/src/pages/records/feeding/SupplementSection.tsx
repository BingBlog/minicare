/**
 * 饮食记录 - 营养素 Tab 内容
 *
 * 统一展示所有营养素（不再区分必吃/看情况）：
 *  - 维生素D、铁、钙、DHA、维生素AD、锌、益生菌、维生素C
 *  - 末尾附「其他」自由输入行，支持个性化营养素记录
 * 每行：勾选框 + 名称(+提示) + 剂量输入框 + 单位
 */
import { suppItems } from "./types";

interface Props {
  /** 各营养素是否已勾选 */
  checked: Record<string, boolean>;
  /** 各营养素剂量输入值（字符串，保留输入中间态） */
  dose: Record<string, string>;
  /** 切换某营养素勾选状态 */
  onToggle: (key: string) => void;
  /** 更新某营养素剂量 */
  onDoseChange: (key: string, val: string) => void;
  /** 「其他」行：自定义名称 */
  otherName: string;
  onOtherNameChange: (val: string) => void;
  /** 「其他」行：剂量 */
  otherDose: string;
  onOtherDoseChange: (val: string) => void;
  /** 「其他」行：单位 */
  otherUnit: string;
  onOtherUnitChange: (val: string) => void;
  /** 紧凑模式（抽屉中使用）：两列网格布局 */
  compact?: boolean;
}

function SuppRow({
  s,
  checked,
  dose,
  isLast,
  onToggle,
  onDoseChange,
}: {
  s: (typeof suppItems)[number];
  checked: boolean;
  dose: string;
  isLast: boolean;
  onToggle: (key: string) => void;
  onDoseChange: (key: string, val: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-2.5 px-4 py-3 relative"
      style={{
        borderBottom: isLast ? "none" : "0.5px solid #F5EEF0",
      }}>
      {/* 勾选框 */}
      <button
        type="button"
        onClick={() => onToggle(s.key)}
        className="w-5 h-5 rounded-[6px] border-2 flex items-center justify-center flex-shrink-0 transition-all"
        style={{
          borderColor: checked ? "#F87098" : "#D0C0C4",
          background: checked ? "#F87098" : "#fff",
        }}>
        {checked && (
          <span className="text-white text-[11px] font-bold leading-none">
            ✓
          </span>
        )}
      </button>

      {/* 营养素名称 + hint */}
      <div className="flex-1 min-w-0">
        <span className="text-[14px] font-medium text-[#4A3035] block leading-snug">
          {s.label}
        </span>
        {s.hint && (
          <span className="text-[11px] text-[#B09098] block leading-tight mt-0.5">
            {s.hint}
          </span>
        )}
      </div>

      {/* 剂量输入 */}
      <input
        type="text"
        inputMode="decimal"
        placeholder="剂量"
        value={dose || ""}
        onChange={(e) =>
          onDoseChange(s.key, e.target.value.replace(/[^0-9.]/g, ""))
        }
        className="w-16 text-center text-[13px] text-[#4A3035] bg-[#FAF5F6] rounded-lg border outline-none"
        style={{ borderColor: "#E5D8DA", padding: "5px 6px" }}
      />

      {/* 单位 */}
      <span className="text-[12px] text-[#9A8090] w-8 text-left">{s.unit}</span>
    </div>
  );
}

export default function SupplementSection({
  checked,
  dose,
  onToggle,
  onDoseChange,
  otherName,
  onOtherNameChange,
  otherDose,
  onOtherDoseChange,
  otherUnit,
  onOtherUnitChange,
  compact,
}: Props) {
  return (
    <>
      {/* ── 营养素列表 ─────── */}
      <div className="px-4 mb-1">
        <span className="text-[12px] font-semibold text-[#9A8090]">
          营养素记录
        </span>
      </div>
      <div
        className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
        {compact ? (
          /* 紧凑模式：两列网格 */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            {suppItems.map((s) => {
              const isChecked = !!checked[s.key];
              return (
                <div
                  key={s.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 10px',
                    borderBottom: '0.5px solid #F5EEF0',
                    borderRight: '0.5px solid #F5EEF0',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onToggle(s.key)}
                    style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      border: `2px solid ${isChecked ? '#F87098' : '#D0C0C4'}`,
                      background: isChecked ? '#F87098' : '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', padding: 0,
                    }}
                  >
                    {isChecked && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: 1 }}>\u2713</span>}
                  </button>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#4A3035', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.label}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="-"
                    value={dose[s.key] || ''}
                    onChange={(e) => onDoseChange(s.key, e.target.value.replace(/[^0-9.]/g, ''))}
                    style={{
                      width: 36, textAlign: 'center', fontSize: 11, color: '#4A3035',
                      background: '#FAF5F6', borderRadius: 6, border: '1px solid #E5D8DA',
                      outline: 'none', padding: '3px 2px',
                    }}
                  />
                  <span style={{ fontSize: 10, color: '#9A8090', width: 20 }}>{s.unit}</span>
                </div>
              );
            })}
          </div>
        ) : (
          /* 标准模式：单列列表 */
          <>
            {suppItems.map((s, idx) => (
              <SuppRow
                key={s.key}
                s={s}
                checked={!!checked[s.key]}
                dose={dose[s.key] || ""}
                isLast={false}
                onToggle={onToggle}
                onDoseChange={onDoseChange}
              />
            ))}
          </>
        )}

        {/* ── 其他（自由输入） ─────────────────────────────── */}
        <div
          className="flex items-center gap-2.5 px-4 py-3"
          style={{ borderTop: "0.5px solid #F5EEF0" }}>
          {/* 占位对齐勾选框位置的小标签 */}
          <span
            className="w-5 h-5 rounded-[6px] flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
            style={{ background: "#F5EEF0", color: "#C09098" }}>
            +
          </span>

          {/* 自定义名称 */}
          <input
            type="text"
            placeholder="其他营养素名称"
            value={otherName}
            onChange={(e) => onOtherNameChange(e.target.value)}
            className="flex-1 min-w-0 text-[13px] text-[#4A3035] bg-[#FAF5F6] rounded-lg border outline-none"
            style={{ borderColor: "#E5D8DA", padding: "5px 8px" }}
          />

          {/* 剂量 */}
          <input
            type="text"
            inputMode="decimal"
            placeholder="剂量"
            value={otherDose}
            onChange={(e) =>
              onOtherDoseChange(e.target.value.replace(/[^0-9.]/g, ""))
            }
            className="w-14 text-center text-[13px] text-[#4A3035] bg-[#FAF5F6] rounded-lg border outline-none"
            style={{ borderColor: "#E5D8DA", padding: "5px 6px" }}
          />

          {/* 单位（可自由输入） */}
          <input
            type="text"
            placeholder="单位"
            value={otherUnit}
            onChange={(e) => onOtherUnitChange(e.target.value.slice(0, 4))}
            className="w-10 text-center text-[12px] text-[#9A8090] bg-[#FAF5F6] rounded-lg border outline-none"
            style={{ borderColor: "#E5D8DA", padding: "5px 4px" }}
          />
        </div>
      </div>
    </>
  );
}
