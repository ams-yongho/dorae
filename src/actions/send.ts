'use server'
import { db } from '@/lib/db'
import { sendDM } from '@/lib/slack'
import type { ActionResult } from '@/types'

export async function sendManualDM(
  userId: string,
  message: string
): Promise<ActionResult> {
  try {
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) return { success: false, error: '직원을 찾을 수 없습니다' }

    await sendDM(user.slackUserId, message)

    await db.notificationLog.create({
      data: {
        userId: user.id,
        triggerDate: new Date(),
        daysBefore: 0,
        sentAt: new Date(),
        status: 'SENT',
        messageContent: message,
      },
    })

    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
