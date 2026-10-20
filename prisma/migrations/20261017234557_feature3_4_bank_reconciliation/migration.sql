-- CreateEnum
CREATE TYPE "BankReconciliationStatus" AS ENUM ('UNMATCHED', 'NEEDS_REVIEW', 'MATCHED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "BankMatchedEntityType" AS ENUM ('GENERAL_EXPENSE', 'TRAVEL_EXPENSE', 'INVOICE', 'PAYROLL_RUN', 'CONTRACTOR_PAYMENT', 'TRANSFER_INTERNAL');

-- CreateTable
CREATE TABLE "bank_import_batches" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "account_name" TEXT,
    "account_mask" TEXT,
    "total_rows" INTEGER NOT NULL,
    "matched_count" INTEGER NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "unmatched_count" INTEGER NOT NULL DEFAULT 0,
    "duplicate_count" INTEGER NOT NULL DEFAULT 0,
    "net_amount" DOUBLE PRECISION NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "posted_date" TEXT NOT NULL,
    "raw_description" TEXT NOT NULL,
    "clean_payee" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "transaction_type" TEXT NOT NULL,
    "reconciliation_status" "BankReconciliationStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "matched_entity_type" "BankMatchedEntityType",
    "matched_entity_id" TEXT,
    "confidence_score" DOUBLE PRECISION,
    "match_notes" TEXT,
    "reconciled_at" TIMESTAMP(3),
    "reconciled_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_import_batches_company_id_idx" ON "bank_import_batches"("company_id");

-- CreateIndex
CREATE INDEX "bank_transactions_company_id_reconciliation_status_idx" ON "bank_transactions"("company_id", "reconciliation_status");

-- CreateIndex
CREATE INDEX "bank_transactions_company_id_posted_date_idx" ON "bank_transactions"("company_id", "posted_date");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_company_id_fingerprint_key" ON "bank_transactions"("company_id", "fingerprint");

-- AddForeignKey
ALTER TABLE "bank_import_batches" ADD CONSTRAINT "bank_import_batches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "bank_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
