import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommonResponse } from '../../../shared/common/response.js';
import { AuditDescription } from '../../../shared/decorators/audit-description.decorator.js';
import { Audit } from '../../../shared/decorators/audit.decorator.js';
import { GatewayUserGuard } from '../../../shared/guards/gateway-user.guard.js';
import DocumentEntity from '../../../shared/infrastructure/database/entities/document.entity.js';
import { ReqContext, RequestContextDto } from '../../../utils/req-context.decorator.js';
import { S3StorageService } from '../../s3-storage/services/s3-storage.service.js';
import { CreateDocumentDtoV2 } from '../dtos/create-document-v2.dto.js';
import { UpdateOCRFieldDto } from '../dtos/update-ocr-field.dto.js';
import { DocumentServiceV2 } from '../types.js';

@ApiTags('Document V2')
@ApiBearerAuth('JWT')
@UseGuards(GatewayUserGuard)
@Controller(['api/v2/document', 'v2/document'])
@Audit('Document Management')
export class DocumentControllerV2 {
  constructor(
    private readonly _documentService: DocumentServiceV2,
    private readonly _s3StorageService: S3StorageService,
  ) {}

  @Get('tree-view')
  @AuditDescription('View Documents in tree view')
  @ApiOperation({ summary: 'View Documents in tree view' })
  async getTreeView(
    @ReqContext() _req: RequestContextDto,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
  ) {
    return await this._documentService.getTreeView(_req.userId, page, limit, search);
  }

  @Get('uploaded-by')
  @AuditDescription('View Uploaders for Document Filter')
  @ApiOperation({
    summary: 'Get a list of users who have uploaded documents based on the user type',
  })
  async getUploadedBy(
    @ReqContext() _req: RequestContextDto,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
  ) {
    return await this._documentService.getUploadedBy(_req.userId, page, limit, search);
  }

  @Post('/url/:documentId')
  @AuditDescription("Accessed secure viewing link for document '{identifier}'")
  @ApiOperation({ summary: 'Get document by requirement in transaction service' })
  async getDocumentURL(
    @ReqContext() _req: RequestContextDto,
    @Param('documentId') documentId: string,
  ): Promise<CommonResponse> {
    const document = await this._documentService.getDocument(documentId);
    if (document) _req.auditMetadata = { identifier: document.originalFileName || document.id };

    let fileURL = document.fileURL;

    // Convert DOCX to PDF for better frontend rendering
    if (fileURL.toLowerCase().endsWith('.docx')) {
      fileURL = await this._documentService.getOrConvertDocxToPdf(fileURL);
    }

    const presigned = await this._s3StorageService.getSignedUrl(fileURL);

    return {
      success: true,
      message: 'Document found',
      data: presigned,
    };
  }

  @Post('/download/:documentId')
  @AuditDescription("Initiated download for document '{identifier}'")
  @ApiOperation({ summary: 'download document' })
  async downloadDocument(
    @ReqContext() _req: RequestContextDto,
    @Param('documentId') documentId: string,
  ): Promise<CommonResponse> {
    const document = await this._documentService.getDocument(documentId);
    if (document) _req.auditMetadata = { identifier: document.originalFileName || document.id };

    const fileURL = document.fileURL;
    const fileName = document.originalFileName || undefined;
    const presigned = await this._s3StorageService.getSignedDownloadUrl(fileURL, fileName);

    return {
      success: true,
      message: 'Document found',
      data: presigned,
    };
  }

  @Get('/download-all/:transactionId')
  @AuditDescription('Downloaded all documents for transaction')
  @ApiOperation({ summary: 'Download all documents by transaction service as ZIP' })
  async downloadAllDocuments(
    @ReqContext() _req: RequestContextDto,
    @Param('transactionId') transactionId: string,
    @Res() res: Response,
  ) {
    return await this._documentService.downloadAllDocumentsByTransactionService(transactionId, res);
  }

  @Get('/download-all-by-transaction/:transactionId')
  @AuditDescription('Downloaded all documents for transaction')
  @ApiOperation({ summary: 'Download all documents by transaction service as ZIP' })
  async downloadAllDocumentsByTransaction(
    @ReqContext() _req: RequestContextDto,
    @Param('transactionId') transactionId: string,
    @Res() res: Response,
  ) {
    return await this._documentService.downloadAllDocumentsByTransaction(transactionId, res);
  }

  @Get('/proxy/:documentId')
  @AuditDescription("Downloaded document content via proxy for document '{identifier}'")
  @ApiOperation({ summary: 'Proxy download document content to avoid CORS' })
  async proxyDownload(
    @ReqContext() _req: RequestContextDto,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const document = await this._documentService.getDocument(documentId);
    if (!document) throw new NotFoundException('Document not found');

    _req.auditMetadata = { identifier: document.originalFileName || document.id };

    const { buffer, contentType } = await this._s3StorageService.getFile(document.fileURL);

    (res as unknown as {setHeader:(p1:string, p2:string)=>void})?.setHeader('Content-Type', contentType);
    (res as unknown as {setHeader:(p1:string, p2:string)=>void})?.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.originalFileName || 'file'}"`,
    );
    (res as unknown as {setHeader:(p1:string, p2:string)=>void})?.setHeader('Content-Length', buffer.length.toString());
    (res as unknown as {setHeader:(p1:string, p2:string)=>void})?.setHeader('Access-Control-Allow-Origin', _req?.headers?.origin || '*');
    (res as unknown as {setHeader:(p1:string, p2:string)=>void})?.setHeader('Access-Control-Allow-Credentials', 'true');

    (res as unknown as {send:(p1:Buffer)=>void})?.send(buffer);
  }

  @Post()
  @AuditDescription("Uploaded and registered a new document: '{identifier}'")
  @ApiOperation({ summary: 'Create a new document' })
  async create(
    @ReqContext() _req: RequestContextDto,
    @Body() body: CreateDocumentDtoV2,
  ): Promise<CommonResponse> {
    if (body.originalFileName) _req.auditMetadata = { identifier: body.originalFileName };

    return await this._documentService.create(_req.userId, body);
  }

  @Get(':documentId')
  @ApiOperation({ summary: 'Get document by requirement in transaction service' })
  async getDocument(
    @ReqContext() _req: RequestContextDto,
    @Param('documentId') documentId: string,
  ): Promise<DocumentEntity> {
    return await this._documentService.getDocument(documentId);
  }

  @Get('/requirement/:requirementId/:transactionServiceId')
  @ApiOperation({ summary: 'Get document by requirement in transaction service' })
  async getDocumentByRequirement(
    @ReqContext() _req: RequestContextDto,
    @Param('requirementId') requirementId: string,
    @Param('transactionServiceId') transactionServiceId: string,
  ): Promise<DocumentEntity[]> {
    return await this._documentService.getDocumentByRequirement(
      requirementId,
      transactionServiceId,
    );
  }

  @Patch(':documentId')
  @AuditDescription("Manually updated metadata fields for document '{identifier}'")
  @ApiOperation({ summary: 'Update OCR field' })
  async updateOCRField(
    @ReqContext() _req: RequestContextDto,
    @Param('documentId') documentId: string,
    @Body() body: UpdateOCRFieldDto,
  ): Promise<CommonResponse> {
    const document = await this._documentService.getDocument(documentId);
    if (document) _req.auditMetadata = { identifier: document.originalFileName || document.id };

    return await this._documentService.updateOCRField(documentId, _req.userId, body);
  }
}
