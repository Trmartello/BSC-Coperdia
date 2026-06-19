-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INCONSISTENCY', 'OVERDUE_ACTION');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'WARNING',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actionPlanId" TEXT,
    "actionItemId" TEXT,
    "indicatorId" TEXT,
    "period" TIMESTAMP(3),
    "dedupeKey" TEXT NOT NULL,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");

-- CreateIndex
CREATE INDEX "notifications_resolvedAt_readAt_idx" ON "notifications"("resolvedAt", "readAt");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");
