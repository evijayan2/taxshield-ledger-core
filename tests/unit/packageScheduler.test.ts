import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startDailyPackageSyncScheduler,
  stopDailyPackageSyncScheduler,
  getDailyPackageSyncStatus,
  triggerManualPackageSync,
} from '../../src/server/services/packageScheduler';
import * as ingestionService from '../../src/server/services/taxPackageIngestionService';

describe('packageScheduler (Shared Core Daily Ingestion Job)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopDailyPackageSyncScheduler();
  });

  afterEach(() => {
    stopDailyPackageSyncScheduler();
  });

  it('initializes the daily scheduler with default 24h interval', () => {
    startDailyPackageSyncScheduler({ serverUrl: 'http://localhost:3333' });
    const status = getDailyPackageSyncStatus();
    expect(status.isScheduled).toBe(true);
    expect(status.intervalMs).toBe(24 * 60 * 60 * 1000);
    expect(status.serverUrl).toBe('http://localhost:3333');
  });

  it('stops the scheduler cleanly', () => {
    startDailyPackageSyncScheduler();
    expect(getDailyPackageSyncStatus().isScheduled).toBe(true);
    stopDailyPackageSyncScheduler();
    expect(getDailyPackageSyncStatus().isScheduled).toBe(false);
  });

  it('manually triggers a package synchronization on demand', async () => {
    const mockBatchResult = {
      success: true,
      totalPackages: 4,
      ingestedPackages: 4,
      totalRules: 8,
      totalVersions: 8,
      results: [],
      timestamp: new Date().toISOString(),
    };

    vi.spyOn(ingestionService, 'syncAllAvailablePackages').mockResolvedValueOnce(mockBatchResult);

    const result = await triggerManualPackageSync({ serverUrl: 'http://localhost:3333' });
    expect(result.success).toBe(true);
    expect(result.ingestedPackages).toBe(4);

    const status = getDailyPackageSyncStatus();
    expect(status.lastCheckedAt).not.toBeNull();
    expect(status.lastSyncResult).toEqual(mockBatchResult);
  });
});
