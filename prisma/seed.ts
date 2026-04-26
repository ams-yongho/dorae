import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  await db.notificationRule.upsert({
    where: { id: 'rule-birthday' },
    update: {},
    create: {
      id: 'rule-birthday',
      type: 'BIRTHDAY',
      daysBefore: [0],
      messageTemplate:
        '🎂 {name}님, 생일을 진심으로 축하합니다! 오늘 하루도 행복한 하루 되세요 🎉',
      isEnabled: true,
    },
  })

  await db.notificationRule.upsert({
    where: { id: 'rule-anniversary' },
    update: {},
    create: {
      id: 'rule-anniversary',
      type: 'ANNIVERSARY',
      daysBefore: [0],
      messageTemplate:
        '🥂 {name}님, 입사 {years}주년을 축하합니다! 함께해 주셔서 감사해요.',
      isEnabled: true,
    },
  })

  await db.notificationRule.upsert({
    where: { id: 'rule-checkup' },
    update: {},
    create: {
      id: 'rule-checkup',
      type: 'CHECKUP',
      daysBefore: [30, 7, 0],
      messageTemplate:
        '🏥 {name}님, 건강검진 예정일이 {days}일 남았습니다. 미리 예약해 두세요!',
      isEnabled: true,
    },
  })

  await db.notificationRule.upsert({
    where: { id: 'rule-leave-expiry' },
    update: {},
    create: {
      id: 'rule-leave-expiry',
      type: 'LEAVE_EXPIRY',
      daysBefore: [60, 30],
      messageTemplate:
        '📅 {name}님, 연차 소진 기한이 {days}일 남았습니다. 잔여 연차 {remaining}일을 확인해 주세요.',
      isEnabled: true,
      remainingThreshold: 3,
    },
  })

  console.log('Seed complete')
}

main().catch(console.error).finally(() => db.$disconnect())
