import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Repository } from 'typeorm';
import SystemSettingEntity from '../../../shared/infrastructure/database/entities/system-setting.entity.js';
import { StorageService, UploadResponse } from '../types.js';

/**
 * S3 Storage Service
 * Handles all file uploads, downloads, and deletions to/from AWS S3
 */
@Injectable()
export class S3StorageService extends StorageService implements OnModuleInit {
  private static readonly serviceName = 'Storage (AWS S3)';
  private readonly _logger = new Logger(S3StorageService.name);

  private readonly AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
  private readonly AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';
  private readonly AWS_REGION = process.env.AWS_REGION || 'ap-southeast-1';
  private readonly AWS_S3_BUCKET = process.env.AWS_S3_BUCKET || '';

  private readonly SESSION_EXPIRY = Number.parseInt(
    `${process.env.JWT_REFRESH_EXPIRATION_TIME || 86400}`,
    10,
  );

  private _client: S3Client | null = null;
  private _bucketName: string = '';
  private _region: string = '';
  private _isConfigured: boolean = false;
  private _configError: string = '';

  constructor(
    private readonly _configService: ConfigService,
    @InjectRepository(SystemSettingEntity)
    private readonly _systemSettingRepository: Repository<SystemSettingEntity>,
  ) {
    super();
  }

  onModuleInit() {
    this._logger.log('S3 storage service initialized');
    this.initializeClient();
  }

  private initializeClient(): void {
    try {
      const mask = (str: string) =>
        str ? `${str.substring(0, 4)}...${str.substring(str.length - 4)}` : 'empty';

      this._logger.log(`Initializing S3 client:`);
      this._logger.log(`- Region: ${this.AWS_REGION}`);
      this._logger.log(`- Bucket: ${this.AWS_S3_BUCKET}`);
      this._logger.log(`- Access Key: ${mask(this.AWS_ACCESS_KEY_ID)}`);
      this._logger.log(`- Secret Key: ${this.AWS_SECRET_ACCESS_KEY ? 'PRESENT' : 'MISSING'}`);

      this._region = this.AWS_REGION;
      this._bucketName = this.AWS_S3_BUCKET;

      const clientConfig: any = {
        forcePathStyle: false,
        region: this.AWS_REGION,
      };

      if (this.AWS_ACCESS_KEY_ID && this.AWS_SECRET_ACCESS_KEY) {
        clientConfig.credentials = {
          accessKeyId: this.AWS_ACCESS_KEY_ID,
          secretAccessKey: this.AWS_SECRET_ACCESS_KEY,
        };
      }

      this._client = new S3Client(clientConfig);
      this._isConfigured = true;
    } catch (error) {
      this._isConfigured = false;
      this._configError =
        error instanceof Error ? error.message : 'Unknown error initializing S3 client';
      this._logger.error(`S3 Initialization failed: ${this._configError}`);
    }
  }

  private async isS3Enabled(): Promise<boolean> {
    try {
      const setting = await this._systemSettingRepository
        .createQueryBuilder('setting')
        .select(['setting.value'])
        .where('setting.Key = :key', { key: 's3_storage_enabled' })
        .andWhere('setting.DeletedDate IS NULL')
        .getOne();

      if (!setting) {
        return true;
      }

      return setting.value?.toLowerCase() === 'true';
    } catch (error) {
      this._logger.warn(
        `Failed to read s3_storage_enabled system config, defaulting to enabled: ${(error as Error).message}`,
      );
      return true;
    }
  }

