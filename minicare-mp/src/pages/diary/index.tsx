/**
 * 宝宝日记 · 列表页（P3，TECH-006 §2.8.4 / M5 §3）
 *
 * 按日期倒序展示日记卡片（日期 + 首句摘要 + 首图），支持月份切换；
 * 「写日记」跳对话页预置消息生成；点击卡片进详情。
 */
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useCallback, useState } from 'react'
import dayjs from 'dayjs'
import NavBar from '@/components/NavBar/NavBar'
import { babyApi } from '@/api/baby'
import { agentDiaryApi, type DiaryItem } from '@/api/agent'
import { getToken, getStoredFamilyId, setCurrentBabyId, getStoredBabyId } from '@/api/http'
import { fetchTempUrls } from '@/lib/uploadImage'
import { toDateOnly, yesterdayStr } from '@/lib/utils'
import './index.scss'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function friendlyDate(dateStr: string): string {
  const d = dayjs(dateStr)
  return d.isValid() ? `${d.month() + 1}月${d.date()}日 星期${WEEKDAYS[d.day()]}` : dateStr
}

export default function DiaryListPage() {
  const [familyId, setFamilyId] = useState('')
  const [babyId, setBabyId] = useState('')
  const [babyName, setBabyName] = useState('宝宝')
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'))
  const [items, setItems] = useState<DiaryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [guard, setGuard] = useState<'guest' | 'onboarding' | ''>('')
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})

  const loadDiary = useCallback(
    async (fid: string, bid: string, mon: string) => {
      try {
        const list = await agentDiaryApi.list(fid, bid, mon)
        setItems(list)
        // 首图临时 URL
        const firstPhotos = list.map((item) => item.first_photo).filter((p): p is string => !!p)
        if (firstPhotos.length > 0) {
          fetchTempUrls(firstPhotos).then((urlMap) => {
            setThumbUrls((prev) => {
              const next = { ...prev }
              urlMap.forEach((url, fid2) => {
                next[fid2] = url
              })
              return next
            })
          })
        }
      } catch {
        setItems([])
      }
    },
    [],
  )

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
        setLoading(false)
        await loadDiary(fid, current.id, month)
      } catch {
        setGuard('onboarding')
        setLoading(false)
      }
    })()
  })

  // 月份切换（重新拉取该月列表）
  const changeMonth = useCallback(
    (delta: number) => {
      const next = dayjs(`${month}-01`).add(delta, 'month').format('YYYY-MM')
      setMonth(next)
      if (familyId && babyId) {
        setLoading(true)
        loadDiary(familyId, babyId, next).finally(() => setLoading(false))
      }
    },
    [month, familyId, babyId, loadDiary],
  )

  // 缺省目标是「昨天」：日记是当日回顾式总结，当天数据还不全。
  // 显式带 date 参数，使对话页不必依赖 prompt 规则也能拿到正确日期。
  const goWrite = useCallback(() => {
    if (!familyId || !babyId) return
    Taro.navigateTo({ url: `/pages/chat/index?preset=diary&date=${yesterdayStr()}` })
  }, [familyId, babyId])

  if (loading && items.length === 0) {
    return (
      <View className='diary-page'>
        <NavBar title={`${babyName}的日记`} showBack />
        <View className='diary-loading'>
          <View className='diary-loading__spinner' />
          <Text className='diary-loading__text'>加载中...</Text>
        </View>
      </View>
    )
  }

  if (guard === 'guest') {
    return (
      <View className='diary-page'>
        <NavBar title='宝宝日记' showBack />
        <View className='diary-guard'>
          <Text className='diary-guard__title'>登录后即可查看日记</Text>
          <View className='diary-guard__btn' onClick={() => Taro.reLaunch({ url: '/pages/login/index' })}>
            <Text className='diary-guard__btn-text'>立即登录</Text>
          </View>
        </View>
      </View>
    )
  }

  if (guard === 'onboarding') {
    return (
      <View className='diary-page'>
        <NavBar title='宝宝日记' showBack />
        <View className='diary-guard'>
          <Text className='diary-guard__title'>请先创建宝宝档案</Text>
          <View className='diary-guard__btn' onClick={() => Taro.navigateTo({ url: '/pages/onboarding/index' })}>
            <Text className='diary-guard__btn-text'>创建宝宝档案</Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className='diary-page'>
      <NavBar title={`${babyName}的日记`} showBack />

      {/* 月份切换栏 */}
      <View className='diary-head'>
        <View className='diary-head__month'>
          <View className='diary-head__arrow' onClick={() => changeMonth(-1)}>
            <Text className='diary-head__arrow-text'>‹</Text>
          </View>
          <Text className='diary-head__month-text'>{month}</Text>
          <View className='diary-head__arrow' onClick={() => changeMonth(1)}>
            <Text className='diary-head__arrow-text'>›</Text>
          </View>
        </View>
        <View className='diary-head__write' onClick={goWrite}>
          <Text className='diary-head__write-text'>＋ 写日记</Text>
        </View>
      </View>

      <ScrollView className='diary-list' scrollY>
        <View className='diary-list__inner'>
          {loading ? (
            <View className='diary-loading' style={{ paddingTop: 60 }}>
              <View className='diary-loading__spinner' />
            </View>
          ) : items.length === 0 ? (
            <View className='diary-empty'>
              <Text className='diary-empty__title'>这个月还没有日记</Text>
              <Text className='diary-empty__desc'>和敏宝助手说一句「帮我写昨天的日记」吧</Text>
              <View className='diary-empty__btn' onClick={goWrite}>
                <Text className='diary-empty__btn-text'>去写一篇</Text>
              </View>
            </View>
          ) : (
            items.map((item) => (
              <View
                key={item.id}
                className='diary-card'
                onClick={() =>
                  Taro.navigateTo({
                    // toDateOnly 兜底：后端 DATE 列若未收口会输出 ISO 串，
                    // 直接拼进 URL 会被详情接口的正则拒收（列表点不进详情的根因）
                    url: `/pages/diary/detail?date=${toDateOnly(item.diary_date)}`,
                  })
                }
              >
                <View className='diary-card__left'>
                  <Text className='diary-card__date'>{friendlyDate(item.diary_date)}</Text>
                  <Text className='diary-card__excerpt'>{item.excerpt || '（空日记）'}</Text>
                  {item.photo_count > 0 ? (
                    <Text className='diary-card__count'>共 {item.photo_count} 张照片</Text>
                  ) : null}
                </View>
                {item.first_photo && thumbUrls[item.first_photo] ? (
                  <Image className='diary-card__thumb' src={thumbUrls[item.first_photo]} mode='aspectFill' />
                ) : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  )
}
