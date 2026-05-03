/**
 * 表现记录 - 精神状态选择区域（三分类卡片式）
 *
 * 与 Web pages/records/symptom/SpiritSection.tsx 保持 1:1 业务逻辑对齐。
 *
 * 依据婴儿精神状态三分类：
 *   good       → 状态良好（active）   绿色
 *   fussy      → 烦躁不安（tired）    橙色  ← 前端用 "fussy" 映射后端 "tired"
 *   lethargic  → 萎靡嗜睡（lethargic）红色（需警惕）
 *
 * 差异化：
 *  - Web 使用 button + Tailwind + 内联 SVG；MP 使用 View/Text/Image + SCSS + Data URI
 */
import { View, Text, Image } from '@tarojs/components'

interface SpiritSectionProps {
  value: string
  onChange: (v: string) => void
}

// ─── SVG 图标 Data URI ───────────────────────────────────────────
const ICON_GOOD = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>')}`
const ICON_FUSSY = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/><path d="M8 15s1.5-1.5 4-1.5 4 1.5 4 1.5"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/><path d="M8 7.5Q9 6.5 10 7.5" stroke-width="1.5"/><path d="M14 7.5Q15 6.5 16 7.5" stroke-width="1.5"/></svg>')}`
const ICON_LETHARGIC = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/><path d="M7 9.5Q9 8 11 9.5" stroke-width="1.5"/><path d="M13 9.5Q15 8 17 9.5" stroke-width="1.5"/><ellipse cx="12" cy="15" rx="3" ry="1.5" stroke-width="1.5"/></svg>')}`

// ─── 配置（与 Web SPIRIT_OPTIONS 完全一致） ─────────────────────
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
    icon: ICON_GOOD,
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
    icon: ICON_FUSSY,
  },
  {
    key: 'lethargic',
    label: '萎靡嗜睡',
    sublabel: '难以叫醒 · 眼神呆滞 · 拒绝吃奶',
    details: ['四肢发软，反应迟钝', '[注意] 可能提示生病、脱水，建议就医'],
    color: '#D94040',
    bgColor: '#FFF3F3',
    borderColor: '#F5C0C0',
    activeBorder: '#F05060',
    activeBg: '#FFF8F8',
    badgeColor: '#D94040',
    badgeBg: '#FFE0E0',
    badgeLabel: '警惕',
    icon: ICON_LETHARGIC,
  },
] as const

/** 标题行星星图标 (stroke #DDB870) */
const ICON_STAR = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#DDB870" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>')}`

export default function SpiritSection({ value, onChange }: SpiritSectionProps) {
  return (
    <View className='symptom-spirit'>
      {/* 标题行 */}
      <View className='symptom-spirit__header'>
        <Image className='symptom-spirit__header-icon' src={ICON_STAR} />
        <Text className='symptom-spirit__header-title'>精神状态</Text>
        <Text className='symptom-spirit__header-hint'>选一项最符合的</Text>
      </View>

      {/* 卡片列表 */}
      <View className='symptom-spirit__list'>
        {SPIRIT_OPTIONS.map((opt) => {
          const selected = value === opt.key
          return (
            <View
              key={opt.key}
              className='symptom-card'
              style={{
                background: selected ? opt.activeBg : opt.bgColor,
                border: `1.5px solid ${selected ? opt.activeBorder : opt.borderColor}`,
                boxShadow: selected
                  ? `0 2px 10px ${opt.activeBorder}28`
                  : '0 1px 4px rgba(0,0,0,0.04)',
              }}
              onClick={() => onChange(opt.key)}
            >
              <View className='symptom-card__body'>
                {/* 图标 */}
                <View
                  className='symptom-card__icon-wrap'
                  style={{
                    background: selected ? `${opt.activeBorder}18` : `${opt.color}12`,
                    border: `1.5px solid ${selected ? opt.activeBorder : opt.borderColor}`,
                  }}
                >
                  <Image
                    className='symptom-card__icon'
                    src={opt.icon.replace('currentColor', selected ? opt.activeBorder : opt.color)}
                  />
                </View>

                {/* 文字 */}
                <View className='symptom-card__text'>
                  <View className='symptom-card__title-row'>
                    <Text
                      className='symptom-card__label'
                      style={{ color: selected ? opt.activeBorder : '#4A3035' }}
                    >
                      {opt.label}
                    </Text>
                    <Text
                      className='symptom-card__badge'
                      style={{ color: opt.badgeColor, background: opt.badgeBg }}
                    >
                      {opt.badgeLabel}
                    </Text>
                  </View>
                  <Text className='symptom-card__sublabel'>{opt.sublabel}</Text>
                  {/* 选中后展示详情 */}
                  {selected ? (
                    <View className='symptom-card__details'>
                      {opt.details.map((d, i) => (
                        <Text key={i} className='symptom-card__detail' style={{ color: opt.color }}>
                          {d}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>

                {/* 选中指示器 */}
                <View
                  className='symptom-card__check'
                  style={{
                    background: selected ? opt.activeBorder : 'transparent',
                    border: `2px solid ${selected ? opt.activeBorder : opt.borderColor}`,
                  }}
                >
                  {selected ? (
                    <Image
                      className='symptom-card__check-icon'
                      src={`data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><polyline points="2 6 5 9 10 3"/></svg>')}`}
                    />
                  ) : null}
                </View>
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}
