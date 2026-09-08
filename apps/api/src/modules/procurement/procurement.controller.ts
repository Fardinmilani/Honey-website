import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { FastifyRequest } from 'fastify';

import {
  ProcurementService,
  PURCHASE_ORDER_STATUSES,
  SUPPLIER_STATUSES,
  ValidationAppError,
} from '@honey/backend';
import { RequirePermissions } from '../../http/auth/authorization.js';
import { requestMetadata, requestPrincipal } from '../../http/auth/request-principal.js';
import { ProblemDetailsDto } from '../../http/errors/problem-details.js';

class IdParamDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  id!: string;
}

class SupplierPageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() limit?: string;
  @ApiPropertyOptional({ enum: SUPPLIER_STATUSES })
  @IsOptional()
  @IsIn([...SUPPLIER_STATUSES])
  status?: (typeof SUPPLIER_STATUSES)[number];
}

class PurchaseOrderPageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() limit?: string;
  @ApiPropertyOptional({ enum: PURCHASE_ORDER_STATUSES })
  @IsOptional()
  @IsIn([...PURCHASE_ORDER_STATUSES])
  status?: (typeof PURCHASE_ORDER_STATUSES)[number];
  @ApiPropertyOptional() @IsOptional() @IsUUID() supplierId?: string;
}

class SupplierBodyDto {
  @ApiProperty() @IsString() @MaxLength(40) code!: string;
  @ApiProperty() @IsString() @MaxLength(200) legalName!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() contactName?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() email?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() phone?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() address?: string | null;
  @ApiProperty({ enum: SUPPLIER_STATUSES })
  @IsIn(SUPPLIER_STATUSES)
  status!: (typeof SUPPLIER_STATUSES)[number];
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() qualityRating?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() notes?: string | null;
}

class PurchaseOrderLineBodyDto {
  @ApiProperty() @IsString() @MaxLength(240) description!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() variantId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() harvestBatchId?: string | null;
  @ApiProperty() @IsInt() @Min(1) quantityOrdered!: number;
  @ApiProperty({ type: String }) @IsString() unitCostMinor!: string;
  @ApiProperty({ type: String }) @IsString() taxMinor!: string;
}

