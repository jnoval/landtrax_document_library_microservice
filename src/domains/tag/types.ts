import TagEntity from '../../shared/infrastructure/database/entities/tag.entity.js';
import { CreateTagDto } from './dtos/create-tag.dto.js';
import { UpdateTagDto } from './dtos/update-tag.dto.js';

export interface TagWithUsageCount extends TagEntity {
  usageCount: number;
  lastUsedAt?: Date | null;
}

export interface TagListResponse {
  data: TagWithUsageCount[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface MergeResult {
  success: boolean;
  message: string;
  documentsUpdated: number;
  sourceTagDeleted: boolean;
}

export abstract class TagService {
  abstract create(createTagDto: CreateTagDto, userId: string): Promise<TagEntity>;
  abstract findAll(
    page: number,
    limit: number,
    search?: string,
    userId?: string,
    sortBy?: 'usage' | 'alphabetical' | 'recent',
  ): Promise<TagListResponse>;
  abstract findOne(id: string, userId?: string): Promise<TagWithUsageCount>;
  abstract update(id: string, updateTagDto: UpdateTagDto, userId?: string): Promise<TagEntity>;
  abstract remove(
    id: string,
    userId?: string,
  ): Promise<{ message: string; deletedId: string; documentsUpdated: number }>;
  abstract mergeTags(
    sourceTagId: string,
    targetTagId: string,
    userId?: string,
  ): Promise<MergeResult>;
}
