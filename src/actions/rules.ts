'use server'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types'

export async function updateRule(
  id: string,
  data: {
    daysBefore: number[]
    messageTemplate: string
    remainingThreshold: number | null
  }
): Promise<ActionResult> {
  try {
    await db.notificationRule.update({
      where: { id },
      data: {
        daysBefore: data.daysBefore,
        messageTemplate: data.messageTemplate,
        remainingThreshold: data.remainingThreshold,
      },
    })
    revalidatePath('/rules')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function toggleRule(
  id: string,
  isEnabled: boolean
): Promise<ActionResult> {
  try {
    await db.notificationRule.update({
      where: { id },
      data: { isEnabled },
    })
    revalidatePath('/rules')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
