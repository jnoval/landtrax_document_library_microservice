export interface UploadResponse {
  key: string;
  publicURL: string;
  fileSize: number;
  mimeType: string;
}

/**
 * Abstract base class for all storage providers.
 * Provides a common interface for storage operations across different storage services.
 */
export abstract class StorageService {
  isRequired(): boolean {
    return true;
  }
  abstract getSignedDownloadUrl(
    key: string,
    fileName?: string,
    expiresIn?: number,
  ): Promise<string>;
  abstract uploadFile(params: {
    file: Express.Multer.File;
    folder: string;
    fileName?: string;
  }): Promise<UploadResponse>;
  abstract uploadStream(payload: {
    stream: NodeJS.ReadableStream | import('node:stream').Readable;
    folder?: string;
    fileName?: string;
    mimeType: string;
  }): Promise<{ key: string; publicURL: string }>;
  abstract getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  abstract deleteFile(key: string): Promise<void>;
  abstract fileExists(key: string): Promise<boolean>;
  abstract extractKeyFromUrl(url: string): string;
  abstract getFile(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string; contentLength: number }>;
  abstract getFileStream(
    key: string,
  ): Promise<{ stream: NodeJS.ReadableStream; contentType: string; contentLength: number }>;
}
