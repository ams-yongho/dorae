import { toZonedTime } from 'date-fns-tz'

const KST = 'Asia/Seoul'
const WINDOW_MINUTES = 15

export interface KstParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

export function getKstParts(now: Date): KstParts {
  const zoned = toZonedTime(now, KST)
  return {
    year: zoned.getFullYear(),
    month: zoned.getMonth() + 1,
    day: zoned.getDate(),
    hour: zoned.getHours(),
    minute: zoned.getMinutes(),
  }
}

export function isInWindow(now: Date, scheduleHour: number, scheduleMinute: number): boolean {
  const parts = getKstParts(now)
  if (parts.hour !== scheduleHour) return false
  const diff = parts.minute - scheduleMinute
  return diff >= 0 && diff < WINDOW_MINUTES
}
