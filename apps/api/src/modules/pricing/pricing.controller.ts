import { Body, Controller, Get, Inject, Post, Query, Req } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { FastifyRequest } from 'fastify';

import {
  COUPON_APPLIES_TO,
  COUPON_STATUSES,
  COUPON_TYPES,
  PricingService,
  type CouponRecord,
  type TaxRateRecord,
  type VariantPriceRecord,
} from '@honey/backend';
import { RequirePermissions } from '../../http/auth/authorization.js';
import { requestMetadata, requestPrincipal } from '../../http/auth/request-principal.js';

const MINOR_AMOUNT = /^(?:0|[1-9][0-9]*)$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const COUNTRY = /^[A-Z]{2}$/u;

class PriceQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  variantId?: string;
}

class CreatePriceDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  variantId!: string;

  @ApiProperty({ type: String, example: '125000' })
  @IsString()
  @Matches(MINOR_AMOUNT)
  amountMinor!: string;

  @ApiPropertyOptional({ type: String, example: '150000', nullable: true })
  @IsOptional()
  @IsString()
  @Matches(MINOR_AMOUNT)
  compareAtMinor?: string | null;

  @ApiProperty({ type: String, example: 'IRR' })
  @IsString()
  @Matches(CURRENCY)
  currency!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsDateString()
  validFrom!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  validTo?: string | null;
}

class CreateCouponDto {
  @ApiProperty({ type: String, maxLength: 64 })
  @IsString()
  @MaxLength(64)
  code!: string;

  @ApiProperty({ enum: COUPON_TYPES })
  @IsIn(COUPON_TYPES)
  type!: (typeof COUPON_TYPES)[number];

  @ApiProperty({ type: String, example: '1000' })
  @IsString()
  @Matches(MINOR_AMOUNT)
  value!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'IRR' })
  @IsOptional()
  @IsString()
  @Matches(CURRENCY)
  currency?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Matches(MINOR_AMOUNT)
  minSubtotalMinor?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Matches(MINOR_AMOUNT)
  maxDiscountMinor?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsDateString()
  startsAt!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  usageLimitTotal?: number | null;

  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  usageLimitPerUser?: number | null;

  @ApiProperty({ enum: COUPON_APPLIES_TO })
  @IsIn(COUPON_APPLIES_TO)
  appliesTo!: (typeof COUPON_APPLIES_TO)[number];

  @ApiProperty({ type: [String], format: 'uuid', maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  targetIds!: string[];

  @ApiProperty({ enum: COUPON_STATUSES })
  @IsIn(COUPON_STATUSES)
  status!: (typeof COUPON_STATUSES)[number];
}

class CreateTaxRateDto {
  @ApiProperty({ type: String, maxLength: 64 })
  @IsString()
  @MaxLength(64)
  code!: string;

  @ApiProperty({ type: Number, minimum: 0, maximum: 10000 })
  @IsInt()
  @Min(0)
  @Max(10_000)
  rateBps!: number;

  @ApiProperty({ type: String, example: 'IR' })
  @IsString()
  @Matches(COUNTRY)
  country!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  region?: string | null;

  @ApiProperty()
  @IsBoolean()
  isInclusive!: boolean;

  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}

class VariantPriceResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) variantId!: string;
  @ApiProperty({ type: String }) currency!: string;
  @ApiProperty({ type: String, example: '125000' }) amountMinor!: string;
  @ApiProperty({ type: String, nullable: true, example: '150000' }) compareAtMinor!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) validFrom!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) validTo!: string | null;
}

class CouponResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) code!: string;
  @ApiProperty({ enum: COUPON_TYPES }) type!: (typeof COUPON_TYPES)[number];
  @ApiProperty({ type: String }) value!: string;
  @ApiProperty({ type: String, nullable: true }) currency!: string | null;
  @ApiProperty({ type: String, nullable: true }) minSubtotalMinor!: string | null;
  @ApiProperty({ type: String, nullable: true }) maxDiscountMinor!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) startsAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) endsAt!: string | null;
  @ApiProperty({ type: Number, nullable: true }) usageLimitTotal!: number | null;
  @ApiProperty({ type: Number, nullable: true }) usageLimitPerUser!: number | null;
  @ApiProperty({ enum: COUPON_APPLIES_TO }) appliesTo!: (typeof COUPON_APPLIES_TO)[number];
  @ApiProperty({ type: [String], format: 'uuid' }) targetIds!: readonly string[];
  @ApiProperty({ enum: COUPON_STATUSES }) status!: (typeof COUPON_STATUSES)[number];
}

class TaxRateResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) code!: string;
  @ApiProperty({ type: Number }) rateBps!: number;
  @ApiProperty({ type: String }) country!: string;
  @ApiProperty({ type: String, nullable: true }) region!: string | null;
  @ApiProperty({ type: Boolean }) isInclusive!: boolean;
  @ApiProperty({ type: Boolean }) isActive!: boolean;
}

function serializeVariantPrice(record: VariantPriceRecord): VariantPriceResponseDto {
  return {
    id: record.id,
    variantId: record.variantId,
    currency: record.currency,
    amountMinor: record.amountMinor.toString(),
    compareAtMinor: record.compareAtMinor?.toString() ?? null,
    validFrom: record.validFrom.toISOString(),
    validTo: record.validTo?.toISOString() ?? null,
  };
}

