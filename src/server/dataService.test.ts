import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { saveAllDataToPostgres, loadAllDataFromPostgres } from './dataService.js';

describe('DataService PostgreSQL Persistence', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.POSTGRES_URL;
    delete process.env.DATABASE_URL;
    delete process.env.LOCAL_POSTGRES_URL;
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should safely handle save attempt when postgres connection is not configured', async () => {
    const result = await saveAllDataToPostgres({
      org: { name: 'Test' },
      complianceTasks: [{ id: 'comp_01', filingMethod: undefined }]
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('No POSTGRES_URL configured');
  });

  it('should return null when loading data without active postgres configuration', async () => {
    const data = await loadAllDataFromPostgres();
    expect(data).toBeNull();
  });
});
