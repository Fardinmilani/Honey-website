import { randomUUID } from 'node:crypto';

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
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Type } from 'class-transformer';

import {
  CheckoutService,
  ConflictAppError,
  IdentityService,
  NotFoundAppError,
  OrdersService,
  ValidationAppError,
  randomOpaqueToken,
  type CheckoutProjection,
  type CustomerOrder,
} from '@honey/backend';
import type { ApiConfig } from '../../config/api-config.js';
import { Public } from '../../http/auth/authorization.js';
import { ProblemDetailsDto } from '../../http/errors/problem-details.js';

class AddressDto {
  @ApiProperty({ type: String, maxLength: 160 })
  @IsString()
  @MaxLength(160)
  fullName!: string;

  @ApiProperty({ type: String, maxLength: 64 })
  @IsString()
  @MaxLength(64)
  phone!: string;

  @ApiProperty({ type: String, example: 'IR', pattern: '^[A-Za-z]{2}$' })
  @IsString()
  @Matches(/^[A-Za-z]{2}$/u)
  country!: string;

  @ApiProperty({ type: String, maxLength: 120 })
  @IsString()
  @MaxLength(120)
  province!: string;

  @ApiProperty({ type: String, maxLength: 120 })
  @IsString()
  @MaxLength(120)
  city!: string;

  @ApiProperty({ type: String, maxLength: 32 })
  @IsString()
  @MaxLength(32)
  postalCode!: string;

  @ApiProperty({ type: String, maxLength: 240 })
  @IsString()
  @MaxLength(240)
  line1!: string;

