import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('DocumentLib AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = module.get<AppController>(AppController);
  });

  it('should return health status', async () => {
    const health = await appController.getHealth();
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
});
