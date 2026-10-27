import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Logger,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { Request } from 'express';
import { S3StorageService } from '../services/s3-storage.service.js';

@Controller(['s3-storage', 'internal/s3-storage', 'api/internal/s3-storage'])
export class S3StorageController {
  private readonly _logger = new Logger(S3StorageController.name);

  constructor(private readonly _s3StorageService: S3StorageService) {}

  private assertInternalSecret(req: Request): void {
    const gatewaySecret = req?.headers?.['x-gateway-secret'];
    const expectedSecret = process.env.GATEWAY_SECRET;
    if (!expectedSecret || !gatewaySecret || gatewaySecret !== expectedSecret) {
      this._logger.warn('Rejected internal S3 storage HTTP request — invalid or missing x-gateway-secret');
      throw new UnauthorizedException('Invalid or missing x-gateway-secret');
    }
  }

  @Post('upload-stream')
  async uploadStreamHttp(
    @Req() req: Request,
    @Query('folder') folder: string,
    @Query('fileName') fileName?: string,
    @Query('mimeType') mimeType?: string,
  ) {
    this.assertInternalSecret(req);

    if (!folder) {
      throw new BadRequestException('folder query parameter is required');
    }

    const resolvedMimeType =
      mimeType ||
      (typeof req.headers['content-type'] === 'string'
        ? req.headers['content-type']
        : 'application/octet-stream');

    const { key, publicURL } = await this._s3StorageService.uploadStream({
      stream: req,
      folder,
      fileName: fileName || undefined,
      mimeType: resolvedMimeType,
    });

    return {
      key,
      publicURL,
      mimeType: resolvedMimeType,
    };
  }

  @Delete('file')
  async deleteFileHttp(@Req() req: Request, @Query('key') key: string) {
    this.assertInternalSecret(req);
    if (!key) {
      throw new BadRequestException('key query parameter is required');
    }
    await this._s3StorageService.deleteFile(key);
    return { success: true, key };
  }

  @Post('signed-url')
  async getSignedUrlHttp(
    @Req() req: Request,
    @Body() payload: { key: string; expiresIn?: number },
  ) {
    this.assertInternalSecret(req);
    const url = await this._s3StorageService.getSignedUrl(payload.key, payload.expiresIn);
    return { url };
  }

  @Post('signed-download-url')
  async getSignedDownloadUrlHttp(
    @Req() req: Request,
    @Body() payload: { key: string; fileName?: string; expiresIn?: number },
  ) {
    this.assertInternalSecret(req);
    const url = await this._s3StorageService.getSignedDownloadUrl(
      payload.key,
      payload.fileName,
      payload.expiresIn,
    );
    return { url };
  }

  @MessagePattern('s3-storage.is-online')
  isOnline() {
    return { status: 'OK', service: 'S3 Storage Provider', timestamp: new Date() };
  }

  @MessagePattern('s3-storage.get-signed-url')
  async getSignedUrl(@Payload() payload: { key: string; expiresIn?: number }) {
    this._logger.debug(`TCP getSignedUrl for key=${payload.key}`);
    const url = await this._s3StorageService.getSignedUrl(payload.key, payload.expiresIn);
    return { url };
  }

  @MessagePattern('s3-storage.get-signed-download-url')
  async getSignedDownloadUrl(
    @Payload() payload: { key: string; fileName?: string; expiresIn?: number },
  ) {
    this._logger.debug(`TCP getSignedDownloadUrl for key=${payload.key}`);
    const url = await this._s3StorageService.getSignedDownloadUrl(
      payload.key,
      payload.fileName,
      payload.expiresIn,
    );
    return { url };
  }

  @MessagePattern('s3-storage.file-exists')
  async fileExists(@Payload() payload: { key: string }) {
    this._logger.debug(`TCP fileExists for key=${payload.key}`);
    const exists = await this._s3StorageService.fileExists(payload.key);
    return { exists };
  }

  @MessagePattern('s3-storage.delete-file')
  async deleteFile(@Payload() payload: { key: string }) {
    this._logger.debug(`TCP deleteFile for key=${payload.key}`);
    await this._s3StorageService.deleteFile(payload.key);
    return { success: true, key: payload.key };
  }
}
