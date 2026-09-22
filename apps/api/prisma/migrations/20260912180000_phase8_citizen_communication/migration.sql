-- CreateEnum
CREATE TYPE "public_update_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "notification_event" AS ENUM ('ISSUE_RECEIVED', 'ISSUE_STATUS_CHANGED', 'PUBLIC_UPDATE_PUBLISHED', 'ISSUE_RESOLVED', 'ISSUE_REOPENED');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "notification_failure_kind" AS ENUM ('PROVIDER_UNAVAILABLE', 'PROVIDER_REJECTED', 'TIMEOUT', 'INVALID_DESTINATION', 'NOT_CONFIGURED', 'RATE_LIMITED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "follow_up_response" AS ENUM ('RESOLVED', 'PARTIALLY_RESOLVED', 'NOT_RESOLVED');

-- CreateEnum
CREATE TYPE "follow_up_status" AS ENUM ('SUBMITTED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "follow_up_outcome" AS ENUM ('REOPENED', 'KEPT_CLOSED', 'ACKNOWLEDGED');

-- AlterTable
ALTER TABLE "issues" ADD COLUMN     "trackingTokenHash" VARCHAR(64),
ADD COLUMN     "trackingTokenIssuedAt" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "issue_public_updates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "body" VARCHAR(2200) NOT NULL,
    "status" "public_update_status" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(6),
    "supersedesId" UUID,
    "createdByUserId" UUID,
    "publishedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "issue_public_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_subscriptions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "destination" VARCHAR(320) NOT NULL,
    "consentGivenAt" TIMESTAMPTZ(6) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "unsubscribedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "issue_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_notifications" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "event" "notification_event" NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "recipientRedacted" VARCHAR(120) NOT NULL,
    "templateVersion" VARCHAR(60) NOT NULL,
    "status" "notification_status" NOT NULL DEFAULT 'QUEUED',
    "failureKind" "notification_failure_kind",
    "failureReason" VARCHAR(300),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" VARCHAR(200) NOT NULL,
    "publicUpdateId" UUID,
    "queuedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(6),
    "deliveredAt" TIMESTAMPTZ(6),
    "failedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "issue_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_follow_ups" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "response" "follow_up_response" NOT NULL,
    "comment" VARCHAR(2200),
    "reopenRequested" BOOLEAN NOT NULL DEFAULT false,
    "status" "follow_up_status" NOT NULL DEFAULT 'SUBMITTED',
    "outcome" "follow_up_outcome",
    "reviewNote" VARCHAR(1000),
    "reviewedAt" TIMESTAMPTZ(6),
    "reviewedByUserId" UUID,
    "submittedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "issue_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "issue_public_updates_supersedesId_key" ON "issue_public_updates"("supersedesId");

-- CreateIndex
CREATE INDEX "issue_public_updates_issueId_status_publishedAt_idx" ON "issue_public_updates"("issueId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "issue_public_updates_organizationId_status_createdAt_idx" ON "issue_public_updates"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "issue_subscriptions_organizationId_active_idx" ON "issue_subscriptions"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "issue_subscriptions_issueId_channel_key" ON "issue_subscriptions"("issueId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "issue_notifications_idempotencyKey_key" ON "issue_notifications"("idempotencyKey");

-- CreateIndex
CREATE INDEX "issue_notifications_organizationId_status_createdAt_idx" ON "issue_notifications"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "issue_notifications_organizationId_createdAt_idx" ON "issue_notifications"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "issue_notifications_issueId_createdAt_idx" ON "issue_notifications"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "issue_follow_ups_organizationId_status_reopenRequested_idx" ON "issue_follow_ups"("organizationId", "status", "reopenRequested");

-- CreateIndex
CREATE INDEX "issue_follow_ups_issueId_submittedAt_idx" ON "issue_follow_ups"("issueId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "issues_trackingTokenHash_key" ON "issues"("trackingTokenHash");

-- AddForeignKey
ALTER TABLE "issue_public_updates" ADD CONSTRAINT "issue_public_updates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_public_updates" ADD CONSTRAINT "issue_public_updates_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_public_updates" ADD CONSTRAINT "issue_public_updates_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_public_updates" ADD CONSTRAINT "issue_public_updates_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_public_updates" ADD CONSTRAINT "issue_public_updates_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "issue_public_updates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_subscriptions" ADD CONSTRAINT "issue_subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_subscriptions" ADD CONSTRAINT "issue_subscriptions_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_notifications" ADD CONSTRAINT "issue_notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_notifications" ADD CONSTRAINT "issue_notifications_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_notifications" ADD CONSTRAINT "issue_notifications_publicUpdateId_fkey" FOREIGN KEY ("publicUpdateId") REFERENCES "issue_public_updates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_follow_ups" ADD CONSTRAINT "issue_follow_ups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_follow_ups" ADD CONSTRAINT "issue_follow_ups_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_follow_ups" ADD CONSTRAINT "issue_follow_ups_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

