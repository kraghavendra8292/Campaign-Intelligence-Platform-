-- CreateEnum
CREATE TYPE "SubmissionType" AS ENUM ('FEEDBACK', 'ISSUE', 'SUGGESTION', 'COMPLAINT');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "IssuePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SPAM');

-- CreateEnum
CREATE TYPE "IssueSource" AS ENUM ('DIRECT_WEBSITE', 'QR', 'CAMPAIGN_PAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "IssueHistoryAction" AS ENUM ('SUBMITTED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'UNASSIGNED', 'CATEGORY_CHANGED', 'LOCATION_UPDATED', 'MODERATED', 'NOTE_ADDED');

-- CreateTable
CREATE TABLE "issue_categories" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "labelKn" VARCHAR(160),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "issue_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "referenceNumber" VARCHAR(32) NOT NULL,
    "type" "SubmissionType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" UUID,
    "status" "IssueStatus" NOT NULL DEFAULT 'SUBMITTED',
    "priority" "IssuePriority" NOT NULL DEFAULT 'MEDIUM',
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "source" "IssueSource" NOT NULL DEFAULT 'DIRECT_WEBSITE',
    "campaignId" UUID,
    "qrCodeId" UUID,
    "ward" VARCHAR(160),
    "locality" VARCHAR(160),
    "area" VARCHAR(160),
    "addressDescription" VARCHAR(500),
    "latitude" DECIMAL(8,6),
    "longitude" DECIMAL(9,6),
    "isAnonymous" BOOLEAN NOT NULL DEFAULT true,
    "contactName" VARCHAR(160),
    "contactPhone" VARCHAR(40),
    "contactEmail" VARCHAR(254),
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMPTZ(6),
    "assignedToUserId" UUID,
    "submittedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(6),
    "closedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_attachments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "issueId" UUID,
    "storageKey" VARCHAR(255) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(120) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" VARCHAR(64) NOT NULL,
    "claimToken" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_history" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "action" "IssueHistoryAction" NOT NULL,
    "previousStatus" "IssueStatus",
    "newStatus" "IssueStatus",
    "previousPriority" "IssuePriority",
    "newPriority" "IssuePriority",
    "detail" VARCHAR(500),
    "performedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_internal_notes" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "authorUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_internal_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "issue_categories_organizationId_isActive_displayOrder_idx" ON "issue_categories"("organizationId", "isActive", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "issue_categories_organizationId_key_key" ON "issue_categories"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "issues_referenceNumber_key" ON "issues"("referenceNumber");

-- CreateIndex
CREATE INDEX "issues_organizationId_status_idx" ON "issues"("organizationId", "status");

-- CreateIndex
CREATE INDEX "issues_organizationId_submittedAt_idx" ON "issues"("organizationId", "submittedAt");

-- CreateIndex
CREATE INDEX "issues_organizationId_priority_idx" ON "issues"("organizationId", "priority");

-- CreateIndex
CREATE INDEX "issues_organizationId_categoryId_idx" ON "issues"("organizationId", "categoryId");

-- CreateIndex
CREATE INDEX "issues_organizationId_assignedToUserId_idx" ON "issues"("organizationId", "assignedToUserId");

-- CreateIndex
CREATE INDEX "issues_organizationId_moderationStatus_idx" ON "issues"("organizationId", "moderationStatus");

-- CreateIndex
CREATE INDEX "issues_organizationId_ward_idx" ON "issues"("organizationId", "ward");

-- CreateIndex
CREATE INDEX "issues_campaignId_idx" ON "issues"("campaignId");

-- CreateIndex
CREATE INDEX "issue_attachments_organizationId_issueId_idx" ON "issue_attachments"("organizationId", "issueId");

-- CreateIndex
CREATE INDEX "issue_attachments_issueId_createdAt_idx" ON "issue_attachments"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "issue_history_issueId_createdAt_idx" ON "issue_history"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "issue_history_organizationId_createdAt_idx" ON "issue_history"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "issue_internal_notes_issueId_createdAt_idx" ON "issue_internal_notes"("issueId", "createdAt");

-- AddForeignKey
ALTER TABLE "issue_categories" ADD CONSTRAINT "issue_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "issue_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "qr_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "qr_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_attachments" ADD CONSTRAINT "issue_attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_attachments" ADD CONSTRAINT "issue_attachments_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_history" ADD CONSTRAINT "issue_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_history" ADD CONSTRAINT "issue_history_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_history" ADD CONSTRAINT "issue_history_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_internal_notes" ADD CONSTRAINT "issue_internal_notes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_internal_notes" ADD CONSTRAINT "issue_internal_notes_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_internal_notes" ADD CONSTRAINT "issue_internal_notes_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

