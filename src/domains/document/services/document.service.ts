import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, Repository, SelectQueryBuilder } from 'typeorm';
import { TransactionType, USER_TYPE } from '../../../shared/common/app-enums.js';
import { CustomMeta } from '../../../shared/common/meta.js';
import DocumentTagEntity from '../../../shared/infrastructure/database/entities/document-tag.entity.js';
import DocumentEntity from '../../../shared/infrastructure/database/entities/document.entity.js';
import RequirementEntity from '../../../shared/infrastructure/database/entities/requirement.entity.js';
import TagEntity from '../../../shared/infrastructure/database/entities/tag.entity.js';
import TransactionEntity from '../../../shared/infrastructure/database/entities/transaction.entity.js';
import UserEntity from '../../../shared/infrastructure/database/entities/user.entity.js';
import { formatFileType } from '../../../utils/transaformer.js';
import { CreateDocumentDto } from '../dtos/create-document.dto.js';
import { UpdateDocumentDto } from '../dtos/update-document.dto.js';
import { DocumentListFilter, DocumentService } from '../types.js';

@Injectable()
export class DocumentServiceImpl extends DocumentService {
  private readonly _logger = new Logger(DocumentServiceImpl.name);

  constructor(
    @InjectRepository(DocumentEntity)
    private readonly _documentRepo: Repository<DocumentEntity>,
    @InjectRepository(TransactionEntity)
    private readonly _transactionRepo: Repository<TransactionEntity>,
    @InjectRepository(RequirementEntity)
    private readonly _requirementRepo: Repository<RequirementEntity>,
    @InjectRepository(TagEntity)
    private readonly _tagRepo: Repository<TagEntity>,
    @InjectRepository(UserEntity)
    private readonly _userRepo: Repository<UserEntity>,
    @InjectRepository(DocumentTagEntity)
    private readonly _documentTagRepo: Repository<DocumentTagEntity>,
  ) {
    super();
  }

  private _stripTransactionPrefix(transactionNumber: string): string {
    if (transactionNumber?.startsWith('PTN-')) {
      const parts = transactionNumber.split('-');
      return parts.at(-1) || '';
    }
    return transactionNumber;
  }

