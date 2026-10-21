import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateTagDto {
  @ApiProperty({ description: 'Name of the tag', example: 'Urgent' })
  @IsNotEmpty()
  @IsString()
  @MinLength(2, { message: 'Tag name must be at least 2 characters' })
  @MaxLength(50, { message: 'Tag name must not exceed 50 characters' })
  @Matches(/^[a-zA-Z0-9\s-]+$/, {
    message: 'Tag name can only contain letters, numbers, spaces, and hyphens',
  })
  name!: string;

  @ApiPropertyOptional({ description: 'Color Hex Code', example: '#FF0000', default: '#3B82F6' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Color must be a valid hex color (e.g., #FF0000)' })
  colorHex?: string;

  @ApiPropertyOptional({
    description: 'Description of the tag',
    example: 'Documents requiring immediate attention',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  description?: string;
}
