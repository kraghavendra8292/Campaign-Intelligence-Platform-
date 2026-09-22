-- Attribute homepage opinions to QR campaigns / codes via rk_qr.

ALTER TABLE "site_feedback" ADD COLUMN IF NOT EXISTS "campaignId" UUID;
ALTER TABLE "site_feedback" ADD COLUMN IF NOT EXISTS "qrCodeId" UUID;

CREATE INDEX IF NOT EXISTS "site_feedback_campaignId_createdAt_idx" ON "site_feedback"("campaignId", "createdAt");
CREATE INDEX IF NOT EXISTS "site_feedback_qrCodeId_createdAt_idx" ON "site_feedback"("qrCodeId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_feedback_campaignId_fkey'
  ) THEN
    ALTER TABLE "site_feedback"
      ADD CONSTRAINT "site_feedback_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "qr_campaigns"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_feedback_qrCodeId_fkey'
  ) THEN
    ALTER TABLE "site_feedback"
      ADD CONSTRAINT "site_feedback_qrCodeId_fkey"
      FOREIGN KEY ("qrCodeId") REFERENCES "qr_codes"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
