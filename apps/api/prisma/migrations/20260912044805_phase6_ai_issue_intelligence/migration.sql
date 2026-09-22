-- CreateEnum
CREATE TYPE "ai_processing_status" AS ENUM ('NOT_PROCESSED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'REQUIRES_REVIEW');

-- CreateEnum
CREATE TYPE "ai_review_status" AS ENUM ('GENERATED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'STALE');

-- CreateEnum
CREATE TYPE "ai_operation" AS ENUM ('ISSUE_INSIGHT', 'THEME_DETECTION', 'EXECUTIVE_SUMMARY');

-- CreateEnum
CREATE TYPE "ai_failure_kind" AS ENUM ('PROVIDER_UNAVAILABLE', 'PROVIDER_ERROR', 'TIMEOUT', 'RATE_LIMITED', 'INVALID_OUTPUT', 'SAFETY_REJECTED', 'NOT_CONFIGURED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "issue_ai_insights" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "processingStatus" "ai_processing_status" NOT NULL DEFAULT 'NOT_PROCESSED',
    "reviewStatus" "ai_review_status" NOT NULL DEFAULT 'GENERATED',
    "summary" VARCHAR(700),
    "editedSummary" VARCHAR(700),
    "suggestedCategoryId" UUID,
    "categoryConfidence" DOUBLE PRECISION,
    "categoryReason" VARCHAR(400),
    "categoryAccepted" BOOLEAN,
    "categoryDecidedAt" TIMESTAMPTZ(6),
    "model" VARCHAR(120),
    "promptVersion" VARCHAR(60),
    "generation" INTEGER NOT NULL DEFAULT 0,
    "sourceUpdatedAt" TIMESTAMPTZ(6),
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "failureKind" "ai_failure_kind",
    "failureReason" VARCHAR(300),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "reviewedAt" TIMESTAMPTZ(6),
    "reviewedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "issue_ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_ai_topics" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "insightId" UUID NOT NULL,
    "topic" VARCHAR(80) NOT NULL,
    "normalized" VARCHAR(80) NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_ai_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_themes" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(600),
    "generatedSummary" TEXT,
    "issueCount" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMPTZ(6) NOT NULL,
    "periodEnd" TIMESTAMPTZ(6) NOT NULL,
    "reviewStatus" "ai_review_status" NOT NULL DEFAULT 'GENERATED',
    "model" VARCHAR(120),
    "promptVersion" VARCHAR(60),
    "reviewedAt" TIMESTAMPTZ(6),
    "reviewedByUserId" UUID,
    "generatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "issue_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_theme_memberships" (
    "id" UUID NOT NULL,
    "themeId" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_theme_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_executive_summaries" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "periodStart" TIMESTAMPTZ(6) NOT NULL,
    "periodEnd" TIMESTAMPTZ(6) NOT NULL,
    "summary" TEXT NOT NULL,
    "editedSummary" TEXT,
    "keyThemes" TEXT[],
    "evidence" JSONB NOT NULL,
    "reviewStatus" "ai_review_status" NOT NULL DEFAULT 'GENERATED',
    "model" VARCHAR(120),
    "promptVersion" VARCHAR(60),
    "generatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedByUserId" UUID,
    "reviewedAt" TIMESTAMPTZ(6),
    "reviewedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_executive_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "operation" "ai_operation" NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "provider" VARCHAR(60) NOT NULL,
    "success" BOOLEAN NOT NULL,
    "failureKind" "ai_failure_kind",
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedCostUsd" DECIMAL(12,6),
    "durationMs" INTEGER NOT NULL,
    "correlationId" VARCHAR(64),
    "actorUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "issue_ai_insights_issueId_key" ON "issue_ai_insights"("issueId");

-- CreateIndex
CREATE INDEX "issue_ai_insights_organizationId_processingStatus_idx" ON "issue_ai_insights"("organizationId", "processingStatus");

-- CreateIndex
CREATE INDEX "issue_ai_insights_organizationId_reviewStatus_idx" ON "issue_ai_insights"("organizationId", "reviewStatus");

-- CreateIndex
CREATE INDEX "issue_ai_insights_organizationId_createdAt_idx" ON "issue_ai_insights"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "issue_ai_topics_organizationId_normalized_idx" ON "issue_ai_topics"("organizationId", "normalized");

-- CreateIndex
CREATE INDEX "issue_ai_topics_insightId_idx" ON "issue_ai_topics"("insightId");

-- CreateIndex
CREATE UNIQUE INDEX "issue_ai_topics_issueId_normalized_key" ON "issue_ai_topics"("issueId", "normalized");

-- CreateIndex
CREATE INDEX "issue_themes_organizationId_periodStart_periodEnd_idx" ON "issue_themes"("organizationId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "issue_themes_organizationId_generatedAt_idx" ON "issue_themes"("organizationId", "generatedAt");

-- CreateIndex
CREATE INDEX "issue_theme_memberships_issueId_idx" ON "issue_theme_memberships"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "issue_theme_memberships_themeId_issueId_key" ON "issue_theme_memberships"("themeId", "issueId");

-- CreateIndex
CREATE INDEX "ai_executive_summaries_organizationId_periodStart_periodEnd_idx" ON "ai_executive_summaries"("organizationId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ai_executive_summaries_organizationId_generatedAt_idx" ON "ai_executive_summaries"("organizationId", "generatedAt");

-- CreateIndex
CREATE INDEX "ai_usage_logs_organizationId_createdAt_idx" ON "ai_usage_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_logs_organizationId_operation_createdAt_idx" ON "ai_usage_logs"("organizationId", "operation", "createdAt");

-- AddForeignKey
ALTER TABLE "issue_ai_insights" ADD CONSTRAINT "issue_ai_insights_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_ai_insights" ADD CONSTRAINT "issue_ai_insights_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_ai_insights" ADD CONSTRAINT "issue_ai_insights_suggestedCategoryId_fkey" FOREIGN KEY ("suggestedCategoryId") REFERENCES "issue_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_ai_insights" ADD CONSTRAINT "issue_ai_insights_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_ai_topics" ADD CONSTRAINT "issue_ai_topics_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_ai_topics" ADD CONSTRAINT "issue_ai_topics_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_ai_topics" ADD CONSTRAINT "issue_ai_topics_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "issue_ai_insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_themes" ADD CONSTRAINT "issue_themes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_themes" ADD CONSTRAINT "issue_themes_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_theme_memberships" ADD CONSTRAINT "issue_theme_memberships_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "issue_themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_theme_memberships" ADD CONSTRAINT "issue_theme_memberships_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_executive_summaries" ADD CONSTRAINT "ai_executive_summaries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_executive_summaries" ADD CONSTRAINT "ai_executive_summaries_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_executive_summaries" ADD CONSTRAINT "ai_executive_summaries_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
