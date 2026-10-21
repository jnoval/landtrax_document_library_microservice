import {
  formatOcrFailureAuditMessage,
  formatOcrSuccessAuditMessage,
  formatOcrUnreadableAuditMessage,
} from '../audit-message.util.js';

describe('OCR audit message formatting', () => {
  it('formats a successful OCR event in plain language', () => {
    expect(
      formatOcrSuccessAuditMessage({
        transactionNumber: 'TXN-2026-00123',
        requirementName: 'Deed of Absolute Sale',
        fileName: 'deed-of-sale.pdf',
        fieldsExtracted: 5,
      }),
    ).toBe(
      'Document "deed-of-sale.pdf" was processed successfully for transaction TXN-2026-00123 with a requirement of "Deed of Absolute Sale". 5 fields were extracted.',
    );
  });

  it('formats an unreadable OCR event without technical field names or JSON', () => {
    const message = formatOcrUnreadableAuditMessage({
      transactionNumber: 'TXN-2026-00123',
      requirementName: 'Deed of Absolute Sale',
      fileName: 'deed-of-sale.pdf',
      failureReason: 'Password Protected File',
    });

    expect(message).toBe(
      'We could not read document "deed-of-sale.pdf" for transaction TXN-2026-00123 with a requirement of "Deed of Absolute Sale". This PDF is password-protected. Please remove the password and upload it again.',
    );
    expect(message).not.toContain('{');
    expect(message).not.toContain('transactionId');
  });

  it('formats an OCR processing failure with a useful reason', () => {
    expect(
      formatOcrFailureAuditMessage({
        transactionNumber: 'TXN-2026-00123',
        requirementName: 'Deed of Absolute Sale',
        fileName: 'deed-of-sale.pdf',
        failureReason: 'OCR service was unable to extract text',
      }),
    ).toBe(
      'Document "deed-of-sale.pdf" could not be processed for transaction TXN-2026-00123 with a requirement of "Deed of Absolute Sale". Reason: OCR service was unable to extract text.',
    );
  });
});
