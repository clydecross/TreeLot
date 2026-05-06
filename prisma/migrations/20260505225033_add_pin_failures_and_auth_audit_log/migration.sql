-- CreateTable
CREATE TABLE "pin_failures" (
    "userId" UUID NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ,
    "lastAttemptAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pin_failures_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "auth_audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope" TEXT NOT NULL,
    "userId" UUID,
    "locationId" UUID,
    "ip" TEXT,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_audit_log_ip_scope_createdAt_idx" ON "auth_audit_log"("ip", "scope", "createdAt");

-- CreateIndex
CREATE INDEX "auth_audit_log_userId_createdAt_idx" ON "auth_audit_log"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "pin_failures" ADD CONSTRAINT "pin_failures_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_audit_log" ADD CONSTRAINT "auth_audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
