/**
 * 智能设备页（MP，TECH-008 §5 / PRD-004 US-01~US-03）
 *
 * - 已绑定设备列表（家庭成员可见）
 * - 管理员：添加音箱设备（生成/刷新 6 位绑定码）、解绑
 * - 普通成员：只读列表
 */
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { deviceApi, type SpeakerDevice } from '@/api'
import { getStoredFamilyId } from '@/api/http'
import { getStatusBarHeight } from '@/lib/safeArea'

import './index.scss'

function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const ICON_BACK = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%233D2B2E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
)
const ICON_SPEAKER = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23F0B8C8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="14" r="4"/><line x1="12" y1="6" x2="12.01" y2="6"/></svg>',
)
const ICON_PLUS = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
)
const ICON_COPY = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23F87098" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
)
const ICON_X = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%239A7E82" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
)

function showToast(title: string) {
  Taro.showToast({ title, icon: 'none', duration: 2000 })
}

function formatBoundAt(iso: string): string {
  if (!iso) return ''
  return iso.slice(0, 10).replace(/-/g, '.')
}

export default function DevicePage() {
  const [devices, setDevices] = useState<SpeakerDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)
  const [code, setCode] = useState('')
  const [codeLoading, setCodeLoading] = useState(false)

  // 读本地缓存的 familyId（getCurrentFamilyId 需传 families 数组，无参调用会崩溃）
  const familyId = getStoredFamilyId() || ''

  const loadDevices = async () => {
    if (!familyId) return
    setLoading(true)
    try {
      const list = await deviceApi.list(familyId)
      setDevices(list)
    } catch {
      showToast('加载设备列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const baby = Taro.getStorageSync('minicare_baby') as
      | { family_role?: string }
      | undefined
    setIsOwner(baby?.family_role === 'owner')
    loadDevices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId])

  const handleGenCode = async () => {
    if (!familyId) return
    setCodeLoading(true)
    try {
      const res = await deviceApi.genCode(familyId)
      setCode(res.code)
      if (!codeOpen) setCodeOpen(true)
    } catch {
      showToast('生成绑定码失败，请重试')
    } finally {
      setCodeLoading(false)
    }
  }

  const handleCopy = () => {
    Taro.setClipboardData({
      data: code,
      success: () => showToast('绑定码已复制'),
    })
  }

  const handleUnbind = (device: SpeakerDevice) => {
    Taro.showModal({
      title: '解绑设备',
      content: `解绑「${device.device_name}」后，音箱将立即无法使用，需重新绑定。确定解绑吗？`,
      confirmText: '解绑',
      confirmColor: '#F05060',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await deviceApi.unbind(familyId, device.id)
          showToast('已解绑')
          loadDevices()
        } catch {
          showToast('解绑失败，请重试')
        }
      },
    })
  }

  return (
    <View className='device-page'>
      <View className='device-page__header' style={{ paddingTop: `${getStatusBarHeight() + 8}px` }}>
        <View className='device-page__nav'>
          <View className='device-page__back' onClick={() => Taro.navigateBack()}>
            <Image src={ICON_BACK} className='device-page__back-icon' />
          </View>
          <Text className='device-page__title'>智能设备</Text>
          <View className='device-page__nav-spacer' />
        </View>
      </View>

      <ScrollView scrollY className='device-page__body'>
        {loading ? (
          <View className='device-page__empty'>
            <Text className='device-page__empty-loading'>加载中…</Text>
          </View>
        ) : devices.length === 0 ? (
          <View className='device-page__empty'>
            <Text className='device-page__empty-title'>暂无绑定设备</Text>
            <Text className='device-page__empty-desc'>
              {isOwner ? '点击下方按钮，为家庭添加一台音箱' : '请联系家庭管理员添加音箱设备'}
            </Text>
          </View>
        ) : (
          devices.map((d) => (
            <View key={d.id} className='device-card'>
              <View className='device-card__icon'>
                <Image src={ICON_SPEAKER} className='device-card__icon-img' />
              </View>
              <View className='device-card__info'>
                <View className='device-card__row'>
                  <Text className='device-card__name'>{d.device_name}</Text>
                  <Text className='device-card__badge'>已绑定</Text>
                </View>
                <Text className='device-card__sub'>
                  {d.device_type || '音箱'} · 绑定于 {formatBoundAt(d.bound_at)}
                </Text>
                {d.last_seen_at && (
                  <Text className='device-card__sub'>最近活跃 {formatBoundAt(d.last_seen_at)}</Text>
                )}
              </View>
              {isOwner && (
                <View className='device-card__unbind' onClick={() => handleUnbind(d)}>
                  解绑
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {isOwner && (
        <View className='device-page__footer'>
          <View className='device-page__add-btn' onClick={() => (codeOpen ? setCodeOpen(true) : handleGenCode())}>
            <Image src={ICON_PLUS} className='device-page__add-icon' />
            <Text>添加音箱设备</Text>
          </View>
        </View>
      )}

      {/* 绑定码弹层 */}
      {codeOpen && (
        <View className='device-sheet-overlay' onClick={() => setCodeOpen(false)}>
          <View className='device-sheet' onClick={(e) => e.stopPropagation()}>
            <View className='device-sheet__head'>
              <Text className='device-sheet__title'>添加音箱设备</Text>
              <View className='device-sheet__close' onClick={() => setCodeOpen(false)}>
                <Image src={ICON_X} className='device-sheet__close-icon' />
              </View>
            </View>
            <Text className='device-sheet__tip'>音箱配网时，在屏幕上输入以下绑定码完成家庭绑定</Text>
            <View className='device-sheet__code'>
              {codeLoading ? '生成中…' : code}
            </View>
            <View className='device-sheet__note'>永久有效 · 绑定成功后自动失效</View>
            <View className='device-sheet__actions'>
              <View className='device-sheet__copy' onClick={handleCopy}>
                <Image src={ICON_COPY} className='device-sheet__copy-icon' />
                <Text>复制绑定码</Text>
              </View>
              <View className='device-sheet__regen' onClick={handleGenCode}>
                {codeLoading ? '生成中…' : '重新生成'}
              </View>
            </View>
            <Text className='device-sheet__warn'>重新生成后，旧绑定码将立即作废</Text>
          </View>
        </View>
      )}
    </View>
  )
}
