/**
 * 宝宝日记 · 详情/编辑页（P3，TECH-006 §2.8.4 / M5 §3）
 *
 * 展示：正文 + 图片墙 + 数据摘要提示；编辑：文字 + 相册选图（COS 直传）+ 保存；
 * 「重新生成」跳对话页预置消息（当天已有日记时先确认覆盖）。
 */
import { View, Text, Image, Textarea } from '@tarojs/components'
import Taro, { useDidShow, getCurrentInstance } from '@tarojs/taro'
import { useCallback, useState } from 'react'
import dayjs from 'dayjs'
import NavBar from '@/components/NavBar/NavBar'
import ConfirmSheet from '@/components/ConfirmSheet'
import { babyApi } from '@/api/baby'
import { agentDiaryApi, type DiaryDetail } from '@/api/agent'
import { getToken, getStoredFamilyId, setCurrentBabyId, getStoredBabyId } from '@/api/http'
import { uploadOne, fetchTempUrls } from '@/lib/uploadImage'
import './detail.scss'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const ICON_EDIT = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#E8507A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>')}`
const ICON_REGEN = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#E8507A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>')}`
const ICON_ADD = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#F87098" stroke-width="2" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>')}`

function friendlyDate(dateStr: string): string {
  const d = dayjs(dateStr)
  return d.isValid() ? `${d.month() + 1}月${d.date()}日 星期${WEEKDAYS[d.day()]}` : dateStr
}

