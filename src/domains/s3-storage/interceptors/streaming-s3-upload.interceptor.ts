import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import multer from 'multer';
import { from, mergeMap, Observable } from 'rxjs';
import { S3StorageService } from '../services/s3-storage.service.js';
import { S3StreamingStorageEngine } from '../services/s3-streaming-storage.engine.js';

const MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024; // 250MB
const MAX_OCR_FILES = 20;
const OCR_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']);

abstract class StreamingS3UploadInterceptor implements NestInterceptor {
  protected abstract readonly _fieldMode: 'any' | 'single';
  protected abstract readonly _folderPrefix: string;
  protected abstract readonly _maxFiles: number;
  protected abstract readonly _validateMimeType: boolean;

  constructor(
    protected readonly _storageService: S3StorageService,
    protected readonly _maxFileSizeBytes: number = MAX_FILE_SIZE_BYTES,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const storage = new S3StreamingStorageEngine(
      this._storageService,
      (req) =>
        `${this._folderPrefix}/${sanitizePathSegment(String(req.params.transactionServiceId || 'general'))}`,
    );
    const handler = multer({
      storage,
      limits: { fileSize: this._maxFileSizeBytes, files: this._maxFiles },
      fileFilter: (_req, file, callback) => {
        if (this._validateMimeType && !OCR_MIME_TYPES.has(file.mimetype)) {
          callback(
            new BadRequestException('Only PDF, JPG, and PNG files are allowed for OCR processing.'),
          );
          return;
        }
        callback(null, true);
      },
    });
    const middleware = this._fieldMode === 'single' ? handler.single('file') : handler.any();

    return from(
      new Promise<void>((resolve, reject) => {
        middleware(request, response, (error: unknown) => {
          if (!error) return resolve();
          if (error instanceof multer.MulterError) {
            return reject(new BadRequestException(formatMulterError(error)));
          }
          return reject(
            error instanceof Error ? error : new Error(String((error as Error)?.message)),
          );
        });
      }),
    ).pipe(mergeMap(() => next.handle()));
  }
}

/** Streaming ingress for the bounded composite OCR endpoint. */
@Injectable()
export class StreamingS3OcrFilesInterceptor extends StreamingS3UploadInterceptor {
  protected readonly _fieldMode = 'any' as const;
  protected readonly _folderPrefix = 'incoming/ocr';
  protected readonly _maxFiles = MAX_OCR_FILES;
  protected readonly _validateMimeType = true;

  constructor(protected readonly storageService: S3StorageService) {
    super(storageService);
  }
}

/** Streaming ingress for the generic single-document upload endpoint. */
@Injectable()
export class StreamingS3DocumentFileInterceptor extends StreamingS3UploadInterceptor {
  protected readonly _fieldMode = 'single' as const;
  protected readonly _folderPrefix = 'incoming/documents';
  protected readonly _maxFiles = 1;
  protected readonly _validateMimeType = false;

  constructor(protected readonly storageService: S3StorageService) {
    super(storageService);
  }
}

function sanitizePathSegment(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100) || 'general';
}

function formatMulterError(error: multer.MulterError): string {
  if (error.code === 'LIMIT_FILE_SIZE') return 'Each uploaded file must not exceed 250MB.';
  if (error.code === 'LIMIT_FILE_COUNT') return 'A bulk upload request may contain at most 20 files.';
  return 'Invalid multipart upload.';
}
