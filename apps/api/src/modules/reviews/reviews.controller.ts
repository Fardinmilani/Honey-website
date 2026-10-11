import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { ReviewsService } from '@honey/backend';
import { Public, RequirePermissions, RequireStaffSession } from '../../http/auth/authorization.js';
import { requestMetadata, requestPrincipal } from '../../http/auth/request-principal.js';
import { AdminIdParamDto, AdminPageQueryDto } from '../../http/admin/admin-query.dto.js';
// Concrete runtime DTOs preserve inherited validation metadata in Nest.
class ReviewPageQueryDto extends AdminPageQueryDto {}
class ReviewIdParamDto extends AdminIdParamDto {}
class ProductParamDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() productId!: string;
}
class SubmitReviewDto extends ProductParamDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' }) @IsOptional() @IsUUID() orderId?: string;
  @ApiProperty({ type: Number, minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) rating!: number;
  @ApiProperty({ type: String, maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;
  @ApiProperty({ type: String, maxLength: 5000 })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
  @ApiProperty({ enum: ['fa', 'en'] }) @IsIn(['fa', 'en']) locale!: string;
}
class ReviewDto extends ProductParamDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: Number, minimum: 1, maximum: 5 }) rating!: number;
  @ApiProperty({ type: String }) title!: string;
  @ApiProperty({ type: String }) body!: string;
  @ApiProperty({ type: String }) locale!: string;
  @ApiProperty({ type: String }) createdAt!: string;
  @ApiProperty({ type: Boolean, enum: [true] }) verifiedPurchase!: boolean;
}
class AdminReviewDto extends ReviewDto {
  @ApiProperty({ enum: ['PENDING', 'APPROVED', 'REJECTED'] }) status!: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } }) productNames!: Record<
    string,
    string
  >;
}
class AggregateDto {
  @ApiProperty({ type: Number }) count!: number;
  @ApiProperty({ type: Number }) average!: number;
}
class ReviewPageDto {
  @ApiProperty({ type: [ReviewDto] }) items!: ReviewDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
  @ApiProperty({ type: AggregateDto, nullable: true }) aggregate!: AggregateDto | null;
}
class ModerationPageDto {
  @ApiProperty({ type: [AdminReviewDto] }) items!: AdminReviewDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
class EligibilityDto {
  @ApiProperty({ type: Boolean }) eligible!: boolean;
}
class SubmittedDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ enum: ['PENDING'] }) status!: string;
}
class ModeratedDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] }) status!: string;
}
@ApiTags('Reviews')
@Controller('v1/products')
export class PublicReviewsController {
  constructor(@Inject(ReviewsService) private readonly reviews: ReviewsService) {}
  @Get(':productId/reviews')
  @ApiParam({ name: 'productId', type: String, format: 'uuid' })
  @Public()
  @Header('Cache-Control', 'public, max-age=0, s-maxage=60')
  @Header('Vary', 'Accept-Language, X-Currency')
  @ApiOperation({
    operationId: 'listApprovedProductReviews',
    summary: 'Read approved reviews and their exact approved-only aggregate',
    description: 'Read approved reviews and their exact approved-only aggregate.',
  })
  @ApiOkResponse({ type: ReviewPageDto })
  list(@Param() p: ProductParamDto, @Query() q: ReviewPageQueryDto) {
    return this.reviews.publicPage(p.productId, q);
  }
}
@ApiTags('Customer Reviews')
@Controller('v1/me/reviews')
export class CustomerReviewsController {
  constructor(@Inject(ReviewsService) private readonly reviews: ReviewsService) {}
  @Get('eligibility')
  @RequirePermissions('review:submit')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    operationId: 'getReviewEligibility',
    summary: 'Check the authenticated customer’s own fully delivered purchase',
    description: 'Check the authenticated customer’s own fully delivered purchase.',
  })
  @ApiOkResponse({ type: EligibilityDto })
  eligibility(@Query() q: ProductParamDto, @Req() r: FastifyRequest) {
    return this.reviews.eligibility(requestPrincipal(r), q.productId);
  }
  @Post()
  @RequirePermissions('review:submit')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    operationId: 'submitProductReview',
    summary: 'Submit one immutable pending review with server-verified purchase linkage',
    description: 'Submit one immutable pending review with server-verified purchase linkage.',
  })
  @ApiOkResponse({ type: SubmittedDto })
  async submit(@Body() b: SubmitReviewDto, @Req() r: FastifyRequest) {
    const row = await this.reviews.submit(requestPrincipal(r), b);
    return { id: row.id, status: row.status };
  }
}
@ApiTags('Reviews Admin')
@RequireStaffSession()
@Controller('v1/admin/reviews')
export class AdminReviewsController {
  constructor(@Inject(ReviewsService) private readonly reviews: ReviewsService) {}
  @Get()
  @RequirePermissions('review:moderate')
  @ApiOperation({
    operationId: 'listPendingReviews',
    summary: 'Read the bounded moderation queue with safe product context',
    description: 'Read the bounded moderation queue with safe product context.',
  })
  @ApiOkResponse({ type: ModerationPageDto })
  pending(@Query() q: ReviewPageQueryDto, @Req() r: FastifyRequest) {
    return this.reviews.pending(requestPrincipal(r), q);
  }
  @Post(':id/approve')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @RequirePermissions('review:moderate')
  @ApiOperation({
    operationId: 'approveReview',
    summary: 'Approve a pending review after publication-policy checks',
    description: 'Approve a pending review after publication-policy checks.',
  })
  @ApiOkResponse({ type: ModeratedDto })
  async approve(@Param() p: ReviewIdParamDto, @Req() r: FastifyRequest) {
    const row = await this.reviews.moderate(
      requestPrincipal(r),
      p.id,
      'APPROVED',
      requestMetadata(r),
    );
    return { id: row.id, status: row.status };
  }
  @Post(':id/reject')
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @RequirePermissions('review:moderate')
  @ApiOperation({
    operationId: 'rejectReview',
    summary: 'Reject a pending review without rewriting customer text',
    description: 'Reject a pending review without rewriting customer text.',
  })
  @ApiOkResponse({ type: ModeratedDto })
  async reject(@Param() p: ReviewIdParamDto, @Req() r: FastifyRequest) {
    const row = await this.reviews.moderate(
      requestPrincipal(r),
      p.id,
      'REJECTED',
      requestMetadata(r),
    );
    return { id: row.id, status: row.status };
  }
}
