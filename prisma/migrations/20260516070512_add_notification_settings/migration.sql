-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "sendHour" INTEGER NOT NULL DEFAULT 9,
    "sendMinute" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);

-- Seed the singleton row (09:00 KST default)
INSERT INTO "NotificationSettings" ("id", "sendHour", "sendMinute", "updatedAt")
VALUES ('singleton', 9, 0, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
