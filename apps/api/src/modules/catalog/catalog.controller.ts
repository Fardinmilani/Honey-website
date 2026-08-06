import { createHash } from 'node:crypto';

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  CATALOG_STATUSES,
  CatalogService,
  IdentityService,
  MEDIA_ROLES,
  NotFoundAppError,
  PRODUCT_SORTS,
  SEARCH_SORTS,
  type AdminProduct,
  type ProductSort,
  type SearchSort,
} from '@honey/backend';
import type { ApiConfig } from '../../config/api-config.js';
import { Public, RequirePermissions } from '../../http/auth/authorization.js';
import { requestMetadata, requestPrincipal } from '../../http/auth/request-principal.js';
import { ProblemDetailsDto } from '../../http/errors/problem-details.js';

class MetaDto {
  @ApiProperty({ type: String })
  locale!: string;

  @ApiProperty({ type: String })
  requestId!: string;
}

class PageDto {
  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;

  @ApiProperty({ type: Boolean })
  hasMore!: boolean;

  @ApiProperty({ type: Number, minimum: 1, maximum: 100 })
  limit!: number;
}

class PublicVariantDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) sku!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: Number }) netWeightGrams!: number;
  @ApiProperty({ type: String }) jarSizeLabelKey!: string;
  @ApiProperty({ type: String }) packagingTypeKey!: string;
  @ApiProperty({ type: Number }) weightGramsShipping!: number;
  @ApiProperty({ type: [Number], minItems: 3, maxItems: 3 }) dimensionsMm!: readonly number[];
  @ApiProperty({ type: Number }) position!: number;
  @ApiProperty({ type: Boolean }) isDefault!: boolean;
}

class PublicCatalogMediaDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, enum: MEDIA_ROLES }) role!: string;
  @ApiProperty({ type: String, enum: ['IMAGE', 'VIDEO'] }) kind!: string;
  @ApiProperty({ type: Number }) position!: number;
  @ApiProperty({ type: Number, nullable: true }) width!: number | null;
  @ApiProperty({ type: Number, nullable: true }) height!: number | null;
  @ApiProperty({ type: String, format: 'uri' }) url!: string;
  @ApiProperty({ type: String }) altText!: string;
}

class PublicProductDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) slug!: string;
  @ApiProperty({ type: String, nullable: true }) brandLine!: string | null;
  @ApiProperty({ type: String, nullable: true }) shortDescription!: string | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) tastingNotes!: string | null;
  @ApiProperty({ type: String, nullable: true }) pairingSuggestions!: string | null;
  @ApiProperty({ type: String, nullable: true }) storyHtml!: string | null;
  @ApiProperty({ type: String, nullable: true }) metaTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) metaDescription!: string | null;
  @ApiProperty({ type: String, nullable: true }) honeyVarietal!: string | null;
  @ApiProperty({ type: [String] }) floralSources!: readonly string[];
  @ApiProperty({ type: String, nullable: true }) originRegion!: string | null;
  @ApiProperty({ type: String, nullable: true }) originAltitudeBand!: string | null;
  @ApiProperty({ type: String, nullable: true }) harvestSeason!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) publishedAt!: string;
  @ApiProperty({ type: [PublicVariantDto] }) variants!: readonly PublicVariantDto[];
  @ApiProperty({ type: [PublicCatalogMediaDto] }) media!: readonly PublicCatalogMediaDto[];
}

class PublicCategoryDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) parentId!: string | null;
  @ApiProperty({ type: String }) path!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) slug!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) metaTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) metaDescription!: string | null;
  @ApiProperty({ type: Number }) sortWeight!: number;
}

class PublicCollectionDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) slug!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) metaTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) metaDescription!: string | null;
  @ApiProperty({ type: Number }) sortWeight!: number;
  @ApiProperty({ type: String, format: 'date-time' }) publishedAt!: string;
}

class ProductResponseDto {
  @ApiProperty({ type: PublicProductDto }) data!: PublicProductDto;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}

class ProductListResponseDto {
  @ApiProperty({ type: [PublicProductDto] }) data!: readonly PublicProductDto[];
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
  @ApiProperty({ type: PageDto }) page!: PageDto;
}

class CategoryResponseDto {
  @ApiProperty({ type: PublicCategoryDto }) data!: PublicCategoryDto;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}

class CategoryListResponseDto {
  @ApiProperty({ type: [PublicCategoryDto] }) data!: readonly PublicCategoryDto[];
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}

class CollectionResponseDto {
  @ApiProperty({ type: PublicCollectionDto }) data!: PublicCollectionDto;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}

