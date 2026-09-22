-- Phase 3: Public candidate website + CMS
--
-- Purely additive: 17 new tables and their enums. No Phase 2 table, column or
-- row is altered or dropped, so an existing deployment keeps all identity,
-- session and audit data.
--
-- Every content table carries organization_id with an index, and slugs are
-- unique per (organization, slug, locale) rather than globally.

-- CreateEnum
CREATE TYPE "content_status" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "verification_status" AS ENUM ('UNVERIFIED', 'IN_REVIEW', 'VERIFIED');

-- CreateEnum
CREATE TYPE "content_category" AS ENUM ('INFRASTRUCTURE', 'EDUCATION', 'HEALTHCARE', 'WATER', 'AGRICULTURE', 'EMPLOYMENT', 'PUBLIC_SERVICES', 'ENVIRONMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "content_locale" AS ENUM ('en', 'kn');

-- CreateEnum
CREATE TYPE "media_kind" AS ENUM ('IMAGE', 'DOCUMENT', 'VIDEO_LINK');

-- CreateEnum
CREATE TYPE "video_platform" AS ENUM ('YOUTUBE', 'VIMEO', 'OTHER');

-- CreateEnum
CREATE TYPE "project_media_role" AS ENUM ('GALLERY', 'BEFORE', 'AFTER');

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" "media_kind" NOT NULL,
    "storageKey" VARCHAR(512) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(127) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" VARCHAR(64),
    "width" INTEGER,
    "height" INTEGER,
    "altText" VARCHAR(300),
    "caption" VARCHAR(500),
    "uploadedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_profiles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "locale" "content_locale" NOT NULL DEFAULT 'en',
    "fullName" VARCHAR(200) NOT NULL,
    "displayName" VARCHAR(200),
    "designation" VARCHAR(200),
    "shortBio" VARCHAR(600),
    "fullBioHtml" TEXT,
    "experienceHtml" TEXT,
    "publicServiceHtml" TEXT,
    "focusAreas" "content_category"[],
    "profileImageId" UUID,
    "coverImageId" UUID,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(6),
    "metaTitle" VARCHAR(200),
    "metaDescription" VARCHAR(400),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "candidate_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "locale" "content_locale" NOT NULL DEFAULT 'en',
    "headline" VARCHAR(300) NOT NULL,
    "statementHtml" TEXT,
    "summary" VARCHAR(600),
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(6),
    "metaTitle" VARCHAR(200),
    "metaDescription" VARCHAR(400),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "visions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "priorities" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "locale" "content_locale" NOT NULL DEFAULT 'en',
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "iconKey" VARCHAR(60),
    "category" "content_category" NOT NULL DEFAULT 'OTHER',
    "imageId" UUID,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "priorities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "locale" "content_locale" NOT NULL DEFAULT 'en',
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "shortDescription" VARCHAR(600),
    "descriptionHtml" TEXT,
    "category" "content_category" NOT NULL DEFAULT 'OTHER',
    "area" VARCHAR(160),
    "locationName" VARCHAR(250),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "startDate" DATE,
    "completionDate" DATE,
    "projectStatus" "project_status" NOT NULL DEFAULT 'PLANNED',
    "costAmount" DECIMAL(14,2),
    "costCurrency" VARCHAR(3),
    "beneficiaryCount" INTEGER,
    "coverImageId" UUID,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(6),
    "metaTitle" VARCHAR(200),
    "metaDescription" VARCHAR(400),
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_media" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "role" "project_media_role" NOT NULL DEFAULT 'GALLERY',
    "caption" VARCHAR(400),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_updates" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "bodyHtml" TEXT,
    "occurredOn" DATE NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "locale" "content_locale" NOT NULL DEFAULT 'en',
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "summary" VARCHAR(600),
    "descriptionHtml" TEXT,
    "category" "content_category" NOT NULL DEFAULT 'OTHER',
    "area" VARCHAR(160),
    "achievedOn" DATE,
    "coverImageId" UUID,
    "verification" "verification_status" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedByUserId" UUID,
    "verifiedAt" TIMESTAMPTZ(6),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(6),
    "metaTitle" VARCHAR(200),
    "metaDescription" VARCHAR(400),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievement_media" (
    "id" UUID NOT NULL,
    "achievementId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "caption" VARCHAR(400),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "achievement_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievement_evidence" (
    "id" UUID NOT NULL,
    "achievementId" UUID NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "description" VARCHAR(1000),
    "sourceNote" VARCHAR(500),
    "internalNote" VARCHAR(2000),
    "documentId" UUID,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "uploadedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "achievement_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_articles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "locale" "content_locale" NOT NULL DEFAULT 'en',
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "summary" VARCHAR(600),
    "contentHtml" TEXT,
    "category" "content_category" NOT NULL DEFAULT 'OTHER',
    "tags" TEXT[],
    "coverImageId" UUID,
    "authorName" VARCHAR(160),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(6),
    "metaTitle" VARCHAR(200),
    "metaDescription" VARCHAR(400),
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "news_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "locale" "content_locale" NOT NULL DEFAULT 'en',
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "summary" VARCHAR(600),
    "descriptionHtml" TEXT,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6),
    "locationName" VARCHAR(250),
    "address" VARCHAR(500),
    "organizer" VARCHAR(200),
    "coverImageId" UUID,
    "eventStatus" "event_status" NOT NULL DEFAULT 'UPCOMING',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(6),
    "metaTitle" VARCHAR(200),
    "metaDescription" VARCHAR(400),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_albums" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "locale" "content_locale" NOT NULL DEFAULT 'en',
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "description" VARCHAR(1000),
    "category" "content_category" NOT NULL DEFAULT 'OTHER',
    "coverImageId" UUID,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gallery_albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_items" (
    "id" UUID NOT NULL,
    "albumId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "caption" VARCHAR(400),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "gallery_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_entries" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "locale" "content_locale" NOT NULL DEFAULT 'en',
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "description" VARCHAR(1000),
    "videoUrl" VARCHAR(600) NOT NULL,
    "platform" "video_platform" NOT NULL DEFAULT 'YOUTUBE',
    "category" "content_category" NOT NULL DEFAULT 'OTHER',
    "thumbnailId" UUID,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "video_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_information" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "locale" "content_locale" NOT NULL DEFAULT 'en',
    "officeName" VARCHAR(200),
    "addressLine1" VARCHAR(250),
    "addressLine2" VARCHAR(250),
    "city" VARCHAR(120),
    "state" VARCHAR(120),
    "postalCode" VARCHAR(20),
    "phone" VARCHAR(40),
    "alternatePhone" VARCHAR(40),
    "email" VARCHAR(320),
    "officeHours" VARCHAR(300),
    "mapEmbedUrl" VARCHAR(600),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contact_information_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_links" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "platform" VARCHAR(40) NOT NULL,
    "label" VARCHAR(120),
    "url" VARCHAR(600) NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "social_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_assets_organizationId_kind_idx" ON "media_assets"("organizationId", "kind");

