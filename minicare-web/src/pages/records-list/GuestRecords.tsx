/**
 * GuestRecords 游客记录列表
 *
 * 未登录状态下的记录页面，与小程序版本保持一致：
 * - 标题栏 + "示例数据"标签
 * - 模拟记录列表（今天 + 昨天）
 * - 底部登录引导
 */
import dayjs from 'dayjs'
import LoginGuide from '@/components/LoginGuide'

// 模拟记录数据（与小程序一致）
const MOCK_TODAY = [
  { id: '1', type: 'feeding', time: '08:30', label: '配方奶', detail: '150ml' },
  { id: '2', type: 'feeding', time: '06:00', label: '母乳', detail: '亲喂 15分钟' },
  { id: '3', type: 'diaper', time: '09:15', label: '换尿布', detail: '湿 · 正常' },
  { id: '4', type: 'sleep', time: '10:00', label: '午睡', detail: '90分钟' },
  { id: '5', type: 'health', time: '11:30', label: '体温', detail: '36.8 C' },
]

const MOCK_YESTERDAY = [
  { id: '6', type: 'feeding', time: '19:00', label: '配方奶', detail: '180ml' },
  { id: '7', type: 'sleep', time: '20:30', label: '晚间睡眠', detail: '10小时' },
  { id: '8', type: 'diaper', time: '22:00', label: '换尿布', detail: '湿+便 · 正常' },
  { id: '9', type: 'symptom', time: '14:00', label: '皮肤表现', detail: '面部轻微泛红' },
]

// 类型对应的颜色配置
const TYPE_COLORS: Record<string, { bg: string; dot: string }> = {
  feeding: { bg: '#FFF8F0', dot: '#F9A825' },
  sleep: { bg: '#F0F4FF', dot: '#5C6BC0' },
  diaper: { bg: '#F0FFF4', dot: '#66BB6A' },
  health: { bg: '#FFF0F4', dot: '#F87098' },
  symptom: { bg: '#FFF3E0', dot: '#FF8A65' },
}

interface MockRecord {
  id: string
  type: string
  time: string
  label: string
  detail: string
}

function MockRecordItem({ record }: { record: MockRecord }) {
  const colors = TYPE_COLORS[record.type] || { bg: '#F5F5F5', dot: '#999' }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl mb-2 cursor-pointer transition-colors active:bg-gray-50"
      style={{ background: colors.bg }}
    >
      {/* 时间线圆点 */}
      <div
        className="flex-shrink-0"
        style={{
          width: 8, height: 8, borderRadius: '50%',
          background: colors.dot,
        }}
      />

      {/* 时间 */}
      <div className="text-[12px] text-[#9A8090] font-medium w-10 flex-shrink-0">
        {record.time}
      </div>

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-[#4A3035]">{record.label}</div>
        <div className="text-[12px] text-[#9A8090] mt-0.5">{record.detail}</div>
      </div>
    </div>
  )
}

export default function GuestRecords() {
  const today = dayjs().format('M月D日')
  const yesterday = dayjs().subtract(1, 'day').format('M月D日')

  return (
    <div className="h-full bg-bg flex flex-col">
      {/* ── 标题栏 ── */}
      <div className="px-5 pt-12 pb-3 bg-bg flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[22px] font-extrabold text-[#4A3035] tracking-tight">
            宝宝记录
          </span>
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: '#FFF0F4', color: '#F87098' }}
          >
            示例数据
          </span>
        </div>
      </div>

      {/* ── 模拟记录列表 ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* 今天 */}
        <div className="mb-4">
          <div className="text-[13px] font-bold text-[#4A3035] mb-2 px-1">
            今天 · {today}
          </div>
          {MOCK_TODAY.map((record) => (
            <MockRecordItem key={record.id} record={record} />
          ))}
        </div>

        {/* 昨天 */}
        <div className="mb-4">
          <div className="text-[13px] font-bold text-[#4A3035] mb-2 px-1">
            昨天 · {yesterday}
          </div>
          {MOCK_YESTERDAY.map((record) => (
            <MockRecordItem key={record.id} record={record} />
          ))}
        </div>

        {/* 登录引导 */}
        <div
          className="rounded-2xl overflow-hidden mt-4"
          style={{ background: '#FFFBFC', border: '1px solid #F5F0F2' }}
        >
          <LoginGuide
            title="登录后查看全部记录"
            desc="登录后可记录和浏览宝宝的每一天"
          />
        </div>

        <div className="h-24" />
      </div>
    </div>
  )
}