  @ApiPropertyOptional({ type: String, maxLength: 240, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  line2?: string | null;
}

class StartCheckoutDto {
  @ApiProperty({ type: String, format: 'email' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiPropertyOptional({ type: String, maxLength: 64, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string | null;

  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  shippingAddress!: AddressDto;

  @ApiPropertyOptional({ type: AddressDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  billingAddress?: AddressDto | null;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  sameAsShipping!: boolean;
}

class CheckoutParamDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  id!: string;
}

class OrderParamDto {
  @ApiProperty({ type: String, example: 'HNY-2026-000123' })
  @IsString()
  @Matches(/^HNY-[0-9]{4}-[0-9]{6}$/u)
  number!: string;
}

class MoneyDto {
  @ApiProperty({ type: String, example: '125000' })
  amountMinor!: string;

  @ApiProperty({ type: String, example: 'IRR' })
  currency!: string;
}

class CheckoutResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['OPEN', 'AWAITING_PAYMENT', 'COMPLETED', 'EXPIRED', 'CANCELLED'] })
  status!: string;

  @ApiProperty({ type: String, format: 'email' })
  email!: string;
}

class ConfirmCheckoutResponseDto {
  @ApiProperty({ type: CheckoutResponseDto })
  checkout!: CheckoutResponseDto;

  @ApiProperty({ type: String, example: 'HNY-2026-000123' })
  orderNumber!: string;
}

class CustomerOrderResponseDto {
  @ApiProperty({ type: String, example: 'HNY-2026-000123' })
  number!: string;

  @ApiProperty({ type: String })
  status!: string;

  @ApiProperty({ type: MoneyDto })
  grandTotal!: MoneyDto;
}

type ControllerContext = Readonly<{
  userId: string | null;
  anonymousId: string;
  locale: string;
  currency: string;
  requestId: string;
  clientIp: string | null;
}>;

function address(body: AddressDto) {
  return {
    fullName: body.fullName,
    phone: body.phone,
    country: body.country,
    province: body.province,
    city: body.city,
    postalCode: body.postalCode,
    line1: body.line1,
    line2: body.line2 ?? null,
  };
}

function money(amountMinor: bigint, currency: string) {
  return { amountMinor: amountMinor.toString(), currency };
}

function localName(value: unknown, locale: string): string {
  if (!isRecord(value) || typeof value[locale] !== 'string') return '';
  return value[locale];
}

function safeOrder(order: CustomerOrder, locale: string) {
  return {
    number: order.number,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfilmentStatus: order.fulfilmentStatus,
    currency: order.currency,
    subtotal: money(order.subtotalMinor, order.currency),
    discountTotal: money(order.discountTotalMinor, order.currency),
    shippingTotal: money(order.shippingTotalMinor, order.currency),
    taxTotal: money(order.taxTotalMinor, order.currency),
    grandTotal: money(order.grandTotalMinor, order.currency),
    placedAt: order.placedAt.toISOString(),
    shippingAddress: order.shippingAddressSnapshot,
    lines: order.lines.map((line) => ({
      productName: localName(line.productNameSnapshot, locale),
      variantName: localName(line.variantNameSnapshot, locale),
      sku: line.skuSnapshot,
      imageUrl: line.imageUrlSnapshot,
      quantity: line.quantity,
      unitPrice: money(line.unitPriceMinor, order.currency),
      discount: money(line.discountAllocatedMinor, order.currency),
      tax: money(line.taxAmountMinor, order.currency),
      lineTotal: money(line.lineTotalMinor, order.currency),
    })),
  };
}

@ApiTags('Checkout')
@Controller('v1/checkout')
export class CheckoutController {
  constructor(
    @Inject(CheckoutService) private readonly checkout: CheckoutService,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject('API_CONFIG') private readonly config: ApiConfig,
  ) {}

  @Post()
  @Public()
  @HttpCode(200)
  @ApiOperation({ operationId: 'startCheckout', summary: 'Start an owner-scoped checkout' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: CheckoutResponseDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async start(
    @Body() body: StartCheckoutDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers('idempotency-key') header: string | undefined,
  ): Promise<CheckoutProjection> {
    if (header === undefined) {
      throw new ValidationAppError([{ path: 'idempotencyKey', code: 'IDEMPOTENCY_KEY_REQUIRED' }]);
    }
    const result = await this.checkout.start(
      await this.#context(request, reply),
      {
        email: body.email,
        phone: body.phone ?? null,
        shippingAddress: address(body.shippingAddress),
        billingAddress: body.billingAddress === null || body.billingAddress === undefined ? null : address(body.billingAddress),
        sameAsShipping: body.sameAsShipping,
      },
      header,
    );
    if (result.replayed) reply.header('Idempotency-Replayed', 'true');
    return this.#respond(reply, result.checkout);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ operationId: 'getCheckout', summary: 'Read the current owner checkout' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({ type: CheckoutResponseDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async get(
    @Param() params: CheckoutParamDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<CheckoutProjection> {
    return this.#respond(reply, await this.checkout.get(await this.#context(request, reply), params.id));
  }

  @Post(':id/confirm')
  @Public()
  @HttpCode(200)
  @ApiOperation({ operationId: 'confirmCheckout', summary: 'Create one pending-payment order' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: ConfirmCheckoutResponseDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  async confirm(
    @Param() params: CheckoutParamDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers('idempotency-key') header: string | undefined,
  ): Promise<Readonly<{ checkout: CheckoutProjection; orderNumber: string }>> {
    if (header === undefined) {
      throw new ValidationAppError([{ path: 'idempotencyKey', code: 'IDEMPOTENCY_KEY_REQUIRED' }]);
    }
    const result = await this.checkout.confirm(await this.#context(request, reply), params.id, header);
    if (result.state === 'PRICE_CHANGED') throw new ConflictAppError({ code: 'PRICE_CHANGED' });
    if (result.replayed) reply.header('Idempotency-Replayed', 'true');
    return this.#respond(reply, { checkout: result.checkout, orderNumber: result.orderNumber });
  }

  async #context(request: FastifyRequest, reply: FastifyReply): Promise<ControllerContext> {
    const cookieValue = request.cookies[this.config.cart.cookie.name];
    const anonymousId = isUuid(cookieValue) ? cookieValue : randomUUID();
    if (cookieValue !== anonymousId) this.#setAnonymousCookie(reply, anonymousId);
    this.#ensureCsrfCookie(request, reply);
    const token = request.cookies[this.config.sessionCookie.name];
    let userId: string | null = null;
    if (token !== undefined) {
      try {
        userId = (await this.identity.authenticateSession(token)).userId;
      } catch {
        // Guest checkout continues to use the opaque cart-owner cookie.
      }
    }
    const requestedCurrency = request.headers['x-currency'];
    return {
      userId,
      anonymousId,
      locale: this.#locale(request),
      currency:
        typeof requestedCurrency === 'string'
          ? requestedCurrency
          : this.config.cart.defaultCurrency,
      requestId: request.id,
      clientIp: request.ip,
    };
  }

  #respond<Result>(reply: FastifyReply, result: Result): Result {
    reply.header('Cache-Control', 'private, no-store');
    reply.header('Vary', 'Accept-Language, X-Currency, Cookie');
    return result;
  }

  #locale(request: FastifyRequest): string {
    const header = request.headers['accept-language'];
    if (typeof header === 'string') {
      for (const raw of header.split(',')) {
        const candidate = raw.trim().split(';')[0]?.toLowerCase();
        if (candidate === undefined || candidate.length === 0) continue;
        if (this.config.catalog.enabledLocales.includes(candidate)) return candidate;
        const language = candidate.split('-')[0];
        if (language !== undefined && this.config.catalog.enabledLocales.includes(language)) return language;
      }
    }
    return this.config.catalog.defaultLocale;
  }

  #setAnonymousCookie(reply: FastifyReply, anonymousId: string): void {
    reply.setCookie(this.config.cart.cookie.name, anonymousId, {
      httpOnly: true,
      secure: this.config.cart.cookie.secure,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(this.config.cart.activeTtlMs / 1_000),
    });
  }

  #ensureCsrfCookie(request: FastifyRequest, reply: FastifyReply): void {
    if (request.cookies[this.config.csrf.cookieName] !== undefined) return;
    reply.setCookie(this.config.csrf.cookieName, randomOpaqueToken(), {
      httpOnly: false,
      secure: this.config.csrf.secureCookie,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(this.config.cart.activeTtlMs / 1_000),
    });
  }
}

@ApiTags('Orders')
@Controller('v1/orders')
export class OrdersController {
  constructor(
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject('API_CONFIG') private readonly config: ApiConfig,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ operationId: 'listMyOrders', summary: 'List current customer account orders' })
  @ApiOkResponse({ type: [CustomerOrderResponseDto] })
  async list(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<readonly ReturnType<typeof safeOrder>[]> {
    const context = await this.#context(request);
    if (context.userId === null) throw new NotFoundAppError();
    const orders = await this.orders.listForUser(context.userId);
    return this.#respond(reply, orders.map((order) => safeOrder(order, context.locale)));
  }

  @Get(':number')
  @Public()
  @ApiOperation({ operationId: 'getMyOrder', summary: 'Read one owner-scoped order' })
  @ApiParam({ name: 'number', type: String, example: 'HNY-2026-000123' })
  @ApiOkResponse({ type: CustomerOrderResponseDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  async get(
    @Param() params: OrderParamDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ReturnType<typeof safeOrder>> {
    const context = await this.#context(request);
    const owner = context.userId === null ? { anonymousId: context.anonymousId } : { userId: context.userId };
    return this.#respond(reply, safeOrder(await this.orders.getOwnedOrder(params.number, owner), context.locale));
  }

  async #context(request: FastifyRequest): Promise<Readonly<{ userId: string | null; anonymousId: string; locale: string }>> {
    const cookieValue = request.cookies[this.config.cart.cookie.name];
    const anonymousId = isUuid(cookieValue) ? cookieValue : randomUUID();
    const token = request.cookies[this.config.sessionCookie.name];
    let userId: string | null = null;
    if (token !== undefined) {
      try {
        userId = (await this.identity.authenticateSession(token)).userId;
      } catch {
        // A stale authentication cookie cannot widen anonymous ownership.
      }
    }
    const header = request.headers['accept-language'];
    const locale =
      typeof header === 'string' && header.toLowerCase().startsWith('en') ? 'en' : this.config.catalog.defaultLocale;
    return { userId, anonymousId, locale };
  }

  #respond<Result>(reply: FastifyReply, result: Result): Result {
    reply.header('Cache-Control', 'private, no-store');
    reply.header('Vary', 'Accept-Language, Cookie');
    return result;
  }
}

function isUuid(value: string | undefined): value is string {
  return value !== undefined && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