-- CreateIndex
CREATE INDEX "media_assets_organizationId_createdAt_idx" ON "media_assets"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "candidate_profiles_organizationId_status_idx" ON "candidate_profiles"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_profiles_organizationId_locale_key" ON "candidate_profiles"("organizationId", "locale");

-- CreateIndex
CREATE INDEX "visions_organizationId_status_idx" ON "visions"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "visions_organizationId_locale_key" ON "visions"("organizationId", "locale");

-- CreateIndex
CREATE INDEX "priorities_organizationId_status_displayOrder_idx" ON "priorities"("organizationId", "status", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "priorities_organizationId_slug_locale_key" ON "priorities"("organizationId", "slug", "locale");

-- CreateIndex
CREATE INDEX "projects_organizationId_status_publishedAt_idx" ON "projects"("organizationId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "projects_organizationId_category_status_idx" ON "projects"("organizationId", "category", "status");

-- CreateIndex
CREATE INDEX "projects_organizationId_featured_status_idx" ON "projects"("organizationId", "featured", "status");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organizationId_slug_locale_key" ON "projects"("organizationId", "slug", "locale");

-- CreateIndex
CREATE INDEX "project_media_projectId_role_sortOrder_idx" ON "project_media"("projectId", "role", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "project_media_projectId_mediaId_role_key" ON "project_media"("projectId", "mediaId", "role");

-- CreateIndex
CREATE INDEX "project_updates_projectId_occurredOn_idx" ON "project_updates"("projectId", "occurredOn");

-- CreateIndex
CREATE INDEX "achievements_organizationId_status_publishedAt_idx" ON "achievements"("organizationId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "achievements_organizationId_category_status_idx" ON "achievements"("organizationId", "category", "status");

-- CreateIndex
CREATE INDEX "achievements_organizationId_featured_status_idx" ON "achievements"("organizationId", "featured", "status");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_organizationId_slug_locale_key" ON "achievements"("organizationId", "slug", "locale");

-- CreateIndex
CREATE INDEX "achievement_media_achievementId_sortOrder_idx" ON "achievement_media"("achievementId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "achievement_media_achievementId_mediaId_key" ON "achievement_media"("achievementId", "mediaId");

-- CreateIndex
CREATE INDEX "achievement_evidence_achievementId_sortOrder_idx" ON "achievement_evidence"("achievementId", "sortOrder");

-- CreateIndex
CREATE INDEX "news_articles_organizationId_status_publishedAt_idx" ON "news_articles"("organizationId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "news_articles_organizationId_category_status_idx" ON "news_articles"("organizationId", "category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "news_articles_organizationId_slug_locale_key" ON "news_articles"("organizationId", "slug", "locale");

-- CreateIndex
CREATE INDEX "events_organizationId_status_startsAt_idx" ON "events"("organizationId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "events_organizationId_eventStatus_status_idx" ON "events"("organizationId", "eventStatus", "status");

-- CreateIndex
CREATE UNIQUE INDEX "events_organizationId_slug_locale_key" ON "events"("organizationId", "slug", "locale");

-- CreateIndex
CREATE INDEX "gallery_albums_organizationId_status_displayOrder_idx" ON "gallery_albums"("organizationId", "status", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "gallery_albums_organizationId_slug_locale_key" ON "gallery_albums"("organizationId", "slug", "locale");

-- CreateIndex
CREATE INDEX "gallery_items_albumId_sortOrder_idx" ON "gallery_items"("albumId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "gallery_items_albumId_mediaId_key" ON "gallery_items"("albumId", "mediaId");

-- CreateIndex
CREATE INDEX "video_entries_organizationId_status_displayOrder_idx" ON "video_entries"("organizationId", "status", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "video_entries_organizationId_slug_locale_key" ON "video_entries"("organizationId", "slug", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "contact_information_organizationId_locale_key" ON "contact_information"("organizationId", "locale");

-- CreateIndex
CREATE INDEX "social_links_organizationId_isActive_displayOrder_idx" ON "social_links"("organizationId", "isActive", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "social_links_organizationId_platform_key" ON "social_links"("organizationId", "platform");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_profileImageId_fkey" FOREIGN KEY ("profileImageId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_coverImageId_fkey" FOREIGN KEY ("coverImageId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visions" ADD CONSTRAINT "visions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "priorities" ADD CONSTRAINT "priorities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "priorities" ADD CONSTRAINT "priorities_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_coverImageId_fkey" FOREIGN KEY ("coverImageId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_media" ADD CONSTRAINT "project_media_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_media" ADD CONSTRAINT "project_media_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_coverImageId_fkey" FOREIGN KEY ("coverImageId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_media" ADD CONSTRAINT "achievement_media_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "achievements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_media" ADD CONSTRAINT "achievement_media_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_evidence" ADD CONSTRAINT "achievement_evidence_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "achievements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_evidence" ADD CONSTRAINT "achievement_evidence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_evidence" ADD CONSTRAINT "achievement_evidence_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_coverImageId_fkey" FOREIGN KEY ("coverImageId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_coverImageId_fkey" FOREIGN KEY ("coverImageId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_albums" ADD CONSTRAINT "gallery_albums_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_albums" ADD CONSTRAINT "gallery_albums_coverImageId_fkey" FOREIGN KEY ("coverImageId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "gallery_albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_entries" ADD CONSTRAINT "video_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_entries" ADD CONSTRAINT "video_entries_thumbnailId_fkey" FOREIGN KEY ("thumbnailId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_information" ADD CONSTRAINT "contact_information_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_links" ADD CONSTRAINT "social_links_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

