import { Body, Controller, Get, Inject, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CONTENT_KINDS, ContentService, CatalogService, type ContentKind } from '@honey/backend';
import { Public, RequirePermissions, RequireStaffSession } from '../../http/auth/authorization.js';
import { requestMetadata, requestPrincipal } from '../../http/auth/request-principal.js';
import { AdminPageQueryDto } from '../../http/admin/admin-query.dto.js';

class KindDto {
  @ApiProperty({ enum: CONTENT_KINDS }) @IsIn(CONTENT_KINDS) kind!: ContentKind;
}
class ContentIdDto extends KindDto {
  @ApiProperty({ format: 'uuid', type: String }) @IsUUID() id!: string;
}
class SlugDto {
  @ApiProperty({ enum: ['page', 'article'] }) @IsIn(['page', 'article']) kind!: 'page' | 'article';
  @ApiProperty({ type: String, maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  slug!: string;
}
class ContentQueryDto extends AdminPageQueryDto {
  @ApiPropertyOptional({ type: String, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  q?: string;
}
class PublicContentQueryDto extends ContentQueryDto {
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(35) locale?: string;
}
class CreateContentDto {
  @ApiProperty({ type: String, maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  key!: string;
}
class TranslationDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(35) locale!: string;
  @ApiProperty({ type: String, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;
  @ApiProperty({ type: String, maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  slug!: string;
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      description:
        'Strict heading, paragraph, quote or public-media image block; unknown properties rejected by domain validation.',
    },
    minItems: 1,
    maxItems: 60,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  blocks!: unknown[];
  @ApiProperty({ type: String, nullable: true, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  metaTitle!: string | null;
  @ApiProperty({ type: String, nullable: true, maxLength: 320 })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  metaDescription!: string | null;
}
class AdminContentDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ enum: CONTENT_KINDS }) kind!: string;
  @ApiProperty({ type: String }) key!: string;
  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] }) status!: string;
  @ApiProperty({ type: String, nullable: true }) publishedAt!: string | null;
  @ApiProperty({ type: String }) updatedAt!: string;
  @ApiProperty({ type: [TranslationDto] }) translations!: TranslationDto[];
}
class AdminContentPageDto {
  @ApiProperty({ type: [AdminContentDto] }) items!: AdminContentDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
class PublicContentDto extends TranslationDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ enum: CONTENT_KINDS }) kind!: string;
  @ApiProperty({ type: String }) publishedAt!: string;
  @ApiProperty({ type: String }) updatedAt!: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } }) slugs!: Record<
    string,
    string
  >;
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        url: { type: 'string' },
        kind: { type: 'string' },
        width: { type: 'integer', nullable: true },
        height: { type: 'integer', nullable: true },
        altTextByLocale: { type: 'object', additionalProperties: { type: 'string' } },
      },
    },
  })
  media!: unknown[];
}
class PublicContentPageDto {
  @ApiProperty({ type: [PublicContentDto] }) items!: PublicContentDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
  @ApiProperty({ type: 'object', properties: { locale: { type: 'string' } } }) meta!: {
    locale: string;
  };
}

