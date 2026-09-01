export const TAXSHIELD_LEDGER_CORE_VERSION = '0.1.0';

export type RuntimeProfile = 'oss' | 'saas';

export interface SharedCoreContract {
  readonly version: string;
  readonly runtimeProfile: RuntimeProfile;
}

export const sharedCoreContract: SharedCoreContract = {
  version: TAXSHIELD_LEDGER_CORE_VERSION,
  runtimeProfile: 'oss',
};
