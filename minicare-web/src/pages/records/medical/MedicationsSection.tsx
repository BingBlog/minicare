/**
 * 医疗记录 - 用药记录区域（可动态添加/删除药品）
 */

const IconPlus = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 16, height: 16 }}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconTrash = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 16, height: 16 }}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

export interface Medication {
  name: string;
  dose: string;
}

interface Props {
  medications: Medication[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onUpdate: (i: number, field: keyof Medication, val: string) => void;
}

export default function MedicationsSection({ medications, onAdd, onRemove, onUpdate }: Props) {
  return (
    <div
      className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
      style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
      {/* 标题与添加按钮 */}
      <div
        className="flex items-center justify-between px-4 pt-3.5 pb-2"
        style={{ borderBottom: "0.5px solid #F5EEF0" }}>
        <span className="text-[13px] font-bold text-[#7A5A60]">用药记录（可选）</span>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg"
          style={{ background: "#FFF5F8", color: "#F87098" }}>
          <IconPlus />
          添加
        </button>
      </div>

      {medications.length === 0 ? (
        <div className="px-4 py-4 text-[13px] text-[#9A8090] text-center">点击「添加」记录用药信息</div>
      ) : (
        medications.map((med, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-4 py-3"
            style={{ borderBottom: i < medications.length - 1 ? "0.5px solid #F5EEF0" : "none" }}>
            <input
              type="text"
              value={med.name}
              onChange={(e) => onUpdate(i, "name", e.target.value)}
              placeholder="药品名称"
              className="flex-1 text-[13px] text-[#4A3035] outline-none"
              style={{ background: "transparent" }}
            />
            <input
              type="text"
              value={med.dose}
              onChange={(e) => onUpdate(i, "dose", e.target.value)}
              placeholder="剂量（如 5ml）"
              className="w-24 text-[13px] text-[#4A3035] outline-none text-right"
              style={{ background: "transparent" }}
            />
            <button type="button" onClick={() => onRemove(i)} className="text-[#F05060] flex-shrink-0 ml-1">
              <IconTrash />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
