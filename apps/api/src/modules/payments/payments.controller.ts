import {
  BadRequestException,
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
import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  IdentityService,
  PaymentsService,
  ValidationAppError,
  type PaymentProjection,
} from '@honey/backend';
import type { ApiConfig } from '../../config/api-config.js';
import { Public, RequirePermissions } from '../../http/auth/authorization.js';
import { ProblemDetailsDto } from '../../http/errors/problem-details.js';
import { requestPrincipal } from '../../http/auth/request-principal.js';

class StartPaymentDto {
  @ApiProperty({ type: String, example: 'HNY-2026-000123' })
  @IsString()
  @Matches(/^HNY-[0-9]{4}-[0-9]{6}$/u)
  orderNumber!: string;
}

class PaymentIdParamDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  id!: string;
}

class AdminPaymentIdParamDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  paymentId!: string;
}

class ProviderParamDto {
  @ApiProperty({ type: String, example: 'zarinpal' })
  @IsString()
  @MaxLength(32)
  provider!: string;
}

class RefundRequestDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '50000',
    description: 'Omit to refund the full remaining amount.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[1-9][0-9]*$/u)
  amountMinor?: string | null;

  @ApiProperty({ type: String, minLength: 3, maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

class MoneyDto {
  @ApiProperty({ type: String, example: '125000' })
  amountMinor!: string;

  @ApiProperty({ type: String, example: 'IRR' })
  currency!: string;
}

class PaymentResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, example: 'HNY-2026-000123' })
  orderNumber!: string;

  @ApiProperty({
    enum: [
      'CREATED',
      'PENDING',
      'AUTHORIZED',
      'PAID',
      'FAILED',
      'CANCELLED',
      'EXPIRED',
      'REFUNDED',
      'PARTIALLY_REFUNDED',
    ],
  })
  status!: string;

  @ApiProperty({ type: String })
  provider!: string;

  @ApiProperty({ type: MoneyDto })
  amount!: MoneyDto;

  @ApiProperty({ type: String, nullable: true })
  redirectUrl!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt!: string | null;
}

class RefundResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  paymentId!: string;

  @ApiProperty({ type: MoneyDto })
  amount!: MoneyDto;

  @ApiProperty({ type: String })
  reason!: string;

  @ApiProperty({ enum: ['REQUESTED', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'] })
  status!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt!: string | null;
}

type ControllerContext = Readonly<{ userId: string | null; anonymousId: string | null }>;

@ApiTags('Payments')
@Controller('v1/payments')
export class PaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject('API_CONFIG') private readonly config: ApiConfig,
  ) {}

  @Post()
  @Public()
  @HttpCode(200)
  @ApiOperation({
    operationId: 'startPayment',
    summary: 'Start (or resume) payment for an order',
    description:
      'Creates or resumes a payment from the server-owned order total. The client may send only the order number and an Idempotency-Key; money and card fields are rejected.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: PaymentResponseDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async start(
    @Body() body: StartPaymentDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers('idempotency-key') header: string | undefined,
  ): Promise<PaymentResponseDto> {
    if (header === undefined) {
      throw new ValidationAppError([{ path: 'idempotencyKey', code: 'IDEMPOTENCY_KEY_REQUIRED' }]);
    }
    const result = await this.payments.start(
      await this.#context(request),
      body.orderNumber,
      header,
    );
    if (result.replayed) reply.header('Idempotency-Replayed', 'true');
    return this.#respond(reply, result.payment);
  }

  @Get(':id')
  @Public()
  @ApiOperation({
    operationId: 'getPayment',
    summary: 'Read one owner-scoped payment',
    description:
      'Returns the caller-owned payment projection. Another owner receives 404. Responses are private and must not be stored.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: PaymentResponseDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async get(
    @Param() params: PaymentIdParamDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<PaymentResponseDto> {
    return this.#respond(reply, await this.payments.get(await this.#context(request), params.id));
  }

  @Post(':id/return')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    operationId: 'verifyPaymentReturn',
    summary: 'Verify the provider outcome after the customer returns from the gateway',
    description:
      'The browser only signals "check now" — every field it carries in the query string is ignored; the server re-verifies its own stored provider reference (ADR-0022).',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: PaymentResponseDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async verifyReturn(
    @Param() params: PaymentIdParamDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<PaymentResponseDto> {
    return this.#respond(
      reply,
      await this.payments.verifyReturn(await this.#context(request), params.id),
    );
  }

  async #context(request: FastifyRequest): Promise<ControllerContext> {
    const token = request.cookies[this.config.sessionCookie.name];
    let userId: string | null = null;
    if (token !== undefined) {
      try {
        userId = (await this.identity.authenticateSession(token)).userId;
      } catch {
        userId = null;
      }
    }
    if (userId !== null) return { userId, anonymousId: null };
    return { userId: null, anonymousId: request.cookies[this.config.cart.cookie.name] ?? null };
  }

  #respond(reply: FastifyReply, payment: PaymentProjection): PaymentResponseDto {
    reply.header('Cache-Control', 'private, no-store');
    reply.header('Vary', 'Cookie');
    return payment;
  }
}

@ApiTags('Payments')
@Controller('v1/admin/payments')
export class AdminPaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Post(':paymentId/refunds')
  @RequirePermissions('order:refund')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'requestPaymentRefund',
    summary: 'Refund a paid payment (requires a recent step-up)',
    description:
      'Rejects with a conflict unless the staff session has recently re-verified its TOTP via POST /v1/me/step-up. The server, not the caller, computes the refundable cap.',
  })
  @ApiParam({ name: 'paymentId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: RefundResponseDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async requestRefund(
    @Param() params: AdminPaymentIdParamDto,
    @Body() body: RefundRequestDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<RefundResponseDto> {
    const principal = requestPrincipal(request);
    const refund = await this.payments.requestRefund(
      params.paymentId,
      { amountMinor: body.amountMinor ?? null, reason: body.reason },
      { userId: principal.userId, sessionId: principal.sessionId },
    );
    reply.header('Cache-Control', 'private, no-store');
    return refund;
  }
}

@ApiTags('Payments')
@Controller('webhooks/payments')
export class PaymentWebhooksController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Post(':provider')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    operationId: 'receivePaymentWebhook',
    summary: 'Receive a signed provider webhook event',
    description:
      'Accepts the exact raw body for signature verification. CSRF is not used; invalid signatures are persisted and ignored.',
  })
  @ApiParam({ name: 'provider', type: String, example: 'mock' })
  @ApiNoContentResponse({ description: 'Accepted; processing is idempotent and re-runnable.' })
  async receive(@Param() params: ProviderParamDto, @Req() request: FastifyRequest): Promise<void> {
    const raw = request.body;
    if (!Buffer.isBuffer(raw)) {
      throw new BadRequestException('Webhook body must be received as raw bytes.');
    }
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === 'string') headers[key] = value;
    }
    const { id } = await this.payments.receiveWebhook(params.provider, { rawBody: raw, headers });
    await this.payments.processProviderEvent(id);
  }
}
