import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiParam,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { AdminOrdersService, type AdminOrderQuery } from '@honey/backend';
import { RequirePermissions, RequireStaffSession } from '../../http/auth/authorization.js';
import { requestMetadata, requestPrincipal } from '../../http/auth/request-principal.js';
import { AdminIdParamDto, AdminPageQueryDto } from '../../http/admin/admin-query.dto.js';

const statuses = [
  'PENDING_PAYMENT',
  'PAID',
  'PROCESSING',
  'PARTIALLY_FULFILLED',
  'FULFILLED',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'FAILED',
];
class OrderIdParamDto extends AdminIdParamDto {}
class NotesQueryDto extends AdminPageQueryDto {}
class OrdersQueryDto extends AdminPageQueryDto implements AdminOrderQuery {
  @ApiPropertyOptional({ type: String, minLength: 3, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  q?: string;
  @ApiPropertyOptional({ enum: statuses }) @IsOptional() @IsIn(statuses) status?: NonNullable<
    AdminOrderQuery['status']
  >;
  @ApiPropertyOptional({
    enum: ['UNPAID', 'AUTHORIZED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED'],
  })
  @IsOptional()
  @IsIn(['UNPAID', 'AUTHORIZED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED'])
  paymentStatus?: NonNullable<AdminOrderQuery['paymentStatus']>;
  @ApiPropertyOptional({ enum: ['UNFULFILLED', 'PARTIAL', 'FULFILLED'] })
  @IsOptional()
  @IsIn(['UNFULFILLED', 'PARTIAL', 'FULFILLED'])
  fulfilmentStatus?: NonNullable<AdminOrderQuery['fulfilmentStatus']>;
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string;
}
class NoteInputDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}
class OrderSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) number!: string;
  @ApiProperty({ type: String }) email!: string;
  @ApiProperty({ type: String }) currency!: string;
  @ApiProperty({ enum: statuses }) status!: string;
  @ApiProperty({ type: String }) paymentStatus!: string;
  @ApiProperty({ type: String }) fulfilmentStatus!: string;
  @ApiProperty({ type: String }) grandTotalMinor!: string;
  @ApiProperty({ type: String, format: 'date-time' }) placedAt!: string;
}
class OrderPageDto {
  @ApiProperty({ type: [OrderSummaryDto] }) items!: OrderSummaryDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
class NoteDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) body!: string;
  @ApiProperty({ type: String, nullable: true }) actorUserId!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}
class NotePageDto {
  @ApiProperty({ type: [NoteDto] }) items!: NoteDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
class OrderLineDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) sku!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) productName!: object;
  @ApiProperty({ type: 'object', additionalProperties: true }) variantName!: object;
  @ApiProperty({ type: Number }) quantity!: number;
  @ApiProperty({ type: String }) unitPriceMinor!: string;
  @ApiProperty({ type: String }) discountMinor!: string;
  @ApiProperty({ type: String }) taxMinor!: string;
  @ApiProperty({ type: String }) totalMinor!: string;
}
class OrderHistoryDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String, nullable: true }) fromStatus!: string | null;
  @ApiProperty({ type: String }) toStatus!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}
class OrderDetailDto extends OrderSummaryDto {
  @ApiProperty({ type: String, nullable: true }) customerId!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: String }) localeAtPurchase!: string;
  @ApiProperty({ type: String }) subtotalMinor!: string;
  @ApiProperty({ type: String }) discountTotalMinor!: string;
  @ApiProperty({ type: String }) taxTotalMinor!: string;
  @ApiProperty({ type: String }) shippingTotalMinor!: string;
  @ApiProperty({ type: String }) refundedTotalMinor!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) shippingAddress!: object;
  @ApiProperty({ type: 'object', additionalProperties: true }) billingAddress!: object;
  @ApiProperty({ type: 'object', additionalProperties: true }) shippingMethod!: object;
  @ApiProperty({ type: [OrderLineDto] }) lines!: OrderLineDto[];
  @ApiProperty({ type: [OrderHistoryDto] }) history!: OrderHistoryDto[];
}
@ApiTags('Admin orders')
@RequireStaffSession()
@Controller('v1/admin/orders')
export class AdminOrdersController {
  constructor(@Inject(AdminOrdersService) private readonly orders: AdminOrdersService) {}
  @Get()
  @RequirePermissions('order:read')
  @ApiOperation({
    operationId: 'listAdminOrders',
    summary: 'Read a bounded staff order page',
    description:
      'STAFF order:read query with exact order-number or customer-email filters and keyset pagination.',
  })
  @ApiOkResponse({ type: OrderPageDto })
  list(@Query() query: OrdersQueryDto, @Req() request: FastifyRequest) {
    return this.orders.list(requestPrincipal(request), query);
  }
  @Get(':id')
  @RequirePermissions('order:read')
  @ApiOperation({
    operationId: 'getAdminOrder',
    summary: 'Read immutable staff order snapshots',
    description:
      'Reads frozen order lines, addresses and stored totals. Requires STAFF order:read.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: OrderDetailDto })
  detail(@Param() params: OrderIdParamDto, @Req() request: FastifyRequest) {
    return this.orders.detail(requestPrincipal(request), params.id);
  }
  @Get(':id/notes')
  @RequirePermissions('order:read')
  @ApiOperation({
    operationId: 'listAdminOrderNotes',
    summary: 'Read internal order notes',
    description: 'Reads a bounded page of staff-only notes after checking the order exists.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: NotePageDto })
  notes(
    @Param() params: OrderIdParamDto,
    @Query() query: NotesQueryDto,
    @Req() request: FastifyRequest,
  ) {
    return this.orders.notes(requestPrincipal(request), params.id, query);
  }
  @Post(':id/notes')
  @HttpCode(200)
  @RequirePermissions('order:note')
  @ApiOperation({
    operationId: 'addAdminOrderNote',
    summary: 'Add one internal plain-text order note and audit atomically',
    description:
      'STAFF order:note write protected by CSRF. Stores bounded internal text and audit metadata in one transaction.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: NoteDto })
  addNote(
    @Param() params: OrderIdParamDto,
    @Body() body: NoteInputDto,
    @Req() request: FastifyRequest,
  ) {
    return this.orders.addNote(
      requestPrincipal(request),
      params.id,
      body.body,
      requestMetadata(request),
    );
  }
}
