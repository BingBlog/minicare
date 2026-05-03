/**
 * 表现记录 - 心情状态选择区域（四分类卡片式）
 *
 * 与 Web pages/records/symptom/MoodSection.tsx 保持 1:1 业务逻辑对齐。
 *
 * 婴儿心情四分类：
 *   happy   → 愉悦满足   绿色
 *   neutral → 平静舒适   灰蓝色（正常待机）
 *   fussy   → 烦躁不开心  橙色
 *   crying  → 痛苦极度不舒服  红色（需关注）
 *
 * 差异化：
 *  - Web 使用 button + Tailwind + 内联 SVG；MP 使用 View/Text/Image + SCSS + Data URI
 */
import { View, Text, Image } from '@tarojs/components'

const PRIMARY = '#F87098'

interface MoodSectionProps {
  value: string
  onChange: (v: string) => void
}

// ─── SVG 图标 Data URI ───────────────────────────────────────────
const ICON_HAPPY = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2.5 4 2.5 4-2.5 4-2.5"/><line x1="9" y1="9" x2="9.01" y2="9" stroke-width="3"/><line x1="15" y1="9" x2="15.01" y2="9" stroke-width="3"/></svg>')}`
const ICON_NEUTRAL = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="9" y1="9" x2="9.01" y2="9" stroke-width="3"/><line x1="15" y1="9" x2="15.01" y2="9" stroke-width="3"/></svg>')}`
const ICON_FUSSY = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/><path d="M8 16s1.5-2 4-2 4 2 4 2"/><path d="M8 7.5Q9 6.5 10 7.5" stroke-width="1.5"/><path d="M14 7.5Q15 6.5 16 7.5" stroke-width="1.5"/><line x1="9" y1="9" x2="9.01" y2="9" stroke-width="2.5"/><line x1="15" y1="9" x2="15.01" y2="9" stroke-width="2.5"/></svg>')}`
const ICON_CRYING = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/><path d="M8 17s1.5-2.5 4-2.5 4 2.5 4 2.5"/><path d="M8 8Q9 6.5 10 8" stroke-width="1.5"/><path d="M14 8Q15 6.5 16 8" stroke-width="1.5"/><path d="M9.5 11Q9 13.5 9.5 15" stroke-width="1.5"/><path d="M14.5 11Q15 13.5 14.5 15" stroke-width="1.5"/></svg>')}`

// ─── 配置（与 Web MOOD_OPTIONS 完全一致） ────────────────────────
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
    icon: ICON_HAPPY,
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
    icon: ICON_NEUTRAL,
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
    icon: ICON_FUSSY,
  },
  {
    key: 'crying',
    label: '痛苦哭闹',
    sublabel: '尖叫大哭 · 怎么哄都没用 · 蜷缩身体',
    details: ['脸色涨红、眉头紧锁', '[注意] 可能是肚子痛、发烧或受惊，需关注'],
    color: '#D94040',
    bgColor: '#FFF3F3',
    borderColor: '#F5C0C0',
    activeBorder: PRIMARY,
    activeBg: '#FFF8F8',
    badgeColor: '#D94040',
    badgeBg: '#FFE0E0',
    badgeLabel: '关注',
    icon: ICON_CRYING,
  },
] as const

/** 标题行笑脸图标 (stroke #F87098) */
const ICON_SMILE = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#F87098" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 1.5 4 1.5 4-1.5 4-1.5"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>')}`

export default function MoodSection({ value, onChange }: MoodSectionProps) {
  return (
    <View className='symptom-mood'>
      {/* 标题行 */}
      <View className='symptom-mood__header'>
        <Image className='symptom-mood__header-icon' src={ICON_SMILE} />
        <Text className='symptom-mood__header-title'>心情状态</Text>
        <Text className='symptom-mood__header-hint'>选一项最符合的</Text>
      </View>

      {/* 卡片列表 */}
      <View className='symptom-mood__list'>
        {MOOD_OPTIONS.map((opt) => {
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
