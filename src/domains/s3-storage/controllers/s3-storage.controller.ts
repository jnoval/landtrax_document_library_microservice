import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { S3StorageService } from '../services/s3-storage.service.js';

@Controller('s3-storage')
export class S3StorageController {
  private readonly _logger = new Logger(S3StorageController.name);

  constructor(private readonly _s3StorageService: S3StorageService) {}

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
