import { db } from '@/lib/db'

const SINGLETON_ID = 'singleton'

export interface NotificationSettingsValue {
  sendHour: number
  sendMinute: number
}

export async function getNotificationSettings(): Promise<NotificationSettingsValue> {
  const row = await db.notificationSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID, sendHour: 9, sendMinute: 0 },
    select: { sendHour: true, sendMinute: true },
  })
  return row
}

export async function setNotificationSettings(value: NotificationSettingsValue): Promise<void> {
  await db.notificationSettings.upsert({
    where: { id: SINGLETON_ID },
    update: { sendHour: value.sendHour, sendMinute: value.sendMinute },
    create: { id: SINGLETON_ID, sendHour: value.sendHour, sendMinute: value.sendMinute },
  })
}
