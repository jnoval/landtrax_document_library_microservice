import { isValidGuid, sanitizeGuid } from '../guid.util.js';

describe('guid.util', () => {
  describe('isValidGuid', () => {
    it('should return true for valid lowercase UUID', () => {
      expect(isValidGuid('b1c6423e-f36b-1410-8d44-00e1d81f6239')).toBe(true);
    });

    it('should return true for valid uppercase UUID', () => {
      expect(isValidGuid('E8C6423E-F36B-1410-8D44-00E1D81F6239')).toBe(true);
    });

    it('should return true for UUID with whitespace padding', () => {
      expect(isValidGuid('  E8C6423E-F36B-1410-8D44-00E1D81F6239  ')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isValidGuid('')).toBe(false);
      expect(isValidGuid('   ')).toBe(false);
    });

    it('should return false for null and undefined', () => {
      expect(isValidGuid(null)).toBe(false);
      expect(isValidGuid(undefined)).toBe(false);
    });

    it('should return false for non-UUID strings', () => {
      expect(isValidGuid('req-1')).toBe(false);
      expect(isValidGuid('Unclassified')).toBe(false);
      expect(isValidGuid('12345')).toBe(false);
      expect(isValidGuid('not-a-guid-at-all')).toBe(false);
    });
  });

  describe('sanitizeGuid', () => {
    it('should return uppercase GUID for valid input', () => {
      expect(sanitizeGuid('b1c6423e-f36b-1410-8d44-00e1d81f6239')).toBe(
        'B1C6423E-F36B-1410-8D44-00E1D81F6239',
      );
    });

    it('should return null for empty string or whitespace', () => {
      expect(sanitizeGuid('')).toBeNull();
      expect(sanitizeGuid('   ')).toBeNull();
    });

    it('should return null for null, undefined, or invalid strings', () => {
      expect(sanitizeGuid(null)).toBeNull();
      expect(sanitizeGuid(undefined)).toBeNull();
      expect(sanitizeGuid('req-title')).toBeNull();
      expect(sanitizeGuid('invalid')).toBeNull();
    });
  });
});