class CollectionListResponseDto {
  @ApiProperty({ type: [PublicCollectionDto] }) data!: readonly PublicCollectionDto[];
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}

class LocaleQueryDto {
  @ApiPropertyOptional({ type: String, example: 'fa' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  locale?: string;
}

class ProductListQueryDto extends LocaleQueryDto {
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(1024) cursor?: string;
  @ApiPropertyOptional({ type: String, pattern: '^[0-9]{1,3}$' })
  @IsOptional()
  @Matches(/^[0-9]{1,3}$/u)
  limit?: string;
  @ApiPropertyOptional({ type: String, enum: PRODUCT_SORTS })
  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort?: ProductSort;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  honeyVarietal?: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  originRegion?: string;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  floralSource?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  collectionId?: string;
  @ApiPropertyOptional({ type: String, pattern: '^[0-9]{1,6}$' })
  @IsOptional()
  @Matches(/^[0-9]{1,6}$/u)
  minimumNetWeightGrams?: string;
  @ApiPropertyOptional({ type: String, pattern: '^[0-9]{1,6}$' })
  @IsOptional()
  @Matches(/^[0-9]{1,6}$/u)
  maximumNetWeightGrams?: string;
}

class SearchQueryDto extends LocaleQueryDto {
  @ApiProperty({ type: String, maxLength: 500 }) @IsString() @MaxLength(500) q!: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(1024) cursor?: string;
  @ApiPropertyOptional({ type: String, pattern: '^[0-9]{1,3}$' })
  @IsOptional()
  @Matches(/^[0-9]{1,3}$/u)
  limit?: string;
  @ApiPropertyOptional({ type: String, enum: SEARCH_SORTS })
  @IsOptional()
  @IsIn(SEARCH_SORTS)
  sort?: SearchSort;
}

class SlugParamDto {
  @ApiProperty({ type: String, maxLength: 160 }) @IsString() @MaxLength(160) slug!: string;
}

class IdParamDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() id!: string;
}

class ProductVariantParamDto extends IdParamDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() variantId!: string;
}

class ProductRelationParamDto extends IdParamDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() relationId!: string;
}

class ProductMediaParamDto extends IdParamDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() attachmentId!: string;
}

class ProductWriteDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  brandLine?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  honeyVarietal?: string | null;
  @ApiPropertyOptional({ type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  floralSources?: string[];
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  originRegion?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  originAltitudeBand?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  harvestSeason?: string | null;
  @ApiProperty({ type: String, enum: ['OWN_PRODUCTION', 'SELECTED_SUPPLIER'] })
  @IsIn(['OWN_PRODUCTION', 'SELECTED_SUPPLIER'])
  sourcingType!: 'OWN_PRODUCTION' | 'SELECTED_SUPPLIER';
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  apiaryId?: string | null;
  @ApiPropertyOptional({ type: Number, minimum: -1_000_000, maximum: 1_000_000 })
  @IsOptional()
  @IsInt()
  @Min(-1_000_000)
  @Max(1_000_000)
  sortWeight?: number;
}

class ProductTranslationWriteDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(64) locale!: string;
  @ApiProperty({ type: String }) @IsString() @MaxLength(200) name!: string;
  @ApiProperty({ type: String }) @IsString() @MaxLength(160) slug!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  tastingNotes?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  pairingSuggestions?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  storyHtml?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(70)
  metaTitle?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(170)
  metaDescription?: string | null;
}

class VariantWriteDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(80) sku!: string;
  @ApiProperty({ type: Number }) @IsInt() @Min(1) @Max(100_000) netWeightGrams!: number;
  @ApiProperty({ type: String }) @IsString() @MaxLength(80) jarSizeLabelKey!: string;
  @ApiProperty({ type: String }) @IsString() @MaxLength(80) packagingTypeKey!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Matches(/^[0-9]{8,14}$/u)
  barcode?: string | null;
  @ApiProperty({ type: Number }) @IsInt() @Min(1) @Max(200_000) weightGramsShipping!: number;
  @ApiProperty({ type: [Number], minItems: 3, maxItems: 3 })
  @IsArray()
  @ArrayMaxSize(3)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(10_000, { each: true })
  dimensionsMm!: number[];
  @ApiProperty({ type: Number }) @IsInt() @Min(0) @Max(10_000) position!: number;
}

class VariantTranslationWriteDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(64) locale!: string;
  @ApiProperty({ type: String }) @IsString() @MaxLength(160) name!: string;
}

class TaxonomyTranslationWriteDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(64) locale!: string;
  @ApiProperty({ type: String }) @IsString() @MaxLength(160) name!: string;
  @ApiProperty({ type: String }) @IsString() @MaxLength(160) slug!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(70)
  metaTitle?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(170)
  metaDescription?: string | null;
}

class CategoryWriteDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
  @ApiProperty({ type: Number }) @IsInt() @Min(-1_000_000) @Max(1_000_000) sortWeight!: number;
}

class CategoryMoveDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

class CollectionWriteDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(-1_000_000) @Max(1_000_000) sortWeight!: number;
}

class CategoryAssignmentDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() categoryId!: string;
  @ApiProperty({ type: Boolean }) @IsBoolean() primary!: boolean;
}

class CollectionAssignmentDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() collectionId!: string;
  @ApiProperty({ type: Number }) @IsInt() @Min(0) @Max(10_000) position!: number;
}

class MediaAttachmentWriteDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  variantId?: string | null;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() mediaAssetId!: string;
  @ApiProperty({ type: String, enum: MEDIA_ROLES })
  @IsIn(MEDIA_ROLES)
  role!: (typeof MEDIA_ROLES)[number];
  @ApiProperty({ type: Number }) @IsInt() @Min(0) @Max(10_000) position!: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string', maxLength: 300 } })
  @IsObject()
  altTextByLocale!: Record<string, string>;
}

class MediaAttachmentUpdateDto {
  @ApiProperty({ type: String, enum: MEDIA_ROLES })
  @IsIn(MEDIA_ROLES)
  role!: (typeof MEDIA_ROLES)[number];
  @ApiProperty({ type: Number }) @IsInt() @Min(0) @Max(10_000) position!: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string', maxLength: 300 } })
  @IsObject()
  altTextByLocale!: Record<string, string>;
}

class AdminProductDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, enum: CATALOG_STATUSES }) status!: string;
  @ApiProperty({ type: String, nullable: true }) publishedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) sku!: string | null;
  @ApiProperty({ type: String, nullable: true }) brandLine!: string | null;
  @ApiProperty({ type: String, nullable: true }) honeyVarietal!: string | null;
  @ApiProperty({ type: [String] }) floralSources!: readonly string[];
  @ApiProperty({ type: String, nullable: true }) originRegion!: string | null;
  @ApiProperty({ type: String, nullable: true }) originAltitudeBand!: string | null;
  @ApiProperty({ type: String, nullable: true }) harvestSeason!: string | null;
  @ApiProperty({ type: String, enum: ['OWN_PRODUCTION', 'SELECTED_SUPPLIER'] })
  sourcingType!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) apiaryId!: string | null;
  @ApiProperty({ type: Number }) sortWeight!: number;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) primaryCategoryId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) defaultVariantId!: string | null;
  @ApiProperty({ type: 'array', items: { type: 'object' } }) translations!: readonly object[];
  @ApiProperty({ type: 'array', items: { type: 'object' } }) variants!: readonly object[];
  @ApiProperty({ type: 'array', items: { type: 'object' } }) categories!: readonly object[];
  @ApiProperty({ type: 'array', items: { type: 'object' } }) collections!: readonly object[];
  @ApiProperty({ type: 'array', items: { type: 'object' } }) media!: readonly object[];
}

function meta(request: FastifyRequest, locale: string): MetaDto {
  return { locale, requestId: request.id };
}

function etag(value: unknown): string {
  return `"${createHash('sha256').update(JSON.stringify(value)).digest('base64url')}"`;
}

function operation(operationId: string, summary: string) {
  return { operationId, summary, description: `${summary}.` };
}

