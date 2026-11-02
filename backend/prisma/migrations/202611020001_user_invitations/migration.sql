-- User Invitation Tokens for email-based account activation
CREATE TABLE IF NOT EXISTS "user_invitation_tokens" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_invitation_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_invitation_tokens_tokenHash_key" ON "user_invitation_tokens"("tokenHash");
CREATE INDEX IF NOT EXISTS "user_invitation_tokens_employeeId_idx" ON "user_invitation_tokens"("employeeId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_invitation_tokens_employeeId_fkey'
    ) THEN
        ALTER TABLE "user_invitation_tokens"
        ADD CONSTRAINT "user_invitation_tokens_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

