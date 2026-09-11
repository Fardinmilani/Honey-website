import { randomUUID } from 'node:crypto';

import {
  Body,
  Controller,
  Delete,
  Headers,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { IsInt, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  CartService,
  IdentityService,
  ValidationAppError,
  randomOpaqueToken,
  type CartView,
} from '@honey/backend';
import type { ApiConfig } from '../../config/api-config.js';
import { Public } from '../../http/auth/authorization.js';
import { ProblemDetailsDto } from '../../http/errors/problem-details.js';

class LineBodyDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  variantId!: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: 10_000 })
  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity!: number;
}

class UpdateLineBodyDto {
  @ApiProperty({ type: Number, minimum: 1, maximum: 10_000 })
  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity!: number;
}

class LineParamsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  lineId!: string;
}

class CouponBodyDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 64 })
  @IsString()
  @MaxLength(64)
  code!: string;
}

class MoneyDto {
  @ApiProperty({ type: String, example: '125000' }) amountMinor!: string;
  @ApiProperty({ type: String, example: 'IRR' }) currency!: string;
}

class CartProductDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) slug!: string;
  @ApiProperty({ type: String, format: 'uri', nullable: true }) imageUrl!: string | null;
}

class CartVariantDto {
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: Number, minimum: 0 }) netWeightGrams!: number;
}

class CartLineDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) variantId!: string;
  @ApiProperty({ type: CartProductDto }) product!: CartProductDto;
  @ApiProperty({ type: CartVariantDto }) variant!: CartVariantDto;
  @ApiProperty({ type: Number, minimum: 1 }) quantity!: number;
  @ApiProperty({ enum: ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] }) availabilityBand!: string;
  @ApiProperty({ enum: ['PURCHASABLE', 'OUT_OF_STOCK', 'UNPUBLISHED', 'PRICE_UNAVAILABLE'] })
  state!: string;
  @ApiProperty({ type: MoneyDto, nullable: true }) unitPrice!: MoneyDto | null;
  @ApiProperty({ type: MoneyDto }) lineSubtotal!: MoneyDto;
  @ApiProperty({ type: MoneyDto }) discount!: MoneyDto;
  @ApiProperty({ type: MoneyDto }) lineTotal!: MoneyDto;
}

class CartCouponDto {
  @ApiProperty({ type: String }) code!: string;
  @ApiProperty({ enum: ['APPLIED', 'INELIGIBLE', 'DEFERRED'] }) state!: string;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
}

class CartTaxDto {
  @ApiProperty({ enum: ['UNRESOLVED', 'RESOLVED'] }) state!: string;
  @ApiProperty({ type: MoneyDto, nullable: true }) amount!: MoneyDto | null;
}

class CartAdjustmentDto {
  @ApiProperty({ enum: ['QUANTITY_CLAMPED'] }) code!: string;
  @ApiProperty({ type: String, format: 'uuid' }) lineId!: string;
}

class CartResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) locale!: string;
  @ApiProperty({ type: String }) currency!: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ type: [CartLineDto] }) lines!: readonly CartLineDto[];
  @ApiProperty({ type: CartCouponDto, nullable: true }) coupon!: CartCouponDto | null;
  @ApiProperty({ type: MoneyDto }) subtotal!: MoneyDto;
  @ApiProperty({ type: MoneyDto }) discountTotal!: MoneyDto;
  @ApiProperty({ type: CartTaxDto }) tax!: CartTaxDto;
  @ApiProperty({ type: MoneyDto }) merchandiseTotal!: MoneyDto;
  @ApiProperty({ type: [CartAdjustmentDto] }) adjustments!: readonly CartAdjustmentDto[];
}

function operation(operationId: string, summary: string) {
  return { operationId, summary, description: `${summary}.` };
}

function isUuid(value: string | undefined): value is string {
  return (
    value !== undefined &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)
  );
}

@ApiTags('Cart')
@Controller('v1/cart')
export class CartController {
  constructor(
    @Inject(CartService) private readonly cart: CartService,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject('API_CONFIG') private readonly config: ApiConfig,
  ) {}

