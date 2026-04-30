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

export function getBabyAge(birthDate: string): string {
  const birth = dayjs(birthDate).startOf('day')
  const now = dayjs().startOf('day')
  const totalDays = now.diff(birth, 'day')
  let months = now.diff(birth, 'month')
  const monthMark = birth.add(months, 'month')
  if (now.isBefore(monthMark)) months -= 1
  const remainDays = now.diff(birth.add(months, 'month'), 'day')
  if (months < 1) return `${totalDays}天`
  if (months < 12) return `${months}个月${remainDays}天`
  const years = Math.floor(months / 12)
  const remMonths = months % 12
  return `${years}岁${remMonths > 0 ? `${remMonths}个月` : ''}`
}
