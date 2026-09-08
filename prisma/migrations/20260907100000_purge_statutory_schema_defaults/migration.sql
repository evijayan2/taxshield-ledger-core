-- Regulatory tax values must come from an effective-dated TaxRuleVersion.
-- Remove statutory rate defaults and make legacy/work rate fields nullable.
ALTER TABLE "companies" ALTER COLUMN "ownerTaxBracket" DROP DEFAULT;
ALTER TABLE "companies" ALTER COLUMN "ownerTaxBracket" DROP NOT NULL;
ALTER TABLE "companies" ALTER COLUMN "standardMileageRate" DROP DEFAULT;

-- Company lifecycle status and closure tracking fields
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMP(3);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "closure_reason" TEXT;

-- Employee statutory rate field changes
ALTER TABLE "employees" ALTER COLUMN "local_tax_rate" DROP DEFAULT;
ALTER TABLE "employees" ALTER COLUMN "local_tax_rate" DROP NOT NULL;
ALTER TABLE "employees" ALTER COLUMN "local_flat_tax_annual" DROP DEFAULT;
ALTER TABLE "employees" ALTER COLUMN "local_flat_tax_annual" DROP NOT NULL;

-- CreateTable: company_address_histories
CREATE TABLE IF NOT EXISTS "company_address_histories" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "street_address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "psd_code" TEXT,
    "local_jurisdiction_name" TEXT,
    "work_eit_rate" DOUBLE PRECISION,
    "effective_date" TEXT NOT NULL,
    "end_date" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_address_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable: employee_bank_histories
CREATE TABLE IF NOT EXISTS "employee_bank_histories" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_type" TEXT NOT NULL DEFAULT 'CHECKING',
    "routing_number" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "bank_account_masked" TEXT NOT NULL,
    "effective_date" TEXT NOT NULL,
    "end_date" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_bank_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable: employee_residence_histories
CREATE TABLE IF NOT EXISTS "employee_residence_histories" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "street_address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "psd_code" TEXT,
    "local_jurisdiction_name" TEXT,
    "local_tax_rate" DOUBLE PRECISION,
    "effective_date" TEXT NOT NULL,
    "end_date" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_residence_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable: pay_stub_tax_lines
CREATE TABLE IF NOT EXISTS "pay_stub_tax_lines" (
    "id" TEXT NOT NULL,
    "pay_stub_id" TEXT NOT NULL,
    "jurisdiction_type" TEXT NOT NULL,
    "jurisdiction_code" TEXT NOT NULL,
    "jurisdiction_name" TEXT NOT NULL,
    "taxable_wages" DOUBLE PRECISION NOT NULL,
    "tax_rate" DOUBLE PRECISION NOT NULL,
    "tax_withheld" DOUBLE PRECISION NOT NULL,
    "start_date" TEXT,
    "end_date" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pay_stub_tax_lines_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: company_address_histories -> companies
ALTER TABLE "company_address_histories" DROP CONSTRAINT IF EXISTS "company_address_histories_company_id_fkey";
ALTER TABLE "company_address_histories" ADD CONSTRAINT "company_address_histories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: employee_bank_histories -> employees
ALTER TABLE "employee_bank_histories" DROP CONSTRAINT IF EXISTS "employee_bank_histories_employee_id_fkey";
ALTER TABLE "employee_bank_histories" ADD CONSTRAINT "employee_bank_histories_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: employee_residence_histories -> employees
ALTER TABLE "employee_residence_histories" DROP CONSTRAINT IF EXISTS "employee_residence_histories_employee_id_fkey";
ALTER TABLE "employee_residence_histories" ADD CONSTRAINT "employee_residence_histories_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: pay_stub_tax_lines -> pay_stubs
ALTER TABLE "pay_stub_tax_lines" DROP CONSTRAINT IF EXISTS "pay_stub_tax_lines_pay_stub_id_fkey";
ALTER TABLE "pay_stub_tax_lines" ADD CONSTRAINT "pay_stub_tax_lines_pay_stub_id_fkey" FOREIGN KEY ("pay_stub_id") REFERENCES "pay_stubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
