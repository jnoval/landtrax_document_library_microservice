import { Controller, Get } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth(): string {
    return this.appService.getHealth();
  }

  @MessagePattern('document-lib.health')
  getHealthTcp(): string {
    return this.appService.getHealth();
  }
}
