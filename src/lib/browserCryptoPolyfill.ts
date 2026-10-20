/**
 * Browser Crypto Polyfill for Vite Client Bundles
 * 
 * Provides safe browser-side fallbacks for common Node crypto APIs (createHash, randomBytes)
 * preventing "Module crypto has been externalized for browser compatibility" runtime exceptions.
 */

import { sha256Hex, randomHex } from './isomorphicCrypto';

export interface HashObject {
  update(data: string | Uint8Array): HashObject;
  digest(encoding?: string): string;
}

export const createHash = (algorithm: string): HashObject => {
  let buffer = '';
  return {
    update(data: string | Uint8Array) {
      if (typeof data === 'string') {
        buffer += data;
      } else {
        buffer += new TextDecoder().decode(data);
      }
      return this;
    },
    digest(encoding: string = 'hex'): string {
      const hex = sha256Hex(buffer);
      if (encoding === 'hex') {
        return hex;
      }
      return hex;
    },
  };
};

export const randomBytes = (size: number = 32) => {
  const hex = randomHex(size);
  return {
    toString(encoding: string = 'hex') {
      if (encoding === 'hex') {
        return hex;
      }
      return hex;
    },
  };
};

export const randomUUID = (): string => {
  const globalCrypto = typeof globalThis !== 'undefined' ? (globalThis.crypto as any) : undefined;
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export default {
  createHash,
  randomBytes,
  randomUUID,
};
