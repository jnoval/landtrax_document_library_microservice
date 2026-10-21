import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import DocumentTagEntity from '../../../shared/infrastructure/database/entities/document-tag.entity.js';
import TagEntity from '../../../shared/infrastructure/database/entities/tag.entity.js';
import { CreateTagDto } from '../dtos/create-tag.dto.js';
import { UpdateTagDto } from '../dtos/update-tag.dto.js';
import { MergeResult, TagListResponse, TagService, TagWithUsageCount } from '../types.js';

@Injectable()
export class TagServiceImpl extends TagService {
  private readonly _logger = new Logger(TagServiceImpl.name);

  constructor(
    @InjectRepository(TagEntity)
    private readonly _tagRepo: Repository<TagEntity>,
    @InjectRepository(DocumentTagEntity)
    private readonly _documentTagRepo: Repository<DocumentTagEntity>,
  ) {
    super();
  }

  // Helper to validate UUID format
  private isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  async create(createTagDto: CreateTagDto, userId: string): Promise<TagEntity> {
    // Check if tag with same name already exists for this user
    const existingTag = await this._tagRepo.findOne({
      where: {
        name: createTagDto.name,
        userId,
        deletedDate: IsNull(),
      },
    });

    if (existingTag) {
      throw new BadRequestException(`A tag with name "${createTagDto.name}" already exists`);
    }

    const tag = this._tagRepo.create({
      name: createTagDto.name,
      colorHex: createTagDto.colorHex || '#3B82F6', // Default blue color
      description: createTagDto.description || null,
      userId,
      createdBy: userId,
    });

    const saved = await this._tagRepo.save(tag);
    this._logger.log(`Created tag "${saved.name}" for user ${userId}`);
    return saved;
  }

  async findAll(
    page: number = 1,
    limit: number = 100,
    search?: string,
    userId?: string,
    sortBy?: 'usage' | 'alphabetical' | 'recent',
  ): Promise<TagListResponse> {
    const skip = (page - 1) * limit;

    // Build query with usage count subquery
    const queryBuilder = this._tagRepo
      .createQueryBuilder('tag')
      .select([
        'tag.id',
        'tag.name',
        'tag.colorHex',
        'tag.description',
        'tag.userId',
        'tag.createdDate',
        'tag.updatedDate',
      ])
      .addSelect((subQuery) => {
        return subQuery
          .select('COUNT(dt.id)', 'usageCount')
          .from(DocumentTagEntity, 'dt')
          .where('dt.tagId = tag.id')
          .andWhere('dt.deletedDate IS NULL');
      }, 'usageCount')
      .addSelect((subQuery) => {
        return subQuery
          .select('MAX(dt.createdDate)', 'lastUsedAt')
          .from(DocumentTagEntity, 'dt')
          .where('dt.tagId = tag.id')
          .andWhere('dt.deletedDate IS NULL');
      }, 'lastUsedAt')
      .where('tag.deletedDate IS NULL');

    // Filter by user (personalized tags) - only if valid UUID
    if (userId && this.isValidUUID(userId)) {
      queryBuilder.andWhere('tag.userId = :userId', { userId });
    }

    // Search filter
    if (search) {
      queryBuilder.andWhere('tag.name LIKE :search', { search: `%${search}%` });
    }

    // Sorting
    switch (sortBy) {
      case 'alphabetical':
        queryBuilder.orderBy('tag.name', 'ASC');
        break;
      case 'recent':
        queryBuilder.orderBy('tag.createdDate', 'DESC');
        break;
      case 'usage':
      default:
        queryBuilder.orderBy('usageCount', 'DESC');
        break;
    }

    // Get total count first
    const totalQueryBuilder = this._tagRepo
      .createQueryBuilder('tag')
      .where('tag.deletedDate IS NULL');

    if (userId && this.isValidUUID(userId)) {
      totalQueryBuilder.andWhere('tag.userId = :userId', { userId });
    }
    if (search) {
      totalQueryBuilder.andWhere('tag.name LIKE :search', { search: `%${search}%` });
    }
    const total = await totalQueryBuilder.getCount();

    // Get paginated results
    const rawResults = await queryBuilder.skip(skip).take(limit).getRawAndEntities();

    // Map raw results to include usage count
    const data: TagWithUsageCount[] = rawResults.entities.map((tag, index) => {
      const raw = rawResults.raw[index];
      return {
        ...tag,
        usageCount: Number.parseInt(raw.usageCount || '0', 10),
        lastUsedAt: raw.lastUsedAt ? new Date(raw.lastUsedAt) : null,
      };
    });

    this._logger.log(`Retrieved ${data.length} tags for user ${userId || 'all'}`);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, userId?: string): Promise<TagWithUsageCount> {
    const queryBuilder = this._tagRepo
      .createQueryBuilder('tag')
      .select([
        'tag.id',
        'tag.name',
        'tag.colorHex',
        'tag.description',
        'tag.userId',
        'tag.createdDate',
        'tag.updatedDate',
        'tag.createdBy',
      ])
      .addSelect((subQuery) => {
        return subQuery
          .select('COUNT(dt.id)', 'usageCount')
          .from(DocumentTagEntity, 'dt')
          .where('dt.tagId = tag.id')
          .andWhere('dt.deletedDate IS NULL');
      }, 'usageCount')
      .addSelect((subQuery) => {
        return subQuery
          .select('MAX(dt.createdDate)', 'lastUsedAt')
          .from(DocumentTagEntity, 'dt')
          .where('dt.tagId = tag.id')
          .andWhere('dt.deletedDate IS NULL');
      }, 'lastUsedAt')
      .where('tag.id = :id', { id })
      .andWhere('tag.deletedDate IS NULL');

    if (userId && this.isValidUUID(userId)) {
      queryBuilder.andWhere('tag.userId = :userId', { userId });
    }

    const result = await queryBuilder.getRawAndEntities();

    if (!result.entities[0]) {
      throw new NotFoundException(`Tag with ID ${id} not found`);
    }

    const tag = result.entities[0];
    const raw = result.raw[0];

    return {
      ...tag,
      usageCount: Number.parseInt(raw.usageCount || '0', 10),
      lastUsedAt: raw.lastUsedAt ? new Date(raw.lastUsedAt) : null,
    };
  }

