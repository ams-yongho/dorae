'use server'
import { revalidatePath } from 'next/cache'
import { setNotificationSettings } from '@/lib/settings'
import type { ActionResult } from '@/types'

const VALID_MINUTES = new Set([0, 15, 30, 45])

export async function updateNotificationSettings(input: {
  sendHour: number
  sendMinute: number
}): Promise<ActionResult> {
  const { sendHour, sendMinute } = input

  if (!Number.isInteger(sendHour) || sendHour < 0 || sendHour > 23) {
    return { success: false, error: '시(hour)는 0~23 사이여야 합니다.' }
  }
  if (!VALID_MINUTES.has(sendMinute)) {
    return { success: false, error: '분(minute)은 0/15/30/45 중 하나여야 합니다.' }
  }

  try {
    await setNotificationSettings({ sendHour, sendMinute })
    revalidatePath('/rules')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
