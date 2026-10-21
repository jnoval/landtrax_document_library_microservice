import { Brackets, IsNull, Repository, SelectQueryBuilder } from 'typeorm';
import {
  DefaultRoles,
  DocumentCategory,
  TransactionType,
  USER_TYPE,
} from '../../../../shared/common/app-enums.js';
import { CustomMeta } from '../../../../shared/common/meta.js';
import DocumentEntity from '../../../../shared/infrastructure/database/entities/document.entity.js';
import RecipientEntity from '../../../../shared/infrastructure/database/entities/recipient.entity.js';
import TransactionServiceEntity from '../../../../shared/infrastructure/database/entities/transaction-service.entity.js';
import TransactionEntity from '../../../../shared/infrastructure/database/entities/transaction.entity.js';
import UserEntity from '../../../../shared/infrastructure/database/entities/user.entity.js';

interface GetTreeViewParams {
  userId: string;
  page?: number;
  limit?: number;
  search?: string;
  userRepo: Repository<UserEntity>;
  documentRepo: Repository<DocumentEntity>;
  transactionRepo: Repository<TransactionEntity>;
}

export interface TDocument {
  id: string;
  fileURL: string;
  category: string;
  fileName: string;
  fileSize: string; // in MB
  type: string;
  createdDate: string;
  uploadedBy: string;
}

export interface StandardView {
  title: string;
  documents: TDocument[];
  documentCount: number;
}

export interface ServiceView {
  title: string;
  transactionServiceNumber: string;
  serviceCount: number;

  outputDocuments: StandardView;
  requirements: StandardView[];
  otherFiles: StandardView;
  podDocuments: StandardView;
  supportingDocuments: StandardView;
}

export interface TransactionView {
  transactionId: string;
  transactionNumber: string;
  serviceCount: number;
  documentCount: number;
  services: ServiceView[];
  receipts: StandardView;
  recipients: StandardView;
  eos?: StandardView;
}

// ─── Generic Helpers ─────────────────────────────────────────────────

function groupBy<T>(items: T[], keyFn: (item: T) => string | undefined | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)?.push(item);
  }
  return map;
}

// ─── Transformation Helpers ──────────────────────────────────────────

function transformToTDocument(doc: DocumentEntity): TDocument {
  const uploaderFirstName = doc.user?.firstName ?? '';
  const uploaderLastName = doc.user?.lastName ?? '';
  const uploadedBy = `${uploaderFirstName} ${uploaderLastName}`.trim() || 'Unknown';

  const fileSizeInMB =
    doc.fileSize == null ? '0.00' : (Number(doc.fileSize) / (1024 * 1024)).toFixed(2);

  return {
    id: doc.id,
    fileURL: doc.fileURL,
    category: doc.category,
    fileName: doc.originalFileName ?? '',
    fileSize: fileSizeInMB,
    type: doc.type,
    createdDate: (doc as any).convertedCreatedDate ?? doc.createdDate?.toISOString?.() ?? '',
    uploadedBy,
  };
}

function buildStandardView(title: string, documents: DocumentEntity[]): StandardView {
  const tDocuments = documents.map(transformToTDocument);
  return {
    title,
    documents: tDocuments,
    documentCount: tDocuments.length,
  };
}

function buildServiceView(ts: TransactionServiceEntity): ServiceView {
  const docs = (ts.documents ?? []).filter((d) => !d.deletedDate);

  const requirementDocs: DocumentEntity[] = [];
  const outputDocs: DocumentEntity[] = [];
  const podDocs: DocumentEntity[] = [];
  const otherDocs: DocumentEntity[] = [];
  const supDocs: DocumentEntity[] = [];

  for (const doc of docs) {
    switch (doc.category) {
      case DocumentCategory.REQUIREMENT:
        requirementDocs.push(doc);
        break;
      case DocumentCategory.OUTPUT_DOCUMENT:
        outputDocs.push(doc);
        break;
      case DocumentCategory.POD:
      case DocumentCategory.PROOF_OF_DELIVERY:
        podDocs.push(doc);
        break;
      case DocumentCategory.SUPPORTING_DOCUMENT:
        supDocs.push(doc);
        break;
      case DocumentCategory.OTHER_FILES:
      case DocumentCategory.OTHER:
      case DocumentCategory.CERTIFICATE:
      default:
        otherDocs.push(doc);
        break;
    }
  }

  const allServiceDocCount =
    requirementDocs.length + outputDocs.length + podDocs.length + otherDocs.length;

  const requirementDocsGrouped = groupBy(
    requirementDocs,
    (d) => d.requirement?.name || 'Unknown Requirement',
  );

  const requirementsArray: StandardView[] = [];
  for (const [reqName, reqGroupDocs] of requirementDocsGrouped.entries()) {
    requirementsArray.push(buildStandardView(reqName, reqGroupDocs));
  }

  return {
    title: (ts as any).service?.name ?? (ts as any).serviceName ?? 'Unknown Service',
    transactionServiceNumber: ts.transactionServiceNumber,
    serviceCount: allServiceDocCount,

    requirements: requirementsArray,
    outputDocuments: buildStandardView('Output Documents', outputDocs),
    podDocuments: buildStandardView('Proof of Delivery', podDocs),
    otherFiles: buildStandardView('Other Files', otherDocs),
    supportingDocuments: buildStandardView('Supporting Documents', supDocs),
  };
}