  private async assertS3Enabled(): Promise<void> {
    const enabled = await this.isS3Enabled();
    if (!enabled) {
      throw new HttpException(
        'Unable to save changes. Please try again.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private throwAsS3Exception(error: unknown): void {
    const err = error as any;
    const name: string = err?.name ?? '';
    const code: string = err?.code ?? '';
    const message: string = err?.message ?? '';

    const isConnectivityFailure =
      [
        'TimeoutError',
        'NetworkingError',
        'NoCredentials',
        'CredentialsError',
        'RequestTimeout',
      ].includes(name) ||
      ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(code) ||
      message.includes('ETIMEDOUT') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ENOTFOUND') ||
      message.includes('getaddrinfo') ||
      message.includes('Connect ETIMEDOUT') ||
      message.includes('socket hang up') ||
      message.includes('Network Failure');

    if (isConnectivityFailure) {
      this._logger.error(`S3 connectivity failure: ${message}`, err?.stack);
      throw new HttpException(
        'Unable to save changes. Please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async uploadFile({
    file,
    folder,
    fileName,
  }: {
    file: Express.Multer.File;
    folder: string;
    fileName?: string;
  }): Promise<UploadResponse> {
    await this.assertS3Enabled();

    if (!this._client) {
      throw new BadRequestException('Storage service is currently not configured.');
    }

    if (!file?.buffer) {
      throw new BadRequestException('File buffer is required');
    }

    try {
      const fileExtension = path.extname(file.originalname);
      const generatedFileName =
        fileName || this.generateUniqueFilename(file.originalname, fileExtension);
      const key = `${folder}/${generatedFileName}`;

      const command = new PutObjectCommand({
        Bucket: this._bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: {
          originalName: encodeURIComponent(file.originalname || 'unknown'),
          uploadedAt: new Date().toISOString(),
        },
      });

      await this._client.send(command);
      const publicURL = this.getPublicUrl(key);

      this._logger.log(`File uploaded to S3: ${key} (${file.size} bytes)`);

      return {
        key,
        publicURL,
        fileSize: file.size,
        mimeType: file.mimetype,
      };
    } catch (error: unknown) {
      this._logger.error(
        `Failed to upload file to S3: ${(error as Error).message}`,
        (error as Error).stack,
      );
      this.throwAsS3Exception(error);

      if (
        (error as Error).name === 'PermanentRedirect' ||
        (error as Error).message?.includes('endpoint')
      ) {
        const helpfulMessage =
          `S3 bucket region mismatch. The bucket '${this._bucketName}' may be in a different region. ` +
          `Please verify the bucket region in AWS Console and update AWS_REGION in your .env file, ` +
          `or set AWS_S3_ENDPOINT if using a custom endpoint.`;
        this._logger.error(helpfulMessage);
        throw new BadRequestException(helpfulMessage);
      }

      throw new BadRequestException(`Failed to upload file to S3: ${(error as Error).message}`);
    }
  }

  async uploadStream({
    stream,
    folder = '',
    fileName,
    mimeType,
  }: {
    stream: NodeJS.ReadableStream | import('node:stream').Readable;
    folder?: string;
    fileName?: string;
    mimeType: string;
  }): Promise<{ key: string; publicURL: string }> {
    await this.assertS3Enabled();

    if (!this._client) {
      throw new BadRequestException('Storage service is currently not configured.');
    }

    try {
      const generatedFileName = fileName || this.generateUniqueFilename('stream', '.ext');
      const key = `${folder}/${generatedFileName}`;

      const upload = new Upload({
        client: this._client,
        params: {
          Bucket: this._bucketName,
          Key: key,
          Body: stream as import('node:stream').Readable,
          ContentType: mimeType,
          Metadata: {
            uploadedAt: new Date().toISOString(),
          },
        },
        partSize: 5 * 1024 * 1024,
        queueSize: 1,
      });

      await upload.done();
      const publicURL = this.getPublicUrl(key);
      this._logger.log(`Stream uploaded to S3: ${key}`);

      return { key, publicURL };
    } catch (error: unknown) {
      this._logger.error(
        `Failed to upload stream to S3: ${(error as Error).message}`,
        (error as Error).stack,
      );
      this.throwAsS3Exception(error);
      throw new BadRequestException(`Failed to upload stream to S3: ${(error as Error).message}`);
    }
  }

  async getSignedUrl(key: string, expiresIn?: number): Promise<string> {
    await this.assertS3Enabled();

    if (!this._client) {
      throw new BadRequestException('Storage service is currently not configured.');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this._bucketName,
        Key: this.extractKeyFromUrl(key),
      });

      return await getSignedUrl(this._client as any, command, {
        expiresIn: expiresIn || this.SESSION_EXPIRY,
      });
    } catch (error: unknown) {
      this.throwAsS3Exception(error);
      throw new BadRequestException(`Failed to generate signed URL: ${(error as Error).message}`);
    }
  }

  async getSignedDownloadUrl(key: string, fileName?: string, expiresIn?: number): Promise<string> {
    await this.assertS3Enabled();

    if (!this._client) {
      throw new BadRequestException('Storage service is currently not configured.');
    }

    try {
      const extractedKey = this.extractKeyFromUrl(key);
      const downloadFileName = fileName || extractedKey.split('/').pop() || 'download';

      const command = new GetObjectCommand({
        Bucket: this._bucketName,
        Key: extractedKey,
        ResponseContentDisposition: `attachment; filename="${downloadFileName}"`,
      });

      return await getSignedUrl(this._client as any, command, {
        expiresIn: expiresIn || this.SESSION_EXPIRY,
      });
    } catch (error: unknown) {
      this.throwAsS3Exception(error);
      throw new BadRequestException(
        `Failed to generate signed download URL: ${(error as Error).message}`,
      );
    }
  }

  async getFile(key: string): Promise<{
    buffer: Buffer;
    contentType: string;
    contentLength: number;
  }> {
    await this.assertS3Enabled();

    if (!this._client) {
      throw new BadRequestException('Storage service is currently not configured.');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this._bucketName,
        Key: this.extractKeyFromUrl(key),
      });

      const response = await this._client.send(command);
      const chunks: Uint8Array[] = [];

      if (!response.Body) {
        throw new BadRequestException(`File not found: ${key}`);
      }

      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);

