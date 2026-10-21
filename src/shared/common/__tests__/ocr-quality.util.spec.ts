import { assessOcrQuality } from '../ocr-quality.util.js';

describe('assessOcrQuality', () => {
  it('rejects the unreadable scan fixture even when OCR confidence is high', () => {
    const result = assessOcrQuality(
      `[NEGATIVE TEST FILE - SIMULATED UNREADABLE SCAN]\n01101001\n01110010\n00100000\n01110100\n01101000\n01101001\n01110011`,
      89.78,
    );

    expect(result.isReadable).toBe(false);
    expect(result.requiresManualReview).toBe(true);
    expect(result.qualityScore).toBe(0);
    expect(result.signals).toEqual(
      expect.arrayContaining(['EXPLICIT_UNREADABLE_MARKER', 'BINARY_OR_ENCODING_ARTIFACT']),
    );
  });

  it('requires review for low OCR confidence', () => {
    const result = assessOcrQuality('Latest Real Property Tax Receipt 2025', 42);

    expect(result.isReadable).toBe(false);
    expect(result.signals).toContain('LOW_TEXTRACT_CONFIDENCE');
  });

  it('accepts readable text with strong OCR confidence', () => {
    const result = assessOcrQuality(
      'Latest Real Property Tax Receipt\nCity Treasurer\nTax declaration number 12345',
      96,
    );

    expect(result.isReadable).toBe(true);
    expect(result.requiresManualReview).toBe(false);
    expect(result.qualityScore).toBe(0.96);
  });
});
