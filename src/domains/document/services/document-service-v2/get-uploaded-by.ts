import { HttpException, HttpStatus } from '@nestjs/common';
import { IsNull, Repository } from 'typeorm';
import { USER_TYPE } from '../../../../shared/common/app-enums.js';
import { CustomMeta } from '../../../../shared/common/meta.js';
import DocumentEntity from '../../../../shared/infrastructure/database/entities/document.entity.js';
import UserEntity from '../../../../shared/infrastructure/database/entities/user.entity.js';
import { CompanyScopeHelper } from '../company-scope.helper.js';

interface GetUploadedByProps {
  userId: string;
  page: number;
  limit: number;
  search?: string;
  documentRepo: Repository<DocumentEntity>;
  userRepo: Repository<UserEntity>;
  companyScopeHelper: CompanyScopeHelper;
}

export async function GetUploadedBy(
  params: GetUploadedByProps,
): Promise<{ data: { id: string; name: string }[]; meta: CustomMeta }> {
  try {
    const { userId, page, limit, search, documentRepo, userRepo, companyScopeHelper } = params;
    const safePage = Number(page ?? 1);
    const safeLimit = Number(limit ?? 10);

    const user = await userRepo.findOne({ where: { id: userId, deletedDate: IsNull() } });
    if (!user) {
      throw new HttpException('User not found', HttpStatus.BAD_REQUEST);
    }

    const queryBuilder = documentRepo
      .createQueryBuilder('document')
      .leftJoin('document.user', 'uploader', 'uploader.deletedDate IS NULL')
      .leftJoin('document.transaction', 'transaction', 'transaction.deletedDate IS NULL')
      .leftJoin('transaction.user', 'client', 'client.deletedDate IS NULL')
      .select('uploader.id', 'id')
      .addSelect("uploader.firstName + ' ' + ISNULL(uploader.lastName, '')", 'name')
      .where('document.deletedDate IS NULL')
      .andWhere('uploader.id IS NOT NULL');

    if (user.type === USER_TYPE.ADMINISTRATOR) {
      // get all
    } else if (user.type === USER_TYPE.CORPORATE) {
      // get all within the company plus administrators
      const scopedUserIds = await companyScopeHelper.getCompanyUserIds(userId);
      queryBuilder.andWhere('(transaction.userId IN (:...scopedUserIds))', {
        scopedUserIds: scopedUserIds.length > 0 ? scopedUserIds : [''],
      });
    } else {
      // get only the uploader related to the user transactions documents
      queryBuilder.andWhere('transaction.userId = :userId', { userId });
    }

    if (search) {
      queryBuilder.andWhere(
        '(uploader.firstName LIKE :search OR uploader.lastName LIKE :search OR uploader.email LIKE :search)',
        { search: `%${search}%` },
      );
    }

    queryBuilder.groupBy('uploader.id');
    queryBuilder.addGroupBy('uploader.firstName');
    queryBuilder.addGroupBy('uploader.lastName');

    // Get total count of distinct uploaders
    const countQuery = queryBuilder.clone().select('COUNT(DISTINCT uploader.id)', 'cnt');
    const countResult = await countQuery.getRawOne();
    const total = Number.parseInt(countResult?.cnt || '0', 10);

    queryBuilder.orderBy('uploader.firstName', 'ASC');
    queryBuilder.offset((safePage - 1) * safeLimit);
    queryBuilder.limit(safeLimit);

    const result = await queryBuilder.getRawMany();

    const uniqueNames = new Set<string>();
    const filteredResult: { id: string; name: string }[] = [];

    for (const row of result) {
      const name = (row.name || '').trim();
      if (name && !uniqueNames.has(name.toLowerCase())) {
        uniqueNames.add(name.toLowerCase());
        filteredResult.push({ id: row.id, name });
      }
    }

    return {
      data: filteredResult,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  } catch (error: unknown) {
    console.log('something went wrong:', (error as Error)?.message);
    return { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } };
  }
}