  @Get()
  @Public()
  @ApiOperation(operation('getCart', 'Read the current server-priced cart'))
  @ApiOkResponse({ type: CartResponseDto })
  async getCart(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<CartView> {
    const context = await this.#context(request, reply);
    return this.#respond(reply, await this.cart.getCart(context));
  }

  @Post('lines')
  @Public()
  @HttpCode(200)
  @ApiOperation(operation('addCartLine', 'Add a variant to the current cart'))
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: CartResponseDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  async addLine(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: LineBodyDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<CartView> {
    if (idempotencyKey === undefined) {
      throw new ValidationAppError([{ path: 'idempotencyKey', code: 'IDEMPOTENCY_KEY_REQUIRED' }]);
    }
    const context = await this.#context(request, reply);
    const result = await this.cart.addLineWithIdempotency(context, body, idempotencyKey);
    if (result.replayed) reply.header('Idempotency-Replayed', 'true');
    return this.#respond(reply, result.cart);
  }

  @Patch('lines/:lineId')
  @Public()
  @ApiOperation(operation('updateCartLine', 'Set one current-cart line quantity'))
  @ApiParam({ name: 'lineId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: CartResponseDto })
  async updateLine(
    @Param() params: LineParamsDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: UpdateLineBodyDto,
  ): Promise<CartView> {
    const context = await this.#context(request, reply);
    return this.#respond(reply, await this.cart.updateLine(context, params.lineId, body));
  }

  @Delete('lines/:lineId')
  @Public()
  @ApiOperation(operation('removeCartLine', 'Remove one current-cart line'))
  @ApiParam({ name: 'lineId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: CartResponseDto })
  async removeLine(
    @Param() params: LineParamsDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<CartView> {
    const context = await this.#context(request, reply);
    return this.#respond(reply, await this.cart.removeLine(context, params.lineId));
  }

  @Post('coupon')
  @Public()
  @HttpCode(200)
  @ApiOperation(operation('applyCartCoupon', 'Apply one coupon to the current cart'))
  @ApiOkResponse({ type: CartResponseDto })
  async applyCoupon(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: CouponBodyDto,
  ): Promise<CartView> {
    const context = await this.#context(request, reply);
    return this.#respond(reply, await this.cart.applyCoupon(context, body.code));
  }

  @Delete('coupon')
  @Public()
  @ApiOperation(operation('removeCartCoupon', 'Remove the coupon from the current cart'))
  @ApiOkResponse({ type: CartResponseDto })
  async removeCoupon(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<CartView> {
    const context = await this.#context(request, reply);
    return this.#respond(reply, await this.cart.removeCoupon(context));
  }

  async #context(request: FastifyRequest, reply: FastifyReply) {
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
        // A cart is still available to an anonymous browser with an expired session cookie.
      }
    }
    const header = request.headers['x-currency'];
    const requestedCurrency =
      typeof header === 'string' ? header : this.config.cart.defaultCurrency;
    return {
      userId,
      anonymousId,
      locale: this.#locale(request),
      currency: requestedCurrency,
    };
  }

  #respond(reply: FastifyReply, cart: CartView): CartView {
    reply.header('Cache-Control', 'private, no-store');
    reply.header('Vary', 'Accept-Language, X-Currency, Cookie');
    reply.header('X-Currency', cart.currency);
    return cart;
  }

  #locale(request: FastifyRequest): string {
    const header = request.headers['accept-language'];
    if (typeof header === 'string') {
      const candidates = header
        .split(',')
        .map((entry) => entry.trim().split(';')[0]?.toLowerCase())
        .filter((entry): entry is string => entry !== undefined && entry.length > 0);
      for (const candidate of candidates) {
        if (this.config.catalog.enabledLocales.includes(candidate)) return candidate;
        const language = candidate.split('-')[0];
        if (language !== undefined && this.config.catalog.enabledLocales.includes(language))
          return language;
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
