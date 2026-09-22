-- CreateEnum
CREATE TYPE "QrCampaignType" AS ENUM ('POSTER', 'PAMPHLET', 'BANNER', 'EVENT', 'SOCIAL_MEDIA', 'OFFICE', 'DOOR_TO_DOOR', 'OTHER');

-- CreateEnum
CREATE TYPE "QrCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QrCodeStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScanDeviceCategory" AS ENUM ('MOBILE', 'TABLET', 'DESKTOP', 'BOT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ScanOsCategory" AS ENUM ('IOS', 'ANDROID', 'WINDOWS', 'MACOS', 'LINUX', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ScanReferrerCategory" AS ENUM ('DIRECT', 'SEARCH', 'SOCIAL', 'MESSAGING', 'OTHER');

-- CreateTable
CREATE TABLE "qr_campaigns" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "campaignType" "QrCampaignType" NOT NULL DEFAULT 'OTHER',
    "status" "QrCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMPTZ(6),
    "endDate" TIMESTAMPTZ(6),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "qr_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_codes" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "destinationPath" VARCHAR(500) NOT NULL,
    "status" "QrCodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" VARCHAR(120),
    "placement" VARCHAR(200),
    "area" VARCHAR(120),
    "ward" VARCHAR(120),
    "locality" VARCHAR(120),
    "latitude" DECIMAL(8,6),
    "longitude" DECIMAL(9,6),
    "utmSource" VARCHAR(120),
    "utmMedium" VARCHAR(120),
    "utmCampaign" VARCHAR(120),
    "utmContent" VARCHAR(120),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "activatedAt" TIMESTAMPTZ(6),
    "deactivatedAt" TIMESTAMPTZ(6),

    CONSTRAINT "qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_scan_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "qrCodeId" UUID NOT NULL,
    "scannedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanDate" DATE NOT NULL,
    "scanHour" SMALLINT NOT NULL,
    "scanDayOfWeek" SMALLINT NOT NULL,
    "deviceCategory" "ScanDeviceCategory" NOT NULL DEFAULT 'UNKNOWN',
    "osCategory" "ScanOsCategory" NOT NULL DEFAULT 'UNKNOWN',
    "referrerCategory" "ScanReferrerCategory" NOT NULL DEFAULT 'DIRECT',
    "isAutomated" BOOLEAN NOT NULL DEFAULT false,
    "landingPath" VARCHAR(500) NOT NULL,
    "utmSource" VARCHAR(120),
    "utmMedium" VARCHAR(120),
    "utmCampaign" VARCHAR(120),
    "utmContent" VARCHAR(120),
    "visitHash" VARCHAR(64),

    CONSTRAINT "qr_scan_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "qr_campaigns_organizationId_status_idx" ON "qr_campaigns"("organizationId", "status");

-- CreateIndex
CREATE INDEX "qr_campaigns_organizationId_createdAt_idx" ON "qr_campaigns"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "qr_campaigns_organizationId_slug_key" ON "qr_campaigns"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "qr_codes_code_key" ON "qr_codes"("code");

-- CreateIndex
CREATE INDEX "qr_codes_organizationId_campaignId_idx" ON "qr_codes"("organizationId", "campaignId");

-- CreateIndex
CREATE INDEX "qr_codes_organizationId_status_idx" ON "qr_codes"("organizationId", "status");

-- CreateIndex
CREATE INDEX "qr_codes_campaignId_status_idx" ON "qr_codes"("campaignId", "status");

-- CreateIndex
CREATE INDEX "qr_scan_events_organizationId_scannedAt_idx" ON "qr_scan_events"("organizationId", "scannedAt");

-- CreateIndex
CREATE INDEX "qr_scan_events_campaignId_scannedAt_idx" ON "qr_scan_events"("campaignId", "scannedAt");

-- CreateIndex
CREATE INDEX "qr_scan_events_qrCodeId_scannedAt_idx" ON "qr_scan_events"("qrCodeId", "scannedAt");

-- AddForeignKey
ALTER TABLE "qr_campaigns" ADD CONSTRAINT "qr_campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_campaigns" ADD CONSTRAINT "qr_campaigns_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "qr_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_scan_events" ADD CONSTRAINT "qr_scan_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_scan_events" ADD CONSTRAINT "qr_scan_events_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "qr_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_scan_events" ADD CONSTRAINT "qr_scan_events_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