function buildTransactionView(transaction: TransactionEntity): TransactionView {
  const transactionDocs = (transaction.documents ?? []).filter((d) => !d.deletedDate);

  const receiptDocs: DocumentEntity[] = [];
  const eosDocs: DocumentEntity[] = [];

  for (const doc of transactionDocs) {
    switch (doc.category) {
      case DocumentCategory.RECEIPT:
        receiptDocs.push(doc);
        break;
      case DocumentCategory.EOS:
        eosDocs.push(doc);
        break;
    }
  }

  const recipientDocs = ((transaction as any).recipients ?? [])
    .filter((r: any) => !r.deletedDate)
    .flatMap((r: any) => r.recipientDocuments ?? [])
    .filter((rd: any) => !rd.deletedDate && rd.document && !rd.document.deletedDate)
    .map((rd: any) => rd.document);

  const activeServices = (transaction.transactionServices ?? []).filter(
    (ts) => !ts.deletedDate && !ts.isEOS,
  );
  const services = activeServices.map(buildServiceView);

  const totalDocumentCount =
    receiptDocs.length +
    eosDocs.length +
    recipientDocs.length +
    services.reduce((acc, s) => acc + (s.podDocuments?.documentCount || 0), 0) +
    services.reduce((acc, s) => acc + (s.otherFiles?.documentCount || 0), 0) +
    services.reduce((acc, s) => acc + (s.supportingDocuments?.documentCount || 0), 0) +
    services.reduce(
      (acc, s) => acc + s.requirements.reduce((acc, r) => acc + (r?.documentCount || 0), 0),
      0,
    ) +
    services.reduce((acc, s) => acc + (s.outputDocuments?.documentCount || 0), 0);

  const data: TransactionView = {
    transactionId: transaction.id,
    transactionNumber: transaction.transactionNumber ?? '',
    serviceCount: services.length,
    documentCount: totalDocumentCount,
    services,
    receipts: buildStandardView('Receipts', receiptDocs),
    recipients: buildStandardView('Recipients', recipientDocs),
  };

  if (transaction.type !== TransactionType.B2C) {
    data.eos = buildStandardView('EOS', eosDocs);
  }

  return data;
}

// ─── Query Builders ───────────────────────────────────────────────────

function getBaseTransactionQuery(
  transactionRepo: Repository<TransactionEntity>,
  user: UserEntity,
  search?: string,
  includeRelations: boolean = true,
): SelectQueryBuilder<TransactionEntity> {
  const queryBuilder = transactionRepo
    .createQueryBuilder('t')
    .where('t.deletedDate IS NULL AND t.deletedBy IS NULL');

  if (includeRelations) {
    queryBuilder.leftJoinAndSelect(
      't.staging',
      'st',
      'st.deletedDate IS NULL AND st.deletedBy IS NULL',
    );
    queryBuilder.leftJoinAndSelect('t.user', 'u', 'u.deletedDate IS NULL');
  } else {
    queryBuilder.leftJoin('t.staging', 'st', 'st.deletedDate IS NULL AND st.deletedBy IS NULL');
    queryBuilder.leftJoin('t.user', 'u', 'u.deletedDate IS NULL');
  }

  if (search) {
    queryBuilder.andWhere('t.transactionNumber LIKE :search', {
      search: `%${search}%`,
    });
  }

  if (user.type === USER_TYPE.ADMINISTRATOR) {
    // Exclude client's drafts
    queryBuilder.andWhere('((t.type NOT IN (:...excludeTypes) OR st.code <> :draftCode))', {
      excludeTypes: ['B2B_SS', 'B2B_SS_PO', 'B2C'],
      draftCode: 'DRAFT',
    });
  } else if (user.type === USER_TYPE.CORPORATE && (user as any).mainRole === DefaultRoles.CORPORATE_ADMIN) {
    const userCompanyIds = user.userCompanies?.map((uc) => uc.companyId) || [];

    if (userCompanyIds.length > 0) {
      queryBuilder.leftJoin('u.userCompanies', 'uc', 'uc.deletedDate IS NULL');

      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('u.id = :userId', { userId: user.id });
          qb.orWhere('uc.companyId IN (:...userCompanyIds)', { userCompanyIds });
        }),
      );
    } else {
      queryBuilder.andWhere('u.id = :userId', { userId: user.id });
    }
  } else {
    queryBuilder.andWhere('u.id = :userId', { userId: user.id });
  }

  return queryBuilder;
}

