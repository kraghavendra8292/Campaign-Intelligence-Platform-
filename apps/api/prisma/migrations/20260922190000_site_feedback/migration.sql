-- Homepage opinion pulse (Great / Ok / Worst).

CREATE TYPE "site_feedback_reaction" AS ENUM ('GREAT', 'OK', 'WORST');

CREATE TABLE "site_feedback" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "reaction" "site_feedback_reaction" NOT NULL,
    "comment" VARCHAR(500),
    "submittedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "site_feedback_organizationId_createdAt_idx" ON "site_feedback"("organizationId", "createdAt");
CREATE INDEX "site_feedback_organizationId_reaction_createdAt_idx" ON "site_feedback"("organizationId", "reaction", "createdAt");

ALTER TABLE "site_feedback" ADD CONSTRAINT "site_feedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_feedback" ADD CONSTRAINT "site_feedback_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;