      return {
        buffer,
        contentType: response.ContentType || 'application/octet-stream',
        contentLength: response.ContentLength || buffer.length,
      };
    } catch (error: unknown) {
      this.throwAsS3Exception(error);
      throw new BadRequestException(`Failed to get file from S3: ${(error as Error).message}`);
    }
  }

  async getFileStream(key: string): Promise<{
    stream: NodeJS.ReadableStream;
    contentType: string;
    contentLength: number;
  }> {
    await this.assertS3Enabled();

    if (!this._client) {
      throw new BadRequestException('Storage service is currently not configured.');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this._bucketName,
        Key: this.extractKeyFromUrl(key),
      });

      const response = await this._client.send(command);
      if (!response.Body) {
        throw new BadRequestException(`File not found: ${key}`);
      }

      return {
        stream: response.Body as NodeJS.ReadableStream,
        contentType: response.ContentType || 'application/octet-stream',
        contentLength: response.ContentLength || 0,
      };
    } catch (error: unknown) {
      this.throwAsS3Exception(error);
      throw new BadRequestException(`Failed to stream file from S3: ${(error as Error).message}`);
    }
  }

  getS3ObjectReference(key: string): { Bucket: string; Name: string } {
    return {
      Bucket: this._bucketName,
      Name: this.extractKeyFromUrl(key),
    };
  }

  async downloadToFile(key: string, destPath: string): Promise<void> {
    await this.assertS3Enabled();

    if (!this._client) {
      throw new BadRequestException('Storage service is currently not configured.');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this._bucketName,
        Key: this.extractKeyFromUrl(key),
      });

      const response = await this._client.send(command);
      if (!response.Body) {
        throw new BadRequestException(`File not found: ${key}`);
      }

      const writeStream = fs.createWriteStream(destPath);
      const body = response.Body as NodeJS.ReadableStream;

      return new Promise((resolve, reject) => {
        body.pipe(writeStream);
        body.on('error', reject);
        writeStream.on('error', reject);
        writeStream.on('finish', resolve);
      });
    } catch (error: unknown) {
      this.throwAsS3Exception(error);
      throw new BadRequestException(`Failed to download file from S3: ${(error as Error).message}`);
    }
  }

  async deleteFile(key: string): Promise<void> {
    await this.assertS3Enabled();

    if (!this._client) {
      throw new BadRequestException('Storage service is currently not configured.');
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: this._bucketName,
        Key: this.extractKeyFromUrl(key),
      });

      await this._client.send(command);
      this._logger.log(`File deleted from S3: ${key}`);
    } catch (error: any) {
      this.throwAsS3Exception(error);
      if (
        error.name === 'NoSuchKey' ||
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        this._logger.warn(`File not found during deletion (ignored): ${key}`);
        return;
      }
      this._logger.error(`Failed to delete file from S3: ${key} - ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  async fileExists(key: string): Promise<boolean> {
    await this.assertS3Enabled();

    if (!this._client) {
      throw new BadRequestException('Storage service is currently not configured.');
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this._bucketName,
        Key: this.extractKeyFromUrl(key),
      });

      await this._client.send(command);
      return true;
    } catch (error: any) {
      this.throwAsS3Exception(error);
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      this._logger.error(`Error checking file existence in S3: ${key} - ${error.message}`);
      return false;
    }
  }

  extractKeyFromUrl(url: string): string {
    if (!url.includes('://')) {
      return url;
    }
    try {
      const urlObj = new URL(url);
      let key = urlObj.pathname.replace(/^\//, '');
      if (key.startsWith(this._bucketName + '/')) {
        key = key.substring(this._bucketName.length + 1);
      }
      return decodeURIComponent(key);
    } catch {
      return decodeURIComponent(url);
    }
  }

  private generateUniqueFilename(originalName: string, extension: string): string {
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(8).toString('hex');
    const sanitizedName = originalName
      .replaceAll(/\s+/g, '_')
      .replaceAll(/[^a-zA-Z0-9._-]/g, '')
      .substring(0, 50);

    return `${sanitizedName}_${timestamp}_${randomBytes}${extension}`;
  }

  private getPublicUrl(key: string): string {
    return `https://${this._bucketName}.s3.${this._region}.amazonaws.com/${key}`;
  }
}
export default S3StorageService;