  // Helper to validate UUID format
  private isValidUUID(str: string | undefined | null): boolean {
    if (!str) return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  async create(createDocumentDto: CreateDocumentDto): Promise<DocumentEntity> {
    const document = this._documentRepo.create(createDocumentDto);

    const saved = await this._documentRepo.save(document);
    this._logger.log(`Created document ${saved.id}`);
    return saved;
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    userId?: string,
    sortBy?: string,
    sortDirection?: string,
  ): Promise<{
    data: DocumentEntity[];
    meta: CustomMeta;
  }> {
    const user = await this._userRepo.findOne({ where: { id: userId, deletedDate: IsNull() } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_ACCEPTABLE);

    const skip = (page - 1) * limit;
    const queryBuilder = this._documentRepo
      .createQueryBuilder('document')
      .leftJoinAndSelect('document.transaction', 'transaction')
      .leftJoinAndSelect('transaction.staging', 'staging')
      .leftJoinAndSelect('transaction.service', 'service')
      .leftJoinAndSelect('document.transactionService', 'transactionService')
      .leftJoinAndSelect('transactionService.requirement', 'requirement')
      .leftJoinAndSelect('document.documentTags', 'documentTag')
      .leftJoinAndSelect('documentTag.tag', 'tag')
      .leftJoinAndSelect('document.user', 'user')
      .where('document.deletedDate IS NULL');

    // Apply user-based filtering: only admins can see all documents
    if (userId && user?.type !== USER_TYPE.ADMINISTRATOR) {
      queryBuilder.andWhere('document.userId = :userId', { userId });
    }

    // For administrators, exclude DRAFT transactions that are not admin-assisted
    if (user?.type === USER_TYPE.ADMINISTRATOR) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('transaction.id IS NULL') // Documents not linked to a transaction
            .orWhere('staging.code != :draftCode', { draftCode: 'DRAFT' })
            .orWhere('transaction.type = :assistedType', {
              assistedType: TransactionType.B2B_ASSISTED_PO,
            });
        }),
      );
    }

    if (search) {
      queryBuilder.andWhere(
        '(document.fileURL LIKE :search OR document.category LIKE :search OR document.type LIKE :search)',
        { search: `%${search}%` },
      );
    }
    const total = await queryBuilder.getCount();

    const sortFieldMap: Record<string, string> = {
      fileName: 'document.originalFileName',
      size: 'document.fileSize',
      fileSize: 'document.fileSize',
      category: 'document.category',
      transactionNumber: 'transaction.transactionNumber',
    };

    const dir = sortDirection?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    if (sortBy && sortFieldMap[sortBy]) {
      queryBuilder
        .addSelect(
          `CASE WHEN ${sortFieldMap[sortBy]} IS NULL THEN 1 ELSE 0 END`,
          'sort_null_priority',
        )
        .orderBy('sort_null_priority', 'ASC')
        .addOrderBy(sortFieldMap[sortBy], dir);
    } else {
      queryBuilder.orderBy('document.createdDate', dir);
    }

    queryBuilder.skip(skip).take(limit);
    const data = await queryBuilder.getMany();

    return {
      data,
      meta: {
        total,
        page: page,
        limit: limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Transform individual document to frontend format
  private transformDocumentForFrontend(
    document: DocumentEntity,
    requirementNameOverride?: string | null,
  ): any {
    const tagNames =
      document.documentTags?.map((dt) => dt.tag?.name).filter((t): t is string => !!t) || [];

    const ts = document.transactionService as any;
    const serviceStatus =
      (document.transaction as any)?.service?.status || ts?.service?.status || null;
    const serviceCategory =
      (document.transaction as any)?.service?.category || ts?.service?.category || null;
    const requirementName =
      requirementNameOverride ||
      (document.transactionService as any)?.requirement?.name ||
      ts?.requirement?.name ||
      null;

    return {
      id: document.id,
      name: document.originalFileName || 'Unnamed Document',
      originalName: document.originalFileName,
      type: document.type,
      mimeType: document.type,
      size: document.fileSize,
      fileSize: `${Math.round(document.fileSize / 1024)}KB`,
      status: serviceStatus || 'Available',
      statusDate:
        (document.transaction as any)?.service?.updatedDate ||
        ts?.service?.updatedDate ||
        document.updatedDate ||
        document.createdDate,
      uploadedAt: document.createdDate.toISOString(),
      uploadedBy: {
        id: document.user?.id || 'unknown',
        name: document.user
          ? `${document.user.firstName} ${document.user.lastName}`.trim()
          : 'Unknown User',
        email: document.user?.email || 'unknown@example.com',
      },
      uploadedByUserId: document.user?.id || 'unknown',
      uploadedByName: document.user
        ? `${document.user.firstName} ${document.user.lastName}`.trim()
        : 'Unknown User',
      uploadedByUserEmail: document.user?.email || 'unknown@example.com',
      uploadedByUserUsername: document.user?.username || '--',
      transactionId: document.transaction.id,
      downloadUrl: document.fileURL,
      fileURL: document.fileURL,
      category: serviceCategory || document.category,
      categories: serviceCategory ? [serviceCategory] : [document.category],
      requirementId: document.requirementId,
      requirementName: requirementName,
      transactionNumber: (document.transaction as any)?.transactionNumber,
      serviceName: (document.transaction as any)?.service?.name || ts?.service?.name,
      transactionServiceId: document.transactionServiceId,
      ocrProcessed: document.ocrProcessed,
      ocrText: document.ocrText,
      ocrConfidence: document.ocrConfidence,
      createdDate: document.createdDate.toISOString(),
      updatedDate: document.updatedDate?.toISOString(),
      tags: tagNames,
    };
  }

  async findOne(id: string): Promise<any> {
    const document = await this._documentRepo.findOne({
      where: {
        id,
        deletedDate: IsNull(),
      },
      relations: ['user', 'transaction', 'transactionService'],
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return this.transformDocumentForFrontend(document);
  }

  async update(id: string, updateDocumentDto: UpdateDocumentDto): Promise<DocumentEntity> {
    const document = await this.findOne(id);

    this._documentRepo.merge(document, updateDocumentDto);

    const updated = await this._documentRepo.save(document);
    this._logger.log(`Updated document ${updated.id}`);

    return updated;
  }

  async softDelete(id: string): Promise<{ message: string; deletedId: string }> {
    const document = await this.findOne(id);

    await this._documentRepo.softDelete(id);

    this._logger.log(`Soft deleted document ${document.id}`);

    return {
      message: 'Document deleted successfully',
      deletedId: id,
    };
  }

  async getDocument(
    userId: string,
    transactionId: string,
    requirementId: string,
    documentId: string, // refers document.id
  ): Promise<{ filePath: string; filename: string; mimeType: string }> {
    // Verify draft exists and belongs to user
    const draft = await this._documentRepo.findOne({
      where: { transactionId, userId },
    });

    if (!draft) {
      throw new NotFoundException('Draft transaction not found');
    }

    // Find requirement
    const requirement = await this._documentRepo.findOne({
      where: {
        id: documentId,
        transactionId,
        requirementId,
      },
    });

    if (!requirement) {
      throw new NotFoundException('Requirement not found');
    }

    // Find document
    const document = await this._documentRepo.findOne({
      where: {
        transactionId,
        id: documentId,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return { filename: '', filePath: '', mimeType: '' };
  }

  // Tree View Methods
  async getTreeView(
    filters: DocumentListFilter,
    userId: string,
  ): Promise<{ data: DocumentEntity[]; meta: CustomMeta }> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;

    const user = await this._getTreeViewUser(userId);
    const whereConditions = await this._getTreeViewWhereConditions(user);

    const queryBuilder = this._documentRepo
      .createQueryBuilder('doc')
      .where(whereConditions)
      .leftJoinAndSelect('doc.transaction', 'transaction')
      .leftJoinAndSelect('transaction.staging', 'staging')
      .leftJoinAndSelect('transaction.user', 'user');

    this._applyTreeViewDateFilters(queryBuilder, filters);

    const documents = await queryBuilder.getMany();
    const transactionMap = this._groupDocumentsIntoHierarchy(documents, user);

    if (transactionMap.size === 0) {
      return { data: [], meta: { total: 0, page, totalPages: 0, limit } };
    }

    const transactionIds = Array.from(transactionMap.keys());
    const transactions = await this._getTreeViewTransactions(transactionIds, filters, user);
    const { serviceNumberMap, serviceNameMap } = await this._getTreeViewServices(
      transactionIds,
      filters,
      user,
    );

    const requirementIds = this._collectUniqueRequirementIds(transactionMap);
    const requirements = await this._getTreeViewRequirements(requirementIds);

    const requirementNameMap = new Map(requirements.map((req) => [req.id, req.name]));
    const requirementCodeMap = new Map(requirements.map((req) => [req.id, req.requirementCode]));
    const transactionDetailsMap = new Map(transactions.map((tx) => [tx.id, tx]));

    const parentTransactions = this._buildTreeViewResponse(
      transactionMap,
      transactionDetailsMap,
      serviceNumberMap,
      serviceNameMap,
      requirementNameMap,
      requirementCodeMap,
    );

    this._applyTreeViewSorting(parentTransactions, filters);

    return {
      data: parentTransactions as unknown as DocumentEntity[],
      meta: {
        total: parentTransactions.length,
        page,
        totalPages: Math.ceil(parentTransactions.length / limit),
        limit,
      },
    };
  }

  private async _getTreeViewUser(userId: string): Promise<UserEntity> {
    const user = await this._userRepo.findOne({
      where: { id: userId, deletedDate: IsNull() },
      withDeleted: false,
      relations: ['userCompanies', 'userCompanies.company'],
    });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_ACCEPTABLE);
    return user;
  }

  private async _getTreeViewWhereConditions(user: UserEntity): Promise<any> {
    if (user.type === USER_TYPE.ADMINISTRATOR) {
      return { deletedDate: IsNull() };
    }

    const userTransactions = await this._transactionRepo.find({
      where: { userId: user.id, deletedDate: IsNull() },
      select: ['id'],
    });
    const userTransactionIds = userTransactions.map((t) => t.id);

    if (userTransactionIds.length > 0) {
      return [
        { userId: user.id, deletedDate: IsNull() },
        { transactionId: In(userTransactionIds), deletedDate: IsNull() },
      ];
    }

    return { userId: user.id, deletedDate: IsNull() };
  }

  private _applyTreeViewDateFilters(
    queryBuilder: SelectQueryBuilder<DocumentEntity>,
    filters: DocumentListFilter,
  ): void {
    if (filters.fromDate) {
      const startDate = new Date(filters.fromDate);
      startDate.setHours(0, 0, 0, 0);
      queryBuilder.andWhere('doc.createdDate >= :uploadedAfter', { uploadedAfter: startDate });
    }

    if (filters.toDate) {
      const endDate = new Date(filters.toDate);
      endDate.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('doc.createdDate <= :uploadedBefore', { uploadedBefore: endDate });
    }
  }

  private _groupDocumentsIntoHierarchy(
    documents: DocumentEntity[],
    user: UserEntity,
  ): Map<string, any> {
    const transactionMap = new Map<string, any>();

    for (const doc of documents) {
      if (!doc.transactionId || this._shouldSkipDraftTransaction(doc, user)) continue;

      if (!transactionMap.has(doc.transactionId)) {
        transactionMap.set(doc.transactionId, {
          documentCount: 0,
          eosDocumentCount: 0,
          receiptDocumentCount: 0,
          recipientDocumentCount: 0,
          services: new Map(),
        });
      }

      this._updateTransactionHierarchy(transactionMap.get(doc.transactionId), doc);
    }
    return transactionMap;
  }

  private _shouldSkipDraftTransaction(doc: DocumentEntity, user: UserEntity): boolean {
    if (user.type !== USER_TYPE.ADMINISTRATOR || doc.transaction?.staging?.code !== 'DRAFT') {
      return false;
    }
    const type = doc.transaction?.type;
    return (
      type === TransactionType.B2C ||
      type === TransactionType.B2B_SS ||
      type === TransactionType.B2B_SS_PO
    );
  }

  private _updateTransactionHierarchy(transaction: any, doc: DocumentEntity): void {
    transaction.documentCount++;

    if (doc.category === 'EOS') {
      transaction.eosDocumentCount++;
    } else if (doc.category === 'RECEIPT') {
      transaction.receiptDocumentCount++;
    } else if (doc.category === 'RECIPIENT_ID') {
      transaction.recipientDocumentCount++;
    } else if (doc.transactionServiceId) {
      this._updateServiceHierarchy(transaction, doc);
    }
  }

  private _updateServiceHierarchy(transaction: any, doc: DocumentEntity): void {
    if (!transaction.services.has(doc.transactionServiceId)) {
      transaction.services.set(doc.transactionServiceId, {
        requirements: new Map(),
      });
    }

    const service = transaction.services.get(doc.transactionServiceId)!;

    if (doc.requirementId) {
      const currentCount = service.requirements.get(doc.requirementId) || 0;
      service.requirements.set(doc.requirementId, currentCount + 1);
    }
  }

  private async _getTreeViewTransactions(
    transactionIds: string[],
    filters: DocumentListFilter,
    user: UserEntity,
  ): Promise<TransactionEntity[]> {
    const transactionWhere: any = {
      id: In(transactionIds),
      deletedDate: IsNull(),
    };

    if (filters.userId && user.type !== USER_TYPE.ADMINISTRATOR) {
      transactionWhere.userId = filters.userId;
    }

    if (filters.transactionNumber) {
      transactionWhere.transactionNumber = filters.transactionNumber;
    }

    return this._transactionRepo.find({
      where: transactionWhere,
      select: ['id', 'transactionNumber', 'createdDate'],
    });
  }

  private async _getTreeViewServices(
    transactionIds: string[],
    filters: DocumentListFilter,
    user: UserEntity,
  ): Promise<{ serviceNumberMap: Map<string, string>; serviceNameMap: Map<string, string> }> {
    const query = this._transactionRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.transactionServices', 'ts')
      .leftJoinAndSelect('ts.service', 's')
      .where('t.id IN (:...transactionIds)', { transactionIds })
      .andWhere('t.deletedDate IS NULL')
      .andWhere('ts.deletedDate IS NULL')
      .select(['t.id', 'ts.id', 'ts.transactionServiceNumber', 's.id', 's.name']);

    if (filters.userId && user.type !== USER_TYPE.ADMINISTRATOR) {
      query.andWhere('t.userId = :userId', { userId: filters.userId });
    }

    const transactionServices = await query.getMany();
    const serviceNumberMap = new Map<string, string>();
    const serviceNameMap = new Map<string, string>();

    transactionServices.forEach((tx) => {
      tx.transactionServices?.forEach((ts) => {
        serviceNumberMap.set(ts.id, ts.transactionServiceNumber);
        serviceNameMap.set(ts.id, ts.service?.name || 'Unknown Service');
      });
    });

    return { serviceNumberMap, serviceNameMap };
  }

  private _collectUniqueRequirementIds(transactionMap: Map<string, any>): string[] {
    const requirementIds = new Set<string>();
    transactionMap.forEach((tx) => {
      tx.services.forEach((service: any) => {
        service.requirements.forEach((_: any, reqId: string) => {
          if (reqId !== 'unknown') requirementIds.add(reqId);
        });
      });
    });
    return Array.from(requirementIds);
  }

  private async _getTreeViewRequirements(requirementIds: string[]): Promise<RequirementEntity[]> {
    if (requirementIds.length === 0) return [];
    return this._requirementRepo.find({
      where: { id: In(requirementIds) },
      select: ['id', 'name', 'requirementCode'],
    });
  }

  private _buildTreeViewResponse(
    transactionMap: Map<string, any>,
    transactionDetailsMap: Map<string, any>,
    serviceNumberMap: Map<string, string>,
    serviceNameMap: Map<string, string>,
    requirementNameMap: Map<string, string>,
    requirementCodeMap: Map<string, string | null>,
  ): any[] {
    const parentTransactions: any[] = [];

    for (const [transactionId, transactionData] of transactionMap.entries()) {
      const transaction = transactionDetailsMap.get(transactionId);
      if (!transaction?.transactionNumber) continue;

      const transactionServices = Array.from(transactionData.services.entries())
        //?.filter(([tsId]) => serviceNumberMap?.has(tsId) as unknown)
        .map(([tsId, serviceData]: any) => ({
          childTransactionNumber: serviceNumberMap.get(tsId)!,
          serviceName: serviceNameMap.get(tsId) || 'Unknown Service',
          requirements: Array.from(serviceData.requirements.entries()).map(
            ([reqId, count]: any) => ({
              requirementName: requirementNameMap.get(reqId) || 'Unknown Requirement',
              requirementCode: requirementCodeMap.get(reqId) || null,
              documentCount: count,
            }),
          ),
        }));

      const activeDocumentCount = transactionServices.reduce(
        (acc, ct) => acc + ct.requirements.reduce((rAcc, r) => rAcc + r.documentCount, 0),
        0,
      );

      parentTransactions.push({
        parentTransactionNumber: transaction.transactionNumber,
        transactionId: transaction.id,
        documentCount: activeDocumentCount,
        eosDocumentCount: transactionData.eosDocumentCount,
        receiptDocumentCount: transactionData.receiptDocumentCount,
        recipientDocumentCount: transactionData.recipientDocumentCount,
        transactionServices,
        createdAt: transaction.createdDate,
      });
    }
    return parentTransactions;
  }

  private _applyTreeViewSorting(parentTransactions: any[], filters: DocumentListFilter): void {
    if (!filters.sortBy) return;

    const order = filters.sortDirection?.toUpperCase() === 'ASC' ? 1 : -1;
    parentTransactions.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (filters.sortBy) {
        case 'name':
          aValue = a.parentTransactionNumber;
          bValue = b.parentTransactionNumber;
          break;
        case 'size':
        case 'documentCount':
          aValue = a.documentCount;
          bValue = b.documentCount;
          break;
        case 'uploadedAt':
        case 'createdAt':
        default:
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
      }

      if (aValue < bValue) return -1 * order;
      if (aValue > bValue) return 1 * order;
      return 0;
    });
  }

  async debugTransactionLookup(transactionNumber: string): Promise<any> {
    // Check if transaction exists (including deleted)
    const allMatches = await this._transactionRepo.find({
      where: { transactionNumber },
      withDeleted: true,
      select: ['id', 'transactionNumber', 'deletedDate', 'createdDate', 'updatedDate'],
    });

    // Check case-insensitive matches
    const caseInsensitiveMatches = await this._transactionRepo
      .createQueryBuilder('transaction')
      .where('LOWER(transaction.transactionNumber) = LOWER(:transactionNumber)', {
        transactionNumber,
      })
      .withDeleted()
      .select([
        'transaction.id',
        'transaction.transactionNumber',
        'transaction.deletedDate',
        'transaction.createdDate',
      ])
      .getMany();

    // Check if there are documents referencing this transaction
    const documentsWithThisTransaction = await this._documentRepo.count({
      where: { transactionId: In(allMatches.map((t) => t.id)) },
      withDeleted: true,
    });

    return {
      searchedFor: transactionNumber,
      exactMatches: allMatches.map((t) => ({
        id: t.id,
        transactionNumber: t.transactionNumber,
        isDeleted: !!t.deletedDate,
        deletedDate: t.deletedDate,
        createdDate: t.createdDate,
        updatedDate: t.updatedDate,
      })),
      caseInsensitiveMatches: caseInsensitiveMatches.map((t) => ({
        id: t.id,
        transactionNumber: t.transactionNumber,
        isDeleted: !!t.deletedDate,
        deletedDate: t.deletedDate,
        createdDate: t.createdDate,
      })),
      documentsCount: documentsWithThisTransaction,
      timestamp: new Date().toISOString(),
    };
  }

  async getParentTransactionDetails(parentTransactionNumber: string): Promise<any> {
    // Find transaction by transaction number
    if (!parentTransactionNumber) {
      throw new BadRequestException('Transaction number is required.');
    }

    // Try exact match first
    let transaction = await this._transactionRepo.findOne({
      where: { transactionNumber: parentTransactionNumber, deletedDate: IsNull() },
      withDeleted: false,
      relations: ['transactionServices', 'transactionServices.service'], // transactionServices should not be deleted
      // link only the active transaction-service not deleted
    });

    if (!transaction) {
      // Fallback: try stripped number for legacy support
      const strippedNumber = this._stripTransactionPrefix(parentTransactionNumber);
      if (strippedNumber !== parentTransactionNumber) {
        transaction = await this._transactionRepo.findOne({
          where: { transactionNumber: strippedNumber, deletedDate: IsNull() },
          withDeleted: false,
          relations: ['transactionServices', 'transactionServices.service'],
        });
      }
    }

    if (!transaction)
      throw new NotFoundException(`Transaction "${parentTransactionNumber}" has been deleted`);

    if (!transaction) {
      // Check if transaction exists but is deleted
      const deletedTransaction = await this._transactionRepo.findOne({
        where: { transactionNumber: parentTransactionNumber },
        withDeleted: true,
      });

      if (deletedTransaction?.deletedDate) {
        throw new NotFoundException(
          `Parent transaction "${parentTransactionNumber}" has been deleted`,
        );
      }

      // Check for case-insensitive match
      const caseInsensitiveTransaction = await this._transactionRepo
        .createQueryBuilder('transaction')
        .where('LOWER(transaction.transactionNumber) = LOWER(:transactionNumber)', {
          transactionNumber: parentTransactionNumber,
        })
        .andWhere('transaction.deletedDate IS NULL')
        .getOne();

      if (caseInsensitiveTransaction) {
        console.error(
          '❌ Transaction found with different case:',
          caseInsensitiveTransaction.transactionNumber,
          'vs requested:',
          parentTransactionNumber,
        );
        throw new NotFoundException(
          `Parent transaction not found. Did you mean "${caseInsensitiveTransaction.transactionNumber}"?`,
        );
      }

      throw new NotFoundException(`Parent transaction "${parentTransactionNumber}" not found`);
    }

    // Get document count for this transaction
    const documentCount = await this._documentRepo.count({
      where: { transactionId: transaction.id, deletedDate: IsNull() },
    });

    // Format response
    return {
      transactionNumber: transaction.transactionNumber,
      status: transaction.stagingId,
      createdAt: transaction.createdDate,
      documentCount,
      services:
        transaction.transactionServices?.map((ts) => ({
          id: ts.id,
          serviceId: ts.serviceId,
          serviceName: ts.service?.name || 'Unknown Service',
          serviceCode: ts.service?.serviceCode || '',
          transactionServiceNumber: ts.transactionServiceNumber,
          status: ts.stagingId,
        })) || [],
    };
  }

  async getRequirementDocuments(
    parentTransactionNumber: string,
    childTransactionNumber: string,
    requirementCode: string,
    filters?: {
      query?: string;
      documentTypes?: string[];
      uploadedAfter?: string;
      uploadedBefore?: string;
    },
  ): Promise<any> {
    /**
     * Developer : Mark Dinglasa
     * Note: `last6digits` is the transaction-number, in the previous transaction the transaction-number is
     *        random generated with a prefix of PTN-{lodge_date}-{random_number} which is not sequencial
     */
    // const strippedParentNumber = this._stripTransactionPrefix(parentTransactionNumber);
    // DO NOT strip child number - transactionServiceNumber is stored in full format
    // const strippedChildNumber = this._stripTransactionPrefix(childTransactionNumber);
    this._logger.log(`Getting requirement documents with filters: ${JSON.stringify(filters)}`);

    // Find parent transaction first - Try exact match
    let parentTransaction = await this._transactionRepo.findOne({
      where: { transactionNumber: parentTransactionNumber, deletedDate: IsNull() },
    });

    if (!parentTransaction) {
      // Fallback to stripped number
      const strippedParentNumber = this._stripTransactionPrefix(parentTransactionNumber);
      if (strippedParentNumber !== parentTransactionNumber) {
        parentTransaction = await this._transactionRepo.findOne({
          where: { transactionNumber: strippedParentNumber, deletedDate: IsNull() },
        });
      }
    }

    if (!parentTransaction) {
      throw new NotFoundException('Parent transaction not found');
    }

    // Find child transaction service
    const childTransaction = await this._transactionRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.transactionServices', 'ts')
      .leftJoinAndSelect('ts.service', 's')
      .leftJoinAndSelect('ts.staging', 'stgChild')
      .leftJoinAndSelect('ts.stagingStatus', 'stgStatus')
      .where('t.id = :parentId', { parentId: parentTransaction.id })
      .andWhere('ts.transactionServiceNumber = :childNumber', {
        childNumber: childTransactionNumber,
      })
      .andWhere('ts.deletedDate IS NULL')
      .getOne();

    if (!childTransaction?.transactionServices?.length) {
      throw new NotFoundException('Child transaction not found');
    }

    const transactionService = childTransaction.transactionServices[0];

    // Find the requirement ID by code (decode URL encoding if needed)
    const decodedRequirementCode = decodeURIComponent(requirementCode);
    this._logger.debug(
      `Searching for requirement by code: "${decodedRequirementCode}" (original: "${requirementCode}")`,
    );

    const requirement = await this._requirementRepo.findOne({
      where: { requirementCode: decodedRequirementCode, deletedDate: IsNull() },
      select: ['id', 'name', 'requirementCode'],
    });

    if (!requirement) {
      throw new NotFoundException(`Requirement with code "${decodedRequirementCode}" not found`);
    }

    this._logger.log(
      `Found requirement: ${requirement.name} (code: ${requirement.requirementCode}, id: ${requirement.id})`,
    );

    // Build query with filters
    const queryBuilder = this._documentRepo
      .createQueryBuilder('doc')
      .leftJoinAndSelect('doc.user', 'user')
      // .leftJoinAndSelect('doc.documentTags', 'documentTag')
      // .leftJoinAndSelect('documentTag.tag', 'tag')
      .leftJoinAndSelect('doc.transactionService', 'ts')
      .leftJoinAndSelect('doc.requirement', 'requirement')
      // .leftJoinAndSelect('ts.service', 'svc')
      // .leftJoinAndSelect('ts.staging', 'stg')
      // .leftJoinAndSelect('ts.stagingStatus', 'stgStatus')
      .where('doc.transactionServiceId = :transactionServiceId', {
        transactionServiceId: transactionService.id,
      })
      .andWhere('requirement.requirementCode LIKE :requirementCode', {
        requirementCode: `%${decodedRequirementCode}%`,
      })
      .andWhere('doc.deletedDate IS NULL');

    // Apply search query filter (search in file name)
    if (filters?.query) {
      queryBuilder.andWhere('(doc.originalFileName LIKE :query OR doc.fileName LIKE :query)', {
        query: `%${filters.query}%`,
      });
    }

    // Apply document type filter
    if (filters?.documentTypes) {
      const documentTypes = Array.isArray(filters.documentTypes)
        ? filters.documentTypes
        : [filters.documentTypes as unknown as string];

      if (documentTypes.length > 0 && !documentTypes.includes('all')) {
        queryBuilder.andWhere('doc.type IN (:...documentTypes)', {
          documentTypes: documentTypes,
        });
      }
    }

    // Apply date range filters
    if (filters?.uploadedAfter) {
      queryBuilder.andWhere('doc.createdDate >= :uploadedAfter', {
        uploadedAfter: new Date(filters.uploadedAfter),
      });
    }

    if (filters?.uploadedBefore) {
      // Add 1 day to include the entire "before" date
      const beforeDate = new Date(filters.uploadedBefore);
      beforeDate.setDate(beforeDate.getDate() + 1);
      queryBuilder.andWhere('doc.createdDate < :uploadedBefore', {
        uploadedBefore: beforeDate,
      });
    }

    // Order by created date
    queryBuilder.orderBy('doc.createdDate', 'DESC');

    const documents = await queryBuilder.getMany();
    this._logger.log(`Found ${documents.length} documents after applying filters`);

    // Filter documents by requirement
    this._logger.log(
      `Found ${documents.length} total documents for transaction service ${transactionService.id}`,
    );
    this._logger.log(`Looking for documents with requirementId: ${requirement.id}`);

    this._logger.debug(
      `Filtered to ${documents.length} documents matching requirement ${requirement.name} (${requirement.id})`,
    );

    // Debug: Show all requirementIds in documents
    const uniqueRequirementIds = [
      ...new Set(documents.map((doc) => doc.requirementId).filter(Boolean)),
    ];
    this._logger.debug(`All requirementIds in documents: ${uniqueRequirementIds.join(', ')}`);

    this._logger.log(`Transaction service staging: ${JSON.stringify(transactionService)}`);
    const serviceStatus =
      transactionService.stagingStatus?.name || transactionService.staging?.name || 'Available';
    const serviceCategory =
      (transactionService.service as any)?.category ||
      (transactionService.service as any)?.type ||
      (transactionService.service as any)?.categoryId ||
      null;
    const serviceUpdated =
      transactionService.updatedDate || (transactionService.service as any)?.updatedDate;

    // Format documents
    const formattedDocuments = documents.map((doc) => ({
      id: doc.id,
      name: doc.originalFileName || 'Unnamed Document',
      documentType: doc.type,
      uploadedAt: doc.createdDate.toISOString(),
      uploadedByName: doc.user
        ? `${doc.user.firstName} ${doc.user.lastName}`.trim()
        : 'Unknown User',
      uploadedByUserId: doc.user?.id || 'unknown',
      uploadedByUserEmail: doc.user?.email || 'unknown@example.com',
      uploadedByUserUsername: doc.user?.username || '--',
      transactionId: doc.transactionId,
      fileSize: `${Math.round(doc.fileSize / 1024)}KB`,
      fileType: doc.type,
      status: serviceStatus,
      statusDate: serviceUpdated || doc.updatedDate || doc.createdDate,
      size: doc.fileSize,
      mimeType: doc.type,
      serviceName: transactionService.service?.name || 'Unknown Service',
      serviceCategory: serviceCategory || doc.category,
      category: serviceCategory || doc.category || null,
      categories: serviceCategory ? [serviceCategory] : doc.category || [],
      requirementName: requirement.name,
      OCRStatus: doc.ocrProcessed ? 'Completed' : 'Pending',
      tags: (doc.documentTags || []).map((dt) => dt.tag?.name).filter((t): t is string => !!t),
    }));

    return {
      requirementName: requirement.name,
      documents: formattedDocuments,
    };
  }

  async getChildTransactionDetails(
    parentTransactionNumber: string,
    childTransactionNumber: string,
  ): Promise<any> {
    // Find parent transaction first
    /**
     * Developer : Mark Dinglasa
     * Note: `last6digits` is the transaction-number, in the previous transaction the transaction-number is
     *        random generated with a prefix of PTN-{lodge_date}-{random_number} which is not sequencial
     */
    // const strippedParentNumber = this._stripTransactionPrefix(parentTransactionNumber);
    // DO NOT strip child number - transactionServiceNumber is stored in full format
    // const strippedChildNumber = this._stripTransactionPrefix(childTransactionNumber);

    let parentTransaction = await this._transactionRepo.findOne({
      where: { transactionNumber: parentTransactionNumber, deletedDate: IsNull() },
    });

    if (!parentTransaction) {
      // Fallback
      const strippedParentNumber = this._stripTransactionPrefix(parentTransactionNumber);
      if (strippedParentNumber !== parentTransactionNumber) {
        parentTransaction = await this._transactionRepo.findOne({
          where: { transactionNumber: strippedParentNumber, deletedDate: IsNull() },
        });
      }
    }

    if (!parentTransaction) {
      throw new NotFoundException('Parent transaction not found');
    }

    // Find child transaction service
    // Note: transactionServiceNumber is stored in full format (e.g., PTN-20260203-000002-000001)
    // unlike parent transactionNumber which stores only the last 6 digits
    const childTransaction = await this._transactionRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.transactionServices', 'ts')
      .leftJoinAndSelect('ts.service', 's')
      .where('t.id = :parentId', { parentId: parentTransaction.id })
      .andWhere('ts.transactionServiceNumber = :childNumber', {
        childNumber: childTransactionNumber,
      })
      .andWhere('ts.deletedDate IS NULL')
      .getOne();

    if (!childTransaction?.transactionServices?.length) {
      throw new NotFoundException('Child transaction not found');
    }

    const transactionService = childTransaction.transactionServices[0];

    // Get ALL documents for this transaction service
    const allDocuments = await this._documentRepo.find({
      where: {
        transactionServiceId: transactionService.id,
        deletedDate: IsNull(),
      },
      relations: ['user'],
      order: { createdDate: 'DESC' },
    });

    // Filter to only include requirement documents (those with a requirementId)
    // Output and supporting documents will be fetched via their own endpoints
    const documents = allDocuments.filter((doc) => doc.requirementId != null);

    // Count output and supporting documents
    const outputDocumentCount = allDocuments.filter(
      (doc) => doc.category === 'OUTPUT_DOCUMENT' && doc.requirementId == null,
    ).length;

    const supportingDocumentCount = allDocuments.filter(
      (doc) => doc.category === 'SUPPORTING_DOCUMENT' && doc.requirementId == null,
    ).length;

    // Group documents by requirementId to get counts
    const requirementCounts = new Map<string, number>();
    const requirementIds = new Set<string>();

    for (const doc of documents) {
      const requirementId = doc.requirementId || 'unknown';
      requirementCounts.set(requirementId, (requirementCounts.get(requirementId) || 0) + 1);
      if (requirementId !== 'unknown') {
        requirementIds.add(requirementId);
      }
    }

    // Get requirement names and codes
    const requirements = await this._requirementRepo.find({
      where: Array.from(requirementIds).length > 0 ? { id: In(Array.from(requirementIds)) } : {},
      select: ['id', 'name', 'requirementCode'],
    });

    const requirementNameMap = new Map(requirements.map((req) => [req.id, req.name]));

    // Create requirement code map
    const requirementCodeMap = new Map(requirements.map((req) => [req.id, req.requirementCode]));

    this._logger.debug(`Processing ${requirementCounts.size} requirement groups`);
    this._logger.debug(
      `Requirement counts: ${Array.from(requirementCounts.entries())
        .map(([id, count]) => `${id}:${count}`)
        .join(', ')}`,
    );

    // Format requirements with just names, codes and counts (no documents)
    // Filter out 'unknown' requirements as they should be output/supporting documents
    const formattedRequirements = Array.from(requirementCounts.entries())
      .filter(([requirementId]) => requirementId !== 'unknown')
      .map(([requirementId, count]) => {
        const name = requirementNameMap.get(requirementId) || 'Unknown Requirement';
        const code = requirementCodeMap.get(requirementId) || null;

        return {
          requirementName: name,
          requirementCode: code,
          documentCount: count,
        };
      });

    return {
      childTransactionNumber,
      serviceName: transactionService.service?.name || 'Unknown Service',
      transactionServiceId: transactionService.id,
      outputDocumentCount,
      supportingDocumentCount,
      requirements: formattedRequirements,
    };
  }

  // List View Method
  async getListView(
    filters: DocumentListFilter,
    userId: string,
  ): Promise<{ data: DocumentEntity[]; meta: CustomMeta }> {
    const user = await this._userRepo.findOne({
      where: { id: userId, deletedDate: IsNull() },
      withDeleted: false,
      relations: ['userCompanies', 'userCompanies.company'],
    });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_ACCEPTABLE);

    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    // Build query builder for complex filtering
    const queryBuilder = this._documentRepo
      .createQueryBuilder('document')
      .leftJoinAndSelect('document.user', 'uploader', 'uploader.deletedDate IS NULL')
      .leftJoinAndSelect('document.transaction', 'transaction', 'transaction.deletedDate IS NULL')
      .leftJoinAndSelect('transaction.user', 'user', 'user.deletedDate IS NULL')
      .leftJoinAndSelect(
        'transaction.staging',
        'pst',
        "pst.deletedDate IS NULL AND pst.code <>'DRAFT'",
      )
      .leftJoinAndSelect('user.userCompanies', 'userCompany', 'userCompany.deletedDate IS NULL')
      .leftJoinAndSelect('userCompany.company', 'company', 'company.deletedDate IS NULL')
      .leftJoinAndSelect('document.documentTags', 'documentTag', 'documentTag.deletedDate IS NULL')
      .leftJoinAndSelect('documentTag.tag', 'tag', 'tag.deletedDate IS NULL')
      .leftJoinAndSelect(
        'document.transactionService',
        'transactionService',
        ' transactionService.deletedDate IS NULL',
      )
      .leftJoinAndSelect(
        'transactionService.transaction',
        'parentTransaction',
        'parentTransaction.deletedDate IS NULL',
      )
      .leftJoinAndSelect('transactionService.service', 'service', 'service.deletedDate IS NULL')
      .leftJoinAndSelect('transactionService.staging', 'staging', 'staging.deletedDate IS NULL')
      .leftJoinAndSelect('document.requirement', 'requirement', 'requirement.deletedDate IS NULL')
      .where('document.deletedDate IS NULL');

    this._applyListViewPermissions(queryBuilder, user);
    this._applyListViewFilters(queryBuilder, filters);
    this._applyListViewSorting(queryBuilder, filters);

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination and get results
    const documents = await queryBuilder.skip(skip).take(limit).getMany();

    // Format documents to match mock API response
    const formattedDocuments = documents.map((doc) => this._formatListViewDocument(doc));

    return {
      data: formattedDocuments as unknown as DocumentEntity[],
      meta: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
        limit,
      },
    };
  }

  private _applyListViewPermissions(
    queryBuilder: SelectQueryBuilder<DocumentEntity>,
    user: UserEntity,
  ): void {
    if (user.type === USER_TYPE.INDIVIDUAL) {
      queryBuilder.andWhere('transaction.userId = :userId', { userId: user.id });
    } else if (user.type === USER_TYPE.CORPORATE) {
      queryBuilder.andWhere('company.id IN (:...companyIds)', {
        companyIds: user?.userCompanies?.map((uc) => uc?.companyId) || [],
      });
    }
  }

  private _applyListViewFilters(
    queryBuilder: SelectQueryBuilder<DocumentEntity>,
    filters: DocumentListFilter,
  ): void {
    if (filters.search) {
      const search = filters.search.toLowerCase();
      queryBuilder.andWhere(
        "(document.originalFileName LIKE :search OR document.type LIKE :search OR CONCAT(uploader.firstName, ' ', uploader.lastName) LIKE :search OR transaction.transactionNumber LIKE :search OR company.entityCode LIKE :search)",
        { search: `%${search}%` },
      );
    }

    const documentTypes = this._normalizeArrayFilter(filters.types);
    if (documentTypes.length > 0) {
      queryBuilder.andWhere('document.type IN (:...documentTypes)', {
        documentTypes: documentTypes,
      });
    }

    if (filters.transactionNumber) {
      queryBuilder.andWhere('transaction.transactionNumber LIKE :tx', {
        tx: `%${filters.transactionNumber}%`,
      });
    }

    const uploadedBy = this._normalizeArrayFilter(filters.uploadedBy);
    if (uploadedBy.length > 0) {
      queryBuilder.andWhere('uploader.id IN (:...uploadedBy)', {
        uploadedBy: uploadedBy,
      });
    }

    const dateFrom = filters.fromDate || null;
    let dateTo = filters.toDate || null;

    if (dateFrom && !dateTo) {
      dateTo = new Date().toISOString().split('T')[0];
    }

    if (dateTo) {
      dateTo = `${dateTo} 23:59:59`;
    }

    if (dateFrom) {
      queryBuilder.andWhere('document.createdDate >= :after', {
        after: dateFrom,
      });
    }

    if (dateTo) {
      queryBuilder.andWhere('document.createdDate <= :before', {
        before: dateTo,
      });
    }

    if (filters.entityCode && filters.entityCode !== 'all') {
      queryBuilder.andWhere('company.entityCode = :entityCode', { entityCode: filters.entityCode });
    }

    if (filters.userType) {
      // Map frontend filter values to USER_TYPE enum values
      // Filter directly on user.type field instead of role relationships
      // This ensures all users of the specified type are included regardless of role assignments
      const userTypeMap: Record<string, USER_TYPE> = {
        Individual: USER_TYPE.INDIVIDUAL,
        Corporate: USER_TYPE.CORPORATE,
      };

      const userType = userTypeMap[filters.userType];
      if (userType) {
        // Filter on the user's type field directly (transaction owner's type)
        queryBuilder.andWhere('user.type = :userType', { userType });
      }
    }
  }

  private _normalizeArrayFilter(value: string | string[] | undefined): string[] {
    if (!value) return [];
    return (Array.isArray(value) ? value : [value]).filter((v) => v && v !== 'all');
  }

  private _applyListViewSorting(
    queryBuilder: SelectQueryBuilder<DocumentEntity>,
    filters: DocumentListFilter,
  ): void {
    const sortBy = filters.sortBy || 'all';
    const sortDirection = (filters.sortDirection as 'ASC' | 'DESC') || 'DESC';
    let sortField = 'document.createdDate';

    const sortFieldMap: Record<string, string> = {
      fileName: 'document.originalFileName',
      size: 'document.fileSize',
      document: 'document.category',
      uploadedDate: 'document.createdDate',
      transactionNumber: 'transaction.transactionNumber',
    };

    if (sortBy === 'type') {
      const typeCase = `CASE 
        WHEN LOWER(document.type) LIKE '%pdf%' THEN 'PDF Document'
        WHEN LOWER(document.type) LIKE '%word%' OR LOWER(document.type) LIKE '%doc%' THEN 'Word Document'
        WHEN LOWER(document.type) LIKE '%excel%' OR LOWER(document.type) LIKE '%xls%' THEN 'Excel Spreadsheet'
        WHEN LOWER(document.type) LIKE '%powerpoint%' OR LOWER(document.type) LIKE '%ppt%' THEN 'PowerPoint Presentation'
        WHEN LOWER(document.type) LIKE '%jpeg%' OR LOWER(document.type) LIKE '%jpg%' THEN 'JPEG'
        WHEN LOWER(document.type) LIKE '%png%' THEN 'PNG'
        WHEN LOWER(document.type) LIKE '%gif%' THEN 'GIF'
        WHEN LOWER(document.type) LIKE '%bmp%' THEN 'BMP'
        WHEN LOWER(document.type) LIKE '%tiff%' THEN 'TIFF'
        WHEN LOWER(document.type) LIKE '%webp%' THEN 'WebP'
        WHEN LOWER(document.type) LIKE '%svg%' THEN 'SVG'
        WHEN LOWER(document.type) LIKE '%text/plain%' OR LOWER(document.type) = 'txt' THEN 'Text Document'
        WHEN LOWER(document.type) LIKE '%csv%' THEN 'CSV File'
        WHEN LOWER(document.type) LIKE '%zip%' THEN 'ZIP Archive'
        WHEN LOWER(document.type) LIKE '%rar%' THEN 'RAR Archive'
        WHEN LOWER(document.type) LIKE '%7z%' THEN '7Z Archive'
        WHEN LOWER(document.type) LIKE '%json%' THEN 'JSON File'
        WHEN LOWER(document.type) LIKE '%xml%' THEN 'XML File'
        WHEN LOWER(document.type) LIKE '%html%' THEN 'HTML Document'
        WHEN LOWER(document.type) LIKE '%css%' THEN 'CSS File'
        WHEN LOWER(document.type) LIKE '%javascript%' OR LOWER(document.type) = 'js' THEN 'JavaScript File'
        ELSE document.type
      END`;

      queryBuilder
        .addSelect(`CASE WHEN document.type IS NULL THEN 1 ELSE 0 END`, 'sort_null_priority')
        .addSelect(`(${typeCase})`, 'sort_type_value')
        .orderBy('sort_null_priority', 'ASC')
        .addOrderBy('sort_type_value', sortDirection);
    } else if (sortBy === 'uploadedByName') {
      queryBuilder
        .addSelect(`CASE WHEN uploader.firstName IS NULL THEN 1 ELSE 0 END`, 'sort_null_priority')
        .addSelect(`CONCAT(uploader.firstName, ' ', uploader.lastName)`, 'sort_uploader_name')
        .orderBy('sort_null_priority', 'ASC')
        .addOrderBy('sort_uploader_name', sortDirection);
    } else {
      if (sortFieldMap[sortBy]) {
        sortField = sortFieldMap[sortBy];
      }

      queryBuilder
        .addSelect(`CASE WHEN ${sortField} IS NULL THEN 1 ELSE 0 END`, 'sort_null_priority')
        .orderBy('sort_null_priority', 'ASC')
        .addOrderBy(sortField, sortDirection);
    }
  }

  private _formatListViewDocument(doc: DocumentEntity): any {
    const serviceName = doc.transactionService?.service?.name || null;
    const documentCategory =
      doc.category ||
      (doc.transactionService?.service as any)?.category ||
      (doc.transactionService?.service as any)?.type ||
      null;

    const serviceStatus =
      doc.transactionService?.staging?.name ||
      (doc.transactionService?.stagingId ? String(doc.transactionService.stagingId) : 'Available');

    const requirementName = doc.requirement?.name || null;
    const childTransactionNumber = doc.transactionService?.transactionServiceNumber || null;

    return {
      id: doc.id,
      name: doc.originalFileName || 'Unnamed Document',
      documentType: doc.type as any,
      categories: documentCategory ? [documentCategory] : [],
      uploadedAt: doc.createdDate.toISOString(),
      uploadedByName: doc.user
        ? `${doc.user.firstName} ${doc.user.lastName}`.trim()
        : 'Unknown User',
      uploadedByUserId: doc.user?.id || 'unknown',
      uploadedByUserEmail: doc.user?.email || 'unknown@example.com',
      uploadedByUserUsername: doc.user?.username || '--',
      transactionId: doc.transactionId,
      fileSize: `${Math.round(doc.fileSize / 1024)}KB`,
      fileType: formatFileType(doc.type),
      parentTransactionNumber:
        doc.transaction?.transactionNumber ||
        doc?.transactionService?.transactionServiceNumber?.substring(
          0,
          doc?.transactionService?.transactionServiceNumber.length - 7,
        ) ||
        null,
      childTransactionNumber: childTransactionNumber,
      serviceName: serviceName,
      linkedServiceName: serviceName,
      requirementName: requirementName,
      OCRStatus: doc.ocrProcessed ? 'Completed' : 'Pending',
      status: serviceStatus,
      statusDate: doc.transactionService?.updatedDate || doc.updatedDate || doc.createdDate,
      size: doc.fileSize,
      mimeType: doc.type,
      category: documentCategory,
      entityCode: doc?.transaction?.user?.userCompanies?.[0]?.company?.entityCode || null,
    };
  }

  // Tags Methods - Note: These are kept for backwards compatibility
  // For user-personalized tags, use the Tag module endpoints
  async getTags() {
    // Query all tags with usage counts
    const tags = await this._tagRepo
      .createQueryBuilder('tag')
      .select(['tag.id', 'tag.name', 'tag.colorHex', 'tag.description', 'tag.userId'])
      .addSelect((subQuery) => {
        return subQuery
          .select('COUNT(dt.id)', 'usageCount')
          .from(DocumentTagEntity, 'dt')
          .where('dt.tagId = tag.id')
          .andWhere('dt.deletedDate IS NULL');
      }, 'usageCount')
      .where('tag.deletedDate IS NULL')
      .orderBy('usageCount', 'DESC')
      .getRawAndEntities();

    const result = tags.entities.map((tag, index) => ({
      id: tag.id,
      name: tag.name,
      color: tag.colorHex,
      description: tag.description,
      usageCount: Number.parseInt(tags.raw[index]?.usageCount || '0', 10),
    }));

    return { tags: result };
  }

  async createTag(body: { name: string; color?: string; description?: string }, userId: string) {
    // Create a user-specific tag
    const tag = this._tagRepo.create({
      name: body.name,
      colorHex: body.color || '#3B82F6',
      description: body.description || null,
      userId: userId,
      createdBy: userId,
    });

    const saved = await this._tagRepo.save(tag);
    this._logger.log(`Created tag "${saved.name}" with ID: ${saved.id} for user ${userId}`);

    const result = {
      id: saved.id,
      name: saved.name,
      color: saved.colorHex,
      description: saved.description,
      usageCount: 0,
    };

    this._logger.log(`Returning tag object: ${JSON.stringify(result)}`);
    return result;
  }

  async updateTag(body: { id: string; name?: string; color?: string; description?: string }) {
    const tag = await this._tagRepo.findOne({
      where: { id: body.id, deletedDate: IsNull() },
    });

    if (!tag) {
      throw new NotFoundException(`Tag with ID ${body.id} not found`);
    }

    if (body.name !== undefined) tag.name = body.name;
    if (body.color !== undefined) tag.colorHex = body.color;
    if (body.description !== undefined) tag.description = body.description;

    const updated = await this._tagRepo.save(tag);
    this._logger.log(`Updated tag ${updated.id}`);

    return {
      id: updated.id,
      name: updated.name,
      color: updated.colorHex,
      description: updated.description,
    };
  }

  async deleteTag(id: string) {
    const tag = await this._tagRepo.findOne({
      where: { id, deletedDate: IsNull() },
    });

    if (!tag) {
      throw new NotFoundException(`Tag with ID ${id} not found`);
    }

    // Soft delete all document-tag associations
    await this._documentTagRepo.update(
      { tagId: id, deletedDate: IsNull() },
      { deletedDate: new Date() },
    );

    // Soft delete the tag
    await this._tagRepo.softDelete(id);
    this._logger.log(`Deleted tag ${id}`);

    return { success: true };
  }

  // Document-Tag Association Methods
  async addTagToDocument(
    documentId: string,
    tagId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    // Verify document exists
    const document = await this._documentRepo.findOne({
      where: { id: documentId, deletedDate: IsNull() },
    });
    if (!document) {
      throw new NotFoundException(`Document with ID ${documentId} not found`);
    }

    // Verify tag exists (optionally check if it belongs to user when userId is valid)
    const tagWhereClause: any = { id: tagId, deletedDate: IsNull() };
    if (this.isValidUUID(userId)) {
      tagWhereClause.userId = userId;
    }
    const tag = await this._tagRepo.findOne({
      where: tagWhereClause,
    });
    if (!tag) {
      throw new NotFoundException(`Tag with ID ${tagId} not found`);
    }

    // Check if association already exists
    const existing = await this._documentTagRepo.findOne({
      where: { documentId, tagId, deletedDate: IsNull() },
    });
    if (existing) {
      throw new BadRequestException('Tag is already assigned to this document');
    }

    // Create association
    const documentTag = this._documentTagRepo.create({
      documentId,
      tagId,
    });
    await this._documentTagRepo.save(documentTag);

    this._logger.log(`Added tag ${tagId} to document ${documentId}`);
    return { success: true, message: 'Tag added to document successfully' };
  }

  async removeTagFromDocument(
    documentId: string,
    tagId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    // Find the association
    const documentTag = await this._documentTagRepo.findOne({
      where: { documentId, tagId, deletedDate: IsNull() },
    });

    if (!documentTag) {
      throw new NotFoundException('Tag is not assigned to this document');
    }

    // Soft delete the association
    documentTag.deletedDate = new Date();
    await this._documentTagRepo.save(documentTag);

    this._logger.log(`Removed tag ${tagId} from document ${documentId}`);
    return { success: true, message: 'Tag removed from document successfully' };
  }

  async bulkAddTags(
    documentIds: string[],
    tagIds: string[],
    userId: string,
  ): Promise<{ success: boolean; documentsUpdated: number; tagsAdded: number }> {
    let documentsUpdated = 0;
    let tagsAdded = 0;

    // Verify all tags exist (optionally filter by user when userId is valid)
    const tagWhereClause: any = { id: In(tagIds), deletedDate: IsNull() };
    if (this.isValidUUID(userId)) {
      tagWhereClause.userId = userId;
    }
    const tags = await this._tagRepo.find({
      where: tagWhereClause,
    });

    const validTagIds = tags.map((t) => t.id);

    for (const documentId of documentIds) {
      // Verify document exists
      const document = await this._documentRepo.findOne({
        where: { id: documentId, deletedDate: IsNull() },
      });
      if (!document) continue;

      let documentUpdated = false;
      for (const tagId of validTagIds) {
        // Check if association exists
        const existing = await this._documentTagRepo.findOne({
          where: { documentId, tagId, deletedDate: IsNull() },
        });
        if (existing) continue;

        // Create association
        const documentTag = this._documentTagRepo.create({
          documentId,
          tagId,
        });
        await this._documentTagRepo.save(documentTag);
        tagsAdded++;
        documentUpdated = true;
      }
      if (documentUpdated) documentsUpdated++;
    }

    this._logger.log(`Bulk added ${tagsAdded} tags to ${documentsUpdated} documents`);
    return { success: true, documentsUpdated, tagsAdded };
  }

  async getDocumentTags(documentId: string): Promise<{ tags: any[] }> {
    // Verify document exists
    const document = await this._documentRepo.findOne({
      where: { id: documentId, deletedDate: IsNull() },
    });
    if (!document) {
      throw new NotFoundException(`Document with ID ${documentId} not found`);
    }

    // Get all tags for this document
    const documentTags = await this._documentTagRepo.find({
      where: { documentId, deletedDate: IsNull() },
      relations: ['tag'],
    });

    const tags = documentTags
      .filter((dt) => dt.tag && !dt.tag.deletedDate)
      .map((dt) => ({
        id: dt.tag.id,
        name: dt.tag.name,
        color: dt.tag.colorHex,
        description: dt.tag.description,
      }));

    return { tags };
  }

  // ============================================================================
  // Document Category Methods
  // ============================================================================

  /**
   * Get requirement documents grouped by requirement for a transaction service
   */
  async getRequirementDocumentsByService(
    transactionServiceId: string,
  ): Promise<{ requirements: any[] }> {
    const documents = await this._documentRepo.find({
      where: {
        transactionServiceId,
        category: 'REQUIREMENT',
        deletedDate: IsNull(),
      },
      relations: ['requirement', 'user', 'transaction'],
      order: {
        createdDate: 'DESC',
      },
    });

    // Group documents by requirement
    const requirementMap = new Map<string, any>();

    for (const doc of documents) {
      if (!doc.requirement) continue;

      const reqId = doc.requirement.id;
      if (!requirementMap.has(reqId)) {
        requirementMap.set(reqId, {
          requirementId: reqId,
          requirementName: doc.requirement.name,
          requirementCode: doc.requirement.requirementCode,
          requirementType: doc.requirement.type,
          documents: [],
        });
      }

      requirementMap.get(reqId).documents.push({
        id: doc.id,
        fileURL: doc.fileURL,
        originalFileName: doc.originalFileName,
        type: doc.type,
        fileSize: doc.fileSize,
        notes: doc.notes,
        uploadedBy: doc.user ? doc.user.id : 'unknown',
        uploadedByName: doc.user
          ? `${doc.user.firstName} ${doc.user.lastName}`.trim()
          : 'Unknown User',
        uploadedByUserEmail: doc.user?.email || '',
        uploadedByUserUsername: doc.user?.username || '--',
        transactionId: doc.transactionId,
        uploadedAt: doc.createdDate.toISOString(),
      });
    }

    return {
      requirements: Array.from(requirementMap.values()),
    };
  }

  /**
   * Get supporting documents for a transaction service
   */
  async getSupportingDocumentsByService(transactionServiceId: string): Promise<DocumentEntity[]> {
    return await this._documentRepo.find({
      where: {
        transactionServiceId,
        category: 'SUPPORTING_DOCUMENT',
        requirementId: IsNull(),
        deletedDate: IsNull(),
      },
      relations: [
        'user',
        'transactionService',
        'transactionService.service',
        'transactionService.staging',
        'transactionService.stagingStatus',
      ],
      order: {
        createdDate: 'DESC',
      },
    });
  }

  /**
   * Get output documents for a transaction service
   */
  async getOutputDocumentsByService(transactionServiceId: string): Promise<DocumentEntity[]> {
    return await this._documentRepo.find({
      where: {
        transactionServiceId,
        category: 'OUTPUT_DOCUMENT',
        requirementId: IsNull(),
        deletedDate: IsNull(),
      },
      relations: [
        'user',
        'transactionService',
        'transactionService.service',
        'transactionService.staging',
        'transactionService.stagingStatus',
      ],
      order: {
        createdDate: 'DESC',
      },
    });
  }

  /**
   * Get EOS documents for a transaction
   */
  async getEOSDocumentsByTransaction(transactionId: string): Promise<DocumentEntity[]> {
    return await this._documentRepo.find({
      where: {
        transactionId,
        category: 'EOS',
        transactionServiceId: IsNull(),
        deletedDate: IsNull(),
      },
      relations: ['user', 'transaction', 'documentTags', 'documentTags.tag'],
      order: {
        createdDate: 'DESC',
      },
    });
  }

  /**
   * Get receipt documents for a transaction
   */
  async getReceiptDocumentsByTransaction(transactionId: string): Promise<DocumentEntity[]> {
    return await this._documentRepo.find({
      where: {
        transactionId,
        category: 'RECEIPT',
        transactionServiceId: IsNull(),
        deletedDate: IsNull(),
      },
      relations: ['user', 'transaction', 'documentTags', 'documentTags.tag'],
      order: {
        createdDate: 'DESC',
      },
    });
  }

  /**
   * Get recipient ID documents for a transaction
   * These are Government IDs uploaded during transaction attestation
   */
  async getRecipientIdDocumentsByTransaction(transactionId: string): Promise<DocumentEntity[]> {
    return await this._documentRepo.find({
      where: {
        transactionId,
        category: 'RECIPIENT_ID',
        deletedDate: IsNull(),
      },
      relations: ['user', 'transaction', 'documentTags', 'documentTags.tag'],
      order: {
        createdDate: 'DESC',
      },
    });
  }
}
