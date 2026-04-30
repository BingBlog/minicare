import dayjs from 'dayjs'

export function formatTime(iso: string): string {
  if (!iso) return ''
  return dayjs(iso).format('HH:mm')
}

export function getGreeting(): string {
  const h = dayjs().hour()
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export function getTodayDateStr(): string {
  const now = dayjs()
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][now.day()]
  return `${now.month() + 1}月${now.date()}日 星期${weekday}`
}
