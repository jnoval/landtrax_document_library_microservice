import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { DocumentCategory } from '../../../shared/common/app-enums.js';

export class UploadDocumentDto {
  @ApiPropertyOptional({
    description: 'Transaction ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @Transform(({ value }) => {
    const transformed = value === '' || value === null || value === undefined ? undefined : value;
    return transformed;
  })
  transactionId?: string;

  @ApiPropertyOptional({
    description: 'Transaction Service ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @Transform(({ value }) => {
    const transformed = value === '' || value === null || value === undefined ? undefined : value;
    return transformed;
  })
  transactionServiceId?: string;

  @ApiPropertyOptional({
    description: 'Requirement ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @Transform(({ value }) => {
    const transformed = value === '' || value === null || value === undefined ? undefined : value;
    return transformed;
  })
  @IsUUID()
  requirementId?: string;

  @ApiPropertyOptional({ description: 'Original file name', example: 'file.pdf' })
  @IsOptional()
  @IsString()
  originalFileName?: string;

  @ApiPropertyOptional({ description: 'Item index for multi-file requirements', example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  itemIndex?: number;

  @ApiPropertyOptional({
    description: 'Document category',
    enum: DocumentCategory,
    example: DocumentCategory.REQUIREMENT,
    required: false,
  })
  @IsOptional()
  @IsEnum(DocumentCategory, { message: 'Category must be a valid DocumentCategory enum value' })
  category?: DocumentCategory;

  @ApiPropertyOptional({
    description: 'Additional notes',
    example: 'This is a confidential document',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
