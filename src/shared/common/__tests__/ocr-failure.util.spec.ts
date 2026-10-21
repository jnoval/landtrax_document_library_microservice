import {
  getOcrFailureMetadata,
  getOcrProcessingFailureMetadata,
} from '../ocr-failure.util.js';
import { OCRFailureReason, OCRReasonCode } from '../ocr-enums.js';

describe('OCR failure metadata', () => {
  it.each([
    [OCRFailureReason.BLANK_DOCUMENT, OCRReasonCode.BLANK_DOCUMENT, true, false],
    [OCRFailureReason.CORRUPTED_FILE, OCRReasonCode.CORRUPTED_FILE, true, false],
    [OCRFailureReason.PASSWORD_PROTECTED, OCRReasonCode.PASSWORD_PROTECTED, true, false],
    [OCRFailureReason.ENCRYPTED_FILE, OCRReasonCode.ENCRYPTED_FILE, true, false],
    [OCRFailureReason.UNSUPPORTED_CONTENT, OCRReasonCode.UNSUPPORTED_CONTENT, true, false],
    [OCRFailureReason.UNREADABLE_SCAN, OCRReasonCode.UNREADABLE_SCAN, true, false],
    [OCRFailureReason.TEXT_EXTRACTION_FAILED, OCRReasonCode.TEXT_EXTRACTION_FAILED, true, false],
  ])('maps %s to a user-facing recovery state', (reason, code, canReplace, canRetry) => {
    const metadata = getOcrFailureMetadata(reason);

    expect(metadata.reasonCode).toBe(code);
    expect(metadata.canReplace).toBe(canReplace);
    expect(metadata.canRetry).toBe(canRetry);
    expect(metadata.message).not.toContain('OCRFailureReason');
  });

  it('marks exhausted infrastructure failures as retryable processing failures', () => {
    const metadata = getOcrProcessingFailureMetadata('Textract service unavailable');

    expect(metadata.reasonCode).toBe(OCRReasonCode.OCR_SERVICE_UNAVAILABLE);
    expect(metadata.canReplace).toBe(false);
    expect(metadata.canRetry).toBe(true);
    expect(metadata.message).toBe(
      'Document processing is temporarily unavailable. Please try again.',
    );
  });
});
