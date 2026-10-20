-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('WEEKLY', 'BI_WEEKLY', 'SEMI_MONTHLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "WeekendRollRule" AS ENUM ('PREVIOUS_BUSINESS_DAY', 'NEXT_BUSINESS_DAY', 'EXACT_DAY');

-- CreateEnum
CREATE TYPE "CalendarPeriodStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'OPEN', 'LOCKED', 'COMPLETED');

-- AlterTable
ALTER TABLE "timesheets" ADD COLUMN "period_id" TEXT;

-- CreateTable
CREATE TABLE "pay_schedule_configs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "tax_year_id" TEXT,
    "pay_frequency" "PayFrequency" NOT NULL DEFAULT 'BI_WEEKLY',
    "payday_day_of_week" INTEGER NOT NULL DEFAULT 5,
    "anchor_pay_date" TEXT,
    "period_lag_days" INTEGER NOT NULL DEFAULT 5,
    "semi_monthly_day_1" INTEGER NOT NULL DEFAULT 15,
    "semi_monthly_day_2" INTEGER NOT NULL DEFAULT 0,
    "monthly_pay_day" INTEGER NOT NULL DEFAULT 0,
    "timesheet_cutoff_days" INTEGER NOT NULL DEFAULT 2,
    "weekend_roll_rule" "WeekendRollRule" NOT NULL DEFAULT 'PREVIOUS_BUSINESS_DAY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_schedule_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_calendar_periods" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "tax_year_id" TEXT NOT NULL,
    "period_number" INTEGER NOT NULL,
    "period_start" TEXT NOT NULL,
    "period_end" TEXT NOT NULL,
    "timesheet_lock_date" TEXT NOT NULL,
    "scheduled_pay_date" TEXT NOT NULL,
    "actual_pay_date" TEXT NOT NULL,
    "status" "CalendarPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_calendar_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pay_schedule_configs_company_id_tax_year_id_key" ON "pay_schedule_configs"("company_id", "tax_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_calendar_periods_company_id_tax_year_id_period_number_key" ON "payroll_calendar_periods"("company_id", "tax_year_id", "period_number");

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_calendar_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_schedule_configs" ADD CONSTRAINT "pay_schedule_configs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_calendar_periods" ADD CONSTRAINT "payroll_calendar_periods_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_calendar_periods" ADD CONSTRAINT "payroll_calendar_periods_tax_year_id_fkey" FOREIGN KEY ("tax_year_id") REFERENCES "tax_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
