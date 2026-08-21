import type { LearningTask, ScheduleTemplate, TimePeriod, TimeSlot } from './types.ts'

export const periodLabels: Record<TimePeriod, string> = {
  morning: '上午',
  afternoon: '下午',
  evening: '晚上',
}

export const defaultTimeSlots: TimeSlot[] = [
  { id: 'morning-1', period: 'morning', label: '上午 1', start: '08:00', end: '08:45', order: 1, enabled: true },
  { id: 'morning-2', period: 'morning', label: '上午 2', start: '09:00', end: '09:45', order: 2, enabled: true },
  { id: 'morning-3', period: 'morning', label: '上午 3', start: '10:00', end: '10:45', order: 3, enabled: true },
  { id: 'morning-4', period: 'morning', label: '上午 4', start: '11:00', end: '11:45', order: 4, enabled: true },
  { id: 'afternoon-1', period: 'afternoon', label: '下午 1', start: '14:00', end: '14:45', order: 5, enabled: true },
  { id: 'afternoon-2', period: 'afternoon', label: '下午 2', start: '15:00', end: '15:45', order: 6, enabled: true },
  { id: 'afternoon-3', period: 'afternoon', label: '下午 3', start: '16:00', end: '16:45', order: 7, enabled: true },
  { id: 'afternoon-4', period: 'afternoon', label: '下午 4', start: '17:00', end: '17:45', order: 8, enabled: true },
  { id: 'evening-1', period: 'evening', label: '晚上 1', start: '19:30', end: '20:15', order: 9, enabled: true },
  { id: 'evening-2', period: 'evening', label: '晚上 2', start: '20:30', end: '21:15', order: 10, enabled: true },
]

const minutes = (value: string) => {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export const slotDuration = (slot: TimeSlot) => Math.max(15, minutes(slot.end) - minutes(slot.start))

export const enabledSlots = (slots: TimeSlot[]) => [...slots].filter(slot => slot.enabled).sort((a, b) => a.order - b.order)

export const slotForTask = (task: LearningTask, slots: TimeSlot[]) => slots.find(slot => slot.id === task.slotId) ?? slots.find(slot => slot.start === task.time)

export const periodForPreference = (value: string): TimePeriod | null => value === '上午' ? 'morning' : value === '下午' ? 'afternoon' : value === '晚上' ? 'evening' : null

export const cloneDefaultTimeSlots = () => defaultTimeSlots.map(slot => ({ ...slot }))

const templateCounts: Record<Exclude<ScheduleTemplate, 'custom'>, Record<TimePeriod, number>> = {
  light: { morning: 3, afternoon: 3, evening: 1 },
  standard: { morning: 4, afternoon: 4, evening: 2 },
  sprint: { morning: 4, afternoon: 4, evening: 3 },
}

export const slotsForTemplate = (template: Exclude<ScheduleTemplate, 'custom'>): TimeSlot[] => {
  const counts = templateCounts[template]
  return cloneDefaultTimeSlots().map(slot => ({ ...slot, enabled: Number(slot.id.split('-')[1]) <= counts[slot.period] }))
}

export const templateLabel = (template: ScheduleTemplate) => ({
  light: '3＋3＋1 轻量课表',
  standard: '4＋4＋2 标准课表',
  sprint: '4＋4＋3 冲刺课表',
  custom: '自定义课表',
}[template])
