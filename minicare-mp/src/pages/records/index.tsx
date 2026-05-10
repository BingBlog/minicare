import { View, Text } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { getStatusBarHeight } from '@/lib/safeArea'

import './index.scss'

const MP_ROUTE_MAP: Record<string, string> = {
  '/records': '/pages/records/list/index',
  '/records/form/feeding': '/pages/records/feeding/index',
  '/records/form/diaper': '/pages/records/diaper/index',
  '/records/form/sleep': '/pages/records/sleep/index',
  '/records/form/growth': '/pages/records/growth/index',
  '/records/form/health': '/pages/records/health/index',
  '/records/form/medical': '/pages/records/medical/index',
  '/records/form/activity': '/pages/records/activity/index',
  '/records/form/symptom': '/pages/records/symptom/index',
  '/profile': '/pages/profile/index',
  '/home': '/pages/home/index',
}

/** tabBar 页面集合 — navigateTo 无法跳转到 tabBar 页面，必须用 switchTab */
const TAB_BAR_PAGES = new Set([
  '/pages/home/index',
  '/pages/records/list/index',
  '/pages/profile/index',
])

function safeDecode(value?: string): string {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function normalizeTarget(rawTarget: string): string {
  const target = rawTarget.trim()
  if (!target) return '/records'
  return target.startsWith('/') ? target : `/${target}`
}

function splitTarget(target: string): { path: string; query: string } {
  const [path, query = ''] = target.split('?')
  return { path, query }
}

export default function RecordsPage() {
  const params = Taro.getCurrentInstance().router?.params ?? {}
  const decodedTarget = safeDecode(params.target as string | undefined)
  const target = normalizeTarget(decodedTarget || '/records')
  const recordId = (params.recordId as string | undefined) ?? ''
  const from = (params.from as string | undefined) ?? ''
  const { path: targetPath, query: targetQuery } = splitTarget(target)
  const isTargetValid = targetPath.startsWith('/records') || targetPath === '/home' || targetPath === '/profile'
  const mappedPage = MP_ROUTE_MAP[targetPath]
  const canDispatch = Boolean(isTargetValid && mappedPage && mappedPage !== '/pages/records/index')

  const dispatchToTarget = () => {
    if (!canDispatch || !mappedPage) return

    // tabBar 页面必须用 switchTab（不支持 query 参数，但 tabBar 页面本身不需要）
    if (TAB_BAR_PAGES.has(mappedPage)) {
      Taro.switchTab({ url: mappedPage })
      return
    }

    const queryParts: string[] = []
    if (targetQuery) queryParts.push(targetQuery)
    if (recordId) queryParts.push(`recordId=${encodeURIComponent(recordId)}`)
    const query = queryParts.length ? `?${queryParts.join('&')}` : ''
    Taro.navigateTo({ url: `${mappedPage}${query}` })
  }

  useLoad(() => {
    // eslint-disable-next-line no-console
    console.log('[records] open', { target, targetPath, recordId, from, mappedPage, canDispatch, isTargetValid })
    if (canDispatch) dispatchToTarget()
  })

  return (
    <View className='records-page' style={{ paddingTop: `${getStatusBarHeight() + 40}px` }}>
      <Text className='records-page__title'>{isTargetValid ? '记录页（部分迁移）' : '无效跳转目标'}</Text>
      <Text className='records-page__desc'>目标路由：{target}</Text>
      {recordId ? <Text className='records-page__desc'>编辑记录ID：{recordId}</Text> : null}
      {from ? <Text className='records-page__desc'>来源：{from}</Text> : null}
      <View className='records-page__panel'>
        {canDispatch ? (
          <Text className='records-page__hint'>正在分发到已迁移页面...</Text>
        ) : isTargetValid ? (
          <>
            <Text className='records-page__hint'>目标页面尚未迁移，当前按白名单差异降级展示。</Text>
            <Text className='records-page__hint'>后续迁移完成后会自动分发，无需改 home 入口。</Text>
          </>
        ) : (
          <Text className='records-page__hint'>target 不在允许范围，已阻止跳转以避免异常链路。</Text>
        )}
      </View>
      <View className='records-page__actions'>
        <View className='records-page__btn records-page__btn--ghost' onClick={() => Taro.reLaunch({ url: '/pages/home/index' })}>
          <Text className='records-page__btn-text records-page__btn-text--ghost'>返回首页</Text>
        </View>
        <View
          className='records-page__btn records-page__btn--primary'
          onClick={() => {
            if (canDispatch) {
              dispatchToTarget()
              return
            }
            Taro.showToast({ title: '该目标页尚未迁移', icon: 'none' })
          }}
        >
          <Text className='records-page__btn-text'>继续处理目标</Text>
        </View>
      </View>
    </View>
  )
}
