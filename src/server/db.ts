import pg from 'pg';
const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPostgresConnectionString(): string | null {
  const explicitUrl =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.LOCAL_POSTGRES_URL;

  if (explicitUrl) {
    return explicitUrl;
  }

  // Fallback to standard local PostgreSQL connection string for local development
  if (process.env.NODE_ENV !== 'production') {
    return 'postgres://postgres:postgres@localhost:5432/taxledger';
  }

  return null;
}

export function getPool(): pg.Pool | null {
  const connectionString = getPostgresConnectionString();
  if (!connectionString) {
    return null;
  }

  if (!pool) {
    // Enable SSL by default for Vercel Postgres / Neon / Cloud Postgres, disable for localhost/127.0.0.1
    const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    pool = new Pool({
      connectionString,
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 3000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });
  }

  return pool;
}

export function resetPool(): void {
  if (pool) {
    pool.end().catch(() => {});
    pool = null;
  }
}

async function ensureLocalDatabaseExists(connStr: string): Promise<boolean> {
  try {
    const url = new URL(connStr);
    const dbName = url.pathname.replace('/', '');
    if (!dbName || dbName === 'postgres') return false;

    url.pathname = '/postgres';
    const maintenancePool = new Pool({
      connectionString: url.toString(),
      ssl: false,
      connectionTimeoutMillis: 3000,
    });

    const client = await maintenancePool.connect();
    try {
      const checkRes = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
      if (checkRes.rowCount === 0) {
        const safeDbName = dbName.replace(/[^a-zA-Z0-9_]/g, '');
        await client.query(`CREATE DATABASE "${safeDbName}"`);
        console.log(`[PostgreSQL] Auto-created local database "${safeDbName}".`);
        return true;
      }
    } finally {
      client.release();
      await maintenancePool.end().catch(() => {});
    }
  } catch (err: any) {
    console.warn('[PostgreSQL] Could not auto-create local database:', err.message);
  }
  return false;
}

export async function initPostgresTables(): Promise<{ success: boolean; message: string; tableCounts?: Record<string, number> }> {
  const connStr = getPostgresConnectionString();
  const p = getPool();
  if (!p || !connStr) {
    return {
      success: false,
      message: 'No PostgreSQL connection string available. Configure DATABASE_URL or POSTGRES_URL in your environment.'
    };
  }

  let client;
  try {
    client = await p.connect();
  } catch (connErr: any) {
    const isLocal = connStr.includes('localhost') || connStr.includes('127.0.0.1');
    if (connErr.code === '3D000' && isLocal) {
      const created = await ensureLocalDatabaseExists(connStr);
      if (created) {
        try {
          client = await p.connect();
        } catch (retryErr: any) {
          return {
            success: false,
            message: `Created database but failed to connect: ${retryErr.message}`
          };
        }
      } else {
        return {
          success: false,
          message: `Target PostgreSQL database does not exist and could not be created automatically: ${connErr.message}`
        };
      }
    } else {
      let hint = '';
      if (connErr.code === '28P01') {
        hint = ' Password authentication failed for local PostgreSQL user. Please verify your password in DATABASE_URL or POSTGRES_URL.';
      } else if (connErr.code === 'ECONNREFUSED') {
        hint = ' Local PostgreSQL server is not running on port 5432. Start your local PostgreSQL service.';
      }
      return {
        success: false,
        message: `PostgreSQL connection error: ${connErr.message}.${hint}`
      };
    }
  }
  try {
    const [
      compCountRes,
      empRes,
      milRes,
      trvRes,
      runRes,
      stubRes,
      compRes,
      auditRes
    ] = await Promise.all([
      client.query('SELECT COUNT(*) FROM companies').catch(() => ({ rows: [{ count: '0' }] })),
      client.query('SELECT COUNT(*) FROM employees').catch(() => ({ rows: [{ count: '0' }] })),
      client.query('SELECT COUNT(*) FROM mileage_logs').catch(() => ({ rows: [{ count: '0' }] })),
      client.query('SELECT COUNT(*) FROM travel_expenses').catch(() => ({ rows: [{ count: '0' }] })),
      client.query('SELECT COUNT(*) FROM payroll_runs').catch(() => ({ rows: [{ count: '0' }] })),
      client.query('SELECT COUNT(*) FROM pay_stubs').catch(() => ({ rows: [{ count: '0' }] })),
      client.query('SELECT COUNT(*) FROM compliance_tasks').catch(() => ({ rows: [{ count: '0' }] })),
      client.query('SELECT COUNT(*) FROM audit_log_entries').catch(() => ({ rows: [{ count: '0' }] }))
    ]);

    return {
      success: true,
      message: 'PostgreSQL connection verified. Database schema is managed via Prisma migrations.',
      tableCounts: {
        companies: parseInt(compCountRes.rows[0].count, 10),
        employees: parseInt(empRes.rows[0].count, 10),
        mileage_logs: parseInt(milRes.rows[0].count, 10),
        travel_expenses: parseInt(trvRes.rows[0].count, 10),
        payroll_runs: parseInt(runRes.rows[0].count, 10),
        pay_stubs: parseInt(stubRes.rows[0].count, 10),
        compliance_tasks: parseInt(compRes.rows[0].count, 10),
        audit_log_entries: parseInt(auditRes.rows[0].count, 10),
      }
    };
  } catch (err: any) {
    console.error('PostgreSQL connection verification error:', err);
    return {
      success: false,
      message: `Failed to verify PostgreSQL connection: ${err.message}`
    };
  } finally {
    client.release();
  }
}
