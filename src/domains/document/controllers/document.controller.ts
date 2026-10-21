import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { IsNull, Repository } from 'typeorm';
import { randomUUID as uuidv4 } from 'node:crypto';
import { DocumentCategory } from '../../../shared/common/app-enums.js';
import { CustomMeta } from '../../../shared/common/meta.js';
import { AuditDescription } from '../../../shared/decorators/audit-description.decorator.js';
import { Audit } from '../../../shared/decorators/audit.decorator.js';
import { GatewayUserGuard } from '../../../shared/guards/gateway-user.guard.js';
import DocumentEntity from '../../../shared/infrastructure/database/entities/document.entity.js';
import TransactionServiceEntity from '../../../shared/infrastructure/database/entities/transaction-service.entity.js';
import TransactionEntity from '../../../shared/infrastructure/database/entities/transaction.entity.js';
import { ReqContext, RequestContextDto } from '../../../utils/req-context.decorator.js';
import { StreamingS3DocumentFileInterceptor } from '../../s3-storage/interceptors/streaming-s3-upload.interceptor.js';
import { S3StorageService } from '../../s3-storage/services/s3-storage.service.js';
import { UploadResponse } from '../../s3-storage/types.js';
import { CreateDocumentDto } from '../dtos/create-document.dto.js';
import { UpdateDocumentDto } from '../dtos/update-document.dto.js';
import { UploadDocumentDto } from '../dtos/upload-document.dto.js';
import * as types from '../types.js';

@ApiTags('Document')
@ApiBearerAuth('JWT')
@UseGuards(GatewayUserGuard)
@Audit('Document Records')
@Controller(['api/document', 'api/documents', 'document', 'documents'])
export class DocumentController {
  private readonly _logger = new Logger(DocumentController.name);

  constructor(
    private readonly _documentService: types.DocumentService,
    private readonly _s3StorageService: S3StorageService,
    @InjectRepository(TransactionEntity)
    private readonly _transactionRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionServiceEntity)
    private readonly _transactionServiceRepo: Repository<TransactionServiceEntity>,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new document' })
  @ApiResponse({
    status: 201,
    description: 'Document created successfully',
    type: DocumentEntity,
  })
  async create(@Body() createDocumentDto: CreateDocumentDto): Promise<DocumentEntity> {
    return await this._documentService.create(createDocumentDto);
  }

