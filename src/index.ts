export * from './types';
export * from './commercialTypes';
export * from './utils/validators';
export * from './server/services/payrollScheduleEngine';
export * from './server/services/timesheetLockService';
export * from './server/services/jurisdictionResolver';
export * from './server/services/coverageMatrixService';
export * from './server/services/newYearRolloverService';
export * from './server/services/depreciationService';
export * from './server/services/homeOfficeService';
export * from './server/services/taxSimulatorService';
export * from './server/services/ocrService';
export * from './server/services/ocrRules';
export * from './lib/isomorphicCrypto';
export * from './lib/tinFormatting';
export * from './lib/tinCrypto';
export * from './server/services/invoicingService';
export * from './server/services/stripeWebhookService';
export * from './server/services/contractorComplianceService';
export * from './server/services/bankParserService';
export * from './server/services/reconciliationService';
export * from './server/services/auditReadinessService';
export * from './utils/taxEngine';

export const TAXSHIELD_LEDGER_CORE_VERSION = '0.2.0';

export type RuntimeProfile = 'core' | 'oss' | 'saas';

export interface SharedCoreContract {
  readonly version: string;
  readonly runtimeProfile: RuntimeProfile;
  readonly domainLayer: 'shared-core';
}

export const sharedCoreContract: SharedCoreContract = {
  version: TAXSHIELD_LEDGER_CORE_VERSION,
  runtimeProfile: 'core',
  domainLayer: 'shared-core',
};


