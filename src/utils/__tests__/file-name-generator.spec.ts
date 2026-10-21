import { generateFileNameFromFormat } from '../file-name-generator.js';

describe('generateFileNameFromFormat', () => {
  it('should use original filename with UUID suffix when format is empty', () => {
    const result = generateFileNameFromFormat(
      null,
      {},
      'my_document.pdf',
    );
    expect(result).toMatch(/^my_document_[a-f0-9]{8}\.pdf$/);
  });

  it('should replace tokens with context values', () => {
    const format = '{applicant_name}_{requirement_name}_{date}';
    const result = generateFileNameFromFormat(
      format,
      {
        applicantName: 'john_doe',
        requirementName: 'Transfer Certificate of Title',
        date: '2026-09-04',
      },
      'raw_upload.pdf',
    );

    expect(result).toContain('john_doe');
    expect(result).toContain('transfer_certificate_of_title');
    expect(result).toContain('2026-09-04');
    expect(result.endsWith('.pdf')).toBe(true);
  });

  it('should sanitize special characters and consecutive underscores', () => {
    const format = '{service_name} / {document_name}!';
    const result = generateFileNameFromFormat(
      format,
      {
        serviceName: 'Land Title & Registration',
        documentName: 'Deed of Sale #123',
      },
      'scan.jpeg',
    );

    expect(result).not.toContain('!');
    expect(result).not.toContain('/');
    expect(result).not.toContain('&');
    expect(result.endsWith('.jpeg')).toBe(true);
  });

  it('should not contain literal "unknown" when title number or OCR variables are omitted', () => {
    const format = '{Document Name}_{Title Number}';
    const result = generateFileNameFromFormat(
      format,
      {
        documentName: 'CTC of Original Certificate of Title',
      },
      'split_doc.pdf',
    );

    expect(result).not.toContain('unknown');
    expect(result).toContain('ctc_of_original_certificate_of_title');
    expect(result.endsWith('.pdf')).toBe(true);
  });

  it('should include title number when populated', () => {
    const format = '{Document Name}_{Title Number}';
    const result = generateFileNameFromFormat(
      format,
      {
        documentName: 'CTC of Original Certificate of Title',
        titleNumber: '046-20260001',
      },
      'split_doc.pdf',
    );

    expect(result).toContain('ctc_of_original_certificate_of_title');
    expect(result).toContain('046-20260001');
    expect(result.endsWith('.pdf')).toBe(true);
  });

  it('should cap excessively long filenames to 150 characters before appending UUID and extension', () => {
    const veryLongRequirementName = 'a'.repeat(200);
    const result = generateFileNameFromFormat(
      '{document name}',
      { documentName: veryLongRequirementName },
      'test.pdf',
    );

    // 150 chars base + 1 underscore + 8 uuid + 4 extension (.pdf) = 163 chars total
    expect(result.length).toBe(163);
    expect(result.startsWith('a'.repeat(150))).toBe(true);
    expect(result.endsWith('.pdf')).toBe(true);
  });
});
