import { View, Text } from '@tarojs/components'
import { useLoad } from '@tarojs/taro'

import './index.scss'

export default function Index() {
  useLoad(() => {
    // eslint-disable-next-line no-console
    console.log('Page loaded.')
  })

  return (
    <View className='index'>
      <Text>敏宝日记小程序 · 开发环境就绪</Text>
    </View>
  )
}
