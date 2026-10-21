import { getOcrFailureMetadata } from './ocr-failure.util.js';

interface OcrAuditContext {
  transactionNumber: string;
  requirementName: string;
  fileName: string;
}

function requirementContext(input: OcrAuditContext): string {
  return `for transaction ${input.transactionNumber} with a requirement of "${input.requirementName}"`;
}

export function formatOcrSuccessAuditMessage(
  input: OcrAuditContext & { fieldsExtracted: number },
): string {
  return (
    `Document "${input.fileName}" was processed successfully ${requirementContext(input)}. ` +
    `${input.fieldsExtracted} ${input.fieldsExtracted === 1 ? 'field was' : 'fields were'} extracted.`
  );
}

export function formatOcrUnreadableAuditMessage(
  input: OcrAuditContext & { failureReason: string },
): string {
  return (
    `We could not read document "${input.fileName}" ${requirementContext(input)}. ` +
    getOcrFailureMetadata(input.failureReason).message
  );
}

export function formatOcrFailureAuditMessage(
  input: OcrAuditContext & { failureReason: string },
): string {
  const reason = input.failureReason.replace(/[.]+$/, '');
  return (
    `Document "${input.fileName}" could not be processed ${requirementContext(input)}. ` +
    `Reason: ${reason}.`
  );
}
