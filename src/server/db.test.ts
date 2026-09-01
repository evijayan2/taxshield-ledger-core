import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getPostgresConnectionString } from './db.js';

describe('PostgreSQL Connection Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.POSTGRES_URL;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_PRISMA_URL;
    delete process.env.POSTGRES_URL_NON_POOLING;
    delete process.env.LOCAL_POSTGRES_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should prioritize explicit POSTGRES_URL when provided', () => {
    process.env.POSTGRES_URL = 'postgres://user:pass@cloudhost:5432/mydb?sslmode=require';
    expect(getPostgresConnectionString()).toBe('postgres://user:pass@cloudhost:5432/mydb?sslmode=require');
  });

  it('should prioritize DATABASE_URL if POSTGRES_URL is unset', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@customhost:5432/customdb';
    expect(getPostgresConnectionString()).toBe('postgres://user:pass@customhost:5432/customdb');
  });

  it('should support LOCAL_POSTGRES_URL override', () => {
    process.env.LOCAL_POSTGRES_URL = 'postgres://myuser:mypass@localhost:5432/mydevdb';
    expect(getPostgresConnectionString()).toBe('postgres://myuser:mypass@localhost:5432/mydevdb');
  });

  it('should fallback to default local postgres URL in development mode when no env var is set', () => {
    process.env.NODE_ENV = 'development';
    expect(getPostgresConnectionString()).toBe('postgres://postgres:postgres@localhost:5432/taxledger');
  });

  it('should return null in production mode when no environment variables are set', () => {
    process.env.NODE_ENV = 'production';
    expect(getPostgresConnectionString()).toBeNull();
  });
});
