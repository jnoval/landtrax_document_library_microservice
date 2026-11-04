import { Controller, Get } from '@nestjs/common';
import { MessagePattern, Transport } from '@nestjs/microservices';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get(['health', 'api/health'])
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Microservice health status' })
  getHealth() {
    return this.appService.getHealth();
  }

  @Get(['version', 'api/version'])
  @ApiOperation({ summary: 'Version endpoint' })
  @ApiResponse({ status: 200, description: 'Microservice version information' })
  getVersion() {
    return this.appService.getVersion();
  }

  @MessagePattern('document-lib.health')
  getHealthTcp() {
    return this.appService.getHealth();
  }

  @MessagePattern('document-lib.version', Transport.TCP)
  getVersionTcp() {
    return this.appService.getVersion();
  }
}
