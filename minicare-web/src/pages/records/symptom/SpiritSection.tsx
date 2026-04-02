/**
 * 表现记录 - 精神状态选择区域（三分类卡片式）
 *
 * 依据婴儿精神状态三分类：
 *   good       → 状态良好（active）   绿色
 *   fussy      → 烦躁不安（tired）    橙色  ← 前端用 "fussy" 映射后端 "tired"
 *   lethargic  → 萎靡嗜睡（lethargic）红色（需警惕）
 */

interface Props {
  value: string;
  onChange: (v: string) => void;
}

// ─── 图标 ───────────────────────────────────────────────────────
const IconGood = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 13s1.5 2 4 2 4-2 4-2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
);

const IconFussy = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 15s1.5-1.5 4-1.5 4 1.5 4 1.5" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
    {/* 眉毛皱起 */}
    <path d="M8 7.5 Q9 6.5 10 7.5" strokeWidth="1.5" />
    <path d="M14 7.5 Q15 6.5 16 7.5" strokeWidth="1.5" />
  </svg>
);

const IconLethargic = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <circle cx="12" cy="12" r="10" />
    {/* 半睁眼 */}
    <path d="M7 9.5 Q9 8 11 9.5" strokeWidth="1.5" />
    <path d="M13 9.5 Q15 8 17 9.5" strokeWidth="1.5" />
    {/* 嘴微张 */}
    <ellipse cx="12" cy="15" rx="3" ry="1.5" strokeWidth="1.5" />
    {/* zzz 符号 */}
    <text x="16" y="6" style={{ fontSize: 5, fill: color, stroke: 'none' }}>z</text>
  </svg>
);

// ─── 配置 ───────────────────────────────────────────────────────
const SPIRIT_OPTIONS = [
  {
    key: 'good',
    label: '状态良好',
    sublabel: '眼神灵活 · 吃奶正常 · 哭声有力',
    details: ['清醒时会看人追物', '手脚活动多，被逗有反应', '睡眠规律，醒后情绪平稳'],
    color: '#2D9F6B',
    bgColor: '#E8F7F0',
    borderColor: '#B5E5CE',
    activeBorder: '#2D9F6B',
    activeBg: '#F0FAF5',
    badgeColor: '#2D9F6B',
    badgeBg: '#D4F0E4',
    badgeLabel: '正常',
    Icon: IconGood,
  },
  {
    key: 'fussy',
    label: '烦躁不安',
    sublabel: '持续哭闹 · 难以安抚 · 睡不踏实',
    details: ['一惊一乍，抱也哭放也哭', '可能是饿了、胀气、发烧或疼痛'],
    color: '#C47B1A',
    bgColor: '#FFF8ED',
    borderColor: '#F5D9A0',
    activeBorder: '#DDB870',
    activeBg: '#FFFAF0',
    badgeColor: '#C47B1A',
    badgeBg: '#FDECC8',
    badgeLabel: '留意',
    Icon: IconFussy,
  },
  {
    key: 'lethargic',
    label: '萎靡嗜睡',
    sublabel: '难以叫醒 · 眼神呆滞 · 拒绝吃奶',
    details: ['四肢发软，反应迟钝', '⚠️ 可能提示生病、脱水，建议就医'],
    color: '#D94040',
    bgColor: '#FFF3F3',
    borderColor: '#F5C0C0',
    activeBorder: '#F05060',
    activeBg: '#FFF8F8',
    badgeColor: '#D94040',
    badgeBg: '#FFE0E0',
    badgeLabel: '警惕',
    Icon: IconLethargic,
  },
] as const;

export default function SpiritSection({ value, onChange }: Props) {
  return (
    <div className="mx-4 mb-3">
      {/* 标题行 */}
      <div className="flex items-center gap-2 mb-2 px-0.5">
        <svg viewBox="0 0 24 24" fill="none" stroke="#DDB870" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <span className="text-[13px] font-bold text-[#7A5A60]">精神状态</span>
        <span className="text-[11px] text-[#B09098] ml-auto">选一项最符合的</span>
      </div>

      {/* 卡片列表 */}
      <div className="flex flex-col gap-2">
        {SPIRIT_OPTIONS.map((opt) => {
          const selected = value === opt.key;
          const { Icon } = opt;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange(opt.key)}
              className="w-full text-left rounded-2xl transition-all"
              style={{
                background: selected ? opt.activeBg : opt.bgColor,
                border: `1.5px solid ${selected ? opt.activeBorder : opt.borderColor}`,
                boxShadow: selected
                  ? `0 2px 10px ${opt.activeBorder}28`
                  : '0 1px 4px rgba(0,0,0,0.04)',
                padding: '12px 14px',
              }}>
              <div className="flex items-start gap-3">
                {/* 图标 */}
                <div
                  className="flex-shrink-0 flex items-center justify-center rounded-xl"
                  style={{
                    width: 44,
                    height: 44,
                    background: selected ? `${opt.activeBorder}18` : `${opt.color}12`,
                    border: `1.5px solid ${selected ? opt.activeBorder : opt.borderColor}`,
                  }}>
                  <Icon color={selected ? opt.activeBorder : opt.color} />
                </div>

                {/* 文字 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className="text-[14px] font-bold"
                      style={{ color: selected ? opt.activeBorder : '#4A3035' }}>
                      {opt.label}
                    </span>
                    {/* 严重度徽章 */}
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ color: opt.badgeColor, background: opt.badgeBg }}>
                      {opt.badgeLabel}
                    </span>
                  </div>
                  <p className="text-[12px] leading-relaxed" style={{ color: '#7A5A60' }}>
                    {opt.sublabel}
                  </p>
                  {/* 展开提示（选中后显示详情） */}
                  {selected && (
                    <ul className="mt-1.5 flex flex-col gap-0.5">
                      {opt.details.map((d, i) => (
                        <li key={i} className="text-[11px] leading-relaxed" style={{ color: opt.color }}>
                          {d}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* 选中指示器 */}
                <div
                  className="flex-shrink-0 flex items-center justify-center rounded-full"
                  style={{
                    width: 20,
                    height: 20,
                    marginTop: 2,
                    background: selected ? opt.activeBorder : 'transparent',
                    border: `2px solid ${selected ? opt.activeBorder : opt.borderColor}`,
                  }}>
                  {selected && (
                    <svg viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5"
                      strokeLinecap="round" strokeLinejoin="round"
                      style={{ width: 10, height: 10 }}>
                      <polyline points="2 6 5 9 10 3" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
