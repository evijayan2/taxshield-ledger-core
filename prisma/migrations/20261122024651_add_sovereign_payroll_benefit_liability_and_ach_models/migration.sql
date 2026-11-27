-- CreateEnum
CREATE TYPE "BenefitPlanType" AS ENUM ('SECTION_125_HEALTH', 'SECTION_125_DENTAL_VISION', 'SECTION_125_FSA', 'SECTION_223_HSA', 'SECTION_401K_TRADITIONAL', 'SECTION_401K_ROTH', 'COMMUTER_TRANSIT', 'CUSTOM_POST_TAX');

-- CreateEnum
CREATE TYPE "DeductionAmountType" AS ENUM ('FIXED_AMOUNT', 'PERCENT_GROSS');

-- CreateEnum
CREATE TYPE "LiabilityStatus" AS ENUM ('UNPAID', 'ALLOCATED', 'SETTLED', 'RECONCILED');

-- CreateTable
CREATE TABLE "benefit_plans" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan_type" "BenefitPlanType" NOT NULL,
    "treatment_key" TEXT NOT NULL,
    "employer_mode" TEXT NOT NULL DEFAULT 'NONE',
    "employer_rate" DECIMAL(10,4),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benefit_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_deductions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "amount_type" "DeductionAmountType" NOT NULL DEFAULT 'FIXED_AMOUNT',
    "employee_amount" DECIMAL(12,2) NOT NULL,
    "employer_amount" DECIMAL(12,2),
    "annual_limit" DECIMAL(12,2),
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_deductions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_tax_liabilities" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "payroll_run_id" TEXT,
    "tax_year_id" TEXT NOT NULL,
    "jurisdiction_id" TEXT,
    "agency_code" TEXT NOT NULL,
    "tax_type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "liability_period_end" DATE NOT NULL,
    "statutory_due_date" DATE NOT NULL,
    "status" "LiabilityStatus" NOT NULL DEFAULT 'UNPAID',
    "confirmation_number" TEXT,
    "paid_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_tax_liabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_payment_allocations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "liability_id" TEXT NOT NULL,
    "ach_batch_id" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "allocated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ach_batches" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "payroll_run_id" TEXT,
    "batch_type" TEXT NOT NULL,
    "effective_entry_date" DATE NOT NULL,
    "entry_count" INTEGER NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "file_content_encrypted" TEXT NOT NULL,
    "file_hash_sha256" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ach_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "benefit_plans_company_id_idx" ON "benefit_plans"("company_id");

-- CreateIndex
CREATE INDEX "employee_deductions_company_id_employee_id_is_active_idx" ON "employee_deductions"("company_id", "employee_id", "is_active");

-- CreateIndex
CREATE INDEX "employee_deductions_company_id_plan_id_idx" ON "employee_deductions"("company_id", "plan_id");

-- CreateIndex
CREATE INDEX "payroll_tax_liabilities_company_id_status_statutory_due_dat_idx" ON "payroll_tax_liabilities"("company_id", "status", "statutory_due_date");

-- CreateIndex
CREATE INDEX "payroll_tax_liabilities_company_id_tax_year_id_idx" ON "payroll_tax_liabilities"("company_id", "tax_year_id");

-- CreateIndex
CREATE INDEX "tax_payment_allocations_company_id_liability_id_idx" ON "tax_payment_allocations"("company_id", "liability_id");

-- CreateIndex
CREATE INDEX "ach_batches_company_id_effective_entry_date_idx" ON "ach_batches"("company_id", "effective_entry_date");

-- CreateIndex
CREATE UNIQUE INDEX "ach_batches_company_id_file_hash_sha256_key" ON "ach_batches"("company_id", "file_hash_sha256");

-- AddForeignKey
ALTER TABLE "benefit_plans" ADD CONSTRAINT "benefit_plans_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_deductions" ADD CONSTRAINT "employee_deductions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_deductions" ADD CONSTRAINT "employee_deductions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_deductions" ADD CONSTRAINT "employee_deductions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "benefit_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_tax_liabilities" ADD CONSTRAINT "payroll_tax_liabilities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_tax_liabilities" ADD CONSTRAINT "payroll_tax_liabilities_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_tax_liabilities" ADD CONSTRAINT "payroll_tax_liabilities_tax_year_id_fkey" FOREIGN KEY ("tax_year_id") REFERENCES "tax_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_tax_liabilities" ADD CONSTRAINT "payroll_tax_liabilities_jurisdiction_id_fkey" FOREIGN KEY ("jurisdiction_id") REFERENCES "tax_jurisdictions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_payment_allocations" ADD CONSTRAINT "tax_payment_allocations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_payment_allocations" ADD CONSTRAINT "tax_payment_allocations_liability_id_fkey" FOREIGN KEY ("liability_id") REFERENCES "payroll_tax_liabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_payment_allocations" ADD CONSTRAINT "tax_payment_allocations_ach_batch_id_fkey" FOREIGN KEY ("ach_batch_id") REFERENCES "ach_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ach_batches" ADD CONSTRAINT "ach_batches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ach_batches" ADD CONSTRAINT "ach_batches_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
