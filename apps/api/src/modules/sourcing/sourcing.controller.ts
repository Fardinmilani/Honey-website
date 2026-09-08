import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { FastifyRequest } from 'fastify';

import { SourcingService } from '@honey/backend';
import { RequirePermissions } from '../../http/auth/authorization.js';
import { requestMetadata, requestPrincipal } from '../../http/auth/request-principal.js';
import { ProblemDetailsDto } from '../../http/errors/problem-details.js';

class IdParamDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  id!: string;
}

class ApiaryBodyDto {
  @ApiProperty() @IsString() @MaxLength(40) code!: string;
  @ApiProperty() @IsString() @MaxLength(160) name!: string;
  @ApiProperty() @IsString() @MaxLength(160) region!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(120) altitudeBand?:
    string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(2000) notes?:
    string | null;
  @ApiProperty() @IsBoolean() isOwnOperation!: boolean;
}

class ApiaryTranslationDto {
  @ApiProperty() @IsIn(['fa', 'en']) locale!: 'fa' | 'en';
  @ApiProperty() @IsString() @MaxLength(160) name!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(4000) description?:
    string | null;
}

class HarvestBatchBodyDto {
  @ApiProperty() @IsString() @MaxLength(80) batchCode!: string;
  @ApiProperty({ enum: ['OWN_PRODUCTION', 'SELECTED_SUPPLIER'] })
  @IsIn(['OWN_PRODUCTION', 'SELECTED_SUPPLIER'])
  sourcingType!: 'OWN_PRODUCTION' | 'SELECTED_SUPPLIER';
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() apiaryId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() supplierId?: string | null;
  @ApiProperty() @IsString() @MaxLength(80) harvestSeason!: string;
  @ApiProperty() @IsInt() @Min(1900) @Max(9999) harvestYear!: number;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  floralSources!: string[];
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() receivedAt?: string | null;
  @ApiProperty() @IsInt() @Min(1) quantityGrams!: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(2000) notes?:
    string | null;
}

class AllocationBodyDto {
  @ApiProperty() @IsUUID() harvestBatchId!: string;
  @ApiProperty() @IsUUID() variantId!: string;
  @ApiProperty() @IsInt() @Min(1) quantityUnits!: number;
  @ApiProperty() @IsString() packedAt!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(2000) notes?:
    string | null;
}

class IntakeBodyDto {
  @ApiProperty() @IsUUID() allocationId!: string;
  @ApiProperty() @IsUUID() stockLocationId!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() limit?: string;
}

function operation(operationId: string, summary: string) {
  return { operationId, summary, description: `${summary}.` };
}

@ApiTags('Sourcing Admin')
@Controller('v1/admin/sourcing')
export class AdminSourcingController {
  constructor(@Inject(SourcingService) private readonly sourcing: SourcingService) {}

  @Get('apiaries')
  @RequirePermissions('inventory:read')
  @ApiOperation(operation('adminListApiaries', 'List apiaries'))
  @ApiOkResponse({ type: ProblemDetailsDto })
  listApiaries(@Req() request: FastifyRequest) {
    return this.sourcing.listApiaries(requestPrincipal(request));
  }

  @Get('apiaries/:id')
  @RequirePermissions('inventory:read')
  @ApiOperation(operation('adminGetApiary', 'Read one apiary'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  getApiary(@Req() request: FastifyRequest, @Param() params: IdParamDto) {
    return this.sourcing.getApiary(requestPrincipal(request), params.id);
  }

  @Post('apiaries')
  @RequirePermissions('inventory:adjust')
  @ApiOperation(operation('adminCreateApiary', 'Create an apiary'))
  @ApiCreatedResponse({ type: ProblemDetailsDto })
  createApiary(@Req() request: FastifyRequest, @Body() body: ApiaryBodyDto) {
    return this.sourcing.createApiary(requestPrincipal(request), body, requestMetadata(request));
  }

  @Patch('apiaries/:id')
  @RequirePermissions('inventory:adjust')
  @ApiOperation(operation('adminUpdateApiary', 'Update an apiary'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  updateApiary(
    @Req() request: FastifyRequest,
    @Param() params: IdParamDto,
    @Body() body: ApiaryBodyDto,
  ) {
    return this.sourcing.updateApiary(
      requestPrincipal(request),
      params.id,
      body,
      requestMetadata(request),
    );
  }

  @Post('apiaries/:id/translations')
  @RequirePermissions('inventory:adjust')
  @ApiOperation(operation('adminUpsertApiaryTranslation', 'Upsert an apiary translation'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  upsertApiaryTranslation(
    @Req() request: FastifyRequest,
    @Param() params: IdParamDto,
    @Body() body: ApiaryTranslationDto,
  ) {
    return this.sourcing.upsertApiaryTranslation(
      requestPrincipal(request),
      params.id,
      {
        locale: body.locale,
        name: body.name,
        description: body.description ?? null,
      },
      requestMetadata(request),
    );
  }

  @Get('harvest-batches')
  @RequirePermissions('inventory:read')
  @ApiOperation(operation('adminListHarvestBatches', 'List harvest batches'))
  listBatches(@Req() request: FastifyRequest, @Query() query: PageQueryDto) {
    return this.sourcing.listHarvestBatches(requestPrincipal(request), {
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
    });
  }

  @Get('harvest-batches/:id')
  @RequirePermissions('inventory:read')
  @ApiOperation(operation('adminGetHarvestBatch', 'Read one harvest batch'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  getBatch(@Req() request: FastifyRequest, @Param() params: IdParamDto) {
    return this.sourcing.getHarvestBatch(requestPrincipal(request), params.id);
  }

  @Post('harvest-batches')
  @RequirePermissions('inventory:adjust')
  @ApiOperation(operation('adminCreateHarvestBatch', 'Create a harvest batch'))
  createBatch(@Req() request: FastifyRequest, @Body() body: HarvestBatchBodyDto) {
    return this.sourcing.createHarvestBatch(
      requestPrincipal(request),
      body,
      requestMetadata(request),
    );
  }

  @Get('harvest-batches/:id/allocations')
  @RequirePermissions('inventory:read')
  @ApiOperation(operation('adminListBatchAllocations', 'List allocations for a harvest batch'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  listAllocations(@Req() request: FastifyRequest, @Param() params: IdParamDto) {
    return this.sourcing.listAllocations(requestPrincipal(request), params.id);
  }

  @Post('allocations')
  @RequirePermissions('inventory:adjust')
  @ApiOperation(operation('adminCreateBatchAllocation', 'Create a batch allocation'))
  createAllocation(@Req() request: FastifyRequest, @Body() body: AllocationBodyDto) {
    return this.sourcing.createAllocation(
      requestPrincipal(request),
      body,
      requestMetadata(request),
    );
  }

  @Post('production-intake')
  @RequirePermissions('inventory:adjust')
  @ApiOperation(operation('adminProductionIntake', 'Record own-production inventory intake'))
  intake(@Req() request: FastifyRequest, @Body() body: IntakeBodyDto) {
    return this.sourcing.intakeProduction(
      requestPrincipal(request),
      body,
      requestMetadata(request),
    );
  }
}
