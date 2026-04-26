import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  return format(new Date(date), 'yyyy.MM.dd', { locale: ko })
}

export function formatDateKo(date: Date | string | null | undefined): string {
  if (!date) return '-'
  return format(new Date(date), 'yyyy년 M월 d일', { locale: ko })
}

export function relativeTime(date: Date | string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ko })
}

export function sameMonthDay(a: Date, b: Date): boolean {
  return a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function yearsSince(from: Date, to: Date): number {
  return to.getFullYear() - from.getFullYear()
}
