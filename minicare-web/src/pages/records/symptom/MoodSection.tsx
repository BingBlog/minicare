/**
 * 表现记录 - 心情状态选择区域（四分类卡片式）
 *
 * 婴儿心情四分类：
 *   happy   → 愉悦满足   绿色
 *   neutral → 平静舒适   灰蓝色（正常待机）
 *   fussy   → 烦躁不开心  橙色
 *   crying  → 痛苦极度不舒服  红色（需关注）
 */

const PRIMARY = "#F87098";

// ─── 图标 ───────────────────────────────────────────────────────
const IconHappy = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 13s1.5 2.5 4 2.5 4-2.5 4-2.5" />
    <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="3" />
    <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="3" />
  </svg>
);

const IconNeutral = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <circle cx="12" cy="12" r="10" />
    <line x1="8" y1="15" x2="16" y2="15" />
    <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="3" />
    <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="3" />
  </svg>
);

const IconFussy = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 16s1.5-2 4-2 4 2 4 2" />
    <path d="M8 7.5 Q9 6.5 10 7.5" strokeWidth="1.5" />
    <path d="M14 7.5 Q15 6.5 16 7.5" strokeWidth="1.5" />
    <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2.5" />
    <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2.5" />
  </svg>
);

const IconCrying = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 17s1.5-2.5 4-2.5 4 2.5 4 2.5" />
    <path d="M8 8 Q9 6.5 10 8" strokeWidth="1.5" />
    <path d="M14 8 Q15 6.5 16 8" strokeWidth="1.5" />
    {/* 泪水 */}
    <path d="M9.5 11 Q9 13.5 9.5 15" strokeWidth="1.5" />
    <path d="M14.5 11 Q15 13.5 14.5 15" strokeWidth="1.5" />
  </svg>
);

// ─── 配置 ───────────────────────────────────────────────────────
const MOOD_OPTIONS = [
  {
    key: 'happy',
    label: '愉悦满足',
    sublabel: '笑出声 · 眼神明亮 · 手脚轻松舞动',
    details: ['愿意看人、追视、互动', '吃奶睡觉都安稳'],
    color: '#2D9F6B',
    bgColor: '#E8F7F0',
    borderColor: '#B5E5CE',
    activeBorder: '#2D9F6B',
    activeBg: '#F0FAF5',
    badgeColor: '#2D9F6B',
    badgeBg: '#D4F0E4',
    badgeLabel: '开心',
    Icon: IconHappy,
  },
  {
    key: 'neutral',
    label: '平静舒适',
    sublabel: '不哭不闹 · 眼神温和 · 呼吸平稳',
    details: ['自己安静看东西、发呆', '身体不紧绷，属于正常待机'],
    color: '#5A7A9A',
    bgColor: '#EEF4FA',
    borderColor: '#C0D5E8',
    activeBorder: '#4A7DB5',
    activeBg: '#F0F6FC',
    badgeColor: '#4A7DB5',
    badgeBg: '#DCEAF7',
    badgeLabel: '平静',
    Icon: IconNeutral,
  },
  {
    key: 'fussy',
    label: '烦躁不开心',
    sublabel: '哼唧小哭 · 身体扭动蹬腿 · 睡不踏实',
    details: ['容易惊跳、打挺', '多是困了、饿了、胀气或想被抱'],
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
    key: 'crying',
    label: '痛苦哭闹',
    sublabel: '尖叫大哭 · 怎么哄都没用 · 蜷缩身体',
    details: ['脸色涨红、眉头紧锁', '⚠️ 可能是肚子痛、发烧或受惊，需关注'],
    color: '#D94040',
    bgColor: '#FFF3F3',
    borderColor: '#F5C0C0',
    activeBorder: PRIMARY,
    activeBg: '#FFF8F8',
    badgeColor: '#D94040',
    badgeBg: '#FFE0E0',
    badgeLabel: '关注',
    Icon: IconCrying,
  },
] as const;

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function MoodSection({ value, onChange }: Props) {
  return (
    <div className="mx-4 mb-3">
      {/* 标题行 */}
      <div className="flex items-center gap-2 mb-2 px-0.5">
        <svg viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 1.5 4 1.5 4-1.5 4-1.5" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
        <span className="text-[13px] font-bold text-[#7A5A60]">心情状态</span>
        <span className="text-[11px] text-[#B09098] ml-auto">选一项最符合的</span>
      </div>

      {/* 卡片列表 */}
      <div className="flex flex-col gap-2">
        {MOOD_OPTIONS.map((opt) => {
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
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ color: opt.badgeColor, background: opt.badgeBg }}>
                      {opt.badgeLabel}
                    </span>
                  </div>
                  <p className="text-[12px] leading-relaxed" style={{ color: '#7A5A60' }}>
                    {opt.sublabel}
                  </p>
                  {/* 选中后展示详情 */}
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
