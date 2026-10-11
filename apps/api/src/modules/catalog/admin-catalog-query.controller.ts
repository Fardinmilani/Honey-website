import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { AdminCatalogService, CATALOG_STATUSES, type AdminCatalogQuery } from '@honey/backend';
import { RequirePermissions, RequireStaffSession } from '../../http/auth/authorization.js';
import { requestPrincipal } from '../../http/auth/request-principal.js';
import { AdminPageQueryDto } from '../../http/admin/admin-query.dto.js';
class CatalogQueryDto extends AdminPageQueryDto {
  @ApiPropertyOptional({ type: String, minLength: 2, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  q?: string;
  @ApiPropertyOptional({ enum: CATALOG_STATUSES })
  @IsOptional()
  @IsIn(CATALOG_STATUSES)
  status?: NonNullable<AdminCatalogQuery['status']>;
}
class TaxonomyQueryDto extends AdminPageQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' }) @IsOptional() @IsUUID() id?: string;
}
class AdminTranslationSummaryDto {
  @ApiProperty({ type: String }) locale!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) slug!: string;
}
class AdminTaxonomyTranslationDto extends AdminTranslationSummaryDto {
  @ApiPropertyOptional({ type: String, nullable: true }) description?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) metaTitle?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) metaDescription?: string | null;
}
class AdminProductSummaryDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String, nullable: true }) sku!: string | null;
  @ApiProperty({ enum: CATALOG_STATUSES }) status!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: [AdminTranslationSummaryDto] }) translations!: AdminTranslationSummaryDto[];
}
class AdminProductPageDto {
  @ApiProperty({ type: [AdminProductSummaryDto] }) items!: AdminProductSummaryDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
class AdminTaxonomyDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String, nullable: true }) parentId!: string | null;
  @ApiProperty({ type: String, nullable: true }) path!: string | null;
  @ApiProperty({ type: String, nullable: true }) status!: string | null;
  @ApiProperty({ type: Number }) sortWeight!: number;
  @ApiProperty({ type: [AdminTaxonomyTranslationDto] })
  translations!: AdminTaxonomyTranslationDto[];
}
class AdminTaxonomyPageDto {
  @ApiProperty({ type: [AdminTaxonomyDto] }) items!: AdminTaxonomyDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
@ApiTags('Catalog Admin')
@RequireStaffSession()
@Controller('v1/admin/catalog')
export class AdminCatalogQueryController {
  constructor(@Inject(AdminCatalogService) private readonly catalog: AdminCatalogService) {}
  @Get('products')
  @RequirePermissions('catalog:read')
  @ApiOperation({
    operationId: 'listAdminProducts',
    summary: 'Read products of all publication states with locale completeness inputs',
    description:
      'STAFF catalog:read query with bounded keyset pagination, SKU or localized-name search, and publication-state filtering.',
  })
  @ApiOkResponse({ type: AdminProductPageDto })
  products(@Query() query: CatalogQueryDto, @Req() request: FastifyRequest) {
    return this.catalog.products(requestPrincipal(request), query);
  }
  @Get('categories')
  @RequirePermissions('catalog:read')
  @ApiOperation({
    operationId: 'listAdminCategories',
    summary: 'Read bounded category hierarchy and translations',
    description:
      'STAFF catalog:read query returning owned category hierarchy and all translations, optionally filtered by UUID.',
  })
  @ApiOkResponse({ type: AdminTaxonomyPageDto })
  categories(@Query() query: TaxonomyQueryDto, @Req() request: FastifyRequest) {
    return this.catalog.categories(requestPrincipal(request), query);
  }
  @Get('collections')
  @RequirePermissions('catalog:read')
  @ApiOperation({
    operationId: 'listAdminCollections',
    summary: 'Read bounded collections and translations',
    description:
      'STAFF catalog:read query returning collection publication state and translations, optionally filtered by UUID.',
  })
  @ApiOkResponse({ type: AdminTaxonomyPageDto })
  collections(@Query() query: TaxonomyQueryDto, @Req() request: FastifyRequest) {
    return this.catalog.collections(requestPrincipal(request), query);
  }
}
