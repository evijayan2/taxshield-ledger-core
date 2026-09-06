import { logInfo, logWarn, logError } from '../../lib/logger';
import {
  syncAllAvailablePackages,
  type IBatchIngestionResult,
  type IIngestionOptions,
} from './taxPackageIngestionService';

export interface ISchedulerOptions {
  intervalMs?: number;
  serverUrl?: string;
  actorId?: string;
  companyId?: string;
  runImmediately?: boolean;
}

export interface ISchedulerStatus {
  isScheduled: boolean;
  intervalMs: number;
  lastCheckedAt: string | null;
  lastSyncResult: IBatchIngestionResult | null;
  serverUrl: string;
}

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

let timerHandle: NodeJS.Timeout | null = null;
let lastCheckedAt: string | null = null;
let lastSyncResult: IBatchIngestionResult | null = null;
let activeServerUrl = 'http://localhost:3333';
let activeIntervalMs = DEFAULT_INTERVAL_MS;

/**
 * Executes a single scheduled cycle of package checking and ingestion.
 */
async function executeScheduledSync(options: ISchedulerOptions): Promise<void> {
  lastCheckedAt = new Date().toISOString();
  const serverUrl = options.serverUrl || activeServerUrl;
  const ingestionOptions: IIngestionOptions = {
    actorId: options.actorId || 'system_daily_scheduler',
    companyId: options.companyId,
    activateImmediately: true,
  };

  try {
    logInfo(`[Daily Package Scheduler] Checking for regulatory updates from ${serverUrl}`);
    const result = await syncAllAvailablePackages(serverUrl, ingestionOptions);
    lastSyncResult = result;
    if (result.success) {
      logInfo(
        `[Daily Package Scheduler] Successfully completed sync: ${result.ingestedPackages}/${result.totalPackages} packages, ${result.totalRules} rules.`
      );
    } else {
      logWarn(`[Daily Package Scheduler] Completed sync with issues: ${result.error || 'Partial failure'}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('[Daily Package Scheduler] Unexpected sync error', err);
    lastSyncResult = {
      success: false,
      totalPackages: 0,
      ingestedPackages: 0,
      totalRules: 0,
      totalVersions: 0,
      results: [],
      timestamp: lastCheckedAt,
      error: msg,
    };
  }
}

/**
 * Starts the automated daily package synchronization background scheduler.
 * @param options - Configuration options for scheduler
 */
export function startDailyPackageSyncScheduler(options: ISchedulerOptions = {}): void {
  if (timerHandle) {
    logWarn('[Daily Package Scheduler] Scheduler already active, restarting with new options.');
    stopDailyPackageSyncScheduler();
  }

  activeIntervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
  activeServerUrl = options.serverUrl || process.env.TAX_PACKAGE_SERVER_URL || 'http://localhost:3333';

  logInfo(
    `[Daily Package Scheduler] Initializing daily scheduler: interval=${activeIntervalMs}ms, server=${activeServerUrl}`
  );

  timerHandle = setInterval(() => {
    void executeScheduledSync(options);
  }, activeIntervalMs);

  if (timerHandle.unref) {
    timerHandle.unref();
  }

  if (options.runImmediately) {
    void executeScheduledSync(options);
  }
}

/**
 * Stops the automated daily package synchronization background scheduler.
 */
export function stopDailyPackageSyncScheduler(): void {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
    logInfo('[Daily Package Scheduler] Scheduler stopped.');
  }
}

/**
 * Returns current scheduler status and last execution results.
 * @returns Status summary object
 */
export function getDailyPackageSyncStatus(): ISchedulerStatus {
  return {
    isScheduled: timerHandle !== null,
    intervalMs: activeIntervalMs,
    lastCheckedAt,
    lastSyncResult,
    serverUrl: activeServerUrl,
  };
}

/**
 * Manually triggers an immediate synchronization cycle.
 * @param options - Optional custom options for the manual run
 * @returns Ingestion batch report
 */
export async function triggerManualPackageSync(
  options: ISchedulerOptions = {}
): Promise<IBatchIngestionResult> {
  const serverUrl = options.serverUrl || activeServerUrl;
  const ingestionOptions: IIngestionOptions = {
    actorId: options.actorId || 'owner_manual_trigger',
    companyId: options.companyId,
    activateImmediately: true,
  };

  lastCheckedAt = new Date().toISOString();
  const result = await syncAllAvailablePackages(serverUrl, ingestionOptions);
  lastSyncResult = result;
  return result;
}