@ApiTags('Catalog')
@Controller('v1/catalog')
export class PublicCatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject('API_CONFIG') private readonly config: ApiConfig,
  ) {}

  @Get('products')
  @Public()
  @ApiOperation(operation('listCatalogProducts', 'List published localized products'))
  @ApiOkResponse({ type: ProductListResponseDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async listProducts(
    @Query() query: ProductListQueryDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ProductListResponseDto> {
    const locale = await this.#locale(query.locale, request);
    const result = await this.catalog.listProducts({
      locale,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
      ...(query.sort === undefined ? {} : { sort: query.sort }),
      filters: {
        ...(query.categoryId === undefined ? {} : { categoryId: query.categoryId }),
        ...(query.collectionId === undefined ? {} : { collectionId: query.collectionId }),
        ...(query.honeyVarietal === undefined ? {} : { honeyVarietal: query.honeyVarietal }),
        ...(query.originRegion === undefined ? {} : { originRegion: query.originRegion }),
        ...(query.floralSource === undefined ? {} : { floralSource: query.floralSource }),
        ...(query.minimumNetWeightGrams === undefined
          ? {}
          : { minimumNetWeightGrams: Number(query.minimumNetWeightGrams) }),
        ...(query.maximumNetWeightGrams === undefined
          ? {}
          : { maximumNetWeightGrams: Number(query.maximumNetWeightGrams) }),
      },
    });
    this.#publicListHeaders(reply);
    return { data: result.data, meta: meta(request, locale), page: result.page };
  }

  @Get('search')
  @Public()
  @ApiOperation(operation('searchCatalogProducts', 'Search published products in one locale'))
  @ApiOkResponse({ type: ProductListResponseDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async search(
    @Query() query: SearchQueryDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ProductListResponseDto> {
    const locale = await this.#locale(query.locale, request);
    const result = await this.catalog.searchProducts({
      locale,
      query: query.q,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
      ...(query.sort === undefined ? {} : { sort: query.sort }),
    });
    this.#publicListHeaders(reply);
    return { data: result.data, meta: meta(request, locale), page: result.page };
  }

  @Get('products/:slug')
  @Public()
  @ApiOperation(operation('getCatalogProductBySlug', 'Resolve one localized product slug'))
  @ApiParam({ name: 'slug', type: String })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async product(
    @Param() params: SlugParamDto,
    @Query() query: LocaleQueryDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ProductResponseDto | void> {
    const locale = await this.#locale(query.locale, request);
    const result = await this.catalog.resolveProduct(locale, params.slug);
    if (result.kind === 'NOT_FOUND') throw new NotFoundAppError();
    if (result.kind === 'REDIRECT')
      return this.#redirect(
        reply,
        `/v1/catalog/products/${encodeURIComponent(result.currentSlug)}?locale=${encodeURIComponent(locale)}`,
      );
    return this.#single(reply, request, locale, result.entity);
  }

  @Get('categories')
  @Public()
  @ApiOperation(operation('listCatalogCategories', 'List localized catalog categories'))
  @ApiOkResponse({ type: CategoryListResponseDto })
  async categories(
    @Query() query: LocaleQueryDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<CategoryListResponseDto> {
    const locale = await this.#locale(query.locale, request);
    const data = await this.catalog.listCategories(locale);
    this.#publicListHeaders(reply);
    return { data, meta: meta(request, locale) };
  }

  @Get('categories/:slug/products')
  @Public()
  @ApiOperation(operation('listCatalogCategoryProducts', 'List products in one category'))
  @ApiParam({ name: 'slug', type: String })
  @ApiOkResponse({ type: ProductListResponseDto })
  async categoryProducts(
    @Param() params: SlugParamDto,
    @Query() query: ProductListQueryDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ProductListResponseDto | void> {
    const locale = await this.#locale(query.locale, request);
    const category = await this.catalog.resolveCategory(locale, params.slug);
    if (category.kind === 'NOT_FOUND') throw new NotFoundAppError();
    if (category.kind === 'REDIRECT')
      return this.#redirect(
        reply,
        `/v1/catalog/categories/${encodeURIComponent(category.currentSlug)}/products?locale=${encodeURIComponent(locale)}`,
      );
    const result = await this.catalog.listProducts({
      locale,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
      ...(query.sort === undefined ? {} : { sort: query.sort }),
      filters: { categoryId: category.entity.id },
    });
    this.#publicListHeaders(reply);
    return { data: result.data, meta: meta(request, locale), page: result.page };
  }

  @Get('categories/:slug')
  @Public()
  @ApiOperation(operation('getCatalogCategoryBySlug', 'Resolve one localized category slug'))
  @ApiParam({ name: 'slug', type: String })
  @ApiOkResponse({ type: CategoryResponseDto })
  async category(
    @Param() params: SlugParamDto,
    @Query() query: LocaleQueryDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<CategoryResponseDto | void> {
    const locale = await this.#locale(query.locale, request);
    const result = await this.catalog.resolveCategory(locale, params.slug);
    if (result.kind === 'NOT_FOUND') throw new NotFoundAppError();
    if (result.kind === 'REDIRECT')
      return this.#redirect(
        reply,
        `/v1/catalog/categories/${encodeURIComponent(result.currentSlug)}?locale=${encodeURIComponent(locale)}`,
      );
    return this.#single(reply, request, locale, result.entity);
  }

  @Get('collections')
  @Public()
  @ApiOperation(operation('listCatalogCollections', 'List published localized collections'))
  @ApiOkResponse({ type: CollectionListResponseDto })
  async collections(
    @Query() query: LocaleQueryDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<CollectionListResponseDto> {
    const locale = await this.#locale(query.locale, request);
    const data = await this.catalog.listCollections(locale);
    this.#publicListHeaders(reply);
    return { data, meta: meta(request, locale) };
  }

  @Get('collections/:slug/products')
  @Public()
  @ApiOperation(operation('listCatalogCollectionProducts', 'List products in one collection'))
  @ApiParam({ name: 'slug', type: String })
  @ApiOkResponse({ type: ProductListResponseDto })
  async collectionProducts(
    @Param() params: SlugParamDto,
    @Query() query: ProductListQueryDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ProductListResponseDto | void> {
    const locale = await this.#locale(query.locale, request);
    const collection = await this.catalog.resolveCollection(locale, params.slug);
    if (collection.kind === 'NOT_FOUND') throw new NotFoundAppError();
    if (collection.kind === 'REDIRECT')
      return this.#redirect(
        reply,
        `/v1/catalog/collections/${encodeURIComponent(collection.currentSlug)}/products?locale=${encodeURIComponent(locale)}`,
      );
    const result = await this.catalog.listProducts({
      locale,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
      ...(query.sort === undefined ? {} : { sort: query.sort }),
      filters: { collectionId: collection.entity.id },
    });
    this.#publicListHeaders(reply);
    return { data: result.data, meta: meta(request, locale), page: result.page };
  }

  @Get('collections/:slug')
  @Public()
  @ApiOperation(operation('getCatalogCollectionBySlug', 'Resolve one localized collection slug'))
  @ApiParam({ name: 'slug', type: String })
  @ApiOkResponse({ type: CollectionResponseDto })
  async collection(
    @Param() params: SlugParamDto,
    @Query() query: LocaleQueryDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<CollectionResponseDto | void> {
    const locale = await this.#locale(query.locale, request);
    const result = await this.catalog.resolveCollection(locale, params.slug);
    if (result.kind === 'NOT_FOUND') throw new NotFoundAppError();
    if (result.kind === 'REDIRECT')
      return this.#redirect(
        reply,
        `/v1/catalog/collections/${encodeURIComponent(result.currentSlug)}?locale=${encodeURIComponent(locale)}`,
      );
    return this.#single(reply, request, locale, result.entity);
  }

  async #locale(explicit: string | undefined, request: FastifyRequest): Promise<string> {
    let preferredLocale: string | undefined;
    const token = request.cookies[this.config.sessionCookie.name];
    if (token !== undefined) {
      try {
        const principal = await this.identity.authenticateSession(token);
        preferredLocale = (await this.identity.me(principal)).preferredLocale;
      } catch {
        // Public reads remain public when an optional stale cookie is present.
      }
    }
    return this.catalog.resolveLocale({
      ...(explicit === undefined ? {} : { explicit }),
      ...(typeof request.headers['accept-language'] === 'string'
        ? { acceptLanguage: request.headers['accept-language'] }
        : {}),
      ...(preferredLocale === undefined ? {} : { preferredLocale }),
    });
  }

  #publicListHeaders(reply: FastifyReply): void {
    reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    reply.header('Vary', 'Accept-Language');
  }

  #single<T>(
    reply: FastifyReply,
    request: FastifyRequest,
    locale: string,
    data: T,
  ): Readonly<{ data: T; meta: MetaDto }> | void {
    const tag = etag(data);
    reply.header('Cache-Control', 'public, max-age=60, s-maxage=300');
    reply.header('Vary', 'Accept-Language');
    reply.header('ETag', tag);
    if (request.headers['if-none-match'] === tag) {
      reply.status(304).send();
      return;
    }
    return { data, meta: meta(request, locale) };
  }

  #redirect(reply: FastifyReply, location: string): void {
    reply.header('Cache-Control', 'public, max-age=60, s-maxage=300');
    reply.header('Vary', 'Accept-Language');
    reply.status(301).header('Location', location).send();
  }
}

@ApiTags('Catalog Admin')
@Controller('v1/admin/catalog')
export class AdminCatalogController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Post('products')
  @RequirePermissions('catalog:write')
  @ApiOperation(operation('createCatalogProduct', 'Create a draft catalog product'))
  @ApiCreatedResponse({ type: AdminProductDto })
  createProduct(
    @Body() body: ProductWriteDto,
    @Req() request: FastifyRequest,
  ): Promise<AdminProduct> {
    return this.catalog.createProduct(requestPrincipal(request), body, requestMetadata(request));
  }

  @Get('products/:id')
  @RequirePermissions('catalog:read')
  @ApiOperation(operation('getAdminCatalogProduct', 'Read an internal catalog product'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: AdminProductDto })
  getProduct(@Param() params: IdParamDto, @Req() request: FastifyRequest): Promise<AdminProduct> {
    return this.catalog.getAdminProduct(requestPrincipal(request), params.id);
  }

  @Put('products/:id')
  @RequirePermissions('catalog:write')
  @ApiOperation(operation('updateCatalogProduct', 'Update catalog product fields'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: AdminProductDto })
  updateProduct(
    @Param() params: IdParamDto,
    @Body() body: ProductWriteDto,
    @Req() request: FastifyRequest,
  ): Promise<AdminProduct> {
    return this.catalog.updateProduct(
      requestPrincipal(request),
      params.id,
      body,
      requestMetadata(request),
    );
  }

  @Put('products/:id/translations')
  @RequirePermissions('catalog:write')
  @ApiOperation(
    operation('upsertCatalogProductTranslation', 'Create or update a product translation'),
  )
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: AdminProductDto })
  productTranslation(
    @Param() params: IdParamDto,
    @Body() body: ProductTranslationWriteDto,
    @Req() request: FastifyRequest,
  ): Promise<AdminProduct> {
    return this.catalog.upsertProductTranslation(
      requestPrincipal(request),
      params.id,
      body,
      requestMetadata(request),
    );
  }

  @Post('products/:id/variants')
  @RequirePermissions('catalog:write')
  @ApiOperation(operation('createCatalogVariant', 'Create a draft product variant'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiCreatedResponse({ type: AdminProductDto })
  createVariant(
    @Param() params: IdParamDto,
    @Body() body: VariantWriteDto,
    @Req() request: FastifyRequest,
  ): Promise<AdminProduct> {
    return this.catalog.createVariant(
      requestPrincipal(request),
      params.id,
      body,
      requestMetadata(request),
    );
  }

  @Put('products/:id/variants/:variantId')
  @RequirePermissions('catalog:write')
  @ApiOperation(operation('updateCatalogVariant', 'Update product variant fields'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiParam({ name: 'variantId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: AdminProductDto })
  updateVariant(
    @Param() params: ProductVariantParamDto,
    @Body() body: VariantWriteDto,
    @Req() request: FastifyRequest,
  ): Promise<AdminProduct> {
    return this.catalog.updateVariant(
      requestPrincipal(request),
      params.id,
      params.variantId,
      body,
      requestMetadata(request),
    );
  }

  @Put('products/:id/variants/:variantId/translations')
  @RequirePermissions('catalog:write')
  @ApiOperation(
    operation('upsertCatalogVariantTranslation', 'Create or update a variant translation'),
  )
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiParam({ name: 'variantId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: AdminProductDto })
  variantTranslation(
    @Param() params: ProductVariantParamDto,
    @Body() body: VariantTranslationWriteDto,
    @Req() request: FastifyRequest,
  ): Promise<AdminProduct> {
    return this.catalog.upsertVariantTranslation(
      requestPrincipal(request),
      params.id,
      params.variantId,
      body,
      requestMetadata(request),
    );
  }

  @Post('products/:id/variants/:variantId/publish')
  @RequirePermissions('catalog:publish')
  @HttpCode(200)
  @ApiOperation(operation('publishCatalogVariant', 'Publish a draft product variant'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiParam({ name: 'variantId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: AdminProductDto })
  publishVariant(
    @Param() params: ProductVariantParamDto,
    @Req() request: FastifyRequest,
  ): Promise<AdminProduct> {
    return this.catalog.updateVariantStatus(
      requestPrincipal(request),
      params.id,
      params.variantId,
      'PUBLISHED',
      requestMetadata(request),
    );
  }

  @Post('products/:id/variants/:variantId/archive')
  @RequirePermissions('catalog:publish')
  @HttpCode(200)
  @ApiOperation(operation('archiveCatalogVariant', 'Archive a product variant'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiParam({ name: 'variantId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: AdminProductDto })
  archiveVariant(
    @Param() params: ProductVariantParamDto,
    @Req() request: FastifyRequest,
  ): Promise<AdminProduct> {
    return this.catalog.updateVariantStatus(
      requestPrincipal(request),
      params.id,
      params.variantId,
      'ARCHIVED',
      requestMetadata(request),
    );
  }

  @Post('products/:id/variants/:variantId/default')
  @RequirePermissions('catalog:write')
  @HttpCode(200)
  @ApiOperation(operation('setDefaultCatalogVariant', 'Set the product default variant'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiParam({ name: 'variantId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: AdminProductDto })
  defaultVariant(
    @Param() params: ProductVariantParamDto,
    @Req() request: FastifyRequest,
  ): Promise<AdminProduct> {
    return this.catalog.setDefaultVariant(
      requestPrincipal(request),
      params.id,
      params.variantId,
      requestMetadata(request),
    );
  }

  @Post('products/:id/publish')
  @RequirePermissions('catalog:publish')
  @HttpCode(200)
  @ApiOperation(operation('publishCatalogProduct', 'Publish a complete catalog product'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: AdminProductDto })
  publishProduct(
    @Param() params: IdParamDto,
    @Req() request: FastifyRequest,
  ): Promise<AdminProduct> {
    return this.catalog.transitionProduct(
      requestPrincipal(request),
      params.id,
      'PUBLISHED',
      requestMetadata(request),
    );
  }

  @Post('products/:id/archive')
  @RequirePermissions('catalog:publish')
  @HttpCode(200)
  @ApiOperation(operation('archiveCatalogProduct', 'Archive a catalog product'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: AdminProductDto })
  archiveProduct(
    @Param() params: IdParamDto,
    @Req() request: FastifyRequest,
  ): Promise<AdminProduct> {
    return this.catalog.transitionProduct(
      requestPrincipal(request),
      params.id,
      'ARCHIVED',
      requestMetadata(request),
    );
  }

  @Post('categories')
  @RequirePermissions('catalog:write')
  @ApiOperation(operation('createCatalogCategory', 'Create a catalog category'))
  @ApiCreatedResponse({
    schema: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
  })
  createCategory(@Body() body: CategoryWriteDto, @Req() request: FastifyRequest) {
    return this.catalog.createCategory(
      requestPrincipal(request),
      body.parentId ?? null,
      body.sortWeight,
      requestMetadata(request),
    );
  }

  @Post('categories/:id/move')
  @RequirePermissions('catalog:write')
  @HttpCode(204)
  @ApiOperation(operation('moveCatalogCategory', 'Move a category hierarchy subtree'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  moveCategory(
    @Param() params: IdParamDto,
    @Body() body: CategoryMoveDto,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.catalog.moveCategory(
      requestPrincipal(request),
      params.id,
      body.parentId ?? null,
      requestMetadata(request),
    );
  }

  @Put('categories/:id')
  @RequirePermissions('catalog:write')
  @HttpCode(204)
  @ApiOperation(operation('updateCatalogCategory', 'Update category ordering'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  updateCategory(
    @Param() params: IdParamDto,
    @Body() body: CollectionWriteDto,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.catalog.updateCategory(
      requestPrincipal(request),
      params.id,
      body.sortWeight,
      requestMetadata(request),
    );
  }

  @Put('categories/:id/translations')
  @RequirePermissions('catalog:write')
  @HttpCode(204)
  @ApiOperation(
    operation('upsertCatalogCategoryTranslation', 'Create or update a category translation'),
  )
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  categoryTranslation(
    @Param() params: IdParamDto,
    @Body() body: TaxonomyTranslationWriteDto,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.catalog.upsertCategoryTranslation(
      requestPrincipal(request),
      params.id,
      body,
      requestMetadata(request),
    );
  }

  @Post('collections')
  @RequirePermissions('catalog:write')
  @ApiOperation(operation('createCatalogCollection', 'Create a draft catalog collection'))
  @ApiCreatedResponse({
    schema: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
  })
  createCollection(@Body() body: CollectionWriteDto, @Req() request: FastifyRequest) {
    return this.catalog.createCollection(
      requestPrincipal(request),
      body.sortWeight,
      requestMetadata(request),
    );
  }

  @Put('collections/:id')
  @RequirePermissions('catalog:write')
  @HttpCode(204)
  @ApiOperation(operation('updateCatalogCollection', 'Update collection ordering'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  updateCollection(
    @Param() params: IdParamDto,
    @Body() body: CollectionWriteDto,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.catalog.updateCollection(
      requestPrincipal(request),
      params.id,
      body.sortWeight,
      requestMetadata(request),
    );
  }

  @Put('collections/:id/translations')
  @RequirePermissions('catalog:write')
  @HttpCode(204)
  @ApiOperation(
    operation('upsertCatalogCollectionTranslation', 'Create or update a collection translation'),
  )
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  collectionTranslation(
    @Param() params: IdParamDto,
    @Body() body: TaxonomyTranslationWriteDto,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.catalog.upsertCollectionTranslation(
      requestPrincipal(request),
      params.id,
      body,
      requestMetadata(request),
    );
  }

  @Post('collections/:id/publish')
  @RequirePermissions('catalog:publish')
  @HttpCode(204)
  @ApiOperation(operation('publishCatalogCollection', 'Publish a complete catalog collection'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  publishCollection(@Param() params: IdParamDto, @Req() request: FastifyRequest): Promise<void> {
    return this.catalog.transitionCollection(
      requestPrincipal(request),
      params.id,
      'PUBLISHED',
      requestMetadata(request),
    );
  }

  @Post('collections/:id/archive')
  @RequirePermissions('catalog:publish')
  @HttpCode(204)
  @ApiOperation(operation('archiveCatalogCollection', 'Archive a catalog collection'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  archiveCollection(@Param() params: IdParamDto, @Req() request: FastifyRequest): Promise<void> {
    return this.catalog.transitionCollection(
      requestPrincipal(request),
      params.id,
      'ARCHIVED',
      requestMetadata(request),
    );
  }

  @Post('products/:id/categories')
  @RequirePermissions('catalog:write')
  @HttpCode(204)
  @ApiOperation(operation('assignCatalogProductCategory', 'Assign a category to a product'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  assignCategory(
    @Param() params: IdParamDto,
    @Body() body: CategoryAssignmentDto,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.catalog.assignCategory(
      requestPrincipal(request),
      params.id,
      body.categoryId,
      body.primary,
      requestMetadata(request),
    );
  }

  @Delete('products/:id/categories/:relationId')
  @RequirePermissions('catalog:write')
  @HttpCode(204)
  @ApiOperation(operation('unassignCatalogProductCategory', 'Remove a product category assignment'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiParam({ name: 'relationId', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  unassignCategory(
    @Param() params: ProductRelationParamDto,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.catalog.unassignCategory(
      requestPrincipal(request),
      params.id,
      params.relationId,
      requestMetadata(request),
    );
  }

  @Post('products/:id/collections')
  @RequirePermissions('catalog:write')
  @HttpCode(204)
  @ApiOperation(operation('assignCatalogProductCollection', 'Assign a product to a collection'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  assignCollection(
    @Param() params: IdParamDto,
    @Body() body: CollectionAssignmentDto,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.catalog.assignCollection(
      requestPrincipal(request),
      params.id,
      body.collectionId,
      body.position,
      requestMetadata(request),
    );
  }

  @Delete('products/:id/collections/:relationId')
  @RequirePermissions('catalog:write')
  @HttpCode(204)
  @ApiOperation(
    operation('unassignCatalogProductCollection', 'Remove a product collection assignment'),
  )
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiParam({ name: 'relationId', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  unassignCollection(
    @Param() params: ProductRelationParamDto,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.catalog.unassignCollection(
      requestPrincipal(request),
      params.id,
      params.relationId,
      requestMetadata(request),
    );
  }

  @Post('products/:id/media')
  @RequirePermissions('catalog:write')
  @ApiOperation(operation('attachCatalogProductMedia', 'Attach a verified public media asset'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiCreatedResponse({ type: AdminProductDto })
  attachMedia(
    @Param() params: IdParamDto,
    @Body() body: MediaAttachmentWriteDto,
    @Req() request: FastifyRequest,
  ): Promise<AdminProduct> {
    return this.catalog.attachMedia(
      requestPrincipal(request),
      params.id,
      body,
      requestMetadata(request),
    );
  }

  @Patch('products/:id/media/:attachmentId')
  @RequirePermissions('catalog:write')
  @ApiOperation(operation('updateCatalogProductMedia', 'Update product media presentation fields'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiParam({ name: 'attachmentId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: AdminProductDto })
  updateMedia(
    @Param() params: ProductMediaParamDto,
    @Body() body: MediaAttachmentUpdateDto,
    @Req() request: FastifyRequest,
  ): Promise<AdminProduct> {
    return this.catalog.updateMedia(
      requestPrincipal(request),
      params.id,
      params.attachmentId,
      body,
      requestMetadata(request),
    );
  }

  @Delete('products/:id/media/:attachmentId')
  @RequirePermissions('catalog:write')
  @HttpCode(204)
  @ApiOperation(operation('detachCatalogProductMedia', 'Detach media from a product'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiParam({ name: 'attachmentId', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  detachMedia(
    @Param() params: ProductMediaParamDto,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.catalog.detachMedia(
      requestPrincipal(request),
      params.id,
      params.attachmentId,
      requestMetadata(request),
    );
  }
}
