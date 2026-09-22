-- CreateIndex
CREATE INDEX "issues_organizationId_resolvedAt_idx" ON "issues"("organizationId", "resolvedAt");

-- CreateIndex
CREATE INDEX "issues_organizationId_status_submittedAt_idx" ON "issues"("organizationId", "status", "submittedAt");