  @Post('upload')
  @UseInterceptors(StreamingS3DocumentFileInterceptor)
  @ApiOperation({ summary: 'Upload a document file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Document file to upload',
        },
        transactionId: {
          type: 'string',
          format: 'uuid',
          description: 'Transaction ID (UUID)',
          example: '123e4567-e89b-12d3-a456-426614174000',
        },
        transactionServiceId: {
          type: 'string',
          format: 'uuid',
          description: 'Transaction Service ID (UUID)',
          example: '123e4567-e89b-12d3-a456-426614174000',
        },
        requirementId: {
          type: 'string',
          format: 'uuid',
          description: 'Requirement ID (UUID)',
          example: '123e4567-e89b-12d3-a456-426614174000',
        },
        itemIndex: {
          type: 'number',
          description: 'Item index for multi-file requirements',
          example: 0,
        },
        category: {
          type: 'string',
          description: 'Document category',
          example: 'Contract',
        },
        notes: {
          type: 'string',
          description: 'Additional notes',
          example: 'This is a confidential document',
        },
      },
      required: ['file'],
    },
  })
  @AuditDescription("Received and registered a new document file: '{originalFileName}'")
  @ApiResponse({
    status: 201,
    description: 'Document uploaded and created successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        document: { $ref: '#/components/schemas/DocumentEntity' },
        uploadResult: {
          type: 'object',
          properties: {
            key: { type: 'string', example: 'documents/file_1234567890_abcdef.pdf' },
            publicURL: {
              type: 'string',
              example:
                'https://bucket.s3.region.amazonaws.com/documents/file_1234567890_abcdef.pdf',
            },
            fileSize: { type: 'number', example: 1024000 },
            mimeType: { type: 'string', example: 'application/pdf' },
          },
        },
      },
    },
  })
  async uploadDocument(
    @ReqContext() _req: RequestContextDto,
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadDocumentDto: UploadDocumentDto,
  ): Promise<{
    success: boolean;
    document: DocumentEntity;
    uploadResult: UploadResponse;
  }> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    // Auto-determine category based on document context
    let documentCategory = uploadDocumentDto.category;

    if (!documentCategory) {
      // Auto-detect category based on foreign keys
      if (uploadDocumentDto.requirementId) {
        // Has requirement ID = requirement document
        documentCategory = DocumentCategory.REQUIREMENT;
      } else if (uploadDocumentDto.transactionServiceId) {
        // Has service ID but no requirement = default to supporting document
        // Frontend should explicitly set 'output_document' if needed
        documentCategory = DocumentCategory.SUPPORTING_DOCUMENT;
      } else if (uploadDocumentDto.transactionId) {
        // Has only transaction ID = default to EOS
        // Frontend should explicitly set 'receipt' if needed
        documentCategory = DocumentCategory.EOS;
      } else {
        // Fallback to OTHER
        documentCategory = DocumentCategory.OTHER;
      }

      console.log('📋 Auto-detected category:', documentCategory);
    }

    // Construct folder path with category: [userid]/[transactionId]/[transactionServiceId]/[category]/[requirementId]/[originalFileName]
    const folder = `${_req.userId}/${uploadDocumentDto.transactionId || 'no-transaction'}/${uploadDocumentDto.transactionServiceId || 'no-service'}/${documentCategory}/${uploadDocumentDto.requirementId || 'no-requirement'}/${uploadDocumentDto.originalFileName || 'unnamed-file'}`;

    const streamedFile = file as Express.Multer.File & { key?: string; publicURL?: string };
    if (!streamedFile.key || !streamedFile.publicURL) {
      throw new BadRequestException('Document upload did not complete in storage');
    }
    const uploadResult = {
      key: streamedFile.key,
      publicURL: streamedFile.publicURL,
      fileSize: file.size,
      mimeType: file.mimetype,
    };

    const createDocumentDto: CreateDocumentDto = {
      id: uuidv4(),
      createdDate: new Date(),
      fileURL: uploadResult.publicURL,
      category: documentCategory,
      userId: _req.userId,
      fileSize: uploadResult.fileSize,
      originalFileName: uploadDocumentDto.originalFileName || file.originalname || undefined,
      transactionId: uploadDocumentDto.transactionId,
      transactionServiceId: uploadDocumentDto.transactionServiceId,
      requirementId: uploadDocumentDto.requirementId || null,
      type: file.mimetype,
      notes: uploadDocumentDto.notes || null,
      ocrProcessed: false,
      ocrText: '',
      ocrConfidence: 0,
      ocrProcessFailedReason: null,
      ocrProcessedDate: new Date(),
    };

    const document = await this._documentService.create(createDocumentDto);

    // Create TransactionServiceRequirement record if transactionServiceId is provided
    // This links the uploaded document to the transaction service
    if (uploadDocumentDto.transactionServiceId) {
      console.log(
        `🔗 Creating TransactionServiceRequirement for document ${document.id} and transactionService ${uploadDocumentDto.transactionServiceId}`,
      );

      console.log(
        `✅ Successfully created TransactionServiceRequirement linking document ${document.id} to transactionService ${uploadDocumentDto.transactionServiceId}`,
      );
    } else {
      console.log(
        'ℹ️ No transactionServiceId provided, skipping TransactionServiceRequirement creation',
      );
    }

    const response = {
      success: true,
      document,
      uploadResult,
    };
    return response;
  }

  @Post(':id/download')
  @ApiOperation({ summary: 'Get a secured download URL for a document' })
  @ApiResponse({ status: 200, description: 'Streams the file contents (authenticated)' })
  async downloadDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ) {
    // Ensure the caller is authenticated (guard already applied)
    const doc = await this._documentService.findOne(id);
    if (!doc) {
      throw new BadRequestException('Document not found');
    }

    // Build candidate S3 keys from stored fileURL
    const candidates: string[] = [];
    const addCandidate = (k?: string | null) => {
      if (!k) return;
      // If it's a full URL, extract the key first
      const key = k.includes('://') ? this._s3StorageService.extractKeyFromUrl(k) : k;
      const trimmed = key.startsWith('/') ? key.slice(1) : key;
      if (trimmed && !candidates.includes(trimmed)) {
        candidates.push(trimmed);
      }
    };

    // Primary candidate: extracted key from fileURL
    addCandidate(doc.fileURL);

    // parsed URL path variants (fallback)

    const asUrl = new URL(doc.fileURL);
    addCandidate(asUrl.pathname);
    addCandidate(decodeURIComponent(asUrl.pathname));

    // if originalFileName exists, try stripping any folder named after it
    if (doc.originalFileName) {
      for (const k of candidates) {
        const segment = doc.originalFileName;
        const needle = `/${segment}/`;
        if (k.includes(needle)) {
          const cleaned = k.replace(needle, '/');
          addCandidate(cleaned);
        }
      }
    }

    let file: Awaited<ReturnType<typeof this._s3StorageService.getFile>> | null = null;
    let lastErr: unknown;
    for (const key of candidates) {
      try {
        file = await this._s3StorageService.getFile(key);
        break;
      } catch (err: unknown) {
        lastErr = err;
        this._logger.warn(
          `Download: candidate key failed '${key}': ${(err as Error)?.message || err}`,
        );
      }
    }

    if (!file) {
      throw new NotFoundException(
        `Document content not found in storage. Tried keys: ${candidates.join(', ')}`,
        { cause: lastErr },
      );
    }

    res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', file.contentLength);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${doc.originalFileName || doc.fileURL?.split('/').pop() || id}"`,
    );

    return res.send(file.buffer);
  }

  @Get()
  @ApiOperation({ summary: 'Get all documents with pagination and search' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String, example: 'category' })
  @ApiQuery({ name: 'sortDirection', required: false, type: String, example: 'ASC' })
  @ApiResponse({
    status: 200,
    description: 'Documents retrieved successfully',
  })
  async findAll(
    @ReqContext() _req: RequestContextDto,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDirection') sortDirection?: string,
  ): Promise<{
    data: DocumentEntity[];
    meta: CustomMeta;
  }> {
    return await this._documentService.findAll(+page, +limit, search, _req.userId, sortBy, sortDirection);
  }

  // Tree View Endpoints
  @Get('tree-view')
  @ApiOperation({ summary: 'Get parent transactions for tree view' })
  @ApiResponse({
    status: 200,
    description: 'Parent transactions retrieved successfully',
  })
  async getTreeView(
    @ReqContext() _req: RequestContextDto,
    @Query() filters?: types.DocumentListFilter,
  ) {
    return await this._documentService.getTreeView(filters, _req.userId);
  }

  @Get('debug/transaction/:transactionNumber')
  @ApiOperation({ summary: 'Debug transaction lookup' })
  async debugTransaction(@Param('transactionNumber') transactionNumber: string) {
    return await this._documentService.debugTransactionLookup(transactionNumber);
  }

  @Get('tree-view/:parentTransactionNumber')
  @ApiOperation({ summary: 'Get parent transaction details for tree view' })
  @ApiResponse({
    status: 200,
    description: 'Parent transaction details retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Parent transaction not found' })
  async getParentTransactionDetails(
    @Param('parentTransactionNumber') parentTransactionNumber: string,
  ) {
    return await this._documentService.getParentTransactionDetails(parentTransactionNumber);
  }

  @Get('tree-view/:parentTransactionNumber/:childTransactionNumber')
  @ApiOperation({ summary: 'Get child transaction details for tree view' })
  @ApiResponse({
    status: 200,
    description: 'Child transaction details retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Child transaction not found' })
  async getChildTransactionDetails(
    @Param('parentTransactionNumber') parentTransactionNumber: string,
    @Param('childTransactionNumber') childTransactionNumber: string,
  ) {
    return await this._documentService.getChildTransactionDetails(
      parentTransactionNumber,
      childTransactionNumber,
    );
  }

  @Get('tree-view/:parentTransactionNumber/:childTransactionNumber/:requirementCode')
  @ApiOperation({ summary: 'Get documents for a specific requirement within a child transaction' })
  @ApiQuery({
    name: 'query',
    required: false,
    type: String,
    description: 'Search query for document name',
  })
  @ApiQuery({
    name: 'documentType',
    required: false,
    isArray: true,
    description: 'Filter by document MIME types',
  })
  @ApiQuery({
    name: 'uploadedAfter',
    required: false,
    type: String,
    description: 'Filter documents uploaded after this date (ISO format)',
  })
  @ApiQuery({
    name: 'uploadedBefore',
    required: false,
    type: String,
    description: 'Filter documents uploaded before this date (ISO format)',
  })
  @ApiResponse({
    status: 200,
    description: 'Requirement documents retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Requirement or transaction not found' })
  async getRequirementDocuments(
    @Param('parentTransactionNumber') parentTransactionNumber: string,
    @Param('childTransactionNumber') childTransactionNumber: string,
    @Param('requirementCode') requirementCode: string,
    @Query('query') query?: string,
    @Query('documentType') documentType?: string | string[],
    @Query('uploadedAfter') uploadedAfter?: string,
    @Query('uploadedBefore') uploadedBefore?: string,
  ) {
    // Normalize documentType to array
    let documentTypes: string[] = [];

    if (documentType && typeof documentType === 'string') {
      documentTypes = documentType.split(',');
    }

    return await this._documentService.getRequirementDocuments(
      parentTransactionNumber,
      childTransactionNumber,
      requirementCode,
      {
        query,
        documentTypes,
        uploadedAfter,
        uploadedBefore,
      },
    );
  }

  // List View Endpoint
  @Get('list-view')
  @ApiOperation({ summary: 'Get documents list view' })
  @ApiQuery({ name: 'entityCode', required: false, type: String })
  @AuditDescription('Viewed documents list')
  async getListView(
    @ReqContext() _req: RequestContextDto,
    @Query() filters?: types.DocumentListFilter,
  ) {
    return await this._documentService.getListView(filters, _req.userId);
  }

  // ============================================================================
  // Document Category Endpoints - MUST come before generic :id routes
  // ============================================================================

  @Get('test-eos-route')
  @ApiOperation({ summary: 'Test if EOS routes are working' })
  async testEosRoute() {
    return { message: 'EOS routes are working!', timestamp: new Date().toISOString() };
  }

  @Get('transaction-service/:id/requirements-by-category')
  @ApiOperation({
    summary: 'Get requirement documents grouped by requirement for a transaction service',
  })
  @ApiResponse({ status: 200, description: 'Returns requirement documents grouped by requirement' })
  async getRequirementDocumentsByCategory(@Param('id') transactionServiceId: string) {
    return await this._documentService.getRequirementDocumentsByService(transactionServiceId);
  }

  @Get('transaction-service/:id/supporting')
  @ApiOperation({ summary: 'Get supporting documents for a transaction service' })
  @ApiResponse({ status: 200, description: 'Returns supporting documents' })
  async getSupportingDocuments(@Param('id') transactionServiceId: string) {
    const documents =
      await this._documentService.getSupportingDocumentsByService(transactionServiceId);

    // Format documents to match expected frontend structure
    const formattedDocuments = documents.map((doc) => ({
      id: doc.id,
      name: doc.originalFileName || 'Unnamed Document',
      documentType: doc.type,
      uploadedAt: doc.createdDate.toISOString(),
      uploadedByName: doc.user
        ? `${doc.user.firstName} ${doc.user.lastName}`.trim()
        : 'Unknown User',
      transactionId: doc.transactionId,
      uploadedBy: doc.user?.id || 'unknown',
      uploadedByUserEmail: doc.user?.email || 'unknown@example.com',
      uploadedByUserUsername: doc.user?.username || '--',
      fileSize: `${Math.round(doc.fileSize / 1024)}KB`,
      fileType: doc.type,
      size: doc.fileSize,
      mimeType: doc.type,
      categories: [doc.category],
      tags: [],
      serviceName: doc.transactionService?.service?.name || null,
      linkedServiceName: doc.transactionService?.service?.name || null,
    }));

    return { documents: formattedDocuments };
  }

  @Get('transaction-service/:id/output')
  @ApiOperation({ summary: 'Get output documents for a transaction service' })
  @ApiResponse({ status: 200, description: 'Returns output documents' })
  async getOutputDocuments(@Param('id') transactionServiceId: string) {
    const documents = await this._documentService.getOutputDocumentsByService(transactionServiceId);

    // Format documents to match expected frontend structure
    const formattedDocuments = documents.map((doc) => ({
      id: doc.id,
      name: doc.originalFileName || 'Unnamed Document',
      documentType: doc.type,
      uploadedAt: doc.createdDate.toISOString(),
      uploadedByName: doc.user
        ? `${doc.user.firstName} ${doc.user.lastName}`.trim()
        : 'Unknown User',
      uploadedBy: doc.user?.id || 'unknown',
      uploadedByUserEmail: doc.user?.email || 'unknown@example.com',
      uploadedByUserUsername: doc.user?.username || '--',
      transactionId: doc.transactionId,
      fileSize: `${Math.round(doc.fileSize / 1024)}KB`,
      fileType: doc.type,
      size: doc.fileSize,
      mimeType: doc.type,
      categories: [doc.category],
      tags: [],
      serviceName: doc.transactionService?.service?.name || null,
      linkedServiceName: doc.transactionService?.service?.name || null,
    }));

    return { documents: formattedDocuments };
  }

  @Get('transaction/:id/eos')
  @ApiOperation({ summary: 'Get EOS documents for a transaction' })
  @ApiResponse({ status: 200, description: 'Returns EOS documents' })
  async getEOSDocuments(@Param('id') transactionIdOrNumber: string) {
    try {
      // Mark Dinglasa :
      // REMEMBER : THIS KIND OF CONTROLLER SHOULDNT HANDLE SERVICE LOGIC, IT SHOULD ONLY
      // HANDLE HTTP REQUESTS
      // SUBCJECTED FOR REFACTORING

      this._logger.log(`EOS endpoint hit with parameter: ${transactionIdOrNumber}`);

      // Check if it's a UUID or transaction number
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        transactionIdOrNumber,
      );
      this._logger.log(`Parameter is ${isUUID ? 'UUID' : 'transaction number'}`);

      let transactionId: string;
      if (isUUID) {
        transactionId = transactionIdOrNumber;
      } else {
        // It's a transaction number, look up the ID
        this._logger.log(`Looking up transaction by number: ${transactionIdOrNumber}`);
        const transaction = await this._transactionRepo.findOne({
          where: { transactionNumber: transactionIdOrNumber, deletedDate: IsNull() },
          select: ['id'],
        });
        if (!transaction) {
          this._logger.error(`Transaction not found: ${transactionIdOrNumber}`);
          throw new NotFoundException(`Transaction with number ${transactionIdOrNumber} not found`);
        }
        this._logger.log(`Found transaction ID: ${transaction.id}`);
        transactionId = transaction.id;
      }

      this._logger.log(`Fetching EOS documents for transaction ID: ${transactionId}`);
      const documents = await this._documentService.getEOSDocumentsByTransaction(transactionId);
      this._logger.log(`Found ${documents.length} EOS documents`);

      // Get all services for this transaction to include in response
      const transactionServices = await this._transactionServiceRepo.find({
        where: { transactionId, deletedDate: IsNull() },
        relations: ['service'],
      });
      const serviceNames = transactionServices
        .map((ts) => ts.service?.name)
        .filter((name): name is string => !!name);
      // Remove duplicates using Set
      const uniqueServiceNames = [...new Set(serviceNames)];
      const serviceName = uniqueServiceNames.length > 0 ? uniqueServiceNames.join(', ') : null;

      // Format documents to match the expected frontend format
      const formattedDocuments = documents.map((doc) => ({
        id: doc.id,
        name: doc.originalFileName || 'Unnamed Document',
        documentType: doc.type,
        categories: doc.category ? [doc.category] : [],
        tags: (doc.documentTags || []).map((dt) => dt.tag?.name).filter((t): t is string => !!t),
        uploadedAt: doc.createdDate.toISOString(),
        uploadedBy: doc.userId || 'unknown',
        uploadedByName: doc.user
          ? `${doc.user.firstName} ${doc.user.lastName}`.trim()
          : 'Unknown User',
        uploadedByUserEmail: doc.user?.email || '',
        uploadedByUserUsername: doc.user?.username || '--',
        transactionId: doc.transactionId,
        fileSize: `${Math.round(doc.fileSize / 1024)}KB`,
        fileType: doc.type,
        parentTransactionNumber: doc.transaction?.transactionNumber || null,
        childTransactionNumber: null,
        serviceName: serviceName,
        linkedServiceName: serviceName,
        OCRStatus: doc.ocrProcessed ? 'Completed' : 'Pending',
        documentOwnerName: doc.user
          ? `${doc.user.firstName} ${doc.user.lastName}`.trim()
          : 'Unknown User',
      }));

      this._logger.log(`Returning response with ${formattedDocuments.length} formatted documents`);
      return { documents: formattedDocuments };
    } catch (error: unknown) {
      this._logger.error(
        `Error in getEOSDocuments: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  @Get('transaction/:id/receipts')
  @ApiOperation({ summary: 'Get receipt documents for a transaction' })
  @ApiResponse({ status: 200, description: 'Returns receipt documents' })
  async getReceiptDocuments(@Param('id') transactionIdOrNumber: string) {
    try {
      this._logger.log(`Receipt endpoint hit with parameter: ${transactionIdOrNumber}`);

      // Check if it's a UUID or transaction number
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        transactionIdOrNumber,
      );
      this._logger.log(`Parameter is ${isUUID ? 'UUID' : 'transaction number'}`);

      let transactionId: string;
      if (isUUID) {
        transactionId = transactionIdOrNumber;
      } else {
        // It's a transaction number, look up the ID
        this._logger.log(`Looking up transaction by number: ${transactionIdOrNumber}`);
        const transaction = await this._transactionRepo.findOne({
          where: { transactionNumber: transactionIdOrNumber, deletedDate: IsNull() },
          select: ['id'],
        });
        if (!transaction) {
          this._logger.error(`Transaction not found: ${transactionIdOrNumber}`);
          throw new NotFoundException(`Transaction with number ${transactionIdOrNumber} not found`);
        }
        this._logger.log(`Found transaction ID: ${transaction.id}`);
        transactionId = transaction.id;
      }

      this._logger.log(`Fetching receipt documents for transaction ID: ${transactionId}`);
      const documents = await this._documentService.getReceiptDocumentsByTransaction(transactionId);
      this._logger.log(`Found ${documents.length} receipt documents`);

      // Get all services for this transaction to include in response
      const transactionServices = await this._transactionServiceRepo.find({
        where: { transactionId, deletedDate: IsNull() },
        relations: ['service'],
      });
      const serviceNames = transactionServices
        .map((ts) => ts.service?.name)
        .filter((name): name is string => !!name);
      // Remove duplicates using Set
      const uniqueServiceNames = [...new Set(serviceNames)];
      const serviceName = uniqueServiceNames.length > 0 ? uniqueServiceNames.join(', ') : null;

      // Format documents to match the expected frontend format
      const formattedDocuments = documents.map((doc) => ({
        id: doc.id,
        name: doc.originalFileName || 'Unnamed Document',
        documentType: doc.type,
        categories: doc.category ? [doc.category] : [],
        tags: (doc.documentTags || []).map((dt) => dt.tag?.name).filter((t): t is string => !!t),
        uploadedAt: doc.createdDate.toISOString(),
        uploadedBy: doc.userId || 'unknown',
        uploadedByName: doc.user
          ? `${doc.user.firstName} ${doc.user.lastName}`.trim()
          : 'Unknown User',
        uploadedByUserUsername: doc.user?.username || '--',
        uploadedByUserEmail: doc.user?.email || '',
        transactionId: doc.transactionId,
        fileSize: `${Math.round(doc.fileSize / 1024)}KB`,
        fileType: doc.type,
        parentTransactionNumber: doc.transaction?.transactionNumber || null,
        childTransactionNumber: null,
        serviceName: serviceName,
        linkedServiceName: serviceName,
        OCRStatus: doc.ocrProcessed ? 'Completed' : 'Pending',
        documentOwnerName: doc.user
          ? `${doc.user.firstName} ${doc.user.lastName}`.trim()
          : 'Unknown User',
      }));

      this._logger.log(`Returning response with ${formattedDocuments.length} formatted documents`);
      return { documents: formattedDocuments };
    } catch (error: unknown) {
      this._logger.error(
        `Error in getReceiptDocuments: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  @Get('transaction/:id/recipient-ids')
  @ApiOperation({ summary: 'Get recipient ID documents for a transaction' })
  @ApiResponse({ status: 200, description: 'Returns recipient ID documents (Government IDs)' })
  async getRecipientIdDocuments(@Param('id') transactionIdOrNumber: string) {
    try {
      this._logger.log(`Recipient ID endpoint hit with parameter: ${transactionIdOrNumber}`);

      // Check if it's a UUID or transaction number
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        transactionIdOrNumber,
      );
      this._logger.log(`Parameter is ${isUUID ? 'UUID' : 'transaction number'}`);

      let transactionId: string;
      if (isUUID) {
        transactionId = transactionIdOrNumber;
      } else {
        // It's a transaction number, look up the ID
        this._logger.log(`Looking up transaction by number: ${transactionIdOrNumber}`);
        const transaction = await this._transactionRepo.findOne({
          where: { transactionNumber: transactionIdOrNumber, deletedDate: IsNull() },
          select: ['id'],
        });
        if (!transaction) {
          this._logger.error(`Transaction not found: ${transactionIdOrNumber}`);
          throw new NotFoundException(`Transaction with number ${transactionIdOrNumber} not found`);
        }
        this._logger.log(`Found transaction ID: ${transaction.id}`);
        transactionId = transaction.id;
      }

      this._logger.log(`Fetching recipient ID documents for transaction ID: ${transactionId}`);
      const documents =
        await this._documentService.getRecipientIdDocumentsByTransaction(transactionId);
      this._logger.log(`Found ${documents.length} recipient ID documents`);

      // Get transaction info for the response
      const transactionEntity = isUUID
        ? await this._transactionRepo.findOne({
            where: { id: transactionId, deletedDate: IsNull() },
            select: ['transactionNumber', 'id'],
          })
        : null;

      const parentTransactionNumber = transactionEntity?.transactionNumber || transactionIdOrNumber;

      // Format documents to match the expected frontend format
      const formattedDocuments = documents.map((doc) => ({
        id: doc.id,
        name: doc.originalFileName || 'Unnamed Document',
        documentType: doc.type,
        categories: doc.category ? [doc.category] : [],
        tags: (doc.documentTags || []).map((dt) => dt.tag?.name).filter((t): t is string => !!t),
        uploadedAt: doc.createdDate.toISOString(),
        uploadedBy: doc.userId || 'unknown',
        uploadedByName: doc.user
          ? `${doc.user.firstName} ${doc.user.lastName}`.trim()
          : 'Unknown User',
        uploadedByUserUsername: doc.user?.username || '--',
        uploadedByUserEmail: doc.user?.email || '',
        transactionId: doc.transactionId,
        fileSize: `${Math.round(doc.fileSize / 1024)}KB`,
        fileType: doc.type,
        parentTransactionNumber: parentTransactionNumber,
        childTransactionNumber: null,
        serviceName: null,
        linkedServiceName: null,
        OCRStatus: doc.ocrProcessed ? 'Completed' : 'Pending',
        documentOwnerName: doc.user
          ? `${doc.user.firstName} ${doc.user.lastName}`.trim()
          : 'Unknown User',
      }));

      this._logger.log(`Returning response with ${formattedDocuments.length} formatted documents`);
      return { documents: formattedDocuments };
    } catch (error: unknown) {
      this._logger.error(
        `Error in getRecipientIdDocuments: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  // ============================================================================
  // Generic Document Endpoints - MUST come after specific routes
  // ============================================================================

  @Get(':documentId')
  @ApiOperation({ summary: 'Get a document by ID' })
  @ApiResponse({
    status: 200,
    description: 'Document retrieved successfully',
    type: DocumentEntity,
  })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async findOne(@Param('documentId') documentId: string): Promise<DocumentEntity> {
    return await this._documentService.findOne(documentId);
  }

  @Get(':id/tags')
  @ApiOperation({ summary: 'Get all tags for a document' })
  @ApiResponse({ status: 200, description: 'Tags retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getDocumentTags(@Param('id') documentId: string) {
    return this._documentService.getDocumentTags(documentId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a document' })
  @ApiResponse({
    status: 200,
    description: 'Document updated successfully',
    type: DocumentEntity,
  })
  @ApiResponse({ status: 404, description: 'Document not found' })
  @AuditDescription("Administrative modification made to document entry '{identifier}'")
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateDocumentDto: UpdateDocumentDto,
  ): Promise<DocumentEntity> {
    return await this._documentService.update(id, updateDocumentDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a document' })
  @ApiResponse({
    status: 200,
    description: 'Document deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Document not found' })
  @AuditDescription("Permanently removed document '{originalFileName}' from active records")
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqContext() _req: RequestContextDto,
  ): Promise<{ message: string; deletedId: string }> {
    const record = await this._documentService.findOne(id);
    if (record) _req.auditMetadata = { originalFileName: record.originalFileName || '' };
    return await this._documentService.softDelete(id);
  }

  // Tags Endpoints
  @Get('tags')
  @ApiOperation({ summary: 'Get all document tags' })
  @ApiResponse({
    status: 200,
    description: 'Tags retrieved successfully',
  })
  async getTags() {
    return await this._documentService.getTags();
  }

  @Post('tags')
  @ApiOperation({ summary: 'Create a new document tag' })
  @ApiResponse({
    status: 201,
    description: 'Tag created successfully',
  })
  async createTag(
    @ReqContext() _req: RequestContextDto,
    @Body() body: { name: string; color?: string; description?: string },
  ) {
    return await this._documentService.createTag(body, _req.userId);
  }

  @Put('tags')
  @ApiOperation({ summary: 'Update a document tag' })
  @ApiResponse({
    status: 200,
    description: 'Tag updated successfully',
  })
  async updateTag(
    @Body() body: { id: string; name?: string; color?: string; description?: string },
  ) {
    return await this._documentService.updateTag(body);
  }

  @Delete('tags')
  @ApiOperation({ summary: 'Delete a document tag' })
  @ApiQuery({ name: 'id', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'Tag deleted successfully',
  })
  async deleteTag(@Query('id') id: string) {
    return await this._documentService.deleteTag(id);
  }

  // Document-Tag Association Endpoints
  @Post(':id/tags')
  @ApiOperation({ summary: 'Add a tag to a document' })
  @ApiBody({
    schema: { type: 'object', properties: { tagId: { type: 'string' } }, required: ['tagId'] },
  })
  @ApiResponse({ status: 201, description: 'Tag added to document successfully' })
  @ApiResponse({ status: 404, description: 'Document or tag not found' })
  @ApiResponse({ status: 400, description: 'Tag already exists on document' })
  @AuditDescription("Categorized document '{originalFileName}' with a new tag")
  async addTagToDocument(
    @ReqContext() _req: RequestContextDto,
    @Param('id') documentId: string,
    @Body('tagId') tagId: string,
  ) {
    const record = await this._documentService.findOne(documentId);
    if (record) _req.auditMetadata = { originalFileName: record.originalFileName || '' };

    return await this._documentService.addTagToDocument(documentId, tagId, _req.userId);
  }

  @Delete(':id/tags/:tagId')
  @ApiOperation({ summary: 'Remove a tag from a document' })
  @ApiResponse({ status: 200, description: 'Tag removed from document successfully' })
  @ApiResponse({ status: 404, description: 'Document-tag association not found' })
  @AuditDescription("Removed tag from document '{originalFileName}'")
  async removeTagFromDocument(
    @ReqContext() _req: RequestContextDto,
    @Param('id') documentId: string,
    @Param('tagId') tagId: string,
    @Request() req: any,
  ) {
    const record = await this._documentService.findOne(documentId);
    if (record) _req.auditMetadata = { originalFileName: record.originalFileName || '' };

    return await this._documentService.removeTagFromDocument(documentId, tagId, _req.userId);
  }

  @Post('bulk-tags')
  @ApiOperation({ summary: 'Add tags to multiple documents at once' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        documentIds: { type: 'array', items: { type: 'string' } },
        tagIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['documentIds', 'tagIds'],
    },
  })
  @ApiResponse({ status: 200, description: 'Tags added to documents successfully' })
  async bulkAddTags(
    @ReqContext() _req: RequestContextDto,
    @Body('documentIds') documentIds: string[],
    @Body('tagIds') tagIds: string[],
  ) {
    return this._documentService.bulkAddTags(documentIds, tagIds, _req.userId);
  }
}
