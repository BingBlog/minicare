/**
 * 健康记录 - 过敏表现区块
 *
 * 与 Web health/AllergySection.tsx 保持 1:1 业务逻辑对齐：
 *  - 9 种过敏症状 3 列网格多选
 *  - 有症状选中时展示「表现程度」（轻度/中度/重度）
 *  - 拍照占位（功能开发中）
 *
 * 差异化：
 *  - Web 使用 button + grid + Tailwind；MP 使用 View/Text + SCSS grid
 *  - 拍照用 Taro.showToast 替代 Web showToast
 */
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'

/** 过敏症状列表（9 项，与 Web 完全一致） */
const ALLERGY_SYMPTOMS = [
  '皮疹/湿疹',
  '荨麻疹',
  '腹泻',
  '呕吐',
  '鼻塞/流鼻涕',
  '打喷嚏',
  '眼睛红肿',
  '血便',
  '呼吸急促',
]

export type Severity = 'mild' | 'moderate' | 'severe'

const SEVERITY_CONFIG: {
  key: Severity
  label: string
  borderColor: string
  bgColor: string
  textColor: string
}[] = [
  { key: 'mild', label: '轻度', borderColor: '#4CAF82', bgColor: '#E8F5E9', textColor: '#2E7D32' },
  { key: 'moderate', label: '中度', borderColor: '#FF8C42', bgColor: '#FFF3E0', textColor: '#E65100' },
  { key: 'severe', label: '重度', borderColor: '#F05060', bgColor: '#FEF0F0', textColor: '#C62828' },
]

interface AllergySectionProps {
  selected: string[]
  onToggle: (s: string) => void
  severity: Severity | null
  onSeverityChange: (v: Severity | null) => void
}

export default function AllergySection({
  selected,
  onToggle,
  severity,
  onSeverityChange,
}: AllergySectionProps) {
  const handlePhotoClick = () => {
    Taro.showToast({ title: '拍照功能（功能开发中）', icon: 'none' })
  }

  return (
    <View className='health-allergy'>
      {/* 9 项网格 */}
      <View className='health-allergy__grid'>
        {ALLERGY_SYMPTOMS.map((s) => (
          <View
            key={s}
            className={`health-allergy__item ${selected.includes(s) ? 'health-allergy__item--active' : ''}`}
            onClick={() => onToggle(s)}
          >
            <Text className='health-allergy__item-text'>{s}</Text>
          </View>
        ))}
      </View>

      {/* 有症状时：表现程度 + 拍照 */}
      {selected.length > 0 ? (
        <View className='health-allergy__extra'>
          <Text className='health-allergy__extra-label'>表现程度</Text>
          <View className='health-allergy__severity'>
            {SEVERITY_CONFIG.map(({ key, label, borderColor, bgColor, textColor }) => (
              <View
                key={key}
                className='health-allergy__severity-btn'
                style={{
                  borderColor: severity === key ? borderColor : '#E5D8DA',
                  borderWidth: severity === key ? '2px' : '1.5px',
                  background: severity === key ? bgColor : '#fff',
                  color: severity === key ? textColor : '#9A8090',
                }}
                onClick={() => onSeverityChange(severity === key ? null : key)}
              >
                <Text>{label}</Text>
              </View>
            ))}
          </View>

          {/* 拍照（占位） */}
          <Text className='health-allergy__extra-label'>表现拍照（可选）</Text>
          <View className='health-allergy__photo-row'>
            <View className='health-allergy__photo-placeholder'>
              <Text className='health-allergy__photo-icon'>+</Text>
            </View>
            <View className='health-allergy__photo-add' onClick={handlePhotoClick}>
              <Text className='health-allergy__photo-icon'>+</Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}
