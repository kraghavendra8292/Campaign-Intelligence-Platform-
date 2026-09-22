-- Phase 9: verified work, achievement evidence and public transparency.
--
-- ADDITIVE. No table is dropped or renamed, no column is removed and no row is
-- deleted. Phase 1-8 data is untouched apart from one backfill, which copies a
-- tenant id that was previously reachable only through a join.
--
-- Three corrections were made to the generated diff, each noted where it
-- applies: the tenant column is added nullable and backfilled before being made
-- NOT NULL; a CHECK constraint enforces that a piece of evidence belongs to
-- exactly one subject; and existing evidence is classified as OTHER rather than
-- guessed at.

-- CreateEnum
CREATE TYPE "work_subject_type" AS ENUM ('PROJECT', 'ACHIEVEMENT');

-- CreateEnum
CREATE TYPE "evidence_type" AS ENUM ('OFFICIAL_DOCUMENT', 'WORK_ORDER', 'COMPLETION_CERTIFICATE', 'GOVERNMENT_ORDER', 'OFFICIAL_LETTER', 'BEFORE_PHOTO', 'DURING_PHOTO', 'AFTER_PHOTO', 'PROJECT_PHOTO', 'PRESS_DOCUMENTATION', 'PUBLIC_RECORD', 'OTHER');

-- CreateEnum
CREATE TYPE "verification_event_action" AS ENUM ('SUBMITTED_FOR_REVIEW', 'REVIEWER_ASSIGNED', 'REVIEW_STARTED', 'VERIFIED', 'REJECTED', 'VERIFICATION_WITHDRAWN', 'EVIDENCE_CHANGED');

-- AlterEnum
ALTER TYPE "verification_status" ADD VALUE 'REJECTED';

-- AlterTable
-- `organizationId` is added NULLABLE here on purpose. The generated form was
-- `ADD COLUMN ... NOT NULL` with no default, which fails outright on a table
-- that already holds rows. It is backfilled from the parent achievement and
-- only then made NOT NULL, further down this file.
ALTER TABLE "achievement_evidence" ADD COLUMN     "capturedLocation" VARCHAR(250),
ADD COLUMN     "capturedOn" DATE,
ADD COLUMN     "evidenceType" "evidence_type" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "issuedOn" DATE,
ADD COLUMN     "issuingAuthority" VARCHAR(250),
ADD COLUMN     "organizationId" UUID,
ADD COLUMN     "projectId" UUID,
ADD COLUMN     "referenceNumber" VARCHAR(120),
ALTER COLUMN "achievementId" DROP NOT NULL;

-- Backfill: every existing row belongs to the tenant that owns its achievement.
UPDATE "achievement_evidence" AS e
SET "organizationId" = a."organizationId"
FROM "achievements" AS a
WHERE e."achievementId" = a."id" AND e."organizationId" IS NULL;

ALTER TABLE "achievement_evidence" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "achievements" ADD COLUMN     "agency" VARCHAR(200),
ADD COLUMN     "assignedReviewerId" UUID,
ADD COLUMN     "department" VARCHAR(200),
ADD COLUMN     "rejectionReason" VARCHAR(2000),
ADD COLUMN     "submittedByUserId" UUID,
ADD COLUMN     "submittedForReviewAt" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "agency" VARCHAR(200),
ADD COLUMN     "assignedReviewerId" UUID,
ADD COLUMN     "department" VARCHAR(200),
ADD COLUMN     "rejectionReason" VARCHAR(2000),
ADD COLUMN     "submittedByUserId" UUID,
ADD COLUMN     "submittedForReviewAt" TIMESTAMPTZ(6),
ADD COLUMN     "verification" "verification_status" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "verifiedAt" TIMESTAMPTZ(6),
ADD COLUMN     "verifiedByUserId" UUID;

-- CreateTable
CREATE TABLE "verification_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "subjectType" "work_subject_type" NOT NULL,
    "subjectId" UUID NOT NULL,
    "action" "verification_event_action" NOT NULL,
    "fromStatus" "verification_status",
    "toStatus" "verification_status",
    "reason" VARCHAR(2000),
    "actorUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verification_events_organizationId_subjectType_subjectId_cr_idx" ON "verification_events"("organizationId", "subjectType", "subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "verification_events_organizationId_createdAt_idx" ON "verification_events"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "achievement_evidence_projectId_sortOrder_idx" ON "achievement_evidence"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "achievement_evidence_organizationId_isPublic_idx" ON "achievement_evidence"("organizationId", "isPublic");

-- CreateIndex
CREATE INDEX "achievement_evidence_documentId_idx" ON "achievement_evidence"("documentId");

-- CreateIndex
CREATE INDEX "achievements_organizationId_verification_submittedForReview_idx" ON "achievements"("organizationId", "verification", "submittedForReviewAt");

-- CreateIndex
CREATE INDEX "projects_organizationId_verification_submittedForReviewAt_idx" ON "projects"("organizationId", "verification", "submittedForReviewAt");

-- CreateIndex
CREATE INDEX "projects_organizationId_status_projectStatus_idx" ON "projects"("organizationId", "status", "projectStatus");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_assignedReviewerId_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_assignedReviewerId_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_evidence" ADD CONSTRAINT "achievement_evidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_evidence" ADD CONSTRAINT "achievement_evidence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_events" ADD CONSTRAINT "verification_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_events" ADD CONSTRAINT "verification_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Evidence belongs to exactly one subject
-- ---------------------------------------------------------------------------
--
-- Enforced in the database rather than only in the service. The service is one
-- refactor away from a second write path; a constraint is not. Without it,
-- evidence with both parents set would appear under two different claims, and
-- evidence with neither would be invisible to every query while still occupying
-- a tenant's storage.
ALTER TABLE "achievement_evidence"
  ADD CONSTRAINT "achievement_evidence_one_subject"
  CHECK (num_nonnulls("achievementId", "projectId") = 1);

-- ---------------------------------------------------------------------------
-- Evidence rows that predate this phase
-- ---------------------------------------------------------------------------
--
-- They keep `evidenceType = OTHER`, the enum default. Inferring a type from the
-- title would be the platform inventing provenance for a document nobody
-- classified - precisely the fabrication this phase exists to prevent. Staff
-- reclassify them deliberately, or they stay honestly unclassified.
