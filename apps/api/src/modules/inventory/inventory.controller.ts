import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import type { FastifyRequest } from 'fastify';

import { ADJUSTMENT_REASONS, InventoryService, STOCK_LOCATION_TYPES } from '@honey/backend';
import { RequirePermissions } from '../../http/auth/authorization.js';
import { requestMetadata, requestPrincipal } from '../../http/auth/request-principal.js';

class IdParamDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  id!: string;
}

class VariantIdParamDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  variantId!: string;
}

class VariantLocationParamsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  variantId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  stockLocationId!: string;
}

class PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() limit?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() variantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() stockLocationId?: string;
}

class LocationBodyDto {
  @ApiProperty() @IsString() @MaxLength(40) code!: string;
  @ApiProperty() @IsString() @MaxLength(160) name!: string;
  @ApiProperty({ enum: STOCK_LOCATION_TYPES })
  @IsIn(STOCK_LOCATION_TYPES)
  type!: (typeof STOCK_LOCATION_TYPES)[number];
  @ApiProperty() @IsBoolean() isSellable!: boolean;
  @ApiProperty() @IsBoolean() isDefault!: boolean;
}

class AdjustmentBodyDto {
  @ApiProperty() @IsUUID() variantId!: string;
  @ApiProperty() @IsUUID() stockLocationId!: string;
  @ApiProperty() @IsInt() delta!: number;
  @ApiProperty({ enum: ADJUSTMENT_REASONS })
  @IsIn(ADJUSTMENT_REASONS)
  reason!: (typeof ADJUSTMENT_REASONS)[number];
  @ApiProperty() @IsString() @MaxLength(500) note!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) expectedVersion?: number;
}

class PlanningBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) reorderPoint?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) safetyStock?: number;
}

class ReconcileBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() repair?: boolean;
}

function operation(operationId: string, summary: string) {
  return { operationId, summary, description: `${summary}.` };
}

@ApiTags('Inventory Admin')
@Controller('v1/admin/inventory')
export class AdminInventoryController {
  constructor(@Inject(InventoryService) private readonly inventory: InventoryService) {}

  @Get('locations')
  @RequirePermissions('inventory:read')
  @ApiOperation(operation('adminListStockLocations', 'List stock locations'))
  listLocations(@Req() request: FastifyRequest) {
    return this.inventory.listLocations(requestPrincipal(request));
  }

  @Post('locations')
  @RequirePermissions('inventory:adjust')
  @ApiOperation(operation('adminCreateStockLocation', 'Create a stock location'))
  createLocation(@Req() request: FastifyRequest, @Body() body: LocationBodyDto) {
    return this.inventory.createLocation(requestPrincipal(request), body, requestMetadata(request));
  }

  @Patch('locations/:id')
  @RequirePermissions('inventory:adjust')
  @ApiOperation(operation('adminUpdateStockLocation', 'Update a stock location'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  updateLocation(
    @Req() request: FastifyRequest,
    @Param() params: IdParamDto,
    @Body() body: LocationBodyDto,
  ) {
    return this.inventory.updateLocation(
      requestPrincipal(request),
      params.id,
      body,
      requestMetadata(request),
    );
  }

  @Get('items')
  @RequirePermissions('inventory:read')
  @ApiOperation(operation('adminListInventoryItems', 'List inventory items'))
  listItems(@Req() request: FastifyRequest, @Query() query: PageQueryDto) {
    return this.inventory.listItems(requestPrincipal(request), {
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
      ...(query.variantId === undefined ? {} : { variantId: query.variantId }),
      ...(query.stockLocationId === undefined ? {} : { stockLocationId: query.stockLocationId }),
    });
  }

  @Get('items/:variantId/:stockLocationId')
  @RequirePermissions('inventory:read')
  @ApiOperation(operation('adminGetInventoryItem', 'Read one inventory item'))
  @ApiParam({ name: 'variantId', type: String, format: 'uuid' })
  @ApiParam({ name: 'stockLocationId', type: String, format: 'uuid' })
  getItem(@Req() request: FastifyRequest, @Param() params: VariantLocationParamsDto) {
    return this.inventory.getItem(
      requestPrincipal(request),
      params.variantId,
      params.stockLocationId,
    );
  }

  @Patch('items/:variantId/:stockLocationId/planning')
  @RequirePermissions('inventory:adjust')
  @ApiOperation(operation('adminUpdateInventoryPlanning', 'Update inventory planning fields'))
  @ApiParam({ name: 'variantId', type: String, format: 'uuid' })
  @ApiParam({ name: 'stockLocationId', type: String, format: 'uuid' })
  setPlanning(
    @Req() request: FastifyRequest,
    @Param() params: VariantLocationParamsDto,
    @Body() body: PlanningBodyDto,
  ) {
    return this.inventory.setPlanning(
      requestPrincipal(request),
      params.variantId,
      params.stockLocationId,
      body,
      requestMetadata(request),
    );
  }

  @Get('ledger/:variantId')
  @RequirePermissions('inventory:read')
  @ApiOperation(operation('adminListStockLedger', 'List stock ledger entries for a variant'))
  @ApiParam({ name: 'variantId', type: String, format: 'uuid' })
  listLedger(
    @Req() request: FastifyRequest,
    @Param() params: VariantIdParamDto,
    @Query() query: PageQueryDto,
  ) {
    return this.inventory.listLedger(requestPrincipal(request), params.variantId, {
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
    });
  }

  @Post('adjustments')
  @RequirePermissions('inventory:adjust')
  @ApiOperation(operation('adminAdjustInventory', 'Apply a privileged inventory adjustment'))
  adjust(@Req() request: FastifyRequest, @Body() body: AdjustmentBodyDto) {
    return this.inventory.adjust(requestPrincipal(request), body, requestMetadata(request));
  }

  @Post('reconciliation')
  @RequirePermissions('inventory:adjust')
  @ApiOperation(
    operation('adminReconcileInventory', 'Detect and optionally repair inventory drift'),
  )
  reconcile(@Req() request: FastifyRequest, @Body() body: ReconcileBodyDto) {
    return this.inventory.reconcile(
      requestPrincipal(request),
      requestMetadata(request),
      body.repair === true,
    );
  }
}
