import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuditDescription } from '../../../shared/decorators/audit-description.decorator.js';
import { Audit } from '../../../shared/decorators/audit.decorator.js';
import { GatewayUserGuard } from '../../../shared/guards/gateway-user.guard.js';
import { ReqContext, RequestContextDto } from '../../../utils/req-context.decorator.js';
import { CreateTagDto } from '../dtos/create-tag.dto.js';
import { UpdateTagDto } from '../dtos/update-tag.dto.js';
import { TagService } from '../types.js';

@ApiTags('Tags')
@ApiBearerAuth('JWT')
@Controller(['api/tag', 'tag'])
@Audit('Data Classification (Personal Tags)')
export class TagController {
  constructor(private readonly _tagService: TagService) {}

  @Post()
  @UseGuards(GatewayUserGuard)
  @AuditDescription("Created a new classification tag '{name}' for organized document retrieval")
  @ApiOperation({ summary: 'Create a new tag for the current user' })
  @ApiResponse({ status: 201, description: 'Tag created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or tag already exists' })
  async create(@ReqContext() _req: RequestContextDto, @Body() data: CreateTagDto) {
    return await this._tagService.create(data, _req.userId);
  }

  @Get()
  @UseGuards(GatewayUserGuard)
  @AuditDescription('Reviewed all personal classification tags and their usage metrics')
  @ApiOperation({ summary: 'Get all tags for the current user with usage counts' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['usage', 'alphabetical', 'recent'] })
  @ApiResponse({ status: 200, description: 'Tags retrieved successfully' })
  async findAll(
    @ReqContext() _req: RequestContextDto,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 100,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: 'usage' | 'alphabetical' | 'recent',
  ) {
    return await this._tagService.findAll(Number(page), Number(limit), search, _req.userId, sortBy);
  }

  @Get(':id')
  @UseGuards(GatewayUserGuard)
  @AuditDescription("Viewed individual tag '{identifier}' classification details")
  @ApiOperation({ summary: 'Get a tag by id' })
  @ApiResponse({ status: 200, description: 'Tag retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  async findOne(@ReqContext() _req: RequestContextDto, @Param('id') id: string) {
    const record = await this._tagService.findOne(id, _req.userId);
    if (record) _req.auditMetadata = { identifier: record.name };
    return record;
  }

  @Patch(':id')
  @UseGuards(GatewayUserGuard)
  @AuditDescription("Modified labels or color identifiers for classification tag '{name}'")
  @ApiOperation({ summary: 'Update a tag (name, color, description)' })
  @ApiResponse({ status: 200, description: 'Tag updated successfully' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  async update(
    @ReqContext() _req: RequestContextDto,
    @Param('id') id: string,
    @Body() data: UpdateTagDto,
  ) {
    return await this._tagService.update(id, data, _req.userId);
  }

  @Delete(':id')
  @UseGuards(GatewayUserGuard)
  @AuditDescription(
    "Permanently retired classification tag '{name}' and removed it from all documents",
  )
  @ApiOperation({ summary: 'Delete a tag and remove from all documents' })
  @ApiResponse({ status: 200, description: 'Tag deleted successfully' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  async remove(@ReqContext() _req: RequestContextDto, @Param('id') id: string) {
    const record = await this._tagService.findOne(id, _req.userId);
    if (record) _req.auditMetadata = { name: record.name };

    return await this._tagService.remove(id, _req.userId);
  }

  @Post(':id/merge')
  @UseGuards(GatewayUserGuard)
  @AuditDescription("Consolidated and merged classification tag '{sourceName}' into '{targetName}'")
  @ApiOperation({ summary: 'Merge source tag into target tag' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { targetTagId: { type: 'string' } },
      required: ['targetTagId'],
    },
  })
  @ApiResponse({ status: 200, description: 'Tags merged successfully' })
  @ApiResponse({ status: 404, description: 'Source or target tag not found' })
  async merge(
    @ReqContext() _req: RequestContextDto,
    @Param('id') sourceId: string,
    @Body('targetTagId') targetTagId: string,
  ) {
    const [source, target] = await Promise.all([
      this._tagService.findOne(sourceId, _req.userId),
      this._tagService.findOne(targetTagId, _req.userId),
    ]);

    if (source && target) {
      _req.auditMetadata = { sourceName: source.name, targetName: target.name };
    }

    return await this._tagService.mergeTags(sourceId, targetTagId, _req.userId);
  }

  // --- TCP MessagePattern Handlers ---

  @MessagePattern('tag.find-all')
  async tcpFindAll(
    @Payload()
    payload: {
      page?: number;
      limit?: number;
      search?: string;
      userId?: string;
      sortBy?: 'usage' | 'alphabetical' | 'recent';
    },
  ) {
    return this._tagService.findAll(
      payload.page || 1,
      payload.limit || 100,
      payload.search,
      payload.userId,
      payload.sortBy,
    );
  }

  @MessagePattern('tag.find-one')
  async tcpFindOne(@Payload() payload: { id: string; userId?: string }) {
    return this._tagService.findOne(payload.id, payload.userId);
  }

  @MessagePattern('tag.create')
  async tcpCreate(@Payload() payload: { data: CreateTagDto; userId: string }) {
    return this._tagService.create(payload.data, payload.userId);
  }

  @MessagePattern('tag.update')
  async tcpUpdate(@Payload() payload: { id: string; data: UpdateTagDto; userId?: string }) {
    return this._tagService.update(payload.id, payload.data, payload.userId);
  }

  @MessagePattern('tag.remove')
  async tcpRemove(@Payload() payload: { id: string; userId?: string }) {
    return this._tagService.remove(payload.id, payload.userId);
  }

  @MessagePattern('tag.merge')
  async tcpMerge(@Payload() payload: { sourceTagId: string; targetTagId: string; userId?: string }) {
    return this._tagService.mergeTags(payload.sourceTagId, payload.targetTagId, payload.userId);
  }
}
