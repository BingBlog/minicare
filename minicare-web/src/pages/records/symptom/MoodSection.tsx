/**
 * 表现记录 - 心情状态选择区域
 * 支持三种心情：开心、一般、低落
 */

const PRIMARY = "#F87098";

// Mood SVG 图标
const IconLaugh = ({ color }: { color: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 20, height: 20 }}>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 13s1.5 2 4 2 4-2 4-2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
);

const IconSmile = ({ color }: { color: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 20, height: 20 }}>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 14s1.5 1.5 4 1.5 4-1.5 4-1.5" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
);

const IconFrown = ({ color }: { color: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 20, height: 20 }}>
    <circle cx="12" cy="12" r="10" />
    <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
);

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function MoodSection({ value, onChange }: Props) {
  return (
    <div
      className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
      style={{ boxShadow: "0 1px 6px rgba(200,100,120,0.08)" }}>
      {/* 标题 */}
      <div
        className="px-4 pt-3.5 pb-2 flex items-center gap-2"
        style={{ borderBottom: "0.5px solid #F5EEF0" }}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke={PRIMARY}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: 16, height: 16 }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 1.5 4 1.5 4-1.5 4-1.5" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
        <span className="text-[13px] font-bold text-[#7A5A60]">心情状态</span>
      </div>

      {/* 选项 */}
      <div className="flex gap-2 px-4 py-3">
        <MoodButton selected={value === "happy"} onClick={() => onChange("happy")} label="开心" iconBg="#E8F5E9" icon={<IconLaugh color="#4CAF82" />} />
        <MoodButton selected={value === "normal"} onClick={() => onChange("normal")} label="一般" iconBg="#F5F0F2" icon={<IconSmile color="#9A8090" />} />
        <MoodButton selected={value === "sad"} onClick={() => onChange("sad")} label="低落" iconBg="#FFF0F4" icon={<IconFrown color={PRIMARY} />} />
      </div>
    </div>
  );
}

/** 带图标圆角方块的按钮 */
function MoodButton({
  selected,
  onClick,
  label,
  iconBg,
  icon,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  iconBg: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 flex flex-col items-center gap-1 rounded-xl transition-all"
      style={{
        padding: "10px 4px",
        border: `1.5px solid ${selected ? "#F87098" : "#EDE0E3"}`,
        background: selected ? "#FFF5F8" : "#fff",
      }}>
      <div
        className="flex items-center justify-center rounded-lg"
        style={{ width: 28, height: 28, background: iconBg }}>
        {icon}
      </div>
      <span
        className="text-[11px] font-medium"
        style={{ color: selected ? "#F87098" : "#9A8090", fontWeight: selected ? 600 : 500 }}>
        {label}
      </span>
    </button>
  );
}