  async update(id: string, updateTagDto: UpdateTagDto, userId?: string): Promise<TagEntity> {
    // First verify the tag exists and belongs to the user
    const tag = await this._tagRepo.findOne({
      where: {
        id,
        deletedDate: IsNull(),
        ...(userId && this.isValidUUID(userId) ? { userId } : {}),
      },
    });

    if (!tag) {
      throw new NotFoundException(`Tag with ID ${id} not found`);
    }

    // Check if renaming to an existing tag name
    if (updateTagDto.name && updateTagDto.name !== tag.name) {
      const existingTag = await this._tagRepo.findOne({
        where: {
          name: updateTagDto.name,
          userId: tag.userId,
          deletedDate: IsNull(),
        },
      });

      if (existingTag) {
        throw new BadRequestException(`A tag with name "${updateTagDto.name}" already exists`);
      }
    }

    // Update only provided fields
    if (updateTagDto.name !== undefined) tag.name = updateTagDto.name;
    if (updateTagDto.colorHex !== undefined) tag.colorHex = updateTagDto.colorHex;
    if (updateTagDto.description !== undefined) tag.description = updateTagDto.description;
    tag.updatedBy = userId || null;

    const updated = await this._tagRepo.save(tag);
    this._logger.log(`Updated tag ${updated.id}`);

    return updated;
  }

  async remove(
    id: string,
    userId?: string,
  ): Promise<{ message: string; deletedId: string; documentsUpdated: number }> {
    // Verify the tag exists and belongs to the user
    const tag = await this._tagRepo.findOne({
      where: {
        id,
        deletedDate: IsNull(),
        ...(userId && this.isValidUUID(userId) ? { userId } : {}),
      },
    });

    if (!tag) {
      throw new NotFoundException(`Tag with ID ${id} not found`);
    }

    // Count documents that have this tag
    const documentsCount = await this._documentTagRepo.count({
      where: {
        tagId: id,
        deletedDate: IsNull(),
      },
    });

    // Soft delete all document-tag associations
    await this._documentTagRepo.update(
      { tagId: id, deletedDate: IsNull() },
      { deletedDate: new Date() },
    );

    // Soft delete the tag
    await this._tagRepo.softDelete(id);

    this._logger.log(`Deleted tag ${id}, removed from ${documentsCount} documents`);

    return {
      message: `Tag "${tag.name}" deleted successfully`,
      deletedId: id,
      documentsUpdated: documentsCount,
    };
  }

  async mergeTags(sourceTagId: string, targetTagId: string, userId?: string): Promise<MergeResult> {
    // Verify both tags exist and belong to the user
    const sourceTag = await this._tagRepo.findOne({
      where: {
        id: sourceTagId,
        deletedDate: IsNull(),
        ...(userId && this.isValidUUID(userId) ? { userId } : {}),
      },
    });

    if (!sourceTag) {
      throw new NotFoundException(`Source tag with ID ${sourceTagId} not found`);
    }

    const targetTag = await this._tagRepo.findOne({
      where: {
        id: targetTagId,
        deletedDate: IsNull(),
        ...(userId && this.isValidUUID(userId) ? { userId } : {}),
      },
    });

    if (!targetTag) {
      throw new NotFoundException(`Target tag with ID ${targetTagId} not found`);
    }

    if (sourceTagId === targetTagId) {
      throw new BadRequestException('Cannot merge a tag into itself');
    }

    // Get all documents that have the source tag
    const sourceDocumentTags = await this._documentTagRepo.find({
      where: {
        tagId: sourceTagId,
        deletedDate: IsNull(),
      },
    });

    let documentsUpdated = 0;

    // For each document with source tag, add target tag if not already present
    for (const sourceDocTag of sourceDocumentTags) {
      // Check if document already has target tag
      const existingTargetTag = await this._documentTagRepo.findOne({
        where: {
          documentId: sourceDocTag.documentId,
          tagId: targetTagId,
          deletedDate: IsNull(),
        },
      });

      if (!existingTargetTag) {
        // Add target tag to document
        const newDocTag = this._documentTagRepo.create({
          documentId: sourceDocTag.documentId,
          tagId: targetTagId,
        });
        await this._documentTagRepo.save(newDocTag);
        documentsUpdated++;
      }

      // Remove source tag from document
      sourceDocTag.deletedDate = new Date();
      await this._documentTagRepo.save(sourceDocTag);
    }

    // Delete the source tag
    await this._tagRepo.softDelete(sourceTagId);

    this._logger.log(
      `Merged tag "${sourceTag.name}" into "${targetTag.name}", updated ${documentsUpdated} documents`,
    );

    return {
      success: true,
      message: `Successfully merged "${sourceTag.name}" into "${targetTag.name}"`,
      documentsUpdated,
      sourceTagDeleted: true,
    };
  }
}
