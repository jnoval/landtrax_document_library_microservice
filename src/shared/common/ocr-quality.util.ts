export interface OcrQualityAssessment {
  isReadable: boolean;
  requiresManualReview: boolean;
  qualityScore: number;
  signals: string[];
  failureReason?: string;
}

const HARD_FAILURE_PATTERNS = [
  /simulated\s+unreadable\s+scan/i,
  /degraded\s+scan/i,
  /resolution\s+too\s+low/i,
  /obscurated\s+content/i,
  /unreadable\s+document/i,
];

const BINARY_LINE_PATTERN = /^[01\s]{4,}$/;

function normalizeLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function meaningfulWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

function gatherOcrSignals(
  hardFailure: boolean,
  binaryLineRatio: number,
  repeatedLineRatio: number,
  wordCount: number,
  confidence: number,
): string[] {
  const signals: string[] = [];

  if (hardFailure) {
    signals.push('EXPLICIT_UNREADABLE_MARKER');
  }

  if (binaryLineRatio >= 0.5) {
    signals.push('BINARY_OR_ENCODING_ARTIFACT');
  }

  if (repeatedLineRatio >= 0.5) {
    signals.push('REPEATED_OCR_CONTENT');
  }

  // Government ID cards (UMID, PhilHealth, TIN, etc.) are sparse by design.
  // Lower the threshold from 5 to 3 meaningful words to avoid penalising card-format documents.
  if (wordCount < 3) {
    signals.push('INSUFFICIENT_MEANINGFUL_TEXT');
  }

  if (confidence < 50) {
    signals.push('LOW_TEXTRACT_CONFIDENCE');
  } else if (confidence < 70) {
    signals.push('MODERATE_TEXTRACT_CONFIDENCE');
  }

  return signals;
}

export function assessOcrQuality(text: string, ocrConfidence?: number): OcrQualityAssessment {
  const normalizedText = text.trim();
  const lines = normalizeLines(normalizedText);
  const words = meaningfulWords(normalizedText);

  if (!normalizedText) {
    return {
      isReadable: false,
      requiresManualReview: true,
      qualityScore: 0,
      signals: ['EMPTY_OCR_TEXT'],
      failureReason: 'OCR returned no readable text.',
    };
  }

  const hardFailure = HARD_FAILURE_PATTERNS.some((pattern) => pattern.test(normalizedText));

  const binaryLineCount = lines.filter((line) => BINARY_LINE_PATTERN.test(line)).length;
  const binaryLineRatio = lines.length > 0 ? binaryLineCount / lines.length : 0;

  const uniqueLines = new Set(lines.map((line) => line.toLowerCase()));
  const repeatedLineRatio = lines.length > 0 ? 1 - uniqueLines.size / lines.length : 0;

  // Defensively normalise confidence: Textract returns 0–100, but callers sometimes pass 0–1.
  // Treat any value ≤ 1 as already-normalised fraction and scale it up to 0–100.
  const rawConfidence = typeof ocrConfidence === 'number' ? ocrConfidence : 100;
  const confidence = rawConfidence <= 1 && rawConfidence >= 0 ? rawConfidence * 100 : rawConfidence;

  const signals = gatherOcrSignals(
    hardFailure,
    binaryLineRatio,
    repeatedLineRatio,
    words.length,
    confidence,
  );

  const qualityScore = Math.max(
    0,
    Math.min(
      1,
      (confidence / 100) *
        (hardFailure || binaryLineRatio >= 0.5 ? 0 : 1) *
        (repeatedLineRatio >= 0.5 ? 0.5 : 1) *
        (words.length < 3 ? 0.5 : 1),
    ),
  );

  if (hardFailure || binaryLineRatio >= 0.5 || confidence < 50) {
    return {
      isReadable: false,
      requiresManualReview: true,
      qualityScore,
      signals,
      failureReason: hardFailure
        ? 'OCR text contains explicit unreadable-scan markers.'
        : 'OCR output failed document readability checks.',
    };
  }

  return {
    isReadable: true,
    requiresManualReview: confidence < 70 || repeatedLineRatio >= 0.5 || words.length < 3,
    qualityScore,
    signals,
    failureReason:
      confidence < 70 || repeatedLineRatio >= 0.5 || words.length < 3
        ? 'OCR quality is insufficient for unattended classification.'
        : undefined,
  };
}
