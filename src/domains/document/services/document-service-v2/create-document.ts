import { HttpException, HttpStatus } from '@nestjs/common';
import { IsNull, Repository } from 'typeorm';
import { randomUUID as uuidv4 } from 'node:crypto';
import { CommonResponse } from '../../../../shared/common/response.js';
import DocumentEntity from '../../../../shared/infrastructure/database/entities/document.entity.js';
import UserEntity from '../../../../shared/infrastructure/database/entities/user.entity.js';
import { CreateDocumentDtoV2 } from '../../dtos/create-document-v2.dto.js';

interface CreateDocumentV2Params {
  userId: string;
  data: CreateDocumentDtoV2;
  userRepo: Repository<UserEntity>;
  documentRepo: Repository<DocumentEntity>;
}

export default async function CreateDocumentV2({
  userId,
  data,
  userRepo,
  documentRepo,
}: CreateDocumentV2Params): Promise<CommonResponse> {
  const user = await userRepo.findOne({ where: { id: userId, deletedDate: IsNull() } });
  if (!user) throw new HttpException('User not found', HttpStatus.NOT_ACCEPTABLE);

  const document = documentRepo.create({
    id: uuidv4(),
    ...data,
    userId: userId,
    createdDate: new Date(),
  });
  if (!document)
    throw new HttpException('Something went wrong in creating document', HttpStatus.BAD_REQUEST);

  const response = await documentRepo.save(document);
  if (!response)
    throw new HttpException(
      'Something went wrong on saving document',
      HttpStatus.FAILED_DEPENDENCY,
    );

  return {
    success: true,
    message: 'Document created',
    data: response,
  };
}
