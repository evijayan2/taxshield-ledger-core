-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "worker_classification" TEXT NOT NULL DEFAULT 'W2_EMPLOYEE';

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip_code" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "tax_year_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "issue_date" TEXT NOT NULL,
    "due_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "subtotal" DOUBLE PRECISION NOT NULL,
    "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "amount_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stripe_payment_id" TEXT,
    "stripe_payment_url" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_w9_records" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "business_name" TEXT,
    "tax_classification" TEXT NOT NULL,
    "tin_type" TEXT NOT NULL,
    "tin_masked" TEXT NOT NULL,
    "tin_encrypted" TEXT NOT NULL,
    "exempt_payee_code" TEXT,
    "fatca_code" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip_code" TEXT NOT NULL,
    "certified_signature" TEXT NOT NULL,
    "certified_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "is_1099_eligible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_w9_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractor_payments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "tax_year_id" TEXT NOT NULL,
    "payment_date" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "payment_method" TEXT NOT NULL DEFAULT 'ACH',
    "reference_number" TEXT,
    "description" TEXT,
    "general_expense_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contractor_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_company_id_idx" ON "customers"("company_id");

-- CreateIndex
CREATE INDEX "invoices_company_id_tax_year_id_idx" ON "invoices"("company_id", "tax_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_company_id_invoice_number_key" ON "invoices"("company_id", "invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "form_w9_records_employee_id_key" ON "form_w9_records"("employee_id");

-- CreateIndex
CREATE INDEX "form_w9_records_company_id_idx" ON "form_w9_records"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "contractor_payments_general_expense_id_key" ON "contractor_payments"("general_expense_id");

-- CreateIndex
CREATE INDEX "contractor_payments_company_id_tax_year_id_employee_id_idx" ON "contractor_payments"("company_id", "tax_year_id", "employee_id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tax_year_id_fkey" FOREIGN KEY ("tax_year_id") REFERENCES "tax_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_w9_records" ADD CONSTRAINT "form_w9_records_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_w9_records" ADD CONSTRAINT "form_w9_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_payments" ADD CONSTRAINT "contractor_payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_payments" ADD CONSTRAINT "contractor_payments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_payments" ADD CONSTRAINT "contractor_payments_tax_year_id_fkey" FOREIGN KEY ("tax_year_id") REFERENCES "tax_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_payments" ADD CONSTRAINT "contractor_payments_general_expense_id_fkey" FOREIGN KEY ("general_expense_id") REFERENCES "general_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "payroll_calendar_periods_company_id_tax_year_id_period_number_k" RENAME TO "payroll_calendar_periods_company_id_tax_year_id_period_numb_key";
