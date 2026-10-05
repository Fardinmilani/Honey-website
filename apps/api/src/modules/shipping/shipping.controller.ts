import { Body, Controller, Get, HttpCode, Inject, Param, Put, Req, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ShippingSettingsService } from '@honey/backend';
import { requestPrincipal } from '../../http/auth/request-principal.js';
import { RequirePermissions } from '../../http/auth/authorization.js';
import { ProblemDetailsDto } from '../../http/errors/problem-details.js';

class ConfigIdParamDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  id!: string;
}

class ZoneDto {
  @ApiProperty({ type: String, maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @Matches(/^[A-Z]{2}$/u, { each: true })
  countries!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  provinces!: string[];

  @ApiProperty({ type: Number })
  @IsInt()
  priority!: number;
}

class MethodTranslationDto {
  @ApiProperty({ enum: ['fa', 'en'] })
  @IsIn(['fa', 'en'])
  locale!: 'fa' | 'en';

  @ApiProperty({ type: String, maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

class MethodDto {
  @ApiProperty({ type: String, example: 'STANDARD' })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,31}$/u)
  code!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  zoneId!: string;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  isActive!: boolean;

  @ApiProperty({ type: Number })
  @IsInt()
  sortOrder!: number;

  @ApiProperty({ type: [MethodTranslationDto], minItems: 2, maxItems: 2 })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => MethodTranslationDto)
  translations!: MethodTranslationDto[];
}

class RateDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  methodId!: string;

  @ApiProperty({ type: String, example: 'IRR' })
  @Matches(/^[A-Z]{3}$/u)
  currency!: string;

  @ApiProperty({ type: String, pattern: '^\\d+$' })
  @Matches(/^\d+$/u)
  baseMinor!: string;

  @ApiProperty({ type: String, pattern: '^\\d+$' })
  @Matches(/^\d+$/u)
  perKgMinor!: string;

  @ApiPropertyOptional({ type: String, nullable: true, pattern: '^\\d+$' })
  @IsOptional()
  @Matches(/^\d+$/u)
  freeOverSubtotalMinor?: string | null;

  @ApiProperty({ type: Number, minimum: 0 })
  @IsInt()
  @Min(0)
  minWeightGrams!: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxWeightGrams?: number | null;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601()
  validFrom!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601()
  validTo?: string | null;
}

function actor(request: FastifyRequest) {
  return {
    actorUserId: requestPrincipal(request).userId,
    requestId: request.id,
    clientIp: request.ip,
  };
}

function noStore(reply: FastifyReply): void {
  reply.header('Cache-Control', 'private, no-store');
}

@ApiTags('Shipping')
@Controller('v1/admin/shipping')
export class AdminShippingController {
  constructor(
    @Inject(ShippingSettingsService) private readonly settings: ShippingSettingsService,
  ) {}

  @Get('configuration')
  @RequirePermissions('settings:read')
  @ApiOperation({
    operationId: 'listShippingConfiguration',
    summary: 'Read shipping configuration',
    description:
      'Returns configured shipping zones, methods, translations, and rate rules for staff.',
  })
  @ApiOkResponse({ description: 'Zones, methods, translations, and rates.' })
  async list(@Res({ passthrough: true }) reply: FastifyReply) {
    noStore(reply);
    return this.settings.list();
  }

  @Put('zones/:id')
  @RequirePermissions('settings:write')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'upsertShippingZone',
    summary: 'Configure a shipping zone',
    description: 'Creates or replaces one server-owned destination zone.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ description: 'Saved zone ID.' })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async upsertZone(
    @Param() params: ConfigIdParamDto,
    @Body() body: ZoneDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    noStore(reply);
    return this.settings.upsertZone({ id: params.id, ...body }, actor(request));
  }

  @Put('methods/:id')
  @RequirePermissions('settings:write')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'upsertShippingMethod',
    summary: 'Configure a shipping method',
    description: 'Creates or replaces one localized manual shipping method.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ description: 'Saved method ID.' })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async upsertMethod(
    @Param() params: ConfigIdParamDto,
    @Body() body: MethodDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    noStore(reply);
    return this.settings.upsertMethod(
      {
        id: params.id,
        code: body.code,
        zoneId: body.zoneId,
        isActive: body.isActive,
        sortOrder: body.sortOrder,
        translations: body.translations.map((item) => ({
          locale: item.locale,
          name: item.name,
          description: item.description ?? null,
        })),
      },
      actor(request),
    );
  }

  @Put('rates/:id')
  @RequirePermissions('settings:write')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'upsertShippingRate',
    summary: 'Configure a shipping rate',
    description: 'Creates or replaces one integer-minor-unit manual rate rule.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ description: 'Saved rate ID.' })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async upsertRate(
    @Param() params: ConfigIdParamDto,
    @Body() body: RateDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    noStore(reply);
    return this.settings.upsertRate(
      {
        id: params.id,
        methodId: body.methodId,
        currency: body.currency,
        baseMinor: body.baseMinor,
        perKgMinor: body.perKgMinor,
        freeOverSubtotalMinor: body.freeOverSubtotalMinor ?? null,
        minWeightGrams: body.minWeightGrams,
        maxWeightGrams: body.maxWeightGrams ?? null,
        validFrom: body.validFrom,
        validTo: body.validTo ?? null,
      },
      actor(request),
    );
  }
}
