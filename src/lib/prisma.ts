import { PrismaClient } from '@prisma/client';
import { logError, logInfo } from './logger';

declare global {
  // eslint-disable-next-line no-var
  var globalPrisma: PrismaClient | undefined;
}

const isBrowser = typeof window !== 'undefined' || typeof process === 'undefined' || !process.env;
const isDev = !isBrowser && process.env?.NODE_ENV === 'development';
const isProd = !isBrowser && process.env?.NODE_ENV === 'production';

/**
 * Singleton instance of PrismaClient to prevent connection exhaustion in dev.
 */
export const prisma: PrismaClient =
  globalThis.globalPrisma ||
  new PrismaClient({
    ...(isBrowser ? {} : { log: isDev ? ['query', 'error', 'warn'] : ['error'] }),
  });

if (!isBrowser && !isProd) {
  globalThis.globalPrisma = prisma;
}

/**
 * Connect to PostgreSQL via Prisma Client.
 */
export async function connectDatabase(): Promise<boolean> {
  if (isBrowser) {
    return true;
  }
  try {
    await prisma.$connect();
    logInfo('Successfully connected to PostgreSQL database via Prisma');
    return true;
  } catch (error) {
    logError('Failed to connect to database via Prisma', error);
    return false;
  }
}
