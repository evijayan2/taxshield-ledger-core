-- CreateTable
CREATE TABLE "tax_filing_upload_templates" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "portal_key" TEXT NOT NULL,
    "portal_label" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "file_format" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "template_file_name" TEXT NOT NULL,
    "template_content" TEXT NOT NULL,
    "template_hash_sha256" TEXT NOT NULL,
    "detected_headers" JSONB,
    "business_location_psd" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_filing_upload_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_filing_upload_templates_company_id_is_enabled_idx" ON "tax_filing_upload_templates"("company_id", "is_enabled");

-- CreateIndex
CREATE UNIQUE INDEX "tax_filing_upload_templates_company_id_portal_key_key" ON "tax_filing_upload_templates"("company_id", "portal_key");

-- AddForeignKey
ALTER TABLE "tax_filing_upload_templates" ADD CONSTRAINT "tax_filing_upload_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
