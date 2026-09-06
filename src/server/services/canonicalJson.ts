/**
 * Canonical JSON serialization utility for deterministic SHA-256 checksums.
 */

/**
 * Deterministically serializes any JavaScript value into canonical JSON.
 * Recursively sorts all dictionary keys alphabetically so hashes are stable.
 * @param value - Any JSON-serializable value.
 * @returns Canonical sorted JSON string.
 */
export function stringifyCanonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const elements = value.map((el) => stringifyCanonicalJson(el));
    return `[${elements.join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const pairs: string[] = [];

  for (const key of sortedKeys) {
    const val = obj[key];
    if (val !== undefined) {
      pairs.push(`${JSON.stringify(key)}:${stringifyCanonicalJson(val)}`);
    }
  }

  return `{${pairs.join(',')}}`;
}