function serializeCoupon(record: CouponRecord): CouponResponseDto {
  return {
    id: record.id,
    code: record.code,
    type: record.type,
    value: record.value.toString(),
    currency: record.currency,
    minSubtotalMinor: record.minSubtotalMinor?.toString() ?? null,
    maxDiscountMinor: record.maxDiscountMinor?.toString() ?? null,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt?.toISOString() ?? null,
    usageLimitTotal: record.usageLimitTotal,
    usageLimitPerUser: record.usageLimitPerUser,
    appliesTo: record.appliesTo,
    targetIds: record.targetIds,
    status: record.status,
  };
}

function serializeTaxRate(record: TaxRateRecord): TaxRateResponseDto {
  return {
    id: record.id,
    code: record.code,
    rateBps: record.rateBps,
    country: record.country,
    region: record.region,
    isInclusive: record.isInclusive,
    isActive: record.isActive,
  };
}

function operation(operationId: string, summary: string) {
  return { operationId, summary, description: `${summary}.` };
}

@ApiTags('Pricing Admin')
@Controller('v1/admin/pricing')
export class AdminPricingController {
  constructor(@Inject(PricingService) private readonly pricing: PricingService) {}

  @Get('variant-prices')
  @RequirePermissions('pricing:read')
  @ApiOperation(operation('adminListVariantPrices', 'List internal variant price records'))
  @ApiOkResponse({ type: [VariantPriceResponseDto] })
  async listVariantPrices(
    @Req() request: FastifyRequest,
    @Query() query: PriceQueryDto,
  ): Promise<readonly VariantPriceResponseDto[]> {
    return (await this.pricing.listVariantPrices(requestPrincipal(request), query.variantId)).map(
      serializeVariantPrice,
    );
  }

  @Post('variant-prices')
  @RequirePermissions('pricing:write')
  @ApiOperation(operation('adminCreateVariantPrice', 'Create a validated variant price record'))
  @ApiCreatedResponse({ type: VariantPriceResponseDto })
  async createVariantPrice(
    @Req() request: FastifyRequest,
    @Body() body: CreatePriceDto,
  ): Promise<VariantPriceResponseDto> {
    const price = await this.pricing.createVariantPrice(
      requestPrincipal(request),
      {
        variantId: body.variantId,
        amountMinor: body.amountMinor,
        compareAtMinor: body.compareAtMinor ?? null,
        currency: body.currency,
        validFrom: new Date(body.validFrom),
        validTo:
          body.validTo === null || body.validTo === undefined ? null : new Date(body.validTo),
      },
      requestMetadata(request),
    );
    return serializeVariantPrice(price);
  }

  @Get('coupons')
  @RequirePermissions('pricing:read')
  @ApiOperation(operation('adminListCoupons', 'List internal coupon records'))
  @ApiOkResponse({ type: [CouponResponseDto] })
  async listCoupons(@Req() request: FastifyRequest): Promise<readonly CouponResponseDto[]> {
    return (await this.pricing.listCoupons(requestPrincipal(request))).map(serializeCoupon);
  }

  @Post('coupons')
  @RequirePermissions('pricing:write')
  @ApiOperation(operation('adminCreateCoupon', 'Create a validated coupon record'))
  @ApiCreatedResponse({ type: CouponResponseDto })
  async createCoupon(
    @Req() request: FastifyRequest,
    @Body() body: CreateCouponDto,
  ): Promise<CouponResponseDto> {
    const coupon = await this.pricing.createCoupon(
      requestPrincipal(request),
      {
        code: body.code,
        type: body.type,
        value: body.value,
        currency: body.currency ?? null,
        minSubtotalMinor: body.minSubtotalMinor ?? null,
        maxDiscountMinor: body.maxDiscountMinor ?? null,
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt === null || body.endsAt === undefined ? null : new Date(body.endsAt),
        usageLimitTotal: body.usageLimitTotal ?? null,
        usageLimitPerUser: body.usageLimitPerUser ?? null,
        appliesTo: body.appliesTo,
        targetIds: body.targetIds,
        status: body.status,
      },
      requestMetadata(request),
    );
    return serializeCoupon(coupon);
  }

  @Get('tax-rates')
  @RequirePermissions('pricing:read')
  @ApiOperation(operation('adminListTaxRates', 'List internal tax-rate records'))
  @ApiOkResponse({ type: [TaxRateResponseDto] })
  async listTaxRates(@Req() request: FastifyRequest): Promise<readonly TaxRateResponseDto[]> {
    return (await this.pricing.listTaxRates(requestPrincipal(request))).map(serializeTaxRate);
  }

  @Post('tax-rates')
  @RequirePermissions('pricing:write')
  @ApiOperation(operation('adminCreateTaxRate', 'Create a validated tax-rate record'))
  @ApiCreatedResponse({ type: TaxRateResponseDto })
  async createTaxRate(
    @Req() request: FastifyRequest,
    @Body() body: CreateTaxRateDto,
  ): Promise<TaxRateResponseDto> {
    const rate = await this.pricing.createTaxRate(
      requestPrincipal(request),
      {
        code: body.code,
        rateBps: body.rateBps,
        country: body.country,
        region: body.region ?? null,
        isInclusive: body.isInclusive,
        isActive: body.isActive,
      },
      requestMetadata(request),
    );
    return serializeTaxRate(rate);
  }
}