// ─── Main Function ───────────────────────────────────────────────────

export default async function GetTreeView(
  params: GetTreeViewParams,
): Promise<{ data: TransactionView[]; meta: CustomMeta }> {
  const { userId, page = 1, limit = 10, search, userRepo, transactionRepo } = params;

  const user = await userRepo.findOne({
    where: { id: userId, deletedDate: IsNull() },
    withDeleted: false,
    relations: ['userRoles', 'userRoles.role', 'userCompanies', 'userCompanies.company'],
  });

  if (!user) {
    return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
  }

  user.calculateTotals();

  const parsedPage = Number(page) || 1;
  const parsedLimit = Number(limit) || 10;

  const countQuery = getBaseTransactionQuery(transactionRepo, user, search, false);
  const total = await countQuery.getCount();

  if (total === 0) {
    return { data: [], meta: { total: 0, page: parsedPage, limit: parsedLimit, totalPages: 0 } };
  }

  const rawIds = await countQuery
    .select('t.id', 'id')
    .orderBy('t.createdDate', 'DESC')
    .offset((parsedPage - 1) * parsedLimit)
    .limit(parsedLimit)
    .getRawMany();

  const transactionIds = rawIds.map((row) => row.id);

  if (transactionIds.length === 0) {
    return {
      data: [],
      meta: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit),
      },
    };
  }

  const transactions = await transactionRepo
    .createQueryBuilder('t')
    .leftJoinAndSelect('t.staging', 'st', 'st.deletedDate IS NULL AND st.deletedBy IS NULL')
    .leftJoinAndSelect('t.user', 'u', 'u.deletedDate IS NULL')
    .where('t.id IN (:...transactionIds)', { transactionIds })
    .orderBy('t.createdDate', 'DESC')
    .getMany();

  const services = await transactionRepo.manager
    .createQueryBuilder(TransactionServiceEntity, 'ts')
    .leftJoinAndSelect('ts.service', 's', 's.deletedDate IS NULL AND s.deletedBy IS NULL')
    .where('ts.transactionId IN (:...transactionIds)', { transactionIds })
    .andWhere('ts.deletedDate IS NULL AND ts.deletedBy IS NULL')
    .orderBy('ts.transactionServiceNumber', 'ASC')
    .getMany();

  const serviceIds = services.map((s) => s.id);

  const transactionDocs = await transactionRepo.manager
    .createQueryBuilder(DocumentEntity, 'td')
    .leftJoinAndSelect('td.user', 'td_uploaded', 'td_uploaded.deletedDate IS NULL')
    .where('td.transactionId IN (:...transactionIds)', { transactionIds })
    .andWhere('td.transactionServiceId IS NULL')
    .andWhere('td.deletedDate IS NULL')
    .getMany();

  let serviceDocs: DocumentEntity[] = [];
  if (serviceIds.length > 0) {
    serviceDocs = await transactionRepo.manager
      .createQueryBuilder(DocumentEntity, 'd')
      .leftJoinAndSelect('d.user', 'd_uploaded', 'd_uploaded.deletedDate IS NULL')
      .leftJoinAndSelect('d.requirement', 'req', 'req.deletedDate IS NULL')
      .where('d.transactionServiceId IN (:...serviceIds)', { serviceIds })
      .andWhere('d.deletedDate IS NULL')
      .getMany();
  }

  const recipients = await transactionRepo.manager
    .createQueryBuilder(RecipientEntity, 'rc')
    .leftJoinAndSelect('rc.recipientDocuments', 'rcd', 'rcd.deletedDate IS NULL')
    .leftJoinAndSelect('rcd.document', 'rcdd', 'rcdd.deletedDate IS NULL')
    .leftJoinAndSelect('rcdd.user', 'rcdd_uploaded', 'rcdd_uploaded.deletedDate IS NULL')
    .where('rc.transactionId IN (:...transactionIds)', { transactionIds })
    .andWhere('rc.deletedDate IS NULL')
    .getMany();

  const servicesByTx = groupBy(services, (s) => s.transactionId);
  const serviceDocsByTs = groupBy(serviceDocs, (d) => d.transactionServiceId);
  const txDocsByTx = groupBy(transactionDocs, (td) => td.transactionId);
  const recipientsByTx = groupBy(recipients, (rc) => rc.transactionId);

  for (const s of services) {
    s.documents = serviceDocsByTs.get(s.id) || [];
  }

  for (const t of transactions) {
    t.transactionServices = servicesByTx.get(t.id) || [];
    t.documents = txDocsByTx.get(t.id) || [];
    (t as any).recipients = recipientsByTx.get(t.id) || [];
  }

  return {
    data: transactions.map(buildTransactionView),
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
