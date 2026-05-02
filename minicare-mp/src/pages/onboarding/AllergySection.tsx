/**
 * Onboarding Step 1 — 过敏信息区域
 *
 * 包含（与 Web AllergySection 一致）：
 *   - 过敏程度分段选择器（轻度/中度/重度/未知）
 *   - CDC 参考链接提示
 *   - 补充提示（生长数据可后续录入）
 *
 * 差异化：
 *   - CDC 链接：Web <a href> → MP 复制链接到剪贴板
 *   - 选项数据复用 MP constants.ts 中的 ALLERGY_LEVEL_OPTIONS（L1）
 */
import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ALLERGY_LEVEL_OPTIONS } from '@/lib/constants'
import type { AllergyLevel } from '@/api'

type AllergyLevelKey = AllergyLevel | ''

interface Props {
  allergyLevel: AllergyLevelKey
  onAllergyLevelChange: (v: AllergyLevel) => void
}

const CDC_URL = 'https://www.cdc.gov/niosh/topics/emres/allergen.html'

export default function AllergySection({
  allergyLevel,
  onAllergyLevelChange,
}: Props) {
  const handleCopyCdcLink = () => {
    Taro.setClipboardData({ data: CDC_URL })
  }

  return (
    <View className='allergy-section'>
      {/* 过敏程度分段选择器 */}
      <Text className='section-label'>过敏程度</Text>
      <View className='allergy-section__selector'>
        {ALLERGY_LEVEL_OPTIONS.map(({ value, label, activeColor }) => (
          <View
            key={value}
            className={`allergy-section__option ${allergyLevel === value ? 'allergy-section__option--active' : ''}`}
            style={allergyLevel === value ? { background: '#fff', color: activeColor, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } : { color: '#9A8090' }}
            onClick={() => onAllergyLevelChange(value as AllergyLevel)}
          >
            <Text>{label}</Text>
          </View>
        ))}
      </View>

      {/* CDC 提示 */}
      <View className='allergy-section__cdc-tip'>
        <Image
          className='allergy-section__cdc-icon'
          src='data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0Y4NzA5OCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiLz48bGluZSB4MT0iMTIiIHkxPSI4IiB4Mj0iMTIiIHkyPSIxMiIvPjxsaW5lIHgxPSIxMiIgeTE9IjE2IiB4Mj0iMTIuMDEiIHkyPSIxNiIvPjwvc3ZnPg=='
          mode='aspectFit'
        />
        <Text className='allergy-section__cdc-text'>
          不确定过敏程度？{' '}
        </Text>
        <Text className='allergy-section__cdc-link' onClick={handleCopyCdcLink}>
          [查看 CDC 评分标准]
        </Text>
        <Text className='allergy-section__cdc-text'>
          {' '}— 可先选「未知」，就诊后再更新。
        </Text>
      </View>

      {/* 补充提示 */}
      <View className='allergy-section__note'>
        <Text className='allergy-section__note-text'>
          身高、体重等生长数据可在档案创建后，通过「生长记录」模块随时补充。
        </Text>
      </View>
    </View>
  )
}
