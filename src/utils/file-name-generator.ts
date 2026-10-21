import { randomUUID } from 'node:crypto';

export interface FileNameContext {
  applicantName?: string;
  applicantId?: string;
  documentType?: string;
  requirementCode?: string;
  requirementName?: string;
  serviceName?: string;
  transactionNumber?: string;
  date?: string;
  timestamp?: string;
  originalFileName?: string;

  documentName?: string;
  documentIdentifier?: string;
  titleNumber?: string;
  aprn?: string;
  tin?: string;
  notarizationDate?: string;
  ownerName?: string;
  orNumber?: string;
  idName?: string;
  idNumber?: string;
  requestorName?: string;
  buyerName?: string;
  name?: string;
}

export const ALLOWED_FILENAME_VARIABLES = [
  'applicant name',
  'applicant id',
  'document type',
  'requirement code',
  'requirement name',
  'service name',
  'transaction number',
  'date',
  'timestamp',
  'original name',
  'document name',
  'document identifier',
  'title number',
  'title no',
  'aprn',
  'tin',
  'notarization date',
  "owner's name",
  'or number',
  'id name',
  'id number',
  "requestor's name",
  "buyer's name",
  'name',
];

function buildReplacements(
  context: FileNameContext,
  originalNameWithoutExt: string,
): Record<string, string> {
  const now = new Date();
  const values: Record<string, string> = {
    'applicant name': context.applicantName || 'applicant name',
    'applicant id': context.applicantId || 'applicant id',
    'document type': context.documentType || 'document',
    'requirement code': context.requirementCode || 'REQ',
    'requirement name': context.requirementName || 'requirement',
    'service name': context.serviceName || 'service',
    'transaction number': context.transactionNumber || 'TXN',
    date: context.date || now.toISOString().split('T')[0], // YYYY-MM-DD
    timestamp: context.timestamp || now.getTime().toString(),
    'original name': context.originalFileName || originalNameWithoutExt,
    'document name': context.documentName || 'document name',
    'document identifier': context.documentIdentifier || 'identifier',
    'title number': context.titleNumber || '',
    'title no': context.titleNumber || '',
    aprn: context.aprn || '',
    tin: context.tin || '',
    'notarization date': context.notarizationDate || '',
    "owner's name": context.ownerName || '',
    'or number': context.orNumber || '',
    'id name': context.idName || '',
    'id number': context.idNumber || '',
    "requestor's name": context.requestorName || '',
    "buyer's name": context.buyerName || '',
    name: context.name || '',
  };

  const replacements: Record<string, string> = {};
  for (const variable of ALLOWED_FILENAME_VARIABLES) {
    const key = normalizeVariable(variable);
    if (key in values) replacements[key] = values[key];
  }
  return replacements;
}

/**
 * Generates a standardized filename based on a template format and context data.
 */
export function generateFileNameFromFormat(
  format: string | null | undefined,
  context: FileNameContext,
  originalFileName: string,
): string {
  const extension = getFileExtension(originalFileName);
  const originalNameWithoutExt = getFileNameWithoutExtension(originalFileName);

  if (!format || format.trim() === '') {
    return `${sanitizeFileName(originalNameWithoutExt)}_${randomUUID().slice(0, 8)}.${extension}`;
  }

  let fileName = format;
  const replacements = buildReplacements(context, originalNameWithoutExt);

  fileName = fileName.replace(/\{([^{}]+)\}/g, (match, token: string) => {
    const normalized = normalizeVariable(token);
    return replacements[normalized] ?? match;
  });

  fileName = sanitizeFileName(fileName);
  if (!fileName || fileName.trim() === '') {
    fileName = sanitizeFileName(
      context.documentName || context.requirementName || originalNameWithoutExt,
    );
  }

  // Defensively cap the filename segment to 150 characters
  if (fileName.length > 150) {
    fileName = trimUnderscores(fileName.slice(0, 150));
  }

  const uniqueSuffix = randomUUID().slice(0, 8);
  fileName = `${fileName}_${uniqueSuffix}`;

  if (!fileName.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) {
    fileName = `${fileName}.${extension}`;
  }

  return fileName;
}

function trimUnderscores(str: string): string {
  let start = 0;
  let end = str.length;

  while (start < end && str[start] === '_') {
    start++;
  }

  while (end > start && str[end - 1] === '_') {
    end--;
  }

  return str.slice(start, end);
}

function sanitizeFileName(fileName: string): string {
  const cleaned = fileName
    .toLowerCase()
    .replaceAll(/\s+/g, '_')
    .replaceAll(/[^a-z0-9_.-]/g, '')
    .replaceAll(/_+/g, '_');

  return trimUnderscores(cleaned);
}

function normalizeVariable(token: string): string {
  return token
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();
}

function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop() || 'bin' : 'bin';
}

function getFileNameWithoutExtension(fileName: string): string {
  const parts = fileName.split('.');
  if (parts.length > 1) {
    parts.pop();
  }
  return parts.join('.');
}
