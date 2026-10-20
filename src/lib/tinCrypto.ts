import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Resolves a 256-bit Buffer key from an explicit parameter or environment variable.
 * @param explicitKey Optional explicit Buffer or encoded string key.
 * @returns 32-byte encryption key Buffer.
 */
function resolveKey(explicitKey?: Buffer | string): Buffer {
  const rawKey =
    explicitKey ||
    process.env.TIN_ENCRYPTION_KEY ||
    (process.env.NODE_ENV !== 'production'
      ? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      : undefined);

  if (!rawKey) {
    throw new Error('TIN_ENCRYPTION_KEY environment variable is required for TIN encryption/decryption in production.');
  }
  if (Buffer.isBuffer(rawKey)) {
    if (rawKey.length !== 32) {
      throw new Error(`Invalid key buffer length: expected 32 bytes, got ${rawKey.length}`);
    }
    return rawKey;
  }

  if (rawKey.length === 64) {
    return Buffer.from(rawKey, 'hex');
  }

  const base64Buf = Buffer.from(rawKey, 'base64');
  if (base64Buf.length === 32) {
    return base64Buf;
  }

  // Derive SHA-256 hash if raw string provided
  return crypto.createHash('sha256').update(rawKey).digest();
}

import {
  normalizeTIN,
  validateTIN,
  isValidTIN,
  formatTIN,
  maskTIN,
} from './tinFormatting';

export {
  normalizeTIN,
  validateTIN,
  isValidTIN,
  formatTIN,
  maskTIN,
};

/**
 * Encrypts a sensitive Taxpayer Identification Number using AES-256-GCM.
 * @param plainTIN Clean or formatted SSN/EIN.
 * @param key Optional secret key Buffer or hex/base64 string.
 * @returns Serialized encrypted payload in format "iv:tag:ciphertext" (base64).
 */
export function encryptTIN(plainTIN: string, key?: Buffer | string): string {
  const clean = normalizeTIN(plainTIN);
  if (!clean) {
    throw new Error('Cannot encrypt empty Taxpayer Identification Number');
  }

  const secretKey = resolveKey(key);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, secretKey, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypts an AES-256-GCM encrypted Taxpayer Identification Number.
 * @param encryptedPayload Serialized string in format "iv:tag:ciphertext".
 * @param key Optional secret key Buffer or hex/base64 string.
 * @returns Plaintext 9-digit TIN string.
 */
export function decryptTIN(encryptedPayload: string, key?: Buffer | string): string {
  if (!encryptedPayload || !encryptedPayload.includes(':')) {
    throw new Error('Invalid encrypted TIN payload format');
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Encrypted TIN payload must have iv:tag:ciphertext segments');
  }

  const [ivB64, tagB64, dataB64] = parts;
  const secretKey = resolveKey(key);
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encryptedData = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, secretKey, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  return decrypted.toString('utf8');
}