export default function DiaryDetailPage() {
  const [familyId, setFamilyId] = useState('')
  const [babyId, setBabyId] = useState('')
  const [babyName, setBabyName] = useState('宝宝')
  const [date, setDate] = useState('')
  const [detail, setDetail] = useState<DiaryDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [guard, setGuard] = useState<'guest' | 'onboarding' | ''>('')

  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [editPhotos, setEditPhotos] = useState<string[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [regenConfirm, setRegenConfirm] = useState(false)
  const [exitConfirm, setExitConfirm] = useState(false)

  const loadDetail = useCallback(async (fid: string, bid: string, d: string) => {
    try {
      const item = await agentDiaryApi.detail(fid, bid, d)
      setDetail(item)
      if (item && item.photo_ids.length > 0) {
        fetchTempUrls(item.photo_ids).then((urlMap) => {
          const next: Record<string, string> = {}
          urlMap.forEach((url, fileId) => {
            next[fileId] = url
          })
          setPhotoUrls((prev) => ({ ...prev, ...next }))
        })
      }
    } catch {
      setDetail(null)
    }
  }, [])

  useDidShow(() => {
    if (!getToken()) {
      setGuard('guest')
      setLoading(false)
      return
    }
    const fid = getStoredFamilyId()
    if (!fid) {
      setGuard('onboarding')
      setLoading(false)
      return
    }
    const params = getCurrentInstance()?.router?.params ?? {}
    const d = (params.date as string) || dayjs().format('YYYY-MM-DD')
    setDate(d)
    setFamilyId(fid)
    ;(async () => {
      try {
        const list = await babyApi.list(fid)
        if (list.length === 0) {
          setGuard('onboarding')
          setLoading(false)
          return
        }
        const storedId = getStoredBabyId()
        const current = list.find((b) => b.id === storedId) ?? list[0]
        setBabyId(current.id)
        setBabyName(current.name || '宝宝')
        setCurrentBabyId(current.id)
        setGuard('')
        await loadDetail(fid, current.id, d)
      } catch {
        setGuard('onboarding')
      } finally {
        setLoading(false)
      }
    })()
  })

  // ── 编辑 ──
  const startEdit = useCallback(() => {
    if (!detail) return
    setEditText(detail.content)
    setEditPhotos([...detail.photo_ids])
    setEditing(true)
  }, [detail])

  const handleAddPhotos = useCallback(async () => {
    if (!babyId) return
    try {
      const res = await Taro.chooseImage({
        count: 6 - editPhotos.length,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })
      for (const path of res.tempFilePaths) {
        const fileId = await uploadOne('diary', babyId, path)
        setEditPhotos((prev) => (prev.includes(fileId) ? prev : [...prev, fileId]))
      }
    } catch {
      Taro.showToast({ title: '图片上传失败，请重试', icon: 'none' })
    }
  }, [babyId, editPhotos.length])

  const handleSave = useCallback(async () => {
    const content = editText.trim()
    if (!content || !detail || !familyId) return
    setSaving(true)
    try {
      await agentDiaryApi.update(detail.id, {
        family_id: familyId,
        content,
        photo_ids: editPhotos,
      })
      setDetail((prev) => (prev ? { ...prev, content, photo_ids: editPhotos } : prev))
      setEditing(false)
      Taro.showToast({ title: '日记已保存', icon: 'success' })
      Taro.eventCenter.trigger('diary:changed')
    } catch (err) {
      Taro.showToast({ title: err instanceof Error ? err.message : '保存失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }, [editText, editPhotos, detail, familyId])

  // ── 重新生成（跳对话页预置消息；已有日记先确认）──
  const goRegen = useCallback(() => {
    Taro.navigateTo({ url: '/pages/chat/index?preset=diary' })
  }, [])

  const handleRegen = useCallback(() => {
    if (detail) {
      setRegenConfirm(true)
    } else {
      goRegen()
    }
  }, [detail, goRegen])

  // ── 编辑中退出保护 ──
  const handleBack = useCallback(() => {
    if (editing && (editText !== detail?.content || JSON.stringify(editPhotos) !== JSON.stringify(detail?.photo_ids))) {
      setExitConfirm(true)
      return
    }
    Taro.navigateBack({ delta: 1 })
  }, [editing, editText, editPhotos, detail])

  if (loading) {
    return (
      <View className='diary-detail-page'>
        <NavBar title={`${babyName}的日记`} showBack onBack={handleBack} />
        <View className='diary-detail-loading'>
          <View className='diary-detail-loading__spinner' />
          <Text className='diary-detail-loading__text'>加载中...</Text>
        </View>
      </View>
    )
  }

  if (guard === 'guest' || guard === 'onboarding') {
    return (
      <View className='diary-detail-page'>
        <NavBar title='宝宝日记' showBack />
        <View className='diary-detail-guard'>
          <Text className='diary-detail-guard__title'>
            {guard === 'guest' ? '登录后即可查看日记' : '请先创建宝宝档案'}
          </Text>
          <View
            className='diary-detail-guard__btn'
            onClick={() =>
              guard === 'guest'
                ? Taro.reLaunch({ url: '/pages/login/index' })
                : Taro.navigateTo({ url: '/pages/onboarding/index' })
            }
          >
            <Text className='diary-detail-guard__btn-text'>
              {guard === 'guest' ? '立即登录' : '创建宝宝档案'}
            </Text>
          </View>
        </View>
      </View>
    )
  }

  if (!detail) {
    return (
      <View className='diary-detail-page'>
        <NavBar title={`${babyName}的日记`} showBack onBack={handleBack} />
        <View className='diary-detail-empty'>
          <Text className='diary-detail-empty__title'>{friendlyDate(date)}</Text>
          <Text className='diary-detail-empty__desc'>这一天还没有日记</Text>
          <View className='diary-detail-empty__btn' onClick={goRegen}>
            <Text className='diary-detail-empty__btn-text'>和敏宝助手写一篇</Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className='diary-detail-page'>
      <NavBar title={`${babyName}的日记`} showBack onBack={handleBack} />

      <View className='diary-detail-content'>
        <Text className='diary-detail-date'>{friendlyDate(detail.diary_date)}</Text>

        {editing ? (
          <View className='diary-detail-edit'>
            <Textarea
              className='diary-detail-edit__area'
              value={editText}
              maxlength={2000}
              autoHeight
              placeholder='写下今天的故事…'
              placeholderClass='diary-detail-edit__placeholder'
              onInput={(e) => setEditText(e.detail.value)}
            />
            {/* 图片管理 */}
            <View className='diary-detail-edit__photos'>
              {editPhotos.map((fileId) => (
                <View key={fileId} className='diary-detail-edit__photo-wrap'>
                  <Image
                    className='diary-detail-edit__photo'
                    src={photoUrls[fileId] || fileId}
                    mode='aspectFill'
                    onClick={() => Taro.previewImage({ urls: editPhotos.map((f) => photoUrls[f] || f), current: photoUrls[fileId] || fileId })}
                  />
                  <View
                    className='diary-detail-edit__photo-del'
                    onClick={() => setEditPhotos((prev) => prev.filter((f) => f !== fileId))}
                  >
                    <Text className='diary-detail-edit__photo-del-text'>×</Text>
                  </View>
                </View>
              ))}
              {editPhotos.length < 6 ? (
                <View className='diary-detail-edit__photo-add' onClick={handleAddPhotos}>
                  <Image className='diary-detail-edit__photo-add-icon' src={ICON_ADD} mode='aspectFit' />
                  <Text className='diary-detail-edit__photo-add-text'>加照片</Text>
                </View>
              ) : null}
            </View>
            <View className='diary-detail-edit__actions'>
              <View className='diary-detail-edit__btn diary-detail-edit__btn--cancel' onClick={() => setEditing(false)}>
                <Text>取消</Text>
              </View>
              <View className='diary-detail-edit__btn diary-detail-edit__btn--save' onClick={handleSave}>
                <Text>{saving ? '保存中…' : '保存'}</Text>
              </View>
            </View>
          </View>
        ) : (
          <>
            <View className='diary-detail-body'>
              <Text className='diary-detail-body__text'>{detail.content}</Text>
            </View>

            {detail.photo_ids.length > 0 ? (
              <View className='diary-detail-photos'>
                {detail.photo_ids.map((fileId) => (
                  <Image
                    key={fileId}
                    className='diary-detail-photos__img'
                    src={photoUrls[fileId] || fileId}
                    mode='aspectFill'
                    onClick={() =>
                      Taro.previewImage({
                        urls: detail.photo_ids.map((f) => photoUrls[f] || f),
                        current: photoUrls[fileId] || fileId,
                      })
                    }
                  />
                ))}
              </View>
            ) : null}

            <View className='diary-detail-tip'>
              <Text className='diary-detail-tip__text'>日记由当天记录与对话内容生成，可随时编辑</Text>
            </View>

            <View className='diary-detail-ops'>
              <View className='diary-detail-ops__btn' onClick={startEdit}>
                <Image className='diary-detail-ops__icon' src={ICON_EDIT} mode='aspectFit' />
                <Text className='diary-detail-ops__text'>编辑日记</Text>
              </View>
              <View className='diary-detail-ops__btn' onClick={handleRegen}>
                <Image className='diary-detail-ops__icon' src={ICON_REGEN} mode='aspectFit' />
                <Text className='diary-detail-ops__text'>重新生成</Text>
              </View>
            </View>
          </>
        )}
      </View>

      <ConfirmSheet
        open={regenConfirm}
        title='重新生成日记'
        desc='重新生成将覆盖当天已有日记，确定继续吗？'
        confirmText='重新生成'
        danger={false}
        onConfirm={() => {
          setRegenConfirm(false)
          goRegen()
        }}
        onCancel={() => setRegenConfirm(false)}
      />

      <ConfirmSheet
        open={exitConfirm}
        title='有未保存的修改'
        desc='退出后修改将丢失，确定退出吗？'
        confirmText='放弃修改'
        onConfirm={() => {
          setExitConfirm(false)
          Taro.navigateBack({ delta: 1 })
        }}
        onCancel={() => setExitConfirm(false)}
      />
    </View>
  )
}
