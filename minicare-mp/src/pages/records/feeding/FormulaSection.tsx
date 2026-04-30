import { View, Text } from '@tarojs/components'
import type { MilkType } from './types'
import { milkTypeOptions, AMOUNT_CHIPS } from './types'
import { formatScoop } from '@/lib/scoopUtils'

interface Props {
  selectedMilkTypes: Set<MilkType>
  onToggleMilkType: (key: MilkType) => void
  scoops: Record<MilkType, number>
  onUpdateScoop: (key: MilkType, val: number) => void
  formulaMl: number
  onChangeFormulaMl: (v: number) => void
  loadedFromLast: boolean
  ratioExpanded: boolean
  onSetRatioExpanded: (v: boolean) => void
  onResetToDefault: () => void
  isEditMode: boolean
}

export default function FormulaSection({
  selectedMilkTypes,
  onToggleMilkType,
  scoops,
  onUpdateScoop,
  formulaMl,
  onChangeFormulaMl,
  loadedFromLast,
  ratioExpanded,
  onSetRatioExpanded,
  onResetToDefault,
  isEditMode,
}: Props) {
  const totalScoops = Object.values(scoops).reduce((a, b) => a + b, 0)

  return (
    <>
      {/* 奶量 */}
      <View className='feed-section-label'><Text>奶量</Text></View>
      <View className='feed-card'>
        <View className='feed-chips'>
          {AMOUNT_CHIPS.map((amt) => (
            <View
              key={amt}
              className={`feed-chip ${formulaMl === amt ? 'feed-chip--active' : ''}`}
              onClick={() => onChangeFormulaMl(amt)}
            >
              <Text className='feed-chip__text'>{amt}ml</Text>
            </View>
          ))}
        </View>
        <View className='feed-stepper'>
          <View className='feed-stepper__btn' onClick={() => onChangeFormulaMl(Math.max(10, formulaMl - 10))}>
            <Text className='feed-stepper__btn-text'>-</Text>
          </View>
          <Text className='feed-stepper__val'>{formulaMl}</Text>
          <View className='feed-stepper__btn' onClick={() => onChangeFormulaMl(Math.min(400, formulaMl + 10))}>
            <Text className='feed-stepper__btn-text'>+</Text>
          </View>
          <Text className='feed-stepper__unit'>ml</Text>
        </View>
      </View>

      {/* 上次配方 */}
      {loadedFromLast && !isEditMode && (
        <View className='feed-last-card'>
          <View className='feed-last-card__head'>
            <Text className='feed-last-card__star'>*</Text>
            <Text className='feed-last-card__title'>已复用上次配方</Text>
            <View className='feed-last-card__ops'>
              <View className='feed-last-card__reset' onClick={onResetToDefault}>
                <Text className='feed-last-card__reset-text'>重置</Text>
              </View>
              <View
                className={`feed-last-card__toggle ${ratioExpanded ? 'feed-last-card__toggle--open' : ''}`}
                onClick={() => onSetRatioExpanded(!ratioExpanded)}
              >
                <Text className='feed-last-card__toggle-text'>{ratioExpanded ? '收起' : '调整比例'}</Text>
              </View>
            </View>
          </View>
          {!ratioExpanded && (
            <View className='feed-last-card__summary'>
              {(() => {
                const active = milkTypeOptions.filter((m) => selectedMilkTypes.has(m.key) && scoops[m.key] > 0)
                return active.length === 0
                  ? <Text className='feed-last-card__empty'>配方奶</Text>
                  : active.map((m) => (
                      <View key={m.key} className='feed-last-card__milk'>
                        <View className='feed-last-card__dot' style={{ background: m.color }} />
                        <Text className='feed-last-card__milk-label' style={{ color: m.color }}>{m.label}</Text>
                        <Text className='feed-last-card__milk-scoop' style={{ color: m.color }}>{formatScoop(scoops[m.key])}</Text>
                        <Text className='feed-last-card__milk-unit'>勺</Text>
                      </View>
                    ))
              })()}
              <View className='feed-last-card__ml'>
                <Text className='feed-last-card__ml-text'>奶量 </Text>
                <Text className='feed-last-card__ml-val'>{formulaMl}</Text>
                <Text className='feed-last-card__ml-unit'> ml</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {(ratioExpanded || !loadedFromLast || isEditMode) && (
        <>
          {/* 奶粉类型多选 */}
          <View className='feed-section-label'><Text>奶粉类型（可多选）</Text></View>
          <View className='feed-card'>
            <View className='feed-milk-grid'>
              {milkTypeOptions.map((m, idx) => {
                const sel = selectedMilkTypes.has(m.key)
                return (
                  <View
                    key={m.key}
                    className={`feed-milk-opt ${idx === milkTypeOptions.length - 1 ? 'feed-milk-opt--full' : ''} ${sel ? 'feed-milk-opt--sel' : ''}`}
                    style={sel ? { borderColor: m.color, background: m.color + '15' } : {}}
                    onClick={() => onToggleMilkType(m.key)}
                  >
                    <View className='feed-milk-opt__inner'>
                      <Text className='feed-milk-opt__name' style={sel ? { color: m.color } : {}}>{m.label}</Text>
                      <Text className='feed-milk-opt__desc'>{m.desc}</Text>
                    </View>
                    <View className={`feed-milk-opt__check ${sel ? 'feed-milk-opt__check--on' : ''}`} style={sel ? { background: m.color } : {}}>
                      {sel && <Text className='feed-milk-opt__check-mark'>v</Text>}
                    </View>
                  </View>
                )
              })}
            </View>
          </View>

          {/* 配比 */}
          {selectedMilkTypes.size > 0 && (
            <>
              <View className='feed-section-label'><Text>配比记录（转奶期混用时填写）</Text></View>
              <View className='feed-card'>
                <View className='feed-ratio-list'>
                  {milkTypeOptions.filter((m) => selectedMilkTypes.has(m.key)).map((m) => (
                    <View key={m.key} className='feed-ratio-item'>
                      <View className='feed-ratio-item__head'>
                        <View className='feed-ratio-item__dot' style={{ background: m.color }} />
                        <Text className='feed-ratio-item__name' style={{ color: m.color }}>{m.label}</Text>
                      </View>
                      <ScoopInput
                        value={scoops[m.key]}
                        color={m.color}
                        onChange={(v) => onUpdateScoop(m.key, v)}
                      />
                    </View>
                  ))}
                </View>
                {totalScoops > 0 && (
                  <View className='feed-ratio-tip'>
                    <Text className='feed-ratio-tip__text'>
                      {(() => {
                        const active = milkTypeOptions.filter((m) => scoops[m.key] > 0)
                        const parts = active.map((m) => `${m.label} ${formatScoop(scoops[m.key])}勺`)
                        const pcts = active.map((m) => Math.round((scoops[m.key] / totalScoops) * 100) + '%')
                        return `当前配比：${parts.join(' + ')}（共 ${formatScoop(totalScoops)} 勺），比例 ${pcts.join(' : ')}`
                      })()}
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// ScoopInput（配方奶勺数步进组件，与 Web FormulaSection 中一致）
// ---------------------------------------------------------------------------
const FRAC_OPTIONS: { label: string; val: number }[] = [
  { label: '0', val: 0 },
  { label: '1/4', val: 0.25 },
  { label: '1/3', val: 1 / 3 },
  { label: '1/2', val: 0.5 },
  { label: '2/3', val: 2 / 3 },
  { label: '3/4', val: 0.75 },
]

function splitScoop(val: number): { whole: number; frac: number } {
  const whole = Math.floor(val + 1e-9)
  const frac = val - whole
  const matched = FRAC_OPTIONS.find((f) => Math.abs(f.val - frac) < 1e-6)
  return { whole, frac: matched ? matched.val : 0 }
}

function ScoopInput({
  value, color, onChange,
}: {
  value: number; color: string; onChange: (v: number) => void;
}) {
  const { whole, frac } = splitScoop(value)

  const setWhole = (n: number) => {
    const clamped = Math.max(0, Math.min(20, n))
    onChange(clamped + frac)
  }
  const setFrac = (f: number) => {
    onChange(whole + f)
  }

  return (
    <View className='scoop-input'>
      <View className='scoop-input__row'>
        <View className='scoop-input__btn' onClick={() => setWhole(whole - 1)}>
          <Text className={`scoop-input__btn-text ${whole <= 0 ? 'scoop-input__btn-text--disabled' : ''}`}>-</Text>
        </View>
        <Text className='scoop-input__val'>{whole}</Text>
        <View className='scoop-input__btn' onClick={() => setWhole(whole + 1)}>
          <Text className={`scoop-input__btn-text ${whole >= 20 ? 'scoop-input__btn-text--disabled' : ''}`}>+</Text>
        </View>
        <Text className='scoop-input__unit'>勺</Text>
        {value > 0 && (
          <Text className='scoop-input__preview' style={{ color }}>
            = {formatScoop(value)} 勺
          </Text>
        )}
      </View>
      <View className='scoop-input__frac-row'>
        {FRAC_OPTIONS.map((opt) => {
          const active = Math.abs(opt.val - frac) < 1e-6
          return (
            <View
              key={opt.label}
              className={`scoop-input__frac ${active ? 'scoop-input__frac--active' : ''}`}
              style={active ? { borderColor: color, background: color + '18', color } : {}}
              onClick={() => setFrac(opt.val)}
            >
              <Text className='scoop-input__frac-text'>{opt.label}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}
