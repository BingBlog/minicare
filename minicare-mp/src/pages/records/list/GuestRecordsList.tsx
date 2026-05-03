/**
 * GuestRecordsList — 游客模式记录列表（模拟数据）
 *
 * 使用与真实列表完全相同的 RecordGroup + RecordListItem 组件渲染，
 * 构造 2 天的模拟记录数据展示 UI 样例，点击任何记录弹出登录提示。
 * 底部保留 LoginGuide 按钮引导登录。
 */
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import dayjs from 'dayjs'
import RecordGroup from './RecordGroup'
import LoginGuide from '@/components/LoginGuide/LoginGuide'
import type { RecordItem } from '@/api/types'

/** 构造模拟记录 — 字段与 API RecordItem 格式一致 */
function makeMock(
  id: string,
  type: string,
  time: string,
  extra: Record<string, unknown> = {},
): RecordItem {
  return { id, type, created_at: time, start_time: time, ...extra } as RecordItem
}

const TODAY = dayjs().format('YYYY-MM-DD')
const YESTERDAY = dayjs().subtract(1, 'day').format('YYYY-MM-DD')

const DEMO_RECORDS: RecordItem[] = [
  // 今天
  makeMock('demo-1', 'feeding', `${TODAY}T08:30:00`, {
    feed_type: 'formula', formula_ml: 150, milk_types: ['aa'], milk_scoops: { aa: 5 },
  }),
  makeMock('demo-2', 'feeding', `${TODAY}T06:00:00`, {
    feed_type: 'breast', breast_side: 'both', duration_min: 15,
  }),
  makeMock('demo-3', 'diaper', `${TODAY}T09:15:00`, {
    diaper_type: 'wet',
  }),
  makeMock('demo-4', 'sleep', `${TODAY}T12:00:00`, {
    sleep_period: 'nap', duration_min: 90, quality: 'good', status: 'completed',
  }),
  makeMock('demo-5', 'health', `${TODAY}T10:30:00`, {
    temperature: 36.8,
  }),
  // 昨天
  makeMock('demo-6', 'feeding', `${YESTERDAY}T07:00:00`, {
    feed_type: 'formula', formula_ml: 120, milk_types: ['ph'], milk_scoops: { ph: 4 },
  }),
  makeMock('demo-7', 'sleep', `${YESTERDAY}T13:00:00`, {
    sleep_period: 'nap', duration_min: 60, quality: 'normal', status: 'completed',
  }),
  makeMock('demo-8', 'diaper', `${YESTERDAY}T15:30:00`, {
    diaper_type: 'dirty', poop_type: 'normal',
  }),
  makeMock('demo-9', 'feeding', `${YESTERDAY}T18:00:00`, {
    feed_type: 'complementary', complementary_food: '米粉', amount_g: 30,
  }),
]

function getDateKey(iso: string): string {
  return iso.slice(0, 10)
}

function getRecordTime(rec: RecordItem): string {
  return (rec.start_time || rec.startTime || rec.created_at || '') as string
}

function getDateLabel(iso: string): string {
  const d = dayjs(iso)
  const today = dayjs()
  if (d.format('YYYY-MM-DD') === today.format('YYYY-MM-DD')) return '今天'
  if (d.format('YYYY-MM-DD') === today.subtract(1, 'day').format('YYYY-MM-DD')) return '昨天'
  return d.format('M月D日')
}

export default function GuestRecordsList() {
  // 按日期分组
  const todayKey = getDateKey(dayjs().toISOString())
  const dateMap = new Map<string, RecordItem[]>()
  for (const rec of DEMO_RECORDS) {
    const dk = getDateKey(getRecordTime(rec))
    if (!dateMap.has(dk)) dateMap.set(dk, [])
    dateMap.get(dk)!.push(rec)
  }

  const grouped = Array.from(dateMap.entries()).map(([dk, items]) => ({
    dateKey: dk,
    dateLabel: getDateLabel(getRecordTime(items[0])),
    isToday: dk === todayKey,
    items: items.sort(
      (a, b) => new Date(getRecordTime(b)).getTime() - new Date(getRecordTime(a)).getTime(),
    ),
  }))

  const handleRecordClick = () => {
    Taro.showToast({ title: '请先登录后查看', icon: 'none', duration: 1500 })
  }

  return (
    <View>
      {/* 标题栏 */}
      <View className='records-filter'>
        <View className='records-filter__head'>
          <View className='records-filter__title-wrap'>
            <Text className='records-filter__title'>宝宝记录</Text>
            <Text className='records-filter__count'>示例数据</Text>
          </View>
        </View>
      </View>

      {/* 模拟记录列表 */}
      <View className='records-list-body'>
        {grouped.map((group) => (
          <RecordGroup
            key={group.dateKey}
            group={group}
            onRecordClick={handleRecordClick}
            groupByType
          />
        ))}
      </View>

      {/* 底部登录引导 */}
      <LoginGuide title='登录后查看全部记录' desc='登录后可记录和浏览宝宝的每一天' />
    </View>
  )
}
