import { PrismaClient } from '@prisma/client';
import { logError, logInfo } from './logger';

declare global {
  // eslint-disable-next-line no-var
  var globalPrisma: PrismaClient | undefined;
}

/**
 * Singleton instance of PrismaClient to prevent connection exhaustion in dev.
 */
export const prisma: PrismaClient =
  globalThis.globalPrisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.globalPrisma = prisma;
}

/**
 * Connect to PostgreSQL via Prisma Client.
 */
export async function connectDatabase(): Promise<boolean> {
  try {
    await prisma.$connect();
    logInfo('Successfully connected to PostgreSQL database via Prisma');
    return true;
  } catch (error) {
    logError('Failed to connect to database via Prisma', error);
    return false;
  }
}
