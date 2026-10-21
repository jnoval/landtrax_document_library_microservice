import { HttpException, HttpStatus } from '@nestjs/common';
import { IsNull, Repository } from 'typeorm';
import { CommonResponse } from '../../../../shared/common/response.js';
import DocumentEntity from '../../../../shared/infrastructure/database/entities/document.entity.js';
import UserEntity from '../../../../shared/infrastructure/database/entities/user.entity.js';
import { UpdateOCRFieldDto } from '../../dtos/update-ocr-field.dto.js';

interface UpdateOCRFieldParams {
  documentId: string;
  userId: string;
  data: UpdateOCRFieldDto;
  documentRepo: Repository<DocumentEntity>;
  userRepo: Repository<UserEntity>;
}

export default async function UpdateOCRField({
  documentId,
  userId,
  data,
  documentRepo,
  userRepo,
}: UpdateOCRFieldParams): Promise<CommonResponse> {
  const user = await userRepo.findOne({ where: { id: userId, deletedDate: IsNull() } });
  if (!user) throw new HttpException('User not found', HttpStatus.NOT_ACCEPTABLE);

  const document = await documentRepo.findOne({
    where: { id: documentId, deletedDate: IsNull() },
  });
  if (!document) throw new HttpException('Document not found', HttpStatus.NOT_FOUND);

  documentRepo.merge(document, data as any, {
    updatedDate: new Date(),
  });
  const response = await documentRepo.save(document);
  if (!response)
    throw new HttpException('Something went wrong updating document', HttpStatus.FAILED_DEPENDENCY);

  return { success: true, message: 'Document updated', data: response };
}