class PurchaseOrderBodyDto {
  @ApiProperty() @IsString() @MaxLength(40) number!: string;
  @ApiProperty() @IsUUID() supplierId!: string;
  @ApiProperty() @IsString() currency!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() expectedAt?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() notes?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() destinationStockLocationId?:
    string | null;
  @ApiProperty({ type: String }) @IsString() freightCostMinor!: string;
  @ApiProperty({ type: String }) @IsString() dutyCostMinor!: string;
  @ApiProperty({ type: String }) @IsString() otherCostMinor!: string;
  @ApiProperty({ type: [PurchaseOrderLineBodyDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineBodyDto)
  lines!: PurchaseOrderLineBodyDto[];
}

class PurchaseOrderLinesBodyDto {
  @ApiProperty({ type: [PurchaseOrderLineBodyDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineBodyDto)
  lines!: PurchaseOrderLineBodyDto[];
}

class TransitionBodyDto {
  @ApiProperty({ enum: PURCHASE_ORDER_STATUSES })
  @IsIn(['DRAFT', 'SUBMITTED', 'CONFIRMED', 'CANCELLED'])
  status!: 'DRAFT' | 'SUBMITTED' | 'CONFIRMED' | 'CANCELLED';
}

class ReceiptLineBodyDto {
  @ApiProperty() @IsUUID() purchaseOrderLineId!: string;
  @ApiProperty() @IsInt() @Min(0) quantityAccepted!: number;
  @ApiProperty() @IsInt() @Min(0) quantityRejected!: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() rejectionReason?:
    string | null;
  @ApiProperty() @IsUUID() harvestBatchId!: string;
}

class GoodsReceiptBodyDto {
  @ApiProperty() @IsUUID() stockLocationId!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() notes?: string | null;
  @ApiProperty({ type: [ReceiptLineBodyDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineBodyDto)
  lines!: ReceiptLineBodyDto[];
}

function operation(operationId: string, summary: string) {
  return { operationId, summary, description: `${summary}.` };
}

@ApiTags('Procurement Admin')
@Controller('v1/admin/procurement')
export class AdminProcurementController {
  constructor(@Inject(ProcurementService) private readonly procurement: ProcurementService) {}

  @Get('suppliers')
  @RequirePermissions('procurement:read')
  @ApiOperation(operation('adminListSuppliers', 'List suppliers'))
  listSuppliers(@Req() request: FastifyRequest, @Query() query: SupplierPageQueryDto) {
    return this.procurement.listSuppliers(requestPrincipal(request), {
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
      ...(query.status === undefined ? {} : { status: query.status }),
    });
  }

  @Get('suppliers/:id')
  @RequirePermissions('procurement:read')
  @ApiOperation(operation('adminGetSupplier', 'Read one supplier'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  getSupplier(@Req() request: FastifyRequest, @Param() params: IdParamDto) {
    return this.procurement.getSupplier(requestPrincipal(request), params.id);
  }

  @Post('suppliers')
  @RequirePermissions('procurement:write')
  @ApiOperation(operation('adminCreateSupplier', 'Create a supplier'))
  @ApiCreatedResponse({ type: ProblemDetailsDto })
  createSupplier(@Req() request: FastifyRequest, @Body() body: SupplierBodyDto) {
    return this.procurement.createSupplier(
      requestPrincipal(request),
      {
        ...body,
        contactName: body.contactName ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        address: body.address ?? null,
        qualityRating: body.qualityRating ?? null,
        notes: body.notes ?? null,
      },
      requestMetadata(request),
    );
  }

  @Patch('suppliers/:id')
  @RequirePermissions('procurement:write')
  @ApiOperation(operation('adminUpdateSupplier', 'Update a supplier'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  updateSupplier(
    @Req() request: FastifyRequest,
    @Param() params: IdParamDto,
    @Body() body: SupplierBodyDto,
  ) {
    return this.procurement.updateSupplier(
      requestPrincipal(request),
      params.id,
      body,
      requestMetadata(request),
    );
  }

  @Get('purchase-orders')
  @RequirePermissions('procurement:read')
  @ApiOperation(operation('adminListPurchaseOrders', 'List purchase orders'))
  listOrders(@Req() request: FastifyRequest, @Query() query: PurchaseOrderPageQueryDto) {
    return this.procurement.listPurchaseOrders(requestPrincipal(request), {
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      ...(query.limit === undefined ? {} : { limit: Number(query.limit) }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.supplierId === undefined ? {} : { supplierId: query.supplierId }),
    });
  }

  @Get('purchase-orders/:id')
  @RequirePermissions('procurement:read')
  @ApiOperation(operation('adminGetPurchaseOrder', 'Read one purchase order'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  getOrder(@Req() request: FastifyRequest, @Param() params: IdParamDto) {
    return this.procurement.getPurchaseOrder(requestPrincipal(request), params.id);
  }

  @Get('purchase-orders/:id/landed-cost')
  @RequirePermissions('procurement:read')
  @ApiOperation(operation('adminGetLandedCost', 'Read internal landed-cost allocation'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  async landedCost(@Req() request: FastifyRequest, @Param() params: IdParamDto) {
    const order = await this.procurement.getPurchaseOrder(requestPrincipal(request), params.id);
    return this.procurement.landedCost(requestPrincipal(request), order);
  }

  @Post('purchase-orders')
  @RequirePermissions('procurement:write')
  @ApiOperation(operation('adminCreatePurchaseOrder', 'Create a draft purchase order'))
  createOrder(@Req() request: FastifyRequest, @Body() body: PurchaseOrderBodyDto) {
    return this.procurement.createPurchaseOrder(
      requestPrincipal(request),
      {
        number: body.number,
        supplierId: body.supplierId,
        currency: body.currency,
        expectedAt: body.expectedAt ?? null,
        notes: body.notes ?? null,
        destinationStockLocationId: body.destinationStockLocationId ?? null,
        freightCostMinor: BigInt(body.freightCostMinor),
        dutyCostMinor: BigInt(body.dutyCostMinor),
        otherCostMinor: BigInt(body.otherCostMinor),
        lines: body.lines.map((line) => ({
          description: line.description,
          variantId: line.variantId ?? null,
          harvestBatchId: line.harvestBatchId ?? null,
          quantityOrdered: line.quantityOrdered,
          unitCostMinor: BigInt(line.unitCostMinor),
          taxMinor: BigInt(line.taxMinor),
        })),
      },
      requestMetadata(request),
    );
  }

  @Post('purchase-orders/:id/lines')
  @RequirePermissions('procurement:write')
  @ApiOperation(operation('adminReplacePurchaseOrderLines', 'Replace draft purchase-order lines'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  replaceLines(
    @Req() request: FastifyRequest,
    @Param() params: IdParamDto,
    @Body() body: PurchaseOrderLinesBodyDto,
  ) {
    return this.procurement.replaceLines(
      requestPrincipal(request),
      params.id,
      body.lines.map((line) => ({
        description: line.description,
        variantId: line.variantId ?? null,
        harvestBatchId: line.harvestBatchId ?? null,
        quantityOrdered: line.quantityOrdered,
        unitCostMinor: BigInt(line.unitCostMinor),
        taxMinor: BigInt(line.taxMinor),
      })),
      requestMetadata(request),
    );
  }

  @Post('purchase-orders/:id/transition')
  @RequirePermissions('procurement:write')
  @ApiOperation(
    operation('adminTransitionPurchaseOrder', 'Apply an explicit purchase-order transition'),
  )
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  transition(
    @Req() request: FastifyRequest,
    @Param() params: IdParamDto,
    @Body() body: TransitionBodyDto,
  ) {
    return this.procurement.transitionPurchaseOrder(
      requestPrincipal(request),
      params.id,
      body.status,
      requestMetadata(request),
    );
  }

  @Post('purchase-orders/:id/receipts')
  @RequirePermissions('procurement:write')
  @ApiOperation(operation('adminCreateGoodsReceipt', 'Receive goods against a purchase order'))
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  receive(
    @Req() request: FastifyRequest,
    @Param() params: IdParamDto,
    @Body() body: GoodsReceiptBodyDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    if (idempotencyKey === undefined) {
      throw new ValidationAppError([{ path: 'idempotencyKey', code: 'IDEMPOTENCY_KEY_REQUIRED' }]);
    }
    return this.procurement.receiveGoods(
      requestPrincipal(request),
      params.id,
      {
        stockLocationId: body.stockLocationId,
        notes: body.notes ?? null,
        lines: body.lines,
        idempotencyKey,
      },
      requestMetadata(request),
    );
  }
}
