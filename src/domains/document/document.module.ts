import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import DocumentTagEntity from '../../shared/infrastructure/database/entities/document-tag.entity.js';
import DocumentEntity from '../../shared/infrastructure/database/entities/document.entity.js';
import RecipientDocumentsEntity from '../../shared/infrastructure/database/entities/recipient-documents.entity.js';
import RecipientEntity from '../../shared/infrastructure/database/entities/recipient.entity.js';
import RequirementEntity from '../../shared/infrastructure/database/entities/requirement.entity.js';
import TagEntity from '../../shared/infrastructure/database/entities/tag.entity.js';
import TransactionServiceEntity from '../../shared/infrastructure/database/entities/transaction-service.entity.js';
import TransactionEntity from '../../shared/infrastructure/database/entities/transaction.entity.js';
import UserCompanyEntity from '../../shared/infrastructure/database/entities/user-company.entity.js';
import UserEntity from '../../shared/infrastructure/database/entities/user.entity.js';
import { DocumentControllerV2 } from './controllers/document-v2.controller.js';
import { DocumentController } from './controllers/document.controller.js';
import { CompanyScopeHelper } from './services/company-scope.helper.js';
import { DocumentServiceImplV2 } from './services/document-v2.service.js';
import { DocumentServiceImpl } from './services/document.service.js';
import { DocumentService, DocumentServiceV2 } from './types.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DocumentEntity,
      DocumentTagEntity,
      TagEntity,
      TransactionEntity,
      TransactionServiceEntity,
      RequirementEntity,
      UserEntity,
      UserCompanyEntity,
      RecipientEntity,
      RecipientDocumentsEntity,
    ]),
  ],
  controllers: [DocumentController, DocumentControllerV2],
  providers: [
    CompanyScopeHelper,
    {
      provide: DocumentService,
      useClass: DocumentServiceImpl,
    },
    {
      provide: DocumentServiceV2,
      useClass: DocumentServiceImplV2,
    },
  ],
  exports: [DocumentService, DocumentServiceV2, CompanyScopeHelper, TypeOrmModule],
})
export class DocumentModule {}
