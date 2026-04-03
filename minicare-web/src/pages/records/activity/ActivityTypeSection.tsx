/**
 * 活动记录 - 活动类型选择卡片
 *
 * 6 种活动类型 2×3 网格布局
 * 图标均使用内联 SVG，避免 emoji 渲染差异
 *
 * 未来新增活动类型：只需在 ACTIVITY_OPTIONS 数组中追加一项，无需任何数据迁移。
 */

type ActivityType =
  | 'gross_motor'
  | 'fine_motor'
  | 'edu_play'
  | 'outdoor'
  | 'daily_care'
  | 'other';

/** 大运动练习：奔跑人形（翻身/爬行/站走等大肌肉运动） */
const IconGrossMotor = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    {/* 头 */}
    <circle cx="13" cy="4" r="2" />
    {/* 躯干 */}
    <path d="M11 8 L10 14" />
    {/* 手臂（张开奔跑） */}
    <path d="M10 10 L6 8" />
    <path d="M10 10 L14 8" />
    {/* 腿（跨步奔跑） */}
    <path d="M10 14 L7 19" />
    <path d="M10 14 L14 18" />
  </svg>
);

/** 精细运动练习：手指捏取动作 */
const IconFineMotor = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    {/* 手掌轮廓 */}
    <path d="M8 18 Q6 18 6 16 L6 10 Q6 9 7 9 Q8 9 8 10 L8 13" />
    {/* 食指 */}
    <path d="M8 10 Q8 7 10 7 Q12 7 12 10 L12 13" />
    {/* 中指 */}
    <path d="M12 10 Q12 7 14 7 Q16 7 16 10 L16 13" />
    {/* 无名指 */}
    <path d="M16 11 Q16 9 17.5 9 Q19 9 19 11 L19 14" />
    {/* 掌心连接 */}
    <path d="M8 13 Q8 17 11 18 L14 18 Q18 18 19 14" />
  </svg>
);

/** 亲子早教互动：书本/对话泡 */
const IconEduPlay = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    {/* 书本 */}
    <path d="M4 19 Q4 5 12 5 Q20 5 20 19" />
    <line x1="12" y1="5" x2="12" y2="19" />
    {/* 对话泡（右上角小气泡） */}
    <path d="M14 2 Q14 2 18 2 Q20 2 20 4 Q20 6 18 6 L16 6 L15 8 L15 6 Q14 6 14 4 Z" />
  </svg>
);

/** 户外活动：太阳 + 光线 */
const IconOutdoor = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    <circle cx="12" cy="12" r="4" />
    <line x1="12" y1="2"    x2="12" y2="4"    />
    <line x1="12" y1="20"   x2="12" y2="22"   />
    <line x1="4.22" y1="4.22"   x2="5.64" y2="5.64"   />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="2"  y1="12"   x2="4"  y2="12"   />
    <line x1="20" y1="12"   x2="22" y2="12"   />
    <line x1="4.22" y1="19.78"  x2="5.64" y2="18.36"  />
    <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"  />
  </svg>
);

/** 日常护理：水滴/沐浴 */
const IconDailyCare = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    {/* 浴缸 */}
    <path d="M2 11 L22 11" />
    <path d="M2 11 Q2 16 5 18 L5 20" />
    <path d="M22 11 Q22 16 19 18 L19 20" />
    <path d="M3 18 L21 18" />
    {/* 水龙头 */}
    <path d="M9 6 L9 11" />
    <path d="M9 6 Q9 4 11 4 L11 11" />
  </svg>
);

/** 其他活动：星形 */
const IconOther = ({ color }: { color: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const ACTIVITY_OPTIONS: {
  key: ActivityType;
  label: string;
  sub: string;
  Icon: React.ComponentType<{ color: string }>;
  color: string;
  bg: string;
}[] = [
  {
    key: 'gross_motor',
    label: '大运动练习',
    sub: '翻身/爬行/站走',
    Icon: IconGrossMotor,
    color: '#F87098',
    bg: '#FFF0F4',
  },
  {
    key: 'fine_motor',
    label: '精细运动练习',
    sub: '抓握/捏取/拼搭',
    Icon: IconFineMotor,
    color: '#9B59B6',
    bg: '#F5EEF8',
  },
  {
    key: 'edu_play',
    label: '亲子早教互动',
    sub: '早教/故事/音乐',
    Icon: IconEduPlay,
    color: '#E67E22',
    bg: '#FEF9EC',
  },
  {
    key: 'outdoor',
    label: '户外活动',
    sub: '散步/日晒/自然',
    Icon: IconOutdoor,
    color: '#C0922A',
    bg: '#FFFDE7',
  },
  {
    key: 'daily_care',
    label: '日常护理',
    sub: '洗澡/抚触/换衣',
    Icon: IconDailyCare,
    color: '#4A90D9',
    bg: '#EEF6FF',
  },
  {
    key: 'other',
    label: '其他活动',
    sub: '自由记录',
    Icon: IconOther,
    color: '#9B8ED8',
    bg: '#F3F0FF',
  },
];

interface Props {
  value: ActivityType;
  onChange: (v: ActivityType) => void;
}

export default function ActivityTypeSection({ value, onChange }: Props) {
  return (
    <div
      className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden"
      style={{ boxShadow: '0 1px 6px rgba(200,100,120,0.08)' }}>
      {/* 卡片头部 */}
      <div
        className="flex items-center gap-2 px-4 pt-3.5 pb-2"
        style={{ borderBottom: '0.5px solid #F5EEF0' }}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#DDB870"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: 16, height: 16 }}>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <span className="text-[12px] font-semibold text-[#B09098]">活动类型</span>
      </div>

      {/* 2×3 网格布局 */}
      <div className="grid grid-cols-3 gap-2 px-3 py-3">
        {ACTIVITY_OPTIONS.map(({ key, label, sub, Icon, color, bg }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border transition-all active:scale-95"
            style={{
              borderColor: value === key ? color : '#E5D8DA',
              background: value === key ? bg : '#fff',
            }}>
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: value === key ? bg : '#F5F0F2' }}>
              <Icon color={value === key ? color : '#B09098'} />
            </span>
            <span
              className="text-[13px] font-extrabold leading-tight text-center"
              style={{ color: value === key ? color : '#4A3035' }}>
              {label}
            </span>
            <span
              className="text-[11px] leading-tight text-center"
              style={{ color: value === key ? color : '#9A8090' }}>
              {sub}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
