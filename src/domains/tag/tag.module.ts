import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import DocumentTagEntity from '../../shared/infrastructure/database/entities/document-tag.entity.js';
import TagEntity from '../../shared/infrastructure/database/entities/tag.entity.js';
import { TagController } from './controllers/tag.controller.js';
import { TagServiceImpl } from './services/tag.service.js';
import { TagService } from './types.js';

@Module({
  imports: [TypeOrmModule.forFeature([TagEntity, DocumentTagEntity])],
  controllers: [TagController],
  providers: [
    {
      provide: TagService,
      useClass: TagServiceImpl,
    },
  ],
  exports: [TagService, TypeOrmModule],
})
export class TagModule {}
