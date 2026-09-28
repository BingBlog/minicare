import { PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'

import './app.scss'
// #ifdef H5
import './styles/h5-global.scss'
// #endif

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // eslint-disable-next-line no-console
    console.log('App launched.')

    // 兜底：拦截未捕获的 Promise rejection，静默掉「请求被中止」类错误。
    // 终止会话 / 页面销毁 / 切后台时框架会 abort 挂起的请求，
    // 这类 rejection 属正常生命周期行为，不应作为错误上报。
    // #ifndef H5
    Taro.onUnhandledRejection((res) => {
      const reason = res?.reason
      const message =
        typeof reason === 'string' ? reason : (reason?.errMsg as string | undefined) ?? reason?.message ?? ''
      if (message.includes('abort')) {
        return
      }
      // eslint-disable-next-line no-console
      console.error('[minicare] UnhandledRejection:', res)
    })
    // #endif
  })

  return children
}

export default App
