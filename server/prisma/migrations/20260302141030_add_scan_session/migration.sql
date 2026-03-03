-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('DRAFT', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "scans" ADD COLUMN     "session_id" UUID;

-- CreateTable
CREATE TABLE "scan_sessions" (
    "id" UUID NOT NULL,
    "name" TEXT,
    "base_url" TEXT NOT NULL,
    "parsed_endpoints" JSONB NOT NULL,
    "global_mapping" JSONB,
    "account_a_auth" TEXT,
    "account_b_auth" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'DRAFT',
    "total_endpoints" INTEGER NOT NULL DEFAULT 0,
    "scanned_endpoints" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_sessions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "scan_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
