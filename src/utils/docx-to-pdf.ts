import * as libre from 'libreoffice-convert';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import * as url from 'node:url';
import * as tmp from 'tmp';

const convert = promisify(libre.convert);

/**
 * Converts a DOCX buffer to a PDF buffer using LibreOffice
 * @param buffer The DOCX file buffer
 * @returns A promise that resolves to the PDF buffer
 */
export async function convertDocxToPdfBuffer(buffer: Buffer): Promise<Buffer> {
  try {
    // .pdf is the output format, undefined is for filter
    const pdfBuffer = await convert(buffer, '.pdf', undefined);
    return pdfBuffer;
  } catch (error: unknown) {
    throw new Error(`Failed to convert DOCX to PDF: ${(error as Error).message}`);
  }
}

/**
 * Finds the soffice binary path
 */
async function getSofficeBinary(): Promise<string> {
  let paths: string[] = [];
  switch (process.platform) {
    case 'darwin':
      paths = ['/Applications/LibreOffice.app/Contents/MacOS/soffice'];
      break;
    case 'linux':
      paths = [
        '/usr/bin/libreoffice',
        '/usr/bin/soffice',
        '/snap/bin/libreoffice',
        '/opt/libreoffice/program/soffice',
        '/opt/libreoffice7.6/program/soffice',
      ];
      break;
    case 'win32':
      paths = [
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'LIBREO~1/program/soffice.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'LibreOffice/program/soffice.exe'),
        path.join(process.env.PROGRAMFILES_X86 || '', 'LibreOffice/program/soffice.exe'),
        path.join(process.env.PROGRAMFILES || '', 'LibreOffice/program/soffice.exe'),
        process.env.LIBRE_OFFICE_EXE || '',
        'C:/Program Files/LibreOffice/program/soffice.exe',
      ];
      break;
    default:
      throw new Error(`Operating system not yet supported: ${process.platform}`);
  }

  for (const p of paths) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }
  throw new Error('Could not find soffice binary');
}

/**
 * Converts a DOCX file on disk to a PDF file on disk directly.
 * @param inputPath Absolute path to the source DOCX file
 * @param outputDir Absolute path to the directory where the PDF should be generated
 */
export async function convertDocxToPdfFile(inputPath: string, outputDir: string): Promise<void> {
  const soffice = await getSofficeBinary();
  const installDir = tmp.dirSync({ prefix: 'soffice', unsafeCleanup: true });

  return new Promise((resolve, reject) => {
    const args = [
      `-env:UserInstallation=${url.pathToFileURL(installDir.name)}`,
      '--headless',
      '--convert-to',
      'pdf',
      '--outdir',
      outputDir,
      inputPath,
    ];

    execFile(soffice, args, (error, stdout, stderr) => {
      try {
        installDir.removeCallback();
      } catch (e) {
        // Ignore cleanup errors
      }

      if (error) {
        return reject(new Error(`Failed to convert file: ${error.message}\nStderr: ${stderr}`));
      }
      if (stderr && stderr.toLowerCase().includes('error')) {
        return reject(new Error('Error calling soffice: ' + stderr));
      }
      resolve();
    });
  });
}
