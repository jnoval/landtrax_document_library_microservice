import { OCRFailureReason, OCRReasonCode } from './ocr-enums.js';

export interface OcrFailureMetadata {
  reasonCode: OCRReasonCode;
  message: string;
  canReplace: boolean;
  canRetry: boolean;
}

const permanentFailures: Record<string, OcrFailureMetadata> = {
  [OCRFailureReason.BLANK_DOCUMENT]: {
    reasonCode: OCRReasonCode.BLANK_DOCUMENT,
    message: 'This file is empty. Please upload the complete document.',
    canReplace: true,
    canRetry: false,
  },
  [OCRFailureReason.CORRUPTED_FILE]: {
    reasonCode: OCRReasonCode.CORRUPTED_FILE,
    message:
      'This file appears to be damaged. Please export or download it again and re-upload it.',
    canReplace: true,
    canRetry: false,
  },
  [OCRFailureReason.PASSWORD_PROTECTED]: {
    reasonCode: OCRReasonCode.PASSWORD_PROTECTED,
    message: 'This PDF is password-protected. Please remove the password and upload it again.',
    canReplace: true,
    canRetry: false,
  },
  [OCRFailureReason.ENCRYPTED_FILE]: {
    reasonCode: OCRReasonCode.ENCRYPTED_FILE,
    message: 'This PDF is encrypted. Please upload an unlocked copy.',
    canReplace: true,
    canRetry: false,
  },
  [OCRFailureReason.UNSUPPORTED_CONTENT]: {
    reasonCode: OCRReasonCode.UNSUPPORTED_CONTENT,
    message: 'This file type is not supported. Please upload a PDF, JPG, PNG file.',
    canReplace: true,
    canRetry: false,
  },
  [OCRFailureReason.UNREADABLE_SCAN]: {
    reasonCode: OCRReasonCode.UNREADABLE_SCAN,
    message:
      'We could not read this document clearly. Please upload a sharper scan or photo with all text visible.',
    canReplace: true,
    canRetry: false,
  },
  [OCRFailureReason.TEXT_EXTRACTION_FAILED]: {
    reasonCode: OCRReasonCode.TEXT_EXTRACTION_FAILED,
    message: 'We could not find readable text in this document. Please upload a clearer copy.',
    canReplace: true,
    canRetry: false,
  },
  [OCRFailureReason.PAGE_LIMIT_EXCEEDED]: {
    reasonCode: OCRReasonCode.PAGE_LIMIT_EXCEEDED,
    message:
      'This document exceeds the maximum limit of 3000 pages. Please split the document and upload smaller parts.',
    canReplace: true,
    canRetry: false,
  },
};

export function getOcrFailureMetadata(reason: string | null | undefined): OcrFailureMetadata {
  const aliases: Record<string, string> = {
    blank: OCRFailureReason.BLANK_DOCUMENT,
    corrupted: OCRFailureReason.CORRUPTED_FILE,
    encrypted: OCRFailureReason.ENCRYPTED_FILE,
    unreadable: OCRFailureReason.UNREADABLE_SCAN,
    page_limit: OCRFailureReason.PAGE_LIMIT_EXCEEDED,
  };
  const reasonKey = aliases[(reason || '').toLowerCase()] || reason || '';
  const normalizedReason = Object.keys(permanentFailures).find(
    (knownReason) => knownReason.toLowerCase() === reasonKey.toLowerCase(),
  );

  return (
    permanentFailures[normalizedReason || ''] || {
      reasonCode: OCRReasonCode.OCR_SERVICE_UNAVAILABLE,
      message: 'Document processing is temporarily unavailable. Please try again.',
      canReplace: false,
      canRetry: true,
    }
  );
}

export function getOcrProcessingFailureMetadata(
  _technicalReason?: string | null,
): OcrFailureMetadata {
  return getOcrFailureMetadata(undefined);
}
