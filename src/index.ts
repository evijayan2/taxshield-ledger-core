export * from './types';
export * from './utils/validators';
export * from './server/services/canonicalJson';
export * from './server/services/taxPackageIngestionService';
export * from './server/services/packageScheduler';

export const TAXSHIELD_LEDGER_CORE_VERSION = '0.1.0';

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

