const pad = (value: number) => String(value).padStart(2, '0')

export const localDateISO = (value = new Date()) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`

export const zonedDateISO = (value: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export const localTimestamp = (value = new Date()) => value.toISOString()

export const parseLocalDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, Math.max(0, month - 1), day, 12, 0, 0, 0)
}

export const addDays = (date: string, days: number) => {
  const value = parseLocalDate(date)
  value.setDate(value.getDate() + days)
  return localDateISO(value)
}

export const daysBetween = (start: string, end: string) => Math.round((parseLocalDate(end).getTime() - parseLocalDate(start).getTime()) / 86_400_000)

export const mondayOfWeek = (date = localDateISO()) => {
  const value = parseLocalDate(date)
  const day = value.getDay() || 7
  value.setDate(value.getDate() - day + 1)
  return localDateISO(value)
}

export const dayName = (date: string) => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parseLocalDate(date).getDay()]

export const isWeekend = (date: string) => {
  const day = parseLocalDate(date).getDay()
  return day === 0 || day === 6
}

export const weekIdFor = (date: string) => mondayOfWeek(date)

export const inDateRange = (date: string, start: string, end: string) => date >= start && date <= end

export const dateFromDateTime = (value: string) => value.slice(0, 10)

export const safeFileDate = (value = new Date()) => localDateISO(value)
