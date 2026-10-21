import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateOCRFieldDto {
  @ApiProperty({ description: 'OCR extracted field', example: 'Maria Ozawa' })
  @IsNotEmpty()
  @IsString()
  ocrExtractedValue!: string;
}
