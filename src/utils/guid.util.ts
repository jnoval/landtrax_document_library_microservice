export const GUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks whether a given string is a valid GUID / UUID.
 */
export function isValidGuid(val?: string | null): val is string {
  if (!val || typeof val !== 'string') {
    return false;
  }
  return GUID_REGEX.test(val.trim());
}

/**
 * Sanitizes an ID string into an uppercase GUID, or returns null if not a valid GUID.
 * Guaranteed to never return empty strings, undefined, or invalid non-GUID values.
 */
export function sanitizeGuid(val?: string | null): string | null {
  if (!val || typeof val !== 'string') {
    return null;
  }
  const trimmed = val.trim();
  return GUID_REGEX.test(trimmed) ? trimmed.toUpperCase() : null;
}
