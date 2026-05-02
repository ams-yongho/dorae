'use server'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types'

function readEmployeeForm(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const slackUserId = String(formData.get('slackUserId') ?? '').trim()

  if (!name) throw new Error('이름을 입력해 주세요')
  if (!email) throw new Error('이메일을 입력해 주세요')
  if (!slackUserId) throw new Error('Slack User ID를 입력해 주세요')

  return {
    name,
    email,
    slackUserId,
    birthday: new Date(formData.get('birthday') as string),
    hireDate: new Date(formData.get('hireDate') as string),
    checkupCycleMonths: Number(formData.get('checkupCycleMonths') ?? 12),
    leaveYearBasis: (formData.get('leaveYearBasis') as 'CALENDAR' | 'HIRE_DATE') ?? 'CALENDAR',
    annualLeaveTotal: Number(formData.get('annualLeaveTotal') ?? 15),
    annualLeaveUsed: Number(formData.get('annualLeaveUsed') ?? 0),
    lastCheckupDate: formData.get('lastCheckupDate')
      ? new Date(formData.get('lastCheckupDate') as string)
      : null,
  }
}

export async function createEmployee(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const employee = await db.user.create({
      data: readEmployeeForm(formData),
    })
    revalidatePath('/employees')
    return { success: true, data: { id: employee.id } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function updateEmployee(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    await db.user.update({
      where: { id },
      data: {
        ...readEmployeeForm(formData),
        ...(formData.has('isActive') ? { isActive: formData.get('isActive') === 'true' } : {}),
      },
    })
    revalidatePath('/employees')
    revalidatePath(`/employees/${id}`)
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function deleteEmployee(id: string): Promise<ActionResult> {
  try {
    await db.user.update({ where: { id }, data: { isActive: false } })
    revalidatePath('/employees')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