@ApiTags('Content Admin')
@RequireStaffSession()
@Controller('v1/admin/content')
@ApiParam({ name: 'kind', enum: CONTENT_KINDS })
export class AdminContentController {
  constructor(@Inject(ContentService) private readonly content: ContentService) {}
  @Get(':kind')
  @RequirePermissions('content:read')
  @ApiOperation({
    operationId: 'listAdminContent',
    summary: 'Read bounded editorial content and translation completeness',
    description: 'Read bounded editorial content and translation completeness.',
  })
  @ApiOkResponse({ type: AdminContentPageDto })
  list(@Param() p: KindDto, @Query() q: ContentQueryDto, @Req() r: FastifyRequest) {
    return this.content.listAdmin(requestPrincipal(r), p.kind, q);
  }
  @Get(':kind/:id')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @RequirePermissions('content:read')
  @ApiOperation({
    operationId: 'getAdminContent',
    summary: 'Read private editorial content',
    description: 'Read private editorial content.',
  })
  @ApiOkResponse({ type: AdminContentDto })
  detail(@Param() p: ContentIdDto, @Req() r: FastifyRequest) {
    return this.content.getAdmin(requestPrincipal(r), p.kind, p.id);
  }
  @Post(':kind')
  @RequirePermissions('content:write')
  @ApiOperation({
    operationId: 'createAdminContent',
    summary: 'Create an audited editorial draft',
    description: 'Create an audited editorial draft.',
  })
  @ApiOkResponse({ type: AdminContentDto })
  create(@Param() p: KindDto, @Body() b: CreateContentDto, @Req() r: FastifyRequest) {
    return this.content.create(requestPrincipal(r), p.kind, b.key, requestMetadata(r));
  }
  @Put(':kind/:id/translations')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @RequirePermissions('content:write')
  @ApiOperation({
    operationId: 'saveContentTranslation',
    summary: 'Save a validated plain-text block translation',
    description: 'Save a validated plain-text block translation.',
  })
  @ApiOkResponse({ type: AdminContentDto })
  save(@Param() p: ContentIdDto, @Body() b: TranslationDto, @Req() r: FastifyRequest) {
    return this.content.save(
      requestPrincipal(r),
      p.kind,
      p.id,
      {
        locale: b.locale,
        title: b.title,
        slug: b.slug,
        blocks: this.parseBlocks(b.blocks),
        metaTitle: b.metaTitle ?? null,
        metaDescription: b.metaDescription ?? null,
      },
      requestMetadata(r),
    );
  }
  @Post(':kind/:id/publish')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @RequirePermissions('content:publish')
  @ApiOperation({
    operationId: 'publishContent',
    summary: 'Publish only complete enabled-locale editorial content',
    description: 'Publish only complete enabled-locale editorial content.',
  })
  @ApiOkResponse({ type: AdminContentDto })
  publish(@Param() p: ContentIdDto, @Req() r: FastifyRequest) {
    return this.content.transition(
      requestPrincipal(r),
      p.kind,
      p.id,
      'PUBLISHED',
      requestMetadata(r),
    );
  }
  @Post(':kind/:id/archive')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @RequirePermissions('content:publish')
  @ApiOperation({
    operationId: 'archiveContent',
    summary: 'Archive editorial content and invalidate public surfaces',
    description: 'Archive editorial content and invalidate public surfaces.',
  })
  @ApiOkResponse({ type: AdminContentDto })
  archive(@Param() p: ContentIdDto, @Req() r: FastifyRequest) {
    return this.content.transition(
      requestPrincipal(r),
      p.kind,
      p.id,
      'ARCHIVED',
      requestMetadata(r),
    );
  }
  private parseBlocks(input: unknown) {
    return contentBlocks(input);
  }
}
import { contentBlocks } from '@honey/backend';
@ApiTags('Content')
@Controller('v1/content')
@ApiParam({ name: 'kind', enum: CONTENT_KINDS })
export class PublicContentController {
  constructor(
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}
  @Get(':kind')
  @Public()
  @ApiOperation({
    operationId: 'listPublishedContent',
    summary: 'Read published content in the requested locale without fallback',
    description: 'Read published content in the requested locale without fallback.',
  })
  @ApiOkResponse({ type: PublicContentPageDto })
  async list(
    @Param() p: KindDto,
    @Query() q: PublicContentQueryDto,
    @Req() r: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const locale = await this.locale(q.locale, r);
    this.headers(reply);
    const { locale: ignored, ...query } = q;
    void ignored;
    return this.content.listPublic(p.kind, locale, query);
  }
  @Get(':kind/:slug')
  @ApiParam({ name: 'slug', schema: { type: 'string', maxLength: 160 } })
  @Public()
  @ApiOperation({
    operationId: 'getPublishedContent',
    summary: 'Resolve a published locale slug',
    description: 'Resolve a published locale slug.',
  })
  @ApiOkResponse({ type: PublicContentDto })
  async detail(
    @Param() p: SlugDto,
    @Query() q: PublicContentQueryDto,
    @Req() r: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const locale = await this.locale(q.locale, r);
    const result = await this.content.publicDetail(p.kind, locale, p.slug);
    this.headers(reply);
    return result;
  }
  private locale(explicit: string | undefined, request: FastifyRequest) {
    const header = request.headers['accept-language'];
    return this.catalog.resolveLocale({
      ...(explicit === undefined ? {} : { explicit }),
      ...(typeof header === 'string' ? { acceptLanguage: header } : {}),
    });
  }
  private headers(reply: FastifyReply) {
    reply.header('Cache-Control', 'public, max-age=0, s-maxage=60');
    reply.header('Vary', 'Accept-Language, X-Currency');
  }
}
