import { HttpException, HttpStatus } from '@nestjs/common';
import archiver from 'archiver';
import { Response } from 'express';
import { Repository } from 'typeorm';
import { DocumentCategory } from '../../../../shared/common/app-enums.js';
import TransactionEntity from '../../../../shared/infrastructure/database/entities/transaction.entity.js';
import { S3StorageService } from '../../../s3-storage/services/s3-storage.service.js';

interface DownloadAllDocumentsByTransactionParams {
  transactionId: string;
  transactionRepo: Repository<TransactionEntity>;
  storageService: S3StorageService;
  res: Response;
}

export default async function DownloadAllDocumentsByTransactionV2({
  transactionId,
  transactionRepo,
  storageService,
  res,
}: DownloadAllDocumentsByTransactionParams): Promise<void> {
  try {
    const transaction = await transactionRepo.findOne({
      where: { id: transactionId },
      relations: [
        'transactionServices',
        'transactionServices.service',
        'transactionServices.documents',
        'transactionServices.documents.requirement',
        'documents',
        'recipients',
        'recipients.recipientDocuments',
        'recipients.recipientDocuments.document',
      ],
    });

    if (!transaction) {
      throw new HttpException('Transaction not found', HttpStatus.NOT_FOUND);
    }

    const transactionNumber = (transaction.transactionNumber || 'Transaction').replaceAll(
      /[^a-z0-9]/gi,
      '_',
    );

    const allDocs = extractDocumentsFromTransaction(transaction);

    if (allDocs.length === 0) {
      throw new HttpException(
        'No requirement documents found for this transaction',
        HttpStatus.NOT_ACCEPTABLE,
      );
    }

    const archiverModule = (archiver as any).default || archiver;
    const archive: archiver.Archiver =
      (archiver as any).ZipArchive
        ? new (archiver as any).ZipArchive({ zlib: { level: 9 } })
        : archiverModule.ZipArchive
          ? new archiverModule.ZipArchive({ zlib: { level: 9 } })
          : archiverModule('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => {
      console.error(`ZIP creation failed: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ message: `ZIP creation failed: ${err.message}` });
      }
      res.end();
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${transactionNumber}_Documents.zip"`,
    );

    archive.pipe(res);

    await appendDocumentsToArchive(allDocs, archive, storageService);

    await archive.finalize();
  } catch (error: unknown) {
    if (error instanceof HttpException) {
      throw error;
    }

    throw new HttpException(
      (error as Error).message || 'Failed to retrieve documents. Please try again later.',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

interface ArchiveDocument {
  fileURL: string;
  archivePath: string;
}

function extractDocumentsFromTransaction(transaction: TransactionEntity): ArchiveDocument[] {
  return [
    ...extractServiceLevelDocuments(transaction),
    ...extractTransactionLevelDocuments(transaction),
    ...extractRecipientDocuments(transaction),
  ];
}

function extractServiceLevelDocuments(transaction: TransactionEntity): ArchiveDocument[] {
  const docs: ArchiveDocument[] = [];
  const transactionServices = transaction.transactionServices || [];

  for (const ts of transactionServices) {
    const serviceName = ((ts as any).service?.name || (ts as any).serviceName || 'Service').replaceAll(
      /[<>:"/\\|?*]/g,
      '_',
    );
    const documents = ts.documents || [];

    for (const doc of documents) {
      if (doc.deletedDate) continue;

      const originalFileName = (doc.originalFileName || 'document').replaceAll(
        /[<>:"/\\|?*]/g,
        '_',
      );
      let folderName = '';

      switch (doc.category) {
        case DocumentCategory.REQUIREMENT:
          folderName = (doc.requirement?.name || 'Unknown Requirement').replaceAll(
            /[<>:"/\\|?*]/g,
            '_',
          );
          break;
        case DocumentCategory.OUTPUT_DOCUMENT:
          folderName = 'Output Documents';
          break;
        case DocumentCategory.POD:
        case DocumentCategory.PROOF_OF_DELIVERY:
          folderName = 'Proof of Delivery';
          break;
        case DocumentCategory.OTHER:
        case DocumentCategory.CERTIFICATE:
        case DocumentCategory.OTHER_FILES:
        default:
          folderName = 'Other Files';
          break;
      }

      docs.push({
        fileURL: doc.fileURL,
        archivePath: `${serviceName}/${folderName}/${originalFileName}`,
      });
    }
  }
  return docs;
}

function extractTransactionLevelDocuments(transaction: TransactionEntity): ArchiveDocument[] {
  const docs: ArchiveDocument[] = [];
  const transactionDocs = transaction.documents || [];

  for (const doc of transactionDocs) {
    if (doc.deletedDate) continue;

    const originalFileName = (doc.originalFileName || 'document').replaceAll(/[<>:"/\\|?*]/g, '_');
    let folderName = '';

    switch (doc.category) {
      case DocumentCategory.RECEIPT:
        folderName = 'Receipts';
        break;
      case DocumentCategory.SUPPORTING_DOCUMENT:
        folderName = 'Supporting Documents';
        break;
      case DocumentCategory.EOS:
        folderName = 'EOS';
        break;
      default:
        continue;
    }

    docs.push({
      fileURL: doc.fileURL,
      archivePath: `${folderName}/${originalFileName}`,
    });
  }
  return docs;
}

function extractRecipientDocuments(transaction: TransactionEntity): ArchiveDocument[] {
  const docs: ArchiveDocument[] = [];
  const recipients = (transaction as any).recipients || [];

  for (const recipient of recipients) {
    if (recipient.deletedDate) continue;

    const recipientDocs = recipient.recipientDocuments || [];
    for (const rd of recipientDocs) {
      if (rd.deletedDate || !rd.document || rd.document.deletedDate) continue;

      const doc = rd.document;
      const originalFileName = (doc.originalFileName || 'document').replaceAll(
        /[<>:"/\\|?*]/g,
        '_',
      );

      docs.push({
        fileURL: doc.fileURL,
        archivePath: `Recipients/${originalFileName}`,
      });
    }
  }
  return docs;
}

async function appendDocumentsToArchive(
  allDocs: ArchiveDocument[],
  archive: archiver.Archiver,
  storageService: S3StorageService,
): Promise<void> {
  const usedPaths = new Set<string>();

  for (const doc of allDocs) {
    try {
      const { buffer } = await storageService.getFile(doc.fileURL);

      let finalPath = doc.archivePath;

      let counter = 1;
      const lastDotIndex = finalPath.lastIndexOf('.');
      const baseWithFolders =
        lastDotIndex === -1 ? finalPath : finalPath.substring(0, lastDotIndex);
      const ext = lastDotIndex === -1 ? '' : finalPath.substring(lastDotIndex);

      while (usedPaths.has(finalPath)) {
        finalPath = `${baseWithFolders}_(${counter})${ext}`;
        counter++;
      }
      usedPaths.add(finalPath);

      archive.append(buffer, { name: finalPath });
    } catch (error) {
      console.error(`Error adding file ${doc.fileURL} to zip:`, error);
    }
  }
}
