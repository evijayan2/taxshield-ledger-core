# TaxShield Ledger Core

This package is the shared core for the OSS and SaaS distributions of TaxShield Ledger.

It contains the common domain logic that must remain identical across both products:

- tax rules and jurisdiction resolution
- payroll calculations and audit snapshots
- ledger, expense, and mileage flows
- compliance and export services
- shared Prisma domain schema and regression tests

The SaaS wrapper and OSS wrapper may add runtime-specific access controls and UI layers, but they should not redefine tax logic or payroll behavior.
