-- CreateEnum
CREATE TYPE "LeaveYearBasis" AS ENUM ('CALENDAR', 'HIRE_DATE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BIRTHDAY', 'ANNIVERSARY', 'CHECKUP', 'LEAVE_EXPIRY');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SENT', 'FAILED', 'PENDING');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "slackUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "birthday" TIMESTAMP(3) NOT NULL,
    "hireDate" TIMESTAMP(3) NOT NULL,
    "lastCheckupDate" TIMESTAMP(3),
    "checkupCycleMonths" INTEGER NOT NULL DEFAULT 12,
    "annualLeaveTotal" INTEGER NOT NULL DEFAULT 15,
    "annualLeaveUsed" INTEGER NOT NULL DEFAULT 0,
    "leaveYearBasis" "LeaveYearBasis" NOT NULL DEFAULT 'CALENDAR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRule" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "daysBefore" INTEGER[],
    "messageTemplate" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "remainingThreshold" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ruleId" TEXT,
    "triggerDate" TIMESTAMP(3) NOT NULL,
    "daysBefore" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "messageContent" TEXT NOT NULL,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "slackUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_slackUserId_key" ON "User"("slackUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_userId_ruleId_triggerDate_daysBefore_key" ON "NotificationLog"("userId", "ruleId", "triggerDate", "daysBefore");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "NotificationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
