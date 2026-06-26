import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'

import './app.scss'
// #ifdef H5
import './styles/h5-global.scss'
// #endif

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // eslint-disable-next-line no-console
    console.log('App launched.')
  })

  return children
}

export default App
