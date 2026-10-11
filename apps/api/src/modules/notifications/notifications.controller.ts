import { Body, Controller, Get, Header, Inject, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { NotificationsService, TEMPLATE_CODES, type TemplateCode } from '@honey/backend';
import { Public, RequirePermissions, RequireStaffSession } from '../../http/auth/authorization.js';
import { requestMetadata, requestPrincipal } from '../../http/auth/request-principal.js';
import { AdminPageQueryDto } from '../../http/admin/admin-query.dto.js';
class TemplatePageQueryDto extends AdminPageQueryDto {}
class TemplateDto {
  @ApiProperty({ enum: TEMPLATE_CODES }) @IsIn(TEMPLATE_CODES) code!: TemplateCode;
  @ApiProperty({ enum: ['fa', 'en'] }) @IsIn(['fa', 'en']) locale!: string;
  @ApiProperty({ enum: ['EMAIL', 'SMS'] }) @IsIn(['EMAIL', 'SMS']) channel!: 'EMAIL' | 'SMS';
  @ApiProperty({ type: String, nullable: true, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject!: string | null;
  @ApiProperty({ type: String, maxLength: 12000 })
  @IsString()
  @MinLength(1)
  @MaxLength(12000)
  body!: string;
}
class TemplateRecordDto extends TemplateDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) updatedAt!: string;
}
class TemplateListRecordDto extends TemplateRecordDto {
  @ApiProperty({ type: [String] }) allowedVariables!: string[];
  @ApiProperty({ type: Boolean }) complete!: boolean;
}
class TemplatePageDto {
  @ApiProperty({ type: [TemplateListRecordDto] }) items!: TemplateListRecordDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
class PreviewDto {
  @ApiProperty({ type: String, nullable: true }) subject!: string | null;
  @ApiProperty({ type: String }) text!: string;
  @ApiProperty({ enum: ['fa', 'en'] }) locale!: string;
  @ApiProperty({ enum: ['rtl', 'ltr'] }) direction!: string;
  @ApiProperty({ type: [String] }) allowedVariables!: string[];
  @ApiProperty({ type: Boolean, enum: [false] }) smsEnabled!: boolean;
}
class SubscribeDto {
  @ApiProperty({ type: String, format: 'email', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @ApiProperty({ enum: ['fa', 'en'] }) @IsIn(['fa', 'en']) locale!: string;
  @ApiProperty({ type: Boolean, enum: [true] }) @IsBoolean() @IsIn([true]) consent!: boolean;
}
class TokenDto {
  @ApiProperty({ type: String, minLength: 43, maxLength: 43 })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/u)
  token!: string;
}
class AcceptedDto {
  @ApiProperty({ type: Boolean, enum: [true] }) accepted!: boolean;
}
@ApiTags('Notifications Admin')
@RequireStaffSession()
@Controller('v1/admin/notifications/templates')
export class AdminNotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}
  @Get()
  @RequirePermissions('content:read')
  @ApiOperation({
    operationId: 'listNotificationTemplates',
    summary: 'Read bounded per-locale templates',
    description: 'Read bounded per-locale templates.',
  })
  @ApiOkResponse({ type: TemplatePageDto })
  list(@Query() q: TemplatePageQueryDto, @Req() r: FastifyRequest) {
    return this.notifications.listTemplates(requestPrincipal(r), q);
  }
  @Put()
  @RequirePermissions('content:write')
  @ApiOperation({
    operationId: 'saveNotificationTemplate',
    summary: 'Save an audited template with explicit allowed placeholders',
    description: 'Save an audited template with explicit allowed placeholders.',
  })
  @ApiOkResponse({ type: TemplateRecordDto })
  save(@Body() b: TemplateDto, @Req() r: FastifyRequest) {
    return this.notifications.saveTemplate(
      requestPrincipal(r),
      { ...b, subject: b.subject ?? null },
      requestMetadata(r),
    );
  }
  @Post('preview')
  @RequirePermissions('content:read')
  @ApiOperation({
    operationId: 'previewNotificationTemplate',
    summary: 'Render safe synthetic preview without sending a message',
    description: 'Render safe synthetic preview without sending a message.',
  })
  @ApiOkResponse({ type: PreviewDto })
  preview(@Body() b: TemplateDto, @Req() r: FastifyRequest) {
    return this.notifications.preview(requestPrincipal(r), { ...b, subject: b.subject ?? null });
  }
}
@ApiTags('Newsletter')
@Controller('v1/newsletter')
export class NewsletterController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}
  @Post('subscribe')
  @Public()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    operationId: 'requestNewsletterSubscription',
    summary: 'Request explicit-consent double opt-in with a generic response',
    description: 'Request explicit-consent double opt-in with a generic response.',
  })
  @ApiOkResponse({ type: AcceptedDto })
  subscribe(@Body() b: SubscribeDto) {
    return this.notifications.subscribe(b);
  }
  @Post('confirm')
  @Public()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    operationId: 'confirmNewsletterSubscription',
    summary: 'Explicitly consume an expiring newsletter-only confirmation token',
    description: 'Explicitly consume an expiring newsletter-only confirmation token.',
  })
  @ApiOkResponse({ type: AcceptedDto })
  confirm(@Body() b: TokenDto) {
    return this.notifications.confirm(b.token);
  }
  @Post('unsubscribe')
  @Public()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    operationId: 'unsubscribeNewsletter',
    summary: 'Explicit idempotent newsletter opt-out with a secure token',
    description: 'Explicit idempotent newsletter opt-out with a secure token.',
  })
  @ApiOkResponse({ type: AcceptedDto })
  unsubscribe(@Body() b: TokenDto) {
    return this.notifications.unsubscribe(b.token);
  }
}
