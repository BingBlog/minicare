import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './index.css'
import { router } from './router'
import { AppConfigContext, useAppConfigProvider } from './lib/useAppConfig'

/**
 * 全局配置 Provider
 * 在 RouterProvider 外层预加载应用配置，供所有页面通过 useAppConfig() 消费
 */
function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const value = useAppConfigProvider()
  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  )
}

createRoot(document.getElementById('root')!).render(
  <AppConfigProvider>
    <RouterProvider router={router} />
  </AppConfigProvider>
)
