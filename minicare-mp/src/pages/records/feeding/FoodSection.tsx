import { View, Text, Input } from '@tarojs/components'

interface Props {
  foodList: string[]
  inputValue: string
  onInputChange: (v: string) => void
  onAdd: () => void
  onRemove: (idx: number) => void
}

export default function FoodSection({
  foodList,
  inputValue,
  onInputChange,
  onAdd,
  onRemove,
}: Props) {
  return (
    <>
      <View className='feed-section-label'><Text>辅食记录</Text></View>
      {/* 已添加 */}
      {foodList.length > 0 && (
        <View className='feed-card'>
          <View className='feed-food-chips'>
            {foodList.map((food, idx) => (
              <View key={idx} className='feed-food-chip'>
                <Text className='feed-food-chip__text'>{food}</Text>
                <View className='feed-food-chip__del' onClick={() => onRemove(idx)}>
                  <Text className='feed-food-chip__del-text'>x</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
      {/* 输入框 */}
      <View className='feed-card'>
        <View className='feed-food-input-row'>
          <Input
            className='feed-food-input'
            placeholder='输入辅食名称，如：南瓜'
            value={inputValue}
            onInput={(e) => onInputChange(e.detail.value)}
            onConfirm={onAdd}
          />
          <View className='feed-food-add' onClick={onAdd}>
            <Text className='feed-food-add__text'>+</Text>
          </View>
        </View>
      </View>
    </>
  )
}
