import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateDocumentDto {
  @ApiProperty({ description: 'Document ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsNotEmpty()
  @IsUUID()
  id!: string;

  @ApiProperty({ description: 'Created Date', example: '2025-11-29T16:24:14.174Z' })
  @IsNotEmpty()
  @IsDate()
  createdDate!: Date;

  @ApiProperty({ description: 'File URL', example: 'https://example.com/documents/file.pdf' })
  @IsNotEmpty()
  @IsString()
  fileURL!: string;

  @ApiProperty({ description: 'Document category', example: 'Contract' })
  @IsNotEmpty()
  @IsString()
  category!: string;

  @ApiProperty({ description: 'User ID (UUID)', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsNotEmpty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ description: 'File size in bytes', example: 1024000 })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  fileSize!: number;

  @ApiPropertyOptional({ description: 'Original file name', example: 'file.pdf' })
  @IsOptional()
  @IsString()
  originalFileName?: string;

  @ApiPropertyOptional({
    description: 'Transaction ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  transactionId?: string;

  @ApiPropertyOptional({
    description: 'Transaction Service ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  transactionServiceId?: string;

  @ApiPropertyOptional({
    description: 'Requirement ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  requirementId!: string | null;

  @ApiProperty({ description: 'Document type', example: 'PDF' })
  @IsNotEmpty()
  @IsString()
  type!: string;

  @ApiPropertyOptional({
    description: 'Additional notes',
    example: 'This is a confidential document',
  })
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiProperty({ description: 'OCR processed status', example: false })
  @IsNotEmpty()
  @IsBoolean()
  ocrProcessed!: boolean;

  @ApiProperty({
    description: 'OCR extracted text',
    example: 'Sample text extracted from document',
  })
  @IsNotEmpty()
  @IsString()
  ocrText!: string;

  @ApiProperty({ description: 'OCR confidence score', example: 95.5 })
  @IsNotEmpty()
  @IsNumber()
  ocrConfidence!: number;

  @ApiPropertyOptional({
    description: 'OCR process failed reason',
    example: 'Unable to extract text from image',
  })
  @IsOptional()
  @IsString()
  ocrProcessFailedReason!: string | null;

  @ApiProperty({ description: 'OCR processed date', example: '2024-01-15T10:30:00.000Z' })
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  ocrProcessedDate!: Date;

  @ApiProperty({
    description: 'OCR extracted field name from requirement',
    example: 'ApplicantName',
    required: false,
  })
  @IsOptional()
  @IsString()
  ocrExtractedField?: string | null;

  @ApiProperty({ description: 'OCR extracted field value', example: 'John Doe', required: false })
  @IsOptional()
  @IsString()
  ocrExtractedValue?: string | null;

  @ApiProperty({
    description: 'OCR field extraction date',
    example: '2024-01-15T10:35:00.000Z',
    required: false,
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  ocrExtractedDate?: Date | null;
}
