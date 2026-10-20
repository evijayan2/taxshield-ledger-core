-- CreateTable
CREATE TABLE "employee_work_location_histories" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "street_address" TEXT,
    "city" TEXT,
    "state" TEXT NOT NULL,
    "zip" TEXT,
    "psd_code" TEXT,
    "local_jurisdiction_name" TEXT,
    "work_eit_rate" DOUBLE PRECISION,
    "allocation_percentage" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "effective_date" TEXT NOT NULL,
    "end_date" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_work_location_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capital_assets" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "asset_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "date_placed_in_service" TEXT NOT NULL,
    "cost_basis" DOUBLE PRECISION NOT NULL,
    "business_use_percent" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "depreciation_method" TEXT NOT NULL DEFAULT 'MACRS_200_DB',
    "recovery_period_years" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "section_179_claimed" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "prior_depreciation" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capital_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_office_expenses" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "tax_year_id" TEXT NOT NULL,
    "calculation_method" TEXT NOT NULL DEFAULT 'SIMPLIFIED',
    "total_home_square_feet" DOUBLE PRECISION NOT NULL,
    "office_square_feet" DOUBLE PRECISION NOT NULL,
    "mortgage_interest" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "real_estate_taxes" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "home_insurance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "utilities" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "rent" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "repairs_maintenance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "other_direct_expenses" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "other_indirect_expenses" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_office_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "home_office_expenses_company_id_tax_year_id_key" ON "home_office_expenses"("company_id", "tax_year_id");

-- AddForeignKey
ALTER TABLE "employee_work_location_histories" ADD CONSTRAINT "employee_work_location_histories_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_assets" ADD CONSTRAINT "capital_assets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_office_expenses" ADD CONSTRAINT "home_office_expenses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_office_expenses" ADD CONSTRAINT "home_office_expenses_tax_year_id_fkey" FOREIGN KEY ("tax_year_id") REFERENCES "tax_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
