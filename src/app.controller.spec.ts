import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('DocumentLib AppController', () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = module.get<AppController>(AppController);
    appService = module.get<AppService>(AppService);
  });

  it('should return health status immediately without blocking', () => {
    const health = appController.getHealth();
    expect(health).toHaveProperty('status', 'ok');
    expect(health).toHaveProperty('service', 'document-lib-microservice');
    expect(health).toHaveProperty('app', 'Document Library Microservice');
    expect(health).toHaveProperty('version');
    expect(health).toHaveProperty('commitSha');
  });

  it('should return version information', () => {
    const version = appController.getVersion();
    expect(version).toHaveProperty('service', 'document-lib-microservice');
    expect(version).toHaveProperty('app', 'Document Library Microservice');
    expect(version).toHaveProperty('version');
    expect(version).toHaveProperty('commitSha');
  });

  it('handles database degradation asynchronously', async () => {
    const mockDataSource = {
      isInitialized: true,
      query: jest.fn().mockRejectedValue(new Error('Connection timeout')),
    } as unknown as DataSource;

    const serviceWithDb = new AppService(mockDataSource);
    await serviceWithDb.checkDatabaseAsync();

    const health = serviceWithDb.getHealth();
    expect(health.status).toBe('degraded');
    expect(health.checks?.database).toBe('down');
  });
});
