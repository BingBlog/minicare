/**
 * 表现记录 - 精神状态选择区域
 * 支持四种精神状态：安静、正常、活跃、嗜睡
 */

const PRIMARY = "#F87098";

// Spirit SVG 图标
const IconPause = ({ color }: { color: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 20, height: 20 }}>
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);

const IconPlay = ({ color }: { color: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 20, height: 20 }}>
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const IconTrendingUp = ({ color }: { color: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 20, height: 20 }}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

const IconMoon = ({ color }: { color: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: 20, height: 20 }}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function SpiritSection({ value, onChange }: Props) {
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
          stroke="#DDB870"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: 16, height: 16 }}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <span className="text-[13px] font-bold text-[#7A5A60]">精神状态</span>
      </div>

      {/* 选项 */}
      <div className="flex gap-2 px-4 py-3">
        <SpiritButton selected={value === "calm"} onClick={() => onChange("calm")} label="安静" iconBg="#E8F5E9" icon={<IconPause color="#4CAF82" />} />
        <SpiritButton selected={value === "normal"} onClick={() => onChange("normal")} label="正常" iconBg="#FFF8E6" icon={<IconPlay color="#DDB870" />} />
        <SpiritButton selected={value === "active"} onClick={() => onChange("active")} label="活跃" iconBg="#FFF0F4" icon={<IconTrendingUp color={PRIMARY} />} />
        <SpiritButton selected={value === "sleepy"} onClick={() => onChange("sleepy")} label="嗜睡" iconBg="#EEF0FF" icon={<IconMoon color="#7B68EE" />} />
      </div>
    </div>
  );
}

/** 带图标圆角方块的按钮 */
function SpiritButton({
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
