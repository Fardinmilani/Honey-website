import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { AdminIdentityService } from '@honey/backend';
import { RequirePermissions, RequireStaffSession } from '../../http/auth/authorization.js';
import { requestMetadata, requestPrincipal } from '../../http/auth/request-principal.js';
import { AdminPageQueryDto } from '../../http/admin/admin-query.dto.js';
class CustomerQueryDto extends AdminPageQueryDto {
  @ApiProperty({ type: String, minLength: 3, maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  q!: string;
}
class CustomerDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) email!: string;
  @ApiProperty({ type: String, nullable: true }) displayName!: string | null;
  @ApiProperty({ type: String }) preferredLocale!: string;
  @ApiProperty({ type: String }) status!: string;
  @ApiProperty({ type: Boolean }) emailVerified!: boolean;
  @ApiProperty({ type: String, nullable: true }) phoneMasked!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}
class CustomerPageDto {
  @ApiProperty({ type: [CustomerDto] }) items!: CustomerDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
class AuditQueryDto extends AdminPageQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actorUserId?: string;
  @ApiPropertyOptional({ type: String, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[A-Za-z][A-Za-z0-9._:-]*$/u)
  action?: string;
  @ApiPropertyOptional({ type: String, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[A-Za-z][A-Za-z0-9._:-]*$/u)
  subjectType?: string;
  @ApiPropertyOptional({ type: String, format: 'uuid' }) @IsOptional() @IsUUID() subjectId?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  from?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
class AuditEntryDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String, nullable: true }) actorUserId!: string | null;
  @ApiProperty({ type: String }) action!: string;
  @ApiProperty({ type: String }) subjectType!: string;
  @ApiProperty({ type: String }) subjectId!: string;
  @ApiProperty({ type: String, nullable: true }) requestId!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}
class AuditPageDto {
  @ApiProperty({ type: [AuditEntryDto] }) items!: AuditEntryDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
@ApiTags('Admin customers')
@RequireStaffSession()
@Controller('v1/admin/customers')
export class AdminCustomersController {
  constructor(@Inject(AdminIdentityService) private readonly identity: AdminIdentityService) {}
  @Get()
  @RequirePermissions('customer:read')
  @ApiOperation({
    operationId: 'lookupAdminCustomers',
    summary: 'Audited exact email or UUID customer lookup',
    description:
      'STAFF customer:read lookup excludes staff, credentials and sessions, masks phone numbers, and records only the result count in the audit.',
  })
  @ApiOkResponse({ type: CustomerPageDto })
  list(@Query() query: CustomerQueryDto, @Req() request: FastifyRequest) {
    return this.identity.customers(requestPrincipal(request), query, requestMetadata(request));
  }
}
@ApiTags('Admin audit')
@RequireStaffSession()
@Controller('v1/admin/audit')
export class AdminAuditController {
  constructor(@Inject(AdminIdentityService) private readonly identity: AdminIdentityService) {}
  @Get()
  @RequirePermissions('audit:read')
  @ApiOperation({
    operationId: 'listAdminAudit',
    summary: 'Read safe filtered audit metadata without secret-bearing JSON',
    description:
      'STAFF audit:read query with keyset paging and validated actor, subject, action and date-range filters. Raw audit JSON and network metadata are omitted.',
  })
  @ApiOkResponse({ type: AuditPageDto })
  list(@Query() query: AuditQueryDto, @Req() request: FastifyRequest) {
    return this.identity.audit(requestPrincipal(request), query);
  }
}
