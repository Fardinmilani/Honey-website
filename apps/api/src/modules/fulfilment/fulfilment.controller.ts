import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
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
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { FulfilmentService, ValidationAppError } from '@honey/backend';
import { requestPrincipal } from '../../http/auth/request-principal.js';
import { RequirePermissions } from '../../http/auth/authorization.js';
import { ProblemDetailsDto } from '../../http/errors/problem-details.js';

class OrderIdParamDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  orderId!: string;
}

class ShipmentIdParamDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  shipmentId!: string;
}

class ShipmentLineDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  orderLineId!: string;

  @ApiProperty({ type: Number, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

class CreateShipmentDto {
  @ApiProperty({ type: [ShipmentLineDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ShipmentLineDto)
  lines!: ShipmentLineDto[];

  @ApiPropertyOptional({ type: String, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[^\r\n]+$/u)
  trackingNumber?: string;
}

class ShipmentResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  orderId!: string;

  @ApiProperty({
    enum: ['PENDING', 'LABEL_CREATED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'RETURNED'],
  })
  status!: string;

  @ApiProperty({ type: String, nullable: true })
  trackingNumber!: string | null;

  @ApiProperty({ type: String, nullable: true })
  trackingUrl!: string | null;
}

class CancelFulfilmentOrderResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  cancelled!: boolean;
}

function ensureEmptyBody(body: unknown): void {
  if (body === undefined || body === null) return;
  if (typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0) return;
  throw new ValidationAppError([{ path: 'body', code: 'UNEXPECTED_INPUT' }]);
}

function noStore(reply: FastifyReply): void {
  reply.header('Cache-Control', 'private, no-store');
}

@ApiTags('Fulfilment')
@Controller('v1/admin/fulfilment')
export class AdminFulfilmentController {
  constructor(@Inject(FulfilmentService) private readonly fulfilment: FulfilmentService) {}

  @Get('orders/:orderId')
  @RequirePermissions('order:read')
  @ApiOperation({
    operationId: 'getFulfilmentOrder',
    summary: 'Read staff fulfilment details',
    description: 'Returns order lines and shipment state to staff with order:read permission.',
  })
  @ApiParam({ name: 'orderId', type: String, format: 'uuid' })
  @ApiOkResponse({ description: 'Order lines and shipments for staff fulfilment.' })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async getOrder(
    @Param() params: OrderIdParamDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    noStore(reply);
    return this.fulfilment.getStaffOrder(requestPrincipal(request), params.orderId);
  }

  @Post('orders/:orderId/shipments')
  @RequirePermissions('order:write')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'createFulfilmentShipment',
    summary: 'Prepare a shipment draft without moving physical stock',
    description: 'Creates one idempotent shipment draft for paid, allocated order lines.',
  })
  @ApiParam({ name: 'orderId', type: String, format: 'uuid' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: ShipmentResponseDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async createShipment(
    @Param() params: OrderIdParamDto,
    @Body() body: CreateShipmentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    if (idempotencyKey === undefined) {
      throw new ValidationAppError([{ path: 'idempotencyKey', code: 'IDEMPOTENCY_KEY_REQUIRED' }]);
    }
    noStore(reply);
    return this.fulfilment.createShipment(
      requestPrincipal(request),
      {
        orderId: params.orderId,
        lines: body.lines.map((line) => ({
          orderLineId: line.orderLineId,
          quantity: line.quantity,
        })),
        idempotencyKey,
        ...(body.trackingNumber === undefined ? {} : { trackingNumber: body.trackingNumber }),
      },
      { requestId: request.id, clientIp: request.ip },
    );
  }

  @Post('shipments/:shipmentId/dispatch')
  @RequirePermissions('order:write')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'dispatchFulfilmentShipment',
    summary: 'Confirm physical dispatch and consume allocated stock once',
    description:
      'Atomically moves allocated stock out of inventory and marks the shipment in transit.',
  })
  @ApiParam({ name: 'shipmentId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: ShipmentResponseDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  async dispatch(
    @Param() params: ShipmentIdParamDto,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    ensureEmptyBody(body);
    noStore(reply);
    return this.fulfilment.markShipped(requestPrincipal(request), params.shipmentId, {
      requestId: request.id,
      clientIp: request.ip,
    });
  }

  @Post('shipments/:shipmentId/deliver')
  @RequirePermissions('order:write')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'deliverFulfilmentShipment',
    summary: 'Record manual delivery',
    description: 'Records delivery for a shipment already in transit without moving stock again.',
  })
  @ApiParam({ name: 'shipmentId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: ShipmentResponseDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  async deliver(
    @Param() params: ShipmentIdParamDto,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    ensureEmptyBody(body);
    noStore(reply);
    return this.fulfilment.markDelivered(requestPrincipal(request), params.shipmentId, {
      requestId: request.id,
      clientIp: request.ip,
    });
  }

  @Post('orders/:orderId/cancel')
  @RequirePermissions('order:cancel')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'cancelUnshippedFulfilmentOrder',
    summary: 'Cancel an unshipped order and release its allocation',
    description:
      'Cancels an order before any shipment draft exists and releases its allocated stock.',
  })
  @ApiParam({ name: 'orderId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: CancelFulfilmentOrderResponseDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  async cancel(
    @Param() params: OrderIdParamDto,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    ensureEmptyBody(body);
    noStore(reply);
    await this.fulfilment.cancelBeforeShipment(requestPrincipal(request), params.orderId, {
      requestId: request.id,
      clientIp: request.ip,
    });
    return { cancelled: true };
  }
}
