import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import { ApiParam, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AdminPaymentsService } from '@honey/backend';
import { AdminIdParamDto, AdminPageQueryDto } from '../../http/admin/admin-query.dto.js';
import { RequirePermissions, RequireStaffSession } from '../../http/auth/authorization.js';
import { requestPrincipal } from '../../http/auth/request-principal.js';
class PaymentOrderIdDto extends AdminIdParamDto {}
class PaymentPageQueryDto extends AdminPageQueryDto {}
class AdminRefundDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) amountMinor!: string;
  @ApiProperty({ type: String }) reason!: string;
  @ApiProperty({ type: String }) status!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) completedAt!: string | null;
}
class AdminPaymentDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) orderId!: string;
  @ApiProperty({ type: String }) provider!: string;
  @ApiProperty({ type: String }) status!: string;
  @ApiProperty({ type: String }) currency!: string;
  @ApiProperty({ type: String }) amountMinor!: string;
  @ApiProperty({ type: String }) remainingRefundableMinor!: string;
  @ApiProperty({ type: Boolean }) canRefund!: boolean;
  @ApiProperty({ type: Boolean }) partialRefund!: boolean;
  @ApiProperty({ type: [AdminRefundDto] }) refunds!: readonly AdminRefundDto[];
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) paidAt!: string | null;
}
class AdminPaymentPageDto {
  @ApiProperty({ type: [AdminPaymentDto] }) items!: readonly AdminPaymentDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
@ApiTags('Admin payments')
@Controller('v1/admin/payments/orders')
@RequireStaffSession()
export class AdminPaymentQueryController {
  constructor(@Inject(AdminPaymentsService) private readonly payments: AdminPaymentsService) {}
  @Get(':id')
  @RequirePermissions('order:read')
  @ApiOperation({
    operationId: 'listAdminOrderPayments',
    summary: 'Read bounded safe payment and refund records',
    description:
      'Returns stored amounts, provider capabilities and bounded refund history without provider credentials or references. API authorization is authoritative.',
  })
  @ApiOkResponse({ type: AdminPaymentPageDto })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  list(
    @Param() params: PaymentOrderIdDto,
    @Query() query: PaymentPageQueryDto,
    @Req() request: FastifyRequest,
  ): Promise<AdminPaymentPageDto> {
    return this.payments.list(requestPrincipal(request), params.id, query);
  }
}
