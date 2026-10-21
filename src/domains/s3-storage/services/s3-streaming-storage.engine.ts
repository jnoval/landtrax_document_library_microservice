import { randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';
import { Transform } from 'node:stream';
import type { Request } from 'express';
import type { StorageEngine } from 'multer';
import { S3StorageService } from './s3-storage.service.js';

/** Metadata attached to Multer files after a direct-to-S3 streaming upload. */
export interface S3UploadedMulterFile extends Omit<Express.Multer.File, 'buffer'> {
  key: string;
  publicURL: string;
  buffer?: never;
}

/**
 * Multer storage engine that streams multipart bytes to S3. It deliberately
 * never collects chunks in memory, unlike Multer's default memory storage.
 */
export class S3StreamingStorageEngine implements StorageEngine {
  constructor(
    private readonly _storageService: S3StorageService,
    private readonly _folderForRequest: (request: Request) => string,
  ) {}

  _handleFile(
    request: Request,
    file: Express.Multer.File,
    callback: (error?: Error | null, info?: Partial<Express.Multer.File>) => void,
  ): void {
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        size += chunk.length;
        done(null, chunk);
      },
    });
    let size = 0;
    const folder = this._folderForRequest(request);
    const fileName = buildSafeFileName(file.originalname);

    file.stream.once('error', (error) => meter.destroy(error));
    file.stream.pipe(meter);

    this._storageService
      .uploadStream({ stream: meter, folder, fileName, mimeType: file.mimetype })
      .then(({ key, publicURL }) =>
        callback(null, {
          key,
          publicURL,
          size,
          filename: fileName,
        } as unknown as Partial<Express.Multer.File>),
      )
      .catch((error: unknown) =>
        callback(error instanceof Error ? error : new Error(String(error))),
      );
  }

  _removeFile(
    _request: Request,
    file: Express.Multer.File,
    callback: (error: Error | null) => void,
  ): void {
    const uploadedFile = file as unknown as S3UploadedMulterFile;
    if (!uploadedFile.key) {
      callback(null);
      return;
    }
    this._storageService
      .deleteFile(uploadedFile.key)
      .then(() => callback(null))
      .catch(callback);
  }
}

function buildSafeFileName(originalName: string): string {
  const extension = extname(originalName).toLowerCase();
  const stem =
    basename(originalName, extension)
      .replaceAll(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 50) || 'upload';
  return `${stem}_${randomUUID()}${extension}`;
}
