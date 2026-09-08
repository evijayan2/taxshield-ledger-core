-- Regulatory tax values must come from an effective-dated TaxRuleVersion.
-- Existing values remain readable for audit/migration only; no data is deleted.
ALTER TABLE "companies" ALTER COLUMN "ownerTaxBracket" DROP DEFAULT;
ALTER TABLE "companies" ALTER COLUMN "standardMileageRate" DROP DEFAULT;
ALTER TABLE "employees" ALTER COLUMN "local_tax_rate" DROP DEFAULT;
ALTER TABLE "employees" ALTER COLUMN "local_flat_tax_annual" DROP DEFAULT;

