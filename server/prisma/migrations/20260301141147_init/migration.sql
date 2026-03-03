-- CreateEnum
CREATE TYPE "ApiType" AS ENUM ('REST', 'GRAPHQL');

-- CreateEnum
CREATE TYPE "HeuristicStatus" AS ENUM ('CLEAN', 'SUSPICIOUS', 'ERROR');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'FALSE_POSITIVE', 'FIXED');

-- CreateTable
CREATE TABLE "scans" (
    "id" UUID NOT NULL,
    "target_url" TEXT NOT NULL,
    "http_method" TEXT NOT NULL,
    "api_type" "ApiType" NOT NULL,
    "graphql_operation" TEXT,
    "request_payload" JSONB NOT NULL,
    "account_a_auth" JSONB NOT NULL,
    "account_b_auth" JSONB NOT NULL,
    "heuristic_status" "HeuristicStatus" NOT NULL,
    "diff_evidence" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings" (
    "id" UUID NOT NULL,
    "scan_id" UUID NOT NULL,
    "severity" "Severity" NOT NULL,
    "affected_endpoint" TEXT NOT NULL,
    "llm_reasoning" TEXT NOT NULL,
    "repro_steps" TEXT NOT NULL,
    "suggested_fix" TEXT NOT NULL,
    "finding_status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "llm_meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
